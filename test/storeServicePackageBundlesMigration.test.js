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
  assert.match(sql, /promotion_theme_preset TEXT NOT NULL DEFAULT 'default'/);
  assert.match(sql, /promotion_effect_preset TEXT NOT NULL DEFAULT 'none'/);
  assert.match(sql, /booking_flow_policy TEXT NOT NULL DEFAULT 'scheduled_only'/);
  assert.match(sql, /scheduled_and_urgent/);
  assert.match(sql, /admin_request_key VARCHAR\(128\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_admin_request_key/);
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
  assert.match(rollback, /DROP COLUMN IF EXISTS booking_flow_policy/);
  assert.match(rollback, /DROP COLUMN IF EXISTS promotion_theme_preset/);
  assert.match(rollback, /DROP COLUMN IF EXISTS admin_request_key/);
  assert.match(rollback, /CHECK \(booking_mode IN \('bookable', 'contact_admin', 'purchase'\)\)/);
  assert.match(rollback, /PRE-DATA ROLLBACK ONLY/);
});
