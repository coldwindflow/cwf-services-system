"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260623_catalog_store_marketplace_v2.sql";
const ADVISORY_LOCK_KEY = "202606230065";

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
  const expected = path.resolve(root, "migrations", "20260623_catalog_store_marketplace_v2.sql");
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
  const table = await client.query("SELECT to_regclass('public.catalog_item_images') AS catalog_item_images");
  if (!table.rows?.[0]?.catalog_item_images) throw new Error("catalog_item_images table missing");

  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_items'
      AND column_name IN (
        'short_description', 'long_description', 'highlights', 'service_conditions',
        'booking_mode', 'booking_service_key', 'booking_ac_type', 'booking_btu',
        'booking_wash_variant', 'is_featured'
      )
  `);
  const columnTypes = new Map((columns.rows || []).map((row) => [row.column_name, row.data_type]));
  const required = {
    short_description: "text",
    long_description: "text",
    highlights: "jsonb",
    service_conditions: "text",
    booking_mode: "text",
    booking_service_key: "text",
    booking_ac_type: "text",
    booking_btu: "integer",
    booking_wash_variant: "text",
    is_featured: "boolean",
  };
  Object.entries(required).forEach(([column, type]) => {
    if (columnTypes.get(column) !== type) {
      throw new Error(`catalog_items.${column} missing after migration`);
    }
  });

  const imageColumns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_item_images'
  `);
  const imageColumnTypes = new Map((imageColumns.rows || []).map((row) => [row.column_name, row.data_type]));
  const requiredImageColumns = {
    image_id: "bigint",
    item_id: "bigint",
    image_url: "text",
    image_public_id: "text",
    alt_text: "text",
    sort_order: "integer",
    is_primary: "boolean",
    created_at: "timestamp with time zone",
  };
  Object.entries(requiredImageColumns).forEach(([column, type]) => {
    if (imageColumnTypes.get(column) !== type) {
      throw new Error(`catalog_item_images.${column} missing after migration`);
    }
  });

  const indexes = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'catalog_item_images'
  `);
  const indexNames = new Set((indexes.rows || []).map((row) => row.indexname));
  if (!indexNames.has("idx_catalog_item_images_item_id")) {
    throw new Error("idx_catalog_item_images_item_id missing after migration");
  }

  const fk = await client.query(`
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_item_images'
      AND con.contype = 'f'
      AND con.conname = 'catalog_item_images_item_id_fkey'
  `);
  if (!fk.rows?.length) throw new Error("catalog_item_images_item_id_fkey missing after migration");

  const check = await client.query(`
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_items'
      AND con.contype = 'c'
      AND con.conname = 'catalog_items_booking_mode_check'
  `);
  if (!check.rows?.length) throw new Error("catalog_items_booking_mode_check missing after migration");
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

  logger.log("CATALOG_MARKETPLACE_V2_MIGRATION_START");
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
    logger.log("CATALOG_MARKETPLACE_V2_MIGRATION_OK");
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
    logger.error(`CATALOG_MARKETPLACE_V2_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
