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
      if (this.options.schemaDrift === "default") rows.find((row) => row.column_name === "claim_method").column_default = null;
      return { rows };
    }
    if (text.includes("con.contype='f'")) {
      return { rows: [
        { conname: "fk_customer", foreign_table: "customer_profiles", column_names: ["customer_sub"], foreign_column_names: ["sub"] },
        { conname: "fk_job", foreign_table: "jobs", column_names: ["proof_job_id"], foreign_column_names: ["job_id"] },
      ] };
    }
    if (text.includes("pg_get_constraintdef(oid)")) {
      const shape = this.applied ? "widened" : (this.options.methodShape || "legacy");
      const method = methodRow(shape);
      return { rows: [
        ...(method ? [method] : []),
        { conname: "customer_history_claims_phone_norm_canonical_check", definition: "CHECK ((phone_norm ~ '^0[0-9]{8,9}$'::text))" },
        { conname: "customer_history_claims_phone_last4_check", definition: "CHECK (((phone_last4 ~ '^[0-9]{4}$'::text) AND (phone_last4 = \"right\"(phone_norm, 4))))" },
      ] };
    }
    if (text.includes("FROM pg_indexes")) {
      return { rows: [
        { indexname: "ux_customer_history_claims_active_phone", indexdef: "CREATE UNIQUE INDEX ux_customer_history_claims_active_phone ON public.customer_history_claims (phone_norm) WHERE revoked_at IS NULL" },
        { indexname: "ux_customer_history_claims_active_proof_job", indexdef: "CREATE UNIQUE INDEX ux_customer_history_claims_active_proof_job ON public.customer_history_claims (proof_job_id) WHERE revoked_at IS NULL" },
        { indexname: "idx_customer_history_claims_customer_sub", indexdef: "CREATE INDEX idx_customer_history_claims_customer_sub ON public.customer_history_claims (customer_sub) WHERE revoked_at IS NULL" },
      ] };
    }
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
  });
  return { code, logger };
}

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
  const result = await runWith(new FakeClient({ hasTable: false }));
  assert.equal(result.code, runner.EXIT_CODE.PREREQUISITE_MISSING);
  assert.match(result.logger.lines.join("\n"), /STATUS=PREREQUISITE_MISSING/);
});

test("missing, renamed, unknown-extra, and incomplete method constraints fail closed", async () => {
  for (const methodShape of ["missing", "renamed", "unknown", "missing-approved"]) {
    const result = await runWith(new FakeClient({ methodShape }));
    assert.equal(result.code, runner.EXIT_CODE.SCHEMA_DRIFT, methodShape);
    assert.match(result.logger.lines.join("\n"), /STATUS=SCHEMA_DRIFT/);
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
  assert.equal(client.connected, false);
});

test("package exposes explicit claim-method check and apply commands", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["migrate:customer-history-claim-methods:check"], "node scripts/run-customer-history-claim-methods-migration.js");
  assert.equal(pkg.scripts["migrate:customer-history-claim-methods"], "node scripts/run-customer-history-claim-methods-migration.js");
});
