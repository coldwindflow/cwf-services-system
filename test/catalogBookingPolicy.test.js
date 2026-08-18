"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCatalogBookingPolicy, buildCatalogBookingItem, buildCatalogBookingPayload } = require("../server/services/booking/catalogBookingPolicy");

function db(row, capture = {}) {
  return { query: async (sql, params) => {
    capture.sql = sql; capture.params = params;
    return { rows: row ? [row] : [] };
  } };
}
const base = { item_id: 41, item_name: "TEST Cassette Care", booking_mode: "bookable",
  booking_flow_policy: "scheduled_and_urgent", booking_job_type: "wash", booking_ac_type: "cassette",
  booking_btu: 24000, booking_wash_variant: "", base_price: "850.00",
  is_active: true, is_customer_visible: true };
const request = { catalogItemId: 41, bookingMode: "urgent", jobType: "wash", acType: "cassette", btu: 24000, washVariant: "", machineCount: 1 };

test("authoritative catalog policy permits a generic non-wall urgent selection", async () => {
  const capture = {};
  const value = await resolveCatalogBookingPolicy(db(base, capture), request, { identity: "customer", lock: true });
  assert.equal(value.booking_flow_policy, "scheduled_and_urgent");
  assert.equal(value.pricing.exact_total, "850.00");
  assert.match(capture.sql, /ci\.job_category AS booking_job_type/);
  assert.match(capture.sql, /FOR SHARE OF ci/);
});

test("catalog policy rejects forged taxonomy and fail-closed urgent mode", async () => {
  await assert.rejects(resolveCatalogBookingPolicy(db(base), { ...request, acType: "wall" }, { identity: "customer" }), /CATALOG_SELECTION_MISMATCH/);
  await assert.rejects(resolveCatalogBookingPolicy(db({ ...base, booking_flow_policy: null }), request, { identity: "customer" }), /CATALOG_FLOW_NOT_ALLOWED/);
});

test("selected catalog parent owns its linked active campaign price and exact quantity total", async () => {
  const row = { ...base, price_rule_id: 77, rule_is_active: true, rule_job_type: "wash", rule_ac_type: "cassette",
    rule_wash_variant: "", rule_btu_min: 18000, rule_btu_max: null, rule_machine_min: 2, rule_machine_max: 5,
    rule_normal_price: "950.00", rule_active_price: "699.00", rule_label: "TEST campaign",
    rule_campaign_name: "TEST selected parent", rule_effective_from: "2026-08-08T00:00:00+07:00",
    rule_effective_to: "2026-08-10T23:59:59+07:00" };
  const value = await resolveCatalogBookingPolicy(db(row), { ...request, machineCount: 2 }, {
    identity: "customer", now: () => new Date("2026-08-09T12:00:00+07:00"),
  });
  assert.deepEqual(value.pricing, {
    unit_price: "699.00", exact_total: "1398.00", normal_unit_price: "950.00", price_rule_id: 77,
    price_label: "TEST campaign", campaign_name: "TEST selected parent", source: "catalog_price_rule",
  });
  assert.deepEqual(buildCatalogBookingItem(value), {
    item_id: null, item_name: "TEST Cassette Care", qty: 2, unit_price: "699.00", line_total: "1398.00",
    is_service: true, customer_price_rule_id: 77, normal_unit_price: "950.00",
    customer_price_label: "TEST campaign", customer_campaign_name: "TEST selected parent",
    customer_price_source: "catalog_price_rule",
  });
  assert.deepEqual(buildCatalogBookingPayload(value), {
    job_type: "wash", ac_type: "cassette", btu: 24000, machine_count: 2,
    wash_variant: "", repair_variant: "", admin_override_duration_min: 0,
  });
});

test("inactive, out-of-window, or taxonomy-mismatched linked campaign falls back to selected parent base price", async () => {
  const linked = { ...base, price_rule_id: 88, rule_is_active: true, rule_job_type: "repair", rule_ac_type: "cassette",
    rule_active_price: "1.00", rule_normal_price: "999.00", rule_effective_from: "2026-08-08T00:00:00+07:00",
    rule_effective_to: "2026-08-10T23:59:59+07:00" };
  const value = await resolveCatalogBookingPolicy(db(linked), { ...request, machineCount: 3 }, {
    identity: "customer", now: () => new Date("2026-08-09T12:00:00+07:00"),
  });
  assert.equal(value.pricing.source, "catalog_base_price");
  assert.equal(value.pricing.price_rule_id, null);
  assert.equal(value.pricing.exact_total, "2550.00");
});

test("catalog quote fails closed when neither selected campaign nor parent has a positive exact price", async () => {
  await assert.rejects(resolveCatalogBookingPolicy(db({ ...base, base_price: "0.00" }), request, { identity: "customer" }), /CATALOG_PRICE_UNAVAILABLE/);
  await assert.rejects(resolveCatalogBookingPolicy(db(base), { ...request, machineCount: 1.5 }, { identity: "customer" }), /CATALOG_SELECTION_MISMATCH/);
});
