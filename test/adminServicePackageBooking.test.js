"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolvePackageBooking } = require("../server/services/booking/servicePackageBooking");

function selection() {
  const value = {
    package: { id: "41", key: "server-package", name: "Server package" },
    tier: { id: "73", key: "two", name: "Two" },
    service_lines: [{ service_key: "svc", service_name: "Server service", quantity: 2,
      unit_duration_minutes: 45, service_constraints: { job_type: "wash", ac_type: "wall",
        wash_variant: "premium", btu_min: null, btu_max: 12000 } }],
    fixed_total_price: "1399.50", redeem_until: "2026-12-31T23:59:59.000Z",
  };
  value.snapshot = structuredClone(value);
  return value;
}

test("Admin package resolution uses admin identity and ignores client authority fields", async () => {
  let identity;
  const result = await resolvePackageBooking({
    body: { service_package_key: "server-package", service_package_tier_key: "two", btu: 12000,
      price: 1, machine_count: 99, duration_min: 1, job_type: "repair" },
    bookingMode: "scheduled", appointmentDatetime: "2026-12-01T09:00:00+07:00",
    identity: "admin",
    resolver: { async resolveSelection(_request, options) { identity = options.identity; return selection(); } },
  });
  assert.equal(identity, "admin");
  assert.equal(result.fixedTotal, "1399.50");
  assert.equal(result.durationMin, 90);
  assert.equal(result.payload.machine_count, 2);
  assert.equal(result.payload.job_type, "wash");
});

test("Admin package rejects missing BTU, ordinary lines, extras, promotion, and redeem overflow", async () => {
  const resolver = { async resolveSelection() { return selection(); } };
  const base = { service_package_key: "server-package", service_package_tier_key: "two", btu: 12000 };
  await assert.rejects(resolvePackageBooking({ body: { ...base, btu: "" }, bookingMode: "scheduled",
    appointmentDatetime: "2026-12-01T09:00:00+07:00", resolver, identity: "admin" }), { code: "PACKAGE_BTU_MISMATCH" });
  for (const mixed of [{ services: [{ job_type: "wash" }] }, { items: [{ item_id: 1, qty: 1 }] }]) {
    await assert.rejects(resolvePackageBooking({ body: { ...base, ...mixed }, bookingMode: "scheduled",
      appointmentDatetime: "2026-12-01T09:00:00+07:00", resolver, identity: "admin" }), { code: "PACKAGE_MIXING_UNSUPPORTED" });
  }
  await assert.rejects(resolvePackageBooking({ body: base, bookingMode: "scheduled",
    appointmentDatetime: "2027-01-01T09:00:00+07:00", resolver, identity: "admin" }), { code: "PACKAGE_REDEEM_WINDOW_EXCEEDED" });

  const source = fs.readFileSync(path.join(__dirname, "../server/services/booking/createBookingJob.js"), "utf8");
  const admin = source.slice(source.indexOf("async function handleAdminBookV2"), source.indexOf("async function handleAdminServicePackageList"));
  assert.match(admin, /PACKAGE_PROMOTION_UNSUPPORTED/);
  assert.match(admin, /service_package_snapshot/);
  assert.match(admin, /resolvePackageBooking[\s\S]*createServicePackageResolver\(client\)[\s\S]*identity: "admin"/);
  assert.match(admin, /ROLLBACK/);
  assert.match(admin, /if \(hasPackageRequest\)[\s\S]*json\(\{ error: code, code \}\)/);
});

test("Admin package UI sends stable keys and canonical availability inputs without ordinary mixing", () => {
  const js = fs.readFileSync(path.join(__dirname, "../admin-add-v2.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../admin-add-v2.html"), "utf8");
  assert.match(html, /id="service_package_key"/);
  assert.match(html, /id="service_package_btu"/);
  assert.match(js, /\/admin\/service-packages\/preview/);
  assert.match(js, /payload\.service_package_key/);
  assert.match(js, /delete payload\.services/);
  assert.match(js, /payload\.promotion_id = null/);
  assert.match(js, /Selected date is after the package redemption deadline/);
});
