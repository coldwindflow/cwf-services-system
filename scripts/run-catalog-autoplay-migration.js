"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260623_catalog_store_autoplay.sql";
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
  const expected = path.resolve(root, "migrations", "20260623_catalog_store_autoplay.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) {
    throw new Error("migration path rejected");
  }
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

// The migration file keeps its own top-level BEGIN/COMMIT so it can still be
// pasted directly into pgAdmin and run standalone. When driven by this
// runner, though, the runner must own the transaction boundary itself (so a
// verifySchema() failure can still trigger a real ROLLBACK after the body
// has executed) — so those two statements are stripped before the body is
// executed under the runner's own BEGIN/COMMIT/ROLLBACK.
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
  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_items'
      AND column_name = 'is_autoplay_enabled'
  `);
  const row = columns.rows?.[0];
  if (!row) throw new Error("catalog_items.is_autoplay_enabled missing after migration");
  if (row.data_type !== "boolean") throw new Error("catalog_items.is_autoplay_enabled has unexpected type after migration");
  if (row.is_nullable !== "NO") throw new Error("catalog_items.is_autoplay_enabled is unexpectedly nullable after migration");
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

  logger.log("CATALOG_AUTOPLAY_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;

    // The runner owns BEGIN/verify/COMMIT itself (rather than trusting the
    // migration file's own embedded BEGIN/COMMIT) so that a verifySchema()
    // failure — discovered only after the migration body has run — still
    // triggers a real ROLLBACK instead of leaving an already-committed,
    // wrongly-verified schema change in place.
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(body);
    await verifySchema(client);
    await client.query("COMMIT");
    inTransaction = false;
    logger.log("CATALOG_AUTOPLAY_MIGRATION_OK");
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
    logger.error(`CATALOG_AUTOPLAY_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
