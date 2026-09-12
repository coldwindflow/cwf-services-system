"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  createAdminPrepaidRedemptionService,
} = require("../server/services/prepaid/adminPrepaidRedemptionService");

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
  };
}

function fakePool() {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (/SELECT e\.entitlement_id/.test(sql) && /FOR UPDATE OF e, o/.test(sql)) {
        return { rows: [paidUnclaimedRow()] };
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

  const update = pool.calls.find((call) => /SET customer_sub=\$2/.test(call.sql) && /status='redeeming'/.test(call.sql));
  assert.ok(update, "entitlement must enter redeeming with a temporary internal owner");
  assert.equal(update.params[1], "admin-prepaid:77");
  assert.doesNotMatch(update.sql, /claim_token_hash\s*=\s*NULL/i, "claim token must survive a failed Admin attempt");
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
  assert.match(routes, /delete body\.promotion_id/);
  assert.match(routes, /delete body\.override_price/);
  assert.match(routes, /delete body\.override_duration_min/);
  assert.match(routes, /delete body\.items/);
  assert.match(routes, /delete body\.services/);
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
  assert.match(html, /href="\/admin-store-catalog\.html"[^>]*>แก้ไขโปรโมชั่น/);
  assert.match(html, /id="btnCreateOrder"/);
  assert.match(html, /id="btnBookRight"/);
  assert.match(js, /\/admin\/prepaid-orders\/quote/);
  assert.match(js, /\/admin\/prepaid-orders"/);
  assert.match(js, /\/confirm-payment/);
  assert.match(js, /\/admin\/prepaid-entitlements\/\$\{encodeURIComponent\(code\)\}\/book/);
  assert.match(js, /admin_request_key/);
  assert.match(js, /fixed_total_price/);
});
