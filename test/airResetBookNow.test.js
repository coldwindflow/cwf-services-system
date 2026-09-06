"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { resolveCompositeBooking } = require("../server/services/packages/compositeServicePackage");

function tiers(prefix, prices) {
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

const standardTiers = tiers("s", { 1: "550.00", 2: "959.00", 3: "1399.00", 4: "1799.00" });
const premiumTiers = tiers("p", { 1: "790.00", 2: "1490.00", 3: "2090.00", 4: "2690.00" });

function parent(level) {
  const standard = level === "standard";
  return {
    catalog_item_id: standard ? "901" : "902",
    item_id: standard ? "901" : "902",
    item_name: standard ? "CWF AIR RESET 60 — STANDARD" : "CWF AIR RESET 60 — PREMIUM",
    service_bundle_key: standard ? "air-reset-60-standard" : "air-reset-60-premium",
    booking_mode: "service_package",
    catalog_is_active: true,
    catalog_is_customer_visible: true,
    service_package_sell_start_at: "2026-09-04T17:00:00.000Z",
    service_package_sell_end_at: "2026-09-12T16:59:59.999Z",
    service_package_redeem_until: "2027-01-31T16:59:59.999Z",
    service_package_pricing_strategy: "total_quantity_tier_plus_unit_modifiers",
    service_package_selection_mode: "multi_variant",
    service_package_maximum_total_quantity: 4,
    service_package_payment_mode: "book_now",
    service_package_warranty_days: 60,
    booking_flow_policy: "scheduled_only",
    job_type: "wash",
    ac_type: "wall",
    service_unit_duration_minutes: 45,
    is_active: true,
    is_customer_visible: true,
  };
}

const standardBase = parent("standard");
const premiumBase = parent("premium");
const rows = [
  {
    ...standardBase,
    service_package_id: "101",
    package_key: "air-reset-60-standard-small",
    display_name: "STANDARD <=12k",
    wash_variant: "normal",
    service_key: "air-reset-60-standard",
    btu_min: null,
    btu_max: 12000,
    service_level_key: "standard",
    service_level_label: "STANDARD",
    unit_price_modifier: "0.00",
    tiers: standardTiers,
  },
  {
    ...standardBase,
    service_package_id: "102",
    package_key: "air-reset-60-standard-large",
    display_name: "STANDARD >=18k",
    wash_variant: "normal",
    service_key: "air-reset-60-standard",
    btu_min: 18000,
    btu_max: null,
    service_level_key: "standard",
    service_level_label: "STANDARD",
    unit_price_modifier: "100.00",
    tiers: standardTiers.map((tier, index) => ({ ...tier, service_package_tier_id: `sl${index + 1}` })),
  },
  {
    ...premiumBase,
    service_package_id: "201",
    package_key: "air-reset-60-premium-small",
    display_name: "PREMIUM <=12k",
    wash_variant: "premium",
    service_key: "air-reset-60-premium",
    btu_min: null,
    btu_max: 12000,
    service_level_key: "premium",
    service_level_label: "PREMIUM",
    unit_price_modifier: "0.00",
    tiers: premiumTiers,
  },
  {
    ...premiumBase,
    service_package_id: "202",
    package_key: "air-reset-60-premium-large",
    display_name: "PREMIUM >=18k",
    wash_variant: "premium",
    service_key: "air-reset-60-premium",
    btu_min: 18000,
    btu_max: null,
    service_level_key: "premium",
    service_level_label: "PREMIUM",
    unit_price_modifier: "200.00",
    tiers: premiumTiers.map((tier, index) => ({ ...tier, service_package_tier_id: `pl${index + 1}` })),
  },
];

const repository = {
  findLinkedPackagesByKeys: async (_db, keys) => rows.filter((row) => keys.includes(row.package_key)),
};

const group = (package_key, btu, quantity) => ({ package_key, btu, quantity });

function quote({ catalogItemId, groups, now = "2026-09-10T05:00:00.000Z", appointment = "2026-12-20T03:00:00.000Z", identity = "customer" }) {
  return resolveCompositeBooking({
    body: { catalog_item_id: catalogItemId, service_package_groups: groups },
    bookingMode: "scheduled",
    appointmentDatetime: appointment,
    repository,
    db: {},
    identity,
    now: () => new Date(now),
  });
}

test("AIR RESET STANDARD books now through the normal scheduled flow with mixed BTU", async () => {
  const result = await quote({
    catalogItemId: 901,
    groups: [
      group("air-reset-60-standard-small", 12000, 1),
      group("air-reset-60-standard-large", 18000, 1),
    ],
  });
  assert.equal(result.fixedTotal, "1059.00");
  assert.equal(result.paymentMode, "book_now");
  assert.equal(result.warrantyDays, 60);
  assert.equal(result.payload.machine_count, 2);
  assert.equal(result.payload.service_package_groups.length, 2);
});

test("AIR RESET PREMIUM books now with server-authoritative modifier pricing", async () => {
  const result = await quote({
    catalogItemId: 902,
    groups: [group("air-reset-60-premium-large", 18000, 2)],
  });
  assert.equal(result.fixedTotal, "1890.00");
  assert.equal(result.paymentMode, "book_now");
  assert.equal(result.payload.machine_count, 2);
});

test("Admin booking-on-behalf uses the same AIR RESET price contract", async () => {
  const result = await quote({
    catalogItemId: 901,
    groups: [group("air-reset-60-standard-small", 12000, 2)],
    identity: "admin",
  });
  assert.equal(result.fixedTotal, "959.00");
  assert.equal(result.paymentMode, "book_now");
});

test("AIR RESET direct booking respects sale and service windows", async () => {
  const groups = [group("air-reset-60-standard-small", 12000, 1)];
  assert.equal((await quote({ catalogItemId: 901, groups, appointment: "2027-01-31T16:59:59.000Z" })).fixedTotal, "550.00");
  await assert.rejects(
    quote({ catalogItemId: 901, groups, now: "2026-09-13T00:00:00.000Z" }),
    { code: "SERVICE_PACKAGE_NOT_AVAILABLE" }
  );
  await assert.rejects(
    quote({ catalogItemId: 901, groups, appointment: "2027-01-31T17:00:00.000Z" }),
    { code: "PACKAGE_REDEEM_WINDOW_EXCEEDED" }
  );
});

test("AIR RESET direct booking blocks quantity above the advertised 1-4 range", async () => {
  await assert.rejects(
    quote({ catalogItemId: 901, groups: [group("air-reset-60-standard-small", 12000, 5)] }),
    { code: "SERVICE_PACKAGE_MAXIMUM_QUANTITY_EXCEEDED" }
  );
});

test("AIR RESET seed is data configuration, not hard-coded runtime business logic", () => {
  const seed = fs.readFileSync("migrations/20260906_air_reset_60_book_now_seed.sql", "utf8");
  assert.match(seed, /air-reset-60-standard/);
  assert.match(seed, /air-reset-60-premium/);
  assert.match(seed, /total_quantity_tier_plus_unit_modifiers/);
  assert.match(seed, /service_package_payment_mode='book_now'/);
  assert.match(seed, /service_package_maximum_total_quantity=4/);
  assert.match(seed, /service_package_warranty_days=60/);
  assert.match(seed, /550\.00::numeric/);
  assert.match(seed, /959\.00::numeric/);
  assert.match(seed, /1490\.00::numeric/);
  assert.match(seed, /2690\.00::numeric/);
  assert.match(seed, /100\.00::numeric/);
  assert.match(seed, /200\.00::numeric/);

  const runtime = fs.readFileSync("server/services/packages/promotionPricingPolicy.js", "utf8");
  assert.doesNotMatch(runtime, /AIR RESET|air-reset/i);
});

test("Customer Store and Admin Add Job already submit service-package groups into real booking routes", () => {
  const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
  const admin = fs.readFileSync("admin-add-v2.js", "utf8");
  const booking = fs.readFileSync("server/services/booking/createBookingJob.js", "utf8");
  assert.match(store, /quoteCatalogBooking\(\{[\s\S]*service_package_groups: result\.groups/);
  assert.match(store, /continueBundleBooking\(item, result, verifiedQuote, scope\)/);
  assert.match(admin, /service_package_groups = selectedBundleGroups/);
  assert.match(admin, /\/admin\/book_v2/);
  assert.match(booking, /resolvePackageBooking\(\{ body, bookingMode: bm/);
});
