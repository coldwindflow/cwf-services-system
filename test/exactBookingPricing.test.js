"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcBookingPricing } = require("../server/services/booking/exactPricing");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const adminIdempotency = require("../server/services/booking/adminBookingIdempotency");

test("authoritative package line total is not recomputed from rounded unit price", () => {
  assert.deepEqual(calcBookingPricing([{ qty: 4, unit_price: "349.88", line_total: "1399.50" }]), {
    subtotal_exact: "1399.50", discount_exact: "0.00", total_exact: "1399.50",
    subtotal: 1399.5, discount: 0, total: 1399.5,
  });
});

test("percent and amount discounts stay in integer minor units and preserve textual scale", () => {
  assert.deepEqual(calcBookingPricing([{ qty: 1, line_total: "1399.50" }], {
    promo_type: "percent", promo_value: "10.00",
  }), {
    subtotal_exact: "1399.50", discount_exact: "139.95", total_exact: "1259.55",
    subtotal: 1399.5, discount: 139.95, total: 1259.55,
  });
  assert.equal(calcBookingPricing([{ qty: 4, unit_price: "349.88" }]).total_exact, "1399.52");
});

test("Admin HTTP idempotent replay returns the persisted two-decimal total as authoritative text", async () => {
  const body = {
    customer_name: "TEST Admin Customer", job_type: "ล้าง", appointment_datetime: "2026-08-20T10:00:00+07:00",
    address_text: "TEST address", booking_mode: "scheduled", admin_request_key: "admin_exact_139950_test",
  };
  const fingerprint = adminIdempotency.requestFingerprint(body);
  const service = createBookingJobService({
    pool: { async query() { return { rows: [{ job_id: 41, booking_code: "CWFTEST41", booking_mode: "scheduled",
      dispatch_mode: "normal", duration_min: 180, job_price: "1399.50", admin_request_fingerprint: fingerprint }] }; } },
    isServiceZoneFilterEnabled: () => false,
    resolveCustomerScheduledCapability: async () => ({ enabled: true, degraded: false }),
    normalizeAppointmentDatetime: (value) => value,
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await service.handleAdminBookV2({ body }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.replayed, true);
  assert.equal(response.body.total_exact, "1399.50");
  assert.equal(response.body.total, 1399.5);
  assert.equal(response.body.duration_min, 180);
});
