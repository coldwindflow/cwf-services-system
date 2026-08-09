"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBookingTicket,
  loadBookingTicket,
  formatBookingTicket,
  normalizedPhone,
} = require("../server/services/booking/bookingTicket");
const { JOB_STATUS } = require("../server/services/booking/bookingStatuses");

test("ordinary booking ticket exposes the bounded safe server-confirmed DTO", () => {
  const ticket = buildBookingTicket({ job: { job_id: 91, booking_code: "CWF-TEST-91", booking_token: "secret-token",
    customer_name: "TEST Customer", customer_phone: "081-234-5678", appointment_datetime: "2026-08-10T09:00:00+07:00",
    job_price: "699", address_text: "secret address", maps_url: "https://maps.example/secret", booking_mode: "scheduled" }, items: [
      { item_name: "ล้างแอร์ผนัง 12000 BTU", qty: 1, is_service: true, item_id: 10 },
    ] });
  assert.deepEqual(Object.keys(ticket), [
    "heading", "booking_code", "customer_name", "customer_phone", "components",
    "total_machine_count", "appointment_datetime", "exact_total", "public_status",
  ]);
  assert.equal(ticket.customer_phone, "0812345678");
  assert.equal(ticket.exact_total, "699.00");
  assert.equal(ticket.total_machine_count, 1);
  const serialized = JSON.stringify(ticket);
  assert.doesNotMatch(serialized, /job_id|booking_token|address|maps|item_id|package_id|tier_id|snapshot|secret-token|secret address/);
  assert.match(formatBookingTicket(ticket), /ผู้ส่งยืนยันว่า LINE บัญชีนี้เป็นผู้ติดต่อ/);
});

test("composite mixed-variant ticket summarizes every persisted component without internal entitlement data", () => {
  const ticket = buildBookingTicket({ job: { job_id: 91, booking_code: "CWF-MIXED-91", booking_token: "secret-token",
    customer_name: "TEST Mixed", customer_phone: "081 234 5678", appointment_datetime: "2026-08-10T09:00:00+07:00",
    job_price: "5198.00", address_text: "secret address", booking_mode: "scheduled" }, items: [
      { item_name: "TEST Small • 12000 BTU • 4 เครื่อง", qty: 4, is_service: true, service_package_id: 22, service_package_tier_id: 31, service_package_snapshot: { secret: true } },
      { item_name: "TEST Small • 12000 BTU • 1 เครื่อง", qty: 1, is_service: true, service_package_id: 22, service_package_tier_id: 28, service_package_snapshot: { secret: true } },
      { item_name: "TEST Large • 18000 BTU • 2 เครื่อง", qty: 2, is_service: true, service_package_id: 23, service_package_tier_id: 35, service_package_snapshot: { secret: true } },
    ] });
  assert.equal(ticket.exact_total, "5198.00");
  assert.equal(ticket.total_machine_count, 7);
  assert.deepEqual(ticket.components.map((item) => item.quantity), [4, 1, 2]);
  const serialized = JSON.stringify(ticket);
  assert.doesNotMatch(serialized, /job_id|booking_token|address|maps|package_id|tier_id|snapshot|secret-token|secret address/);
});

test("persisted ordinary and urgent replay reconstruct equivalent ticket summaries", async () => {
  async function replayFor(job, items) {
    const db = {
      async query(sql) {
        if (/FROM public\.jobs/.test(sql)) return { rows: [job] };
        if (/FROM public\.job_items/.test(sql)) return { rows: items };
        throw new Error(`unexpected query: ${sql}`);
      },
    };
    return loadBookingTicket(db, job.job_id);
  }

  const items = [{ item_name: "TEST Service", qty: 2, is_service: true }];
  const scheduledJob = { job_id: 10, booking_code: "CWF-SCHEDULED", customer_name: "TEST Customer",
    customer_phone: "081-234-5678", appointment_datetime: "2026-08-10T09:00:00+07:00",
    job_price: "1399.00", booking_mode: "scheduled", job_status: JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW };
  const scheduledInitial = buildBookingTicket({ job: { ...scheduledJob, public_status: "รอแอดมินยืนยัน" }, items });
  assert.deepEqual(await replayFor(scheduledJob, items), scheduledInitial);

  const urgentJob = { ...scheduledJob, job_id: 11, booking_code: "CWF-URGENT", booking_mode: "urgent",
    job_status: JOB_STATUS.ADMIN_URGENT_WAITING };
  const urgentInitial = buildBookingTicket({ job: { ...urgentJob, public_status: "กำลังค้นหาช่าง" }, items });
  assert.deepEqual(await replayFor(urgentJob, items), urgentInitial);
});

test("phone and line normalization are deterministic and invalid appointments stay empty", () => {
  assert.equal(normalizedPhone(" +66 (81) 234-5678 "), "66812345678");
  const ticket = buildBookingTicket({ job: { booking_code: "CWF-SAFE", customer_name: "TEST\njob_id: 99", customer_phone: "081-234-5678",
    appointment_datetime: "not-a-date", job_price: "699.50" }, items: [{ item_name: "TEST", qty: 1 }] });
  assert.equal(ticket.customer_name, "TEST job_id: 99");
  assert.equal(ticket.appointment_datetime, "");
  assert.doesNotThrow(() => formatBookingTicket(ticket));
});

test("initial and replay tickets show exact net total after the persisted discount", async () => {
  const job = { job_id: 12, booking_code: "CWF-NET", customer_name: "TEST", customer_phone: "0812345678",
    appointment_datetime: "2026-08-10T09:00:00+07:00", job_price: "1399.50", applied_discount: "99.55",
    booking_mode: "scheduled", job_status: JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW };
  const items = [{ item_name: "TEST service", qty: 4, is_service: true }];
  assert.equal(buildBookingTicket({ job, items }).exact_total, "1299.95");
  const db = { async query(sql) {
    if (/FROM public\.jobs/.test(sql)) return { rows: [job] };
    if (/FROM public\.job_items/.test(sql)) return { rows: items };
    throw new Error("unexpected query");
  } };
  assert.equal((await loadBookingTicket(db, 12)).exact_total, "1299.95");
});
