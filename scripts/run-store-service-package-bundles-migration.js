"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260809_store_service_package_bundles.sql";
const ADVISORY_LOCK_KEY = "202608090267";

function clean(value) { return String(value == null ? "" : value).trim(); }
function safeErrorMessage(error) {
  return clean(error?.message || error)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]");
}
function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const result = path.resolve(root, MIGRATION_RELATIVE_PATH);
  if (result !== path.resolve(root, "migrations", "20260809_store_service_package_bundles.sql") || !result.startsWith(`${root}${path.sep}`)) {
    throw new Error("migration path rejected");
  }
  return result;
}
function createClientConfig(env = process.env) {
  const url = clean(env.DATABASE_URL);
  if (url) return { connectionString: url, options: "-c timezone=Asia/Bangkok", ssl: env.CWF_E2E_TEST_MODE === "1" ? false : { rejectUnauthorized: false } };
  return { host: clean(env.DB_HOST), port: Number(env.DB_PORT || 5432), user: clean(env.DB_USER), password: env.DB_PASSWORD,
    database: clean(env.DB_NAME), options: "-c timezone=Asia/Bangkok", ssl: env.CWF_E2E_TEST_MODE === "1" ? false : { rejectUnauthorized: false } };
}
async function readSchemaStatus(client) {
  const result = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_packages' AND column_name='catalog_item_id') AS linked,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='service_bundle_key') AS parent_key,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='promotion_theme_preset') AS presentation,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='booking_flow_policy') AS flow_policy,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='admin_request_key') AS admin_request_key,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='booking_request_fingerprint') AS booking_request_fingerprint,
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_jobs_admin_request_key') AS admin_request_unique,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_packages_catalog_item_fk') AS parent_fk,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_promotion_theme_check') AS presentation_check,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_booking_flow_policy_check') AS flow_policy_check
  `);
  return result.rows[0] || {};
}
function schemaStatusIsCurrent(row) {
  return Boolean(row.linked && row.parent_key && row.presentation && row.flow_policy && row.admin_request_key
    && row.booking_request_fingerprint && row.admin_request_unique && row.parent_fk
    && row.presentation_check && row.flow_policy_check);
}
async function verifySchema(client) {
  if (!schemaStatusIsCurrent(await readSchemaStatus(client))) {
    throw new Error("store service-package bundle schema verification failed");
  }
}
async function runMigration({ env = process.env, logger = console, clientFactory = (config) => new Client(config), repoRoot } = {}) {
  const client = clientFactory(createClientConfig(env)); let locked = false;
  logger.log("STORE_SERVICE_PACKAGE_BUNDLES_MIGRATION_START");
  try {
    await client.connect(); await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]); locked = true;
    if (schemaStatusIsCurrent(await readSchemaStatus(client))) {
      logger.log("STORE_SERVICE_PACKAGE_BUNDLES_MIGRATION_OK");
      return;
    }
    await client.query("BEGIN");
    try {
      await client.query(fs.readFileSync(resolveMigrationPath(repoRoot), "utf8")); await verifySchema(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
    logger.log("STORE_SERVICE_PACKAGE_BUNDLES_MIGRATION_OK");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}
async function runCli(options = {}) {
  try { await runMigration(options); return 0; }
  catch (error) { (options.logger || console).error(`STORE_SERVICE_PACKAGE_BUNDLES_MIGRATION_FAILED: ${safeErrorMessage(error)}`); return 1; }
}
if (require.main === module) runCli().then((code) => { process.exitCode = code; });
module.exports = { MIGRATION_RELATIVE_PATH, ADVISORY_LOCK_KEY, safeErrorMessage, resolveMigrationPath, createClientConfig,
  readSchemaStatus, schemaStatusIsCurrent, verifySchema, runMigration, runCli };
