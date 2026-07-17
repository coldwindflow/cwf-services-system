"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runner = require("../scripts/run-customer-history-claim-methods-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const LEGACY = "CHECK ((claim_method = 'booking_code_phone'::text))";
const WIDENED = "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code'::text, 'booking_code_phone'::text])))";

function expectedColumns() {
  return [
    ["claim_id", "bigint", "NO", "nextval('customer_history_claims_claim_id_seq'::regclass)"],
    ["customer_sub", "text", "NO", null], ["phone_norm", "text", "NO", null],
    ["phone_last4", "text", "NO", null], ["proof_job_id", "bigint", "NO", null],
    ["claim_method", "text", "NO", "'booking_code_phone'::text"],
    ["claimed_at", "timestamp with time zone", "NO", "now()"],
    ["last_verified_at", "timestamp with time zone", "NO", "now()"],
    ["revoked_at", "timestamp with time zone", "YES", null], ["revoke_reason", "text", "YES", null],
  ].map(([column_name, data_type, is_nullable, column_default]) => ({ column_name, data_type, is_nullable, column_default }));
}

function methodRow(shape) {
  if (shape === "missing") return null;
  if (shape === "unknown") {
    return { conname: "customer_history_claims_method_check", definition: "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code'::text, 'booking_code_phone'::text, 'email'::text])))" };
  }
  if (shape === "missing-approved") {
    return { conname: "customer_history_claims_method_check", definition: "CHECK ((claim_method = ANY (ARRAY['phone'::text, 'booking_code_phone'::text])))" };
  }
  return {
    conname: shape === "renamed" ? "customer_history_claims_method_check_v2" : "customer_history_claims_method_check",
    definition: shape === "widened" ? WIDENED : LEGACY,
  };
}

function expectedPrimaryKeys(shape) {
  if (shape === "missing") return [];
  return [{
    conname: "customer_history_claims_pkey",
    index_name: shape === "wrong-index" ? "unexpected_pkey_index" : "customer_history_claims_pkey",
    indisprimary: true,
    indisunique: true,
    column_names: [shape === "wrong-column" ? "proof_job_id" : "claim_id"],
  }];
}

function expectedForeignKeys(shape) {
  const rows = [
    { conname: "customer_history_claims_customer_sub_fkey", foreign_schema: "public", foreign_table: "customer_profiles", delete_action: shape === "wrong-delete" ? "a" : "c", column_names: ["customer_sub"], foreign_column_names: ["sub"] },
    { conname: "customer_history_claims_proof_job_id_fkey", foreign_schema: "public", foreign_table: shape === "wrong-target" ? "customer_profiles" : "jobs", delete_action: "r", column_names: ["proof_job_id"], foreign_column_names: ["job_id"] },
  ];
  if (shape === "duplicate") rows.push({ ...rows[0], conname: "duplicate_customer_sub_fkey" });
  return rows;
}

function expectedIndexes(shape) {
  const rows = [
    { indexname: "customer_history_claims_pkey", is_unique: true, is_primary: true, column_names: ["claim_id"], predicate: null },
    { indexname: "ux_customer_history_claims_active_phone", is_unique: true, is_primary: false, column_names: ["phone_norm"], predicate: "(revoked_at IS NULL)" },
    { indexname: "ux_customer_history_claims_active_proof_job", is_unique: true, is_primary: false, column_names: ["proof_job_id"], predicate: "(revoked_at IS NULL)" },
    { indexname: "idx_customer_history_claims_customer_sub", is_unique: false, is_primary: false, column_names: ["customer_sub"], predicate: "(revoked_at IS NULL)" },
  ];
  const phone = rows[1];
  if (shape === "wrong-unique") phone.is_unique = false;
  if (shape === "wrong-column") phone.column_names = ["customer_sub"];
  if (shape === "wrong-predicate") phone.predicate = null;
  if (shape === "wrong-pk-index") rows[0].column_names = ["proof_job_id"];
  if (shape === "duplicate") rows.push({ ...phone, indexname: "duplicate_active_phone" });
  return rows;
}

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.queries = [];
    this.connected = false;
    this.ended = false;
    this.applied = options.methodShape === "widened";
  }

  async connect() { this.connected = true; }
  async end() { this.ended = true; }

  async query(sql) {
    const text = String(sql);
    this.queries.push(text);
    if (text === "ROLLBACK") {
      this.rolledBack = true;
      return { rows: [] };
    }
    if (text.includes("SELECT pg_advisory_xact_lock(202607170177)")) {
      if (this.options.alterError) throw new Error(this.options.alterError);
      this.applied = true;
      return { rows: [] };
    }
    if (text.includes("SELECT to_regclass('public.customer_history_claims') AS table_name")) {
      return { rows: [{ table_name: this.options.hasTable === false ? null : "customer_history_claims" }] };
    }
    if (text.includes("information_schema.columns")) {
      const rows = expectedColumns();
      if (this.options.columnShape === "extra") rows.push({ column_name: "unexpected", data_type: "text", is_nullable: "YES", column_default: null });
      if (this.options.columnShape === "missing") rows.splice(rows.findIndex((row) => row.column_name === "phone_norm"), 1);
      if (this.options.columnShape === "type") rows.find((row) => row.column_name === "phone_norm").data_type = "character varying";
      if (this.options.columnShape === "nullability") rows.find((row) => row.column_name === "phone_norm").is_nullable = "YES";
      if (this.options.columnShape === "default") rows.find((row) => row.column_name === "phone_norm").column_default = "'unexpected'::text";
      return { rows };
    }
    if (text.includes("con.contype='p'")) return { rows: expectedPrimaryKeys(this.options.pkShape) };
    if (text.includes("con.contype='f'")) {
      return { rows: expectedForeignKeys(this.options.fkShape) };
    }
    if (text.includes("pg_get_constraintdef(oid)")) {
      const shape = this.applied ? "widened" : (this.options.methodShape || "legacy");
      const method = methodRow(shape);
      const rows = [
        ...(method ? [method] : []),
        { conname: "customer_history_claims_phone_norm_not_blank", definition: "CHECK ((length(btrim(phone_norm)) > 0))" },
        { conname: "customer_history_claims_phone_norm_canonical_check", definition: "CHECK ((phone_norm ~ '^0[0-9]{8,9}$'::text))" },
        { conname: "customer_history_claims_phone_last4_check", definition: "CHECK (((phone_last4 ~ '^[0-9]{4}$'::text) AND (phone_last4 = \"right\"(phone_norm, 4))))" },
      ];
      if (this.options.checkShape === "missing-not-blank") rows.splice(rows.findIndex((row) => row.conname === "customer_history_claims_phone_norm_not_blank"), 1);
      if (this.options.checkShape === "duplicate-method" && method) rows.push({ ...method, conname: "duplicate_method_check" });
      if (this.options.checkShape === "conflicting-phone") {
        rows.find((row) => row.conname === "customer_history_claims_phone_norm_canonical_check").definition = "CHECK ((phone_norm ~ '^0[0-9]{7,9}$'::text))";
      }
      return { rows };
    }
    if (text.includes("FROM pg_index ind")) return { rows: expectedIndexes(this.options.indexShape) };
    if (text.includes("row_fingerprint")) {
      return { rows: [{ row_count: String(this.options.rowCount || 2), row_fingerprint: this.options.fingerprint || "stable-fingerprint" }] };
    }
    return { rows: [] };
  }
}

function captureLogger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); }, error(value) { lines.push(String(value)); } };
}

async function runWith(client, options = {}) {
  const logger = captureLogger();
  const code = await runner.runCli({
    repoRoot: options.repoRoot || REPO_ROOT,
    argv: options.argv || [],
    env: { DATABASE_URL: "postgres://user:password@db.example.test/cwf", ...options.env },
    logger,
    clientFactory: () => client,
    verifyMigration: options.verifyMigration,
    migrationReader: options.migrationReader,
  });
  return { code, logger };
}

async function expectPreflightBlocked(client, expectedCode = runner.EXIT_CODE.SCHEMA_DRIFT) {
  let migrationRead = false;
  const result = await runWith(client, {
    argv: ["--apply"],
    env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE },
    verifyMigration() { migrationRead = true; },
    migrationReader() { migrationRead = true; return runner.readMigrationSql(REPO_ROOT); },
  });
  assert.equal(result.code, expectedCode);
  assert.equal(migrationRead, false, "schema drift must stop before reading migration SQL");
  assert.equal(client.queries.some((sql) => /ALTER TABLE/i.test(sql)), false, "schema drift must not execute ALTER");
  return result;
}

test("database config prefers DATABASE_URL and preserves connection settings", () => {
  const config = runner.createClientConfig({
    DATABASE_URL: "postgres://url-user:url-password@url-db.example.test/cwf",
    DB_HOST: "ignored-host",
  });
  assert.deepEqual(config, {
    connectionString: "postgres://url-user:url-password@url-db.example.test/cwf",
    options: "-c timezone=Asia/Bangkok",
    ssl: { rejectUnauthorized: false },
  });
});

test("database config supports split DB env and defaults DB_PORT to 5432", () => {
  const env = {
    DB_HOST: "production-db.internal",
    DB_USER: "cwf_backend",
    DB_PASSWORD: "split-password",
    DB_NAME: "cwf_production",
  };
  assert.deepEqual(runner.createClientConfig(env), {
    host: "production-db.internal",
    port: 5432,
    user: "cwf_backend",
    password: "split-password",
    database: "cwf_production",
    options: "-c timezone=Asia/Bangkok",
    ssl: { rejectUnauthorized: false },
  });
  assert.equal(runner.createClientConfig({ ...env, DB_PORT: "6432" }).port, 6432);
});

test("missing required split DB env fails before client creation", async () => {
  const completeEnv = {
    DB_HOST: "production-db.internal",
    DB_USER: "cwf_backend",
    DB_PASSWORD: "split-password",
    DB_NAME: "cwf_production",
  };
  for (const missingName of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
    const env = { ...completeEnv };
    delete env[missingName];
    const logger = captureLogger();
    let clientCreated = false;
    const code = await runner.runCli({
      env,
      argv: [],
      logger,
      clientFactory() {
        clientCreated = true;
        return new FakeClient();
      },
    });
    assert.equal(code, runner.EXIT_CODE.FAILED);
    assert.equal(clientCreated, false);
    assert.match(logger.lines.join("\n"), new RegExp(`missing required env: ${missingName}`));
  }
});

test("connection failures do not log URL, host, or password secrets", async () => {
  const cases = [
    {
      env: { DATABASE_URL: "postgres://private-user:private-pass@private-db.example.test/cwf" },
      message: "connection failed: postgres://private-user:private-pass@private-db.example.test/cwf",
      secrets: ["private-user", "private-pass", "private-db.example.test"],
    },
    {
      env: {
        DB_HOST: "private-db.internal",
        DB_USER: "private-user",
        DB_PASSWORD: "private-pass",
        DB_NAME: "cwf_production",
      },
      message: "connection to private-db.internal failed password=private-pass",
      secrets: ["private-db.internal", "private-pass"],
    },
  ];
  for (const testCase of cases) {
    const logger = captureLogger();
    const client = new FakeClient();
    client.connect = async () => { throw new Error(testCase.message); };
    const code = await runner.runCli({
      env: testCase.env,
      argv: [],
      logger,
      clientFactory: () => client,
    });
    assert.equal(code, runner.EXIT_CODE.FAILED);
    const output = logger.lines.join("\n");
    for (const secret of testCase.secrets) assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("legacy constraint is READY_TO_APPLY and preflight is read-only", async () => {
  const client = new FakeClient();
  const result = await runWith(client);
  assert.equal(result.code, 0);
  assert.deepEqual(result.logger.lines, ["CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION_STATUS=READY_TO_APPLY"]);
  assert.equal(client.queries.some((sql) => sql.includes("ALTER TABLE")), false);
});

test("exact widened constraint is ALREADY_APPLIED without running migration SQL", async () => {
  const client = new FakeClient({ methodShape: "widened" });
  const result = await runWith(client);
  assert.equal(result.code, 0);
  assert.deepEqual(result.logger.lines, ["CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION_STATUS=ALREADY_APPLIED"]);
  assert.equal(client.queries.some((sql) => sql.includes("ALTER TABLE")), false);
});

test("a successful apply followed by a second apply does not alter schema twice", async () => {
  const client = new FakeClient();
  const options = { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } };
  const first = await runWith(client, options);
  const second = await runWith(client, options);
  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.deepEqual(second.logger.lines, ["CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION_STATUS=ALREADY_APPLIED"]);
  assert.equal(client.queries.filter((sql) => sql.includes("ALTER TABLE")).length, 1);
});

test("missing claims table is PREREQUISITE_MISSING", async () => {
  const result = await expectPreflightBlocked(new FakeClient({ hasTable: false }), runner.EXIT_CODE.PREREQUISITE_MISSING);
  assert.match(result.logger.lines.join("\n"), /STATUS=PREREQUISITE_MISSING/);
});

test("missing, renamed, unknown-extra, and incomplete method constraints fail closed", async () => {
  for (const methodShape of ["missing", "renamed", "unknown", "missing-approved"]) {
    const result = await expectPreflightBlocked(new FakeClient({ methodShape }));
    assert.match(result.logger.lines.join("\n"), /STATUS=SCHEMA_DRIFT/);
  }
});

test("extra, missing, type, nullability, and default column drift fail before ALTER", async () => {
  for (const columnShape of ["extra", "missing", "type", "nullability", "default"]) {
    await expectPreflightBlocked(new FakeClient({ columnShape }));
  }
});

test("missing, wrong-column, and inconsistent-index primary keys fail before ALTER", async () => {
  for (const pkShape of ["missing", "wrong-column", "wrong-index"]) {
    await expectPreflightBlocked(new FakeClient({ pkShape }));
  }
  await expectPreflightBlocked(new FakeClient({ indexShape: "wrong-pk-index" }));
});

test("required CHECK constraints reject missing, duplicate, and conflicting shapes before ALTER", async () => {
  for (const checkShape of ["missing-not-blank", "duplicate-method", "conflicting-phone"]) {
    await expectPreflightBlocked(new FakeClient({ checkShape }));
  }
});

test("critical FKs reject wrong delete action, target, and duplicates before ALTER", async () => {
  for (const fkShape of ["wrong-delete", "wrong-target", "duplicate"]) {
    await expectPreflightBlocked(new FakeClient({ fkShape }));
  }
});

test("critical indexes reject wrong uniqueness, column, predicate, and duplicates before ALTER", async () => {
  for (const indexShape of ["wrong-unique", "wrong-column", "wrong-predicate", "duplicate"]) {
    await expectPreflightBlocked(new FakeClient({ indexShape }));
  }
});

test("wrong or missing confirmation token is rejected before connecting", async () => {
  for (const env of [{}, { [runner.CONFIRM_ENV]: "WRONG" }]) {
    const client = new FakeClient();
    const result = await runWith(client, { argv: ["--apply"], env });
    assert.equal(result.code, runner.EXIT_CODE.FAILED);
    assert.equal(client.connected, false);
  }
});

test("migration is transactional, locked, preserves existing rows, and verifies widened shape", async () => {
  const client = new FakeClient({ rowCount: 7, fingerprint: "same-seven-rows" });
  const result = await runWith(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, 0);
  assert.equal(client.applied, true);
  assert.deepEqual(result.logger.lines, [
    "CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION_APPLY_START",
    "CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION_OK",
  ]);
  const sql = runner.readMigrationSql(REPO_ROOT);
  assert.match(sql, /^--[\s\S]*\nBEGIN;/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '30s'/);
  assert.match(sql, new RegExp(`pg_advisory_xact_lock\\(${runner.ADVISORY_LOCK_KEY}\\)`));
  assert.match(sql, /NOT VALID[\s\S]*VALIDATE CONSTRAINT customer_history_claims_method_check/);
  assert.match(sql, /row_fingerprint/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

test("ALTER or VALIDATE failure rolls back the migration transaction", async () => {
  const client = new FakeClient({ alterError: "validate failed" });
  const result = await runWith(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, runner.EXIT_CODE.FAILED);
  assert.equal(client.rolledBack, true);
  assert.equal(client.ended, true);
});

test("migration checksum rejects tampering and is stable across CRLF", async () => {
  assert.equal(runner.migrationChecksum(REPO_ROOT), runner.EXPECTED_SHA256);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cwf-history-methods-"));
  fs.mkdirSync(path.join(tmp, "migrations"), { recursive: true });
  const sql = runner.readMigrationSql(REPO_ROOT);
  fs.writeFileSync(path.join(tmp, runner.MIGRATION_RELATIVE_PATH), sql.replace(/\r?\n/g, "\r\n"), "utf8");
  assert.equal(runner.migrationChecksum(tmp), runner.EXPECTED_SHA256);
  fs.writeFileSync(path.join(tmp, runner.MIGRATION_RELATIVE_PATH), `${sql}\n-- tampered\n`, "utf8");
  const client = new FakeClient();
  const result = await runWith(client, { repoRoot: tmp });
  assert.equal(result.code, runner.EXIT_CODE.SCHEMA_DRIFT);
  assert.equal(client.connected, true);
});

test("package exposes explicit claim-method check and apply commands", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["migrate:customer-history-claim-methods:check"], "node scripts/run-customer-history-claim-methods-migration.js");
  assert.equal(pkg.scripts["migrate:customer-history-claim-methods"], "node scripts/run-customer-history-claim-methods-migration.js");
});
