"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const path = "migrations/20260905_promotion_engine_policy_fields.sql";
const sql = fs.readFileSync(path, "utf8");
const executable = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

test("Issue #329 promotion migration is compatible with deployctl-owned transactions", () => {
  assert.doesNotMatch(executable, /\b(?:BEGIN|COMMIT|ROLLBACK)\b/i);
  assert.doesNotMatch(executable, /\bDO\s+\$\$/i);
  assert.doesNotMatch(executable, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN|DROP CONSTRAINT)\b/i);
  assert.match(executable, /ADD CONSTRAINT catalog_items_service_package_pricing_strategy_chk/);
  assert.match(executable, /ADD CONSTRAINT catalog_items_service_package_selection_mode_chk/);
  assert.match(executable, /ADD CONSTRAINT catalog_items_service_package_max_qty_chk/);
  assert.match(executable, /ADD CONSTRAINT catalog_items_service_package_payment_mode_chk/);
  assert.match(executable, /ADD CONSTRAINT catalog_items_service_package_warranty_days_chk/);
  assert.match(executable, /ADD CONSTRAINT service_packages_unit_price_modifier_chk/);
});
