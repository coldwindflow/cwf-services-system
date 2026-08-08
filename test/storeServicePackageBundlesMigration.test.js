"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sql = fs.readFileSync("migrations/20260809_store_service_package_bundles.sql", "utf8");
const runner = require("../scripts/run-store-service-package-bundles-migration");
const rollback = fs.readFileSync("migrations/20260809_store_service_package_bundles.rollback.sql", "utf8");

test("bundle migration links variants to Store parent and widens booking mode", () => {
  assert.match(sql, /service_package/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS catalog_item_id BIGINT/);
  assert.match(sql, /REFERENCES public\.catalog_items\(item_id\) ON DELETE RESTRICT/);
  assert.match(sql, /service_bundle_key TEXT/);
  assert.match(sql, /service_package_sell_start_at TIMESTAMPTZ/);
  assert.match(sql, /service_package_redeem_until TIMESTAMPTZ/);
  assert.doesNotMatch(sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n"), /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
});

test("migration runner is advisory locked, verified, and redacts credentials", () => {
  assert.equal(runner.MIGRATION_RELATIVE_PATH, "migrations/20260809_store_service_package_bundles.sql");
  assert.match(runner.safeErrorMessage(new Error("postgres://u:p@host/db password=oops")), /REDACTED_DATABASE_URL/);
  assert.doesNotMatch(runner.safeErrorMessage(new Error("password=oops")), /oops/);
  const source = fs.readFileSync("scripts/run-store-service-package-bundles-migration.js", "utf8");
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /query\("BEGIN"\)[\s\S]*verifySchema[\s\S]*query\("COMMIT"\)/);
  assert.match(source, /query\("ROLLBACK"\)/);
});

test("pre-data rollback restores the former booking-mode contract", () => {
  assert.match(rollback, /DROP COLUMN IF EXISTS catalog_item_id/);
  assert.match(rollback, /CHECK \(booking_mode IN \('bookable', 'contact_admin', 'purchase'\)\)/);
  assert.match(rollback, /PRE-DATA ROLLBACK ONLY/);
});
