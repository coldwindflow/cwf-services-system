"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const migrationName = "20260809_store_service_package_bundles.sql";
const migrationPath = `migrations/${migrationName}`;
const rollbackPath = "migrations/rollback/20260809_store_service_package_bundles.sql";
const sql = fs.readFileSync(migrationPath, "utf8");
const runner = require("../scripts/run-store-service-package-bundles-migration");
const rollback = fs.readFileSync(rollbackPath, "utf8");
const approvals = fs.readFileSync("migrations/.deploy-approved.tsv", "utf8");
const catalogRoutes = require("../server/routes/catalog/items");
const packageRepository = require("../server/services/packages/servicePackageRepository");

test("bundle migration links variants to Store parent through additive schema", () => {
  const executableSql = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  const flattenedSql = executableSql.replace(/\n/g, " ");
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
  assert.match(sql, /booking_request_fingerprint CHAR\(64\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_admin_request_key/);
  assert.doesNotMatch(executableSql, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
  assert.doesNotMatch(executableSql, /DROP\s+CONSTRAINT|booking_mode_check/i);
  assert.doesNotMatch(flattenedSql, /(^|[;\s])(BEGIN|COMMIT|ROLLBACK)([\s;]|$)/i);
});

test("deploy catalog approves only forward expand migrations by exact SHA", () => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(migrationPath)).digest("hex");
  // Issue 310 adds a second expand migration. The manifest still pins every
  // approved file by exact content hash, in application order - an entry whose
  // SHA drifts (i.e. the file was edited after approval) fails here.
  const minimumName = "20260820_service_package_minimum_total_quantity.sql";
  const minimumHash = crypto.createHash("sha256").update(fs.readFileSync(`migrations/${minimumName}`)).digest("hex");
  const entries = approvals.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(entries, [
    `${hash}\t${migrationName}\texpand`,
    `${minimumHash}\t${minimumName}\texpand`,
  ]);
  // every approved lane is expand-only; nothing may be approved as contract/destructive
  for (const entry of entries) assert.match(entry, /\texpand$/);
  const rootRollbackFiles = fs.readdirSync("migrations", { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.rollback\.sql$/i.test(entry.name));
  assert.deepEqual(rootRollbackFiles, []);
  assert.equal(fs.existsSync("migrations/20260809_store_service_package_bundles.rollback.sql"), false);
});

test("bundle discriminator stays fail-closed in storage and virtual at API boundaries", async () => {
  const serviceSource = fs.readFileSync("server/services/packages/storeServicePackageCatalogService.js", "utf8");
  assert.match(serviceSource, /VALUES \([\s\S]*'contact_admin'/);
  assert.doesNotMatch(serviceSource, /VALUES \([\s\S]*'service_package'/);

  const dto = catalogRoutes.serializeCatalogRow({
    item_id: 1, item_name: "TEST bundle", item_category: "service",
    booking_mode: "contact_admin", service_bundle_key: "test-bundle",
    service_package_variants: [], is_active: true, is_customer_visible: true,
    highlights: [], images: [],
  });
  assert.equal(dto.booking_mode, "service_package");
  assert.equal(dto.service_bundle_key, "test-bundle");

  let capturedSql = "";
  await packageRepository.findLinkedPackagesByKeys({ query: async (statement) => {
    capturedSql = statement;
    return { rows: [] };
  } }, ["test-package"]);
  assert.match(capturedSql, /CASE WHEN ci\.service_bundle_key IS NOT NULL THEN 'service_package'/);
});

test("migration runner is advisory locked, verified, and redacts credentials", () => {
  assert.equal(runner.MIGRATION_RELATIVE_PATH, "migrations/20260809_store_service_package_bundles.sql");
  assert.match(runner.safeErrorMessage(new Error("postgres://u:p@host/db password=oops")), /REDACTED_DATABASE_URL/);
  assert.doesNotMatch(runner.safeErrorMessage(new Error("password=oops")), /oops/);
  const source = fs.readFileSync("scripts/run-store-service-package-bundles-migration.js", "utf8");
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /schemaStatusIsCurrent\(await readSchemaStatus\(client\)\)[\s\S]*return;[\s\S]*query\("BEGIN"\)/);
  assert.match(source, /query\("BEGIN"\)[\s\S]*verifySchema[\s\S]*query\("COMMIT"\)/);
  assert.match(source, /query\("ROLLBACK"\)/);
});

test("pre-data rollback removes only the additive bundle schema", () => {
  assert.match(rollback, /DROP COLUMN IF EXISTS catalog_item_id/);
  assert.match(rollback, /DROP COLUMN IF EXISTS booking_flow_policy/);
  assert.match(rollback, /DROP COLUMN IF EXISTS promotion_theme_preset/);
  assert.match(rollback, /DROP COLUMN IF EXISTS admin_request_key/);
  assert.match(rollback, /DROP COLUMN IF EXISTS booking_request_fingerprint/);
  assert.match(rollback, /PRE-DATA ROLLBACK ONLY/);
  assert.doesNotMatch(rollback, /booking_mode_check/);
});
