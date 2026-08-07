"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const scriptPath = path.join(root, "scripts", "run-production-service-package-migration.sh");
const source = fs.readFileSync(scriptPath, "utf8");

test("operator shell has valid Bash syntax", (t) => {
  const check = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  if (check.error?.code === "ENOENT") {
    t.skip("bash is unavailable on this platform");
    return;
  }
  assert.equal(check.status, 0, check.stderr);
});

test("operator hard-pins the approved revision and migration with no generic inputs", () => {
  assert.match(source, /readonly EXPECTED_PRODUCTION_REVISION="8093ad5db19c3da10642b248b47f74ae739272e6"/);
  assert.match(source, /readonly MIGRATION_PATH="migrations\/20260807_service_packages\.sql"/);
  assert.match(source, /\[\[ "\$#" -eq 0 \]\] \|\| die/);
  assert.doesNotMatch(source, /getopts|eval\b|MIGRATION_PATH="\$|EXPECTED_PRODUCTION_REVISION="\$/);
  assert.match(source, /cwf-deployctl production status/g);
  assert.match(source, /cwf-deployctl production list-backups/);
});

test("operator fails closed before DDL on revision, health, backup, Docker, and DB evidence", () => {
  const ddlPosition = source.indexOf("docker exec -i");
  assert.ok(ddlPosition > 0, "DDL execution must be explicit");
  for (const evidence of [
    "validate_production_status \"$pre_status\"",
    "backup listing was empty",
    "reported no usable backups",
    "recognizable backup evidence",
    "docker inspect",
    "Production database connectivity",
    "pre-migration job_items count",
  ]) {
    const position = source.indexOf(evidence);
    assert.ok(position >= 0 && position < ddlPosition, `${evidence} must gate DDL`);
  }
  assert.match(source, /set -Eeuo pipefail/);
  assert.match(source, /unhealthy\|degraded\|failed\|stopped\|exited/);
});

test("operator uses the running Production DB safely and stops psql errors", () => {
  assert.match(source, /readonly DB_CONTAINER="cwf-production-db"/);
  assert.match(source, /docker inspect -f '\{\{\.State\.Running\}\}'/);
  assert.match(source, /psql[^\n]*-v ON_ERROR_STOP=1/g);
  assert.doesNotMatch(source, /set -x|echo[^\n]*POSTGRES_PASSWORD|printf[^\n]*POSTGRES_PASSWORD/);
  assert.doesNotMatch(source, /docker exec[^\n]*POSTGRES_PASSWORD/);
});

test("operator proves all pre/post data and schema invariants", () => {
  assert.match(source, /job_items_before=.*count\(\*\) FROM public\.job_items/);
  assert.match(source, /job_items_after=.*count\(\*\) FROM public\.job_items/);
  assert.match(source, /job_items_after" == "\$job_items_before/);
  assert.match(source, /to_regclass\('public\.service_packages'\)/);
  assert.match(source, /to_regclass\('public\.service_package_tiers'\)/);
  assert.match(source, /service_package_snapshot/);
  assert.match(source, /is_nullable='YES'/);
  assert.match(source, /job_items_service_package_fk/);
  assert.match(source, /job_items_service_package_tier_fk/);
  assert.match(source, /service_package_tiers_service_package_id_fkey/);
  assert.match(source, /confdeltype='r'/);
  for (const index of [
    "idx_service_packages_customer_listing",
    "idx_service_package_tiers_lookup",
    "idx_job_items_service_package_id",
  ]) assert.match(source, new RegExp(index));
  assert.match(source, /service_packages remains unseeded/);
  assert.match(source, /service_package_tiers remains unseeded/);
});

test("operator performs only allowed post-run control-plane and HTTP reads", () => {
  assert.equal((source.match(/cwf-deployctl production status/g) || []).length, 2);
  assert.equal((source.match(/cwf-deployctl production list-backups/g) || []).length, 1);
  assert.match(source, /\/api\/version/);
  assert.match(source, /\/public\/service-packages/);
  assert.doesNotMatch(source, /curl[^\n]*(?:--request|-X)[^\n]*(?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(source, /cwf-deployctl production (?:deploy|restart|rollback|restore)\b/);
});

test("operator contains no seed DML or forbidden workflow contract", () => {
  assert.doesNotMatch(source, /\b(?:INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|MERGE\s+INTO|COPY\s+\S+\s+FROM)\b/i);
  assert.doesNotMatch(source, /\.github\/workflows|workflow_dispatch/);
  // Controller-owned follow-up contract: a future manual workflow should invoke
  // this exact no-argument script and must not accept arbitrary SQL or commands.
});
