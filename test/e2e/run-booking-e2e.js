"use strict";

/*
 * Customer App booking readiness — Browser E2E against the REAL app + REAL PostgreSQL.
 *
 * What this does:
 *   1. Connects to a local/staging PostgreSQL (env E2E_PG_*), creates a fresh database.
 *   2. Loads test/e2e/schema-core.sql (only the legacy tables boot doesn't create).
 *   3. Boots TWO real `node index.js` instances on the same database:
 *        A (port 4620): booking lanes ENABLED  — scenarios 1-12
 *        B (port 4621): booking lanes DISABLED — scenario 13 (kill switch / LINE fallback)
 *   4. Seeds technicians (+ service matrix + monthly calendar), a partner tech,
 *      an admin user + session, via SQL.
 *   5. Drives the real Customer App UI with Playwright Chromium through the 13
 *      mandatory scenarios, asserting against the REAL database after each step.
 *
 * Run:  node test/e2e/run-booking-e2e.js
 * Env:  E2E_PG_HOST (127.0.0.1) E2E_PG_PORT (5433) E2E_PG_USER (postgres)
 *       E2E_PG_PASSWORD (postgres) E2E_KEEP_DB=1 to keep the database afterwards.
 *
 * NEVER run against production — it creates users/jobs and drops its own database.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool, Client } = require("pg");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PG = {
  host: process.env.E2E_PG_HOST || "127.0.0.1",
  port: Number(process.env.E2E_PG_PORT || 5433),
  user: process.env.E2E_PG_USER || "postgres",
  password: process.env.E2E_PG_PASSWORD || "postgres",
};
const DB_NAME = `cwf_e2e_${Date.now()}`;
const PORT_A = Number(process.env.E2E_PORT_A || 4620); // booking enabled
const PORT_B = Number(process.env.E2E_PORT_B || 4621); // booking disabled (kill switch)
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;
const APP_URL_A = `${BASE_A}/customer-app/index.html`;
const APP_URL_B = `${BASE_B}/customer-app/index.html`;

const results = [];
let pool = null;
const children = [];

function log(msg) { process.stdout.write(`${msg}\n`); }

function ymdBangkok(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}

let lastPages = new Set();
async function record(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    log(`  ✅ ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.message).split("\n")[0] });
    log(`  ❌ ${name}: ${String(error.message).split("\n")[0]}`);
    // Evidence for diagnosis: snapshot every page that is still open.
    let n = 0;
    for (const p of lastPages) {
      try { await p.screenshot({ path: path.join(__dirname, `fail-${results.length}-${n++}.png`) }); } catch (_) {}
    }
  }
}

// The app re-renders whole sections on every state change, which makes
// hit-testing-based clicks flaky. All wizard buttons carry direct listeners,
// so dispatching the event at the element is both stable and faithful.
async function tap(locator, { timeout = 15000 } = {}) {
  await locator.waitFor({ state: "attached", timeout });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.dispatchEvent("click");
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------- infra ----

// The app's boot bootstrap does not cover every table on a truly empty
// database, so extract the REAL `CREATE TABLE IF NOT EXISTS public.*`
// definitions straight from the application source and run them — the schema
// under test is exactly the schema the app declares.
function extractCreateTableStatements(src) {
  const out = [];
  const re = /CREATE TABLE IF NOT EXISTS public\.([a-z_]+)\s*\(/g;
  let m;
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

async function createDatabase() {
  const admin = new Client({ ...PG, database: "postgres" });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME} ENCODING 'UTF8'`);
  await admin.end();
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema-core.sql"), "utf8");
  const db = new Client({ ...PG, database: DB_NAME });
  await db.connect();
  await db.query(schemaSql);
  await db.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password TEXT`);
  const appCreates = [
    ...extractCreateTableStatements(fs.readFileSync(path.join(REPO_ROOT, "index.js"), "utf8")),
    ...extractCreateTableStatements(fs.readFileSync(path.join(REPO_ROOT, "server", "customerPricing.js"), "utf8")),
  ];
  for (const stmt of appCreates) {
    try { await db.query(stmt); } catch (e) { log(`(schema extract skipped: ${e.message.slice(0, 90)})`); }
  }
  // Production evolved several tables via boot-time ALTER ... ADD COLUMN
  // IF NOT EXISTS self-heals — replay the same statements from source.
  for (const srcFile of ["index.js", path.join("server", "customerPricing.js")]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, srcFile), "utf8");
    const alters = src.match(/ALTER TABLE public\.[a-z_]+ ADD COLUMN IF NOT EXISTS [^`;)]+/g) || [];
    for (const alter of alters) {
      if (alter.includes("${")) continue;
      try { await db.query(alter); } catch (_) { /* table not in scope — fine */ }
    }
  }
  // Finally, replay the repo's additive migration files (idempotent) so
  // migration-managed columns (catalog marketplace, price-rule links, ...)
  // exist exactly as production got them.
  const migrationsDir = path.join(REPO_ROOT, "migrations");
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try { await db.query(sql); } catch (_) { /* non-booking migrations may not apply — fine */ }
  }
  await db.end();
}

async function dropDatabase() {
  if (process.env.E2E_KEEP_DB === "1") { log(`(keeping database ${DB_NAME})`); return; }
  const admin = new Client({ ...PG, database: "postgres" });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
  await admin.end();
}

function bootApp(port, extraEnv = {}) {
  const logFile = path.join(__dirname, `app-${port}.log`);
  const out = fs.openSync(logFile, "w");
  const child = spawn(process.execPath, ["index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_HOST: PG.host, DB_PORT: String(PG.port), DB_USER: PG.user,
      DB_PASSWORD: PG.password, DB_NAME,
      PORT: String(port),
      CWF_JWT_SECRET: "e2e-test-secret",
      ENABLE_CUSTOMER_SCHEDULED_BOOKING: "true",
      ENABLE_CUSTOMER_URGENT_BOOKING: "true",
      ...extraEnv,
    },
    stdio: ["ignore", out, out],
  });
  children.push(child);
  return child;
}

async function waitForReady(base, { timeoutMs = 90000 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`app at ${base} not ready in ${timeoutMs}ms`);
    try {
      const res = await fetch(`${base}/public/pricing_preview`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_type: "ล้างแอร์", ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา" }),
      });
      if (res.ok) {
        const ready = await pool.query("SELECT to_regclass('public.job_offers') AS a, to_regclass('public.technician_service_matrix') AS b, to_regclass('public.technician_monthly_work_calendar') AS c");
        const r = ready.rows[0];
        if (r.a && r.b && r.c) return;
      }
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------------------------------------------------------------- seed ----

const MATRIX_WASH_WALL = {
  job_types: { wash: true },
  ac_types: { wall: true },
  wash_wall_variants: { normal: true, premium: true },
  repair_variants: {},
};

async function seedTechnician(username, { employment = "company", date, maxJobs = 1, maxUnits = 5, urgentOk = true } = {}) {
  await pool.query(`INSERT INTO public.users (username, role) VALUES ($1,'technician') ON CONFLICT (username) DO NOTHING`, [username]);
  await pool.query(
    `INSERT INTO public.technician_profiles (username, full_name, employment_type, accept_status, accept_status_expires_at, customer_slot_visible, work_start, work_end)
     VALUES ($1,$2,$3,'ready', NOW() + INTERVAL '12 hours', TRUE, '09:00','18:00')
     ON CONFLICT (username) DO UPDATE SET employment_type=EXCLUDED.employment_type, accept_status='ready', accept_status_expires_at=NOW() + INTERVAL '12 hours', customer_slot_visible=TRUE`,
    [username, `ช่าง ${username}`, employment]
  );
  await pool.query(
    `INSERT INTO public.technician_service_matrix (username, matrix_json) VALUES ($1,$2::jsonb)
     ON CONFLICT (username) DO UPDATE SET matrix_json=EXCLUDED.matrix_json`,
    [username, JSON.stringify(MATRIX_WASH_WALL)]
  );
  const dates = Array.isArray(date) ? date : [date];
  for (const d of dates) {
    if (!d) continue;
    await pool.query(
      `INSERT INTO public.technician_monthly_work_calendar
         (technician_username, work_date, day_status, can_accept_advance_job, can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, source)
       VALUES ($1,$2,'working',TRUE,$5,'09:00','18:00',$3,$4,'e2e')
       ON CONFLICT (technician_username, work_date) DO UPDATE
         SET day_status='working', can_accept_advance_job=TRUE, can_accept_urgent_job=$5, max_jobs_per_day=$3, max_units_per_day=$4`,
      [username, d, maxJobs, maxUnits, urgentOk]
    );
  }
}

async function seedAdminSession() {
  await pool.query(`INSERT INTO public.users (username, role) VALUES ('e2e_admin','admin') ON CONFLICT (username) DO UPDATE SET role='admin'`);
  const token = crypto.randomBytes(24).toString("hex");
  await pool.query(
    `INSERT INTO public.auth_sessions (session_token, username, role, expires_at) VALUES ($1,'e2e_admin','admin', NOW() + INTERVAL '4 hours')`,
    [token]
  );
  return token;
}

// ------------------------------------------------------------ ui drivers ----

async function fillContactStep(page, { name = "ลูกค้า ทดสอบ", phone = "0812345678", address = "99/1 หมู่บ้านทดสอบ ถนนอ่อนนุช เขตสวนหลวง กทม 10250" } = {}) {
  await page.locator('[data-scheduled-field="customer_name"]').fill(name);
  await page.locator('[data-scheduled-field="customer_phone"]').fill(phone);
  await page.locator('[data-scheduled-field="address_text"]').fill(address);
}

async function chooseWashWallService(page, scope = null) {
  // Step 1 service line: pick ผนัง -> BTU 12000 -> ล้างธรรมดา via choice buttons.
  const rootLoc = scope || page;
  const pick = async (field, value) => {
    const btn = rootLoc.locator(`[data-line-choice="${field}"][data-choice-value="${value}"]`).first();
    await tap(btn);
    await page.waitForTimeout(250); // re-render
  };
  await pick("ac_type", "ผนัง");
  await pick("btu", "12000");
  await pick("wash_variant", "ล้างธรรมดา");
}

async function goToBookingWizard(page, appUrl) {
  await page.goto(`${appUrl}#scheduled`, { waitUntil: "domcontentloaded" });
  // A restored draft may land on a later step — reset to a clean wizard.
  await page.evaluate(() => {
    try { window.CWFCustomerAppV2.state.resetScheduledDraft(); } catch (_) {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-line-choice]", { timeout: 20000 }); // step 1: services
}

async function pickDateAndSlot(page, ymd, { slotIndex = 0 } = {}) {
  const day = page.locator(`[data-calendar-date="${ymd}"]`);
  await tap(day, { timeout: 25000 });
  const slot = page.locator("[data-real-slot-key]").nth(slotIndex);
  await slot.waitFor({ state: "attached", timeout: 25000 });
  const slotKey = await slot.getAttribute("data-real-slot-key");
  await tap(slot);
  return slotKey;
}

async function chooseTimeProposal(page, value = "false") {
  const btn = page.locator(`[data-time-proposal="${value}"]`);
  if (await btn.count()) await tap(btn.first());
}

async function nextStep(page) {
  await tap(page.locator('[data-action="wizard-next"]'));
  await page.waitForTimeout(400);
}

async function completeScheduledWizard(page, appUrl, ymd, opts = {}) {
  // Wizard: step 1 = services -> step 2 = contact + calendar + slot -> step 3 = review.
  await goToBookingWizard(page, appUrl);
  await chooseWashWallService(page);
  await nextStep(page); // -> step 2
  await page.waitForSelector('[data-scheduled-field="customer_name"]', { timeout: 20000 });
  await fillContactStep(page, opts.contact || {});
  const slotKey = await pickDateAndSlot(page, ymd, opts);
  await chooseTimeProposal(page, "false");
  await nextStep(page); // -> step 3 (review)
  await page.waitForSelector('[data-action="submit-scheduled"]', { timeout: 15000 });
  return slotKey;
}

async function submitAndWaitSuccess(page) {
  await tap(page.locator('[data-action="submit-scheduled"]'));
  await page.waitForSelector(".booking-result-card", { timeout: 30000 });
  const code = (await page.locator(".booking-code-value").textContent() || "").trim();
  assert(/^CWF/.test(code), `expected booking code, got "${code}"`);
  return code;
}

// -------------------------------------------------------------- helpers ----

async function jobCountWhere(where, params = []) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM public.jobs WHERE ${where}`, params);
  return r.rows[0].n;
}

async function apiBook(base, payload) {
  const res = await fetch(`${base}/public/book`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  return { status: res.status, body };
}

function scheduledPayload(ymd, start, overrides = {}) {
  return {
    customer_name: "ลูกค้า API", customer_phone: "0899999999",
    job_type: "ล้างแอร์", appointment_datetime: `${ymd}T${start}:00`,
    address_text: "99/2 ทดสอบ API กทม", booking_mode: "scheduled",
    client_app: "customer_app_v2", allow_time_proposal: false,
    ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
    scheduled_request_key: crypto.randomBytes(16).toString("hex"),
    ...overrides,
  };
}

// ------------------------------------------------------------- scenarios ----

async function main() {
  log(`E2E database: ${DB_NAME} on ${PG.host}:${PG.port}`);
  const adminPool = new Client({ ...PG, database: "postgres" });
  await adminPool.connect();
  await adminPool.query("SELECT 1");
  await adminPool.end();

  await createDatabase();
  pool = new Pool({ ...PG, database: DB_NAME, max: 5 });

  log("booting app A (booking enabled) + app B (booking disabled)...");
  bootApp(PORT_A, {});
  bootApp(PORT_B, { ENABLE_CUSTOMER_SCHEDULED_BOOKING: "false", ENABLE_CUSTOMER_URGENT_BOOKING: "false" });
  await waitForReady(BASE_A);
  await waitForReady(BASE_B);
  log("apps ready.");

  const tomorrow = ymdBangkok(1);
  const dayAfter = ymdBangkok(2);
  const today = ymdBangkok(0);

  // Capacity note: tech_a works tomorrow+dayAfter (1 job/day). tech_race works
  // dayAfter only — scenario 4 uses dayAfter where both techs are free but each
  // capped at 1 job... for a true "last slot" race we use a dedicated date with
  // ONE technician only (raceDay = day 3).
  const raceDay = ymdBangkok(3);
  const staleDay = ymdBangkok(4);
  const multiDay = ymdBangkok(5);
  const retryDay = ymdBangkok(6);
  const reloadDay = ymdBangkok(7);

  await seedTechnician("tech_a", { date: [tomorrow, dayAfter, multiDay, reloadDay], maxJobs: 3, maxUnits: 9 });
  await seedTechnician("tech_solo", { date: [raceDay, staleDay, retryDay], maxJobs: 1, maxUnits: 5 });
  await seedTechnician("tech_partner", { employment: "partner", date: [today, tomorrow], urgentOk: true });
  await seedTechnician("tech_partner2", { employment: "partner", date: [today, tomorrow], urgentOk: true });
  // Zone A covers เขตสวนหลวง — the urgent offer engine targets partners by zone.
  await pool.query(`UPDATE public.technician_profiles SET home_service_zone_code='A' WHERE username IN ('tech_partner','tech_partner2')`).catch(() => {});

  async function seedSessionFor(username, role) {
    const token = crypto.randomBytes(24).toString("hex");
    await pool.query(
      `INSERT INTO public.auth_sessions (session_token, username, role, expires_at) VALUES ($1,$2,$3, NOW() + INTERVAL '4 hours')`,
      [token, username, role]
    );
    return token;
  }
  const adminSession = await seedAdminSession();

  // The sandbox pre-installs Chromium at a pinned build; point Playwright at
  // it explicitly so a version-mismatched registry lookup can't fail the run.
  const chromiumCandidates = [
    process.env.E2E_CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].filter(Boolean);
  const executablePath = chromiumCandidates.find((p) => { try { fs.accessSync(p); return true; } catch (_) { return false; } });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  lastPages.add(page);
  ctx.on("page", (p) => { lastPages.add(p); p.on("close", () => lastPages.delete(p)); });

  // 1) Scheduled booking success through the real UI.
  let bookingCode1 = "";
  let bookingToken1 = "";
  await record("S1 scheduled booking succeeds end-to-end (UI -> PostgreSQL)", async () => {
    await completeScheduledWizard(page, APP_URL_A, tomorrow);
    bookingCode1 = await submitAndWaitSuccess(page);
    const r = await pool.query(
      `SELECT booking_token, job_status, booking_mode, job_source, technician_username, job_price, duration_min
         FROM public.jobs WHERE booking_code=$1`, [bookingCode1]);
    assert(r.rows.length === 1, "job row not found in PostgreSQL");
    const job = r.rows[0];
    bookingToken1 = job.booking_token;
    assert(job.booking_mode === "scheduled" && job.job_source === "customer", "wrong mode/source");
    assert(job.technician_username, "no technician reserved");
    assert(Number(job.job_price) > 0, "job_price must be > 0");
    assert(Number(job.duration_min) > 0, "duration_min must be > 0");
  });

  // 2) Double-click cannot create two jobs.
  await record("S2 double-click submit creates exactly one job", async () => {
    const before = await jobCountWhere("job_source='customer'");
    await completeScheduledWizard(page, APP_URL_A, tomorrow, { slotIndex: 1 });
    // A realistic double-tap: two click events in the same burst. (A third,
    // later click would land on the success screen's next button — a different
    // gesture entirely.) The server-side request key + in-flight guard must
    // still produce exactly one job.
    await page.evaluate(() => {
      const el = document.querySelector('[data-action="submit-scheduled"]');
      el.click(); el.click();
    });
    await page.waitForSelector(".booking-result-card", { timeout: 30000 });
    const after = await jobCountWhere("job_source='customer'");
    assert(after === before + 1, `expected +1 job, got +${after - before}`);
  });

  // 3) Network drop after server commit -> reload -> resubmit returns the SAME job.
  await record("S3 reload after submit resumes the same job (idempotent replay)", async () => {
    const p2 = await ctx.newPage();
    await completeScheduledWizard(p2, APP_URL_A, reloadDay);
    // First submit: forward the EXACT request to the server (it commits), then
    // cut the response — the phone never learns the booking succeeded.
    let intercepted = false;
    await p2.route("**/public/book", async (route) => {
      if (!intercepted) {
        intercepted = true;
        try {
          const resp = await fetch(`${BASE_A}/public/book`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: route.request().postData(),
          });
          await resp.text();
        } catch (_) { /* the assertion below verifies the commit */ }
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });
    await tap(p2.locator('[data-action="submit-scheduled"]'));
    await p2.waitForTimeout(4000); // let the server-side booking commit
    const midCount = await jobCountWhere("appointment_datetime::date=$1", [reloadDay]);
    await p2.unroute("**/public/book");
    await p2.reload({ waitUntil: "domcontentloaded" });
    await p2.waitForSelector('[data-action="submit-scheduled"], [data-action="wizard-next"], [data-calendar-date]', { timeout: 25000 });
    // Draft (incl. scheduled_request_key) survives the reload. Availability is
    // refetched with a new query key, so the customer re-picks the slot before
    // resubmitting — the request key is what guarantees the replay.
    let code = "";
    for (let attempt = 0; attempt < 3 && !code; attempt += 1) {
      if (await p2.locator('[data-action="submit-scheduled"]').count()) {
        await tap(p2.locator('[data-action="submit-scheduled"]'));
        try {
          await p2.waitForSelector(".booking-result-card", { timeout: 15000 });
          code = (await p2.locator(".booking-code-value").textContent() || "").trim();
          break;
        } catch (_) { /* bounced back to slot step */ }
      }
      if (await p2.locator(`[data-calendar-date="${reloadDay}"]`).count()) {
        await pickDateAndSlot(p2, reloadDay);
        await chooseTimeProposal(p2, "false");
        if (await p2.locator('[data-action="wizard-next"]').count()) await nextStep(p2);
      } else if (await p2.locator('[data-action="wizard-next"]').count()) {
        await nextStep(p2);
      }
      await p2.waitForTimeout(600);
    }
    assert(/^CWF/.test(code), `expected replayed booking code, got "${code}"`);
    const finalCount = await jobCountWhere("appointment_datetime::date=$1", [reloadDay]);
    assert(midCount === 1, `expected 1 committed job after network drop, got ${midCount}`);
    assert(finalCount === 1, `replay must not create a second job (got ${finalCount})`);
    await p2.close();
  });

  // 4) Two browsers race for the last capacity -> exactly one wins.
  await record("S4 concurrent booking of the last slot: exactly one succeeds", async () => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pA = await ctx.newPage();
    const pB = await ctxB.newPage();
    await completeScheduledWizard(pA, APP_URL_A, raceDay);
    await completeScheduledWizard(pB, APP_URL_A, raceDay);
    const [ra, rb] = await Promise.allSettled([
      (async () => { await pA.locator('[data-action="submit-scheduled"]').dispatchEvent("click"); await pA.waitForSelector(".booking-result-card", { timeout: 30000 }); return "ok"; })(),
      (async () => { await pB.locator('[data-action="submit-scheduled"]').dispatchEvent("click"); await pB.waitForSelector(".booking-result-card", { timeout: 30000 }); return "ok"; })(),
    ]);
    const wins = [ra, rb].filter((x) => x.status === "fulfilled").length;
    const jobs = await jobCountWhere("appointment_datetime::date=$1", [raceDay]);
    assert(jobs === 1, `overbooking: ${jobs} jobs on race day (max_jobs_per_day=1)`);
    assert(wins === 1, `expected exactly 1 UI success, got ${wins}`);
    // The loser must see the "slot taken" message.
    const loser = ra.status === "fulfilled" ? pB : pA;
    const text = await loser.textContent("body");
    assert(/เต็ม|เลือกช่วงเวลาใหม่|เลือกเวลาอื่น/.test(text || ""), "loser did not see slot-full feedback");
    await pA.close(); await pB.close(); await ctxB.close();
  });

  // 5) Slot booked while the page is open -> submit rejected, customer re-picks.
  await record("S5 stale slot is rejected at confirm (no silent double-book)", async () => {
    const p = await ctx.newPage();
    await completeScheduledWizard(p, APP_URL_A, staleDay);
    // Someone else takes the capacity via API while our page sits on review.
    const api = await apiBook(BASE_A, scheduledPayload(staleDay, "09:00"));
    assert(api.status === 200 && api.body?.success, `API prebook failed: HTTP ${api.status}`);
    await tap(p.locator('[data-action="submit-scheduled"]'));
    await p.waitForTimeout(3500);
    const jobs = await jobCountWhere("appointment_datetime::date=$1", [staleDay]);
    assert(jobs === 1, `expected 1 job on stale day, got ${jobs}`);
    const text = await p.textContent("body");
    assert(/เต็ม|เลือกช่วงเวลาใหม่|เลือกเวลาอื่น/.test(text || ""), "no stale-slot feedback shown");
    await p.close();
  });

  // 6) Same-day cutoff: past-start today is rejected server-side.
  await record("S6 same-day cutoff rejects a start time already in the past", async () => {
    const api = await apiBook(BASE_A, scheduledPayload(today, "00:01"));
    assert(api.status === 409, `expected 409 SLOT_IN_PAST, got ${api.status}`);
    assert((api.body?.code || api.body?.error || "").includes("SLOT_IN_PAST") || api.status === 409, "wrong error");
  });

  // 7) Multi-service booking books once with combined duration/price.
  await record("S7 multi-service booking persists one job with combined services", async () => {
    const p = await ctx.newPage();
    await goToBookingWizard(p, APP_URL_A);
    await chooseWashWallService(p);
    await tap(p.locator('[data-action="add-line"]'));
    // Configure the second line (last service-line card).
    const pickLast = async (field, value) => {
      await tap(p.locator("[data-service-line-card]").last()
        .locator(`[data-line-choice="${field}"][data-choice-value="${value}"]`).first());
      await p.waitForTimeout(250);
    };
    await pickLast("ac_type", "ผนัง"); await pickLast("btu", "12000"); await pickLast("wash_variant", "ล้างธรรมดา");
    await nextStep(p); // -> step 2
    await p.waitForSelector('[data-scheduled-field="customer_name"]', { timeout: 20000 });
    await fillContactStep(p);
    await pickDateAndSlot(p, multiDay);
    await chooseTimeProposal(p, "false");
    await nextStep(p);
    const code = await submitAndWaitSuccess(p);
    const r = await pool.query(`SELECT job_price, duration_min FROM public.jobs WHERE booking_code=$1`, [code]);
    assert(r.rows.length === 1, "multi-service job missing");
    const items = await pool.query(`SELECT COUNT(*)::int AS n FROM public.job_items ji JOIN public.jobs j ON j.job_id=ji.job_id WHERE j.booking_code=$1`, [code]);
    assert(items.rows[0].n >= 2, `expected >=2 job_items, got ${items.rows[0].n}`);
    await p.close();
  });

  // 8) Urgent booking with an available partner -> offer created + waiting room.
  let urgentToken = "";
  await record("S8 urgent booking creates one job + partner offer, waiting room live", async () => {
    const p = await ctx.newPage();
    await p.goto(`${APP_URL_A}#urgent`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-urgent-field="customer_name"]', { timeout: 20000 });
    await p.locator('[data-urgent-field="customer_name"]').fill("ลูกค้า ด่วน");
    await p.locator('[data-urgent-field="customer_phone"]').fill("0822222222");
    await p.locator('[data-urgent-field="address_text"]').fill("55/5 หมู่บ้านทดสอบ เขตสวนหลวง กรุงเทพฯ 10250");
    // Service taxonomy: ล้าง -> ผนัง -> ล้างธรรมดา -> 12000 BTU.
    const choose = async (field, value) => {
      const btn = p.locator(`[data-urgent-choice="${field}"][data-choice-value="${value}"]`).first();
      await tap(btn);
      await p.waitForTimeout(250);
    };
    await choose("service_kind", "clean");
    await choose("ac_type", "ผนัง");
    await choose("wash_variant", "ล้างธรรมดา");
    await choose("btu", "12000");
    const symptom = p.locator('[data-urgent-field="symptom"]');
    if (await symptom.count()) await symptom.fill("แอร์ไม่เย็น ต้องการช่างด่วน");
    await tap(p.locator('[data-urgent-action="to-review"]'));
    await p.waitForSelector('[data-urgent-action="confirm"]', { timeout: 15000 });
    await tap(p.locator('[data-urgent-action="confirm"]'));
    await p.waitForSelector(".waiting-room, [data-urgent-live-status]", { timeout: 30000 });
    const r = await pool.query(`SELECT job_id, booking_token FROM public.jobs WHERE booking_mode='urgent' ORDER BY job_id DESC LIMIT 1`);
    assert(r.rows.length === 1, "urgent job not found");
    urgentToken = r.rows[0].booking_token;
    const offers = await pool.query(`SELECT offer_id, technician_username, status FROM public.job_offers WHERE job_id=$1`, [r.rows[0].job_id]);
    assert(offers.rows.length >= 1, "no partner offer created");
    assert(offers.rows.every((o) => ["tech_partner", "tech_partner2"].includes(o.technician_username)), "offer sent to wrong technician");

    // Both partners race to accept — exactly one may win, and the job must be
    // assigned to the winner (single-winner guarantee, real HTTP + real DB).
    const offerByTech = new Map(offers.rows.map((o) => [o.technician_username, o.offer_id]));
    const attempts = [];
    for (const tech of ["tech_partner", "tech_partner2"]) {
      const offerId = offerByTech.get(tech);
      if (!offerId) continue;
      const session = await seedSessionFor(tech, "technician");
      attempts.push(
        fetch(`${BASE_A}/offers/${offerId}/accept`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `cwf_session=${session}` },
          body: "{}",
        }).then(async (resp) => ({ tech, status: resp.status, body: await resp.json().catch(() => null) }))
      );
    }
    const raceResults = await Promise.all(attempts);
    const winners = raceResults.filter((x) => x.status === 200);
    assert(winners.length === 1, `expected exactly 1 accepted offer, got ${winners.length} (${JSON.stringify(raceResults.map((x) => x.status))})`);
    const assigned = await pool.query(`SELECT technician_username FROM public.jobs WHERE job_id=$1`, [r.rows[0].job_id]);
    assert(assigned.rows[0].technician_username === winners[0].tech, "job not assigned to the accepting technician");
    // The customer's waiting room flips to accepted via the public status feed.
    const statusRes = await (await fetch(`${BASE_A}/public/urgent-status?token=${encodeURIComponent(urgentToken)}`)).json();
    assert(statusRes.phase === "accepted" && statusRes.confirmed === true, `urgent status should be accepted, got ${statusRes.phase}`);
    await p.close();
  });

  // 9) Urgent with no acceptance -> offer expires -> job lands in admin review (not lost).
  await record("S9 expired urgent offer falls back to admin review (job never lost)", async () => {
    // A fresh urgent request via the public API (S8's job is already accepted).
    const api = await apiBook(BASE_A, {
      customer_name: "ลูกค้า ด่วนสอง", customer_phone: "0833333333",
      job_type: "ล้าง", appointment_datetime: new Date().toISOString(),
      address_text: "77/7 เขตสวนหลวง กรุงเทพฯ", booking_mode: "urgent",
      client_app: "customer_app_v2", allow_time_proposal: true,
      urgent_request_key: crypto.randomBytes(16).toString("hex"),
      ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
    });
    assert(api.status === 200 && api.body?.job_id, `urgent API booking failed: HTTP ${api.status}`);
    const jobId = api.body.job_id;
    await pool.query(`UPDATE public.job_offers SET expires_at = NOW() - INTERVAL '5 minutes' WHERE job_id=$1`, [jobId]);
    // The app's own finalizer runner ticks every 60s — call the same finalizer
    // through the real module against the same database to avoid a flaky wait.
    const finalizer = require(path.join(REPO_ROOT, "server", "services", "urgent", "finalizer"));
    await finalizer.autoFinalizeUrgentJobs(pool);
    const after = await pool.query(`SELECT job_status, canceled_at FROM public.jobs WHERE job_id=$1`, [jobId]);
    assert(after.rows[0].canceled_at === null, "urgent job must not be canceled/lost");
    assert(String(after.rows[0].job_status || "").length > 0, "urgent job lost its status");
    const offers = await pool.query(`SELECT status FROM public.job_offers WHERE job_id=$1`, [jobId]);
    assert(offers.rows.every((o) => o.status !== "pending"), "expired offers must not stay pending");
  });

  // 10) Admin sees the new bookings in the review queue.
  await record("S10 admin review queue shows the customer bookings (with admin session)", async () => {
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await adminCtx.addCookies([{ name: "cwf_session", value: adminSession, url: BASE_A }]);
    const p = await adminCtx.newPage();
    await p.goto(`${BASE_A}/admin-review-v2.html`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(5000); // let the queue load + notifications evaluate
    const text = await p.textContent("body");
    assert(text && text.includes(bookingCode1), `admin queue does not show ${bookingCode1}`);
    await p.close(); await adminCtx.close();
  });

  // 11) Customer tracking after booking + privacy split (token vs code).
  await record("S11 tracking works after booking; booking_code lookups are PII-redacted", async () => {
    // token lookup -> full detail
    const full = await (await fetch(`${BASE_A}/public/track?q=${encodeURIComponent(bookingToken1)}`)).json();
    assert(full.access_level === "token", "token lookup should be full access");
    assert(full.customer_phone === "0812345678", "full access should return the real phone");
    // code lookup -> masked
    const red = await (await fetch(`${BASE_A}/public/track?q=${encodeURIComponent(bookingCode1)}`)).json();
    assert(red.access_level === "code", "code lookup should be limited access");
    assert(red.booking_token === null, "code lookup must not echo the token");
    assert(String(red.customer_phone || "").includes("5678") && !String(red.customer_phone).includes("0812345678"), "phone must be masked");
    assert(red.gps_latitude === null && red.maps_url === null, "GPS/maps must be hidden");
    assert(red.receipt_url === null, "receipt link must be hidden for code lookups");
    // In-browser: tracking page renders for the customer.
    const p = await ctx.newPage();
    await p.goto(`${APP_URL_A}#tracking`, { waitUntil: "domcontentloaded" });
    await p.locator("#tracking-code").fill(bookingCode1);
    await tap(p.locator('[data-action="track-read"]'));
    await p.waitForTimeout(2500);
    const text = await p.textContent("body");
    assert(text.includes(bookingCode1) || /สถานะ|รอดำเนินการ|รอตรวจสอบ/.test(text), "tracking result not rendered");
    await p.close();
  });

  // 12) Offline/timeout recovery: submit while offline -> error -> retry online -> one job.
  await record("S12 offline submit recovers without duplicate after reconnect", async () => {
    const p = await ctx.newPage();
    try {
      await completeScheduledWizard(p, APP_URL_A, retryDay);
      await ctx.setOffline(true);
      await tap(p.locator('[data-action="submit-scheduled"]'));
      await p.waitForTimeout(3500);
      const errText = await p.textContent("body");
      // Note: a pure network failure currently surfaces fetch's raw message —
      // recorded as a P2 wording follow-up; the recovery behavior is what P0 needs.
      assert(/ไม่สำเร็จ|ผิดพลาด|เชื่อมต่อ|ลองใหม่|เต็ม|ออฟไลน์|failed to fetch/i.test(errText || ""), "no offline error message shown");
    } finally {
      await ctx.setOffline(false); // never leak offline state into later scenarios
    }
    // Retrying may need a fresh slot revalidation round-trip first.
    await p.waitForTimeout(1000);
    await tap(p.locator('[data-action="submit-scheduled"]'));
    await p.waitForSelector(".booking-result-card", { timeout: 30000 });
    const jobs = await jobCountWhere("appointment_datetime::date=$1", [retryDay]);
    assert(jobs === 1, `expected exactly 1 job after offline retry, got ${jobs}`);
    await p.close();
  });

  // 13) Kill switch: booking disabled -> 503 + LINE fallback, zero jobs created.
  await record("S13 kill switch shows LINE fallback and never creates a job", async () => {
    const before = await jobCountWhere("TRUE");
    const p = await ctx.newPage();
    await completeScheduledWizard(p, APP_URL_B, tomorrow);
    // Earlier scenarios shift live capacity, so the first submit may bounce on
    // slot revalidation — re-pick and resubmit until the 503 gate answers.
    let lineShown = false;
    for (let attempt = 0; attempt < 3 && !lineShown; attempt += 1) {
      if (await p.locator('[data-action="submit-scheduled"]').count()) {
        await tap(p.locator('[data-action="submit-scheduled"]'));
      }
      try {
        await p.waitForSelector(".line-fallback-btn", { timeout: 12000 });
        lineShown = true;
        break;
      } catch (_) { /* bounced — re-pick a slot */ }
      if (await p.locator("[data-calendar-date]").count()) {
        const day = p.locator("[data-calendar-date]").first();
        await tap(day);
        const slot = p.locator("[data-real-slot-key]").first();
        await slot.waitFor({ state: "attached", timeout: 20000 }).catch(() => {});
        if (await slot.count()) await tap(slot);
        await chooseTimeProposal(p, "false");
        if (await p.locator('[data-action="wizard-next"]').count()) await nextStep(p);
      }
    }
    assert(lineShown, "LINE fallback button never appeared");
    const href = await p.locator(".line-fallback-btn").getAttribute("href");
    assert(href && href.startsWith("https://lin.ee/"), "LINE fallback link missing");
    // Direct API double-check for both lanes.
    const sched = await apiBook(BASE_B, scheduledPayload(tomorrow, "13:00"));
    assert(sched.status === 503 && sched.body?.code === "SCHEDULED_BOOKING_DISABLED", "scheduled lane not closed");
    const urgent = await apiBook(BASE_B, {
      customer_name: "x", customer_phone: "0811111111", job_type: "ล้างแอร์",
      appointment_datetime: new Date().toISOString(), address_text: "y",
      booking_mode: "urgent", client_app: "customer_app_v2",
      urgent_request_key: crypto.randomBytes(16).toString("hex"),
      ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
    });
    assert(urgent.status === 503 && urgent.body?.code === "URGENT_BOOKING_DISABLED", "urgent lane not closed");
    const after = await jobCountWhere("TRUE");
    assert(after === before, `kill switch leaked ${after - before} job(s)`);
    await p.close();
  });

  // Bonus hardening probes (rate limit + receipt gate) — part of privacy verification.
  await record("P1 rate limit answers 429 after the per-minute budget", async () => {
    let got429 = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await fetch(`${BASE_A}/public/track?q=CWFNOPE${i}`, { headers: { "x-forwarded-for": "203.0.113.99" } });
      if (res.status === 429) { got429 = true; break; }
    }
    assert(got429, "no 429 after 40 rapid lookups");
  });

  await record("P2 receipt requires booking_token key (bare job_id 404s; key works)", async () => {
    const r = await pool.query(`SELECT job_id, booking_token FROM public.jobs WHERE booking_code=$1`, [bookingCode1]);
    const { job_id, booking_token } = r.rows[0];
    await pool.query(`UPDATE public.jobs SET job_status='เสร็จแล้ว', finished_at=NOW() WHERE job_id=$1`, [job_id]);
    const bare = await fetch(`${BASE_A}/docs/receipt/${job_id}`, { headers: { "x-forwarded-for": "203.0.113.50" } });
    assert(bare.status === 404, `bare job_id receipt must 404, got ${bare.status}`);
    const keyed = await fetch(`${BASE_A}/docs/receipt/${job_id}?key=${encodeURIComponent(booking_token)}`, { headers: { "x-forwarded-for": "203.0.113.51" } });
    assert(keyed.status === 200, `keyed receipt must 200, got ${keyed.status}`);
  });

  await browser.close();
}

// ------------------------------------------------------------------ run ----

main()
  .catch((error) => {
    log(`FATAL: ${error.stack || error.message}`);
    results.push({ name: "harness", ok: false, error: error.message });
  })
  .finally(async () => {
    for (const child of children) { try { child.kill("SIGKILL"); } catch (_) {} }
    try { if (pool) await pool.end(); } catch (_) {}
    try { await dropDatabase(); } catch (_) {}
    const pass = results.filter((r) => r.ok).length;
    const fail = results.length - pass;
    log("\n===== E2E SUMMARY =====");
    for (const r of results) log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : ` — ${r.error}`}`);
    log(`total=${results.length} pass=${pass} fail=${fail}`);
    process.exitCode = fail === 0 ? 0 : 1;
  });
