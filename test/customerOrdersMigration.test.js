"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-customer-orders-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

const ORDER_COLUMNS = ["order_code", "customer_name", "customer_phone", "delivery_method", "install_option", "items", "subtotal", "status"];

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.connected = false;
    this.ended = false;
    this.queries = [];
  }
  async connect() {
    this.connected = true;
    if (this.options.failConnect) throw new Error(this.options.failConnect);
  }
  async query(sql, params) {
    this.queries.push({ sql, params });
    const s = String(sql);
    if (s.includes("to_regclass('public.customer_orders')")) {
      return { rows: [{ orders: this.options.missingTable ? null : "public.customer_orders" }] };
    }
    if (s.includes("information_schema.columns")) {
      const cols = this.options.missingColumn ? ORDER_COLUMNS.filter((c) => c !== "status") : ORDER_COLUMNS;
      return { rows: cols.map((column_name) => ({ column_name })) };
    }
    return { rows: [] };
  }
  async end() {
    this.ended = true;
    if (this.options.failEnd) throw new Error(this.options.failEnd);
  }
}

function makeLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

test("customer-orders migration runner runs the exact SQL under an advisory lock, verifies, and unlocks", async () => {
  let client;
  const logger = makeLogger();
  await runner.runMigration({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory(config) {
      assert.equal(config.connectionString, DATABASE_URL);
      client = new FakeClient();
      return client;
    },
  });
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.equal(client.queries[0].sql, "SELECT pg_advisory_lock($1::bigint)");
  assert.deepEqual(client.queries[0].params, [runner.ADVISORY_LOCK_KEY]);
  assert.equal(client.queries[1].sql, migrationSql);
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.equal(client.ended, true);
  assert.deepEqual(logger.lines, ["CUSTOMER_ORDERS_MIGRATION_START", "CUSTOMER_ORDERS_MIGRATION_OK"]);
});

test("customer-orders migration runner fails non-zero when the table is missing after migration", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ missingTable: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /customer_orders table missing after migration/);
});

test("customer-orders migration runner fails non-zero when a required column is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ missingColumn: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /customer_orders\.status missing after migration/);
});

test("customer-orders migration runner never leaks database secrets", async () => {
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

test("customer-orders migration is additive only and idempotent (safe to re-run, cannot break the app)", () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  const executable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(executable, /\bTRUNCATE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(executable, /\bALTER\s+TABLE\b/i); // touches no existing table
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.customer_orders/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS/);
});

test("customer-orders migration runner uses an advisory lock distinct from other runners", () => {
  const homepageCms = require("../scripts/run-homepage-cms-migration");
  const customerAuth = require("../scripts/run-customer-auth-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, homepageCms.ADVISORY_LOCK_KEY);
  assert.notEqual(runner.ADVISORY_LOCK_KEY, customerAuth.ADVISORY_LOCK_KEY);
});
