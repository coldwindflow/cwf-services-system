"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ADMIN_STORE_BOOKING_AUTH,
  validateAdminStorePromotionRequest,
} = require("../server/services/booking/adminStorePromotionPolicy");
const { resolvePackageBooking } = require("../server/services/booking/servicePackageBooking");

function adminBundleBody() {
  return {
    catalog_item_id: "900",
    service_package_groups: [
      { package_key: "air-reset-60-standard-small", btu: 12000, quantity: 2 },
    ],
    admin_request_key: "admin_airreset_booking_123456",
    items: [],
    promotion_id: null,
    override_price: 0,
    override_duration_min: 0,
  };
}

function prepaidResolver(calls) {
  return {
    async resolveComposite(input) {
      calls.push(input);
      return {
        bundleId: "900",
        bundleKey: "air-reset-60-standard",
        paymentMode: "prepaid_full",
        fixedTotal: "959.00",
        durationMin: 120,
        payload: { machine_count: 2 },
        items: [],
      };
    },
  };
}

test("Admin composite Store booking accepts catalog_item_id and receives server-only authorization", () => {
  const body = adminBundleBody();
  const result = validateAdminStorePromotionRequest(body, { createdBySource: "admin" });
  assert.equal(result.kind, "service_package");
  assert.equal(body[ADMIN_STORE_BOOKING_AUTH], true);
  assert.equal(Object.keys(body).includes(String(ADMIN_STORE_BOOKING_AUTH)), false);
});

test("Admin can put a prepaid_full Store promotion directly on the schedule", async () => {
  const body = adminBundleBody();
  validateAdminStorePromotionRequest(body, { createdBySource: "admin" });
  const calls = [];
  const result = await resolvePackageBooking({
    body,
    bookingMode: "scheduled",
    appointmentDatetime: "2026-09-10T10:00:00+07:00",
    resolver: prepaidResolver(calls),
    // createBookingJob historically passes customer for composite groups; the
    // server-only authorization marker must safely upgrade only authenticated Admin.
    identity: "customer",
  });
  assert.equal(result.paymentMode, "prepaid_full");
  assert.equal(result.fixedTotal, "959.00");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].identity, "admin");
});

test("Customer cannot bypass prepaid redemption by sending the same Store payload", async () => {
  const body = adminBundleBody();
  delete body.admin_request_key;
  const calls = [];
  await assert.rejects(
    resolvePackageBooking({
      body,
      bookingMode: "scheduled",
      appointmentDatetime: "2026-09-10T10:00:00+07:00",
      resolver: prepaidResolver(calls),
      identity: "customer",
    }),
    (error) => error && error.code === "PREPAID_REDEMPTION_REQUIRED" && error.statusCode === 409
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].identity, "customer");
});

test("Client string properties cannot forge the Admin server-only Symbol authorization", async () => {
  const body = adminBundleBody();
  body.__cwf_admin_store_booking_authorized = true;
  delete body.admin_request_key;
  await assert.rejects(
    resolvePackageBooking({
      body,
      bookingMode: "scheduled",
      appointmentDatetime: "2026-09-10T10:00:00+07:00",
      resolver: prepaidResolver([]),
      identity: "customer",
    }),
    (error) => error && error.code === "PREPAID_REDEMPTION_REQUIRED"
  );
});