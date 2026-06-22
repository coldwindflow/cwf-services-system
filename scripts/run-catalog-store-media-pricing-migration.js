"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260622_catalog_store_media_pricing.sql";
const ADVISORY_LOCK_KEY = "202606220064";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeErrorMessage(error) {
  const msg = clean(error && error.message ? error.message : error) || "unknown error";
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]");
}

function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const migrationPath = path.resolve(root, MIGRATION_RELATIVE_PATH);
  const expected = path.resolve(root, "migrations", "20260622_catalog_store_media_pricing.sql");
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
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return {
    connectionString: databaseUrl,
    options: "-c timezone=Asia/Bangkok",
    ssl: { rejectUnauthorized: false },
  };
}

async function verifySchema(client) {
  const table = await client.query("SELECT to_regclass('public.catalog_items') AS catalog_items");
  if (!table.rows?.[0]?.catalog_items) throw new Error("catalog_items table missing");

  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_items'
      AND column_name IN ('image_url', 'image_public_id', 'price_rule_id')
    ORDER BY column_name
  `);
  const columnTypes = new Map((columns.rows || []).map((row) => [row.column_name, row.data_type]));
  if (columnTypes.get("image_url") !== "text") throw new Error("catalog_items.image_url missing after migration");
  if (columnTypes.get("image_public_id") !== "text") throw new Error("catalog_items.image_public_id missing after migration");
  if (columnTypes.get("price_rule_id") !== "bigint") throw new Error("catalog_items.price_rule_id missing after migration");

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
  `);
  const indexNames = new Set((indexes.rows || []).map((row) => row.indexname));
  if (!indexNames.has("idx_catalog_items_price_rule_id")) {
    throw new Error("idx_catalog_items_price_rule_id missing after migration");
  }

  const constraints = await client.query(`
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_items'
      AND con.contype = 'f'
      AND con.conname = 'catalog_items_price_rule_id_fkey'
  `);
  if (!constraints.rows?.length) throw new Error("catalog_items_price_rule_id_fkey missing after migration");
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  const config = createClientConfig(env);
  const sql = readMigrationSql(repoRoot);
  const client = clientFactory(config);
  let locked = false;
  let migrationFailed = false;
  let originalError = null;

  logger.log("CATALOG_STORE_MEDIA_PRICING_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;
    try {
      await client.query(sql);
    } catch (error) {
      migrationFailed = true;
      throw error;
    }
    await verifySchema(client);
    logger.log("CATALOG_STORE_MEDIA_PRICING_MIGRATION_OK");
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (migrationFailed) {
      try {
        await client.query("ROLLBACK");
      } catch (error) {
        cleanupError = cleanupError || error;
      }
    }
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]);
      } catch (error) {
        cleanupError = cleanupError || error;
      }
    }
    try {
      await client.end();
    } catch (error) {
      cleanupError = cleanupError || error;
    }
    if (!originalError && cleanupError) throw cleanupError;
  }
}

async function runCli(options = {}) {
  const logger = options.logger || console;
  try {
    await runMigration(options);
    return 0;
  } catch (error) {
    logger.error(`CATALOG_STORE_MEDIA_PRICING_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
