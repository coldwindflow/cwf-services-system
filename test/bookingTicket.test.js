"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBookingTicket, formatBookingTicket } = require("../server/services/booking/bookingTicket");

test("booking ticket exposes only safe server-confirmed public fields", () => {
  const ticket = buildBookingTicket({ job: { job_id: 91, booking_code: "CWF-TEST-91", booking_token: "secret-token",
    customer_name: "TEST Customer", customer_phone: "0000000000", appointment_datetime: "2026-08-10T09:00:00+07:00",
    job_price: "5198.00", address_text: "secret address" }, items: [
      { item_name: "TEST Cassette Care", qty: 7, service_package_id: 22, service_package_snapshot: { secret: true } },
    ] });
  assert.equal(ticket.exact_total, "5198.00");
  assert.equal(ticket.total_machine_count, 7);
  const serialized = JSON.stringify(ticket);
  assert.doesNotMatch(serialized, /job_id|booking_token|address|package_id|snapshot|secret-token|secret address/);
  assert.match(formatBookingTicket(ticket), /ผู้ส่งยืนยันว่า LINE บัญชีนี้เป็นผู้ติดต่อ/);
});
