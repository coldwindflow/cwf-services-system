"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const prepaid = require("../server/services/prepaid/prepaidOrderServiceV2");
const { resolvePackageBooking } = require("../server/services/booking/servicePackageBooking");

test("scheduled prepaid booking token is deterministic and domain separated", () => {
  const key = "scheduled_request_123456789";
  const expected = crypto.createHash("sha256").update(`scheduled_v1:${key}`).digest("hex").slice(0, 24);
  assert.equal(prepaid.bookingTokenFromScheduledRequestKey(key), expected);
});

test("direct composite prepaid booking is rejected while redemption capability is delegated", async () => {
  const body = {
    catalog_item_id: 901,
    service_package_groups: [{ package_key: "air-reset-60-standard-small", btu: 12000, quantity: 1 }],
    scheduled_request_key: "scheduled_request_123456789",
  };
  const resolver = {
    resolveComposite: async () => ({ paymentMode: "prepaid_full" }),
    resolvePrepaidRedemption: async () => ({ ok: true }),
  };
  await assert.rejects(
    resolvePackageBooking({ body, bookingMode: "scheduled", appointmentDatetime: "2026-12-01T03:00:00.000Z", resolver }),
    { code: "PREPAID_REDEMPTION_REQUIRED" }
  );
  const redeemed = await resolvePackageBooking({
    body: { ...body, prepaid_redemption_token: "paid_right_token_123456789" },
    bookingMode: "scheduled",
    appointmentDatetime: "2026-12-01T03:00:00.000Z",
    resolver,
  });
  assert.equal(redeemed.ok, true);
});

test("prepaid resolver binds the verified right to transaction-local DB context", () => {
  const resolver = fs.readFileSync("server/services/packages/servicePackageResolver.js", "utf8");
  assert.match(resolver, /set_config\('cwf\.prepaid_entitlement_id',\$1,true\)/);
  assert.match(resolver, /set_config\('cwf\.prepaid_customer_sub',\$2,true\)/);
  assert.match(resolver, /set_config\('cwf\.prepaid_booking_token',\$3,true\)/);
  assert.match(resolver, /\[String\(entitlement\.entitlement_id\), String\(entitlement\.customer_sub\), bookingToken\]/);
});

test("migration consumes only transaction-bound paid entitlement and preserves job value", () => {
  const migration = fs.readFileSync("migrations/20260906_prepaid_service_entitlements.sql", "utf8");
  assert.match(migration, /current_setting\('cwf\.prepaid_entitlement_id', true\)/);
  assert.match(migration, /current_setting\('cwf\.prepaid_customer_sub', true\)/);
  assert.match(migration, /current_setting\('cwf\.prepaid_booking_token', true\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /ent\.customer_sub <> context_customer_sub/);
  assert.match(migration, /o\.order_kind = 'service_prepaid'/);
  assert.match(migration, /o\.status = 'paid'/);
  assert.match(migration, /NEW\.prepaid_entitlement_id := ent\.entitlement_id/);
  assert.match(migration, /NEW\.customer_sub := ent\.customer_sub/);
  assert.match(migration, /NEW\.booking_token := context_booking_token/);
  assert.match(migration, /NEW\.customer_due := 0\.00/);
  assert.match(migration, /NEW\.payment_status := 'paid'/);
  assert.match(migration, /NEW\.paid_at := prepaid_paid_at/);
  assert.doesNotMatch(migration, /NEW\.job_price\s*:=\s*0/);
  assert.match(migration, /PREPAID_REDEMPTION_CONCURRENT_CONFLICT/);
});

test("unfinished cancellation restores right but finished cancellation never does", () => {
  const migration = fs.readFileSync("migrations/20260906_prepaid_service_entitlements.sql", "utf8");
  assert.match(migration, /NEW\.canceled_at IS NOT NULL/);
  assert.match(migration, /NEW\.prepaid_entitlement_id IS NOT NULL/);
  assert.match(migration, /NEW\.finished_at IS NULL/);
  assert.match(migration, /CASE WHEN redeem_until < NOW\(\) THEN 'expired' ELSE 'active' END/);
});

test("release gate migrates entitlement schema before AIR RESET cutover in both environments", () => {
  const workflow = fs.readFileSync(".github/workflows/cwf-air-reset-seed-gate.yml", "utf8");
  const stagingMigration = workflow.indexOf("apply-prepaid-service-entitlements-home.sh staging");
  const stagingCutover = workflow.indexOf("apply-air-reset-60-seed.sh staging");
  const productionMigration = workflow.indexOf("apply-prepaid-service-entitlements-home.sh production");
  const productionCutover = workflow.indexOf("apply-air-reset-60-seed.sh production");
  assert.ok(stagingMigration >= 0 && stagingCutover > stagingMigration);
  assert.ok(productionMigration >= 0 && productionCutover > productionMigration);
});

test("migration advisory lock and SQL execute in the same psql session", () => {
  const script = fs.readFileSync("scripts/apply-prepaid-service-entitlements-home.sh", "utf8");
  assert.match(script, /printf 'SELECT pg_advisory_lock\(%s::bigint\);\\n' "\$LOCK_KEY"[\s\S]*cat "\$MIGRATION_PATH"[\s\S]*printf '\\nSELECT pg_advisory_unlock\(%s::bigint\);\\n' "\$LOCK_KEY"[\s\S]*\| docker_cmd exec -i/);
  assert.doesNotMatch(script, /trap .*pg_advisory_unlock/);
});

test("customer redemption carries both one-time token and stable scheduled request key", () => {
  const prepaidUi = fs.readFileSync("customer-app/modules/prepaid.js", "utf8");
  const scheduledUi = fs.readFileSync("customer-app/modules/bookingScheduled.js", "utf8");
  assert.match(prepaidUi, /prepaid_redemption_token: r\.prepaid_redemption_token/);
  assert.match(prepaidUi, /scheduled_request_key: r\.scheduled_request_key/);
  assert.match(prepaidUi, /prepaid_redemption_token: token/);
  assert.match(scheduledUi, /scheduled_request_key: ensureScheduledRequestKey\(\)/);
});
