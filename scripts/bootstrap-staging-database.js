"use strict";

// Builds the disposable staging schema from the same declarations used by the
// real application and its booking E2E harness. This never connects to Render:
// compose supplies the private Docker host `db` and an isolated database.

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const REPO_ROOT = path.resolve(__dirname, "..");

function dbConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: "-c timezone=Asia/Bangkok",
    ssl: false,
  };
}

function extractCreateTableStatements(src) {
  const out = [];
  const re = /CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)\s*\(/g;
  let match;
  while ((match = re.exec(src))) {
    let index = re.lastIndex;
    let depth = 1;
    while (index < src.length && depth > 0) {
      if (src[index] === "(") depth += 1;
      else if (src[index] === ")") depth -= 1;
      index += 1;
    }
    const statement = src.slice(match.index, index);
    if (!statement.includes("${")) out.push(statement);
  }
  return out;
}

async function runBestEffort(client, sql, label) {
  try {
    await client.query(sql);
    return true;
  } catch (error) {
    console.warn(`STAGING_SCHEMA_SKIP ${label}: ${String(error.message || error).slice(0, 180)}`);
    return false;
  }
}

async function assertSchema(client) {
  const requiredTables = [
    "users",
    "technician_profiles",
    "jobs",
    "job_offers",
    "job_items",
    "job_promotions",
    "technician_service_matrix",
    "technician_monthly_work_calendar",
    "catalog_items",
    "customer_service_price_rules",
    "auth_sessions",
    "job_updates_v2",
    "homepage_cms_configs",
  ];

  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])`,
    [requiredTables]
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((name) => !present.has(name));
  if (missing.length) {
    throw new Error(`staging schema incomplete; missing: ${missing.join(", ")}`);
  }

  const userColumns = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='users'
        AND column_name = ANY($1::text[])`,
    [["password", "password_hash", "position", "role", "username"]]
  );
  const columns = new Set(userColumns.rows.map((row) => row.column_name));
  const missingColumns = ["password", "password_hash", "position", "role", "username"]
    .filter((name) => !columns.has(name));
  if (missingColumns.length) {
    throw new Error(`users schema incomplete; missing: ${missingColumns.join(", ")}`);
  }
}

async function main() {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    console.log("STAGING_SCHEMA_BOOTSTRAP_START");

    const coreSql = fs.readFileSync(
      path.join(REPO_ROOT, "test", "e2e", "schema-core.sql"),
      "utf8"
    );
    await client.query(coreSql);

    // Production predates password_hash-only auth and several boot paths still
    // expect these legacy columns to exist before self-healing starts.
    await client.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password TEXT");
    await client.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position TEXT");

    const sourceFiles = [
      path.join(REPO_ROOT, "index.js"),
      path.join(REPO_ROOT, "server", "customerPricing.js"),
    ];

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      for (const statement of extractCreateTableStatements(source)) {
        await runBestEffort(client, statement, `CREATE from ${path.relative(REPO_ROOT, file)}`);
      }
    }

    // Replay the application's idempotent boot-time column self-heals before
    // starting the app so one missing legacy column cannot abort later tables.
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const alters = source.match(
        /ALTER TABLE public\.[a-z_]+ ADD COLUMN IF NOT EXISTS [^`;)]+/g
      ) || [];
      for (const statement of alters) {
        if (!statement.includes("${")) {
          await runBestEffort(client, statement, `ALTER from ${path.relative(REPO_ROOT, file)}`);
        }
      }
    }

    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const indexes = source.match(
        /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^`;]+/g
      ) || [];
      for (const statement of indexes) {
        if (!statement.includes("${")) {
          await runBestEffort(client, statement, `INDEX from ${path.relative(REPO_ROOT, file)}`);
        }
      }
    }

    // The repository's SQL migrations are additive/idempotent. On a blank
    // disposable staging database, apply every compatible migration in order.
    const migrationsDir = path.join(REPO_ROOT, "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
      await runBestEffort(client, sql, `migration ${name}`);
    }

    await assertSchema(client);
    console.log("STAGING_SCHEMA_BOOTSTRAP_OK");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`STAGING_SCHEMA_BOOTSTRAP_FAILED: ${error.message || error}`);
  process.exitCode = 1;
});
