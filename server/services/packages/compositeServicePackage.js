"use strict";

const {
  normalizeServiceType,
  normalizeAcType,
  normalizeWashVariantLabel,
} = require("../../normalizers");
const {
  strategy: promotionPricingStrategy,
  selectionMode: promotionSelectionMode,
  paymentMode: promotionPaymentMode,
  maximumTotalQuantity,
  warrantyDays,
  resolveTotalQuantityTierPlusModifiers,
} = require("./promotionPricingPolicy");

class CompositePackageError extends Error {
  constructor(code, statusCode = 409) {
    super(code);
    this.name = "CompositePackageError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const MAX_COMPOSITE_PACKAGE_QUANTITY = 99;
const MIN_COMPOSITE_PACKAGE_MINIMUM = 2;

function bundleMinimumTotalQuantity(bundle) {
  const raw = bundle == null ? null : bundle.service_package_minimum_total_quantity;
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  if (value < MIN_COMPOSITE_PACKAGE_MINIMUM || value > MAX_COMPOSITE_PACKAGE_QUANTITY) return null;
  return value;
}

function totalGroupQuantity(groups) {
  return (Array.isArray(groups) ? groups : []).reduce((sum, group) => sum + Number(group?.quantity || 0), 0);
}

function fail(code, statusCode) { throw new CompositePackageError(code, statusCode); }

function parseMoney(value) {
  const match = /^(\d+)\.(\d{2})$/.exec(String(value == null ? "" : value));
  if (!match) fail("INVALID_PACKAGE_PRICE");
  return BigInt(match[1]) * 100n + BigInt(match[2]);
}

function formatMoney(minor) {
  if (typeof minor !== "bigint" || minor < 0n) fail("INVALID_PACKAGE_PRICE");
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

function allocateUnitMoney(totalMinor, quantity) {
  const divisor = BigInt(quantity);
  const quotient = totalMinor / divisor;
  return formatMoney(quotient + ((totalMinor % divisor) * 2n >= divisor ? 1n : 0n));
}

function comparePlan(a, b) {
  if (!b) return -1;
  if (a.total !== b.total) return a.total < b.total ? -1 : 1;
  if (a.components.length !== b.components.length) return a.components.length - b.components.length;
  const aq = a.components.map((x) => x.quantity).sort((x, y) => y - x);
  const bq = b.components.map((x) => x.quantity).sort((x, y) => y - x);
  for (let i = 0; i < Math.max(aq.length, bq.length); i += 1) {
    if ((aq[i] || 0) !== (bq[i] || 0)) return (bq[i] || 0) - (aq[i] || 0);
  }
  return 0;
}

function composeTiers(tiers, requestedQuantity) {
  const quantity = Number(requestedQuantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_COMPOSITE_PACKAGE_QUANTITY) {
    fail("INVALID_PACKAGE_QUANTITY", 400);
  }
  const usable = (Array.isArray(tiers) ? tiers : []).filter((tier) => tier.is_active !== false).map((tier) => ({
    ...tier,
    quantity: Number(tier.service_quantity),
    priceMinor: parseMoney(tier.fixed_total_price),
  })).filter((tier) => Number.isSafeInteger(tier.quantity) && tier.quantity > 0);
  if (!usable.length) fail("SERVICE_PACKAGE_TIERS_UNAVAILABLE");

  const exact = usable.filter((tier) => tier.quantity === quantity)
    .sort((a, b) => a.priceMinor === b.priceMinor ? Number(a.sort_order || 0) - Number(b.sort_order || 0) : (a.priceMinor < b.priceMinor ? -1 : 1))[0];
  if (exact) return { fixed_total_price: formatMoney(exact.priceMinor), components: [{ tier: exact, quantity: exact.quantity }] };

  const best = Array(quantity + 1).fill(null);
  best[0] = { total: 0n, components: [] };
  for (let target = 1; target <= quantity; target += 1) {
    for (const tier of usable) {
      if (tier.quantity > target || !best[target - tier.quantity]) continue;
      const candidate = {
        total: best[target - tier.quantity].total + tier.priceMinor,
        components: [...best[target - tier.quantity].components, { tier, quantity: tier.quantity }],
      };
      if (comparePlan(candidate, best[target]) < 0) best[target] = candidate;
    }
  }
  if (!best[quantity]) fail("SERVICE_PACKAGE_QUANTITY_NOT_COMPOSABLE", 400);
  best[quantity].components.sort((a, b) => b.quantity - a.quantity || Number(a.tier.sort_order || 0) - Number(b.tier.sort_order || 0));
  return { fixed_total_price: formatMoney(best[quantity].total), components: best[quantity].components };
}

function normalizeGroups(body = {}) {
  if (body.service_package_id != null || body.service_package_tier_id != null) fail("PACKAGE_IDENTITY_MALFORMED", 400);
  if (!Object.prototype.hasOwnProperty.call(body, "service_package_groups")) return null;
  if (!Array.isArray(body.service_package_groups) || !body.service_package_groups.length) fail("INVALID_PACKAGE_SELECTION", 400);
  let totalQuantity = 0;
  const groups = body.service_package_groups.map((group) => {
    const packageKey = String(group?.package_key || "").trim();
    const btu = Number(group?.btu);
    const quantity = Number(group?.quantity);
    if (!packageKey || packageKey.length > 128 || !Number.isSafeInteger(btu) || btu <= 0
        || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_COMPOSITE_PACKAGE_QUANTITY) {
      fail("INVALID_PACKAGE_SELECTION", 400);
    }
    totalQuantity += quantity;
    return { packageKey, btu, quantity };
  });
  if (totalQuantity > MAX_COMPOSITE_PACKAGE_QUANTITY) fail("INVALID_PACKAGE_SELECTION", 400);
  return groups;
}

function inWindow(value, start, end) {
  const at = new Date(value);
  return Number.isFinite(at.getTime()) && (!start || at >= new Date(start)) && (!end || at <= new Date(end));
}

function buildComponentSnapshot({ bundle, variant, tier, btu, appointmentDatetime, quantityOverride = null,
  fixedTotalOverride = null, pricing = null }) {
  const fixedTotal = fixedTotalOverride || formatMoney(parseMoney(tier.fixed_total_price));
  const quantity = quantityOverride == null ? Number(tier.service_quantity) : Number(quantityOverride);
  return {
    schema_version: pricing ? 3 : 2,
    minimum_total_quantity: bundleMinimumTotalQuantity(bundle),
    maximum_total_quantity: maximumTotalQuantity(bundle, MAX_COMPOSITE_PACKAGE_QUANTITY),
    catalog_item: { id: String(bundle.item_id), key: bundle.service_bundle_key, name: bundle.item_name },
    package: { id: String(variant.service_package_id), key: variant.package_key, name: variant.display_name },
    tier: { id: String(tier.service_package_tier_id), key: tier.tier_key, name: tier.display_name },
    taxonomy: {
      service_key: variant.service_key,
      service_name: variant.service_name,
      job_type: variant.job_type,
      ac_type: variant.ac_type,
      wash_variant: variant.wash_variant || null,
      btu_min: variant.btu_min == null ? null : Number(variant.btu_min),
      btu_max: variant.btu_max == null ? null : Number(variant.btu_max),
      selected_btu: btu,
    },
    service_level: variant.service_level_key ? { key: variant.service_level_key, label: variant.service_level_label || variant.service_level_key } : null,
    quantity,
    unit_duration_minutes: Number(variant.service_unit_duration_minutes),
    fixed_total_price: fixedTotal,
    pricing: pricing || null,
    warranty_days: warrantyDays(bundle),
    payment_mode: promotionPaymentMode(bundle),
    sell_start_at: bundle.service_package_sell_start_at ? new Date(bundle.service_package_sell_start_at).toISOString() : null,
    sell_end_at: bundle.service_package_sell_end_at ? new Date(bundle.service_package_sell_end_at).toISOString() : null,
    redeem_until: bundle.service_package_redeem_until ? new Date(bundle.service_package_redeem_until).toISOString() : null,
    booking_flow_policy: bundle.booking_flow_policy === "scheduled_and_urgent" ? "scheduled_and_urgent" : "scheduled_only",
    appointment_datetime: appointmentDatetime ? new Date(appointmentDatetime).toISOString() : null,
  };
}

function serviceName(variant, btu, quantity) {
  const jobType = normalizeServiceType(variant.job_type);
  const acType = normalizeAcType(variant.ac_type);
  const parts = [];
  if (jobType === "ล้าง") {
    parts.push(`ล้างแอร์${acType}`.trim());
    if (acType === "ผนัง") parts.push(normalizeWashVariantLabel(variant.wash_variant));
  } else if (jobType === "ซ่อม") parts.push(`ซ่อมแอร์${acType}`.trim());
  else if (jobType === "ติดตั้ง") parts.push(`ติดตั้งแอร์${acType}`.trim());
  else parts.push(jobType);
  parts.push(`${btu} BTU`, `${quantity} เครื่อง`);
  return parts.filter(Boolean).join(" • ");
}

function validateVariantSelection(variant, group, identity) {
  if (!variant.is_active || (identity === "customer" && !variant.is_customer_visible)) fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
  if ((variant.btu_min != null && group.btu < Number(variant.btu_min))
      || (variant.btu_max != null && group.btu > Number(variant.btu_max))) fail("PACKAGE_BTU_MISMATCH", 400);
}

async function resolveCompositeBooking({ body, bookingMode, appointmentDatetime, repository, db, identity = "customer", now = () => new Date(), purchaseOnly = false }) {
  const groups = normalizeGroups(body);
  if (!groups) return null;
  if (!purchaseOnly && bookingMode !== "scheduled" && bookingMode !== "urgent") fail("UNKNOWN_BOOKING_MODE", 400);
  const variants = await repository.findLinkedPackagesByKeys(db, groups.map((group) => group.packageKey));
  const byKey = new Map(variants.map((variant) => [variant.package_key, variant]));
  if (byKey.size !== new Set(groups.map((group) => group.packageKey)).size) fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
  const bundleIds = new Set(variants.map((variant) => String(variant.catalog_item_id || "")));
  if (bundleIds.size !== 1 || bundleIds.has("")) fail("PACKAGE_IDENTITY_MALFORMED", 400);
  const bundle = variants[0];
  if (body.catalog_item_id != null && String(body.catalog_item_id).trim() !== String(bundle.catalog_item_id)) fail("PACKAGE_IDENTITY_MALFORMED", 400);
  if (!bundle.catalog_is_active || (identity === "customer" && !bundle.catalog_is_customer_visible)
      || bundle.booking_mode !== "service_package" || !inWindow(now(), bundle.service_package_sell_start_at, bundle.service_package_sell_end_at)) {
    fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
  }
  if (!purchaseOnly && bookingMode === "urgent" && bundle.booking_flow_policy !== "scheduled_and_urgent") fail("PACKAGE_FLOW_NOT_ALLOWED", 409);
  if (!purchaseOnly && !inWindow(appointmentDatetime, null, bundle.service_package_redeem_until)) fail("PACKAGE_REDEEM_WINDOW_EXCEEDED");
  if (purchaseOnly && promotionPaymentMode(bundle) !== "prepaid_full") fail("PACKAGE_PREPAID_PURCHASE_NOT_ALLOWED", 409);

  const minimumTotalQuantity = bundleMinimumTotalQuantity(bundle);
  const totalQuantity = totalGroupQuantity(groups);
  if (minimumTotalQuantity != null && totalQuantity < minimumTotalQuantity) fail("SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET", 400);
  const maximum = maximumTotalQuantity(bundle, MAX_COMPOSITE_PACKAGE_QUANTITY);
  if (totalQuantity > maximum) fail("SERVICE_PACKAGE_MAXIMUM_QUANTITY_EXCEEDED", 400);

  for (const group of groups) validateVariantSelection(byKey.get(group.packageKey), group, identity);

  const aggregate = resolveTotalQuantityTierPlusModifiers({ bundle, groups, byKey, parseMoney, formatMoney, fail });
  let total = 0n;
  let durationMin = 0;
  let machineCount = 0;
  const items = [];
  const payloadGroups = [];
  const services = [];

  if (aggregate) {
    total = aggregate.fixedTotalMinor;
    for (const priced of aggregate.pricedGroups) {
      const { group, variant, tier } = priced;
      durationMin += group.quantity * Number(variant.service_unit_duration_minutes);
      machineCount += group.quantity;
      payloadGroups.push({ package_key: group.packageKey, btu: group.btu, quantity: group.quantity });
      services.push({ job_type: variant.job_type, ac_type: variant.ac_type, btu: group.btu,
        machine_count: group.quantity, wash_variant: variant.wash_variant || "", repair_variant: "" });
      const snapshot = buildComponentSnapshot({
        bundle, variant, tier, btu: group.btu, appointmentDatetime,
        quantityOverride: group.quantity, fixedTotalOverride: priced.lineTotal,
        pricing: {
          strategy: aggregate.pricingStrategy,
          selection_mode: aggregate.selectionMode,
          service_level_key: aggregate.serviceLevelKey,
          total_quantity: aggregate.totalQuantity,
          base_total_price: formatMoney(aggregate.baseTotalMinor),
          group_base_share: formatMoney(priced.baseShareMinor),
          unit_modifier: formatMoney(priced.modifierMinor),
          modifier_line_total: formatMoney(priced.modifierLineMinor),
          final_line_total: priced.lineTotal,
        },
      });
      items.push({
        item_id: String(bundle.item_id), item_name: serviceName(variant, group.btu, group.quantity), qty: group.quantity,
        unit_price: allocateUnitMoney(priced.lineTotalMinor, group.quantity), line_total: priced.lineTotal,
        is_service: true, customer_price_source: "service_package",
        packageId: String(variant.service_package_id), tierId: String(tier.service_package_tier_id), snapshot,
      });
    }
  } else {
    for (const group of groups) {
      const variant = byKey.get(group.packageKey);
      const plan = composeTiers(variant.tiers, group.quantity);
      total += parseMoney(plan.fixed_total_price);
      durationMin += group.quantity * Number(variant.service_unit_duration_minutes);
      machineCount += group.quantity;
      payloadGroups.push({ package_key: group.packageKey, btu: group.btu, quantity: group.quantity });
      services.push({ job_type: variant.job_type, ac_type: variant.ac_type, btu: group.btu,
        machine_count: group.quantity, wash_variant: variant.wash_variant || "", repair_variant: "" });
      for (const component of plan.components) {
        const snapshot = buildComponentSnapshot({ bundle, variant, tier: component.tier, btu: group.btu, appointmentDatetime });
        items.push({
          item_id: String(bundle.item_id), item_name: serviceName(variant, group.btu, component.quantity),
          qty: component.quantity, unit_price: allocateUnitMoney(parseMoney(component.tier.fixed_total_price), component.quantity),
          line_total: snapshot.fixed_total_price, is_service: true, customer_price_source: "service_package",
          packageId: String(variant.service_package_id), tierId: String(component.tier.service_package_tier_id), snapshot,
        });
      }
    }
  }

  const first = variants[0];
  return {
    bundleId: String(bundle.item_id), bundleKey: bundle.service_bundle_key,
    fixedTotal: formatMoney(total), durationMin, items,
    minimumTotalQuantity, maximumTotalQuantity: maximum,
    pricingStrategy: promotionPricingStrategy(bundle), selectionMode: promotionSelectionMode(bundle),
    paymentMode: promotionPaymentMode(bundle), warrantyDays: warrantyDays(bundle),
    redeemUntil: bundle.service_package_redeem_until ? new Date(bundle.service_package_redeem_until).toISOString() : null,
    payload: {
      job_type: first.job_type, ac_type: first.ac_type, btu: groups[0].btu, machine_count: machineCount,
      wash_variant: first.wash_variant || "", repair_variant: "", admin_override_duration_min: 0,
      service_package_groups: payloadGroups, services,
    },
  };
}

module.exports = {
  CompositePackageError, parseMoney, formatMoney, allocateUnitMoney, composeTiers, normalizeGroups,
  buildComponentSnapshot, resolveCompositeBooking, MAX_COMPOSITE_PACKAGE_QUANTITY,
  MIN_COMPOSITE_PACKAGE_MINIMUM, bundleMinimumTotalQuantity, totalGroupQuantity,
};
