"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260623_catalog_store_hot_sale_reviews.sql";
const ADVISORY_LOCK_KEY = "202606230066";

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
  const expected = path.resolve(root, "migrations", "20260623_catalog_store_hot_sale_reviews.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) {
    throw new Error("migration path rejected");
  }
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

// See run-catalog-marketplace-v2-migration.js for the rationale: the runner owns
// the transaction boundary itself so a verifySchema() failure still triggers a
// real ROLLBACK, while the file itself keeps its own BEGIN/COMMIT so it stays
// directly pasteable into pgAdmin.
function stripOuterTransactionWrapper(sql) {
  return sql
    .replace(/^[ \t]*BEGIN[ \t]*;[ \t]*$/m, "")
    .replace(/^[ \t]*COMMIT[ \t]*;[ \t]*$/m, "");
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
  const catalogColumns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_items' AND column_name = 'is_hot'
  `);
  if (catalogColumns.rows?.[0]?.data_type !== "boolean") {
    throw new Error("catalog_items.is_hot missing after migration");
  }

  const jobsColumns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs'
      AND column_name IN ('catalog_item_id', 'customer_sub')
  `);
  const jobsColumnTypes = new Map((jobsColumns.rows || []).map((row) => [row.column_name, row.data_type]));
  if (jobsColumnTypes.get("catalog_item_id") !== "bigint") {
    throw new Error("jobs.catalog_item_id missing after migration");
  }
  if (jobsColumnTypes.get("customer_sub") !== "text") {
    throw new Error("jobs.customer_sub missing after migration");
  }

  const reviewsTable = await client.query("SELECT to_regclass('public.catalog_item_reviews') AS reg");
  if (!reviewsTable.rows?.[0]?.reg) throw new Error("catalog_item_reviews table missing after migration");

  const reviewsColumns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_item_reviews'
  `);
  const reviewsColumnTypes = new Map((reviewsColumns.rows || []).map((row) => [row.column_name, row.data_type]));
  const requiredReviewColumns = {
    review_id: "bigint",
    item_id: "bigint",
    completed_job_id: "bigint",
    customer_identity: "text",
    rating: "integer",
    comment: "text",
    moderation_status: "text",
    created_at: "timestamp with time zone",
    updated_at: "timestamp with time zone",
    moderated_at: "timestamp with time zone",
    moderated_by: "text",
  };
  Object.entries(requiredReviewColumns).forEach(([column, type]) => {
    if (reviewsColumnTypes.get(column) !== type) {
      throw new Error(`catalog_item_reviews.${column} missing after migration`);
    }
  });

  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'catalog_item_reviews'
  `);
  const indexNames = new Set((indexes.rows || []).map((row) => row.indexname));
  ["uq_catalog_item_reviews_job", "idx_catalog_item_reviews_item_status", "idx_catalog_item_reviews_created_at"].forEach((name) => {
    if (!indexNames.has(name)) throw new Error(`${name} missing after migration`);
  });

  const constraints = await client.query(`
    SELECT con.conname AS constraint_name, con.contype AS constraint_type
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname IN ('catalog_item_reviews', 'jobs')
  `);
  const constraintNames = new Set((constraints.rows || []).map((row) => row.constraint_name));
  [
    "catalog_item_reviews_rating_check",
    "catalog_item_reviews_status_check",
    "catalog_item_reviews_item_id_fkey",
    "catalog_item_reviews_job_id_fkey",
    "jobs_catalog_item_id_fkey",
  ].forEach((name) => {
    if (!constraintNames.has(name)) throw new Error(`${name} missing after migration`);
  });
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  const config = createClientConfig(env);
  const sql = readMigrationSql(repoRoot);
  const body = stripOuterTransactionWrapper(sql);
  const client = clientFactory(config);
  let locked = false;
  let inTransaction = false;
  let originalError = null;

  logger.log("CATALOG_STORE_HOT_SALE_REVIEWS_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;

    await client.query("BEGIN");
    inTransaction = true;
    await client.query(body);
    await verifySchema(client);
    await client.query("COMMIT");
    inTransaction = false;
    logger.log("CATALOG_STORE_HOT_SALE_REVIEWS_MIGRATION_OK");
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (inTransaction) {
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
    logger.error(`CATALOG_STORE_HOT_SALE_REVIEWS_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
  stripOuterTransactionWrapper,
  verifySchema,
};
