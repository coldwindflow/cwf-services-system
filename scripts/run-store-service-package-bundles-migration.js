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
async function verifySchema(client) {
  const result = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_packages' AND column_name='catalog_item_id') AS linked,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='service_bundle_key') AS parent_key,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_packages_catalog_item_fk') AS parent_fk,
      COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='catalog_items_booking_mode_check' LIMIT 1),'') AS booking_mode_def
  `);
  const row = result.rows[0] || {};
  if (!row.linked || !row.parent_key || !row.parent_fk || !/service_package/.test(row.booking_mode_def)) throw new Error("store service-package bundle schema verification failed");
}
async function runMigration({ env = process.env, logger = console, clientFactory = (config) => new Client(config), repoRoot } = {}) {
  const client = clientFactory(createClientConfig(env)); let locked = false;
  logger.log("STORE_SERVICE_PACKAGE_BUNDLES_MIGRATION_START");
  try {
    await client.connect(); await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]); locked = true;
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
module.exports = { MIGRATION_RELATIVE_PATH, ADVISORY_LOCK_KEY, safeErrorMessage, resolveMigrationPath, createClientConfig, verifySchema, runMigration, runCli };
