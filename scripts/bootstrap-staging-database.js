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

function walkJsFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", ".git", "coverage"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
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

function extractStatements(files) {
  const creates = [];
  const alters = [];
  const indexes = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const label = path.relative(REPO_ROOT, file);

    for (const sql of extractCreateTableStatements(source)) {
      creates.push({ sql, label: `CREATE from ${label}` });
    }

    for (const sql of source.match(
      /ALTER TABLE public\.[a-z_]+ ADD COLUMN IF NOT EXISTS [^`;)]+/g
    ) || []) {
      if (!sql.includes("${")) alters.push({ sql, label: `ALTER from ${label}` });
    }

    for (const sql of source.match(
      /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^`;]+/g
    ) || []) {
      if (!sql.includes("${")) indexes.push({ sql, label: `INDEX from ${label}` });
    }
  }

  return { creates, alters, indexes };
}

async function runBestEffort(client, sql, label) {
  try {
    await client.query(sql);
    return true;
  } catch (error) {
    console.warn(`STAGING_SCHEMA_SKIP ${label}: ${String(error.message || error).slice(0, 220)}`);
    return false;
  }
}

async function runPasses(client, statements, passes = 3) {
  let pending = [...statements];
  for (let pass = 1; pass <= passes && pending.length; pass += 1) {
    const failed = [];
    for (const statement of pending) {
      const ok = await runBestEffort(client, statement.sql, `${statement.label} pass=${pass}`);
      if (!ok) failed.push(statement);
    }
    pending = failed;
  }
  return pending;
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

    await client.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password TEXT");
    await client.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position TEXT");

    const sourceFiles = [
      path.join(REPO_ROOT, "index.js"),
      ...walkJsFiles(path.join(REPO_ROOT, "server")),
      ...walkJsFiles(path.join(REPO_ROOT, "scripts")),
    ];

    const statements = extractStatements(sourceFiles);
    console.log(`STAGING_SCHEMA_DISCOVERED creates=${statements.creates.length} alters=${statements.alters.length} indexes=${statements.indexes.length}`);

    await runPasses(client, statements.creates, 4);
    await runPasses(client, statements.alters, 3);
    await runPasses(client, statements.indexes, 3);

    const migrationsDir = path.join(REPO_ROOT, "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
      await runBestEffort(client, sql, `migration ${name}`);
    }

    // Re-run extracted ALTERs and indexes after migrations create their tables.
    await runPasses(client, statements.alters, 2);
    await runPasses(client, statements.indexes, 2);

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
