"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const seedPath = "data-seeds/20260906_air_reset_60_book_now.sql";
const oldMigrationPath = "migrations/20260906_air_reset_60_book_now_seed.sql";
const seed = fs.readFileSync(seedPath, "utf8");
const operator = fs.readFileSync("scripts/apply-air-reset-60-seed.sh", "utf8");
const workflow = fs.readFileSync(".github/workflows/cwf-air-reset-seed-gate.yml", "utf8");
const approvals = fs.readFileSync("migrations/.deploy-approved.tsv", "utf8");

test("AIR RESET data is not admitted to the schema-only expand migration lane", () => {
  assert.equal(fs.existsSync(oldMigrationPath), false);
  assert.doesNotMatch(approvals, /air_reset_60_book_now_seed/);
  assert.match(seed, /INSERT INTO public\.catalog_items/);
  assert.match(seed, /INSERT INTO public\.service_packages/);
  assert.match(seed, /INSERT INTO public\.service_package_tiers/);
  assert.doesNotMatch(seed, /\b(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
});

test("AIR RESET prepaid cutover pins seed and release, verifies schema and preserves advertised data", () => {
  const sha = crypto.createHash("sha256").update(seed).digest("hex");
  assert.equal(sha, "bc82b1bdf995284ec8a37393ed22161363e6d0aec840dc8df31bda8f43d8ae55");
  assert.match(operator, new RegExp(sha));
  assert.match(operator, /EXPECTED_RELEASE_SHA/);
  assert.match(operator, /cwf-deployctl.*status/);
  assert.match(operator, /verify_prepaid_schema/);
  assert.match(operator, /partial or unexpected AIR RESET data exists; refusing to overwrite it/);
  assert.match(operator, /service_package_payment_mode='"'"'prepaid_full'"'"'/);
  assert.match(operator, /booking_mode='"'"'service_package'"'"'/);
  assert.match(operator, /AIR_RESET_PREPAID_READY environment=%s parents=2 variants=4 tiers=16 payment_mode=prepaid_full/);
  assert.match(operator, /550\.00/);
  assert.match(operator, /959\.00/);
  assert.match(operator, /1490\.00/);
  assert.match(operator, /2690\.00/);
  assert.match(operator, /unit_price_modifier=100/);
  assert.match(operator, /unit_price_modifier=200/);
});

test("AIR RESET seed gate runs only after successful staging or production deployment", () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /CWF Home Staging/);
  assert.match(workflow, /CWF Home Production/);
  assert.match(workflow, /GIT_CONFIG_NOSYSTEM: "1"/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /staging\/home-server-test/);
  assert.match(workflow, /production\/home-server/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /EXPECTED_RELEASE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /apply-prepaid-service-entitlements-home\.sh staging[\s\S]*apply-air-reset-60-seed\.sh staging/);
  assert.match(workflow, /apply-prepaid-service-entitlements-home\.sh production[\s\S]*apply-air-reset-60-seed\.sh production/);
});
