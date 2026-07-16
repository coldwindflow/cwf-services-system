"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runner = require("../scripts/run-customer-history-claims-migration");

const REPO_ROOT = path.resolve(__dirname, "..");

function logger() {
  const lines = [];
  return {
    lines,
    log(line) { lines.push(String(line)); },
    error(line) { lines.push(String(line)); },
  };
}

function expectedColumns() {
  return [
    ["claim_id", "bigint", "NO"],
    ["customer_sub", "text", "NO"],
    ["phone_norm", "text", "NO"],
    ["phone_last4", "text", "NO"],
    ["proof_job_id", "bigint", "NO"],
    ["claim_method", "text", "NO"],
    ["claimed_at", "timestamp with time zone", "NO"],
    ["last_verified_at", "timestamp with time zone", "NO"],
    ["revoked_at", "timestamp with time zone", "YES"],
    ["revoke_reason", "text", "YES"],
  ].map(([column_name, data_type, is_nullable]) => ({ column_name, data_type, is_nullable }));
}

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.queries = [];
    this.connected = false;
    this.ended = false;
    this.applied = false;
  }

  async connect() {
    this.connected = true;
    if (this.options.connectError) throw new Error(this.options.connectError);
  }

  async end() {
    this.ended = true;
    if (this.options.endError) throw new Error(this.options.endError);
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ sql: text, params });
    if (text.includes("pg_advisory_unlock") && this.options.unlockError) throw new Error(this.options.unlockError);
    if (text.includes("pg_try_advisory_lock")) return { rows: [{ locked: this.options.locked !== false }] };
    if (/^SET /.test(text)) return { rows: [] };
    if (text === "ROLLBACK") return { rows: [] };
    if (text.includes("CREATE TABLE IF NOT EXISTS public.customer_history_claims")) {
      if (this.options.migrationError) throw new Error(this.options.migrationError);
      this.applied = true;
      return { rows: [] };
    }
    if (text.includes("has_customer_profiles")) {
      return {
        rows: [{
          has_customer_profiles: this.options.hasCustomerProfiles !== false,
          has_jobs: this.options.hasJobs !== false,
          has_claims: !!(this.options.hasClaims || this.applied),
        }],
      };
    }
    if (text.includes("information_schema.columns") && text.includes("table_name='customer_history_claims'")) {
      if (this.options.schemaDrift === "missing_column") return { rows: expectedColumns().filter((row) => row.column_name !== "phone_norm") };
      return { rows: expectedColumns() };
    }
    if (text.includes("information_schema.columns") && text.includes("table_name='jobs'")) {
      return {
        rows: [
          { table_name: "jobs", column_name: "job_id", data_type: this.options.jobIdType || "bigint", is_nullable: "NO" },
          { table_name: "customer_profiles", column_name: "sub", data_type: "text", is_nullable: "NO" },
        ],
      };
    }
    if (text.includes("customer_profiles") && text.includes("con.contype IN")) {
      return { rows: this.options.subSupportsFk === false ? [] : [{ conname: "customer_profiles_pkey", column_names: ["sub"] }] };
    }
    if (text.includes("SELECT to_regclass('public.customer_history_claims') AS table_name")) {
      return { rows: [{ table_name: (this.options.hasClaims || this.applied) ? "customer_history_claims" : null }] };
    }
    if (text.includes("con.contype='f'")) {
      return {
        rows: [
          { conname: "fk_claim_customer", foreign_table: "customer_profiles", column_names: ["customer_sub"], foreign_column_names: ["sub"] },
          { conname: "fk_claim_job", foreign_table: "jobs", column_names: ["proof_job_id"], foreign_column_names: ["job_id"] },
        ],
      };
    }
    if (text.includes("pg_get_constraintdef")) {
      if (this.options.schemaDrift === "missing_check") return { rows: [] };
      return {
        rows: [
          { conname: "method", definition: "CHECK ((claim_method = 'booking_code_phone'::text))" },
          { conname: "phone_norm", definition: "CHECK ((phone_norm ~ '^0[0-9]{8,9}$'::text))" },
          { conname: "phone_last4", definition: "CHECK (((phone_last4 ~ '^[0-9]{4}$'::text) AND (phone_last4 = right(phone_norm, 4))))" },
        ],
      };
    }
    if (text.includes("FROM pg_indexes")) {
      if (this.options.schemaDrift === "missing_index") {
        return { rows: [] };
      }
      return {
        rows: [
          { indexname: "ux_customer_history_claims_active_phone", indexdef: "CREATE UNIQUE INDEX ux_customer_history_claims_active_phone ON public.customer_history_claims USING btree (phone_norm) WHERE (revoked_at IS NULL)" },
          { indexname: "ux_customer_history_claims_active_proof_job", indexdef: "CREATE UNIQUE INDEX ux_customer_history_claims_active_proof_job ON public.customer_history_claims USING btree (proof_job_id) WHERE (revoked_at IS NULL)" },
          { indexname: "idx_customer_history_claims_customer_sub", indexdef: "CREATE INDEX idx_customer_history_claims_customer_sub ON public.customer_history_claims USING btree (customer_sub) WHERE (revoked_at IS NULL)" },
        ],
      };
    }
    if (text.includes("COUNT(*)::bigint")) {
      return { rows: [{ count: String(this.options.rowCount || 0) }] };
    }
    return { rows: [] };
  }
}

async function runWithClient(client, options = {}) {
  const log = logger();
  const code = await runner.runCli({
    repoRoot: REPO_ROOT,
    argv: options.argv || [],
    env: {
      DATABASE_URL: "postgres://user:password@db.example.test:5432/cwf",
      ...options.env,
    },
    logger: log,
    clientFactory: () => client,
  });
  return { code, log, client };
}

test("default mode is read-only preflight and does not write", async () => {
  const client = new FakeClient({ hasClaims: false });
  const result = await runWithClient(client);
  assert.equal(result.code, 0);
  assert.deepEqual(result.log.lines, [
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_STATUS=READY_TO_APPLY",
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_PREFLIGHT_OK",
  ]);
  assert.equal(client.queries.some((q) => q.sql.includes("pg_try_advisory_lock")), false);
  assert.equal(client.queries.some((q) => q.sql.includes("CREATE TABLE IF NOT EXISTS public.customer_history_claims")), false);
  assert.equal(client.ended, true);
});

test("missing --apply or missing confirmation env is rejected before DB write", async () => {
  const noApplyClient = new FakeClient();
  const noApply = await runWithClient(noApplyClient, { env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(noApply.code, 1);
  assert.equal(noApplyClient.connected, false);

  const noConfirmClient = new FakeClient();
  const noConfirm = await runWithClient(noConfirmClient, { argv: ["--apply"] });
  assert.equal(noConfirm.code, 1);
  assert.equal(noConfirmClient.connected, false);
});

test("checksum mismatch fails before DB write", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cwf-history-claims-migration-"));
  fs.mkdirSync(path.join(tmp, "migrations"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "migrations", "20260710_customer_history_claims.sql"), "-- altered\n", "utf8");
  const client = new FakeClient();
  const log = logger();
  const code = await runner.runCli({
    repoRoot: tmp,
    argv: ["--apply"],
    env: { DATABASE_URL: "postgres://user:password@db.example.test/cwf", [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE },
    logger: log,
    clientFactory: () => client,
  });
  assert.equal(code, runner.EXIT_CODE.SCHEMA_DRIFT);
  assert.equal(client.connected, false);
  assert.match(log.lines.join("\n"), /CUSTOMER_HISTORY_CLAIMS_MIGRATION_FAILED/);
});

test("missing prerequisite schema and incorrect jobs.job_id type fail closed", async () => {
  const missing = await runWithClient(new FakeClient({ hasCustomerProfiles: false }));
  assert.equal(missing.code, runner.EXIT_CODE.PREREQUISITE_MISSING);
  assert.match(missing.log.lines.join("\n"), /STATUS=PREREQUISITE_MISSING/);

  const wrongType = await runWithClient(new FakeClient({ jobIdType: "integer" }));
  assert.equal(wrongType.code, runner.EXIT_CODE.PREREQUISITE_MISSING);
});

test("already-applied exact schema exits successfully without running migration", async () => {
  const client = new FakeClient({ hasClaims: true });
  const result = await runWithClient(client);
  assert.equal(result.code, 0);
  assert.deepEqual(result.log.lines, [
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_STATUS=ALREADY_APPLIED",
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_ALREADY_APPLIED",
  ]);
  assert.equal(client.queries.some((q) => q.sql.includes("CREATE TABLE IF NOT EXISTS public.customer_history_claims")), false);
});

test("schema drift fails closed", async () => {
  const result = await runWithClient(new FakeClient({ hasClaims: true, schemaDrift: "missing_index" }));
  assert.equal(result.code, runner.EXIT_CODE.SCHEMA_DRIFT);
  assert.match(result.log.lines.join("\n"), /STATUS=SCHEMA_DRIFT/);
});

test("advisory lock unavailable fails before migration SQL", async () => {
  const client = new FakeClient({ locked: false });
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, runner.EXIT_CODE.FAILED);
  assert.equal(client.queries.some((q) => q.sql.includes("CREATE TABLE IF NOT EXISTS public.customer_history_claims")), false);
  assert.equal(client.ended, true);
});

test("migration success uses lock, timeouts, verifies schema, and unlocks", async () => {
  const client = new FakeClient();
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, 0);
  assert.deepEqual(result.log.lines, [
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_APPLY_START",
    "CUSTOMER_HISTORY_CLAIMS_MIGRATION_OK",
  ]);
  const sqls = client.queries.map((q) => q.sql);
  assert.ok(sqls.some((s) => s.includes("pg_try_advisory_lock")));
  assert.ok(sqls.some((s) => s === "SET lock_timeout = '5s'"));
  assert.ok(sqls.some((s) => s === "SET statement_timeout = '60s'"));
  assert.ok(sqls.some((s) => s.includes("CREATE TABLE IF NOT EXISTS public.customer_history_claims")));
  assert.ok(sqls.some((s) => s.includes("pg_advisory_unlock")));
  assert.equal(client.ended, true);
});

test("migration SQL failure rolls back, unlocks, and closes", async () => {
  const client = new FakeClient({ migrationError: "boom" });
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, 1);
  const sqls = client.queries.map((q) => q.sql);
  const rollbackIndex = sqls.indexOf("ROLLBACK");
  const unlockIndex = sqls.findIndex((s) => s.includes("pg_advisory_unlock"));
  assert.ok(rollbackIndex >= 0);
  assert.ok(unlockIndex > rollbackIndex);
  assert.equal(client.ended, true);
});

test("post-apply verification failure exits non-zero and still unlocks", async () => {
  const client = new FakeClient({ schemaDrift: "missing_check" });
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, runner.EXIT_CODE.SCHEMA_DRIFT);
  assert.ok(client.queries.some((q) => q.sql.includes("pg_advisory_unlock")));
  assert.equal(client.ended, true);
});

test("secrets are redacted from failure logs", async () => {
  const client = new FakeClient({ connectError: "password authentication failed for user \"postgres\" at postgres://user:supersecret@host.example/db?token=abc" });
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  const output = result.log.lines.join("\n");
  assert.equal(result.code, 1);
  assert.match(output, /CUSTOMER_HISTORY_CLAIMS_MIGRATION_FAILED/);
  assert.doesNotMatch(output, /supersecret|host\.example|postgres"/);
  assert.match(output, /\[REDACTED/);
});

test("unlock and client.end run after lock-protected errors", async () => {
  const client = new FakeClient({ migrationError: "db failed" });
  const result = await runWithClient(client, { argv: ["--apply"], env: { [runner.CONFIRM_ENV]: runner.CONFIRM_VALUE } });
  assert.equal(result.code, 1);
  assert.ok(client.queries.some((q) => q.sql.includes("pg_advisory_unlock")));
  assert.equal(client.ended, true);
});

test("package exposes explicit check and apply commands", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["migrate:customer-history-claims:check"], "node scripts/run-customer-history-claims-migration.js");
  assert.equal(pkg.scripts["migrate:customer-history-claims"], "node scripts/run-customer-history-claims-migration.js");
});

test("migration checksum is stable across LF and CRLF checkouts", () => {
  assert.equal(runner.migrationChecksum(REPO_ROOT), runner.EXPECTED_SHA256);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cwf-history-claims-eol-"));
  fs.mkdirSync(path.join(tmp, "migrations"), { recursive: true });
  const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8").replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(path.join(tmp, runner.MIGRATION_RELATIVE_PATH), sql, "utf8");
  assert.equal(runner.migrationChecksum(tmp), runner.EXPECTED_SHA256);
});
