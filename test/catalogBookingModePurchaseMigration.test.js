"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-catalog-booking-mode-purchase-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.ended = false;
    this.queries = [];
  }
  async connect() { if (this.options.failConnect) throw new Error(this.options.failConnect); }
  async query(sql, params) {
    this.queries.push({ sql, params });
    if (String(sql).includes("pg_get_constraintdef")) {
      if (this.options.missingConstraint) return { rows: [] };
      const modes = this.options.withoutPurchase ? "'bookable', 'contact_admin'" : "'bookable', 'contact_admin', 'purchase'";
      return { rows: [{ def: `CHECK ((booking_mode = ANY (ARRAY[${modes}])))` }] };
    }
    return { rows: [] };
  }
  async end() { this.ended = true; }
}

function makeLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

test("booking-mode-purchase migration runs the exact SQL under an advisory lock and verifies the constraint allows 'purchase'", async () => {
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
  assert.deepEqual(logger.lines, ["CATALOG_BOOKING_MODE_PURCHASE_MIGRATION_START", "CATALOG_BOOKING_MODE_PURCHASE_MIGRATION_OK"]);
});

test("booking-mode-purchase migration fails if the constraint still does not allow 'purchase'", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ withoutPurchase: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /does not allow 'purchase'/);
});

test("booking-mode-purchase migration fails if the constraint is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ missingConstraint: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /constraint missing after migration/);
});

test("booking-mode-purchase migration only widens the constraint (no destructive statements) and is idempotent", () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  const executable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(executable, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(executable, /\bTRUNCATE\b/i);
  // Widens the allowed set to include all three modes.
  assert.match(executable, /DROP CONSTRAINT IF EXISTS catalog_items_booking_mode_check/);
  assert.match(executable, /CHECK \(booking_mode IN \('bookable', 'contact_admin', 'purchase'\)\)/);
});

test("booking-mode-purchase migration runner never leaks database secrets", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL }, repoRoot: REPO_ROOT, logger,
    clientFactory() { return new FakeClient({ failConnect: `cannot connect ${DATABASE_URL}` }); },
  });
  assert.equal(code, 1);
  const out = logger.lines.join("\n");
  assert.doesNotMatch(out, /super-secret-password/);
  assert.match(out, /\[REDACTED_DATABASE_URL\]/);
});

test("booking-mode-purchase migration runner uses a distinct advisory lock", () => {
  const orders = require("../scripts/run-customer-orders-migration");
  const homepageCms = require("../scripts/run-homepage-cms-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, orders.ADVISORY_LOCK_KEY);
  assert.notEqual(runner.ADVISORY_LOCK_KEY, homepageCms.ADVISORY_LOCK_KEY);
});
