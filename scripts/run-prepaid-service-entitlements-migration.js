"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_RELATIVE_PATH = "migrations/20260906_prepaid_service_entitlements.sql";
const ADVISORY_LOCK_KEY = "202609060329";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeErrorMessage(error) {
  return clean(error && error.message ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password|passwd|pwd|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]");
}

function resolveMigrationPath(repoRoot = path.resolve(__dirname, "..")) {
  const root = path.resolve(repoRoot);
  const migrationPath = path.resolve(root, MIGRATION_RELATIVE_PATH);
  const expected = path.resolve(root, "migrations", "20260906_prepaid_service_entitlements.sql");
  if (migrationPath !== expected || !migrationPath.startsWith(root + path.sep)) {
    throw new Error("migration path rejected");
  }
  return migrationPath;
}

function readMigrationSql(repoRoot) {
  return fs.readFileSync(resolveMigrationPath(repoRoot), "utf8");
}

function createClientConfig(env = process.env) {
  const databaseUrl = clean(env.DATABASE_URL);
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      options: "-c timezone=Asia/Bangkok",
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: clean(env.DB_HOST),
    port: Number(env.DB_PORT || 5432),
    user: clean(env.DB_USER),
    password: env.DB_PASSWORD,
    database: clean(env.DB_NAME),
    options: "-c timezone=Asia/Bangkok",
    ssl: { rejectUnauthorized: false },
  };
}

async function verifySchema(client) {
  const tables = await client.query(`
    SELECT
      to_regclass('public.customer_orders') AS orders,
      to_regclass('public.customer_service_entitlements') AS entitlements,
      to_regclass('public.jobs') AS jobs
  `);
  const row = tables.rows?.[0] || {};
  if (!row.orders || !row.entitlements || !row.jobs) throw new Error("prepaid lifecycle tables missing after migration");

  const columns = await client.query(`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND (
         (table_name='customer_orders' AND column_name IN
           ('order_kind','customer_sub','service_entitlement_snapshot','prepaid_entitlement_code','prepaid_claim_token_hash','prepaid_redeem_until','prepaid_warranty_days','manual_payment_reference','payment_verified_by'))
         OR
         (table_name='jobs' AND column_name IN ('customer_due','payment_source','prepaid_entitlement_id'))
       )
  `);
  const present = new Set((columns.rows || []).map((r) => `${r.table_name}.${r.column_name}`));
  const required = [
    'customer_orders.order_kind', 'customer_orders.customer_sub',
    'customer_orders.service_entitlement_snapshot', 'customer_orders.prepaid_entitlement_code',
    'customer_orders.prepaid_claim_token_hash', 'customer_orders.prepaid_redeem_until',
    'customer_orders.prepaid_warranty_days', 'customer_orders.manual_payment_reference',
    'customer_orders.payment_verified_by', 'jobs.customer_due', 'jobs.payment_source',
    'jobs.prepaid_entitlement_id',
  ];
  for (const key of required) if (!present.has(key)) throw new Error(`${key} missing after migration`);

  const triggers = await client.query(`
    SELECT tgname
      FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname IN (
         'trg_issue_prepaid_entitlement_from_paid_order',
         'trg_guard_prepaid_job_redemption',
         'trg_consume_prepaid_entitlement_after_job_insert'
       )
  `);
  const triggerNames = new Set((triggers.rows || []).map((r) => r.tgname));
  for (const name of [
    'trg_issue_prepaid_entitlement_from_paid_order',
    'trg_guard_prepaid_job_redemption',
    'trg_consume_prepaid_entitlement_after_job_insert',
  ]) {
    if (!triggerNames.has(name)) throw new Error(`${name} missing after migration`);
  }
}

async function runMigration(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..");
  const clientFactory = options.clientFactory || ((config) => new Client(config));
  const client = clientFactory(createClientConfig(env));
  const sql = readMigrationSql(repoRoot);
  let locked = false;
  logger.log("PREPAID_SERVICE_ENTITLEMENTS_MIGRATION_START");
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    locked = true;
    await client.query(sql);
    await verifySchema(client);
    logger.log("PREPAID_SERVICE_ENTITLEMENTS_MIGRATION_OK");
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function runCli(options = {}) {
  const logger = options.logger || console;
  try {
    await runMigration(options);
    return 0;
  } catch (error) {
    logger.error(`PREPAID_SERVICE_ENTITLEMENTS_MIGRATION_FAILED: ${safeErrorMessage(error)}`);
    return 1;
  }
}

if (require.main === module) {
  runCli().then((code) => { process.exitCode = code; });
}

module.exports = {
  ADVISORY_LOCK_KEY,
  MIGRATION_RELATIVE_PATH,
  createClientConfig,
  readMigrationSql,
  resolveMigrationPath,
  runCli,
  runMigration,
  safeErrorMessage,
  verifySchema,
};
