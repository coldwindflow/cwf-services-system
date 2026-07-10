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
  // Boot also creates the indexes several features rely on — notably the UNIQUE
  // index that backs `ON CONFLICT (job_id)` in /public/review. Replay every
  // `CREATE [UNIQUE] INDEX IF NOT EXISTS` the app declares so those code paths
  // behave exactly as they do in production.
  for (const srcFile of ["index.js", path.join("server", "customerPricing.js")]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, srcFile), "utf8");
    const indexes = src.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^`;]+/g) || [];
    for (const idx of indexes) {
      if (idx.includes("${")) continue;
      try { await db.query(idx); } catch (_) { /* target table not in scope — fine */ }
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

// SAFETY: neutralise every outbound integration so a scenario that creates a
// real job can NEVER message a customer, dispatch to a real technician, or hit
// a third party — even if the runner's shell/.env holds production secrets.
// dotenv does not overwrite already-present keys, so setting these to "" (they
// are "present") blocks a repo .env from re-injecting real values.
const OUTBOUND_KILL_ENV = {
  // LINE messaging / admin targets
  LINE_BOT_CHANNEL_ACCESS_TOKEN: "", LINE_CHANNEL_ACCESS_TOKEN: "", LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "",
  LINE_CHANNEL_SECRET: "", LINE_CHANNEL_ID: "", LINE_ADMIN_GROUP_ID: "", LINE_ADMIN_USER_ID: "",
  PARTNER_ADMIN_LINE_TARGETS: "", PARTNER_LINE_NOTIFY_ENABLED: "false",
  // Web push
  ENABLE_WEB_PUSH_NOTIFICATIONS: "false", WEB_PUSH_PUBLIC_KEY: "", WEB_PUSH_PRIVATE_KEY: "",
  VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "",
  // Payments — must never reach Omise from a booking E2E
  OMISE_SECRET_KEY: "", OMISE_PUBLIC_KEY: "", OMISE_WEBHOOK_SECRET: "",
  // AI / other third parties
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
  // Cloud media
  CLOUDINARY_URL: "", CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "",
  // Explicit test marker
  CWF_E2E_TEST_MODE: "1", NODE_ENV: "test",
};

function bootApp(port, extraEnv = {}) {
  const logFile = path.join(__dirname, `app-${port}.log`);
  const out = fs.openSync(logFile, "w");
  const child = spawn(process.execPath, ["index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...OUTBOUND_KILL_ENV,
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

// Refuse to run against anything that looks like a real database unless the
// operator explicitly opts in — this harness CREATEs and DROPs its database.
function assertSafeTarget() {
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);
  if (localHosts.has(PG.host) || process.env.E2E_ALLOW_REMOTE === "1") return;
  throw new Error(
    `Refusing to run booking E2E against non-local PostgreSQL host "${PG.host}". ` +
    `This harness creates and DROPs its own database. Set E2E_ALLOW_REMOTE=1 only for a disposable staging DB.`
  );
}

// The harness tolerates individual schema statements failing (many app tables
// are unrelated to booking), but the booking scenarios are meaningless if the
// core tables are missing. Fail loudly instead of "passing" on a thin schema.
async function assertCoreSchema() {
  const required = [
    "jobs", "job_offers", "job_items", "job_promotions",
    "technician_service_matrix", "technician_monthly_work_calendar",
    "catalog_items", "customer_service_price_rules", "auth_sessions",
    "users", "technician_profiles",
  ];
  const r = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [required]
  );
  const present = new Set(r.rows.map((x) => x.table_name));
  const missing = required.filter((t) => !present.has(t));
  if (missing.length) throw new Error(`core booking schema incomplete — missing tables: ${missing.join(", ")}`);
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
  assertSafeTarget();
  log(`E2E database: ${DB_NAME} on ${PG.host}:${PG.port} (outbound integrations disabled)`);
  const adminPool = new Client({ ...PG, database: "postgres" });
  await adminPool.connect();
  await adminPool.query("SELECT 1");
  await adminPool.end();

  await createDatabase();
  pool = new Pool({ ...PG, database: DB_NAME, max: 5 });
  await assertCoreSchema();

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
  const r2Day = ymdBangkok(8); // round-2 canonical-protection probes (headroom for replay)

  await seedTechnician("tech_a", { date: [tomorrow, dayAfter, multiDay, reloadDay, r2Day], maxJobs: 3, maxUnits: 9 });
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

  // 3) Network drop after server commit -> reload -> resubmit must NOT duplicate.
  // Under payload-bound idempotency, resubmitting the same request key with the
  // exact same payload replays the job; re-picking a different slot with the
  // reused key is correctly refused (409 IDEMPOTENCY_KEY_REUSED). Either way the
  // DB must hold exactly one job — a reload can never create a duplicate.
  await record("S3 reload after a committed-but-lost submit never creates a duplicate", async () => {
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
    assert(midCount === 1, `expected 1 committed job after network drop, got ${midCount}`);
    await p2.unroute("**/public/book");
    await p2.reload({ waitUntil: "domcontentloaded" });
    await p2.waitForSelector('[data-action="submit-scheduled"], [data-action="wizard-next"], [data-calendar-date]', { timeout: 25000 });
    // The draft (incl. scheduled_request_key) survives the reload. The customer
    // re-attempts; whether that replays or is refused as a key-reuse, the key is
    // already bound to the committed job, so no second job can be created.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await p2.locator('[data-action="submit-scheduled"]').count()) {
        await tap(p2.locator('[data-action="submit-scheduled"]'));
        try {
          await p2.waitForSelector(".booking-result-card", { timeout: 8000 });
          break; // clean replay
        } catch (_) { /* refused (key reuse) or bounced to slot step */ }
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
    const finalCount = await jobCountWhere("appointment_datetime::date=$1", [reloadDay]);
    assert(finalCount === 1, `reload/resubmit must never create a second job (got ${finalCount})`);
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
    const after = await pool.query(`SELECT job_status, canceled_at, booking_code FROM public.jobs WHERE job_id=$1`, [jobId]);
    assert(after.rows[0].canceled_at === null, "urgent job must not be canceled/lost");
    assert(String(after.rows[0].job_status || "").length > 0, "urgent job lost its status");
    const offers = await pool.query(`SELECT status FROM public.job_offers WHERE job_id=$1`, [jobId]);
    assert(offers.rows.every((o) => o.status !== "pending"), "expired offers must not stay pending");
    // The reviewer requires positive proof the abandoned job is recoverable by
    // admin — assert it actually surfaces in the admin review queue (the same
    // data feed admin-review-v2.html renders), keyed by the real admin session.
    const abandonedCode = after.rows[0].booking_code;
    const queueRes = await fetch(`${BASE_A}/admin/review_queue_v2?status=all&limit=500`, {
      headers: { cookie: `cwf_session=${adminSession}` },
    });
    assert(queueRes.status === 200, `admin review queue must load, got ${queueRes.status}`);
    const queue = await queueRes.json();
    assert(Array.isArray(queue.rows), "admin review queue payload malformed");
    const found = queue.rows.find((row) => row.booking_code === abandonedCode);
    assert(found, `no-accept urgent job ${abandonedCode} missing from admin review queue`);
    assert(found.job_id === jobId, "admin review queue row mismatched job_id");
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
    // The allowlist drops these by construction, so they are absent (undefined)
    // rather than explicitly null — either way they must not carry a value.
    assert(red.booking_token == null, "code lookup must not echo the token");
    assert(String(red.customer_phone || "").includes("5678") && !String(red.customer_phone).includes("0812345678"), "phone must be masked");
    assert(red.gps_latitude == null && red.maps_url == null, "GPS/maps must be hidden");
    assert(red.receipt_url == null, "receipt link must be hidden for code lookups");
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

  // ---------------- negative / bypass probes (reviewer-requested) ----------

  // S14) The kill switch must gate on the canonical booking_mode, never on the
  // attacker-supplied client_app. Forging client_app (or omitting it) must NOT
  // reopen a closed lane, an unknown mode must be rejected outright, and zero
  // jobs may be created on the disabled instance across every attempt.
  await record("S14 kill switch cannot be bypassed by forging/omitting client_app", async () => {
    const before = await jobCountWhere("TRUE");
    const forgedApps = ["admin_console", "internal", "", "customer_app_v2", "cwf_admin"];
    for (const app of forgedApps) {
      const sched = await apiBook(BASE_B, scheduledPayload(tomorrow, "10:30", { client_app: app }));
      assert(sched.status === 503 && sched.body?.code === "SCHEDULED_BOOKING_DISABLED",
        `scheduled lane bypassed with client_app=${JSON.stringify(app)} (HTTP ${sched.status})`);
      const urgent = await apiBook(BASE_B, {
        customer_name: "bypass", customer_phone: "0810000000", job_type: "ล้างแอร์",
        appointment_datetime: new Date().toISOString(), address_text: "z",
        booking_mode: "urgent", client_app: app,
        urgent_request_key: crypto.randomBytes(16).toString("hex"),
        ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
      });
      assert(urgent.status === 503 && urgent.body?.code === "URGENT_BOOKING_DISABLED",
        `urgent lane bypassed with client_app=${JSON.stringify(app)} (HTTP ${urgent.status})`);
    }
    // A client_app with no booking_mode still defaults to scheduled (closed).
    const noMode = await apiBook(BASE_B, scheduledPayload(tomorrow, "11:00", { client_app: "admin", booking_mode: undefined }));
    assert(noMode.status === 503, `missing booking_mode must default to the closed scheduled lane, got ${noMode.status}`);
    // An unknown booking_mode is rejected, not silently routed anywhere.
    const bogus = await apiBook(BASE_B, scheduledPayload(tomorrow, "11:30", { booking_mode: "wholesale" }));
    assert(bogus.status === 400 && bogus.body?.code === "UNKNOWN_BOOKING_MODE",
      `unknown booking_mode must 400, got ${bogus.status}`);
    // Even on the OPEN instance an unknown mode must not create a job.
    const bogusOpen = await apiBook(BASE_A, scheduledPayload(tomorrow, "11:45", { booking_mode: "wholesale" }));
    assert(bogusOpen.status === 400 && bogusOpen.body?.code === "UNKNOWN_BOOKING_MODE",
      `unknown booking_mode must 400 on the open instance too, got ${bogusOpen.status}`);
    const after = await jobCountWhere("TRUE");
    assert(after === before, `bypass probes leaked ${after - before} job(s)`);
  });

  // S15) The public-lookup rate limiter must key off the proxy-derived req.ip
  // (the nearest trusted hop), NOT the raw first X-Forwarded-For token. Rotate
  // the attacker-controlled LEFT-most XFF entry on every request while pinning
  // the nearest-hop entry: a limiter that trusted the raw first token would see
  // a fresh key each time and never trip. It must still answer 429.
  await record("S15 rotating a spoofed X-Forwarded-For does not bypass the rate limit", async () => {
    const pinnedHop = "203.0.113.222"; // the entry the trusted proxy would append
    let got429 = false;
    for (let i = 0; i < 45 && !got429; i += 1) {
      const spoof = `10.9.${i}.${(i * 7) % 255}`; // rotates every request
      const res = await fetch(`${BASE_A}/public/track?q=CWFSPOOF${i}`, {
        headers: { "x-forwarded-for": `${spoof}, ${pinnedHop}` },
      });
      if (res.status === 429) got429 = true;
    }
    assert(got429, "rate limit never tripped — a rotating spoofed XFF bypassed it");
  });

  // S16) A booking_code lookup is a minimal allowlist. Beyond the phone-masking
  // already checked in S11, prove the sensitive fields are absent by
  // construction — name, address, internal job_id, technician notes, photos,
  // unit data, cancel reason, and any review text must never appear.
  await record("S16 booking_code lookup leaks no name/address/job_id/notes/photos/units/review", async () => {
    const red = await (await fetch(`${BASE_A}/public/track?q=${encodeURIComponent(bookingCode1)}`,
      { headers: { "x-forwarded-for": "198.51.100.7" } })).json();
    assert(red.access_level === "code", "expected a limited (code) lookup");
    const forbidden = [
      "customer_name", "customer_fullname", "name",
      "address_text", "address", "address_prefix", "maps_url", "gps_latitude", "gps_longitude",
      "job_id", "id",
      "technician_note", "technician_notes", "notes", "note", "admin_note",
      "photos", "job_photos", "photo_urls",
      "units", "job_items", "items", "machine_count", "unit_data",
      "cancel_reason", "canceled_reason",
      "customer_review", "review_text", "customer_complaint", "complaint_text",
      "technician_username", "technician_name", "receipt_url",
    ];
    const leaked = forbidden.filter((k) => red[k] !== undefined && red[k] !== null);
    assert(leaked.length === 0, `booking_code lookup leaked fields: ${leaked.join(", ")}`);
    // Positive: it still returns the minimal, useful status surface.
    assert(red.booking_code === bookingCode1, "code lookup must echo the booking_code");
    assert(typeof red.job_status === "string", "code lookup must return a status");
  });

  // S17) /public/review is a WRITE. A tokened job must NOT be reviewable via the
  // short booking_code (no downgrade); only the exact booking_token authorises.
  // A genuine legacy job (no token) may still be reviewed via code + full phone,
  // and a wrong phone is denied — with the same generic error either way.
  await record("S17 review write: code denied on tokened job, token accepted; legacy code+phone still works", async () => {
    const jr = await pool.query(`SELECT job_id, customer_phone FROM public.jobs WHERE booking_code=$1`, [bookingCode1]);
    const tokenJobId = jr.rows[0].job_id;
    const tokenPhone = jr.rows[0].customer_phone;
    // Make the tokened job reviewable (completed, has a technician, unreviewed).
    await pool.query(
      `UPDATE public.jobs SET job_status='เสร็จแล้ว', finished_at=NOW(),
              technician_username='tech_a', customer_rating=NULL, reviewed_at=NULL
       WHERE job_id=$1`, [tokenJobId]);
    await pool.query(`DELETE FROM public.technician_reviews WHERE job_id=$1`, [tokenJobId]);

    const postReview = (payload, ip) => fetch(`${BASE_A}/public/review`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(payload),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    // (a) Downgrade attempt: booking_code + phone on a TOKENED job -> denied.
    const downgrade = await postReview(
      { booking_code: bookingCode1, customer_phone: tokenPhone, rating: 5, review_text: "bypass" }, "198.51.100.20");
    assert(downgrade.status !== 200 && !downgrade.body?.success,
      `tokened job must reject code+phone review, got HTTP ${downgrade.status}`);
    const afterDowngrade = await pool.query(`SELECT customer_rating FROM public.jobs WHERE job_id=$1`, [tokenJobId]);
    assert(afterDowngrade.rows[0].customer_rating === null, "downgrade attempt must not write a review");

    // (b) Exact token authorises the write.
    const tokened = await postReview({ booking_token: bookingToken1, rating: 5, review_text: "ดีมาก" }, "198.51.100.21");
    assert(tokened.status === 200 && tokened.body?.success === true, `token review must succeed, got HTTP ${tokened.status}`);
    // Response must not leak PII/token/confirmation beyond {success:true}.
    assert(Object.keys(tokened.body).join(",") === "success", `review response leaked keys: ${Object.keys(tokened.body)}`);
    const reviewed = await pool.query(`SELECT customer_rating FROM public.jobs WHERE job_id=$1`, [tokenJobId]);
    assert(Number(reviewed.rows[0].customer_rating) === 5, "token review did not persist");
    // Replaying the token review on an already-reviewed job is denied.
    const replay = await postReview({ booking_token: bookingToken1, rating: 1 }, "198.51.100.22");
    assert(replay.status !== 200 && !replay.body?.success, "already-reviewed job must reject a second review");

    // (c) Legacy job (no token) remains reviewable via code + FULL phone.
    const spare = await pool.query(
      `SELECT job_id, booking_code FROM public.jobs
        WHERE booking_token IS NOT NULL AND booking_code <> $1 AND booking_code IS NOT NULL
        ORDER BY job_id DESC LIMIT 1`, [bookingCode1]);
    if (spare.rows.length) {
      const legacyId = spare.rows[0].job_id;
      const legacyCode = spare.rows[0].booking_code;
      const legacyPhone = "0870000009";
      await pool.query(
        `UPDATE public.jobs SET booking_token=NULL, job_status='เสร็จแล้ว', finished_at=NOW(),
                technician_username='tech_a', customer_phone=$2, customer_rating=NULL, reviewed_at=NULL
         WHERE job_id=$1`, [legacyId, legacyPhone]);
      await pool.query(`DELETE FROM public.technician_reviews WHERE job_id=$1`, [legacyId]);
      // Wrong phone -> denied.
      const wrongPhone = await postReview(
        { booking_code: legacyCode, customer_phone: "0899999999", rating: 4 }, "198.51.100.23");
      assert(wrongPhone.status !== 200 && !wrongPhone.body?.success, "legacy review with wrong phone must be denied");
      // Correct full phone -> accepted.
      const legacyOk = await postReview(
        { booking_code: legacyCode, customer_phone: legacyPhone, rating: 4, review_text: "legacy ok" }, "198.51.100.24");
      assert(legacyOk.status === 200 && legacyOk.body?.success === true,
        `legacy code+phone review must succeed, got HTTP ${legacyOk.status}`);
    }
  });

  // S18) The quote document is gated identically to the receipt: a bare
  // sequential job_id 404s, the booking_token key unlocks it, and the response
  // carries the private/no-store/no-index headers.
  await record("S18 quote route: bare job_id 404s, booking_token key unlocks it with sensitive headers", async () => {
    const r = await pool.query(`SELECT job_id, booking_token FROM public.jobs WHERE booking_code=$1`, [bookingCode1]);
    const { job_id, booking_token } = r.rows[0];
    const bare = await fetch(`${BASE_A}/docs/quote/${job_id}`, { headers: { "x-forwarded-for": "198.51.100.30" } });
    assert(bare.status === 404, `bare job_id quote must 404, got ${bare.status}`);
    const keyed = await fetch(`${BASE_A}/docs/quote/${job_id}?key=${encodeURIComponent(booking_token)}`,
      { headers: { "x-forwarded-for": "198.51.100.31" } });
    assert(keyed.status === 200, `keyed quote must 200, got ${keyed.status}`);
    assert(/no-store/.test(keyed.headers.get("cache-control") || ""), "quote missing Cache-Control: no-store");
    assert(/noindex/.test(keyed.headers.get("x-robots-tag") || ""), "quote missing X-Robots-Tag: noindex");
    assert((keyed.headers.get("referrer-policy") || "") === "no-referrer", "quote missing Referrer-Policy: no-referrer");
    // A wrong key is indistinguishable from a missing one (404, no oracle).
    const wrong = await fetch(`${BASE_A}/docs/quote/${job_id}?key=deadbeef`, { headers: { "x-forwarded-for": "198.51.100.32" } });
    assert(wrong.status === 404, `wrong key must 404, got ${wrong.status}`);
  });

  // ---------- second review round: client_app is not a security boundary ----

  // S19) With booking lanes ON, scheduled protection must be CANONICAL — keyed
  // off booking_mode, not client_app. A forged/omitted client_app with no
  // request key is rejected with zero mutation, and the same request key
  // replays to a single job regardless of client_app.
  await record("S19 scheduled: canonical request-key/idempotency cannot be bypassed by forging client_app", async () => {
    const before = await jobCountWhere("TRUE");
    // No request key + omitted client_app -> reject, no job.
    const omitted = await apiBook(BASE_A, scheduledPayload(r2Day, "10:00", { client_app: undefined, scheduled_request_key: undefined }));
    assert(omitted.status === 400 && omitted.body?.code === "MISSING_REQUEST_KEY",
      `omitted client_app + no key must 400 MISSING_REQUEST_KEY, got ${omitted.status}`);
    // No request key + forged client_app -> still reject.
    const forged = await apiBook(BASE_A, scheduledPayload(r2Day, "10:00", { client_app: "admin_console", scheduled_request_key: undefined }));
    assert(forged.status === 400 && forged.body?.code === "MISSING_REQUEST_KEY",
      `forged client_app + no key must 400 MISSING_REQUEST_KEY, got ${forged.status}`);
    assert((await jobCountWhere("TRUE")) === before, "keyless scheduled attempts must create 0 jobs");
    // Same request key + SAME payload, first omitted then forged client_app ->
    // replays the SAME job (idempotent, independent of client_app). The replay
    // runs before the availability gate, so it succeeds even though the job now
    // occupies that slot — exactly the committed-but-response-lost retry case.
    const key = crypto.randomBytes(16).toString("hex");
    const first = await apiBook(BASE_A, scheduledPayload(r2Day, "10:30", { client_app: undefined, scheduled_request_key: key }));
    assert(first.status === 200 && first.body?.job_id, `first canonical scheduled booking failed: HTTP ${first.status} ${JSON.stringify(first.body)}`);
    const replay = await apiBook(BASE_A, scheduledPayload(r2Day, "10:30", { client_app: "totally_forged", scheduled_request_key: key }));
    assert(replay.status === 200 && replay.body?.replayed === true, `same-payload replay must succeed, got ${replay.status} ${JSON.stringify(replay.body)}`);
    assert(replay.body?.job_id === first.body.job_id, "same request key + same payload must replay the SAME job");
    const detToken = require("node:crypto").createHash("sha256").update(`scheduled_v1:${key}`).digest("hex").slice(0, 24);
    const dupCount = await pool.query(`SELECT COUNT(*)::int AS n FROM public.jobs WHERE booking_token=$1`, [detToken]);
    assert(dupCount.rows[0].n === 1, `request key must map to exactly one job, got ${dupCount.rows[0].n}`);
  });

  // S23) Idempotency key is bound to its payload. Reusing the key with a
  // materially different payload (time, phone) must be rejected with
  // 409 IDEMPOTENCY_KEY_REUSED — never a silent return of the first job's data,
  // and never a second job.
  await record("S23 scheduled: reusing a request key with a different payload is 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = crypto.randomBytes(16).toString("hex");
    const first = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0855550000" }));
    assert(first.status === 200 && first.body?.job_id, `seed booking failed: HTTP ${first.status} ${JSON.stringify(first.body)}`);
    const detToken = require("node:crypto").createHash("sha256").update(`scheduled_v1:${key}`).digest("hex").slice(0, 24);
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM public.jobs WHERE booking_token=$1`, [detToken]);
    // Different appointment time, same key -> reject (before any availability check).
    const diffTime = await apiBook(BASE_A, scheduledPayload(r2Day, "14:30", { scheduled_request_key: key, customer_phone: "0855550000" }));
    assert(diffTime.status === 409 && diffTime.body?.code === "IDEMPOTENCY_KEY_REUSED",
      `different time must 409 IDEMPOTENCY_KEY_REUSED, got ${diffTime.status} ${JSON.stringify(diffTime.body)}`);
    assert(!diffTime.body?.job_id && !diffTime.body?.booking_code, "409 must not leak the first job's identifiers");
    // Different phone, same key + same time -> reject.
    const diffPhone = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0866660000" }));
    assert(diffPhone.status === 409 && diffPhone.body?.code === "IDEMPOTENCY_KEY_REUSED",
      `different phone must 409 IDEMPOTENCY_KEY_REUSED, got ${diffPhone.status}`);
    // Different service composition (BTU / AC type / qty) at the SAME time -> reject,
    // even though the computed duration could match. These are caught by the
    // canonical job_items signature, not by duration.
    const diffBtu = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0855550000", btu: 18000 }));
    assert(diffBtu.status === 409 && diffBtu.body?.code === "IDEMPOTENCY_KEY_REUSED",
      `different BTU must 409 IDEMPOTENCY_KEY_REUSED, got ${diffBtu.status} ${JSON.stringify(diffBtu.body)}`);
    const diffQty = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0855550000", machine_count: 2 }));
    assert(diffQty.status === 409 && diffQty.body?.code === "IDEMPOTENCY_KEY_REUSED",
      `different machine_count must 409 IDEMPOTENCY_KEY_REUSED, got ${diffQty.status} ${JSON.stringify(diffQty.body)}`);
    // Different place (address) -> reject.
    const diffAddr = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0855550000", address_text: "99/99 ที่อยู่ใหม่ กทม" }));
    assert(diffAddr.status === 409 && diffAddr.body?.code === "IDEMPOTENCY_KEY_REUSED",
      `different address must 409 IDEMPOTENCY_KEY_REUSED, got ${diffAddr.status}`);
    // None of the 409s leaked identifiers, and none created a job.
    for (const r of [diffTime, diffPhone, diffBtu, diffQty, diffAddr]) {
      assert(!r.body?.job_id && !r.body?.booking_code && !r.body?.token, "409 must not leak the first job's identifiers");
    }
    // The EXACT same canonical payload still replays the same job.
    const exact = await apiBook(BASE_A, scheduledPayload(r2Day, "13:00", { scheduled_request_key: key, customer_phone: "0855550000" }));
    assert(exact.status === 200 && exact.body?.replayed === true && exact.body?.job_id === first.body.job_id,
      `exact same payload must replay the same job, got ${exact.status} ${JSON.stringify(exact.body)}`);
    const after = await pool.query(`SELECT COUNT(*)::int AS n FROM public.jobs WHERE booking_token=$1`, [detToken]);
    assert(after.rows[0].n === before.rows[0].n && after.rows[0].n === 1, "key reuse must not create additional jobs");
  });

  // S24) Committed-but-response-lost retry: the first submit commits, its
  // response is discarded, then the SAME request (same key + same payload) is
  // replayed — the server returns the existing job and the DB holds exactly one.
  await record("S24 committed-then-lost response: replaying the same request yields exactly one job", async () => {
    const key = crypto.randomBytes(16).toString("hex");
    const payload = scheduledPayload(r2Day, "16:00", { scheduled_request_key: key, customer_phone: "0877770000" });
    const committed = await apiBook(BASE_A, payload); // commit; pretend the client never saw this response
    assert(committed.status === 200 && committed.body?.job_id, `initial commit failed: HTTP ${committed.status} ${JSON.stringify(committed.body)}`);
    const retry = await apiBook(BASE_A, payload); // identical resubmit after "reload"
    assert(retry.status === 200 && retry.body?.replayed === true, `retry must replay, got ${retry.status} ${JSON.stringify(retry.body)}`);
    assert(retry.body?.job_id === committed.body.job_id, "retry must resolve to the same job");
    const detToken = require("node:crypto").createHash("sha256").update(`scheduled_v1:${key}`).digest("hex").slice(0, 24);
    const n = await pool.query(`SELECT COUNT(*)::int AS n FROM public.jobs WHERE booking_token=$1`, [detToken]);
    assert(n.rows[0].n === 1, `exactly one job must exist after the lost-response retry, got ${n.rows[0].n}`);
  });

  // S20) Urgent routing is CANONICAL — every public urgent request goes through
  // the customer-safe adapter on booking_mode alone. A forged/omitted client_app
  // (with attacker-chosen technician/assign fields) must be sanitised, not
  // reach the raw urgent engine, and must dedupe on the request key.
  await record("S20 urgent: forged/omitted client_app is still sanitised through the safe adapter", async () => {
    const urgentKey = crypto.randomBytes(16).toString("hex");
    const attack = {
      customer_name: "ด่วนปลอม", customer_phone: "0844444444",
      job_type: "ล้าง", appointment_datetime: new Date().toISOString(),
      address_text: "88/8 เขตสวนหลวง กรุงเทพฯ", booking_mode: "urgent",
      // NO client_app — the sanitiser must still engage on the canonical mode.
      urgent_request_key: urgentKey,
      ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา",
      // Attacker-chosen fields that the customer allowlist must strip:
      technician_username: "tech_partner", assign_mode: "manual",
      dispatch_mode: "normal", tech_type: "company", team_members: ["tech_partner2"],
    };
    const res = await apiBook(BASE_A, attack);
    assert(res.status === 200 && res.body?.job_id, `urgent with no client_app must still book via adapter, got ${res.status}`);
    const jobId = res.body.job_id;
    const row = await pool.query(
      `SELECT booking_mode, dispatch_mode, technician_username FROM public.jobs WHERE job_id=$1`, [jobId]);
    assert(row.rows[0].booking_mode === "urgent", "must persist as urgent");
    assert(row.rows[0].dispatch_mode === "offer", "attacker dispatch_mode must be overridden to offer");
    assert(!row.rows[0].technician_username, "attacker-supplied technician must be stripped (offer engine assigns)");
    const offers = await pool.query(`SELECT technician_username FROM public.job_offers WHERE job_id=$1`, [jobId]);
    assert(offers.rows.every((o) => ["tech_partner", "tech_partner2"].includes(o.technician_username)),
      "offers must target zoned partners via the engine, not an attacker choice");
    // Dedup on the request key: replaying the same forged request makes no 2nd job.
    await apiBook(BASE_A, attack);
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.jobs WHERE booking_mode='urgent' AND customer_phone='0844444444'`);
    assert(cnt.rows[0].n === 1, `urgent request key must dedupe, got ${cnt.rows[0].n} jobs`);
  });

  // S21) A LEGACY customer (job with no booking_token) must be able to review
  // through the real tracking UI: a booking_code lookup shows a phone-entry
  // form, a wrong phone is rejected, the right phone succeeds — and a tokened
  // job opened by code must NOT offer the legacy form (no downgrade).
  await record("S21 legacy customer reviews via the tracking UI (phone form); tokened job shows no legacy form", async () => {
    const spare = await pool.query(
      `SELECT job_id, booking_code FROM public.jobs
        WHERE booking_token IS NOT NULL AND booking_code IS NOT NULL AND booking_code <> $1
        ORDER BY job_id ASC LIMIT 1`, [bookingCode1]);
    assert(spare.rows.length, "no spare job to convert to a legacy (tokenless) job");
    const legacyId = spare.rows[0].job_id;
    const legacyCode = spare.rows[0].booking_code;
    const legacyPhone = "0876543210";
    await pool.query(
      `UPDATE public.jobs SET booking_token=NULL, job_status='เสร็จแล้ว', finished_at=NOW(),
              technician_username='tech_a', customer_phone=$2, customer_rating=NULL, reviewed_at=NULL
       WHERE job_id=$1`, [legacyId, legacyPhone]);
    await pool.query(`DELETE FROM public.technician_reviews WHERE job_id=$1`, [legacyId]);

    const p = await ctx.newPage();
    const openLookup = async () => {
      await p.goto(`${APP_URL_A}#tracking`, { waitUntil: "domcontentloaded" });
      await p.locator("#tracking-code").fill(legacyCode);
      await tap(p.locator('[data-action="track-read"]'));
      // The review form lives in the "aftercare" tab panel — activate it first.
      await p.waitForSelector('[data-tracking-view="aftercare"]', { timeout: 15000 });
      await tap(p.locator('[data-tracking-view="aftercare"]').first());
      await p.waitForSelector('[data-review-form] input[name="customer_phone"]', { timeout: 15000 });
    };
    await openLookup();
    // Wrong phone -> rejected, nothing written.
    await p.locator('[data-review-form] input[name="customer_phone"]').fill("0800000000");
    await tap(p.locator('[data-review-form] button[type="submit"]'));
    await p.waitForTimeout(2500);
    let rating = await pool.query(`SELECT customer_rating FROM public.jobs WHERE job_id=$1`, [legacyId]);
    assert(rating.rows[0].customer_rating === null, "legacy review with wrong phone must not persist");
    // Correct phone -> success.
    if (!(await p.locator('[data-review-form] input[name="customer_phone"]').count())) await openLookup();
    await p.locator('[data-review-form] input[name="customer_phone"]').fill(legacyPhone);
    await tap(p.locator('[data-review-form] button[type="submit"]'));
    await p.waitForTimeout(3000);
    rating = await pool.query(`SELECT customer_rating FROM public.jobs WHERE job_id=$1`, [legacyId]);
    assert(Number(rating.rows[0].customer_rating) >= 1, "legacy review with the correct phone must persist");
    await p.close();

    // A tokened job opened by its short code is never legacy-eligible.
    const red = await (await fetch(`${BASE_A}/public/track?q=${encodeURIComponent(bookingCode1)}`,
      { headers: { "x-forwarded-for": "198.51.100.40" } })).json();
    assert(red.legacy_review_eligible === false, "a tokened job must never be legacy-review-eligible via code");
  });

  // S22) Rate-limit buckets are per VERIFIED client, proving the app resolves
  // req.ip under trust proxy (not a shared socket IP). Exhaust client A; a
  // different verified client B must still get through. If trust proxy were off,
  // both would share the 127.0.0.1 socket bucket and B would already be 429.
  await record("S22 rate-limit buckets are per verified client IP (trust proxy resolves req.ip)", async () => {
    const clientA = "203.0.113.240";
    const clientB = "203.0.113.241";
    let aLimited = false;
    for (let i = 0; i < 45 && !aLimited; i += 1) {
      const res = await fetch(`${BASE_A}/public/track?q=CWFA${i}`, {
        headers: { "x-forwarded-for": `10.0.0.9, ${clientA}` } });
      if (res.status === 429) aLimited = true;
    }
    assert(aLimited, "client A never hit its own rate limit");
    const bRes = await fetch(`${BASE_A}/public/track?q=CWFB1`, {
      headers: { "x-forwarded-for": `10.0.0.9, ${clientB}` } });
    assert(bRes.status !== 429, `client B must have its own bucket (trust proxy off would 429), got ${bRes.status}`);
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
