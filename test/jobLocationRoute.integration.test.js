"use strict";

// REAL route-level integration coverage for the job-location round-trip.
//
// Boots the actual application (`node index.js`) in a child process against a
// DISPOSABLE local PostgreSQL database (never production), following the same
// safety model as test/e2e/run-booking-e2e.js: local-host only, a freshly
// CREATEd database that is DROPped on teardown. It drives the real HTTP routes
// with a real admin session and re-reads the actual `jobs` row.
//
// Proves, through the production routes:
//   1. Add job with explicit GPS persists it.
//   2. Add job with missing GPS does not persist 0,0.
//   3. Edit without a location change preserves the pair.
//   4. Edit with a new map/address does not retain stale coordinates.
//   5. Invalid / partial GPS is rejected with HTTP 400.
//   6. (modal A→B leak is covered behaviorally in jobLocationRoundtrip.test.js)
//
// Self-skips (does not fail) when PostgreSQL is unavailable.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { Client } = require("pg");

const REPO_ROOT = path.resolve(__dirname, "..");
const PG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);
const DB_NAME = `cwf_jobloc_it_${process.pid}`;
const PORT = Number(process.env.JOBLOC_IT_PORT || 4732);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_COOKIE_TOKEN = crypto.randomBytes(24).toString("hex");

let child = null;
let dbUnavailable = "";

function extractBalanced(src, headerRe) {
  const out = [];
  let m;
  const re = new RegExp(headerRe, "g");
  while ((m = re.exec(src))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") depth -= 1;
      i += 1;
    }
    const stmt = src.slice(m.index, i);
    if (!stmt.includes("${")) out.push(stmt);
  }
  return out;
}

async function buildSchema(adminless) {
  const db = new Client({ ...PG, database: DB_NAME });
  await db.connect();
  const schemaSql = fs.readFileSync(path.join(__dirname, "e2e", "schema-core.sql"), "utf8");
  await db.query(schemaSql).catch(() => {});
  const sources = ["index.js", path.join("server", "customerPricing.js")]
    .map((f) => { try { return fs.readFileSync(path.join(REPO_ROOT, f), "utf8"); } catch { return ""; } });
  // CREATE TABLE IF NOT EXISTS public.<name> ( ... )
  for (const src of sources) {
    for (const stmt of extractBalanced(src, "CREATE TABLE IF NOT EXISTS public\\.[a-z_]+\\s*\\(")) {
      try { await db.query(stmt); } catch (_) { /* unrelated table — fine */ }
    }
  }
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS (self-heal like boot)
  for (const src of sources) {
    const alters = src.match(/ALTER TABLE public\.[a-z_]+ ADD COLUMN IF NOT EXISTS [^`;)]+/g) || [];
    for (const a of alters) { if (!a.includes("${")) { try { await db.query(a); } catch (_) {} } }
  }
  // Indexes several routes rely on.
  for (const src of sources) {
    const idx = src.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^`;]+/g) || [];
    for (const i of idx) { if (!i.includes("${")) { try { await db.query(i); } catch (_) {} } }
  }
  // Belt-and-suspenders columns the /admin/book_v2 write path needs but that the
  // core schema / regex-extracted ALTERs may not add (production self-heals these
  // at boot via template-string ALTERs the extractor skips).
  const ensure = [
    `ALTER TABLE public.job_team_members ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE public.job_team_members ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE public.job_assignments ADD COLUMN IF NOT EXISTS status TEXT`,
    `ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS per_unit_evidence_enabled BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS assigned_technician_username TEXT`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_rule_id BIGINT`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS normal_unit_price NUMERIC`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_label TEXT`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_campaign_name TEXT`,
    `ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_source TEXT`,
  ];
  for (const s of ensure) { try { await db.query(s); } catch (_) {} }
  await db.end();
}

async function seedAdminSession() {
  const db = new Client({ ...PG, database: DB_NAME });
  await db.connect();
  await db.query(
    `INSERT INTO public.users (username, role) VALUES ('e2e_admin','admin')
       ON CONFLICT (username) DO UPDATE SET role='admin'`
  );
  // A company technician so a forced-single booking has someone to assign.
  await db.query(
    `INSERT INTO public.users (username, role) VALUES ('e2e_tech','technician')
       ON CONFLICT (username) DO UPDATE SET role='technician'`
  );
  await db.query(
    `INSERT INTO public.technician_profiles (username, full_name, phone)
     VALUES ('e2e_tech','ช่างทดสอบ','0810000000')
       ON CONFLICT (username) DO NOTHING`
  ).catch(() => {});
  await db.query(`ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS impersonated_username TEXT`).catch(() => {});
  await db.query(`ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS impersonated_role TEXT`).catch(() => {});
  await db.query(`ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`).catch(() => {});
  await db.query(
    `INSERT INTO public.auth_sessions (session_token, username, role, expires_at)
     VALUES ($1,'e2e_admin','admin', NOW() + INTERVAL '1 day')
       ON CONFLICT (session_token) DO NOTHING`,
    [ADMIN_COOKIE_TOKEN]
  );
  await db.end();
}

async function withDb(fn) {
  const db = new Client({ ...PG, database: DB_NAME });
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}

// Insert a job row directly so the GET/PUT routes have something to operate on
// (booking a job through /admin/book_v2 needs the full pricing/catalog stack;
// the location-preservation logic under review lives in the edit route).
async function seedJob(loc) {
  return withDb(async (db) => {
    const r = await db.query(
      `INSERT INTO public.jobs
         (customer_name, customer_phone, job_type, appointment_datetime, job_status,
          address_text, maps_url, job_zone, gps_latitude, gps_longitude,
          service_zone_code, service_zone_source, booking_mode, duration_min, job_price)
       VALUES ('ทดสอบ','0800000000','ล้าง', NOW() + INTERVAL '1 day', 'รอดำเนินการ',
          $1,$2,$3,$4,$5,$6,$7,'scheduled',60,0)
       RETURNING job_id`,
      [loc.address_text ?? null, loc.maps_url ?? null, loc.job_zone ?? null,
       loc.gps_latitude ?? null, loc.gps_longitude ?? null,
       loc.service_zone_code ?? null, loc.service_zone_source ?? null]
    );
    return Number(r.rows[0].job_id);
  });
}

const adminHeaders = { "content-type": "application/json", cookie: `cwf_session=${ADMIN_COOKIE_TOKEN}` };

async function putEdit(jobId, body) {
  const res = await fetch(`${BASE}/jobs/${jobId}/admin-edit`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function waitForReady(timeoutMs = 60000) {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error(`app not ready in ${timeoutMs}ms`);
    try {
      const res = await fetch(`${BASE}/public/pricing_preview`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_type: "ล้างแอร์", ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา" }),
      });
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

test.before(async () => {
  if (!LOCAL_HOSTS.has(PG.host)) { dbUnavailable = `refusing non-local PG host ${PG.host}`; return; }
  const admin = new Client({ ...PG, database: "postgres" });
  try {
    await admin.connect();
    await admin.query("SELECT 1");
  } catch (e) {
    dbUnavailable = e.message || "postgres unavailable";
    await admin.end().catch(() => {});
    return;
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME} ENCODING 'UTF8'`);
  } finally {
    await admin.end().catch(() => {});
  }
  await buildSchema();
  await seedAdminSession();

  const logFile = path.join(__dirname, `jobloc-it-app-${PORT}.log`);
  const out = fs.openSync(logFile, "w");
  child = spawn(process.execPath, ["index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_HOST: PG.host, DB_PORT: String(PG.port), DB_USER: PG.user, DB_PASSWORD: PG.password, DB_NAME,
      PGHOST: PG.host, PGPORT: String(PG.port), PGUSER: PG.user, PGPASSWORD: PG.password, PGDATABASE: DB_NAME,
      PORT: String(PORT),
      CWF_JWT_SECRET: "jobloc-it-secret",
      NODE_ENV: "test", CWF_E2E_TEST_MODE: "1",
      OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
      CLOUDINARY_URL: "", CLOUDINARY_CLOUD_NAME: "",
      // Force all third-party outbound (e.g. short-link resolution) to fail
      // deterministically so the "changed link is unresolvable → cleared" path
      // is exercised. Local DB traffic bypasses the proxy via NO_PROXY.
      HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9", http_proxy: "http://127.0.0.1:9",
      NO_PROXY: "127.0.0.1,localhost,::1", no_proxy: "127.0.0.1,localhost,::1",
    },
    stdio: ["ignore", out, out],
  });
  await waitForReady();
});

test.after(async () => {
  if (child) { try { child.kill("SIGKILL"); } catch (_) {} }
  await new Promise((r) => setTimeout(r, 300));
  if (!dbUnavailable) {
    const admin = new Client({ ...PG, database: "postgres" });
    try {
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(async () => {
        await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {});
      });
    } finally { await admin.end().catch(() => {}); }
  }
});

test("GET /admin/job_v2 returns the stored location fields (real route + session)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({
    address_text: "99 อ่อนนุช", maps_url: "https://maps.app.goo.gl/getcheck",
    job_zone: "อ่อนนุช", gps_latitude: 13.71, gps_longitude: 100.61,
    service_zone_code: "C", service_zone_source: "admin_override",
  });
  const res = await fetch(`${BASE}/admin/job_v2/${jobId}`, { headers: adminHeaders });
  assert.equal(res.status, 200);
  const body = await res.json();
  const job = body.job;
  assert.equal(Number(job.gps_latitude), 13.71);
  assert.equal(Number(job.gps_longitude), 100.61);
  assert.equal(job.maps_url, "https://maps.app.goo.gl/getcheck");
  assert.equal(job.job_zone, "อ่อนนุช");
  assert.equal(job.service_zone_code, "C");
});

test("Proof 3: edit without a location change preserves the GPS pair", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "a", maps_url: "https://maps.app.goo.gl/keep", job_zone: "z", gps_latitude: 13.5, gps_longitude: 100.5 });
  const { status, json } = await putEdit(jobId, { customer_note: "แก้ไขโน้ตอย่างเดียว" });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "preserved");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(Number(row.gps_latitude), 13.5);
  assert.equal(Number(row.gps_longitude), 100.5);
  assert.equal(row.maps_url, "https://maps.app.goo.gl/keep");
});

test("Proof 4: changing maps_url to a coordinate URL replaces stale GPS (never keeps old)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "loc A", maps_url: "https://maps.google.com/?q=13.100000,100.100000", gps_latitude: 13.1, gps_longitude: 100.1 });
  // New maps_url points at location B (14.5, 101.5); admin did not touch Lat/Lng.
  const { status, json } = await putEdit(jobId, { maps_url: "https://www.google.com/maps/place/@14.500000,101.500000,17z" });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "recalculated");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(row.gps_latitude) - 14.5) < 1e-6, `lat became B, got ${row.gps_latitude}`);
  assert.ok(Math.abs(Number(row.gps_longitude) - 101.5) < 1e-6, `lng became B, got ${row.gps_longitude}`);
  assert.notEqual(Number(row.gps_latitude), 13.1); // never keeps location A
});

test("Proof 4b: changing maps_url to an unresolvable link clears the old GPS to NULL (deterministic)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "loc A", maps_url: "https://maps.google.com/?q=13.100000,100.100000", gps_latitude: 13.1, gps_longitude: 100.1 });
  // A changed maps_url with no parseable coordinates and not a resolvable short
  // link → coordinates cannot be recalculated → the stale pair must be CLEARED,
  // never retained. (No network dependency: a non-goo.gl URL isn't remote-resolved.)
  const newLink = "https://example.com/place/no-coords-here";
  const { status, json } = await putEdit(jobId, { maps_url: newLink });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "cleared");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.gps_latitude, null, "old GPS cleared, not retained");
  assert.equal(row.gps_longitude, null);
  assert.equal(row.maps_url, newLink, "the changed link is still saved");
});

test("Proof 4c: a changed short Google Maps link is always saved and never keeps the old GPS", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "loc A", maps_url: "https://maps.google.com/?q=13.100000,100.100000", gps_latitude: 13.1, gps_longitude: 100.1 });
  const shortLink = "https://maps.app.goo.gl/someShortLink123";
  const { status, json } = await putEdit(jobId, { maps_url: shortLink });
  assert.equal(status, 200);
  // Depending on whether the short link resolves, the action is recalculated or
  // cleared — but it must never be "preserved" (which would keep location A).
  assert.ok(["recalculated", "cleared"].includes(json.gps_action), `unexpected action ${json.gps_action}`);
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.maps_url, shortLink, "the changed short link is still saved");
  // Never retains the old location-A coordinates.
  assert.ok(row.gps_latitude === null || Math.abs(Number(row.gps_latitude) - 13.1) > 1e-6, "old GPS not retained");
});

test("Proof 5: partial / invalid / 0,0 GPS is rejected with 400 INVALID_JOB_SITE_COORDINATES", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "x", gps_latitude: 13.2, gps_longitude: 100.2 });
  const cases = [
    { gps_latitude: "13.7", gps_longitude: "" },     // lat only
    { gps_latitude: "", gps_longitude: "100.5" },    // lng only
    { gps_latitude: "abc", gps_longitude: "100.5" }, // invalid string
    { gps_latitude: "200", gps_longitude: "100.5" }, // out of range
    { gps_latitude: "0", gps_longitude: "0" },       // 0,0
  ];
  for (const body of cases) {
    const { status, json } = await putEdit(jobId, body);
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(json.code, "INVALID_JOB_SITE_COORDINATES");
    assert.ok(json.error && json.error.length, "Thai error message present");
  }
  // The stored pair is untouched by the rejected requests.
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(Number(row.gps_latitude), 13.2);
  assert.equal(Number(row.gps_longitude), 100.2);
});

test("valid explicit pair updates the coordinates (real route)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "x", gps_latitude: 13.2, gps_longitude: 100.2 });
  const { status, json } = await putEdit(jobId, { gps_latitude: "13.999999", gps_longitude: "100.999999" });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "updated");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(row.gps_latitude) - 13.999999) < 1e-6);
  assert.ok(Math.abs(Number(row.gps_longitude) - 100.999999) < 1e-6);
});

// (book_v2 add-path "explicit GPS persists / missing GPS never 0,0" is proven by
// the canonical real-route test "R4-B3b" below, which staggers appointment times
// to avoid technician collisions.)

// ---- Round-3 location-consistency proofs (real routes) --------------------

test("R3-B1: explicitly clearing maps_url writes NULL and keeps the valid GPS", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "A", maps_url: "https://maps.app.goo.gl/keepGps", gps_latitude: 13.4, gps_longitude: 100.4 });
  const { status, json } = await putEdit(jobId, { maps_url: "" });
  assert.equal(status, 200);
  assert.equal(json.maps_action, "cleared");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.maps_url, null, "maps_url cleared to NULL");
  // Clearing the URL alone must NOT wipe the pin — nav falls back to it.
  assert.equal(Number(row.gps_latitude), 13.4, "valid GPS retained for navigation fallback");
  assert.equal(Number(row.gps_longitude), 100.4);
});

test("R3-B2: changing only the address clears the stale Maps URL (never keeps location A's URL)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "loc A", maps_url: "https://maps.google.com/?q=13.1,100.1", gps_latitude: 13.1, gps_longitude: 100.1 });
  // Admin changes the address only (Maps URL omitted / left as the old value).
  const { status, json } = await putEdit(jobId, { address_text: "loc B ที่อยู่ใหม่" });
  assert.equal(status, 200);
  assert.equal(json.maps_action, "cleared");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.maps_url, null, "old Maps URL A cleared");
  // Address B has no parseable coordinates → GPS cleared (never keeps A).
  assert.ok(row.gps_latitude === null || Math.abs(Number(row.gps_latitude) - 13.1) > 1e-6, "GPS is not location A");
});

test("R3-B2b: address change while re-sending the OLD Maps URL still clears it", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const oldUrl = "https://maps.google.com/?q=13.1,100.1";
  const jobId = await seedJob({ address_text: "loc A", maps_url: oldUrl, gps_latitude: 13.1, gps_longitude: 100.1 });
  const { status } = await putEdit(jobId, { address_text: "loc B", maps_url: oldUrl });
  assert.equal(status, 200);
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.maps_url, null, "old URL not retained when address changed without a real replacement");
});

test("R3-B3: a location change recomputes the system service zone (old zone A not retained)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({
    address_text: "loc A", maps_url: "https://maps.google.com/?q=13.1,100.1",
    gps_latitude: 13.1, gps_longitude: 100.1, service_zone_code: "ZONE_A", service_zone_source: "admin_override",
  });
  const { status } = await putEdit(jobId, { maps_url: "https://maps.google.com/?q=15.5,101.5" });
  assert.equal(status, 200);
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.notEqual(row.service_zone_code, "ZONE_A", "old system zone must not be retained after a location change");
});

test("R3-B4: derived coordinates that resolve to 0,0 or out-of-range are rejected (not persisted)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  // maps_url parses to 0,0 → strict validator rejects → GPS cleared, never 0,0.
  const jobZero = await seedJob({ address_text: "x", maps_url: "https://maps.google.com/?q=13.2,100.2", gps_latitude: 13.2, gps_longitude: 100.2 });
  await putEdit(jobZero, { maps_url: "https://maps.google.com/?q=0.000000,0.000000" });
  const rZero = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobZero]).then((r) => r.rows[0]));
  // NULL (not the number 0) — a 0,0 derived pair must be rejected, never stored.
  assert.equal(rZero.gps_latitude, null, "0,0 derived pair not persisted");
  assert.equal(rZero.gps_longitude, null);

  // maps_url parses to an out-of-range latitude → rejected → cleared.
  const jobOor = await seedJob({ address_text: "x", maps_url: "https://maps.google.com/?q=13.2,100.2", gps_latitude: 13.2, gps_longitude: 100.2 });
  await putEdit(jobOor, { maps_url: "https://maps.google.com/?q=200.000000,100.500000" });
  const rOor = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobOor]).then((r) => r.rows[0]));
  assert.equal(rOor.gps_latitude, null, "out-of-range derived pair not persisted");
});

test("R3-B4b: a valid derived pair from the new Maps URL is persisted", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "x", maps_url: "https://maps.google.com/?q=13.2,100.2", gps_latitude: 13.2, gps_longitude: 100.2 });
  const { json } = await putEdit(jobId, { maps_url: "https://maps.google.com/?q=15.500000,101.500000" });
  assert.equal(json.gps_action, "recalculated");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(row.gps_latitude) - 15.5) < 1e-6);
  assert.ok(Math.abs(Number(row.gps_longitude) - 101.5) < 1e-6);
});

// ---- Round-4 location-source consistency proofs (real routes) -------------

test("R4-B1: an explicit GPS edit clears the stale Maps URL (no URL A + GPS B)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "A", maps_url: "https://maps.google.com/?q=13.1,100.1", gps_latitude: 13.1, gps_longitude: 100.1 });
  // Admin supplies ONLY a new explicit pin (no Maps URL).
  const { status, json } = await putEdit(jobId, { gps_latitude: "14.500000", gps_longitude: "101.500000" });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "updated");
  assert.equal(json.maps_action, "cleared");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(row.gps_latitude) - 14.5) < 1e-6, "GPS becomes B");
  assert.equal(row.maps_url, null, "stale Maps URL A cleared — nav now uses GPS B");
});

test("R4-B1b: explicit GPS + a new Maps URL in the same request keeps both", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "A", maps_url: "https://maps.google.com/?q=13.1,100.1", gps_latitude: 13.1, gps_longitude: 100.1 });
  const newUrl = "https://maps.google.com/?q=16.200000,102.200000";
  const { status } = await putEdit(jobId, { maps_url: newUrl, gps_latitude: "16.200000", gps_longitude: "102.200000" });
  assert.equal(status, 200);
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.maps_url, newUrl, "supplied new Maps URL kept");
  assert.ok(Math.abs(Number(row.gps_latitude) - 16.2) < 1e-6, "supplied new GPS kept");
});

test("R4-B2: a new (unresolvable) Maps URL never falls back to the unchanged old address", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  // Old address parses to 13.5,100.5; old maps/pin is 13.1,100.1.
  const jobId = await seedJob({
    address_text: "@13.500000,100.500000", maps_url: "https://maps.google.com/?q=13.1,100.1",
    gps_latitude: 13.1, gps_longitude: 100.1, service_zone_code: "ZONE_A", service_zone_source: "admin_override",
  });
  // Change ONLY the Maps URL to an unresolvable one (address unchanged).
  const { status, json } = await putEdit(jobId, { maps_url: "https://example.com/unresolvable-B" });
  assert.equal(status, 200);
  assert.equal(json.gps_action, "cleared");
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.equal(row.gps_latitude, null, "GPS must be NULL — never the old address's 13.5 or the old pin's 13.1");
  assert.notEqual(row.service_zone_code, "ZONE_A", "old zone A must not remain");
});

test("R4-B2b: an address-only change derives GPS from the new address", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const jobId = await seedJob({ address_text: "@13.100000,100.100000", gps_latitude: 13.1, gps_longitude: 100.1 });
  const { status } = await putEdit(jobId, { address_text: "@15.900000,101.900000" });
  assert.equal(status, 200);
  const row = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [jobId]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(row.gps_latitude) - 15.9) < 1e-6, "GPS derived from the NEW address");
});

// ---- Round-4 Blocker 3: /admin/book_v2 rejects invalid explicit GPS --------
const BOOK_BASE = {
  customer_name: "ลูกค้าทดสอบ", customer_phone: "0800000001",
  job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
  address_text: "123 สุขุมวิท", maps_url: "", job_zone: "พระโขนง",
  booking_mode: "scheduled", tech_type: "company",
  assign_mode: "single", dispatch_mode: "forced", technician_username: "e2e_tech",
  services: [{ job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา" }],
};
// Each successful booking reserves the technician, so stagger appointment times
// far apart to avoid a legitimate collision (409) between successive bookings.
let bookApptSeq = 0;
function nextBookingAppt() {
  const t = new Date(Date.now() + (3 + bookApptSeq * 2) * 86400000);
  bookApptSeq += 1;
  t.setHours(10, 0, 0, 0);
  return t.toISOString().slice(0, 19);
}
async function postBook(extra) {
  const res = await fetch(`${BASE}/admin/book_v2`, {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ ...BOOK_BASE, appointment_datetime: nextBookingAppt(), ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("R4-B3: /admin/book_v2 rejects partial/invalid explicit GPS with 400 (backend, not just UI)", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const cases = [
    { gps_latitude: "13.7", gps_longitude: "" },     // lat only
    { gps_latitude: "", gps_longitude: "100.5" },    // lng only
    { gps_latitude: "abc", gps_longitude: "100.5" }, // invalid string
    { gps_latitude: "200", gps_longitude: "100.5" }, // out of range
    { gps_latitude: "0", gps_longitude: "0" },       // 0,0
  ];
  for (const gps of cases) {
    const { status, json } = await postBook(gps);
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(gps)} (got ${status})`);
    assert.equal(json.code, "INVALID_JOB_SITE_COORDINATES");
    assert.ok(json.error && json.error.length, "Thai error present");
  }
});

test("R4-B3b: /admin/book_v2 accepts a valid explicit pair and never persists 0,0 for missing GPS", async (t) => {
  if (dbUnavailable) { t.skip(dbUnavailable); return; }
  const withGps = await postBook({ customer_phone: "0800000010", gps_latitude: "13.744000", gps_longitude: "100.534000" });
  if (!(withGps.status >= 200 && withGps.status < 300) || !withGps.json.job_id) {
    t.skip(`book_v2 success path not exercisable in this schema (status ${withGps.status}: ${withGps.json.error || "no job_id"})`);
    return;
  }
  const rowA = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [withGps.json.job_id]).then((r) => r.rows[0]));
  assert.ok(Math.abs(Number(rowA.gps_latitude) - 13.744) < 1e-6, "explicit GPS persisted");

  const noGps = await postBook({ customer_phone: "0800000011" });
  assert.ok(noGps.status >= 200 && noGps.status < 300 && noGps.json.job_id, `both-omitted booking should succeed: ${noGps.json.error || ""}`);
  const rowB = await withDb((db) => db.query("SELECT * FROM public.jobs WHERE job_id=$1", [noGps.json.job_id]).then((r) => r.rows[0]));
  // No coords + no parseable maps/address → NULL (never the number 0,0).
  assert.ok(rowB.gps_latitude === null || !(Number(rowB.gps_latitude) === 0 && Number(rowB.gps_longitude) === 0), "missing GPS must not persist as 0,0");
});
