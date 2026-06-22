const test = require("node:test");
const assert = require("node:assert/strict");

const urgentPublicAdapter = require("../server/services/urgentPublicAdapter");

test("sanitizeCustomerUrgentBody drops admin-only fields and keeps customer-safe ones", () => {
  const out = urgentPublicAdapter.sanitizeCustomerUrgentBody({
    customer_name: "  Somchai  ",
    customer_phone: "0812345678",
    address_text: "123 Test Rd",
    maps_url: "https://maps.app.goo.gl/x",
    job_zone: "north",
    customer_note: "leaking",
    job_type: "ล้าง",
    ac_type: "ผนัง",
    btu: "12000",
    machine_count: "2",
    wash_variant: "ล้างธรรมดา",
    repair_variant: "",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", btu: "9000", machine_count: "1" }],
    // admin-only / dangerous passthrough fields that MUST be dropped
    override_price: 1,
    override_duration_min: 999,
    promotion_id: 5,
    service_zone_code: "ZONE_OVERRIDE",
    technician_username: "tech1",
    team_members: ["tech1", "tech2"],
    job_id: 123,
    job_status: "เสร็จแล้ว",
  });

  assert.equal(out.customer_name, "Somchai");
  assert.equal(out.customer_phone, "0812345678");
  assert.equal(out.btu, 12000);
  assert.equal(out.machine_count, 2);
  assert.equal(out.client_app, "customer_app_v2");
  assert.deepEqual(Object.keys(out).sort(), [
    "ac_type", "address_text", "btu", "client_app", "customer_name", "customer_note",
    "customer_phone", "job_type", "job_zone", "machine_count", "maps_url",
    "repair_variant", "services", "urgent_request_key", "wash_variant",
  ].sort());
  assert.equal(out.service_zone_code, undefined);
  assert.equal(out.override_price, undefined);
  assert.equal(out.override_duration_min, undefined);
  assert.equal(out.promotion_id, undefined);
  assert.equal(out.technician_username, undefined);
  assert.equal(out.team_members, undefined);
  assert.equal(out.job_id, undefined);
  assert.equal(out.job_status, undefined);
});

test("sanitizeCustomerUrgentBody sanitizes nested service lines the same way", () => {
  const out = urgentPublicAdapter.sanitizeCustomerUrgentBody({
    services: [
      { job_type: "ล้าง", ac_type: "ผนัง", btu: "9000", machine_count: "3", service_zone_code: "X", override_price: 1 },
    ],
  });
  assert.equal(out.services.length, 1);
  assert.deepEqual(Object.keys(out.services[0]).sort(), ["ac_type", "btu", "job_type", "machine_count", "repair_variant", "wash_variant"].sort());
  assert.equal(out.services[0].machine_count, 3);
});

test("sanitizeCustomerUrgentBody caps services list at 10 entries", () => {
  const services = Array.from({ length: 15 }, () => ({ job_type: "ล้าง" }));
  const out = urgentPublicAdapter.sanitizeCustomerUrgentBody({ services });
  assert.equal(out.services.length, 10);
});

test("computeCustomerUrgentAppointmentIso rounds up to the next slot step within business hours", () => {
  const iso = urgentPublicAdapter.computeCustomerUrgentAppointmentIso({ ymd: "2026-06-22", hour: 10, minute: 5 });
  // 10:05 + 30min lead = 10:35, ceil to 30-step => 11:00
  assert.equal(iso, "2026-06-22T11:00:00+07:00");
});

test("computeCustomerUrgentAppointmentIso clamps to opening time when lead time lands before 09:00", () => {
  const iso = urgentPublicAdapter.computeCustomerUrgentAppointmentIso({ ymd: "2026-06-22", hour: 8, minute: 10 });
  assert.equal(iso, "2026-06-22T09:00:00+07:00");
});

test("computeCustomerUrgentAppointmentIso rolls over to next day's opening when lead time lands after 18:00", () => {
  const iso = urgentPublicAdapter.computeCustomerUrgentAppointmentIso({ ymd: "2026-06-22", hour: 17, minute: 45 });
  // 17:45 + 30min lead = 18:15, past UI_END_MIN(18:00) => roll to next day 09:00
  assert.equal(iso, "2026-06-23T09:00:00+07:00");
});

test("computeCustomerUrgentAppointmentIso rolls month/year boundaries correctly", () => {
  const iso = urgentPublicAdapter.computeCustomerUrgentAppointmentIso({ ymd: "2026-12-31", hour: 17, minute: 50 });
  assert.equal(iso, "2027-01-01T09:00:00+07:00");
});

test("UrgentIdempotencyStore caches a settled result and replays it for the same key", () => {
  const store = new urgentPublicAdapter.UrgentIdempotencyStore();
  assert.equal(store.getCached("key1"), null);
  const settle = store.beginInFlight("key1");
  assert.equal(store.getInFlight("key1") !== null, true);
  settle.resolve({ booking_code: "B1", token: "T1" });
  assert.equal(store.getInFlight("key1"), null);
  const cached = store.getCached("key1");
  assert.equal(cached.booking_code, "B1");
  assert.equal(cached.token, "T1");
});

test("UrgentIdempotencyStore exposes the in-flight promise so concurrent duplicates can await the same result", async () => {
  const store = new urgentPublicAdapter.UrgentIdempotencyStore();
  const settle = store.beginInFlight("key2");
  const inFlight = store.getInFlight("key2");
  assert.ok(inFlight);
  settle.resolve({ booking_code: "B2", token: "T2" });
  const result = await inFlight;
  assert.equal(result.booking_code, "B2");
});

test("UrgentIdempotencyStore does not cache a rejected in-flight request", async () => {
  const store = new urgentPublicAdapter.UrgentIdempotencyStore();
  const settle = store.beginInFlight("key3");
  const inFlight = store.getInFlight("key3");
  settle.reject(new Error("boom"));
  await assert.rejects(inFlight);
  assert.equal(store.getCached("key3"), null);
  assert.equal(store.getInFlight("key3"), null);
});

test("UrgentIdempotencyStore keeps different keys independent", () => {
  const store = new urgentPublicAdapter.UrgentIdempotencyStore();
  store.beginInFlight("a").resolve({ booking_code: "A" });
  assert.equal(store.getCached("a").booking_code, "A");
  assert.equal(store.getCached("b"), null);
});

test("UrgentIdempotencyStore prunes entries older than the TTL", () => {
  const store = new urgentPublicAdapter.UrgentIdempotencyStore(1);
  store.beginInFlight("old").resolve({ booking_code: "OLD" });
  assert.equal(store.getCached("old").booking_code, "OLD");
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(store.getCached("old"), null);
    resolve();
  }, 20));
});
