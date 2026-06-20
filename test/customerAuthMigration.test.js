"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const runner = require("../scripts/run-customer-auth-migration");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = "postgres://user:super-secret-password@db.example.invalid:5432/cwf";

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
    if (this.options.failSql && String(sql).includes("BEGIN;")) throw new Error(this.options.failSql);
    if (String(sql).includes("to_regclass('public.customer_identities')")) {
      return { rows: [{ customer_identities: this.options.missingTable ? null : "public.customer_identities" }] };
    }
    if (String(sql).includes("information_schema.columns")) {
      return {
        rows: this.options.missingColumn ? [{ column_name: "email", data_type: "text" }] : [
          { column_name: "email", data_type: "text" },
          { column_name: "email_verified", data_type: "boolean" },
        ],
      };
    }
    if (String(sql).includes("pg_constraint")) {
      return {
        rows: this.options.missingUnique ? [] : [
          { constraint_name: "customer_identities_provider_provider_subject_key", column_names: ["provider", "provider_subject"] },
        ],
      };
    }
    if (String(sql).includes("pg_indexes")) {
      return {
        rows: this.options.missingIndex ? [{ tablename: "customer_identities", indexname: "idx_customer_identities_customer_sub" }] : [
          { tablename: "customer_identities", indexname: "idx_customer_identities_customer_sub" },
          { tablename: "customer_profiles", indexname: "idx_customer_profiles_verified_email" },
        ],
      };
    }
    return { rows: [] };
  }

  async end() {
    this.ended = true;
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
  assert.match(logger.lines.join("\n"), /CUSTOMER_AUTH_MIGRATION_FAILED: DATABASE_URL is required/);
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
  assert.deepEqual(logger.lines, ["CUSTOMER_AUTH_MIGRATION_START", "CUSTOMER_AUTH_MIGRATION_OK"]);
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
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.match(logger.lines.join("\n"), /CUSTOMER_AUTH_MIGRATION_FAILED: migration boom/);
});

test("migration runner fails non-zero when post-migration verification fails", async () => {
  let client;
  const logger = makeLogger();
  const code = await runner.runCli({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient({ missingUnique: true });
      return client;
    },
  });
  assert.equal(code, 1);
  assert.equal(client.ended, true);
  assert.equal(client.queries.at(-1).sql, "SELECT pg_advisory_unlock($1::bigint)");
  assert.match(logger.lines.join("\n"), /provider unique constraint missing/);
  assert.doesNotMatch(logger.lines.join("\n"), /CUSTOMER_AUTH_MIGRATION_OK/);
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

test("migration file path is fixed to the expected merged SQL file", () => {
  assert.equal(runner.MIGRATION_RELATIVE_PATH, "migrations/20260620_customer_identities.sql");
  assert.equal(
    runner.resolveMigrationPath(REPO_ROOT),
    path.join(REPO_ROOT, "migrations", "20260620_customer_identities.sql")
  );
});

test("optional LINE backfill remains commented and is not separately executed", async () => {
  let client;
  const logger = makeLogger();
  await runner.runMigration({
    env: { DATABASE_URL },
    repoRoot: REPO_ROOT,
    logger,
    clientFactory() {
      client = new FakeClient();
      return client;
    },
  });
  const migrationSql = fs.readFileSync(path.join(REPO_ROOT, runner.MIGRATION_RELATIVE_PATH), "utf8");
  assert.match(migrationSql, /-- INSERT INTO public\.customer_identities/);
  const backfillQueries = client.queries.filter((q) => /INSERT INTO public\.customer_identities/.test(q.sql));
  assert.equal(backfillQueries.length, 1);
  assert.equal(backfillQueries[0].sql, migrationSql);
});
