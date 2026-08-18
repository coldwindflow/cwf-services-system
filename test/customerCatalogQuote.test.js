"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createCustomerCatalogQuoteService } = require("../server/services/booking/customerCatalogQuote");

test("ordinary Store quote uses the catalog policy and returns a customer-safe exact DTO", async () => {
  const pool = { async query() { return { rows: [{
    item_id: 9, item_name: "TEST campaign", booking_mode: "bookable", booking_flow_policy: "scheduled_only",
    booking_job_type: "wash", booking_ac_type: "wall", booking_btu: 12000, booking_wash_variant: "normal",
    base_price: "699.00", is_active: true, is_customer_visible: true,
  }] }; } };
  const service = createCustomerCatalogQuoteService({ pool, createServicePackageResolver: () => ({}), computeDurationMinMulti: () => 45 });
  const quote = await service.quote({ catalog_item_id: 9, booking_mode: "scheduled", job_type: "wash",
    ac_type: "wall", btu: 12000, wash_variant: "normal", machine_count: 2 });
  assert.equal(quote.fixed_total_price, "1398.00");
  assert.equal(typeof quote.fixed_total_price, "string");
  assert.equal(quote.catalog_item_id, 9);
  assert.equal(quote.duration_minutes, 45);
  assert.doesNotMatch(JSON.stringify(quote), /job_id|package_id|tier_id|snapshot|token|address|maps/i);
});

test("composite quote strips internal ids and snapshots", async () => {
  const resolved = { bundleKey: "bundle", fixedTotal: "1399.50", durationMin: 90,
    payload: { machine_count: 2, service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }], services: [] },
    items: [{ snapshot: { package: { id: "secret", key: "small" }, tier: { id: "secret", key: "q2", name: "Two" }, quantity: 2, fixed_total_price: "1399.50" } }] };
  const service = createCustomerCatalogQuoteService({ pool: { query() {} },
    createServicePackageResolver: () => ({ resolveComposite: async () => resolved }), computeDurationMinMulti: () => 0 });
  const quote = await service.quote({ catalog_item_id: 9, service_package_groups: [{ package_key: "small", btu: 12000, quantity: 2 }] });
  assert.equal(quote.fixed_total_price, "1399.50");
  assert.doesNotMatch(JSON.stringify(quote), /"id"|snapshot|secret/);
});

test("Customer Store waits for server quotes, handles stale/error state, and never verifies a browser tier calculation", () => {
  const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
  assert.match(store, /await root\.api\.quoteCatalogBooking/);
  assert.match(store, /requestId !== bundleQuoteRequestId/);
  assert.match(store, /ไม่สามารถยืนยันราคาและสิทธิ์ได้ กรุณาลองใหม่/);
  assert.doesNotMatch(store, /verified:\s*true[\s\S]{0,160}composeBundleTiers/);
  assert.match(store, /catalogQuoteToCommerceDraft\(item, quote, scope\)/);
  assert.match(store, /ordinaryQuotesInFlight\.has\(requestKey\)/);
});
