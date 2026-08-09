"use strict";

class CatalogBookingPolicyError extends Error {
  constructor(code, statusCode = 409) {
    super(code);
    this.name = "CatalogBookingPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function clean(value) { return String(value == null ? "" : value).trim(); }

function moneyMinor(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean(value));
  if (!match) return null;
  return (BigInt(match[1]) * 100n) + BigInt(String(match[2] || "").padEnd(2, "0"));
}

function moneyText(minor) {
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

function dateAllows(now, from, to) {
  const timestamp = now.getTime();
  const start = from == null ? null : new Date(from).getTime();
  const end = to == null ? null : new Date(to).getTime();
  return Number.isFinite(timestamp)
    && (start == null || (Number.isFinite(start) && timestamp >= start))
    && (end == null || (Number.isFinite(end) && timestamp <= end));
}

function ruleMatches(row, actual, quantity) {
  if (clean(row.rule_job_type) && clean(row.rule_job_type) !== actual.job_type) return false;
  if (clean(row.rule_ac_type) && clean(row.rule_ac_type) !== actual.ac_type) return false;
  if (clean(row.rule_wash_variant) && clean(row.rule_wash_variant) !== actual.wash_variant) return false;
  if (row.rule_btu_min != null && actual.btu < Number(row.rule_btu_min)) return false;
  if (row.rule_btu_max != null && actual.btu > Number(row.rule_btu_max)) return false;
  if (row.rule_machine_min != null && quantity < Number(row.rule_machine_min)) return false;
  if (row.rule_machine_max != null && quantity > Number(row.rule_machine_max)) return false;
  return true;
}

function authoritativePricing(row, actual, quantity, now) {
  const baseMinor = moneyMinor(row.base_price);
  const activeRule = row.price_rule_id != null && row.rule_is_active === true
    && dateAllows(now, row.rule_effective_from, row.rule_effective_to)
    && ruleMatches(row, actual, quantity);
  const activeMinor = activeRule ? moneyMinor(row.rule_active_price) : null;
  const normalMinor = activeRule ? moneyMinor(row.rule_normal_price) : null;
  const unitMinor = activeMinor != null && activeMinor > 0n ? activeMinor : baseMinor;
  if (unitMinor == null || unitMinor <= 0n) throw new CatalogBookingPolicyError("CATALOG_PRICE_UNAVAILABLE", 409);
  return {
    unit_price: moneyText(unitMinor),
    exact_total: moneyText(unitMinor * BigInt(quantity)),
    normal_unit_price: moneyText(normalMinor != null && normalMinor > 0n ? normalMinor : unitMinor),
    price_rule_id: activeMinor != null && activeMinor > 0n ? Number(row.price_rule_id) : null,
    price_label: activeMinor != null && activeMinor > 0n ? clean(row.rule_label) || null : null,
    campaign_name: activeMinor != null && activeMinor > 0n ? clean(row.rule_campaign_name) || null : null,
    source: activeMinor != null && activeMinor > 0n ? "catalog_price_rule" : "catalog_base_price",
  };
}

async function resolveCatalogBookingPolicy(db, input = {}, options = {}) {
  const itemId = Number(input.catalogItemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    throw new CatalogBookingPolicyError("CATALOG_ITEM_INVALID", 400);
  }
  const lock = options.lock === true ? " FOR SHARE OF ci" : "";
  const result = await db.query(
    `SELECT ci.item_id, ci.item_name, ci.booking_mode, ci.booking_flow_policy,
            ci.job_category AS booking_job_type, ci.booking_ac_type, ci.booking_btu, ci.booking_wash_variant,
            ci.base_price, ci.price_rule_id, ci.is_active, ci.is_customer_visible,
            pr.job_type AS rule_job_type, pr.ac_type AS rule_ac_type, pr.wash_variant AS rule_wash_variant,
            pr.btu_min AS rule_btu_min, pr.btu_max AS rule_btu_max,
            pr.machine_min AS rule_machine_min, pr.machine_max AS rule_machine_max,
            pr.normal_price AS rule_normal_price, pr.active_price AS rule_active_price,
            pr.label AS rule_label, pr.campaign_name AS rule_campaign_name,
            pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to,
            pr.is_active AS rule_is_active
       FROM public.catalog_items ci
       LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id=ci.price_rule_id
      WHERE ci.item_id=$1${lock}`,
    [itemId]
  );
  const row = result.rows[0];
  if (!row || row.is_active !== true || (options.identity === "customer" && row.is_customer_visible !== true)) {
    throw new CatalogBookingPolicyError("CATALOG_ITEM_UNAVAILABLE", 409);
  }
  if (clean(row.booking_mode) !== "bookable") {
    throw new CatalogBookingPolicyError("CATALOG_ITEM_NOT_BOOKABLE", 409);
  }
  const mode = clean(input.bookingMode || "scheduled").toLowerCase();
  const policy = clean(row.booking_flow_policy || "scheduled_only").toLowerCase();
  if (mode === "urgent" && policy !== "scheduled_and_urgent") {
    throw new CatalogBookingPolicyError("CATALOG_FLOW_NOT_ALLOWED", 409);
  }
  const expected = {
    job_type: clean(row.booking_job_type),
    ac_type: clean(row.booking_ac_type),
    btu: Number(row.booking_btu),
    wash_variant: clean(row.booking_wash_variant),
  };
  const actual = {
    job_type: clean(input.jobType),
    ac_type: clean(input.acType),
    btu: Number(input.btu),
    wash_variant: clean(input.washVariant),
  };
  if (!expected.job_type || !expected.ac_type || !Number.isFinite(expected.btu)
      || expected.job_type !== actual.job_type || expected.ac_type !== actual.ac_type
      || expected.btu !== actual.btu || expected.wash_variant !== actual.wash_variant) {
    throw new CatalogBookingPolicyError("CATALOG_SELECTION_MISMATCH", 409);
  }
  const quantity = Number(input.machineCount == null ? 1 : input.machineCount);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new CatalogBookingPolicyError("CATALOG_SELECTION_MISMATCH", 409);
  return {
    item_id: Number(row.item_id), item_name: clean(row.item_name), booking_flow_policy: policy,
    machine_count: quantity, pricing: authoritativePricing(row, actual, quantity, options.now ? options.now() : new Date()),
    ...expected,
  };
}

function buildCatalogBookingItem(booking) {
  return {
    item_id: null,
    item_name: booking.item_name,
    qty: booking.machine_count,
    unit_price: booking.pricing.unit_price,
    line_total: booking.pricing.exact_total,
    is_service: true,
    customer_price_rule_id: booking.pricing.price_rule_id,
    normal_unit_price: booking.pricing.normal_unit_price,
    customer_price_label: booking.pricing.price_label,
    customer_campaign_name: booking.pricing.campaign_name,
    customer_price_source: booking.pricing.source,
  };
}

function buildCatalogBookingPayload(booking) {
  return {
    job_type: booking.job_type,
    ac_type: booking.ac_type,
    btu: booking.btu,
    machine_count: booking.machine_count,
    wash_variant: booking.wash_variant,
    repair_variant: "",
    admin_override_duration_min: 0,
  };
}

module.exports = { CatalogBookingPolicyError, resolveCatalogBookingPolicy, buildCatalogBookingItem, buildCatalogBookingPayload };
