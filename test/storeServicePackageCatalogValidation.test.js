"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("../server/services/packages/storeServicePackageCatalogService");

function variant(overrides = {}) {
  return {
    display_name: "Small", service_key: "wash-wall-premium", service_name: "Premium wash",
    job_type: "wash", ac_type: "wall", wash_variant: "premium", btu_min: null, btu_max: 12000,
    service_unit_duration_minutes: 45, is_active: true, is_customer_visible: true,
    tiers: [{ display_name: "1 unit", service_quantity: 1, fixed_total_price: "699.00", sort_order: 0, is_active: true }],
    ...overrides,
  };
}
function bundle(overrides = {}) {
  return { item_name: "Premium Day", is_active: true, is_customer_visible: true,
    sell_start_at: "2026-08-08T00:00:00+07:00", sell_end_at: "2026-08-10T23:59:59+07:00",
    redeem_until: "2027-01-31T23:59:59+07:00", variants: [variant()], ...overrides };
}

test("bundle validation keeps parent windows authoritative and price text exact", () => {
  const result = validate(bundle());
  assert.equal(result.variants[0].fixed_total_price, undefined);
  assert.equal(result.variants[0].tiers[0].fixed_total_price, "699.00");
  assert.equal(result.variants[0].sell_start_at, null);
  assert.equal(result.sell_start_at, "2026-08-07T17:00:00.000Z");
});

test("active same-taxonomy BTU ranges may not overlap", () => {
  assert.throws(() => validate(bundle({ variants: [variant(), variant({ display_name: "Overlap", btu_min: 12000, btu_max: 18000 })] })),
    { code: "OVERLAPPING_VARIANT_RANGE" });
});

test("BTU gap and a non-Premium configuration are accepted", () => {
  const result = validate(bundle({ item_name: "Maintenance Club", variants: [
    variant({ display_name: "Compact", wash_variant: "normal" }),
    variant({ display_name: "Large", wash_variant: "normal", btu_min: 18000, btu_max: null,
      tiers: [{ display_name: "3 visits", service_quantity: 3, fixed_total_price: "2500.00", is_active: true }] }),
  ] }));
  assert.equal(result.item_name, "Maintenance Club");
  assert.equal(result.variants[1].tiers[0].fixed_total_price, "2500.00");
});

test("canonical Admin taxonomy accepts a non-wall package and derives service identity", () => {
  const result = validate(bundle({ item_name: "Cassette Club", variants: [variant({
    display_name: "Cassette seven", job_type: "wash", ac_type: "cassette", wash_variant: null,
    btu_min: 15000, btu_max: 60000, service_unit_duration_minutes: 70,
    tiers: [{ display_name: "7 units", service_quantity: 7, fixed_total_price: "8750.00", sort_order: 0, is_active: true }],
  })] }));
  assert.equal(result.variants[0].job_type, "ล้าง");
  assert.equal(result.variants[0].ac_type, "สี่ทิศทาง");
  assert.equal(result.variants[0].wash_variant, null);
  assert.equal(result.variants[0].service_key, "wash-cassette");
  assert.equal(result.variants[0].tiers[0].service_quantity, 7);
});

test("unknown free-text taxonomy is rejected before persistence", () => {
  assert.throws(() => validate(bundle({ variants: [variant({ ac_type: "invented-ac-type" })] })),
    { code: "INVALID_SERVICE_CONSTRAINTS" });
});
