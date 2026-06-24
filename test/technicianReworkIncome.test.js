const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const {
  holdOriginalIncomeForReworkCase,
  releaseHeldIncomeForReworkCase,
  voidHeldIncomeForReworkCase,
  getHoldForReworkCase,
  releaseIdempotencyKey,
} = require("../server/services/technicianReworkIncome");

const PG_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "cwf_test",
};

let pool;
let adminPool;
let testDatabaseName = "";
let dbUnavailableReason = "";
let nextJobId = 1;
let nextCaseId = 1;

test.before(async () => {
  testDatabaseName = `cwf_rework_income_${process.pid}_${Date.now()}`.toLowerCase();
  adminPool = new Pool({ ...PG_CONFIG, database: process.env.PGMAINTENANCEDATABASE || "postgres" });
  try {
    await adminPool.query("SELECT 1");
    await adminPool.query(`CREATE DATABASE ${testDatabaseName} ENCODING 'UTF8'`);
  } catch (e) {
    dbUnavailableReason = e.message || "Postgres test database is unavailable";
    await adminPool.end().catch(() => {});
    adminPool = null;
    return;
  }

  pool = new Pool({ ...PG_CONFIG, database: testDatabaseName });

  await pool.query(`CREATE TABLE public.jobs (job_id BIGSERIAL PRIMARY KEY)`);

  await pool.query(`
    CREATE TABLE public.technician_rework_cases (
      rework_case_id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES public.jobs(job_id),
      technician_username TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_payout_periods (
      payout_id TEXT PRIMARY KEY,
      period_type TEXT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_payout_lines (
      line_id BIGSERIAL PRIMARY KEY,
      payout_id TEXT NOT NULL,
      technician_username TEXT NOT NULL,
      job_id TEXT,
      earn_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_payout_adjustments (
      adj_id BIGSERIAL PRIMARY KEY,
      payout_id TEXT NOT NULL,
      technician_username TEXT NOT NULL,
      job_id TEXT,
      adj_amount NUMERIC(12,2) NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_deposit_ledger (
      ledger_id BIGSERIAL PRIMARY KEY,
      payout_id TEXT NOT NULL,
      technician_username TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      transaction_type TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_payout_payments (
      payment_id BIGSERIAL PRIMARY KEY,
      payout_id TEXT NOT NULL,
      technician_username TEXT NOT NULL,
      paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      paid_status TEXT NOT NULL DEFAULT 'unpaid',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE public.technician_rework_income_holds (
      hold_id BIGSERIAL PRIMARY KEY,
      rework_case_id BIGINT NOT NULL REFERENCES public.technician_rework_cases(rework_case_id) ON DELETE CASCADE,
      technician_username TEXT NOT NULL,
      job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,

      held_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (held_amount >= 0),
      source_payout_id TEXT,
      source_period_status_at_hold TEXT,
      hold_adjustment_id BIGINT REFERENCES public.technician_payout_adjustments(adj_id) ON DELETE SET NULL,

      hold_status TEXT NOT NULL DEFAULT 'held' CHECK (hold_status IN (
        'held','already_paid_no_action','released','voided'
      )),

      released_amount NUMERIC(12,2) CHECK (released_amount IS NULL OR released_amount >= 0),
      release_payout_id TEXT,
      release_adjustment_id BIGINT REFERENCES public.technician_payout_adjustments(adj_id) ON DELETE SET NULL,
      release_idempotency_key TEXT,
      released_at TIMESTAMPTZ,

      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (rework_case_id, technician_username),
      CHECK (released_amount IS NULL OR released_amount <= held_amount)
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX uq_trih_release_idempotency_key
      ON public.technician_rework_income_holds(release_idempotency_key)
      WHERE release_idempotency_key IS NOT NULL
  `);
});

test.after(async () => {
  if (pool) {
    pool.on("error", () => {}); // swallow teardown noise from sockets still closing when pool.end() resolves
    await pool.end();
  }
  if (adminPool && testDatabaseName) {
    await adminPool.query(`DROP DATABASE IF EXISTS ${testDatabaseName}`).catch(() => {});
    await adminPool.end().catch(() => {});
  }
});

test.beforeEach(async (t) => {
  if (dbUnavailableReason) {
    t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return;
  }
  await pool.query("DELETE FROM public.technician_rework_income_holds");
  await pool.query("DELETE FROM public.technician_payout_payments");
  await pool.query("DELETE FROM public.technician_deposit_ledger");
  await pool.query("DELETE FROM public.technician_payout_adjustments");
  await pool.query("DELETE FROM public.technician_payout_lines");
  await pool.query("DELETE FROM public.technician_payout_periods");
  await pool.query("DELETE FROM public.technician_rework_cases");
  await pool.query("DELETE FROM public.jobs");
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (dbUnavailableReason) return t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return fn(t);
  });
}

// Mirrors how every production route calls these functions: connect a client,
// BEGIN, run the operation, COMMIT on success / ROLLBACK on failure. Calling the
// service functions directly against `pool` (no transaction) would let a later
// statement fail after an earlier one in the same call already autocommitted,
// which is not how the real code paths behave.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function makeJobAndCase(technicianUsername) {
  const jr = await pool.query(`INSERT INTO public.jobs DEFAULT VALUES RETURNING job_id`);
  const jobId = Number(jr.rows[0].job_id);
  const cr = await pool.query(
    `INSERT INTO public.technician_rework_cases (job_id, technician_username) VALUES ($1,$2) RETURNING rework_case_id`,
    [jobId, technicianUsername]
  );
  return { jobId, reworkCaseId: Number(cr.rows[0].rework_case_id) };
}

dbTest("holds then releases the original technician's income exactly once into the correct period", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);

  const holdResult = await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 325,
    actor: "test",
  }));
  assert.equal(holdResult.held, true);
  assert.equal(Number(holdResult.row.held_amount), 325);

  const finishedAt = new Date("2026-06-20T10:00:00+07:00");
  const release1 = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, { reworkCaseId, technicianUsername: tech, finishedAt, actor: "test" }));
  assert.equal(release1.released, true);
  assert.equal(release1.amount, 325);
  assert.equal(release1.payout_id, "payout_2026-07_10");

  const release2 = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, { reworkCaseId, technicianUsername: tech, finishedAt, actor: "test" }));
  assert.equal(release2.released, false);
  assert.equal(release2.reason, "released");

  const adjCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM public.technician_payout_adjustments WHERE payout_id=$1 AND technician_username=$2 AND adj_amount > 0`,
    [release1.payout_id, tech]
  );
  assert.equal(adjCount.rows[0].n, 1, "exactly one positive release adjustment must exist no matter how many times release is called");

  const hold = await getHoldForReworkCase(pool, reworkCaseId, tech);
  assert.equal(hold.hold_status, "released");
  assert.equal(Number(hold.released_amount), 325);
  assert.equal(hold.release_idempotency_key, releaseIdempotencyKey(reworkCaseId, tech));
});

dbTest("releasing 10 times concurrently only moves money once", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 325,
    actor: "test",
  }));

  const finishedAt = new Date("2026-06-20T10:00:00+07:00");
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () => withTransaction((client) => releaseHeldIncomeForReworkCase(client, { reworkCaseId, technicianUsername: tech, finishedAt, actor: "test" })))
  );
  const succeeded = attempts.filter((a) => a.status === "fulfilled" && a.value.released);
  assert.equal(succeeded.length, 1, "only one of 10 concurrent release attempts should actually move money");

  const adjCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM public.technician_payout_adjustments WHERE technician_username=$1 AND adj_amount > 0`,
    [tech]
  );
  assert.equal(adjCount.rows[0].n, 1);
});

dbTest("failed rework never releases held income", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 325,
    actor: "test",
  }));

  const voidResult = await withTransaction((client) => voidHeldIncomeForReworkCase(client, { reworkCaseId, technicianUsername: tech }));
  assert.equal(voidResult.voided, true);
  assert.equal(voidResult.row.hold_status, "voided");

  const releaseAttempt = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, {
    reworkCaseId,
    technicianUsername: tech,
    finishedAt: new Date("2026-06-20T10:00:00+07:00"),
    actor: "test",
  }));
  assert.equal(releaseAttempt.released, false);
  assert.equal(releaseAttempt.reason, "voided");

  const adjCount = await pool.query(`SELECT COUNT(*)::int AS n FROM public.technician_payout_adjustments WHERE technician_username=$1`, [tech]);
  assert.equal(adjCount.rows[0].n, 0);
});

dbTest("already-paid original income is held as no-op and never released", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  const finishedAt = new Date("2026-06-10T10:00:00+07:00");
  await pool.query(
    `INSERT INTO public.technician_payout_periods (payout_id, period_type, period_start, period_end, status)
     VALUES ('payout_2026-06_25','25', '2026-06-01T00:00:00+07:00', '2026-06-16T00:00:00+07:00', 'paid')`
  );

  const holdResult = await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: finishedAt,
    originalEarnAmount: 325,
    actor: "test",
  }));
  assert.equal(holdResult.held, false);
  assert.equal(holdResult.row.hold_status, "already_paid_no_action");

  const releaseAttempt = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, {
    reworkCaseId,
    technicianUsername: tech,
    finishedAt: new Date("2026-06-20T10:00:00+07:00"),
    actor: "test",
  }));
  assert.equal(releaseAttempt.released, false);
  assert.equal(releaseAttempt.reason, "already_paid_no_action");
});

dbTest("rolls forward past an already-paid target period when releasing", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 325,
    actor: "test",
  }));

  // The period the release would naturally land in (2026-06-20 -> payout_2026-07_10) is already paid.
  await pool.query(
    `INSERT INTO public.technician_payout_periods (payout_id, period_type, period_start, period_end, status)
     VALUES ('payout_2026-07_10','10', '2026-06-16T00:00:00+07:00', '2026-07-01T00:00:00+07:00', 'paid')`
  );

  const release = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, {
    reworkCaseId,
    technicianUsername: tech,
    finishedAt: new Date("2026-06-20T10:00:00+07:00"),
    actor: "test",
  }));
  assert.equal(release.released, true);
  assert.equal(release.payout_id, "payout_2026-07_25");
});

dbTest("zero-amount original income holds as a no-op and is never released", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  const holdResult = await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 0,
    actor: "test",
  }));
  assert.equal(holdResult.held, false);
  assert.equal(holdResult.row.hold_status, "already_paid_no_action");

  const releaseAttempt = await withTransaction((client) => releaseHeldIncomeForReworkCase(client, {
    reworkCaseId,
    technicianUsername: tech,
    finishedAt: new Date("2026-06-20T10:00:00+07:00"),
    actor: "test",
  }));
  assert.equal(releaseAttempt.released, false);
});

dbTest("holding twice for the same case+technician is a no-op (immutable hold)", async () => {
  const tech = "A2MKUNG";
  const { jobId, reworkCaseId } = await makeJobAndCase(tech);
  const first = await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 325,
    actor: "test",
  }));
  const second = await withTransaction((client) => holdOriginalIncomeForReworkCase(client, {
    reworkCaseId,
    jobId,
    technicianUsername: tech,
    originalFinishedAt: new Date("2026-06-10T10:00:00+07:00"),
    originalEarnAmount: 999,
    actor: "test",
  }));
  assert.equal(second.already_held, true);
  assert.equal(Number(second.row.held_amount), Number(first.row.held_amount));

  const holds = await pool.query(`SELECT COUNT(*)::int AS n FROM public.technician_rework_income_holds WHERE rework_case_id=$1 AND technician_username=$2`, [reworkCaseId, tech]);
  assert.equal(holds.rows[0].n, 1);
});
