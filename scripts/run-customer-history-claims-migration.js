"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260710_customer_history_claims.sql";
const EXPECTED_SHA256 = "745446126557ec50d726bdd73a6d4ba8a6c67ba5f9239895186d0759f1f351bd";
const CONFIRM_ENV = "CONFIRM_CUSTOMER_HISTORY_CLAIMS_MIGRATION";
const CONFIRM_VALUE = "APPLY_20260710_CUSTOMER_HISTORY_CLAIMS";
const ADVISORY_LOCK_KEY = "202607100152";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeErrorMessage(error) {
  const msg = clean(error && error.message ? error.message : error) || "unknown error";
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/password authentication failed for user\s+"[^"]+"/gi, 'password authentication failed for user "[REDACTED]"')
    .replace(/user\s+"[^"]+"/gi, 'user "[REDACTED]"')
    .replace(/host\s+"[^"]+"/gi, 'host "[REDACTED]"')
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, "[REDACTED_HOST]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[REDACTED_HOST]")
    .replace(/\blocalhost(?::\d+)?\b/gi, "[REDACTED_HOST]");
}

function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const migrationPath = path.resolve(root, MIGRATION_RELATIVE_PATH);
  const expected = path.resolve(root, "migrations", "20260710_customer_history_claims.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) {
    throw new Error("migration path rejected");
  }
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

function migrationChecksum(repoRoot) {
  return crypto.createHash("sha256").update(readMigrationSql(repoRoot), "utf8").digest("hex");
}

function verifyChecksum(repoRoot) {
  const actual = migrationChecksum(repoRoot);
  if (actual !== EXPECTED_SHA256) {
    throw new Error("migration checksum mismatch");
  }
  return actual;
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

function mapRows(rows, key) {
  return new Map((rows || []).map((row) => [String(row[key]), row]));
}

async function inspectPreflight(client) {
  const tables = await client.query(`
    SELECT
      to_regclass('public.customer_profiles') IS NOT NULL AS has_customer_profiles,
      to_regclass('public.jobs') IS NOT NULL AS has_jobs,
      to_regclass('public.customer_history_claims') IS NOT NULL AS has_claims
  `);
  const t = tables.rows?.[0] || {};
  if (!t.has_customer_profiles) throw new Error("customer_profiles prerequisite missing");
  if (!t.has_jobs) throw new Error("jobs prerequisite missing");

  const columns = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema='public'
       AND ((table_name='jobs' AND column_name='job_id')
         OR (table_name='customer_profiles' AND column_name='sub'))
  `);
  const byTableColumn = new Map((columns.rows || []).map((row) => [`${row.table_name}.${row.column_name}`, row]));
  if (byTableColumn.get("jobs.job_id")?.data_type !== "bigint") throw new Error("jobs.job_id must be bigint");
  if (!byTableColumn.has("customer_profiles.sub")) throw new Error("customer_profiles.sub missing");

  const subKey = await client.query(`
    SELECT con.conname,
           array_agg(att.attname ORDER BY cols.ordinality) AS column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
     WHERE nsp.nspname='public'
       AND rel.relname='customer_profiles'
       AND con.contype IN ('p','u')
     GROUP BY con.conname
  `);
  const supportsSubFk = (subKey.rows || []).some((row) => {
    const names = Array.isArray(row.column_names) ? row.column_names : [];
    return names.length === 1 && names[0] === "sub";
  });
  if (!supportsSubFk) throw new Error("customer_profiles.sub does not support FK");

  return { claimsExists: !!t.has_claims };
}

async function verifyAppliedSchema(client, options = {}) {
  const table = await client.query("SELECT to_regclass('public.customer_history_claims') AS table_name");
  if (!table.rows?.[0]?.table_name) throw new Error("customer_history_claims table missing");

  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='customer_history_claims'
     ORDER BY column_name
  `);
  const cols = mapRows(columns.rows, "column_name");
  const expectedColumns = {
    claim_id: ["bigint", "NO"],
    customer_sub: ["text", "NO"],
    phone_norm: ["text", "NO"],
    phone_last4: ["text", "NO"],
    proof_job_id: ["bigint", "NO"],
    claim_method: ["text", "NO"],
    claimed_at: ["timestamp with time zone", "NO"],
    last_verified_at: ["timestamp with time zone", "NO"],
    revoked_at: ["timestamp with time zone", "YES"],
    revoke_reason: ["text", "YES"],
  };
  for (const [name, [type, nullable]] of Object.entries(expectedColumns)) {
    const row = cols.get(name);
    if (!row || row.data_type !== type || row.is_nullable !== nullable) {
      throw new Error(`customer_history_claims column drift: ${name}`);
    }
  }

  const fks = await client.query(`
    SELECT con.conname,
           confrel.relname AS foreign_table,
           array_agg(att.attname ORDER BY cols.ordinality) AS column_names,
           array_agg(fatt.attname ORDER BY cols.ordinality) AS foreign_column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_class confrel ON confrel.oid = con.confrelid
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN unnest(con.confkey) WITH ORDINALITY AS fcols(attnum, ordinality) ON fcols.ordinality = cols.ordinality
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
      JOIN pg_attribute fatt ON fatt.attrelid = confrel.oid AND fatt.attnum = fcols.attnum
     WHERE nsp.nspname='public'
       AND rel.relname='customer_history_claims'
       AND con.contype='f'
     GROUP BY con.conname, confrel.relname
  `);
  const hasCustomerFk = (fks.rows || []).some((row) => row.foreign_table === "customer_profiles"
    && (row.column_names || []).join(",") === "customer_sub"
    && (row.foreign_column_names || []).join(",") === "sub");
  const hasJobFk = (fks.rows || []).some((row) => row.foreign_table === "jobs"
    && (row.column_names || []).join(",") === "proof_job_id"
    && (row.foreign_column_names || []).join(",") === "job_id");
  if (!hasCustomerFk) throw new Error("customer_sub FK missing");
  if (!hasJobFk) throw new Error("proof_job_id FK missing");

  const checks = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
     WHERE conrelid='public.customer_history_claims'::regclass
       AND contype='c'
  `);
  const checkText = (checks.rows || []).map((row) => `${row.conname} ${row.definition}`).join("\n");
  if (!/booking_code_phone/.test(checkText)) throw new Error("claim_method CHECK missing");
  if (!/phone_norm/.test(checkText) || !/\^0\[0-9\]\{8,9\}\$/.test(checkText)) throw new Error("canonical phone_norm CHECK missing");
  if (!/phone_last4/.test(checkText) || !/right\(phone_norm,\s*4\)/i.test(checkText)) throw new Error("phone_last4 CHECK missing");

  const indexes = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname='public'
       AND tablename='customer_history_claims'
  `);
  const indexDefs = new Map((indexes.rows || []).map((row) => [row.indexname, row.indexdef]));
  const activePhone = indexDefs.get("ux_customer_history_claims_active_phone") || "";
  const activeProof = indexDefs.get("ux_customer_history_claims_active_proof_job") || "";
  const activeSub = indexDefs.get("idx_customer_history_claims_customer_sub") || "";
  if (!/UNIQUE/i.test(activePhone) || !/phone_norm/.test(activePhone) || !/revoked_at IS NULL/i.test(activePhone)) {
    throw new Error("active phone partial unique index missing");
  }
  if (!/UNIQUE/i.test(activeProof) || !/proof_job_id/.test(activeProof) || !/revoked_at IS NULL/i.test(activeProof)) {
    throw new Error("active proof job partial unique index missing");
  }
  if (!/customer_sub/.test(activeSub) || !/revoked_at IS NULL/i.test(activeSub)) {
    throw new Error("active customer_sub index missing");
  }

  const count = await client.query("SELECT COUNT(*)::bigint AS count FROM public.customer_history_claims");
  const rowCount = Number(count.rows?.[0]?.count || 0);
  if (options.expectEmpty && rowCount !== 0) throw new Error("customer_history_claims row count must be zero after first apply");
  return { rowCount };
}

async function preflight(client) {
  const info = await inspectPreflight(client);
  if (info.claimsExists) {
    await verifyAppliedSchema(client);
    return { status: "ALREADY_APPLIED" };
  }
  return { status: "READY_TO_APPLY" };
}

function applyIntent(argv = [], env = process.env) {
  const hasApply = argv.includes("--apply");
  const hasConfirm = clean(env[CONFIRM_ENV]) === CONFIRM_VALUE;
  if (hasApply && !hasConfirm) throw new Error("confirmation env missing");
  if (!hasApply && hasConfirm) throw new Error("--apply argument missing");
  return hasApply && hasConfirm;
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  verifyChecksum(repoRoot);
  const shouldApply = applyIntent(argv, env);
  const config = createClientConfig(env);
  const client = clientFactory(config);
  let locked = false;
  let applied = false;
  let originalError = null;

  try {
    await client.connect();
    const preflightResult = await preflight(client);
    if (preflightResult.status === "ALREADY_APPLIED") {
      logger.log("CUSTOMER_HISTORY_CLAIMS_MIGRATION_ALREADY_APPLIED");
      return { status: "ALREADY_APPLIED" };
    }
    if (!shouldApply) {
      logger.log("CUSTOMER_HISTORY_CLAIMS_MIGRATION_PREFLIGHT_OK");
      return { status: "READY_TO_APPLY" };
    }

    const lock = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS locked", [ADVISORY_LOCK_KEY]);
    locked = lock.rows?.[0]?.locked === true;
    if (!locked) throw new Error("migration lock unavailable");
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '60s'");
    await client.query("SET idle_in_transaction_session_timeout = '60s'");
    logger.log("CUSTOMER_HISTORY_CLAIMS_MIGRATION_APPLY_START");
    try {
      await client.query(readMigrationSql(repoRoot));
      applied = true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    }
    await verifyAppliedSchema(client, { expectEmpty: true });
    logger.log("CUSTOMER_HISTORY_CLAIMS_MIGRATION_OK");
    return { status: "APPLIED" };
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    let cleanupError = null;
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
    logger.error(`CUSTOMER_HISTORY_CLAIMS_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
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
  CONFIRM_ENV,
  CONFIRM_VALUE,
  EXPECTED_SHA256,
  MIGRATION_RELATIVE_PATH,
  applyIntent,
  createClientConfig,
  inspectPreflight,
  migrationChecksum,
  preflight,
  readMigrationSql,
  resolveMigrationPath,
  runCli,
  runMigration,
  safeErrorMessage,
  verifyAppliedSchema,
  verifyChecksum,
};
