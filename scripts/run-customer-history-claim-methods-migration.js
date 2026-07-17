"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const history = require("../server/services/public/customerHistory");

const MIGRATION_RELATIVE_PATH = "migrations/20260717_customer_history_claim_methods.sql";
const EXPECTED_SHA256 = "4ca57cb0d49f318fc4d80bb4b75b4d0d3af64da5728f92379885f261c7b1d0c7";
const CONFIRM_ENV = "CONFIRM_CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION";
const CONFIRM_VALUE = "APPLY_20260717_CUSTOMER_HISTORY_CLAIM_METHODS";
const ADVISORY_LOCK_KEY = "202607170177";
const STATUS = Object.freeze({
  READY_TO_APPLY: "READY_TO_APPLY",
  ALREADY_APPLIED: "ALREADY_APPLIED",
  PREREQUISITE_MISSING: "PREREQUISITE_MISSING",
  SCHEMA_DRIFT: "SCHEMA_DRIFT",
  FAILED: "FAILED",
});
const EXIT_CODE = Object.freeze({ FAILED: 1, PREREQUISITE_MISSING: 2, SCHEMA_DRIFT: 3 });
const PREFIX = "CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION";

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

function migrationError(status, message) {
  const error = new Error(message);
  error.migrationStatus = status;
  return error;
}

function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const migrationPath = path.resolve(root, MIGRATION_RELATIVE_PATH);
  const expected = path.resolve(root, "migrations", "20260717_customer_history_claim_methods.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) throw new Error("migration path rejected");
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

function migrationChecksum(repoRoot) {
  const sql = readMigrationSql(repoRoot).replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function verifyChecksum(repoRoot) {
  const actual = migrationChecksum(repoRoot);
  if (actual !== EXPECTED_SHA256) throw migrationError(STATUS.SCHEMA_DRIFT, "migration checksum mismatch");
  return actual;
}

function createClientConfig(env = process.env) {
  const databaseUrl = clean(env.DATABASE_URL);
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return { connectionString: databaseUrl, options: "-c timezone=Asia/Bangkok", ssl: { rejectUnauthorized: false } };
}

function mapRows(rows, key) {
  return new Map((rows || []).map((row) => [String(row[key]), row]));
}

async function dataSnapshot(client) {
  const result = await client.query(`
    SELECT COUNT(*)::bigint AS row_count,
           md5(COALESCE(string_agg(md5(to_jsonb(c)::text), '' ORDER BY c.claim_id), '')) AS row_fingerprint
      FROM public.customer_history_claims c
  `);
  return {
    rowCount: String(result.rows?.[0]?.row_count || "0"),
    rowFingerprint: String(result.rows?.[0]?.row_fingerprint || ""),
  };
}

async function inspectSchema(client) {
  const table = await client.query("SELECT to_regclass('public.customer_history_claims') AS table_name");
  if (!table.rows?.[0]?.table_name) {
    throw migrationError(STATUS.PREREQUISITE_MISSING, "customer_history_claims prerequisite missing");
  }

  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='customer_history_claims'
     ORDER BY column_name
  `);
  const cols = mapRows(columns.rows, "column_name");
  const expectedColumns = {
    claim_id: ["bigint", "NO"], customer_sub: ["text", "NO"], phone_norm: ["text", "NO"],
    phone_last4: ["text", "NO"], proof_job_id: ["bigint", "NO"], claim_method: ["text", "NO"],
    claimed_at: ["timestamp with time zone", "NO"], last_verified_at: ["timestamp with time zone", "NO"],
    revoked_at: ["timestamp with time zone", "YES"], revoke_reason: ["text", "YES"],
  };
  for (const [name, [type, nullable]] of Object.entries(expectedColumns)) {
    const row = cols.get(name);
    if (!row || row.data_type !== type || row.is_nullable !== nullable) {
      throw migrationError(STATUS.SCHEMA_DRIFT, `customer_history_claims column drift: ${name}`);
    }
  }
  if (clean(cols.get("claim_method")?.column_default).replace(/\s+/g, "") !== "'booking_code_phone'::text") {
    throw migrationError(STATUS.SCHEMA_DRIFT, "claim_method default drift");
  }

  const fks = await client.query(`
    SELECT con.conname, confrel.relname AS foreign_table,
           array_agg(att.attname ORDER BY cols.ordinality) AS column_names,
           array_agg(fatt.attname ORDER BY cols.ordinality) AS foreign_column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
      JOIN pg_class confrel ON confrel.oid=con.confrelid
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN unnest(con.confkey) WITH ORDINALITY AS fcols(attnum, ordinality) ON fcols.ordinality=cols.ordinality
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=cols.attnum
      JOIN pg_attribute fatt ON fatt.attrelid=confrel.oid AND fatt.attnum=fcols.attnum
     WHERE nsp.nspname='public' AND rel.relname='customer_history_claims' AND con.contype='f'
     GROUP BY con.conname, confrel.relname
  `);
  const hasCustomerFk = (fks.rows || []).some((row) => row.foreign_table === "customer_profiles"
    && (row.column_names || []).join(",") === "customer_sub" && (row.foreign_column_names || []).join(",") === "sub");
  const hasJobFk = (fks.rows || []).some((row) => row.foreign_table === "jobs"
    && (row.column_names || []).join(",") === "proof_job_id" && (row.foreign_column_names || []).join(",") === "job_id");
  if (!hasCustomerFk || !hasJobFk) throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims FK drift");

  const checks = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
     WHERE conrelid='public.customer_history_claims'::regclass AND contype='c'
  `);
  const methodChecks = (checks.rows || []).filter((row) => /claim_method/i.test(String(row.definition || "")));
  if (methodChecks.length !== 1 || methodChecks[0].conname !== "customer_history_claims_method_check") {
    throw migrationError(STATUS.SCHEMA_DRIFT, "claim_method CHECK name or count drift");
  }
  const methodCapability = history.classifyClaimMethodConstraint(methodChecks[0].definition);
  if (!methodCapability) throw migrationError(STATUS.SCHEMA_DRIFT, "claim_method CHECK shape drift");
  const checkText = (checks.rows || []).map((row) => `${row.conname} ${row.definition}`).join("\n");
  if (!/phone_norm/.test(checkText) || !/\^0\[0-9\]\{8,9\}\$/.test(checkText)) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "canonical phone_norm CHECK missing");
  }
  if (!/phone_last4/.test(checkText) || !/(?:right|"right")\(phone_norm,\s*4\)/i.test(checkText)) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "phone_last4 CHECK missing");
  }

  const indexes = await client.query(`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname='public' AND tablename='customer_history_claims'
  `);
  const indexDefs = mapRows(indexes.rows, "indexname");
  const activePhone = indexDefs.get("ux_customer_history_claims_active_phone")?.indexdef || "";
  const activeProof = indexDefs.get("ux_customer_history_claims_active_proof_job")?.indexdef || "";
  const activeSub = indexDefs.get("idx_customer_history_claims_customer_sub")?.indexdef || "";
  if (!/UNIQUE/i.test(activePhone) || !/phone_norm/.test(activePhone) || !/revoked_at IS NULL/i.test(activePhone)) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "active phone index drift");
  }
  if (!/UNIQUE/i.test(activeProof) || !/proof_job_id/.test(activeProof) || !/revoked_at IS NULL/i.test(activeProof)) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "active proof index drift");
  }
  if (!/customer_sub/.test(activeSub) || !/revoked_at IS NULL/i.test(activeSub)) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "active customer index drift");
  }

  return { methodCapability, snapshot: await dataSnapshot(client) };
}

async function preflight(client) {
  const schema = await inspectSchema(client);
  return {
    status: schema.methodCapability === history.CLAIM_METHOD_CAPABILITY.WIDENED
      ? STATUS.ALREADY_APPLIED
      : STATUS.READY_TO_APPLY,
    snapshot: schema.snapshot,
  };
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
  const client = clientFactory(createClientConfig(env));
  let originalError = null;
  try {
    await client.connect();
    const before = await preflight(client);
    if (before.status === STATUS.ALREADY_APPLIED) {
      logger.log(`${PREFIX}_STATUS=${STATUS.ALREADY_APPLIED}`);
      return { status: STATUS.ALREADY_APPLIED };
    }
    if (!shouldApply) {
      logger.log(`${PREFIX}_STATUS=${STATUS.READY_TO_APPLY}`);
      return { status: STATUS.READY_TO_APPLY };
    }

    logger.log(`${PREFIX}_APPLY_START`);
    try {
      await client.query(readMigrationSql(repoRoot));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    }
    const after = await inspectSchema(client);
    if (after.methodCapability !== history.CLAIM_METHOD_CAPABILITY.WIDENED) {
      throw migrationError(STATUS.SCHEMA_DRIFT, "widened claim_method CHECK verification failed");
    }
    if (after.snapshot.rowCount !== before.snapshot.rowCount
      || after.snapshot.rowFingerprint !== before.snapshot.rowFingerprint) {
      throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims data verification failed");
    }
    logger.log(`${PREFIX}_OK`);
    return { status: "APPLIED" };
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    try {
      await client.end();
    } catch (error) {
      if (!originalError) throw error;
    }
  }
}

async function runCli(options = {}) {
  const logger = options.logger || console;
  try {
    await runMigration(options);
    return 0;
  } catch (error) {
    const status = error?.migrationStatus || STATUS.FAILED;
    logger.error(`${PREFIX}_STATUS=${status}`);
    logger.error(`${PREFIX}_FAILED: ${safeErrorMessage(error)}`);
    return status === STATUS.PREREQUISITE_MISSING ? EXIT_CODE.PREREQUISITE_MISSING
      : status === STATUS.SCHEMA_DRIFT ? EXIT_CODE.SCHEMA_DRIFT : EXIT_CODE.FAILED;
  }
}

if (require.main === module) {
  runCli().then((code) => { process.exitCode = code; });
}

module.exports = {
  ADVISORY_LOCK_KEY, CONFIRM_ENV, CONFIRM_VALUE, EXPECTED_SHA256, EXIT_CODE,
  MIGRATION_RELATIVE_PATH, STATUS, applyIntent, createClientConfig, dataSnapshot,
  inspectSchema, migrationChecksum, preflight, readMigrationSql, resolveMigrationPath,
  runCli, runMigration, safeErrorMessage, verifyChecksum,
};
