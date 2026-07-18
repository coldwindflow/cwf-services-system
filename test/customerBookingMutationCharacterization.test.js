"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const { JOB_STATUS, ASSIGNMENT_STATUS, OFFER_STATUS } = require("../server/services/booking/bookingStatuses");
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
    DROP TABLE IF EXISTS public.job_promotions, public.job_offers, public.job_assignments,
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
    )
  `);
  await pool.query(`
    CREATE TABLE public.job_items (
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
    )
  `);
});

test.after(async () => {
  if (!pool) return;
  await pool.query(`
    DROP TABLE IF EXISTS public.job_promotions, public.job_offers, public.job_assignments,
      public.job_team_members, public.job_items, public.catalog_items,
      public.technician_profiles, public.users, public.jobs CASCADE
  `);
  await pool.end();
});

test.beforeEach(async () => {
  if (!pool) return;
  await pool.query(`TRUNCATE public.job_promotions, public.job_offers, public.job_assignments,
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
      buildCustomerServiceLineItemsFromPayload: async () => [{
        item_id: null,
        item_name: "ล้างแอร์",
        qty: 1,
        unit_price: 800,
        line_total: 800,
        assigned_technician_username: null,
        is_service: true,
        customer_price_source: "standard",
      }],
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
    ensureJobUnits: async () => {},
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
      (username, weekly_off_days, accept_status, accept_status_expires_at, employment_type, allow_out_of_zone)
    VALUES
      ('tech-a','','ready',NOW() + INTERVAL '1 day','partner',FALSE),
      ('tech-b','','ready',NOW() + INTERVAL '1 day','company',FALSE)
  `);
}

dbTest("real PostgreSQL: public scheduled success preserves response, status, items, pricing, and assignment reservation", async () => {
  const service = createBookingJobService(makeDependencies());
  const result = await invoke(service.handlePublicBook, publicScheduledBody());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.body), [
    "success", "job_id", "booking_code", "token", "booking_mode", "dispatch_mode",
    "offers_count", "urgent_offer_enabled", "duration_min", "effective_block_min",
    "travel_buffer_min", "applied_promo", "base_total",
  ]);
  assert.equal(result.body.booking_mode, "scheduled");
  assert.equal(result.body.base_total, 800);

  const job = (await pool.query(`SELECT * FROM public.jobs`)).rows[0];
  const items = (await pool.query(`SELECT item_name, qty::int, line_total::int FROM public.job_items ORDER BY item_name`)).rows;
  assert.equal(job.job_status, JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW);
  assert.equal(job.technician_username, "tech-a");
  assert.equal(Number(job.job_price), 800);
  assert.deepEqual(items, [{ item_name: "ล้างแอร์", qty: 1, line_total: 800 }]);
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
    ensureJobUnits: async () => { throw new Error("fixture assignment failure"); },
  }));
  const result = await invoke(service.handlePublicBook, publicScheduledBody({ scheduled_request_key: "scheduled-pr2-key-rollback" }));
  assert.equal(result.statusCode, 500);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 0);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_items`)).rows[0].count), 0);
});

dbTest("real PostgreSQL: public urgent keeps immediate offers, response shape, and durable retry parity", async () => {
  await seedTechnicians();
  const notifications = [];
  const service = createBookingJobService(makeDependencies({
    notifyUrgentOffer: async (payload) => { notifications.push(payload); },
  }));
  const body = publicUrgentBody();
  const first = await invoke(service.handlePublicBook, body);
  const replay = await invoke(service.handlePublicBook, body);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.booking_mode, "urgent");
  assert.equal(first.body.dispatch_mode, "offer");
  assert.equal(first.body.offers_count, 1);
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.booking_code, first.body.booking_code);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.jobs`)).rows[0].count), 1);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.job_offers`)).rows[0].count), 1);
  assert.equal((await pool.query(`SELECT job_status FROM public.jobs`)).rows[0].job_status, JOB_STATUS.ADMIN_URGENT_WAITING);
  assert.equal(notifications.length, 1);
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
    ensureJobUnits: async () => { throw new Error("fixture urgent rollback"); },
  }));
  const result = await invoke(service.handlePublicBook, publicUrgentBody({ urgent_request_key: "urgent-pr2-key-rollback" }));
  assert.equal(result.statusCode, 500);
  for (const table of ["jobs", "job_items", "job_offers"]) {
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM public.${table}`)).rows[0].count), 0, table);
  }
});
