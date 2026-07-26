"use strict";

/*
 * Customer App booking readiness â€” Browser E2E against the REAL app + REAL PostgreSQL.
 *
 * What this does:
 *   1. Connects to a local/staging PostgreSQL (env E2E_PG_*), creates a fresh database.
 *   2. Loads test/e2e/schema-core.sql (only the legacy tables boot doesn't create).
 *   3. Boots TWO real `node index.js` instances on the same database:
 *        A (port 4620): booking lanes ENABLED  â€” scenarios 1-12
 *        B (port 4621): booking lanes DISABLED â€” scenario 13 (kill switch / LINE fallback)
 *   4. Seeds technicians (+ service matrix + monthly calendar), a partner tech,
 *      an admin user + session, via SQL.
 *   5. Drives the real Customer App UI with Playwright Chromium through the 13
 *      mandatory scenarios, asserting against the REAL database after each step.
 *
 * Run:  node test/e2e/run-booking-e2e.js
 * Env:  E2E_PG_HOST (127.0.0.1) E2E_PG_PORT (5433) E2E_PG_USER (postgres)
 *       E2E_PG_PASSWORD (postgres) E2E_KEEP_DB=1 to keep the database afterwards.
 *
 * NEVER run against production â€” it creates users/jobs and drops its own database.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool, Client } = require("pg");
const chromium = process.env.E2E_API_ONLY === "1" ? null : require("playwright").chromium;

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
    log(`  âœ… ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.message).split("\n")[0] });
    log(`  âŒ ${name}: ${String(error.message).split("\n")[0]}`);
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
// definitions straight from the application source and run them â€” the schema
// under test is exactly the schema the app declares.
function extractCreateTableStatements(src) {
  const out = [];
  const re = /CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)\s*\(/g;
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
  // IF NOT EXISTS self-heals â€” replay the same statements from source.
  for (const srcFile of ["index.js", path.join("server", "customerPricing.js")]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, srcFile), "utf8");
    const alters = src.match(/ALTER TABLE public\.[a-z_]+ ADD COLUMN IF NOT EXISTS [^`;)]+/g) || [];
    for (const alter of alters) {
      if (alter.includes("${")) continue;
      try { await db.query(alter); } catch (_) { /* table not in scope â€” fine */ }
    }
  }
  // Boot also creates the indexes several features rely on â€” notably the UNIQUE
  // index that backs `ON CONFLICT (job_id)` in /public/review. Replay every
  // `CREATE [UNIQUE] INDEX IF NOT EXISTS` the app declares so those code paths
  // behave exactly as they do in production.
  for (const srcFile of ["index.js", path.join("server", "customerPricing.js")]) {
    const src = fs.readFileSync(path.join(REPO_ROOT, srcFile), "utf8");
    const indexes = src.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^`;]+/g) || [];
    for (const idx of indexes) {
      if (idx.includes("${")) continue;
      try { await db.query(idx); } catch (_) { /* target table not in scope â€” fine */ }
    }
  }
  // Finally, replay the repo's additive migration files (idempotent) so
  // migration-managed columns (catalog marketplace, price-rule links, ...)
  // exist exactly as production got them.
  const migrationsDir = path.join(REPO_ROOT, "migrations");
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try { await db.query(sql); } catch (_) { /* non-booking migrations may not apply â€” fine */ }
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
// a third party â€” even if the runner's shell/.env holds production secrets.
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
  // Payments â€” must never reach Omise from a booking E2E
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
      ...(process.env.E2E_API_ONLY === "1"
        ? { NODE_OPTIONS: `--require=${path.join(__dirname, "local-postgres-preload.js")}` }
        : {}),
      ENABLE_CUSTOMER_SCHEDULED_BOOKING: "true",
      // Customer urgent must ignore this legacy ENV and use the persisted CMS switch.
      ENABLE_CUSTOMER_URGENT_BOOKING: "false",
      ...extraEnv,
    },
    stdio: ["ignore", out, out],
  });
  children.push(child);
  return child;
}

// Refuse to run against anything that looks like a real database unless the
// operator explicitly opts in â€” this harness CREATEs and DROPs its database.
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
    "users", "technician_profiles", "job_updates_v2",
  ];
  const r = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [required]
  );
  const present = new Set(r.rows.map((x) => x.table_name));
  const missing = required.filter((t) => !present.has(t));
  if (missing.length) throw new Error(`core booking schema incomplete â€” missing tables: ${missing.join(", ")}`);
}

async function waitForReady(base, { timeoutMs = 90000 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`app at ${base} not ready in ${timeoutMs}ms`);
    try {
      const res = await fetch(`${base}/public/pricing_preview`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_type: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ", ac_type: "à¸œà¸™à¸±à¸‡", btu: 12000, machine_count: 1, wash_variant: "à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²" }),
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
    [username, `à¸Šà¹ˆà¸²à¸‡ ${username}`, employment]
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

async function fillContactStep(page, { name = "à¸¥à¸¹à¸à¸„à¹‰à¸² à¸—à¸”à¸ªà¸­à¸š", phone = "0812345678", address = "99/1 à¸«à¸¡à¸¹à¹ˆà¸šà¹‰à¸²à¸™à¸—à¸”à¸ªà¸­à¸š à¸–à¸™à¸™à¸­à¹ˆà¸­à¸™à¸™à¸¸à×ÎtîÚ$z{-®éÜj×2"“°Ð¢òò6ÖR&WVW7B¶W’²4ÔR–ÆöBÂf—'7BöÖ—GFVBF†Vâf÷&vVB6Æ–VçEöÓàÐ¢òò&WÆ—2F†R4ÔR¦ö"†–FV×÷FVçBÂ–æFWVæFVçBöb6Æ–VçEö’âF†R&WÆÐ¢òò'Vç2&Vf÷&RF†Rf–Æ&–Æ—G’vFRÂ6ò—B7V66VVG2WfVâF†÷Vv‚F†R¦ö"æ÷pÐ¢òòö67W–W2F†B6Æ÷B(	BW†7FÇ’F†R6öÖÖ—GFVBÖ'WB×&W7öç6RÖÆ÷7B&WG'’66RàÐ¢6öç7B¶W’Ò7'—Fòç&æFöÔ'—FW2ƒb’çFõ7G&–ær‚&†W‚"“°Ð¢6öç7Bf—'7BÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#£3"Â²6Æ–VçEö¢VæFVf–æVBÂ66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Ò’“°Ð¢76W'B†f—'7Bç7FGW2ÓÓÒ#bbf—'7Bæ&öG“òæ¦ö%ö–BÂf—'7B6æöæ–6Â66†VGVÆVB&öö¶–ærf–ÆVC¢…EEG¶f—'7Bç7FGW7ÒG´¥4ôâç7G&–æv–g’†f—'7Bæ&öG’—Ö“°Ð¢6öç7B&WÆ’Òv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#£3"Â²6Æ–VçEö¢'F÷FÆÇ•öf÷&vVB"Â66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Ò’“°Ð¢76W'B‡&WÆ’ç7FGW2ÓÓÒ#bb&WÆ’æ&öG“òç&WÆ–VBÓÓÒG'VRÂ6ÖR×–ÆöB&WÆ’×W7B7V66VVBÂv÷BG·&WÆ’ç7FGW7ÒG´¥4ôâç7G&–æv–g’‡&WÆ’æ&öG’—Ö“°Ð¢76W'B‡&WÆ’æ&öG“òæ¦ö%ö–BÓÓÒf—'7Bæ&öG’æ¦ö%ö–BÂ'6ÖR&WVW7B¶W’²6ÖR–ÆöB×W7B&WÆ’F†R4ÔR¦ö""“°Ð¢6öç7BFWEFö¶VâÒ&WV—&R‚&æöFS¦7'—Fò"’æ7&VFT†6‚‚'6†#Sb"’çWFFR†66†VGVÆVE÷c¢G¶¶W—Ö’æF–vW7B‚&†W‚"’ç6Æ–6RƒÂ#B“°Ð¢6öç7BGW6÷VçBÒv—BööÂçVW'’†4TÄT5B4õTåB‚¢“£¦–çB2âe$ôÒV&Æ–2æ¦ö'2t„U$R&öö¶–æu÷Fö¶VãÒCÂ¶FWEFö¶VåÒ“°Ð¢76W'B†GW6÷VçBç&÷w5³ÒæâÓÓÒÂ&WVW7B¶W’×W7BÖFòW†7FÇ’öæR¦ö"Âv÷BG¶GW6÷VçBç&÷w5³ÒæçÖ“°Ð¢Ò“°Ð Ð¢òò3#2’–FV×÷FVæ7’¶W’—2&÷VæBFò—G2–ÆöBâ&WW6–ærF†R¶W’v—F‚Ð¢òòÖFW&–ÆÇ’F–ffW&VçB–ÆöB‡F–ÖRÂ†öæR’×W7B&R&V¦V7FVBv—F€Ð¢òòC’”DTÕõDTä5•ô´U•õ$UU4TB(	BæWfW"6–ÆVçB&WGW&âöbF†Rf—'7B¦ö"w2FFÀÐ¢òòæBæWfW"6V6öæB¦ö"àÐ¢v—B&V6÷&B‚%3#266†VGVÆVC¢&WW6–ær&WVW7B¶W’v—F‚F–ffW&VçB–ÆöB—2C’”DTÕõDTä5•ô´U•õ$UU4TB"Â7–æ2‚’Óâ°Ð¢6öç7B¶W’Ò7'—Fòç&æFöÔ'—FW2ƒb’çFõ7G&–ær‚&†W‚"“°Ð¢6öç7Bf—'7BÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"Ò’“°Ð¢76W'B†f—'7Bç7FGW2ÓÓÒ#bbf—'7Bæ&öG“òæ¦ö%ö–BÂ6VVB&öö¶–ærf–ÆVC¢…EEG¶f—'7Bç7FGW7ÒG´¥4ôâç7G&–æv–g’†f—'7Bæ&öG’—Ö“°Ð¢6öç7BFWEFö¶VâÒ&WV—&R‚&æöFS¦7'—Fò"’æ7&VFT†6‚‚'6†#Sb"’çWFFR†66†VGVÆVE÷c¢G¶¶W—Ö’æF–vW7B‚&†W‚"’ç6Æ–6RƒÂ#B“°Ð¢6öç7B&Vf÷&RÒv—BööÂçVW'’†4TÄT5B4õTåB‚¢“£¦–çB2âe$ôÒV&Æ–2æ¦ö'2t„U$R&öö¶–æu÷Fö¶VãÒCÂ¶FWEFö¶VåÒ“°Ð¢òòF–ffW&VçBö–çFÖVçBF–ÖRÂ6ÖR¶W’Óâ&V¦V7B†&Vf÷&Rç’f–Æ&–Æ—G’6†V6²’àÐ¢6öç7BF–feF–ÖRÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#C£3"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"Ò’“°Ð¢76W'B†F–feF–ÖRç7FGW2ÓÓÒC’bbF–feF–ÖRæ&öG“òæ6öFRÓÓÒ$”DTÕõDTä5•ô´U•õ$UU4TB"ÀÐ¢F–ffW&VçBF–ÖR×W7BC’”DTÕõDTä5•ô´U•õ$UU4TBÂv÷BG¶F–feF–ÖRç7FGW7ÒG´¥4ôâç7G&–æv–g’†F–feF–ÖRæ&öG’—Ö“°Ð¢76W'B‚F–feF–ÖRæ&öG“òæ¦ö%ö–BbbF–feF–ÖRæ&öG“òæ&öö¶–æuö6öFRÂ#C’×W7Bæ÷BÆV²F†Rf—'7B¦ö"w2–FVçF–f–W'2"“°Ð¢òòF–ffW&VçB†öæRÂ6ÖR¶W’²6ÖRF–ÖRÓâ&V¦V7BàÐ¢6öç7BF–fe†öæRÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒcccc"Ò’“°Ð¢76W'B†F–fe†öæRç7FGW2ÓÓÒC’bbF–fe†öæRæ&öG“òæ6öFRÓÓÒ$”DTÕõDTä5•ô´U•õ$UU4TB"ÀÐ¢F–ffW&VçB†öæR×W7BC’”DTÕõDTä5•ô´U•õ$UU4TBÂv÷BG¶F–fe†öæRç7FGW7Ö“°Ð¢òòF–ffW&VçB6W'f–6R6ö×÷6—F–öâ„%ERò2G—RòG’’BF†R4ÔRF–ÖRÓâ&V¦V7BÀÐ¢òòWfVâF†÷Vv‚F†R6ö×WFVBGW&F–öâ6÷VÆBÖF6‚âF†W6R&R6Vv‡B'’F†PÐ¢òò6æöæ–6Â¦ö%ö—FV×26–væGW&RÂæ÷B'’GW&F–öâàÐ¢6öç7BF–fd'GRÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"Â'GS¢ƒÒ’“°Ð¢76W'B†F–fd'GRç7FGW2ÓÓÒC’bbF–fd'GRæ&öG“òæ6öFRÓÓÒ$”DTÕõDTä5•ô´U•õ$UU4TB"ÀÐ¢F–ffW&VçB%ER×W7BC’”DTÕõDTä5•ô´U•õ$UU4TBÂv÷BG¶F–fd'GRç7FGW7ÒG´¥4ôâç7G&–æv–g’†F–fd'GRæ&öG’—Ö“°Ð¢6öç7BF–feG’Òv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"ÂÖ6†–æUö6÷VçC¢"Ò’“°Ð¢76W'B†F–feG’ç7FGW2ÓÓÒC’bbF–feG’æ&öG“òæ6öFRÓÓÒ$”DTÕõDTä5•ô´U•õ$UU4TB"ÀÐ¢F–ffW&VçBÖ6†–æUö6÷VçB×W7BC’”DTÕõDTä5•ô´U•õ$UU4TBÂv÷BG¶F–feG’ç7FGW7ÒG´¥4ôâç7G&–æv–g’†F–feG’æ&öG’—Ö“°Ð¢òòF–ffW&VçBÆ6R†FG&W72’Óâ&V¦V7BàÐ¢6öç7BF–fdFG"Òv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"ÂFG&W75÷FW‡C¢#“’ó“’‰~‹^˜ŽŠÞŠ.‹ž˜Ž˜>Š¾Š˜‚ˆ‰~Š"Ò’“°Ð¢76W'B†F–fdFG"ç7FGW2ÓÓÒC’bbF–fdFG"æ&öG“òæ6öFRÓÓÒ$”DTÕõDTä5•ô´U•õ$UU4TB"ÀÐ¢F–ffW&VçBFG&W72×W7BC’”DTÕõDTä5•ô´U•õ$UU4TBÂv÷BG¶F–fdFG"ç7FGW7Ö“°Ð¢òòæöæRöbF†RC—2ÆV¶VB–FVçF–f–W'2ÂæBæöæR7&VFVB¦ö"àÐ¢f÷"†6öç7B"öb¶F–feF–ÖRÂF–fe†öæRÂF–fd'GRÂF–feG’ÂF–fdFG%Ò’°Ð¢76W'B‚"æ&öG“òæ¦ö%ö–Bbb"æ&öG“òæ&öö¶–æuö6öFRbb"æ&öG“òçFö¶VâÂ#C’×W7Bæ÷BÆV²F†Rf—'7B¦ö"w2–FVçF–f–W'2"“°Ð¢ÐÐ¢òòF†RU„5B6ÖR6æöæ–6Â–ÆöB7F–ÆÂ&WÆ—2F†R6ÖR¦ö"àÐ¢6öç7BW†7BÒv—B”&öö²„$4UôÂ66†VGVÆVE–ÆöB‡#$F’Â#3£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒSSSS"Ò’“°Ð¢76W'B†W†7Bç7FGW2ÓÓÒ#bbW†7Bæ&öG“òç&WÆ–VBÓÓÒG'VRbbW†7Bæ&öG“òæ¦ö%ö–BÓÓÒf—'7Bæ&öG’æ¦ö%ö–BÀÐ¢W†7B6ÖR–ÆöB×W7B&WÆ’F†R6ÖR¦ö"Âv÷BG¶W†7Bç7FGW7ÒG´¥4ôâç7G&–æv–g’†W†7Bæ&öG’—Ö“°Ð¢6öç7BgFW"Òv—BööÂçVW'’†4TÄT5B4õTåB‚¢“£¦–çB2âe$ôÒV&Æ–2æ¦ö'2t„U$R&öö¶–æu÷Fö¶VãÒCÂ¶FWEFö¶VåÒ“°Ð¢76W'B†gFW"ç&÷w5³ÒæâÓÓÒ&Vf÷&Rç&÷w5³ÒæâbbgFW"ç&÷w5³ÒæâÓÓÒÂ&¶W’&WW6R×W7Bæ÷B7&VFRFF—F–öæÂ¦ö'2"“°Ð¢Ò“°Ð Ð¢òò3#B’6öÖÖ—GFVBÖ'WB×&W7öç6RÖÆ÷7B&WG'“¢F†Rf—'7B7V&Ö—B6öÖÖ—G2Â—G0Ð¢òò&W7öç6R—2F—66&FVBÂF†VâF†R4ÔR&WVW7B‡6ÖR¶W’²6ÖR–ÆöB’—0Ð¢òò&WÆ–VB(	BF†R6W'fW"&WGW&ç2F†RW†—7F–ær¦ö"æBF†RD"†öÆG2W†7FÇ’öæRàÐ¢v—B&V6÷&B‚%3#B6öÖÖ—GFVB×F†VâÖÆ÷7B&W7öç6S¢&WÆ––ærF†R6ÖR&WVW7B––VÆG2W†7FÇ’öæR¦ö""Â7–æ2‚’Óâ°Ð¢6öç7B¶W’Ò7'—Fòç&æFöÔ'—FW2ƒb’çFõ7G&–ær‚&†W‚"“°Ð¢6öç7B–ÆöBÒ66†VGVÆVE–ÆöB‡#$F’Â#c£"Â²66†VGVÆVE÷&WVW7Eö¶W“¢¶W’Â7W7FöÖW%÷†öæS¢#ƒssss"Ò“°Ð¢6öç7B6öÖÖ—GFVBÒv—B”&öö²„$4UôÂ–ÆöB“²òò6öÖÖ—C²&WFVæBF†R6Æ–VçBæWfW"6rF†—2&W7öç6PÐ¢76W'B†6öÖÖ—GFVBç7FGW2ÓÓÒ#bb6öÖÖ—GFVBæ&öG“òæ¦ö%ö–BÂ–æ—F–Â6öÖÖ—Bf–ÆVC¢…EEG¶6öÖÖ—GFVBç7FGW7ÒG´¥4ôâç7G&–æv–g’†6öÖÖ—GFVBæ&öG’—Ö“°Ð¢6öç7B&WG'’Òv—B”&öö²„$4UôÂ–ÆöB“²òò–FVçF–6Â&W7V&Ö—BgFW"'&VÆöB Ð¢76W'B‡&WG'’ç7FGW2ÓÓÒ#bb&WG'’æ&öG“òç&WÆ–VBÓÓÒG'VRÂ&WG'’×W7B&WÆ’Âv÷BG·&WG'’ç7FGW7ÒG´¥4ôâç7G&–æv–g’‡&WG'’æ&öG’—Ö“°Ð¢76W'B‡&WG'’æ&öG“òæ¦ö%ö–BÓÓÒ6öÖÖ—GFVBæ&öG’æ¦ö%ö–BÂ'&WG'’×W7B&W6öÇfRFòF†R6ÖR¦ö""“°Ð¢6öç7BFWEFö¶VâÒ&WV—&R‚&æöFS¦7'—Fò"’æ7&VFT†6‚‚'6†#Sb"’çWFFR†66†VGVÆVE÷c¢G¶¶W—Ö’æF–vW7B‚&†W‚"’ç6Æ–6RƒÂ#B“°Ð¢6öç7BâÒv—BööÂçVW'’†4TÄT5B4õTåB‚¢“£¦–çB2âe$ôÒV&Æ–2æ¦ö'2t„U$R&öö¶–æu÷Fö¶VãÒCÂ¶FWEFö¶VåÒ“°Ð¢76W'B†âç&÷w5³ÒæâÓÓÒÂW†7FÇ’öæR¦ö"×W7BW†—7BgFW"F†RÆ÷7B×&W7öç6R&WG'’Âv÷BG¶âç&÷w5³ÒæçÖ“°Ð¢Ò“°Ð Ð¢òò3#’W&vVçB&÷WF–ær—24äôä”4Â(	BWfW'’V&Æ–2W&vVçB&WVW7BvöW2F‡&÷Vv€Ð¢òòF†R7W7FöÖW"×6fRFFW"öâ&öö¶–æuöÖöFRÆöæRâf÷&vVBööÖ—GFVB6Æ–VçEö Ð¢òò‡v—F‚GF6¶W"Ö6†÷6VâFV6†æ–6–âö76–vâf–VÆG2’×W7B&R6æ—F—6VBÂæ÷@Ð¢òò&V6‚F†R&rW&vVçBVæv–æRÂæB×W7BFVGWRöâF†R&WVW7B¶W’àÐ¢v—B&V6÷&B‚%3#W&vVçC¢f÷&vVBööÖ—GFVB6Æ–VçEö—27F–ÆÂ6æ—F—6VBF‡&÷Vv‚F†R6fRFFW""Â7–æ2‚’Óâ°Ð¢6öç7BW&vVçD¶W’Ò7'—Fòç&æFöÔ'—FW2ƒb’çFõ7G&–ær‚&†W‚"“°Ð¢6öç7BGF6²Ò°Ð¢7W7FöÖW%öæÖS¢.‰N˜ŽŠ~‰ž‰¾Š^ŠÞŠ"Â7W7FöÖW%÷†öæS¢#ƒCCCCCCCB"ÀÐ¢¦ö%÷G—S¢.Š^˜ž‹.ˆr"Âö–çFÖVçEöFFWF–ÖS¢æWrFFR‚’çFô•4õ7G&–ær‚’ÀÐ¢FG&W75÷FW‡C¢#ƒ‚ó‚˜ˆ.‰^Š®Š~‰žŠ¾Š^Š~ˆrˆŠ>‹Žˆ~˜‰~‰îŠò"Â&öö¶–æuöÖöFS¢'W&vVçB"ÀÐ¢òòäò6Æ–VçEö(	BF†R6æ—F—6W"×W7B7F–ÆÂVævvRöâF†R6æöæ–6ÂÖöFRàÐ¢W&vVçE÷&WVW7Eö¶W“¢W&vVçD¶W’ÀÐ¢5÷G—S¢.‰Î‰ž‹ˆr"Â'GS¢#ÂÖ6†–æUö6÷VçC¢Âv6…÷f&–çC¢.Š^˜ž‹.ˆ~‰ŽŠ>Š>Š‰N‹""ÀÐ¢òòGF6¶W"Ö6†÷6Vâf–VÆG2F†BF†R7W7FöÖW"ÆÆ÷vÆ—7B×W7B7G&— Ð¢FV6†æ–6–å÷W6W&æÖS¢'FV6…÷'FæW""Â76–våöÖöFS¢&ÖçVÂ"ÀÐ¢F—7F6…öÖöFS¢&æ÷&ÖÂ"ÂFV6…÷G—S¢&6ö×ç’"ÂFVÕöÖVÖ&W'3¢²'FV6…÷'FæW#"%ÒÀÐ¢Ó°Ð¢6öç7B&W2Òv—B”&öö²„$4UôÂGF6²“°Ð¢76W'B‡&W2ç7FGW2ÓÓÒ#bb&W2æ&öG“òæ¦ö%ö–BÂW&vVçBv—F‚æò6Æ–VçEö×W7B7F–ÆÂ&öö²f–FFW"Âv÷BG·&W2ç7FGW7Ö“°Ð¢6öç7B¦ö$–BÒ&W2æ&öG’æ¦ö%ö–C°Ð¢6öç7B&÷rÒv—BööÂçVW'’€Ð¢4TÄT5B&öö¶–æuöÖöFRÂF—7F6…öÖöFRÂFV6†æ–6–å÷W6W&æÖRe$ôÒV&Æ–2æ¦ö'2t„U$R¦ö%ö–CÒCÂ¶¦ö$–EÒ“°Ð¢76W'B‡&÷rç&÷w5³Òæ&öö¶–æuöÖöFRÓÓÒ'W&vVçB"Â&×W7BW'6—7B2W&vVçB"“°Ð¢76W'B‡&÷rç&÷w5³ÒæF—7F6…öÖöFRÓÓÒ&öffW""Â&GF6¶W"F—7F6…öÖöFR×W7B&R÷fW'&–FFVâFòöffW""“°Ð¢76W'B‚&÷rç&÷w5³ÒçFV6†æ–6–å÷W6W&æÖRÂ&GF6¶W"×7WÆ–VBFV6†æ–6–â×W7B&R7G&—VB†öffW"Væv–æR76–vç2’"“°Ð¢6öç7BöffW'2Òv—BööÂçVW'’†4TÄT5BFV6†æ–6–å÷W6W&æÖRe$ôÒV&Æ–2æ¦ö%ööffW'2t„U$R¦ö%ö–CÒCÂ¶¦ö$–EÒ“°Ð¢76W'B†öffW'2ç&÷w2æWfW'’‚†ò’Óâ²'FV6…÷'FæW""Â'FV6…÷'FæW#"%Òæ–æ6ÇVFW2†òçFV6†æ–6–å÷W6W&æÖR’’ÀÐ¢&öffW'2×W7BF&vWB¦öæVB'FæW'2f–F†RVæv–æRÂæ÷BâGF6¶W"6†ö–6R"“°Ð¢òòFVGWöâF†R&WVW7B¶W“¢&WÆ––ærF†R6ÖRf÷&vVB&WVW7BÖ¶W2æò&æB¦ö"àÐ¢v—B”&öö²„$4UôÂGF6²“°Ð¢6öç7B6çBÒv—BööÂçVW'’€Ð¢4TÄT5B4õTåB‚¢“£¦–çB2âe$ôÒV&Æ–2æ¦ö'2t„U$R&öö¶–æuöÖöFSÒwW&vVçBräB7W7FöÖW%÷†öæSÒsƒCCCCCCCBv“°Ð¢76W'B†6çBç&÷w5³ÒæâÓÓÒÂW&vVçB&WVW7B¶W’×W7BFVGWRÂv÷BG¶6çBç&÷w5³ÒæçÒ¦ö'6“°Ð¢Ò“°Ð Ð¢òò3#’ÄTt5’7W7FöÖW"†¦ö"v—F‚æò&öö¶–æu÷Fö¶Vâ’×W7B&R&ÆRFò&Wf–WpÐ¢òòF‡&÷Vv‚F†R&VÂG&6¶–ærT“¢&öö¶–æuö6öFRÆöö·W6†÷w2†öæRÖVçG'Ð¢òòf÷&ÒÂw&öær†öæR—2&V¦V7FVBÂF†R&–v‡B†öæR7V66VVG2(	BæBFö¶VæV@Ð¢òò¦ö"÷VæVB'’6öFR×W7BäõBöffW"F†RÆVv7’f÷&Ò†æòF÷væw&FR’àÐ¢v—B&V6÷&B‚%3#ÆVv7’7W7FöÖW"&Wf–Ww2f–F†RG&6¶–ærT’‡†öæRf÷&Ò“²Fö¶VæVB¦ö"6†÷w2æòÆVv7’f÷&Ò"Â7–æ2‚’Óâ°Ð¢6öç7B7&RÒv—BööÂçVW'’€Ð¢4TÄT5B¦ö%ö–BÂ&öö¶–æuö6öFRe$ôÒV&Æ–2æ¦ö'0Ð¢t„U$R&öö¶–æu÷Fö¶Vâ•2äõBåTÄÂäB&öö¶–æuö6öFR•2äõBåTÄÂäB&öö¶–æuö6öFRÃâCÐ¢õ$DU"%’¦ö%ö–B42Ä”Ô•BÂ¶&öö¶–æt6öFSÒ“°Ð¢76W'B‡7&Rç&÷w2æÆVæwF‚Â&æò7&R¦ö"Fò6öçfW'BFòÆVv7’‡Fö¶VæÆW72’¦ö""“°Ð¢6öç7BÆVv7”–BÒ7&Rç&÷w5³Òæ¦ö%ö–C°Ð¢6öç7BÆVv7”6öFRÒ7&Rç&÷w5³Òæ&öö¶–æuö6öFS°Ð¢6öç7BÆVv7•†öæRÒ#ƒscSC3##°Ð¢v—BööÂçVW'’€Ð¢UDDRV&Æ–2æ¦ö'24UB&öö¶–æu÷Fö¶VãÔåTÄÂÂ¦ö%÷7FGW3Ò~˜Š®Š>˜~ˆŽ˜Š^˜žŠrrÂf–æ—6†VEöCÔäõr‚’ÀÐ¢FV6†æ–6–å÷W6W&æÖSÒwFV6…örÂ7W7FöÖW%÷†öæSÒC"Â7W7FöÖW%÷&F–æsÔåTÄÂÂ&Wf–WvVEöCÔåTÄÀÐ¢t„U$R¦ö%ö–CÒCÂ¶ÆVv7”–BÂÆVv7•†öæUÒ“°Ð¢v—BööÂçVW'’†DTÄUDRe$ôÒV&Æ–2çFV6†æ–6–å÷&Wf–Ww2t„U$R¦ö%ö–CÒCÂ¶ÆVv7”–EÒ“°Ð Ð¢6öç7BÒv—B7G‚ææWuvR‚“°Ð¢6öç7B÷VäÆöö·WÒ7–æ2‚’Óâ°Ð¢v—Bæv÷Fò†G´õU$ÅôÒ7G&6¶–ævÂ²v—EVçF–Ã¢&FöÖ6öçFVçFÆöFVB"Ò“°Ð¢v—BæÆö6F÷"‚"7G&6¶–ærÖ6öFR"’æf–ÆÂ†ÆVv7”6öFR“°Ð¢v—BF‡æÆö6F÷"‚u¶FFÖ7F–öãÒ'G&6²×&VB%Òr’“°Ð¢òòF†R&Wf–Wrf÷&ÒÆ—fW2–âF†R&gFW&6&R"F"æVÂ(	B7F—fFR—Bf—'7BàÐ¢v—Bçv—Df÷%6VÆV7F÷"‚u¶FF×G&6¶–ær×f–WsÒ&gFW&6&R%ÒrÂ²F–ÖV÷WC¢SÒ“°Ð¢v—BF‡æÆö6F÷"‚u¶FF×G&6¶–ær×f–WsÒ&gFW&6&R%Òr’æf—'7B‚’“°Ð¢v—Bçv—Df÷%6VÆV7F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ–çWE¶æÖSÒ&7W7FöÖW%÷†öæR%ÒrÂ²F–ÖV÷WC¢SÒ“°Ð¢Ó°Ð¢v—B÷VäÆöö·W‚“°Ð¢òòw&öær†öæRÓâ&V¦V7FVBÂæ÷F†–ærw&—GFVâàÐ¢v—BæÆö6F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ–çWE¶æÖSÒ&7W7FöÖW%÷†öæR%Òr’æf–ÆÂ‚#ƒ"“°Ð¢v—BF‡æÆö6F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ'WGFöå·G—SÒ'7V&Ö—B%Òr’“°Ð¢v—Bçv—Df÷%F–ÖV÷WBƒ#S“°Ð¢ÆWB&F–ærÒv—BööÂçVW'’†4TÄT5B7W7FöÖW%÷&F–ære$ôÒV&Æ–2æ¦ö'2t„U$R¦ö%ö–CÒCÂ¶ÆVv7”–EÒ“°Ð¢76W'B‡&F–ærç&÷w5³Òæ7W7FöÖW%÷&F–ærÓÓÒçVÆÂÂ&ÆVv7’&Wf–Wrv—F‚w&öær†öæR×W7Bæ÷BW'6—7B"“°Ð¢òò6÷'&V7B†öæRÓâ7V66W72àÐ¢–b‚†v—BæÆö6F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ–çWE¶æÖSÒ&7W7FöÖW%÷†öæR%Òr’æ6÷VçB‚’’’v—B÷VäÆöö·W‚“°Ð¢v—BæÆö6F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ–çWE¶æÖSÒ&7W7FöÖW%÷†öæR%Òr’æf–ÆÂ†ÆVv7•†öæR“°Ð¢v—BF‡æÆö6F÷"‚u¶FF×&Wf–WrÖf÷&ÕÒ'WGFöå·G—SÒ'7V&Ö—B%Òr’“°Ð¢v—Bçv—Df÷%F–ÖV÷WBƒ3“°Ð¢&F–ærÒv—BööÂçVW'’†4TÄT5B7W7FöÖW%÷&F–ære$ôÒV&Æ–2æ¦ö'2t„U$R¦ö%ö–CÒCÂ¶ÆVv7”–EÒ“°Ð¢76W'B„çVÖ&W"‡&F–ærç&÷w5³Òæ7W7FöÖW%÷&F–ær’ãÒÂ&ÆVv7’&Wf–Wrv—F‚F†R6÷'&V7B†öæR×W7BW'6—7B"“°Ð¢v—Bæ6Æ÷6R‚“°Ð Ð¢òòFö¶VæVB¦ö"÷VæVB'’—G26†÷'B6öFR—2æWfW"ÆVv7’ÖVÆ–v–&ÆRàÐ¢6öç7B&VBÒv—B†v—BfWF6‚†G´$4UôÒ÷V&Æ–2÷G&6³÷ÒG¶Væ6öFUU$”6ö×öæVçB†&öö¶–æt6öFS—ÖÀÐ¢²†VFW'3¢²'‚Öf÷'v&FVBÖf÷"#¢#“‚ãSããC"ÒÒ’’æ§6öâ‚“°Ð¢76W'B‡&VBæÆVv7•÷&Wf–WuöVÆ–v–&ÆRÓÓÒfÇ6RÂ&Fö¶VæVB¦ö"×W7BæWfW"&RÆVv7’×&Wf–WrÖVÆ–v–&ÆRf–6öFR"“°Ð¢Ò“°Ð Ð¢òò3#"’&FRÖÆ–Ö—B'V6¶WG2&RW"dU$”d”TB6Æ–VçBÂ&÷f–ærF†R&W6öÇfW0Ð¢òò&Wæ—VæFW"G'W7B&÷‡’†æ÷B6†&VB6ö6¶WB•’âW††W7B6Æ–VçB²Ð¢òòF–ffW&VçBfW&–f–VB6Æ–VçB"×W7B7F–ÆÂvWBF‡&÷Vv‚â–bG'W7B&÷‡’vW&RöfbÀÐ¢òò&÷F‚v÷VÆB6†&RF†R#rããã6ö6¶WB'V6¶WBæB"v÷VÆBÇ&VG’&RC#’àÐ¢v—B&V6÷&B‚%3#"&FRÖÆ–Ö—B'V6¶WG2&RW"fW&–f–VB6Æ–VçB•‡G'W7B&÷‡’&W6öÇfW2&Wæ—’"Â7–æ2‚’Óâ°Ð¢6öç7B6Æ–VçDÒ##2ãã2ã#C#°Ð¢6öç7B6Æ–VçD"Ò##2ãã2ã#C#°Ð¢ÆWBÆ–Ö—FVBÒfÇ6S°Ð¢f÷"†ÆWB’Ò²’ÂCRbbÆ–Ö—FVC²’³Ò’°Ð¢6öç7B&W2Òv—BfWF6‚†G´$4UôÒ÷V&Æ–2÷G&6³÷Ô5tdG¶—ÖÂ°Ð¢†VFW'3¢²'‚Öf÷'v&FVBÖf÷"#¢ããã’ÂG¶6Æ–VçDÖÒÒ“°Ð¢–b‡&W2ç7FGW2ÓÓÒC#’’Æ–Ö—FVBÒG'VS°Ð¢ÐÐ¢76W'B†Æ–Ö—FVBÂ&6Æ–VçBæWfW"†—B—G2÷vâ&FRÆ–Ö—B"“°Ð¢6öç7B%&W2Òv—BfWF6‚†G´$4UôÒ÷V&Æ–2÷G&6³÷Ô5td#Â°Ð¢†VFW'3¢²'‚Öf÷'v&FVBÖf÷"#¢ããã’ÂG¶6Æ–VçD'ÖÒÒ“°Ð¢76W'B†%&W2ç7FGW2ÓÒC#’Â6Æ–VçB"×W7B†fR—G2÷vâ'V6¶WB‡G'W7B&÷‡’öfbv÷VÆBC#’’Âv÷BG¶%&W2ç7FGW7Ö“°Ð¢Ò“°Ð Ð¢v—B'&÷w6W"æ6Æ÷6R‚“°Ð§ÐÐ Ð¢òòÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒ'VâÒÒÒÐÐ Ð¦Ö–â‚Ð¢æ6F6‚‚†W'&÷"’Óâ°Ð¢Æör†dDÃ¢G¶W'&÷"ç7F6²ÇÂW'&÷"æÖW76vWÖ“°Ð¢&W7VÇG2çW6‚‡²æÖS¢&†&æW72"Âö³¢fÇ6RÂW'&÷#¢W'&÷"æÖW76vRÒ“°Ð¢ÒÐ¢æf–æÆÇ’†7–æ2‚’Óâ°Ð¢f÷"†6öç7B6†–ÆBöb6†–ÆG&Vâ’²G'’²6†–ÆBæ¶–ÆÂ‚%4”t´”ÄÂ"“²Ò6F6‚…ò’·ÒÐÐ¢G'’²–b‡ööÂ’v—BööÂæVæB‚“²Ò6F6‚…ò’·ÐÐ¢G'’²v—BG&÷FF&6R‚“²Ò6F6‚…ò’·ÐÐ¢6öç7B72Ò&W7VÇG2æf–ÇFW"‚‡"’Óâ"æö²’æÆVæwFƒ°Ð¢6öç7Bf–ÂÒ&W7VÇG2æÆVæwF‚Ò73°Ð¢Æör‚%ÆãÓÓÓÓÒS$R5TÔÔ%’ÓÓÓÓÒ"“°Ð¢f÷"†6öç7B"öb&W7VÇG2’Æör†G·"æö²ò%52"¢$d”Â'ÒG·"ææÖWÒG·"æö²ò""¢(	BG·"æW'&÷'ÖÖ“°Ð¢Æör†F÷FÃÒG·&W7VÇG2æÆVæwF‡Ò73ÒG·77Òf–ÃÒG¶f–ÇÖ“°Ð¢&ö6W72æW†—D6öFRÒf–ÂÓÓÒò¢°Ð¢Ò“°Ð 