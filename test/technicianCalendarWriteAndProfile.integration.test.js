const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { Pool } = require("pg");

const createTechnicianCalendarWriteRoutes = require("../server/routes/technicianCalendarWrite");
const {
  toIsoDate,
  normWorkDayPayload,
  countLockedAdvanceJobsForDate,
  sourceForWorkDayPayload,
} = require("../server/lib/technicianCalendar");
const { upsertTechnicianProfile } = require("../server/services/technicianProfileUpsert");

// These tests exercise the REAL production route module / helper against a real
// local Postgres instance (not a regex/source assertion, not a fake in-memory pool).
const PG_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "cwf_test",
};

let pool;
let server;
let baseUrl;
let dbUnavailableReason = "";

test.before(async () => {
  pool = new Pool(PG_CONFIG);
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    dbUnavailableReason = e.message || "Postgres test database is unavailable";
    await pool.end().catch(() => {});
    pool = null;
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.technician_monthly_work_calendar (
      technician_username TEXT NOT NULL,
      work_date DATE NOT NULL,
      day_status TEXT,
      can_accept_advance_job BOOLEAN,
      can_accept_urgent_job BOOLEAN,
      start_time TEXT,
      end_time TEXT,
      max_jobs_per_day INT,
      max_units_per_day INT,
      note TEXT,
      source TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ,
      PRIMARY KEY (technician_username, work_date)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.jobs (
      job_id BIGSERIAL PRIMARY KEY,
      technician_username TEXT,
      appointment_datetime TIMESTAMPTZ,
      job_status TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.job_assignments (
      job_id BIGINT,
      technician_username TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.job_items (
      job_id BIGINT,
      qty INT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.technician_profiles (
      username TEXT PRIMARY KEY,
      technician_code TEXT,
      full_name TEXT,
      position TEXT,
      phone TEXT,
      employment_type TEXT,
      work_start TEXT,
      work_end TEXT,
      customer_slot_visible BOOLEAN,
      compensation_mode TEXT,
      daily_wage_amount NUMERIC,
      monthly_salary_amount NUMERIC,
      updated_at TIMESTAMPTZ
    )
  `);

  let sessionUsername = "p1";
  const fakeRequireTechnicianSession = (req, res, next) => {
    req.effective = { username: sessionUsername };
    next();
  };

  const app = express();
  app.use(express.json());
  app.use(createTechnicianCalendarWriteRoutes({
    pool,
    requireTechnicianSession: fakeRequireTechnicianSession,
    toIsoDate,
    normWorkDayPayload,
    countLockedAdvanceJobsForDate,
    sourceForWorkDayPayload,
  }));
  app._setSessionUsername = (u) => { sessionUsername = u; };

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  global.__cwfTestApp = app;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

test.beforeEach(async (t) => {
  if (dbUnavailableReason) {
    t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return;
  }
  await pool.query("DELETE FROM public.technician_monthly_work_calendar");
  await pool.query("DELETE FROM public.jobs");
  await pool.query("DELETE FROM public.job_assignments");
  await pool.query("DELETE FROM public.job_items");
  await pool.query("DELETE FROM public.technician_profiles");
});

async function putJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function dbTest(name, fn) {
  test(name, async (t) => {
    if (dbUnavailableReason) return t.skip(`Postgres integration database unavailable: ${dbUnavailableReason}`);
    return fn(t);
  });
}

// ============ Blocker 2: PUT /tech/work-calendar/day real contract ============
dbTest("Blocker 2: single-day save via real route persists a real row keyed by req.effective.username", async () => {
  global.__cwfTestApp._setSessionUsername("p1");
  const body = {
    work_date: "2026-07-10",
    day_status: "advance_only",
    can_accept_advance_job: true,
    start_time: "09:00",
    end_time: "18:00",
    max_jobs_per_day: 3,
    max_units_per_day: 6,
    note: "",
  };
  const { status, data } = await putJson("/tech/work-calendar/day", body);
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.item.technician_username, "p1");

  const row = await pool.query(
    `SELECT technician_username, work_date::text AS work_date, can_accept_advance_job, source, max_jobs_per_day, max_units_per_day FROM public.technician_monthly_work_calendar WHERE technician_username='p1'`
  );
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0].work_date, "2026-07-10");
  assert.equal(row.rows[0].can_accept_advance_job, true);
  assert.equal(row.rows[0].source, "technician_custom");
  assert.equal(row.rows[0].max_jobs_per_day, 3);
  assert.equal(row.rows[0].max_units_per_day, 6);
});

dbTest("Blocker 2: username is sourced from req.effective.username, not client-supplied body", async () => {
  global.__cwfTestApp._setSessionUsername("session-user");
  const body = {
    // Even if the body carried an unrelated "username"-like field, the route never reads it.
    work_date: "2026-07-11",
    can_accept_advance_job: true,
  };
  const { status, data } = await putJson("/tech/work-calendar/day", body);
  assert.equal(status, 200);
  assert.equal(data.item.technician_username, "session-user");

  const row = await pool.query(
    `SELECT technician_username, source, max_jobs_per_day, max_units_per_day FROM public.technician_monthly_work_calendar WHERE work_date='2026-07-11'`
  );
  assert.equal(row.rows[0].technician_username, "session-user");
  assert.equal(row.rows[0].source, "technician_default");
  assert.equal(row.rows[0].max_jobs_per_day, null);
  assert.equal(row.rows[0].max_units_per_day, null);
});

dbTest("Blocker 2: reading the month back after save shows the same saved date", async () => {
  global.__cwfTestApp._setSessionUsername("p1");
  await putJson("/tech/work-calendar/day", { work_date: "2026-07-12", can_accept_advance_job: true });

  const monthRows = await pool.query(
    `SELECT work_date::text AS work_date, can_accept_advance_job
     FROM public.technician_monthly_work_calendar
     WHERE technician_username='p1' AND work_date BETWEEN '2026-07-01' AND '2026-07-31'
     ORDER BY work_date ASC`
  );
  assert.deepEqual(monthRows.rows.map((r) => r.work_date), ["2026-07-12"]);
  assert.equal(monthRows.rows[0].can_accept_advance_job, true);
});

dbTest("locked single-day edit is rejected with 409 and no row mutation", async () => {
  global.__cwfTestApp._setSessionUsername("p1");
  await pool.query(
    `INSERT INTO public.jobs (technician_username, appointment_datetime, job_status) VALUES ('p1', '2026-07-13 10:00:00+07', 'assigned')`
  );
  const { status, data } = await putJson("/tech/work-calendar/day", {
    work_date: "2026-07-13",
    can_accept_advance_job: true,
    start_time: "09:00",
    end_time: "18:00",
    max_jobs_per_day: null,
    max_units_per_day: null,
  });
  assert.equal(status, 409);
  assert.equal(data.locked, true);
  assert.equal(data.code, "LOCKED_DAY_HAS_JOBS");
  const row = await pool.query(`SELECT 1 FROM public.technician_monthly_work_calendar WHERE work_date='2026-07-13'`);
  assert.equal(row.rows.length, 0);
});

dbTest("locked bulk edit skips locked dates and saves only unlocked dates", async () => {
  global.__cwfTestApp._setSessionUsername("p1");
  const job = await pool.query(
    `INSERT INTO public.jobs (technician_username, appointment_datetime, job_status) VALUES ('p1', '2026-07-14 10:00:00+07', 'assigned') RETURNING job_id`
  );
  await pool.query(`INSERT INTO public.job_items (job_id, qty) VALUES ($1, 3)`, [job.rows[0].job_id]);
  const { status, data } = await putJson("/tech/work-calendar/bulk", {
    days: [
      { work_date: "2026-07-14", can_accept_advance_job: true },
      { work_date: "2026-07-15", can_accept_advance_job: true },
    ],
  });
  assert.equal(status, 200);
  assert.equal(data.count, 1);
  assert.equal(data.skipped_locked, 1);
  assert.equal(data.locked_rejections[0].code, "LOCKED_DAY_HAS_JOBS");
  const row = await pool.query(`SELECT work_date::text AS work_date, source, max_jobs_per_day, max_units_per_day FROM public.technician_monthly_work_calendar ORDER BY work_date`);
  assert.deepEqual(row.rows.map((r) => r.work_date), ["2026-07-15"]);
  assert.equal(row.rows[0].source, "technician_default");
  assert.equal(row.rows[0].max_jobs_per_day, null);
  assert.equal(row.rows[0].max_units_per_day, null);
});

// ============ Blocker 3: admin technician profile UPSERT INSERT path ============
dbTest("Blocker 3: existing profile is updated and read-back matches submitted values", async () => {
  await pool.query(
    `INSERT INTO public.technician_profiles (username, technician_code, employment_type, customer_slot_visible) VALUES ('c1','C001','company',false)`
  );
  const persisted = await upsertTechnicianProfile(pool, {
    username: "c1",
    technician_code: "C001",
    full_name: "Test C1",
    position: null,
    phone: null,
    employment_type: "partner",
    work_start: "09:00",
    work_end: "18:00",
    customer_slot_visible: true,
    compensation_mode: null,
    daily_wage_amount: null,
    monthly_salary_amount: null,
  });
  assert.equal(persisted.employment_type, "partner");
  assert.equal(persisted.customer_slot_visible, true);

  const row = await pool.query(`SELECT employment_type, customer_slot_visible FROM public.technician_profiles WHERE username='c1'`);
  assert.equal(row.rows[0].employment_type, "partner");
  assert.equal(row.rows[0].customer_slot_visible, true);
});

dbTest("Blocker 3: first-time insert (no existing profile row) sets employment_type and customer_slot_visible on INSERT, not only ON CONFLICT", async () => {
  const before = await pool.query(`SELECT 1 FROM public.technician_profiles WHERE username='new1'`);
  assert.equal(before.rows.length, 0);

  const persisted = await upsertTechnicianProfile(pool, {
    username: "new1",
    technician_code: "N001",
    full_name: "New Tech",
    position: null,
    phone: null,
    employment_type: "partner",
    work_start: "09:00",
    work_end: "18:00",
    customer_slot_visible: true,
    compensation_mode: null,
    daily_wage_amount: null,
    monthly_salary_amount: null,
  });
  assert.equal(persisted.employment_type, "partner");
  assert.equal(persisted.customer_slot_visible, true);

  const row = await pool.query(
    `SELECT employment_type, customer_slot_visible, work_start, work_end FROM public.technician_profiles WHERE username='new1'`
  );
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0].employment_type, "partner");
  assert.equal(row.rows[0].customer_slot_visible, true);
  assert.equal(row.rows[0].work_start, "09:00");
  assert.equal(row.rows[0].work_end, "18:00");
});
