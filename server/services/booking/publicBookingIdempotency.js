"use strict";

const { requestFingerprint } = require("./adminBookingIdempotency");

function fingerprint(body) {
  // Keep the stored format unchanged so the previous release can still replay
  // bookings created by this release after an application-only rollback.
  return requestFingerprint(body);
}

function matches(stored, body) {
  // Keep retries of existing records valid. Previously the informational client
  // label was hashed too; ordinary Customer App requests used this fixed label.
  const { client_app: _label, ...material } = body || {};
  return stored === fingerprint(body)
    || stored === requestFingerprint(material)
    || stored === requestFingerprint({ ...body, client_app: "customer_app_v2" });
}

module.exports = { fingerprint, matches };
