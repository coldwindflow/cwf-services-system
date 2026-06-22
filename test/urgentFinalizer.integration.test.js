const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { autoFinalizeUrgentJobs, ADMIN_REVIEW_STATUS } = require("../server/services/urgent/finalizer");

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

test.before(async () => {
  testDatabaseName = `cwf_urgent_${process.pid}_${Date.now()}`.toLowerCase();
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.jobs (
      job_id BIGSERIAL PRIMARY KEY,
      booking_mode TEXT,
      dispatch_mode TEXT,
      technician_username TEXT,
      technician_team TEXT,
      appointment_datetime TIMESTAMPTZ,
      job_status TEXT,
      canceled_at TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS booking_mode TEXT`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispatch_mode TEXT`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS technician_username TEXT`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS technician_team TEXT`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS appointment_datetime TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_status TEXT`);
  await pool.query(`ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.job_offers (
      offer_id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL,
      technician_username TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ,
      responded_at TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE public.job_offers ADD COLUMN IF NOT EXISTS job_id BIGINT`);
  await pool.query(`ALTER TABLE public.job_offers ADD COLUMN IF NOT EXISTS technician_username TEXT`);
  await pool.query(`ALTER TABLE public.job_offers ADD COLUMN IF NOT EXISTS status TEXT`);
  await pool.query(`ALTER TABLE public.job_offers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE public.job_offers ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.job_offer_time_proposals (
      proposal_id BIGSERIAL PRIMARY KEY,
      offer_id BIGINT,
      job_id BIGINT NOT NULL,
      technician_username TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      proposed_datetime TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE public.job_offer_time_proposals ADD COLUMN IF NOT EXISTS offer_id BIGINT`);
  await pool.query(`ALTER TABLE public.job_offer_time_proposals ADD COLUMN IF NOT EXISTS job_id BIGINT`);
  await pool.query(`ALTER TABLE public.job_offer_time_proposals ADD COLUMN IF NOT EXISTS technician_username TEXT`);
  await pool.query(`ALTER TABLE public.job_offer_time_proposals ADD COLUMN IF NOT EXISTS status TEXT`);
  await pool.query(`ALTER TABLE public.job_offer_time_proposals ADD COLUMN IF NOT EXISTS proposed_datetime TIMESTAMPTZ`);
});

test.after(async () => {
  if (pool) await pool.end();
  if (adminPool && testDatabaseName) {
    await adminPool.query(`DROP DATABASE IF EXISTS ${testDatabaseName} WITH (FORCE)`).catch(() => {});
    await adminPool.end().catch(() => {});
  }
});

test.beforeEach(async (t) => {
  if (dbUnavailableReason) {
    t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return;
  }
  await pool.query("DELETE FROM public.job_offer_time_proposals");
  await pool.query("DELETE FROM public.job_offers");
  await pool.query("DELETE FROM public.jobs");
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (dbUnavailableReason) return t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return fn(t);
  });
}

async function insertUrgentJob(status = "รอช่างยืนยัน", extra = {}) {
  const r = await pool.query(
    `INSERT INTO public.jobs (booking_mode, dispatch_mode, technician_username, technician_team, job_status, canceled_at)
     VALUES ('urgent','offer',$1,$2,$3,$4)
     RETURNING job_id`,
    [
      extra.technician_username || null,
      extra.technician_team || null,
      status,
      extra.canceled_at || null,
    ]
  );
  return Number(r.rows[0].job_id);
}

async function insertOffer(jobId, status, expiresSql, tech = "tech-a") {
  const r = await pool.query(
    `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
     VALUES ($1,$2,$3,${expiresSql})
     RETURNING offer_id`,
    [jobId, tech, status]
  );
  return Number(r.rows[0].offer_id);
}

dbTest("expired pending offer is marked expired and unassigned urgent job enters admin review", async () => {
  const jobId = await insertUrgentJob();
  const offerId = await insertOffer(jobId, "pending", "NOW() - INTERVAL '1 minute'");

  const result = await autoFinalizeUrgentJobs(pool);
  assert.equal(result.success, true);
  assert.equal(result.expired_offers, 1);
  assert.equal(result.finalized_jobs, 1);

  const offer = await pool.query(`SELECT status, responded_at IS NOT NULL AS responded FROM public.job_offers WHERE offer_id=$1`, [offerId]);
  assert.equal(offer.rows[0].status, "expired");
  assert.equal(offer.rows[0].responded, true);

  const job = await pool.query(`SELECT job_status FROM public.jobs WHERE job_id=$1`, [jobId]);
  assert.equal(job.rows[0].job_status, ADMIN_REVIEW_STATUS);
});

dbTest("live offers, accepted offers, assigned jobs, time proposals, and terminal jobs are not overwritten", async () => {
  const live = await insertUrgentJob();
  await insertOffer(live, "pending", "NOW() + INTERVAL '5 minutes'");

  const accepted = await insertUrgentJob();
  await insertOffer(accepted, "accepted", "NOW() - INTERVAL '5 minutes'");

  const assigned = await insertUrgentJob("รอช่างยืนยัน", { technician_username: "tech-a" });
  await insertOffer(assigned, "pending", "NOW() - INTERVAL '5 minutes'");

  const proposal = await insertUrgentJob();
  const proposalOffer = await insertOffer(proposal, "pending", "NOW() - INTERVAL '5 minutes'");
  await pool.query(
    `INSERT INTO public.job_offer_time_proposals (offer_id, job_id, technician_username, status, proposed_datetime)
     VALUES ($1,$2,'tech-a','pending',NOW() + INTERVAL '1 hour')`,
    [proposalOffer, proposal]
  );

  const proposalStatus = await insertUrgentJob("รอพิจารณาเวลาใหม่");
  await insertOffer(proposalStatus, "pending", "NOW() - INTERVAL '5 minutes'");

  const cancelled = await insertUrgentJob("ยกเลิก");
  await insertOffer(cancelled, "pending", "NOW() - INTERVAL '5 minutes'");

  const completed = await insertUrgentJob("เสร็จแล้ว");
  await insertOffer(completed, "pending", "NOW() - INTERVAL '5 minutes'");

  await autoFinalizeUrgentJobs(pool);

  const rows = await pool.query(`SELECT job_id, job_status FROM public.jobs ORDER BY job_id`);
  const byId = new Map(rows.rows.map((r) => [Number(r.job_id), r.job_status]));
  assert.equal(byId.get(live), "รอช่างยืนยัน");
  assert.equal(byId.get(accepted), "รอช่างยืนยัน");
  assert.equal(byId.get(assigned), "รอช่างยืนยัน");
  assert.equal(byId.get(proposal), "รอช่างยืนยัน");
  assert.equal(byId.get(proposalStatus), "รอพิจารณาเวลาใหม่");
  assert.equal(byId.get(cancelled), "ยกเลิก");
  assert.equal(byId.get(completed), "เสร็จแล้ว");
});

dbTest("finalizer is idempotent across repeated and concurrent runs", async () => {
  const jobId = await insertUrgentJob();
  await insertOffer(jobId, "pending", "NOW() - INTERVAL '10 minutes'");

  const first = await autoFinalizeUrgentJobs(pool);
  const second = await autoFinalizeUrgentJobs(pool);
  assert.equal(first.finalized_jobs, 1);
  assert.equal(second.finalized_jobs, 0);

  const jobId2 = await insertUrgentJob();
  await insertOffer(jobId2, "pending", "NOW() - INTERVAL '10 minutes'");
  const concurrent = await Promise.all([
    autoFinalizeUrgentJobs(pool),
    autoFinalizeUrgentJobs(pool),
    autoFinalizeUrgentJobs(pool),
  ]);
  const totalFinalized = concurrent.reduce((sum, r) => sum + Number(r.finalized_jobs || 0), 0);
  assert.equal(totalFinalized, 1);

  const jobs = await pool.query(`SELECT job_status FROM public.jobs WHERE job_id IN ($1,$2) ORDER BY job_id`, [jobId, jobId2]);
  assert.deepEqual(jobs.rows.map((r) => r.job_status), [ADMIN_REVIEW_STATUS, ADMIN_REVIEW_STATUS]);
});
