"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprint, matches } = require("../server/services/booking/publicBookingIdempotency");
const { requestFingerprint } = require("../server/services/booking/adminBookingIdempotency");
const booking = { scheduled_request_key: "same-request", appointment_datetime: "2026-12-01T09:00:00+07:00",
  customer_phone: "0800000001", address_text: "QA", services: [{ btu: 12000, machine_count: 2 }] };

test("public retry ignores client labels, while material changes remain conflicts", () => {
  const stored = fingerprint(booking);
  for (const client_app of [undefined, "customer_app_v2", "forged"]) {
    assert.equal(matches(stored, { ...booking, client_app }), true);
    for (const patch of [{ customer_phone: "0800000002" }, { address_text: "Elsewhere" },
      { appointment_datetime: "2026-12-02T09:00:00+07:00" }, { services: [{ btu: 18000, machine_count: 2 }] }]) {
      assert.equal(matches(stored, { ...booking, client_app, ...patch }), false);
    }
  }
});

test("pre-change customer and legacy fingerprints remain replayable without updating historical rows", () => {
  for (const original of [booking, { ...booking, client_app: "customer_app_v2" }, { ...booking, client_app: "legacy-custom" }]) {
    assert.equal(fingerprint(original), requestFingerprint(original), "rollback must understand newly stored fingerprints");
    assert.equal(matches(requestFingerprint(original), original), true);
    assert.equal(matches(requestFingerprint(original), { ...original, customer_phone: "0800000002" }), false);
  }
  assert.equal(matches(requestFingerprint({ ...booking, client_app: "customer_app_v2" }), booking), true);
});
