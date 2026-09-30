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



const airCareStandardTiers = makeTiers("acs-", { 1: "499.00", 2: "899.00", 3: "1299.00", 4: "1699.00" });
const airCarePremiumSmallTiers = makeTiers("acps-", { 1: "699.00", 2: "1399.00", 3: "1899.00", 4: "2489.00" });
const airCarePremiumLargeTiers = makeTiers("acpl-", { 1: "899.00", 2: "1799.00", 3: "2599.00", 4: "3399.00" });

function airCareRow(packageKey, bundleKey, tiers, btuMin, btuMax, levelKey, modifier = "0.00") {
  return {
    ...base,
    catalog_item_id: bundleKey === "coldwindflow-air-care-standard" ? "910" : "911",
    item_id: bundleKey === "coldwindflow-air-care-standard" ? "910" : "911",
    item_name: bundleKey,
    service_bundle_key: bundleKey,
    service_package_sell_start_at: "2026-09-28T17:00:00.000Z",
    service_package_sell_end_at: "2026-10-06T16:59:59.999Z",
    service_package_maximum_total_quantity: null,
    service_package_selection_mode: bundleKey.endsWith("-premium") ? "exclusive_level" : "multi_variant",
    service_package_id: packageKey,
    package_key: packageKey,
    display_name: packageKey,
    btu_min: btuMin,
    btu_max: btuMax,
    service_level_key: levelKey,
    service_level_label: levelKey,
    unit_price_modifier: modifier,
    tiers,
  };
}

const airCareRows = [
  airCareRow("coldwindflow-air-care-standard-small", "coldwindflow-air-care-standard", airCareStandardTiers, null, 12000, "standard"),
  airCareRow("coldwindflow-air-care-standard-large", "coldwindflow-air-care-standard", airCareStandardTiers.map((t) => ({ ...t, service_package_tier_id: `acl-${t.service_package_tier_id}` })), 18000, null, "standard", "100.00"),
  airCareRow("coldwindflow-air-care-premium-small", "coldwindflow-air-care-premium", airCarePremiumSmallTiers, null, 12000, "premium-small"),
  airCareRow("coldwindflow-air-care-premium-large", "coldwindflow-air-care-premium", airCarePremiumLargeTiers, 18000, null, "premium-large"),
];

async function airCareQuote(packageKey, btu, quantity) {
  const row = airCareRows.find((entry) => entry.package_key === packageKey);
  const airCareRepository = {
    findLinkedPackagesByKeys: async (_db, keys) => airCareRows.filter((entry) =>
      entry.service_bundle_key === row.service_bundle_key && keys.includes(entry.package_key)),
  };
  return resolveCompositeBooking({
    body: { catalog_item_id: Number(row.catalog_item_id), service_package_groups: [g(packageKey, btu, quantity)] },
    bookingMode: "scheduled",
    appointmentDatetime: null,
    purchaseOnly: true,
    repository: airCareRepository,
    db: {},
    now: () => new Date("2026-09-30T05:00:00.000Z"),
  });
}

test("AIR CARE server pricing matches locked q1-q6 tier composition", async () => {
  const cases = [
    ["coldwindflow-air-care-standard-small", 12000, ["499.00","899.00","1299.00","1699.00","2198.00","2598.00"]],
    ["coldwindflow-air-care-standard-large", 18000, ["599.00","1099.00","1599.00","2099.00","2698.00","3198.00"]],
    ["coldwindflow-air-care-premium-small", 12000, ["699.00","1399.00","1899.00","2489.00","3188.00","3798.00"]],
    ["coldwindflow-air-care-premium-large", 18000, ["899.00","1799.00","2599.00","3399.00","4298.00","5197.00"]],
  ];
  for (const [packageKey, btu, expected] of cases) {
    for (let quantity = 1; quantity <= 6; quantity += 1) {
      assert.equal((await airCareQuote(packageKey, btu, quantity)).fixedTotal, expected[quantity - 1],
        `${packageKey} q${quantity}`);
    }
  }
});

test("generic uncapped total-quantity promotion does not inherit AIR CARE tier composition", async () => {
  const genericRows = rows.slice(0, 2).map((row) => ({
    ...row,
    service_bundle_key: "generic-uncapped-promotion",
    service_package_maximum_total_quantity: null,
  }));
  const genericRepository = {
    findLinkedPackagesByKeys: async (_db, keys) => genericRows.filter((row) => keys.includes(row.package_key)),
  };
  await assert.rejects(resolveCompositeBooking({
    body: { catalog_item_id: 900, service_package_groups: [g("standard-small", 12000, 5)] },
    bookingMode: "scheduled",
    appointmentDatetime: null,
    purchaseOnly: true,
    repository: genericRepository,
    db: {},
    now: () => new Date("2026-09-10T05:00:00.000Z"),
  }), { code: "SERVICE_PACKAGE_TOTAL_TIER_REQUIRED" });
});
