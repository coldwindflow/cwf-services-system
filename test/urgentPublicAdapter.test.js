const test = require("node:test");
const assert = require("node:assert/strict");

const urgentPublicAdapter = require("../server/services/urgentPublicAdapter");

test("sanitizeCustomerUrgentBody drops admin-only fields and keeps customer-safe ones", () => {
  const out = urgentPublicAdapter.sanitizeCustomerUrgentBody({
    customer_name: "  Somchai  ",
    customer_phone: "0812345678",
    address_text: "123 Test Rd",
    maps_url: "https://maps.app.goo.gl/x",
    appointment_datetime: "2026-08-01T13:45:00+07:00",
    allow_time_proposal: false,
    gps_latitude: 13.7563,
    gps_longitude: 100.5018,
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
    "appointment_datetime", "allow_time_proposal", "gps_latitude", "gps_longitude",
    "repair_variant", "services", "urgent_request_key", "wash_variant",
  ].sort());
  assert.equal(out.appointment_datetime, "2026-08-01T13:45:00+07:00");
  assert.equal(out.allow_time_proposal, false);
  assert.equal(out.gps_latitude, 13.7563);
  assert.equal(out.gps_longitude, 100.5018);
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

test("customer urgent appointment is normalized as an explicit Asia/Bangkok wall-clock time", () => {
  assert.equal(
    urgentPublicAdapter.normalizeCustomerUrgentAppointment("2026-08-01T13:45"),
    "2026-08-01T13:45:00+07:00"
  );
  assert.equal(
    urgentPublicAdapter.normalizeCustomerUrgentAppointment("2026-08-01T13:45:00+07:00"),
    "2026-08-01T13:45:00+07:00"
  );
  for (const invalid of [
    "",
    "2026-02-30T10:00",
    "2026-08-01T25:00",
    "2026-08-01T13:45:00Z",
    "not-a-date",
  ]) {
    assert.equal(urgentPublicAdapter.normalizeCustomerUrgentAppointment(invalid), null, invalid);
  }
});

test("customer urgent appointment rejects a past Bangkok time", () => {
  const now = { ymd: "2026-08-01", hour: 13, minute: 45 };
  assert.equal(urgentPublicAdapter.isCustomerUrgentAppointmentPast("2026-08-01T13:44:00+07:00", now), true);
  assert.equal(urgentPublicAdapter.isCustomerUrgentAppointmentPast("2026-08-01T13:45:00+07:00", now), true);
  assert.equal(urgentPublicAdapter.isCustomerUrgentAppointmentPast("2026-08-01T13:46:00+07:00", now), false);
});

test("customer urgent GPS must be a complete valid non-zero pair", () => {
  assert.deepEqual(
    urgentPublicAdapter.validateCustomerUrgentGps(13.7563, 100.5018),
    { ok: true, latitude: 13.7563, longitude: 100.5018 }
  );
  assert.deepEqual(urgentPublicAdapter.validateCustomerUrgentGps("", ""), { ok: true, latitude: null, longitude: null });
  for (const pair of [
    [13.7, ""],
    ["", 100.5],
    ["abc", 100.5],
    [Number.NaN, 100.5],
    [91, 100.5],
    [13.7, 181],
    [0, 0],
  ]) {
    assert.equal(urgentPublicAdapter.validateCustomerUrgentGps(pair[0], pair[1]).ok, false, String(pair));
  }
});

test("deriveUrgentBookingToken is deterministic for the same request key", () => {
  const a = urgentPublicAdapter.deriveUrgentBookingToken("same-key-123");
  const b = urgentPublicAdapter.deriveUrgentBookingToken("same-key-123");
  assert.equal(a, b);
  assert.equal(typeof a, "string");
  assert.equal(a.length, 24);
});

test("deriveUrgentBookingToken differs for different request keys", () => {
  const a = urgentPublicAdapter.deriveUrgentBookingToken("key-one");
  const b = urgentPublicAdapter.deriveUrgentBookingToken("key-two");
  assert.notEqual(a, b);
});

test("deriveUrgentBookingToken returns null for an empty or missing key", () => {
  assert.equal(urgentPublicAdapter.deriveUrgentBookingToken(""), null);
  assert.equal(urgentPublicAdapter.deriveUrgentBookingToken(undefined), null);
  assert.equal(urgentPublicAdapter.deriveUrgentBookingToken(null), null);
});

test("deriveUrgentBookingToken trims whitespace before hashing", () => {
  const a = urgentPublicAdapter.deriveUrgentBookingToken("  padded-key  ");
  const b = urgentPublicAdapter.deriveUrgentBookingToken("padded-key");
  assert.equal(a, b);
});
