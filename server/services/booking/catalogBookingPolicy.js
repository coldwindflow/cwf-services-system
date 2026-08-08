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

async function resolveCatalogBookingPolicy(db, input = {}, options = {}) {
  const itemId = Number(input.catalogItemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    throw new CatalogBookingPolicyError("CATALOG_ITEM_INVALID", 400);
  }
  const lock = options.lock === true ? " FOR SHARE" : "";
  const result = await db.query(
    `SELECT item_id, item_name, booking_mode, booking_flow_policy,
            booking_job_type, booking_ac_type, booking_btu, booking_wash_variant,
            is_active, is_customer_visible
       FROM public.catalog_items
      WHERE item_id=$1${lock}`,
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
  return { item_id: Number(row.item_id), item_name: clean(row.item_name), booking_flow_policy: policy, ...expected };
}

module.exports = { CatalogBookingPolicyError, resolveCatalogBookingPolicy };
