"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const { createBookingApprovalService } = require("../server/services/booking/bookingApprovalService");
const availabilityEngine = require("../server/services/booking/availabilityEngine");
const pricingHelpers = require("../server/pricing");
const { parseCanonicalServiceItem } = require("../server/services/booking/bookingJobUnits");
const {
  JOB_STATUS,
  ASSIGNMENT_STATUS,
  OFFER_STATUS,
  pendingCustomerScheduledReservationSql,
} = require("../server/services/booking/bookingStatuses");
const { loadCustomerScheduledLoadMap } = require("../server/services/public/customerScheduledAssignment");
const { registerPublicCustomerBookingRoutes } = require("../server/routes/public/customerBookings");
const { registerAdminBookingRoutes } = require("../server/routes/admin/adminBookings");
const urgentPublicAdapterBase = require("../server/services/urgentPublicAdapter");

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

test("booking mutation ownership is extracted and route adapters stay SQL-free", () => {
  const index = read("index.js");
  const service = read("server/services/booking/createBookingJob.js");
  const publicRoutes = read("server/routes/public/customerBookings.js");
  const adminRoutes = read("server/routes/admin/adminBookings.js");

  assert.match(index, /createBookingJobService\(\{/);
  assert.match(index, /registerPublicCustomerBookingRoutes\(app/);
  assert.match(index, /registerAdminBookingRoutes\(app/);
  assert.doesNotMatch(index, /function handleAdminBookV2|function handlePublicCustomerUrgentBook|app\.post\("\/public\/book"/);
  assert.match(service, /async function handleAdminBookV2/);
  assert.match(service, /async function handlePublicBook/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /INSERT INTO public\.jobs/);
  for (const routeSource of [publicRoutes, adminRoutes]) {
    assert.doesNotMatch(routeSource, /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  }
});

test("booking status compatibility values remain byte-identical", () => {
  assert.deepEqual(JOB_STATUS, {
    ADMIN_SCHEDULED_PENDING: "รอดำเนินการ",
    ADMIN_URGENT_WAITING: "รอช่างยืนยัน",
    CUSTOMER_SCHEDULED_REVIEW: "รอตรวจสอบ",
    URGENT_NO_TECHNICIAN: "ไม่พบช่างรับงาน",
  });
  assert.equal(ASSIGNMENT_STATUS.IN_PROGRESS, "in_progress");
  assert.equal(OFFER_STATUS.PENDING, "pending");
});

test("public/admin/internal routes and urgent alias preserve registration and normalization", async () => {
  const registrations = [];
  const app = {
    post(route, ...handlers) { registrations.push({ route, handlers }); },
  };
  const calls = [];
  const service = {
    async handlePublicBook(req, res) { calls.push(["public", req.body]); return res.json({ ok: true }); },
    async handleAdminBookV2(req, res) { calls.push(["admin", req.body]); return res.json({ ok: true }); },
    async handleInternalBookFromAi(req, res) { calls.push(["internal", req.body]); return res.json({ ok: true }); },
  };
  const requireAdminSoft = () => {};
  const requireInternalApiKeyOnly = () => {};
  registerPublicCustomerBookingRoutes(app, { service });
  registerAdminBookingRoutes(app, { service, requireAdminSoft, requireInternalApiKeyOnly });

  assert.deepEqual(registrations.map((row) => row.route), [
    "/public/book",
    "/admin/book_v2",
    "/admin/urgent_broadcast_v2",
    "/internal/book_from_ai",
  ]);
  assert.equal(registrations[1].handlers[0], requireAdminSoft);
  assert.equal(registrations[2].handlers[0], requireAdminSoft);
  assert.equal(registrations[3].handlers[0], requireInternalApiKeyOnly);

  const res = responseHarness();
  await registrations[2].handlers.at(-1)({ body: { customer_name: "Alias" } }, res);
  assert.equal(calls.at(-1)[0], "admin");
  assert.equal(calls.at(-1)[1].booking_mode, "urgent");
  assert.equal(calls.at(-1)[1].dispatch_mode, "offer");

  await registrations[3].handlers.at(-1)({ body: { customer_name: "AI" } }, res);
  assert.equal(calls.at(-1)[0], "internal");
});

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = Number(code); return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

function publicScheduledBody(overrides = {}) {
  return {
    customer_name: "ลูกค้าทดสอบ",
    customer_phone: "0812345678",
    job_type: "ล้างแอร์",
    appointment_datetime: "2026-08-01T09:00:00+07:00",
    address_text: "กรุงเทพฯ",
    customer_note: "",
    maps_url: "",
    job_zone: "",
    items: [],
    booking_mode: "scheduled",
    client_app: "customer_app_v2",
    allow_time_proposal: false,
    ac_type: "ผนัง",
    btu: 12000,
    machine_count: 1,
    wash_variant: "ล้างธรรมดา",
    repair_variant: "",
    scheduled_request_key: "scheduled-pr2-key-0001",
    ...overrides,
  };
}

function publicUrgentBody(overrides = {}) {
  return {
    customer_name: "ลูกค้าด่วน",
    customer_phone: "0899999999",
    job_type: "ล้างแอร์",
    address_text: "กรุงเทพฯ",
    maps_url: "",
    job_zone: "",
    customer_note: "",
    booking_mode: "urgent",
    ac_type: "ผนัง",
    btu: 12000,
    machine_count: 1,
    wash_variant: "ล้างธรรมดา",
    urgent_request_key: "urgent-pr2-key-000001",
    ...overrides,
  };
}

async function invoke(handler, body, reqPatch = {}) {
  const req = { body: { ...body }, ...reqPatch };
  const res = responseHarness();
  await handler(req, res);
  return res;
}

const PG_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "cwf_test",
};

let pool;
let dbUnavailableReason = "";

test.before(async () => {
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(String(PG_CONFIG.host).toLowerCase());
  const isolatedName = /(?:test|pr2)/i.test(String(PG_CONFIG.database));
  if (!localHost || !isolatedName) {
    dbUnavailableReason = `refusing non-isolated PostgreSQL target ${PG_CONFIG.host}/${PG_CONFIG.database}`;
    return;
  }
  pool = new Pool(PG_CONFIG);
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbUnavailableReason = error.message || "PostgreSQL test database unavailable";
    await pool.end().catch(() => {});
    pool = null;
    return;
  }

  await pool.query(`
    DROP TABLE IF EXISTS public.technician_monthly_work_calendar, public.technician_service_matrix,
      public.job_updates_v2, public.job_units, public.job_promotions, public.job_offers, public.job_assignments,
      public.job_team_members, public.job_items, public.catalog_items,
      public.technician_profiles, public.users, public.jobs CASCADE
  `);
  await pool.query(`
    CREATE TABLE public.jobs (
      job_id BIGSERIAL PRIMARY KEY,
      customer_name TEXT,
      customer_phone TEXT,
      job_type TEXT,
      appointment_datetime TIMESTAMPTZ,
      job_price NUMERIC,
      address_text TEXT,
      technician_team TEXT,
      technician_username TEXT,
      job_status TEXT,
      booking_token TEXT UNIQUE,
      job_source TEXT,
      dispatch_mode TEXT,
      customer_note TEXT,
      maps_url TEXT,
      job_zone TEXT,
      duration_min INT,
      booking_mode TEXT,
      admin_override_duration_min INT,
      gps_latitude NUMERIC,
      gps_longitude NUMERIC,
      service_zone_code TEXT,
      service_zone_source TEXT,
      allow_time_proposal BOOLEAN,
      per_unit_evidence_enabled BOOLEAN DEFAULT FALSE,
      canceled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      booking_code TEXT
      ,approved_by_admin TEXT
      ,approved_at TIMESTAMPTZ
      ,cancel_reason TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE public.job_items (
      job_item_id BIGSERIAL PRIMARY KEY,
      job_id BIGINT,
      item_id BIGINT,
      item_name TEXT,
      qty NUMERIC,
      unit_price NUMERIC,
      line_total NUMERIC,
      assigned_technician_username TEXT,
      is_service BOOLEAN,
      customer_price_rule_id BIGINT,
      normal_unit_price NUMERIC,
      customer_price_label TEXT,
      customer_campaign_name TEXT,
      customer_price_source TEXT
    )
  `);
  await pool.query(`CREATE TABLE public.job_team_members (job_id BIGINT, username TEXT, is_primary BOOLEAN, UNIQUE(job_id, username))`);
  await pool.query(`CREATE TABLE public.job_assignments (job_id BIGINT, technician_username TEXT, status TEXT, UNIQUE(job_id, technician_username))`);
  await pool.query(`CREATE TABLE public.job_offers (offer_id BIGSERIAL PRIMARY KEY, job_id BIGINT, technician_username TEXT, status TEXT, expires_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE public.job_promotions (job_id BIGINT PRIMARY KEY, promo_id BIGINT, applied_discount NUMERIC)`);
  await pool.query(`
    CREATE TABLE public.job_units (
      unit_id BIGSERIAL PRIMARY KEY,
      job_id BIGINT,
      unit_code TEXT,
      unit_no INT,
      item_name TEXT,
      ac_type TEXT,
      wash_type TEXT,
      btu TEXT,
      location_label TEXT,
      assigned_technician TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, unit_code),
      UNIQUE(job_id, unit_no)
    )
  `);
  await pool.query(`CREATE TABLE public.job_updates_v2 (update_id BIGSERIAL PRIMARY KEY, job_id BIGINT, action TEXT, payload_json JSONB)`);
  await pool.query(`CREATE TABLE public.catalog_items (item_id BIGSERIAL PRIMARY KEY, item_name TEXT, base_price NUMERIC, is_active BOOLEAN, is_customer_visible BOOLEAN)`);
  await pool.query(`CREATE TABLE public.users (username TEXT PRIMARY KEY, role TEXT)`);
  await pool.query(`
    CREATE TABLE public.technician_profiles (
      username TEXT PRIMARY KEY,
      weekly_off_days TEXT,
      accept_status TEXT,
      accept_status_expires_at TIMESTAMPTZ,
      employment_type TEXT,
      home_service_zone_code TEXT,
      secondary_service_zone_code TEXT,
      allow_out_of_zone BOOLEAN
      ,customer_slot_visible BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query(`CREATE TABLE public.technician_service_matrix (username TEXT PRIMARY KEY, matrix_json JSONB)`);
  await pool.query(`
    CREATE TABLE public.technician_monthly_work_calendar (
      technician_username TEXT,
      work_date DATE,
      day_status TEXT,
      can_accept_advance_job BOOLEAN,
      start_time TEXT,
      end_time TEXT,
      max_jobs_per_day INT,
      max_units_per_day INT,
      source TEXT,
      PRIMARY KEY (technician_username, work_date)
    )
  `);
});

test.after(async () => {
  if (!pool) return;
  await pool.query(`
    DROP TABLE IF EXISTS public.technician_monthly_work_calendar, public.technician_service_matrix,
      public.job_updates_v2, public.job_units, public.job_promotions, public.job_offers, public.job_assignments,
      public.job_team_members, public.job_items, public.catalog_items,
      public.technician_profiles, public.users, public.jobs CASCADE
  `);
  await pool.end();
});

test.beforeEach(async () => {
  if (!pool) return;
  await pool.query(`TRUNCATE public.technician_monthly_work_calendar, public.technician_service_matrix,
    public.job_updates_v2, public.job_units, public.job_promotions, public.job_offers, public.job_assignments,
    public.job_team_members, public.job_items, public.catalog_items,
    public.technician_profiles, public.users, public.jobs RESTART IDENTITY CASCADE`);
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (dbUnavailableReason) return t.skip(`PostgreSQL integration database unavailable: ${dbUnavailableReason}`);
    return fn(t);
  });
}

function makeDependencies(overrides = {}) {
  let bookingCodeSequence = 0;
  const urgentPublicAdapter = {
    ...urgentPublicAdapterBase,
    computeCustomerUrgentAppointmentIso: () => "2026-08-01T09:00:00+07:00",
  };
  return {
    pool,
    urgentPublicAdapter,
    normalizeAppointmentDatetime: (value) => String(value),
    genToken: () => "random-token",
    detectServiceZoneFromText: async () => ({}),
    computeDurationMinMulti: () => 60,
    customerPricingHelpers: {
      resolveCustomerPricingMulti: async () => ({ active_price: 800, standard_price: 800 }),
      buildCustomerServiceLineItemsFromPayload: async (payload) => pricingHelpers
        .buildServiceLineItemsFromPayload(payload)
        .map((item) => ({ ...item, customer_price_source: "standard" })),
    },
    coordFieldProvided: (value) => value !== undefined && value !== null && String(value).trim() !== "",
    strictLatLngPairOrNull: () => null,
    parseLatLngFromText: () => null,
    resolveMapsUrlToLatLng: async () => null,
    expireTechnicianAcceptStatuses: async () => {},
    calcPricing: (items) => {
      const subtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
      return { subtotal, discount: 0, total: subtotal };
    },
    rankTechniciansForServiceZone: (rows) => rows,
    buildOffMapForDate: async () => new Map(),
    isTechOffOnDate: () => false,
    checkTechCollision: async () => null,
    technicianMatchesServiceZone: async () => ({ matches: true }),
    http409Conflict: (res, conflict) => res.status(409).json({ error: "ชนคิว", conflict }),
    generateUniqueBookingCode: async () => `CWF-PR2-${++bookingCodeSequence}`,
    effectiveBlockMin: (duration) => Number(duration) + 30,
    isTechFree: async () => true,
    getJwtSecret: () => "",
    parseCookieValue: () => "",
    jwtVerify: () => null,
    toMin: (value) => {
      const [hour, minute] = String(value).split(":").map(Number);
      return hour * 60 + minute;
    },
    getNowBangkokParts: () => ({ ymd: "2026-07-01", hh: 8, mm: 0 }),
    jobTiming: {
      minimumStartForDate: () => ({ is_today: false, server_now: "2026-07-01T08:00:00+07:00", timezone: "Asia/Bangkok", minimum_start: "09:00" }),
    },
    customerAvailability: {
      hasAvailableStart: async () => true,
      reservePublicCustomerTechnician: async () => ({ username: "tech-a" }),
    },
    publicCustomerAvailabilityDeps: () => ({}),
    findBestCustomerPromotion: async () => ({ promo: null, discount: 0 }),
    isServiceZoneFilterEnabled: () => false,
    isCustomerUrgentBookingEnabled: () => true,
    isCustomerScheduledBookingEnabled: () => true,
    isUrgentFlowEnabled: () => true,
    lineContactUrl: "https://lin.ee/test",
    travelBufferMin: 30,
    getInvalidJobSiteCoordinatesMessage: () => "พิกัดหน้างานไม่ถูกต้อง",
    refreshTechnicianIncomePreviewForJob: async () => ({}),
    notifyUrgentOffer: async () => {},
    notifyDirectJobAssigned: async () => {},
    ...overrides,
  };
}

async function seedTechnicians() {
  await pool.query(`INSERT INTO public.users (username, role) VALUES ('tech-a','technician'),('tech-b','technician')`);
  await pool.query(`
    INSERT INTO public.technician_profiles
      (username, weekly_off_days, accept_status, accept_status_expires_at, employment_type, allow_out_of_zone, customer_slot_visible)
    VALUES
      ('tech-a','','ready',NOW() + INTERVAL '1 day','partner',FALSE,TRUE),
      ('tech-b','','ready',NOW() + INTERVAL '1 day','company',FALSE,TRUE)
  `);
}

function toMinute(value) {
  const [hour, minute] = String(value || "").slice(0, 5).split(":").map(Number);
  return (hour * 60) + minute;
}

function collisionFreeIntervals(blocks, windowStart, windowEnd, durationMin) {
  const sorted = (blocks || []).slice().sort((a, b) => a.start_min - b.start_min);
  const intervals = [];
  let cursor = windowStart;
  for (const block of sorted) {
    const latestStart = Number(block.start_min) - durationMin;
    if (latestStart >= cursor) intervals.push({ startMin: cursor, endMin: latestStart });
    cursor = Math.max(cursor, Number(block.end_min));
  }
  if (cursor + durationMin <= windowEnd) intervals.push({ startMin: cursor, endMin: windowEnd - durationMin });
  return intervals;
}

function realAvailabilityDependencies(db) {
  return {
    pool: db,
    db,
    listTechniciansByType: async (type) => {
      const result = await db.query(
        `SELECT username, employment_type, customer_slot_visible
           FROM public.technician_profiles
          WHERE ($1='all' OR employment_type=$1)
          ORDER BY username`,
        [String(type || "all")]
      );
      return result.rows;
    },
    listBusyBlocksForTechOnDate: async (username, date, ignoreJobId) => {
      const result = await db.query(
        `SELECT
           (EXTRACT(HOUR FROM appointment_datetime AT TIME ZONE 'Asia/Bangkok')::int * 60
             + EXTRACT(MINUTE FROM appointment_datetime AT TIME ZONE 'Asia/Bangkok')::int) AS start_min,
           (EXTRACT(HOUR FROM appointment_datetime AT TIME ZONE 'Asia/Bangkok')::int * 60
             + EXTRACT(MINUTE FROM appointment_datetime AT TIME ZONE 'Asia/Bangkok')::int
             + COALESCE(duration_min,60)::int) AS end_min
           FROM public.jobs
          WHERE technician_username=$1
            AND (appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date=$2::date
            AND ($3::bigint IS NULL OR job_id <> $3::bigint)
            AND COALESCE(job_status,'') <> 'ยกเลิก'`,
        [username, date, ignoreJobId || null]
      );
      return result.rows.map((row) => ({ start_min: Number(row.start_min), end_min: Number(row.end_min) }));
    },
    buildStartIntervalsByCollision: collisionFreeIntervals,
    toMin: toMinute,
    minToHHMM: (minute) => `${String(Math.floor(Number(minute) / 60)).padStart(2, "0")}:${String(Number(minute) % 60).padStart(2, "0")}`,
    getNowBangkokParts: () => ({ ymd: "2026-07-01", hour: 8, minute: 0 }),
  };
}

async function seedRealAvailability() {
  await seedTechnicians();
  const matrix = {
    job_types: { wash: true, repair: true, install: true },
    ac_types: { wall: true, fourway: true, hanging: true, ceiling: true },
    wash_wall_variants: { normal: true, premium: true, coil: true, overhaul: true },
    repair_variants: { inspection: true, leak_check: true, parts: true, general: true },
  };
  await pool.query(
    `INSERT INTO public.technician_service_matrix (username, matrix_json)
     VALUES ('tech-a',$1::jsonb),('tech-b',$1::jsonb)`,
    [JSON.stringify(matrix)]
  );
  await pool.query(
    `INSERT INTO public.technician_monthly_work_calendar
       (technician_username, work_date, day_status, can_accept_advance_job, start_time, end_time, max_jobs_per_day, max_units_per_day, source)
     VALUES
       ('tech-a','2026-08-01','working',TRUE,'09:00','18:00',5,10,'test'),
       ('tech-b','2026-08-01','working',TRUE,'09:00','18:00',5,10,'test')`
  );
}

dbTest("real PostgreSQL: public scheduled success preserves response, status, items, pricing, and assignment reservation", async () => {
  const sideEffects = [];
  const service = createBookingJobService(makeDependencies({
    refreshTechnicianIncomePreviewForJob: async (...args) => { sideEffects.push(["income", args]); return {}; },
    notifyUrgentOffer: async (...args) => { sideEffects.push(["urgent", args]); },
    notifyDirectJobAssigned: async (...args) => { sideEffects.push(["direct", args]); },
  }));
  const result = await invoke(service.handlePublicBook, publicScheduledBody());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.body), [
    "success", "job_id", "booking_code", "token", "booking_mode", "dispatch_mode",
    "offers_count", "urgent_offer_enabled", "duration_min", "effective_block_min",
    "travel_buffer_min", "applied_promo", "base_total",
  ]);
  assert.equal(result.body.booking_mode, "scheduled");
  assert.equal(result.body.base_total, 600);
  assert.equal(Object.hasOwn(result.body, "technician_username"), false);
  assert.equal(Object.hasOwn(result.body, "technician"), false);

  const job = (await pool.query(`SELECT * FROM public.jobs`)).rows[0];
  const items = (await pool.query(`SELECT item_name, qty::int, line_total::int FROM public.job_items ORDER BY item_name`)).rows;
  assert.equal(job.job_status, JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW);
  assert.equal(job.technician_username, "tech-a");
  assert.equal(Number(job.job_price), 600);
  assert.deepEqual(items, [{ item_name: "ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 1 เครื่อง", qty: 1, line_total: 600 }]);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_team_members`)).rows[0].count), 0);
  assert.deepEqual(sideEffects, []);
  const capacity = await loadCustomerScheduledLoadMap(pool, "2026-08-01", ["tech-a"]);
  assert.equal(capacity.get("tech-a").jobs_count, 1);
  const collisionOccupancy = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.jobs j
      WHERE j.technician_username=$1
        AND j.appointment_datetime >= $2::timestamptz
        AND j.appointment_datetime < $3::timestamptz
        AND COALESCE(j.job_status,'') <> 'ยกเลิก'`,
    ["tech-a", "2026-08-01T00:00:00+07:00", "2026-08-02T00:00:00+07:00"]
  );
  assert.equal(collisionOccupancy.rows[0].count, 1);
  const reviewQueue = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.jobs
      WHERE job_source='customer' AND booking_mode='scheduled' AND job_status=$1 AND canceled_at IS NULL`,
    [JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW]
  );
  assert.equal(reviewQueue.rows[0].count, 1);
});

test("canonical booking criteria preserve wash/repair variants, BTU, and line quantity without inference defaults", () => {
  assert.deepEqual(parseCanonicalServiceItem({
    item_name: "ล้างแอร์ผนัง • ล้างพรีเมียม • 18000 BTU • 2 เครื่อง",
    qty: 2,
  }), {
    job_type: "ล้าง",
    ac_type: "ผนัง",
    wash_variant: "ล้างพรีเมียม",
    repair_variant: "",
    btu: 18000,
    machine_count: 2,
  });
  assert.deepEqual(parseCanonicalServiceItem({
    item_name: "ซ่อมแอร์ผนัง • ตรวจเช็ครั่ว • 12000 BTU • 1 เครื่อง",
    qty: 1,
  }), {
    job_type: "ซ่อม",
    ac_type: "ผนัง",
    wash_variant: "",
    repair_variant: "ตรวจเช็ครั่ว",
    btu: 12000,
    machine_count: 1,
  });
});

dbTest("real PostgreSQL: scheduled retry replays the same job without duplicate items", async () => {
  const service = createBookingJobService(makeDependencies());
  const body = publicScheduledBody();
  const first = await invoke(service.handlePublicBook, body);
  const replay = await invoke(service.handlePublicBook, body);
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.job_id, first.body.job_id);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 1);
});

dbTest("real PostgreSQL: scheduled rollback leaves no partial job or items", async () => {
  const service = createBookingJobService(makeDependencies({
    ensureBookingJobUnits: async () => { throw new Error("fixture assignment failure"); },
  }));
  const result = await invoke(service.handlePublicBook, publicScheduledBody({ scheduled_request_key: "scheduled-pr2-key-rollback" }));
  assert.equal(result.statusCode, 500);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 0);
});

dbTest("real PostgreSQL: public urgent waits for admin with zero offers, assignments, income, or notification", async () => {
  await seedTechnicians();
  const notifications = [];
  const income = [];
  const service = createBookingJobService(makeDependencies({
    notifyUrgentOffer: async (payload) => { notifications.push(payload); },
    refreshTechnicianIncomePreviewForJob: async (...args) => { income.push(args); return {}; },
  }));
  const body = publicUrgentBody();
  const first = await invoke(service.handlePublicBook, body);
  const replay = await invoke(service.handlePublicBook, body);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.booking_mode, "urgent");
  assert.equal(first.body.dispatch_mode, "offer");
  assert.equal(first.body.offers_count, 0);
  assert.equal(first.body.urgent_offer_enabled, false);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.booking_code, first.body.booking_code);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_offers`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_team_members`)).rows[0].count), 0);
  const urgentJob = (await pool.query(`SELECT job_status, technician_username FROM public.jobs`)).rows[0];
  assert.equal(urgentJob.job_status, JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW);
  assert.equal(urgentJob.technician_username, null);
  assert.equal(notifications.length, 0);
  assert.equal(income.length, 0);
});

dbTest("real PostgreSQL: urgent retry keeps the first server appointment authoritative and rejects material payload reuse", async () => {
  const appointments = ["2026-08-01T09:00:00+07:00", "2026-08-01T09:30:00+07:00", "2026-08-01T10:00:00+07:00"];
  let appointmentIndex = 0;
  const adapter = {
    ...urgentPublicAdapterBase,
    computeCustomerUrgentAppointmentIso: () => appointments[Math.min(appointmentIndex++, appointments.length - 1)],
  };
  const service = createBookingJobService(makeDependencies({ urgentPublicAdapter: adapter }));
  const body = publicUrgentBody({ urgent_request_key: "urgent-pr3-clock-replay-0001" });
  const first = await invoke(service.handlePublicBook, body);
  const replay = await invoke(service.handlePublicBook, body);
  assert.equal(first.statusCode, 200);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.job_id, first.body.job_id);
  const stored = (await pool.query(`SELECT appointment_datetime FROM public.jobs WHERE job_id=$1`, [first.body.job_id])).rows[0];
  assert.equal(new Date(stored.appointment_datetime).getTime(), new Date(appointments[0]).getTime());
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);

  const changed = await invoke(service.handlePublicBook, { ...body, customer_note: "materially changed" });
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);
});

dbTest("real PostgreSQL: strict urgent cleaning classifier rejects tampering before pricing and DB mutation", async () => {
  let pricingCalls = 0;
  const baseDependencies = makeDependencies();
  const service = createBookingJobService(makeDependencies({
    customerPricingHelpers: {
      ...baseDependencies.customerPricingHelpers,
      resolveCustomerPricingMulti: async () => {
        pricingCalls += 1;
        throw new Error("pricing must not run for rejected urgent payload");
      },
    },
  }));
  const cleanLine = { job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, machine_count: 1, wash_variant: "ล้างธรรมดา" };
  const cases = [
    { name: "top-level repair with cleaning services", patch: { job_type: "ซ่อม", services: [cleanLine] } },
    { name: "Thai mixed cleaning and repair", patch: { job_type: "ล้างและซ่อม" } },
    { name: "English mixed cleaning and repair", patch: { job_type: "clean and repair" } },
    { name: "one non-cleaning service line", patch: { job_type: "ล้าง", services: [cleanLine, { ...cleanLine, job_type: "ซ่อม" }] } },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const entry = cases[index];
    const result = await invoke(service.handlePublicBook, publicUrgentBody({
      urgent_request_key: `urgent-pr3-tamper-${String(index + 1).padStart(4, "0")}`,
      ...entry.patch,
    }));
    assert.equal(result.statusCode, 400, entry.name);
    assert.equal(result.body.code, "URGENT_CLEANING_ONLY", entry.name);
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 0, entry.name);
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 0, entry.name);
  }
  assert.equal(pricingCalls, 0);
});

dbTest("real PostgreSQL: concurrent scheduled retry commits exactly one job and item set", async () => {
  const service = createBookingJobService(makeDependencies());
  const body = publicScheduledBody({ scheduled_request_key: "scheduled-pr3-concurrent-0001" });
  const [one, two] = await Promise.all([
    invoke(service.handlePublicBook, body),
    invoke(service.handlePublicBook, body),
  ]);
  assert.equal(one.statusCode, 200);
  assert.equal(two.statusCode, 200);
  assert.equal(one.body.job_id, two.body.job_id);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments`)).rows[0].count), 0);
});

dbTest("real PostgreSQL: public urgent non-cleaning rejects before any mutation", async () => {
  const service = createBookingJobService(makeDependencies());
  const result = await invoke(service.handlePublicBook, publicUrgentBody({ job_type: "ซ่อมแอร์" }));
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.code, "URGENT_CLEANING_ONLY");
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 0);
});

function makeApprovalService(events = {}, overrides = {}) {
  return createBookingApprovalService({
    pool,
    availabilityEngine: {
      reservePublicCustomerTechnician: async (_deps, options) => {
        events.reserveOptions = (events.reserveOptions || []).concat([options]);
        return { username: options.preferred_username || "tech-b" };
      },
    },
    getAvailabilityDependencies: (db) => ({ db, pool: db }),
    refreshTechnicianIncomePreviewForJob: async (...args) => {
      events.income = (events.income || []).concat([args]);
      return {};
    },
    notifyDirectJobAssigned: async (payload) => {
      events.direct = (events.direct || []).concat([payload]);
    },
    notifyUrgentOffer: async (payload) => {
      events.offers = (events.offers || []).concat([payload]);
    },
    isTechReady: async () => true,
    checkTechCollision: async () => null,
    logJobUpdate: async (jobId, payload, db) => {
      events.audit = (events.audit || []).concat([payload]);
      await db.query(
        `INSERT INTO public.job_updates_v2 (job_id, action, payload_json) VALUES ($1,$2,$3::jsonb)`,
        [jobId, payload.action, JSON.stringify(payload.payload || {})]
      );
    },
    ...overrides,
  });
}

dbTest("real PostgreSQL: production-shaped units and real availability engine approve multi-service scheduled booking", async () => {
  await seedRealAvailability();
  const depsFor = (db = pool) => realAvailabilityDependencies(db);
  const booking = createBookingJobService(makeDependencies({
    computeDurationMinMulti: (payload) => pricingHelpers.computeDurationMinMulti(payload, { source: "pr3_real_engine", conservative: true }),
    customerAvailability: availabilityEngine,
    publicCustomerAvailabilityDeps: depsFor,
  }));
  const created = await invoke(booking.handlePublicBook, publicScheduledBody({
    scheduled_request_key: "scheduled-pr3-real-engine-0001",
    job_type: "ล้าง",
    ac_type: "ผนัง",
    btu: 12000,
    machine_count: 3,
    services: [
      { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: 12000, machine_count: 2 },
      { job_type: "ล้าง", ac_type: "สี่ทิศทาง", wash_variant: "", btu: 24000, machine_count: 1 },
    ],
  }));
  assert.equal(created.statusCode, 200);

  const units = (await pool.query(
    `SELECT unit_no, ac_type, wash_type, btu
       FROM public.job_units
      WHERE job_id=$1
      ORDER BY unit_no`,
    [created.body.job_id]
  )).rows;
  assert.deepEqual(units, [
    { unit_no: 1, ac_type: "ผนัง", wash_type: "ล้างธรรมดา", btu: "12000" },
    { unit_no: 2, ac_type: "ผนัง", wash_type: "ล้างธรรมดา", btu: "12000" },
    { unit_no: 3, ac_type: "สี่ทิศทาง", wash_type: null, btu: "24000" },
  ]);

  const events = {};
  const approval = makeApprovalService(events, {
    availabilityEngine,
    getAvailabilityDependencies: depsFor,
  });
  const approved = await invokeApproval(approval.approve, created.body.job_id);
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.replayed, false);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 1);
  assert.equal((await pool.query(`SELECT job_status FROM public.jobs WHERE job_id=$1`, [created.body.job_id])).rows[0].job_status, JOB_STATUS.ADMIN_SCHEDULED_PENDING);
  assert.equal(events.income.length, 1);
  assert.equal(events.direct.length, 1);
});

async function invokeApproval(handler, jobId, body = {}) {
  const req = { params: { job_id: String(jobId) }, body, auth: { username: "admin-test" } };
  const res = responseHarness();
  await handler(req, res);
  return res;
}

dbTest("real PostgreSQL: scheduled approval creates one assignment after revalidation and replay has no duplicate side effect", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  const events = {};
  const approval = makeApprovalService(events);
  const first = await invokeApproval(approval.approve, created.body.job_id);
  const replay = await invokeApproval(approval.approve, created.body.job_id);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.replayed, false);
  assert.equal(replay.body.replayed, true);
  assert.equal(events.reserveOptions.length, 1);
  assert.equal(events.reserveOptions[0].preferred_username, "tech-a");
  assert.equal(events.reserveOptions[0].ignore_job_id, created.body.job_id);
  assert.equal(events.income.length, 1);
  assert.equal(events.direct.length, 1);
  assert.equal(events.audit.length, 1);
  assert.equal(events.audit[0].action, "customer_booking_approved");
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 1);
  const job = (await pool.query(`SELECT job_status FROM public.jobs WHERE job_id=$1`, [created.body.job_id])).rows[0];
  assert.equal(job.job_status, JOB_STATUS.ADMIN_SCHEDULED_PENDING);
});

dbTest("real PostgreSQL: invalid reserved technician is safely reassigned in the same approval transaction", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  const calls = [];
  const approval = makeApprovalService({}, {
    availabilityEngine: {
      reservePublicCustomerTechnician: async (_deps, options) => {
        calls.push(options);
        if (options.preferred_username) {
          const error = new Error("CUSTOMER_SLOT_STALE");
          error.status = 409;
          throw error;
        }
        return { username: "tech-b" };
      },
    },
  });
  const result = await invokeApproval(approval.approve, created.body.job_id);
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].preferred_username, "tech-a");
  assert.equal(calls[1].preferred_username, undefined);
  const assignment = (await pool.query(`SELECT technician_username FROM public.job_assignments WHERE job_id=$1`, [created.body.job_id])).rows[0];
  assert.equal(assignment.technician_username, "tech-b");
});

dbTest("real PostgreSQL: approval failure rolls back and leaves pending reservation intact", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  const approval = makeApprovalService({}, {
    availabilityEngine: {
      reservePublicCustomerTechnician: async () => {
        const error = new Error("CUSTOMER_SLOT_STALE");
        error.status = 409;
        throw error;
      },
    },
  });
  const result = await invokeApproval(approval.approve, created.body.job_id);
  assert.equal(result.statusCode, 409);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 0);
  const job = (await pool.query(`SELECT job_status, technician_username FROM public.jobs WHERE job_id=$1`, [created.body.job_id])).rows[0];
  assert.equal(job.job_status, JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW);
  assert.equal(job.technician_username, "tech-a");
});

dbTest("real PostgreSQL: approval fails closed when pending reservation already has assignment state", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  await pool.query(
    `INSERT INTO public.job_assignments (job_id, technician_username, status) VALUES ($1,'unexpected-tech','in_progress')`,
    [created.body.job_id]
  );
  const events = {};
  const approval = makeApprovalService(events);
  const result = await invokeApproval(approval.approve, created.body.job_id);
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, "PENDING_RESERVATION_STATE_DRIFT");
  assert.equal((await pool.query(`SELECT job_status FROM public.jobs WHERE job_id=$1`, [created.body.job_id])).rows[0].job_status, JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW);
});

dbTest("real PostgreSQL: urgent approval creates only an offer and notifies after commit", async () => {
  await seedTechnicians();
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicUrgentBody());
  const events = {};
  const approval = makeApprovalService(events, {
    notifyUrgentOffer: async (payload) => {
      const committed = await pool.query(`SELECT job_status FROM public.jobs WHERE job_id=$1`, [payload.job_id]);
      assert.equal(committed.rows[0].job_status, JOB_STATUS.ADMIN_URGENT_WAITING);
      events.offers = (events.offers || []).concat([payload]);
    },
  });
  const first = await invokeApproval(approval.approve, created.body.job_id, { technician_username: "tech-a" });
  const replay = await invokeApproval(approval.approve, created.body.job_id, { technician_username: "tech-a" });
  assert.equal(first.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(events.offers.length, 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_offers WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_assignments WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_team_members WHERE job_id=$1`, [created.body.job_id])).rows[0].count), 0);
});

dbTest("real PostgreSQL: reject clears hidden reservation and releases scheduled load", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  const before = await loadCustomerScheduledLoadMap(pool, "2026-08-01", ["tech-a"]);
  assert.equal(before.get("tech-a").jobs_count, 1);
  const events = {};
  const approval = makeApprovalService(events);
  const rejected = await invokeApproval(approval.reject, created.body.job_id, { reason: "not approved" });
  assert.equal(rejected.statusCode, 200);
  const after = await loadCustomerScheduledLoadMap(pool, "2026-08-01", ["tech-a"]);
  assert.equal(after.get("tech-a").jobs_count, 0);
  const row = (await pool.query(`SELECT technician_username, canceled_at, cancel_reason FROM public.jobs WHERE job_id=$1`, [created.body.job_id])).rows[0];
  assert.equal(row.technician_username, null);
  assert.ok(row.canceled_at);
  assert.equal(row.cancel_reason, "not approved");
  assert.equal(events.audit.length, 1);
  assert.equal(events.audit[0].action, "customer_booking_rejected");
  assert.equal(events.audit[0].payload.reserved_technician, "tech-a");
  const audit = (await pool.query(`SELECT action, payload_json FROM public.job_updates_v2 WHERE job_id=$1`, [created.body.job_id])).rows[0];
  assert.equal(audit.action, "customer_booking_rejected");
  assert.equal(audit.payload_json.reserved_technician, "tech-a");
});

dbTest("real PostgreSQL: exact pending reservation is hidden until assignment approval", async () => {
  const booking = createBookingJobService(makeDependencies());
  const created = await invoke(booking.handlePublicBook, publicScheduledBody());
  const hidden = await pool.query(
    `SELECT job_id FROM public.jobs j
      WHERE j.job_id=$1 AND j.technician_username=$2
        AND NOT ${pendingCustomerScheduledReservationSql("j")}`,
    [created.body.job_id, "tech-a"]
  );
  assert.equal(hidden.rows.length, 0);
  const approval = makeApprovalService({});
  await invokeApproval(approval.approve, created.body.job_id);
  const visible = await pool.query(
    `SELECT j.job_id FROM public.jobs j
      WHERE j.job_id=$1 AND (
        (j.technician_username=$2 AND NOT ${pendingCustomerScheduledReservationSql("j")})
        OR EXISTS (SELECT 1 FROM public.job_assignments ja WHERE ja.job_id=j.job_id AND ja.technician_username=$2)
      )`,
    [created.body.job_id, "tech-a"]
  );
  assert.equal(visible.rows.length, 1);
});

dbTest("real PostgreSQL: Admin Auto, Single, Team, and Forced preserve assignments and status", async () => {
  const cases = [
    { name: "auto", patch: { assign_mode: "auto" }, expected: ["tech-a"] },
    { name: "single", patch: { assign_mode: "single", technician_username: "tech-a" }, expected: ["tech-a"] },
    { name: "team", patch: { assign_mode: "team", team_members: ["tech-a", "tech-b"] }, expected: ["tech-a", "tech-b"] },
    { name: "forced", patch: { assign_mode: "single", dispatch_mode: "forced", technician_username: "tech-a" }, expected: ["tech-a"] },
  ];
  for (const entry of cases) {
    await pool.query(`TRUNCATE public.job_promotions, public.job_offers, public.job_assignments, public.job_team_members, public.job_items, public.jobs RESTART IDENTITY CASCADE`);
    await pool.query(`TRUNCATE public.technician_profiles, public.users`);
    await seedTechnicians();
    const service = createBookingJobService(makeDependencies());
    const result = await invoke(service.handleAdminBookV2, {
      customer_name: `Admin ${entry.name}`,
      customer_phone: "0800000000",
      job_type: "ล้างแอร์",
      appointment_datetime: "2026-08-01T09:00:00+07:00",
      address_text: "กรุงเทพฯ",
      booking_mode: "scheduled",
      tech_type: "all",
      ac_type: "ผนัง",
      machine_count: 1,
      wash_variant: "ล้างธรรมดา",
      ...entry.patch,
    });
    assert.equal(result.statusCode, 200, entry.name);
    assert.equal((await pool.query(`SELECT job_status FROM public.jobs`)).rows[0].job_status, JOB_STATUS.ADMIN_SCHEDULED_PENDING);
    const assigned = (await pool.query(`SELECT technician_username FROM public.job_assignments ORDER BY technician_username`)).rows.map((row) => row.technician_username);
    assert.deepEqual(assigned, entry.expected, entry.name);
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 1, entry.name);
  }
});

dbTest("real PostgreSQL: internal booking preserves validation and admin-notification serialization", async () => {
  await seedTechnicians();
  const service = createBookingJobService(makeDependencies());
  const invalid = await invoke(service.handleInternalBookFromAi, { customer_name: "AI" });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.body.missing_fields, ["job_type", "appointment_datetime", "address_text"]);

  const valid = await invoke(service.handleInternalBookFromAi, {
    customer_name: "AI Customer",
    customer_phone: "0811111111",
    job_type: "ล้างแอร์",
    appointment_datetime: "2026-08-01T10:00:00+07:00",
    address_text: "กรุงเทพฯ",
    booking_mode: "scheduled",
    tech_type: "all",
    assign_mode: "auto",
    ac_type: "ผนัง",
    machine_count: 1,
    wash_variant: "ล้างธรรมดา",
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.success, true);
  assert.equal(valid.body.admin_notification.event, "new_booking_created_from_ai");
  assert.equal(valid.body.admin_notification.message_fields.job_id, Number(valid.body.job_id));
});

dbTest("real PostgreSQL: urgent transaction rollback leaves no partial job, items, or offers", async () => {
  await seedTechnicians();
  const service = createBookingJobService(makeDependencies({
    ensureBookingJobUnits: async () => { throw new Error("fixture urgent rollback"); },
  }));
  const result = await invoke(service.handlePublicBook, publicUrgentBody({ urgent_request_key: "urgent-pr2-key-rollback" }));
  assert.equal(result.statusCode, 500);
  for (const table of ["jobs", "job_items", "job_offers"]) {
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.${table}`)).rows[0].count), 0, table);
  }
});
