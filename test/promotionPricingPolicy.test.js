"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCompositeBooking } = require("../server/services/packages/compositeServicePackage");

function makeTiers(prefix, prices) {
  return Object.entries(prices).map(([quantity, price], index) => ({
    service_package_tier_id: `${prefix}${index + 1}`,
    tier_key: `q${quantity}`,
    display_name: `${quantity} เครื่อง`,
    service_quantity: Number(quantity),
    fixed_total_price: price,
    sort_order: index,
    is_active: true,
  }));
}

const standardTiers = makeTiers("1", { 1: "550.00", 2: "959.00", 3: "1399.00", 4: "1799.00" });
const premiumTiers = makeTiers("2", { 1: "790.00", 2: "1490.00", 3: "2090.00", 4: "2690.00" });
const base = {
  catalog_item_id: "900", item_id: "900", item_name: "AIR RESET 60", service_bundle_key: "air-reset-60",
  booking_mode: "service_package", catalog_is_active: true, catalog_is_customer_visible: true,
  service_package_sell_start_at: "2026-09-04T17:00:00.000Z",
  service_package_sell_end_at: "2026-09-12T16:59:59.999Z",
  service_package_redeem_until: "2027-01-31T16:59:59.999Z",
  service_package_pricing_strategy: "total_quantity_tier_plus_unit_modifiers",
  service_package_selection_mode: "exclusive_level",
  service_package_maximum_total_quantity: 4,
  service_package_payment_mode: "prepaid_full",
  service_package_warranty_days: 60,
  booking_flow_policy: "scheduled_only",
  job_type: "wash", ac_type: "wall", service_unit_duration_minutes: 45,
  is_active: true, is_customer_visible: true,
};
const rows = [
  { ...base, service_package_id: "101", package_key: "standard-small", display_name: "STANDARD <=12k",
    wash_variant: "normal", service_key: "wash-wall-standard", btu_min: null, btu_max: 12000,
    service_level_key: "standard", service_level_label: "STANDARD", unit_price_modifier: "0.00", tiers: standardTiers },
  { ...base, service_package_id: "102", package_key: "standard-large", display_name: "STANDARD >=18k",
    wash_variant: "normal", service_key: "wash-wall-standard", btu_min: 18000, btu_max: null,
    service_level_key: "standard", service_level_label: "STANDARD", unit_price_modifier: "100.00", tiers: standardTiers.map((t, i) => ({ ...t, service_package_tier_id: `3${i + 1}` })) },
  { ...base, service_package_id: "201", package_key: "premium-small", display_name: "PREMIUM <=12k",
    wash_variant: "premium", service_key: "wash-wall-premium", btu_min: null, btu_max: 12000,
    service_level_key: "premium", service_level_label: "PREMIUM", unit_price_modifier: "0.00", tiers: premiumTiers },
  { ...base, service_package_id: "202", package_key: "premium-large", display_name: "PREMIUM >=18k",
    wash_variant: "premium", service_key: "wash-wall-premium", btu_min: 18000, btu_max: null,
    service_level_key: "premium", service_level_label: "PREMIUM", unit_price_modifier: "200.00", tiers: premiumTiers.map((t, i) => ({ ...t, service_package_tier_id: `4${i + 1}` })) },
];
const repository = { findLinkedPackagesByKeys: async (_db, keys) => rows.filter((row) => keys.includes(row.package_key)) };

async function quote(groups, extra = {}) {
  return resolveCompositeBooking({
    body: { catalog_item_id: 900, service_package_groups: groups },
    bookingMode: "scheduled",
    appointmentDatetime: "2026-12-20T03:00:00.000Z",
    repository,
    db: {},
    now: () => new Date("2026-09-10T05:00:00.000Z"),
    ...extra,
  });
}

const g = (package_key, btu, quantity) => ({ package_key, btu, quantity });

test("AIR RESET STANDARD exact total-quantity tiers and BTU modifiers", async () => {
  assert.equal((await quote([g("standard-small", 12000, 1)])).fixedTotal, "550.00");
  assert.equal((await quote([g("standard-large", 18000, 1)])).fixedTotal, "650.00");
  assert.equal((await quote([g("standard-small", 12000, 2)])).fixedTotal, "959.00");
  assert.equal((await quote([g("standard-small", 12000, 1), g("standard-large", 18000, 1)])).fixedTotal, "1059.00");
  assert.equal((await quote([g("standard-large", 18000, 2)])).fixedTotal, "1159.00");
  assert.equal((await quote([g("standard-small", 12000, 3)])).fixedTotal, "1399.00");
  assert.equal((await quote([g("standard-small", 12000, 4)])).fixedTotal, "1799.00");
});

test("AIR RESET PREMIUM exact total-quantity tiers and BTU modifiers", async () => {
  assert.equal((await quote([g("premium-small", 12000, 1)])).fixedTotal, "790.00");
  assert.equal((await quote([g("premium-large", 18000, 1)])).fixedTotal, "990.00");
  assert.equal((await quote([g("premium-small", 12000, 2)])).fixedTotal, "1490.00");
  assert.equal((await quote([g("premium-small", 12000, 1), g("premium-large", 18000, 1)])).fixedTotal, "1690.00");
  assert.equal((await quote([g("premium-large", 18000, 2)])).fixedTotal, "1890.00");
  assert.equal((await quote([g("premium-small", 12000, 3)])).fixedTotal, "2090.00");
  assert.equal((await quote([g("premium-small", 12000, 4)])).fixedTotal, "2690.00");
});

test("aggregate pricing is internally reconcilable and snapshots policy", async () => {
  const result = await quote([g("standard-small", 12000, 1), g("standard-large", 18000, 1)]);
  assert.equal(result.items.reduce((sum, item) => sum + Number(item.line_total), 0), 1059);
  assert.equal(result.items[0].snapshot.schema_version, 3);
  assert.equal(result.items[0].snapshot.pricing.strategy, "total_quantity_tier_plus_unit_modifiers");
  assert.equal(result.items[1].snapshot.pricing.unit_modifier, "100.00");
  assert.equal(result.warrantyDays, 60);
  assert.equal(result.paymentMode, "prepaid_full");
});

test("exclusive level, per-promotion maximum and exact total tier fail closed", async () => {
  await assert.rejects(quote([g("standard-small", 12000, 1), g("premium-small", 12000, 1)]),
    { code: "SERVICE_PACKAGE_LEVEL_SELECTION_REQUIRED" });
  await assert.rejects(quote([g("standard-small", 12000, 4), g("standard-large", 18000, 1)]),
    { code: "SERVICE_PACKAGE_MAXIMUM_QUANTITY_EXCEEDED" });
});

test("prepaid purchase observes sale window without requiring a service date", async () => {
  const purchased = await quote([g("standard-small", 12000, 2)], { purchaseOnly: true, appointmentDatetime: null });
  assert.equal(purchased.fixedTotal, "959.00");
  await assert.rejects(quote([g("standard-small", 12000, 2)], {
    purchaseOnly: true,
    appointmentDatetime: null,
    now: () => new Date("2026-09-13T00:00:00.000Z"),
  }), { code: "SERVICE_PACKAGE_NOT_AVAILABLE" });
});
