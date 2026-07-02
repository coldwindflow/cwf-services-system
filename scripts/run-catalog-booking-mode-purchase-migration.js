"use strict";

// Applies migrations/20260702_catalog_booking_mode_purchase.sql, which widens
// the catalog_items.booking_mode CHECK constraint to allow 'purchase' (buy
// flow). Additive only — every existing row stays valid — so it cannot break
// the running app. Advisory-locked + verified (the constraint must include
// 'purchase' afterward).

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260702_catalog_booking_mode_purchase.sql";
const ADVISORY_LOCK_KEY = "202607020202";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeErrorMessage(error) {
  return clean(error && error.message ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]");
}

function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const migrationPath = path.resolve(root, MIGRATION_RELATIVE_PATH);
  const expected = path.resolve(root, "migrations", "20260702_catalog_booking_mode_purchase.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) {
    throw new Error("migration path rejected");
  }
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

function createClientConfig(env = process.env) {
  const databaseUrl = clean(env.DATABASE_URL);
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      options: "-c timezone=Asia/Bangkok",
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: clean(env.DB_HOST),
    port: Number(env.DB_PORT || 5432),
    user: clean(env.DB_USER),
    password: env.DB_PASSWORD,
    database: clean(env.DB_NAME),
    options: "-c timezone=Asia/Bangkok",
    ssl: { rejectUnauthorized: false },
  };
}

async function verifySchema(client) {
  const res = await client.query(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'catalog_items_booking_mode_check' LIMIT 1"
  );
  const def = res.rows?.[0]?.def || "";
  if (!def) throw new Error("catalog_items_booking_mode_check constraint missing after migration");
  if (!/purchase/.test(def)) throw new Error("catalog_items_booking_mode_check does not allow 'purchase' after migration");
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  const client = clientFactory(createClientConfig(env));
  const sql = readMigrationSql(repoRoot);
  let locked = false;

  logger.log("CATALOG_BOOKING_MODE_PURCHASE_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;
    await client.query(sql);
    await verifySchema(client);
    logger.log("CATALOG_BOOKING_MODE_PURCHASE_MIGRATION_OK");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function runCli(options = {}) {
  const logger = options.logger || console;
  try {
    await runMigration(options);
    return 0;
  } catch (error) {
    logger.error(`CATALOG_BOOKING_MODE_PURCHASE_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
    return 1;
  }
}

if (require.main === module) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  ADVISORY_LOCK_KEY,
  MIGRATION_RELATIVE_PATH,
  createClientConfig,
  readMigrationSql,
  resolveMigrationPath,
  runCli,
  runMigration,
  safeErrorMessage,
  verifySchema,
};
