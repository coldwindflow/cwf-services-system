"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-catalog-store-media-pricing-migration");

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
    if (this.aborted && sql !== "ROLLBACK") throw new Error("current transaction is aborted");
    if (sql === "ROLLBACK") {
      if (this.options.failRollback) throw new Error(this.options.failRollback);
      this.aborted = false;
      return { rows: [] };
    }
    if (String(sql).includes("pg_advisory_unlock") && this.options.failUnlock) throw new Error(this.options.failUnlock);
    if (this.options.failSql && String(sql).includes("BEGIN;")) {
      this.aborted = true;
      throw new Error(this.options.failSql);
    }
    if (String(sql).includes("to_regclass('public.catalog_items')")) {
      return { rows: [{ catalog_items: this.options.missingTable ? null : "public.catalog_items" }] };
    }
    if (String(sql).includes("information_schema.columns")) {
      return {
        rows: this.options.missingColumn ? [{ column_name: "image_url", data_type: "text" }] : [
          { column_name: "image_public_id", data_type: "text" },
          { column_name: "image_url", data_type: "text" },
          { column_name: "price_rule_id", data_type: "bigint" },
        ],
      };
    }
    if (String(sql).includes("pg_indexes")) {
      return {
        rows: this.options.missingIndex ? [] : [
          { indexname: "idx_catalog_items_price_rule_id" },
        ],
      };
    }
    if (String(sql).includes("pg_constraint")) {
      return {
        rows: this.options.missingFk ? [] : [
          { constraint_name: "catalog_items_price_rule_id_fkey" },
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

test("migration runner fails safely when DATABASE_URL is missing", async () => {
  let created = false;
  let fileRead = false;
  const logger = makeLogger();
  const originalRead = fs.readFileSync;
  fs.readFileSync = (...args) => {
    fileRead = true;
    return originalRead(...args);
  };
  try {
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
    assert.equal(fileRead, false);
    assert.match(logger.lines.join("\n"), /CATALOG_STORE_MEDIA_PRICING_MIGRATION_FAILED: DATABASE_URL is required/);
  } finally {
    fs.readFileSync = originalRead;
  }
});

test("migration runner executes the exact merged SQL file and verifies schema", async () => {
  let client;
  const logger = makeLogger();
  await runner.runMigration({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory(config) {
      assert.equal(config.connectionString, DATABASE_URL);
      assert.deepEqual(config.ssl, { rejectUnauthorized: false });
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
  assert.deepEqual(logger.lines, ["CATALOG_STORE_MEDIA_PRICING_MIGRATION_START", "CATALOG_STORE_MEDIA_PRICING_MIGRATION_OK"]);
});

test("migration runner releases advisory lock and closes connection on SQL failure", async () => {
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
  assert.match(logger.lines.join("\n"), /CATALOG_STORE_MEDIA_PRICING_MIGRATION_FAILED: migration boom/);
});

test("migration failure rolls back before unlock and preserves original error", async () => {
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
  const migrationIndex = client.queries.findIndex((q) => String(q.sql).includes("BEGIN;"));
  const rollbackIndex = client.queries.findIndex((q) => q.sql === "ROLLBACK");
  const unlockIndex = client.queries.findIndex((q) => q.sql === "SELECT pg_advisory_unlock($1::bigint)");
  assert.ok(migrationIndex >= 0);
  assert.ok(rollbackIndex > migrationIndex);
  assert.ok(unlockIndex > rollbackIndex);
  assert.match(logger.lines.join("\n"), /CATALOG_STORE_MEDIA_PRICING_MIGRATION_FAILED: migration boom/);
  assert.doesNotMatch(logger.lines.join("\n"), /current transaction is aborted/);
});

test("rollback unlock and end cleanup errors do not mask migration failure", async () => {
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
  assert.equal(client.queries.at(-2).sql, "ROLLBACK");
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  const output = logger.lines.join("\n");
  assert.match(output, /CATALOG_STORE_MEDIA_PRICING_MIGRATION_FAILED: migration boom/);
  assert.doesNotMatch(output, /rollback boom/);
  assert.doesNotMatch(output, /unlock boom/);
  assert.doesNotMatch(output, /end boom/);
  assert.doesNotMatch(output, /current transaction is aborted/);
});

test("migration runner fails non-zero when post-migration verification fails (missing FK)", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ missingFk: true });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.equal(client.ended, true);
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.match(logger.lines.join("\n"), /catalog_items_price_rule_id_fkey missing/);
  assert.doesNotMatch(logger.lines.join("\n"), /CATALOG_STORE_MEDIA_PRICING_MIGRATION_OK/);
});

test("migration runner does not attempt a misleading post-commit ROLLBACK when verification fails", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ missingFk: true });
      return client;
    },
  });
  assert.equal(code, 1);
  // The migration SQL itself contains its own internal BEGIN/COMMIT, so by the
  // time post-commit verifySchema() runs and finds a problem, the transaction has
  // already committed — a ROLLBACK at this point would be a no-op at best and
  // misleading at worst. The runner correctly does not issue one here.
  assert.equal(client.queries.some((q) => q.sql === "ROLLBACK"), false);
});

test("migration runner fails non-zero when the new index is missing", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ missingIndex: true });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.match(logger.lines.join("\n"), /idx_catalog_items_price_rule_id missing/);
});

test("migration runner closes connection when connect fails before advisory lock", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ failConnect: "connect boom" });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.equal(client.ended, true);
  assert.equal(client.queries.length, 0);
});

test("migration runner does not print database secrets", async () => {
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      return new FakeClient({ failConnect: `cannot connect ${DATABASE_URL}` });
    },
  });
  const output = logger.lines.join("\n");
  assert.equal(code, 1);
  assert.doesNotMatch(output, /super-secret-password/);
  assert.doesNotMatch(output, /db\.example\.invalid/);
  assert.match(output, /\[REDACTED_DATABASE_URL\]/);
});

test("migration file path is fixed to the expected SQL file", () => {
  assert.equal(runner.MIGRATION_RELATIVE_PATH, "migrations/20260622_catalog_store_media_pricing.sql");
  assert.equal(
    runner.resolveMigrationPath(REPO_ROOT),
    path.join(REPO_ROOT, "migrations", "20260622_catalog_store_media_pricing.sql")
  );
});

test("migration SQL is additive only: no DELETE/TRUNCATE/DROP TABLE statements", () => {
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

test("migration SQL uses IF NOT EXISTS / idempotent guards for every additive statement", () => {
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS image_url/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS image_public_id/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS price_rule_id/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_catalog_items_price_rule_id/);
  assert.match(migrationSql, /IF NOT EXISTS \(\s*SELECT 1\s*FROM pg_constraint con/);
});

test("migration SQL's FK existence check is scoped to schema public + table catalog_items + constraint name, not just conname", () => {
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.match(migrationSql, /JOIN pg_class rel ON rel\.oid = con\.conrelid/);
  assert.match(migrationSql, /JOIN pg_namespace nsp ON nsp\.oid = rel\.relnamespace/);
  assert.match(migrationSql, /nsp\.nspname = 'public'/);
  assert.match(migrationSql, /rel\.relname = 'catalog_items'/);
  assert.match(migrationSql, /con\.contype = 'f'/);
  assert.match(migrationSql, /con\.conname = 'catalog_items_price_rule_id_fkey'/);
});

// Real-Postgres integration test: the DO block's existence check must be scoped to
// public.catalog_items, not just "any constraint with this conname anywhere in the DB".
// Mirrors the test.before()/skip-when-unavailable pattern used by the other
// *.integration.test.js files in this repo.
test("real Postgres: migration still adds the FK to catalog_items even when an identically-named constraint already exists on a different table", async (t) => {
  const { Pool } = require("pg");
  const PG_CONFIG = {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "cwf_test",
  };
  const pool = new Pool(PG_CONFIG);
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    await pool.end().catch(() => {});
    t.skip(`Postgres integration database unavailable: ${e.message}`);
    return;
  }

  try {
    await pool.query("DROP TABLE IF EXISTS public.catalog_items_phase2a2_test CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.customer_service_price_rules_phase2a2_test CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.catalog_items CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.customer_service_price_rules CASCADE");

    // A different table that happens to use the exact same constraint name —
    // this must NOT make the migration think catalog_items already has its FK.
    await pool.query(`
      CREATE TABLE public.customer_service_price_rules (rule_id BIGSERIAL PRIMARY KEY)
    `);
    await pool.query(`
      CREATE TABLE public.catalog_items_phase2a2_test (
        decoy_id BIGINT REFERENCES public.customer_service_price_rules(rule_id)
      )
    `);
    await pool.query(`
      ALTER TABLE public.catalog_items_phase2a2_test
        RENAME CONSTRAINT catalog_items_phase2a2_test_decoy_id_fkey TO catalog_items_price_rule_id_fkey
    `);

    await pool.query(`
      CREATE TABLE public.catalog_items (
        item_id BIGSERIAL PRIMARY KEY,
        item_name TEXT
      )
    `);

    const sql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
    await pool.query(sql);

    const constraints = await pool.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'catalog_items'
        AND con.contype = 'f'
        AND con.conname = 'catalog_items_price_rule_id_fkey'
    `);
    assert.equal(constraints.rows.length, 1, "catalog_items should have its own price_rule_id FK despite the decoy on another table");
  } finally {
    await pool.query("DROP TABLE IF EXISTS public.catalog_items CASCADE").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS public.catalog_items_phase2a2_test CASCADE").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS public.customer_service_price_rules CASCADE").catch(() => {});
    await pool.end().catch(() => {});
  }
});

test("migration runner uses an advisory lock distinct from the customer-auth migration", () => {
  const customerAuthRunner = require("../scripts/run-customer-auth-migration");
  assert.notEqual(runner.ADVISORY_LOCK_KEY, customerAuthRunner.ADVISORY_LOCK_KEY);
});
