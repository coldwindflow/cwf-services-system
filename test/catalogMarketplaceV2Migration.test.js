"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-catalog-marketplace-v2-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

const MARKETPLACE_COLUMNS = [
  { column_name: "short_description", data_type: "text" },
  { column_name: "long_description", data_type: "text" },
  { column_name: "highlights", data_type: "jsonb" },
  { column_name: "service_conditions", data_type: "text" },
  { column_name: "booking_mode", data_type: "text" },
  { column_name: "booking_service_key", data_type: "text" },
  { column_name: "booking_ac_type", data_type: "text" },
  { column_name: "booking_btu", data_type: "integer" },
  { column_name: "booking_wash_variant", data_type: "text" },
  { column_name: "is_featured", data_type: "boolean" },
];

const IMAGE_TABLE_COLUMNS = [
  { column_name: "image_id", data_type: "bigint" },
  { column_name: "item_id", data_type: "bigint" },
  { column_name: "image_url", data_type: "text" },
  { column_name: "image_public_id", data_type: "text" },
  { column_name: "alt_text", data_type: "text" },
  { column_name: "sort_order", data_type: "integer" },
  { column_name: "is_primary", data_type: "boolean" },
  { column_name: "created_at", data_type: "timestamp with time zone" },
];

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.connected = false;
    this.ended = false;
    this.queries = [];
    this.aborted = false;
  }

  async connect() {
    this.connected = true;
    if (this.options.failConnect) throw new Error(this.options.failConnect);
  }

  async query(sql, params) {
    this.queries.push({ sql, params });
    const s = String(sql);
    if (this.aborted && sql !== "ROLLBACK") throw new Error("current transaction is aborted");
    if (sql === "ROLLBACK") {
      if (this.options.failRollback) throw new Error(this.options.failRollback);
      this.aborted = false;
      return { rows: [] };
    }
    if (s.includes("pg_advisory_unlock") && this.options.failUnlock) throw new Error(this.options.failUnlock);
    if (this.options.failSql && s.includes("BEGIN;")) {
      this.aborted = true;
      throw new Error(this.options.failSql);
    }
    if (s.includes("to_regclass('public.catalog_item_images')")) {
      return { rows: [{ catalog_item_images: this.options.missingTable ? null : "public.catalog_item_images" }] };
    }
    if (s.includes("table_name = 'catalog_items'") && s.includes("information_schema.columns")) {
      return { rows: this.options.missingColumn ? MARKETPLACE_COLUMNS.slice(0, 3) : MARKETPLACE_COLUMNS };
    }
    if (s.includes("table_name = 'catalog_item_images'") && s.includes("information_schema.columns")) {
      return { rows: this.options.missingImageColumn ? IMAGE_TABLE_COLUMNS.slice(0, 3) : IMAGE_TABLE_COLUMNS };
    }
    if (s.includes("pg_indexes")) {
      return { rows: this.options.missingIndex ? [] : [{ indexname: "idx_catalog_item_images_item_id" }] };
    }
    if (s.includes("con.contype = 'f'")) {
      return { rows: this.options.missingFk ? [] : [{ constraint_name: "catalog_item_images_item_id_fkey" }] };
    }
    if (s.includes("con.contype = 'c'")) {
      return { rows: this.options.missingCheck ? [] : [{ constraint_name: "catalog_items_booking_mode_check" }] };
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
  return {
    lines,
    log(message) { lines.push(String(message)); },
    error(message) { lines.push(String(message)); },
  };
}

test("marketplace v2 migration runner fails safely when DATABASE_URL is missing", async () => {
  let created = false;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: {},
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      created = true;
      return new FakeClient();
    },
  });
  assert.equal(code, 1);
  assert.equal(created, false);
  assert.match(logger.lines.join("\n"), /CATALOG_MARKETPLACE_V2_MIGRATION_FAILED: DATABASE_URL is required/);
});

test("marketplace v2 migration runner executes the exact merged SQL file and verifies schema", async () => {
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
  assert.deepEqual(logger.lines, ["CATALOG_MARKETPLACE_V2_MIGRATION_START", "CATALOG_MARKETPLACE_V2_MIGRATION_OK"]);
});

test("marketplace v2 migration runner rolls back before unlock on SQL failure, preserving original error", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ failSql: "migration boom" });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.equal(client.ended, true);
  assert.equal(client.queries.at(-2).sql, "ROLLBACK");
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.match(logger.lines.join("\n"), /CATALOG_MARKETPLACE_V2_MIGRATION_FAILED: migration boom/);
});

test("marketplace v2 migration runner cleanup errors never mask the original failure or leak secrets", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({
        failSql: "migration boom",
        failRollback: "rollback boom",
        failUnlock: "unlock boom",
        failEnd: "end boom",
      });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.equal(client.ended, true);
  const output = logger.lines.join("\n");
  assert.match(output, /CATALOG_MARKETPLACE_V2_MIGRATION_FAILED: migration boom/);
  assert.doesNotMatch(output, /rollback boom/);
  assert.doesNotMatch(output, /unlock boom/);
  assert.doesNotMatch(output, /end boom/);
});

test("marketplace v2 migration runner fails non-zero when catalog_item_images table is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ missingTable: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_item_images table missing/);
});

test("marketplace v2 migration runner fails non-zero when a marketplace column is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ missingColumn: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_items\..* missing after migration/);
});

test("marketplace v2 migration runner fails non-zero when the booking_mode CHECK constraint is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ missingCheck: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_items_booking_mode_check missing/);
});

test("marketplace v2 migration runner fails non-zero when the item_id FK is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ missingFk: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_item_images_item_id_fkey missing/);
});

test("marketplace v2 migration runner does not print database secrets", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ failConnect: `cannot connect ${DATABASE_URL}` }); },
  });
  const output = logger.lines.join("\n");
  assert.equal(code, 1);
  assert.doesNotMatch(output, /super-secret-password/);
  assert.match(output, /\[REDACTED_DATABASE_URL\]/);
});

test("marketplace v2 migration SQL is additive only: no DELETE/TRUNCATE/DROP TABLE/DROP COLUMN", () => {
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  const executable = migrationSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executable, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(executable, /\bTRUNCATE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(executable, /\bDROP\s+COLUMN\b/i);
});

test("marketplace v2 migration SQL uses IF NOT EXISTS / idempotent guards", () => {
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS short_description/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS booking_mode/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.catalog_item_images/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_catalog_item_images_item_id/);
  assert.match(migrationSql, /IF NOT EXISTS \(\s*SELECT 1\s*FROM pg_constraint con/);
});

test("marketplace v2 migration runner uses an advisory lock distinct from other migration runners", () => {
  const mediaPricingRunner = require("../scripts/run-catalog-store-media-pricing-migration");
  const customerAuthRunner = require("../scripts/run-customer-auth-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, mediaPricingRunner.ADVISORY_LOCK_KEY);
  assert.notEqual(runner.ADVISORY_LOCK_KEY, customerAuthRunner.ADVISORY_LOCK_KEY);
});
