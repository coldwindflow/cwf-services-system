"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-catalog-autoplay-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

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
    if (this.options.failSql && s.includes("ALTER TABLE public.catalog_items")) {
      this.aborted = true;
      throw new Error(this.options.failSql);
    }
    if (s.includes("column_name = 'is_autoplay_enabled'") && s.includes("information_schema.columns")) {
      if (this.options.missingColumn) return { rows: [] };
      return {
        rows: [
          {
            column_name: "is_autoplay_enabled",
            data_type: this.options.wrongType ? "text" : "boolean",
            is_nullable: this.options.nullable ? "YES" : "NO",
            column_default: "true",
          },
        ],
      };
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

test("autoplay migration runner fails safely when DATABASE_URL is missing", async () => {
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
  assert.match(logger.lines.join("\n"), /CATALOG_AUTOPLAY_MIGRATION_FAILED: DATABASE_URL is required/);
});

test("autoplay migration runner executes the exact merged SQL file and verifies schema", async () => {
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
  assert.equal(client.queries[1].sql, "BEGIN");
  assert.equal(client.queries[2].sql, runner.stripOuterTransactionWrapper(migrationSql));
  assert.ok(client.queries.some((q) => q.sql === "COMMIT"));
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.equal(client.ended, true);
  assert.deepEqual(logger.lines, ["CATALOG_AUTOPLAY_MIGRATION_START", "CATALOG_AUTOPLAY_MIGRATION_OK"]);
});

test("autoplay migration runner rolls back before unlock on SQL failure, preserving original error", async () => {
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
  assert.match(logger.lines.join("\n"), /CATALOG_AUTOPLAY_MIGRATION_FAILED: migration boom/);
});

test("autoplay migration runner cleanup errors never mask the original failure or leak secrets", async () => {
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
  assert.match(output, /CATALOG_AUTOPLAY_MIGRATION_FAILED: migration boom/);
  assert.doesNotMatch(output, /rollback boom/);
  assert.doesNotMatch(output, /unlock boom/);
  assert.doesNotMatch(output, /end boom/);
});

test("autoplay migration runner fails non-zero when is_autoplay_enabled column is missing", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ missingColumn: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_items\.is_autoplay_enabled missing after migration/);
});

test("autoplay migration runner rolls back (not commits) when post-body schema verification fails", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ missingColumn: true });
      return client;
    },
  });
  assert.equal(code, 1);
  const sqls = client.queries.map((q) => q.sql);
  assert.ok(sqls.includes("BEGIN"));
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.ok(sqls.some((sql) => sql === runner.stripOuterTransactionWrapper(migrationSql)));
  assert.ok(!sqls.includes("COMMIT"), "a failed verification must never reach COMMIT");
  const rollbackIndex = sqls.lastIndexOf("ROLLBACK");
  const unlockIndex = sqls.findIndex((sql) => String(sql).includes("pg_advisory_unlock"));
  assert.ok(rollbackIndex !== -1, "ROLLBACK must be issued when verification fails");
  assert.ok(rollbackIndex < unlockIndex, "ROLLBACK must happen before the advisory unlock");
  assert.equal(client.ended, true);
});

test("autoplay migration runner fails non-zero when is_autoplay_enabled has the wrong type", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ wrongType: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_items\.is_autoplay_enabled has unexpected type/);
});

test("autoplay migration runner fails non-zero when is_autoplay_enabled is unexpectedly nullable", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() { return new FakeClient({ nullable: true }); },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /catalog_items\.is_autoplay_enabled is unexpectedly nullable/);
});

test("autoplay migration runner does not print database secrets", async () => {
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

test("autoplay migration SQL is additive only: no DELETE/TRUNCATE/DROP TABLE/DROP COLUMN", () => {
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

test("autoplay migration SQL uses IF NOT EXISTS / idempotent guards", () => {
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS is_autoplay_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
});

test("autoplay migration runner uses an advisory lock distinct from other migration runners", () => {
  const mediaPricingRunner = require("../scripts/run-catalog-store-media-pricing-migration");
  const customerAuthRunner = require("../scripts/run-customer-auth-migration");
  const marketplaceV2Runner = require("../scripts/run-catalog-marketplace-v2-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, mediaPricingRunner.ADVISORY_LOCK_KEY);
  assert.notEqual(runner.ADVISORY_LOCK_KEY, customerAuthRunner.ADVISORY_LOCK_KEY);
  assert.notEqual(runner.ADVISORY_LOCK_KEY, marketplaceV2Runner.ADVISORY_LOCK_KEY);
});
