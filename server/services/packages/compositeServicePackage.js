"use strict";

class CompositePackageError extends Error {
  constructor(code, statusCode = 409) {
    super(code);
    this.name = "CompositePackageError";
    this.code = code;
    this.statusCode = statusCode;
  }
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
  if (a.components.length !== b.components.length) return a.components.length - b.components.length;
  if (a.total !== b.total) return a.total < b.total ? -1 : 1;
  const aq = a.components.map((x) => x.quantity).sort((x, y) => y - x);
  const bq = b.components.map((x) => x.quantity).sort((x, y) => y - x);
  for (let i = 0; i < Math.max(aq.length, bq.length); i += 1) {
    if ((aq[i] || 0) !== (bq[i] || 0)) return (bq[i] || 0) - (aq[i] || 0);
  }
  return 0;
}

function composeTiers(tiers, requestedQuantity) {
  const quantity = Number(requestedQuantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) fail("INVALID_PACKAGE_QUANTITY", 400);
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
  if (body.service_package_id != null || body.service_package_tier_id != null || body.catalog_item_id != null) {
    fail("PACKAGE_IDENTITY_MALFORMED", 400);
  }
  if (!Object.prototype.hasOwnProperty.call(body, "service_package_groups")) return null;
  if (!Array.isArray(body.service_package_groups) || !body.service_package_groups.length) fail("INVALID_PACKAGE_SELECTION", 400);
  return body.service_package_groups.map((group) => {
    const packageKey = String(group?.package_key || "").trim();
    const btu = Number(group?.btu);
    const quantity = Number(group?.quantity);
    if (!packageKey || packageKey.length > 128 || !Number.isSafeInteger(btu) || btu <= 0
        || !Number.isSafeInteger(quantity) || quantity <= 0) fail("INVALID_PACKAGE_SELECTION", 400);
    return { packageKey, btu, quantity };
  });
}

function inWindow(value, start, end) {
  const at = new Date(value);
  return Number.isFinite(at.getTime()) && (!start || at >= new Date(start)) && (!end || at <= new Date(end));
}

function buildComponentSnapshot({ bundle, variant, tier, btu, appointmentDatetime }) {
  return {
    schema_version: 2,
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
    quantity: Number(tier.service_quantity),
    unit_duration_minutes: Number(variant.service_unit_duration_minutes),
    fixed_total_price: formatMoney(parseMoney(tier.fixed_total_price)),
    sell_start_at: bundle.service_package_sell_start_at ? new Date(bundle.service_package_sell_start_at).toISOString() : null,
    sell_end_at: bundle.service_package_sell_end_at ? new Date(bundle.service_package_sell_end_at).toISOString() : null,
    redeem_until: bundle.service_package_redeem_until ? new Date(bundle.service_package_redeem_until).toISOString() : null,
    booking_flow_policy: bundle.booking_flow_policy === "scheduled_and_urgent" ? "scheduled_and_urgent" : "scheduled_only",
    appointment_datetime: new Date(appointmentDatetime).toISOString(),
  };
}

function serviceName(variant, btu, quantity) {
  return `${variant.display_name} • ${btu} BTU • ${quantity} เครื่อง`;
}

async function resolveCompositeBooking({ body, bookingMode, appointmentDatetime, repository, db, identity = "customer", now = () => new Date() }) {
  const groups = normalizeGroups(body);
  if (!groups) return null;
  if (bookingMode !== "scheduled" && bookingMode !== "urgent") fail("UNKNOWN_BOOKING_MODE", 400);
  const variants = await repository.findLinkedPackagesByKeys(db, groups.map((group) => group.packageKey));
  const byKey = new Map(variants.map((variant) => [variant.package_key, variant]));
  if (byKey.size !== new Set(groups.map((group) => group.packageKey)).size) fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
  const bundleIds = new Set(variants.map((variant) => String(variant.catalog_item_id || "")));
  if (bundleIds.size !== 1 || bundleIds.has("")) fail("PACKAGE_PARENT_MISMATCH", 400);
  const bundle = variants[0];
  if (!bundle.catalog_is_active || (identity === "customer" && !bundle.catalog_is_customer_visible)
      || bundle.booking_mode !== "service_package" || !inWindow(now(), bundle.service_package_sell_start_at, bundle.service_package_sell_end_at)) {
    fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
  }
  if (bookingMode === "urgent" && bundle.booking_flow_policy !== "scheduled_and_urgent") fail("PACKAGE_FLOW_NOT_ALLOWED", 409);
  if (!inWindow(appointmentDatetime, null, bundle.service_package_redeem_until)) fail("PACKAGE_REDEEM_WINDOW_EXCEEDED");

  let total = 0n;
  let durationMin = 0;
  let machineCount = 0;
  const items = [];
  const payloadGroups = [];
  const services = [];
  for (const group of groups) {
    const variant = byKey.get(group.packageKey);
    if (!variant.is_active || (identity === "customer" && !variant.is_customer_visible)) fail("SERVICE_PACKAGE_NOT_AVAILABLE", 404);
    if ((variant.btu_min != null && group.btu < Number(variant.btu_min))
        || (variant.btu_max != null && group.btu > Number(variant.btu_max))) fail("PACKAGE_BTU_MISMATCH", 400);
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
  const first = variants[0];
  return {
    bundleId: String(bundle.item_id), bundleKey: bundle.service_bundle_key,
    fixedTotal: formatMoney(total), durationMin, items,
    payload: {
      job_type: first.job_type, ac_type: first.ac_type, btu: groups[0].btu, machine_count: machineCount,
      wash_variant: first.wash_variant || "", repair_variant: "", admin_override_duration_min: 0,
      service_package_groups: payloadGroups,
      services,
    },
  };
}

module.exports = {
  CompositePackageError, parseMoney, formatMoney, allocateUnitMoney, composeTiers, normalizeGroups,
  buildComponentSnapshot, resolveCompositeBooking,
};
