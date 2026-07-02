"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-customer-orders-payment-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

const PAY_COLUMNS = ["payment_provider", "payment_method", "payment_charge_id", "payment_status", "paid_at"];

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.ended = false;
    this.queries = [];
  }
  async connect() { if (this.options.failConnect) throw new Error(this.options.failConnect); }
  async query(sql) {
    this.queries.push({ sql: String(sql) });
    const s = String(sql);
    if (s.includes("to_regclass('public.customer_orders')")) {
      return { rows: [{ orders: this.options.missingTable ? null : "public.customer_orders" }] };
    }
    if (s.includes("information_schema.columns")) {
      const cols = this.options.missingColumn ? PAY_COLUMNS.filter((c) => c !== "paid_at") : PAY_COLUMNS;
      return { rows: cols.map((column_name) => ({ column_name })) };
    }
    return { rows: [] };
  }
  async end() { this.ended = true; }
}

function makeLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

test("payment migration runner runs the SQL under an advisory lock, verifies, and unlocks", async () => {
  let client;
  const logger = makeLogger();
  await runner.runMigration({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { client = new FakeClient(); return client; },
  });
  const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.equal(client.queries[0].sql, "SELECT pg_advisory_lock($1::bigint)");
  assert.equal(client.queries[1].sql, sql);
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.equal(client.ended, true);
  assert.deepEqual(logger.lines, ["CUSTOMER_ORDERS_PAYMENT_MIGRATION_START", "CUSTOMER_ORDERS_PAYMENT_MIGRATION_OK"]);
});

test("payment migration runner fails non-zero when a payment column is missing after migration", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ missingColumn: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /customer_orders\.paid_at missing after migration/);
});

test("payment migration runner never leaks database secrets", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ failConnect: `cannot connect ${DATABASE_URL}` }); },
  });
  assert.equal(code, 1);
  const output = logger.lines.join("\n");
  assert.doesNotMatch(output, /super-secret-password/);
  assert.match(output, /\[REDACTED_DATABASE_URL\]/);
});

test("payment migration is additive only and idempotent (safe to re-run on a live DB)", () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  const executable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(executable, /\bTRUNCATE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+(TABLE|COLUMN)\b/i);
  // Only additive ADD COLUMN IF NOT EXISTS on the existing table.
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payment_provider/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS paid_at/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(executable, /\bUPDATE\s+public/i); // never backfills/rewrites rows
});

test("payment migration runner uses an advisory lock distinct from the base orders runner", () => {
  const base = require("../scripts/run-customer-orders-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, base.ADVISORY_LOCK_KEY);
});
