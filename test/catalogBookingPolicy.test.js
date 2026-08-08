"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCatalogBookingPolicy } = require("../server/services/booking/catalogBookingPolicy");

function db(row) { return { query: async () => ({ rows: row ? [row] : [] }) }; }
const base = { item_id: 41, item_name: "TEST Cassette Care", booking_mode: "bookable",
  booking_flow_policy: "scheduled_and_urgent", booking_job_type: "wash", booking_ac_type: "cassette",
  booking_btu: 24000, booking_wash_variant: "", is_active: true, is_customer_visible: true };
const request = { catalogItemId: 41, bookingMode: "urgent", jobType: "wash", acType: "cassette", btu: 24000, washVariant: "" };

test("authoritative catalog policy permits a generic non-wall urgent selection", async () => {
  const value = await resolveCatalogBookingPolicy(db(base), request, { identity: "customer", lock: true });
  assert.equal(value.booking_flow_policy, "scheduled_and_urgent");
});

test("catalog policy rejects forged taxonomy and fail-closed urgent mode", async () => {
  await assert.rejects(resolveCatalogBookingPolicy(db(base), { ...request, acType: "wall" }, { identity: "customer" }), /CATALOG_SELECTION_MISMATCH/);
  await assert.rejects(resolveCatalogBookingPolicy(db({ ...base, booking_flow_policy: null }), request, { identity: "customer" }), /CATALOG_FLOW_NOT_ALLOWED/);
});
