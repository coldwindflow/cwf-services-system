"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const idem = require("../server/services/booking/adminBookingIdempotency");

test("Admin request fingerprint is bounded, stable and changes with material package selection", () => {
  const key = "admin_test_request_123456";
  assert.equal(idem.validateAdminRequestKey(key), key);
  assert.equal(idem.requestFingerprint({ b: 2, a: 1, admin_request_key: key }), idem.requestFingerprint({ a: 1, b: 2 }));
  assert.notEqual(idem.requestFingerprint({ service_package_groups: [{ package_key: "a", quantity: 2 }] }),
    idem.requestFingerprint({ service_package_groups: [{ package_key: "a", quantity: 3 }] }));
  assert.match(idem.bookingToken(key), /^admin_[a-f0-9]{32}$/);
});
