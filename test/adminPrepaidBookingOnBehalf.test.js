"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  createAdminPrepaidRedemptionService,
} = require("../server/services/prepaid/adminPrepaidRedemptionService");
const { registerAdminBookingRoutes } = require("../server/routes/admin/adminBookings");

function paidUnclaimedRow() {
  return {
    entitlement_id: 77,
    entitlement_code: "CWF-RIGHT-ADMIN-77",
    status: "unclaimed",
    customer_sub: null,
    customer_name: "ลูกค้าทดสอบ",
    customer_phone: "0812345678",
    service_snapshot: {
      schema_version: 1,
      catalog_item_id: "901",
      fixed_total_price: "959.00",
      duration_min: 120,
      payment_mode: "prepaid_full",
      warranty_days: 60,
      redeem_until: "2027-01-31T16:59:59.999Z",
      service_package_groups: [{ package_key: "air-reset-60-standard-small", btu: 12000, quantity: 2 }],
      services: [{ job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 2, wash_variant: "standard" }],
      snapshots: [{ service_package_id: "11", service_package_tier_id: "22", service_package_snapshot: { schema_version: 3 } }],
    },
    redeem_until: "2027-01-31T16:59:59.999Z",
    warranty_days: 60,
    redeemed_job_id: null,
    order_id: 88,
    order_code: "CWF-ORDER-88",
    order_status: "paid",
    paid_at: "2026-09-12T10:00:00.000Z",
    address: "88 ถนนสุขุมวิท กรุงเทพฯ",
    prepaid_maps_url: "https://www.google.com/maps?q=13.7,100.5",
    prepaid_gps_latitude: 13.7,
    prepaid_gps_longitude: 100.5,
    note: "โทรก่อนเข้าบ้าน",
  };
}

function fakePool(overrides = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (/SELECT e\.entitlement_id/.test(sql) && /FOR UPDATE OF e, o/.test(sql)) {
        return { rows: [{ ...paidUnclaimedRow(), ...overrides }] };
      }
      if (/RETURNING entitlement_id/.test(sql)) return { rows: [{ entitlement_id: 77 }] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, async connect() { return client; } };
}

test("Admin can prepare a paid unclaimed right without destroying its claim token", async () => {
  const pool = fakePool();
  const service = createAdminPrepaidRedemptionService({
    pool,
    now: () => new Date("2026-09-12T12:00:00.000Z"),
  });
  const prepared = await service.prepareForAdminBooking("CWF-RIGHT-ADMIN-77");
  assert.equal(prepared.entitlement_code, "CWF-RIGHT-ADMIN-77");
  assert.equal(prepared.temporary_owner, true);
  assert.equal(prepared.previous_customer_sub, null);
  assert.equal(prepared.previous_status, "unclaimed");
  assert.match(prepared.prepaid_redemption_token, /^[A-Za-z0-9_-]+$/);
  assert.match(prepared.scheduled_request_key, /^adminprepaid_[A-Za-z0-9_-]+$/);
  assert.deepEqual(prepared.service_package_groups, [
    { package_key: "air-reset-60-standard-small", btu: 12000, quantity: 2 },
  ]);
  assert.equal(prepared.address_text, "88 ถนนสุขุมวิท กรุงเทพฯ");
  assert.equal(prepared.maps_url, "https://www.google.com/maps?q=13.7,100.5");
  assert.equal(prepared.gps_latitude, 13.7);
  assert.equal(prepared.gps_longitude, 100.5);
  assert.equal(prepared.customer_note, "โทรก่อนเข้าบ้าน");

  const update = pool.calls.find((call) => /SET customer_sub=\$2/.test(call.sql) && /status='redeeming'/.test(call.sql));
  assert.ok(update, "entitlement must enter redeeming with a temporary internal owner");
  assert.equal(update.params[1], "admin-prepaid:77");
  assert.doesNotMatch(update.sql, /claim_token_hash\s*=\s*NULL/i, "claim token must survive a failed Admin attempt");
});

test("Admin lookup shows the persisted Order location before scheduling", async () => {
  const service = createAdminPrepaidRedemptionService({ pool: fakePool() });
  const right = await service.getForAdmin("CWF-RIGHT-ADMIN-77");
  assert.equal(right.address_text, "88 ถนนสุขุมวิท กรุงเทพฯ");
  assert.equal(right.maps_url, "https://www.google.com/maps?q=13.7,100.5");
  assert.equal(right.gps_latitude, 13.7);
  assert.equal(right.gps_longitude, 100.5);
  assert.equal(right.note, "โทรก่อนเข้าบ้าน");
});

test("Admin cannot create a locationless Job from an incomplete paid Order", async () => {
  const pool = fakePool({ address: "" });
  const service = createAdminPrepaidRedemptionService({
    pool, now: () => new Date("2026-09-12T12:00:00.000Z"),
  });
  await assert.rejects(service.prepareForAdminBooking("CWF-RIGHT-ADMIN-77"),
    { code: "PREPAID_SERVICE_LOCATION_MISSING" });
  assert.equal(pool.calls.some((call) => /SET customer_sub=\$2/.test(call.sql)), false);
});

test("Admin booking sends the paid order location to the canonical Job writer, ignoring form tampering", async () => {
  const handlers = new Map();
  let jobPayload;
  const app = {
    use() {},
    get(path, _auth, handler) { handlers.set(`GET ${path}`, handler); },
    post(path, _auth, handler) { handlers.set(`POST ${path}`, handler); },
  };
  const row = paidUnclaimedRow();
  const prepaid = {
    async prepareForAdminBooking() {
      return {
        ...row,
        address_text: row.address,
        maps_url: row.prepaid_maps_url,
        gps_latitude: row.prepaid_gps_latitude,
        gps_longitude: row.prepaid_gps_longitude,
        customer_note: row.note,
        scheduled_request_key: "adminprepaid_test_key",
        prepaid_redemption_token: "test_redemption_token",
        service_package_groups: row.service_snapshot.service_package_groups,
      };
    },
    async releaseAdminPreparation() { throw new Error("must not release successful booking"); },
    async getForAdmin() { return null; },
  };
  registerAdminBookingRoutes(app, {
    service: {
      async handleAdminBookV2(req, res) { jobPayload = { ...req.body }; return res.json({ ok: true, job_id: 9 }); },
      handleInternalBookFromAi() {}, handleAdminCatalogBookingPreview() {},
      handleAdminServicePackageList() {}, handleAdminServicePackagePreview() {},
      handleAdminCatalogBookingPreview() {},
    },
    requireAdminSession(_req, _res, next) { next(); },
    requireInternalApiKeyOnly(_req, _res, next) { next(); },
    adminPrepaidRedemptionService: prepaid,
  });
  const req = { params: { code: row.entitlement_code }, body: {
    appointment_datetime: "2026-10-06T10:00:00+07:00",
    address_text: "wrong address", maps_url: "https://www.google.com/maps?q=1,1",
    gps_latitude: 1, gps_longitude: 1, customer_note: "wrong note",
  } };
  const res = { statusCode: 200, json(value) { this.body = value; return this; }, status(code) { this.statusCode = code; return this; } };
  await handlers.get("POST /admin/prepaid-entitlements/:code/book")(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(jobPayload.address_text, row.address);
  assert.equal(jobPayload.maps_url, row.prepaid_maps_url);
  assert.equal(jobPayload.gps_latitude, row.prepaid_gps_latitude);
  assert.equal(jobPayload.gps_longitude, row.prepaid_gps_longitude);
  assert.equal(jobPayload.customer_note, row.note);
  assert.equal(jobPayload.customer_name, row.customer_name);
  assert.equal(jobPayload.customer_phone, row.customer_phone);
});

test("Failed Admin booking preparation can restore the original unclaimed right", async () => {
  const pool = fakePool();
  const service = createAdminPrepaidRedemptionService({
    pool,
    now: () => new Date("2026-09-12T12:00:00.000Z"),
  });
  const prepared = await service.prepareForAdminBooking("CWF-RIGHT-ADMIN-77");
  const restored = await service.releaseAdminPreparation(prepared);
  assert.equal(restored, true);
  const release = pool.calls.find((call) => /redemption_request_key=\$2/.test(call.sql) && /RETURNING entitlement_id/.test(call.sql));
  assert.ok(release);
  assert.equal(release.params[2], null);
  assert.equal(release.params[3], "unclaimed");
});

test("Admin prepaid routes reuse canonical booking and strip mutable paid-contract fields", () => {
  const routes = fs.readFileSync("server/routes/admin/adminBookings.js", "utf8");
  assert.match(routes, /\/admin\/prepaid-entitlements\/:code\/book/);
  assert.match(routes, /prepareForAdminBooking/);
  assert.match(routes, /service\.handleAdminBookV2\(req, res\)/);
  assert.match(routes, /customer_name:\s*String\(preparation\.customer_name/);
  assert.match(routes, /customer_phone:\s*String\(preparation\.customer_phone/);
  assert.match(routes, /PREPAID_BLOCKED_BOOKING_FIELDS/);
  for (const field of ["promotion_id", "override_price", "override_duration_min", "items", "services", "service_lines"]) {
    assert.match(routes, new RegExp(`"${field}"`));
  }
  assert.match(routes, /sanitizePrepaidAdminBookingInput/);
  assert.doesNotMatch(routes, /\bdelete\b/i);
  assert.match(routes, /Number\(res\.statusCode \|\| 200\) >= 400[\s\S]*releaseIfNeeded/);
});

test("Admin sale uses server-authoritative prepaid quote and existing payment verification", () => {
  const routes = fs.readFileSync("server/routes/admin/storeServicePackageCatalog.js", "utf8");
  assert.match(routes, /\/admin\/prepaid-orders\/quote/);
  assert.match(routes, /quoteOrder\(req\.body \|\| \{\}, \{ identity: "admin" \}\)/);
  assert.match(routes, /\/admin\/prepaid-orders\/:code\/confirm-payment/);
  assert.match(routes, /confirmManualPayment/);
});

test("Admin PREPAID UI exposes sale, payment, booking and promotion editing", () => {
  const html = fs.readFileSync("admin-prepaid-v2.html", "utf8");
  const js = fs.readFileSync("admin-prepaid-v2.js", "utf8");
  const storeHtml = fs.readFileSync("admin-store-catalog.html", "utf8");
  assert.match(html, /href="\/admin-store-catalog\.html"[^>]*>แก้ไขโปรโมชั่น/);
  assert.match(storeHtml, /admin-prepaid-v2\.html/);
  assert.match(storeHtml, /PREPAID Admin/);
  assert.match(html, /id="btnCreateOrder"/);
  assert.match(html, /id="btnBookRight"/);
  assert.match(js, /\/admin\/prepaid-orders\/quote/);
  assert.match(js, /\/admin\/prepaid-orders"/);
  assert.match(js, /\/confirm-payment/);
  assert.match(js, /\/admin\/prepaid-entitlements\/\$\{encodeURIComponent\(code\)\}\/book/);
  assert.match(js, /admin_request_key/);
  assert.match(js, /fixed_total_price/);
});


test("Admin AIR CARE exposes only the two locked BTU pricing groups while generic prepaid keeps numeric BTU", () => {
  const js = fs.readFileSync("admin-prepaid-v2.js", "utf8");
  assert.match(js, /coldwindflow-air-care-standard/);
  assert.match(js, /coldwindflow-air-care-premium/);
  assert.match(js, /ไม่เกิน 12,000 BTU/);
  assert.match(js, /18,000 BTU ขึ้นไป/);
  assert.match(js, /data-air-care-btu-label/);
  assert.match(js, /data-btu type="hidden"/);
  assert.match(js, /<label>BTU จริง<\/label><input data-btu type="number"/);
  assert.match(js, /\/admin\/prepaid-orders\/quote/);
});
