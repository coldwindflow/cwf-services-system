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

function compactSql(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function columnDefaultMatches(name, value) {
  const actual = compactSql(value);
  if (name === "claim_id") {
    return /^nextval\('(?:public\.)?customer_history_claims_claim_id_seq'::regclass\)$/.test(actual);
  }
  if (name === "claim_method") return actual === "'booking_code_phone'::text";
  if (name === "claimed_at" || name === "last_verified_at") return actual === "now()";
  return actual === "";
}

function compactCheck(value) {
  return compactSql(value).replace(/"right"/g, "right").replace(/[()]/g, "");
}

function sameColumns(row, expected) {
  return Array.isArray(row?.column_names) && row.column_names.length === expected.length
    && row.column_names.every((name, index) => name === expected[index]);
}

function normalizedPredicate(value) {
  return compactSql(value).replace(/[()]/g, "");
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
  const columnRows = columns.rows || [];
  const cols = mapRows(columnRows, "column_name");
  const expectedColumns = {
    claim_id: ["bigint", "NO"], customer_sub: ["text", "NO"], phone_norm: ["text", "NO"],
    phone_last4: ["text", "NO"], proof_job_id: ["bigint", "NO"], claim_method: ["text", "NO"],
    claimed_at: ["timestamp with time zone", "NO"], last_verified_at: ["timestamp with time zone", "NO"],
    revoked_at: ["timestamp with time zone", "YES"], revoke_reason: ["text", "YES"],
  };
  if (columnRows.length !== 10 || cols.size !== 10) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims column count drift");
  }
  for (const [name, [type, nullable]] of Object.entries(expectedColumns)) {
    const row = cols.get(name);
    if (!row || row.data_type !== type || row.is_nullable !== nullable || !columnDefaultMatches(name, row.column_default)) {
      throw migrationError(STATUS.SCHEMA_DRIFT, `customer_history_claims column drift: ${name}`);
    }
  }

  const primaryKeys = await client.query(`
    SELECT con.conname, idx.relname AS index_name, ind.indisprimary, ind.indisunique,
           array_agg(att.attname ORDER BY keys.ordinality) AS column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
      JOIN pg_class idx ON idx.oid=con.conindid
      JOIN pg_index ind ON ind.indexrelid=con.conindid
      JOIN unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality) ON TRUE
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=keys.attnum
     WHERE nsp.nspname='public' AND rel.relname='customer_history_claims' AND con.contype='p'
     GROUP BY con.conname, idx.relname, ind.indisprimary, ind.indisunique
  `);
  const pkRows = primaryKeys.rows || [];
  const primaryKey = pkRows[0];
  if (pkRows.length !== 1 || primaryKey.conname !== "customer_history_claims_pkey"
    || primaryKey.index_name !== "customer_history_claims_pkey"
    || primaryKey.indisprimary !== true || primaryKey.indisunique !== true
    || !sameColumns(primaryKey, ["claim_id"])) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims primary key drift");
  }

  const fks = await client.query(`
    SELECT con.conname, confnsp.nspname AS foreign_schema, confrel.relname AS foreign_table,
           con.confdeltype AS delete_action,
           array_agg(att.attname ORDER BY cols.ordinality) AS column_names,
           array_agg(fatt.attname ORDER BY cols.ordinality) AS foreign_column_names
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
      JOIN pg_class confrel ON confrel.oid=con.confrelid
      JOIN pg_namespace confnsp ON confnsp.oid=confrel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality) ON TRUE
      JOIN unnest(con.confkey) WITH ORDINALITY AS fcols(attnum, ordinality) ON fcols.ordinality=cols.ordinality
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=cols.attnum
      JOIN pg_attribute fatt ON fatt.attrelid=confrel.oid AND fatt.attnum=fcols.attnum
     WHERE nsp.nspname='public' AND rel.relname='customer_history_claims' AND con.contype='f'
     GROUP BY con.conname, confnsp.nspname, confrel.relname, con.confdeltype
  `);
  const fkRows = fks.rows || [];
  const fkByName = mapRows(fkRows, "conname");
  const expectedFks = {
    customer_history_claims_customer_sub_fkey: { columns: ["customer_sub"], table: "customer_profiles", foreignColumns: ["sub"], deleteAction: "c" },
    customer_history_claims_proof_job_id_fkey: { columns: ["proof_job_id"], table: "jobs", foreignColumns: ["job_id"], deleteAction: "r" },
  };
  if (fkRows.length !== 2 || fkByName.size !== 2) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims FK count drift");
  }
  for (const [name, expected] of Object.entries(expectedFks)) {
    const row = fkByName.get(name);
    if (!row || row.foreign_schema !== "public" || row.foreign_table !== expected.table
      || row.delete_action !== expected.deleteAction || !sameColumns(row, expected.columns)
      || !Array.isArray(row.foreign_column_names)
      || row.foreign_column_names.join(",") !== expected.foreignColumns.join(",")) {
      throw migrationError(STATUS.SCHEMA_DRIFT, `customer_history_claims FK drift: ${name}`);
    }
  }

  const checks = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
     WHERE conrelid='public.customer_history_claims'::regclass AND contype='c'
  `);
  const checkRows = checks.rows || [];
  const checksByName = mapRows(checkRows, "conname");
  const requiredCheckNames = [
    "customer_history_claims_method_check",
    "customer_history_claims_phone_norm_not_blank",
    "customer_history_claims_phone_norm_canonical_check",
    "customer_history_claims_phone_last4_check",
  ];
  if (checkRows.length !== requiredCheckNames.length || checksByName.size !== requiredCheckNames.length
    || requiredCheckNames.some((name) => !checksByName.has(name))) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims CHECK name or count drift");
  }
  const methodCapability = history.classifyClaimMethodConstraint(checksByName.get("customer_history_claims_method_check").definition);
  if (!methodCapability) throw migrationError(STATUS.SCHEMA_DRIFT, "claim_method CHECK shape drift");
  if (compactCheck(checksByName.get("customer_history_claims_phone_norm_not_blank").definition)
      !== "checklengthbtrimphone_norm>0") {
    throw migrationError(STATUS.SCHEMA_DRIFT, "phone_norm not-blank CHECK shape drift");
  }
  if (compactCheck(checksByName.get("customer_history_claims_phone_norm_canonical_check").definition)
      !== "checkphone_norm~'^0[0-9]{8,9}$'::text") {
    throw migrationError(STATUS.SCHEMA_DRIFT, "phone_norm canonical CHECK shape drift");
  }
  if (compactCheck(checksByName.get("customer_history_claims_phone_last4_check").definition)
      !== "checkphone_last4~'^[0-9]{4}$'::textandphone_last4=rightphone_norm,4") {
    throw migrationError(STATUS.SCHEMA_DRIFT, "phone_last4 CHECK shape drift");
  }

  const indexes = await client.query(`
    SELECT idx.relname AS indexname, ind.indisunique AS is_unique, ind.indisprimary AS is_primary,
           array_agg(att.attname ORDER BY keys.ordinality)
             FILTER (WHERE keys.ordinality <= ind.indnkeyatts) AS column_names,
           pg_get_expr(ind.indpred, ind.indrelid) AS predicate
      FROM pg_index ind
      JOIN pg_class rel ON rel.oid=ind.indrelid
      JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
      JOIN pg_class idx ON idx.oid=ind.indexrelid
      JOIN unnest(ind.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON TRUE
      LEFT JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=keys.attnum
     WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
     GROUP BY idx.relname, ind.indisunique, ind.indisprimary, ind.indpred, ind.indrelid
  `);
  const indexRows = indexes.rows || [];
  const indexesByName = mapRows(indexRows, "indexname");
  const expectedIndexes = {
    customer_history_claims_pkey: { unique: true, primary: true, columns: ["claim_id"], predicate: "" },
    ux_customer_history_claims_active_phone: { unique: true, primary: false, columns: ["phone_norm"], predicate: "revoked_atisnull" },
    ux_customer_history_claims_active_proof_job: { unique: true, primary: false, columns: ["proof_job_id"], predicate: "revoked_atisnull" },
    idx_customer_history_claims_customer_sub: { unique: false, primary: false, columns: ["customer_sub"], predicate: "revoked_atisnull" },
  };
  for (const [name, expected] of Object.entries(expectedIndexes)) {
    const row = indexesByName.get(name);
    if (!row || row.is_unique !== expected.unique || row.is_primary !== expected.primary
      || !sameColumns(row, expected.columns) || normalizedPredicate(row.predicate) !== expected.predicate) {
      throw migrationError(STATUS.SCHEMA_DRIFT, `customer_history_claims index drift: ${name}`);
    }
  }
  const criticalColumnKeys = new Set(Object.values(expectedIndexes).map((expected) => expected.columns.join(",")));
  const conflictingIndexes = indexRows.filter((row) => !Object.prototype.hasOwnProperty.call(expectedIndexes, row.indexname)
    && criticalColumnKeys.has(Array.isArray(row.column_names) ? row.column_names.join(",") : ""));
  if (indexesByName.size !== indexRows.length || conflictingIndexes.length) {
    throw migrationError(STATUS.SCHEMA_DRIFT, "customer_history_claims duplicate or conflicting index");
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
  const verifyMigration = options.verifyMigration || (() => verifyChecksum(repoRoot));
  const migrationReader = options.migrationReader || (() => readMigrationSql(repoRoot));
  const shouldApply = applyIntent(argv, env);
  const client = clientFactory(createClientConfig(env));
  let originalError = null;
  try {
    await client.connect();
    const before = await preflight(client);
    verifyMigration();
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
      await client.query(migrationReader());
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
