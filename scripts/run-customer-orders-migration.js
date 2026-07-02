"use strict";

// Applies migrations/20260702_customer_orders.sql (buy flow — customer_orders).
//
// Safe to run anytime, including repeatedly: the migration is CREATE TABLE /
// CREATE INDEX "IF NOT EXISTS" only and never touches existing tables, so it
// cannot affect or break the running app. An advisory lock prevents two
// concurrent runners from racing.

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260702_customer_orders.sql";
const ADVISORY_LOCK_KEY = "202607020101";

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
  const expected = path.resolve(root, "migrations", "20260702_customer_orders.sql");
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
  const tables = await client.query("SELECT to_regclass('public.customer_orders') AS orders");
  if (!tables.rows?.[0]?.orders) throw new Error("customer_orders table missing after migration");
  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='customer_orders'
      AND column_name IN ('order_code','customer_name','customer_phone','delivery_method','install_option','items','subtotal','status')
  `);
  const names = new Set((columns.rows || []).map((row) => row.column_name));
  for (const required of ["order_code", "customer_name", "customer_phone", "delivery_method", "install_option", "items", "subtotal", "status"]) {
    if (!names.has(required)) throw new Error(`customer_orders.${required} missing after migration`);
  }
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  const client = clientFactory(createClientConfig(env));
  const sql = readMigrationSql(repoRoot);
  let locked = false;

  logger.log("CUSTOMER_ORDERS_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;
    await client.query(sql);
    await verifySchema(client);
    logger.log("CUSTOMER_ORDERS_MIGRATION_OK");
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
    logger.error(`CUSTOMER_ORDERS_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
