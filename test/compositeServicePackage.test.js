"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  composeTiers, parseMoney, formatMoney, normalizeGroups, resolveCompositeBooking,
} = require("../server/services/packages/compositeServicePackage");
const { compositeBookingFromSnapshots } = require("../server/services/booking/servicePackageBooking");

function tiers(prices) {
  return Object.entries(prices).map(([quantity, price], index) => ({
    service_package_tier_id: String(index + 1), tier_key: `q${quantity}`,
    display_name: `${quantity} units`, service_quantity: Number(quantity),
    fixed_total_price: price, sort_order: index, is_active: true,
  }));
}

const small = tiers({ 1: "699.00", 2: "1399.00", 3: "1899.00", 4: "2489.00" });
const large = tiers({ 1: "899.00", 2: "1799.00", 3: "2599.00", 4: "3399.00" });

test("money is exact integer satang and round-trips decimal text", () => {
  assert.equal(parseMoney("699.00"), 69900n);
  assert.equal(formatMoney(139900n), "1399.00");
  assert.throws(() => parseMoney("699"), { code: "INVALID_PACKAGE_PRICE" });
});

test("tier composition uses exact tier, then fewest components, exact totals, and deterministic larger-tier ties", () => {
  assert.equal(composeTiers(small, 2).fixed_total_price, "1399.00");
  assert.equal(composeTiers(small, 5).fixed_total_price, "3188.00");
  assert.deepEqual(composeTiers(small, 5).components.map((x) => x.quantity), [4, 1]);
  assert.equal(composeTiers(small, 6).fixed_total_price, "3798.00");
  assert.deepEqual(composeTiers(small, 6).components.map((x) => x.quantity), [3, 3]);
  assert.equal(composeTiers(large, 5).fixed_total_price, "4298.00");
  assert.equal(composeTiers(large, 6).fixed_total_price, "5198.00");
});

test("generic non-Premium tier configuration composes without product-specific logic", () => {
  const generic = tiers({ 1: "100.00", 3: "250.00" });
  assert.equal(composeTiers(generic, 7).fixed_total_price, "600.00");
  assert.deepEqual(composeTiers(generic, 7).components.map((x) => x.quantity), [3, 3, 1]);
});

test("customer composite identity rejects numeric ids", () => {
  assert.throws(() => normalizeGroups({ catalog_item_id: 7, service_package_groups: [] }), { code: "PACKAGE_IDENTITY_MALFORMED" });
});

test("mixed BTU groups resolve under one parent with component snapshots", async () => {
  const base = {
    catalog_item_id: "51", item_id: "51", item_name: "Premium Day", service_bundle_key: "premium-day",
    booking_mode: "service_package", catalog_is_active: true, catalog_is_customer_visible: true,
    service_package_sell_start_at: "2026-08-08T00:00:00.000Z",
    service_package_sell_end_at: "2026-08-11T00:00:00.000Z",
    service_package_redeem_until: "2027-01-31T16:59:59.000Z",
    job_type: "wash", ac_type: "wall", wash_variant: "premium", service_key: "wash-wall-premium",
    service_name: "Premium wash", service_unit_duration_minutes: 45,
    is_active: true, is_customer_visible: true,
  };
  const rows = [
    { ...base, service_package_id: "11", package_key: "small", display_name: "up to 12000", btu_min: null, btu_max: 12000, tiers: small },
    { ...base, service_package_id: "12", package_key: "large", display_name: "18000 plus", btu_min: 18000, btu_max: null, tiers: large },
  ];
  const repository = { findLinkedPackagesByKeys: async (_db, keys) => rows.filter((row) => keys.includes(row.package_key)) };
  const result = await resolveCompositeBooking({
    body: { service_package_groups: [
      { package_key: "small", btu: 12000, quantity: 2 },
      { package_key: "large", btu: 18000, quantity: 2 },
    ] }, bookingMode: "scheduled", appointmentDatetime: "2026-08-20T03:00:00.000Z",
    repository, db: {}, now: () => new Date("2026-08-09T00:00:00.000Z"),
  });
  assert.equal(result.fixedTotal, "3198.00");
  assert.equal(result.durationMin, 180);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].snapshot.schema_version, 2);
  assert.equal(result.items[0].snapshot.catalog_item.key, "premium-day");
  assert.equal(result.items[1].snapshot.taxonomy.selected_btu, 18000);
});

test("BTU gap is rejected by variant constraints", async () => {
  const row = {
    catalog_item_id: "51", item_id: "51", item_name: "Bundle", service_bundle_key: "bundle",
    booking_mode: "service_package", catalog_is_active: true, catalog_is_customer_visible: true,
    job_type: "wash", ac_type: "wall", wash_variant: "premium", service_key: "wash", service_name: "Wash",
    service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
    service_package_id: "11", package_key: "small", display_name: "small", btu_max: 12000, tiers: small,
  };
  await assert.rejects(resolveCompositeBooking({
    body: { service_package_groups: [{ package_key: "small", btu: 13000, quantity: 1 }] },
    bookingMode: "scheduled", appointmentDatetime: "2026-08-20T03:00:00.000Z",
    repository: { findLinkedPackagesByKeys: async () => [row] }, db: {},
  }), { code: "PACKAGE_BTU_MISMATCH" });
});

test("composite idempotency replay rebuilds from immutable component snapshots and rejects changed material", async () => {
  const snapshots = [
    { service_package_id: "11", service_package_tier_id: "2", service_package_snapshot: {
      schema_version: 2, catalog_item: { id: "51", key: "bundle", name: "Bundle" },
      package: { id: "11", key: "small", name: "Small" }, tier: { id: "2", key: "q2", name: "2 units" },
      taxonomy: { service_key: "wash", service_name: "Wash", job_type: "wash", ac_type: "wall", wash_variant: "premium", selected_btu: 12000 },
      quantity: 2, unit_duration_minutes: 45, fixed_total_price: "1399.00",
    } },
    { service_package_id: "12", service_package_tier_id: "6", service_package_snapshot: {
      schema_version: 2, catalog_item: { id: "51", key: "bundle", name: "Bundle" },
      package: { id: "12", key: "large", name: "Large" }, tier: { id: "6", key: "q2", name: "2 units" },
      taxonomy: { service_key: "wash", service_name: "Wash", job_type: "wash", ac_type: "wall", wash_variant: "premium", selected_btu: 18000 },
      quantity: 2, unit_duration_minutes: 45, fixed_total_price: "1799.00",
    } },
  ];
  const body = { service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }, { package_key: "large", btu: 18000, quantity: 2 }] };
  const replay = compositeBookingFromSnapshots({ body, snapshots });
  assert.equal(replay.fixedTotal, "3198.00");
  assert.equal(replay.items.length, 2);
  assert.equal(compositeBookingFromSnapshots({ body: { service_package_groups: [{ package_key: "small", btu: 12000, quantity: 3 }] }, snapshots }), null);
});
