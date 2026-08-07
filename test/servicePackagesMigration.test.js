"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "20260807_service_packages.sql"), "utf8");
const executable = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

test("service package migration is additive and repeatable", () => {
  assert.match(executable, /CREATE TABLE IF NOT EXISTS public\.service_packages/);
  assert.match(executable, /CREATE TABLE IF NOT EXISTS public\.service_package_tiers/);
  assert.equal((executable.match(/ADD COLUMN IF NOT EXISTS service_package/g) || []).length, 3);
  assert.doesNotMatch(executable, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
  assert.doesNotMatch(executable, /ALTER COLUMN[\s\S]*SET NOT NULL/i);
});

test("package constraints separate identity, price, sell, and redeem semantics", () => {
  assert.match(sql, /UNIQUE \(service_package_id, tier_key\)/);
  assert.match(sql, /fixed_total_price NUMERIC\(12,2\) NOT NULL/);
  assert.match(sql, /fixed_total_price > 0/);
  assert.match(sql, /sell_end_at >= sell_start_at/);
  assert.match(sql, /redeem_until >= sell_end_at/);
  assert.match(sql, /ON DELETE RESTRICT/g);
  assert.doesNotMatch(executable, /customer_service_price_rules|promotions?/i);
});

test("job_items package additions are nullable and preserve immutable snapshot data", () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS service_package_id BIGINT;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS service_package_tier_id BIGINT;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS service_package_snapshot JSONB;/);
  assert.match(sql, /FOREIGN KEY \(service_package_id, service_package_tier_id\)/);
  assert.match(sql, /Future pre-data rollback only/);
  assert.match(sql, /DO NOT execute after real package bookings/i);
});
