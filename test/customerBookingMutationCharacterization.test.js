"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const { createBookingApprovalService } = require("../server/services/booking/bookingApprovalService");
const availabilityEngine = require("../server/services/booking/availabilityEngine");
const { createUrgentDispatchService } = require("../server/services/urgent/dispatch");
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
    ADMIN_SCHEDULED_PENDING: "à¸£à¸­à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£",
    ADMIN_URGENT_WAITING: "à¸£à¸­à¸Šà¹ˆà¸²à¸‡à¸¢à¸·à¸™à¸¢à¸±à¸™",
    CUSTOMER_SCHEDULED_REVIEW: "à¸£à¸­à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š",
    URGENT_NO_TECHNICIAN: "à¹„à¸¡à¹ˆà¸žà¸šà¸Šà¹ˆà¸²à¸‡à¸£à¸±à¸šà¸‡à¸²à¸™",
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
    customer_name: "à¸¥à¸¹à¸à¸„à¹‰à¸²à¸—à¸”à¸ªà¸­à¸š",
    customer_phone: "0812345678",
    job_type: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ",
    appointment_datetime: "2026-08-01T09:00:00+07:00",
    address_text: "à¸à¸£à¸¸à¸‡à¹€à¸—à¸žà¸¯",
    customer_note: "",
    maps_url: "",
    job_zone: "",
    items: [],
    booking_mode: "scheduled",
    client_app: "customer_app_v2",
    allow_time_proposal: false,
    ac_type: "à¸œà¸™à¸±à¸‡",
    btu: 12000,
    machine_count: 1,
    wash_variant: "à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²",
    repair_variant: "",
    scheduled_request_key: "scheduled-pr2-key-0001",
    ...overrides,
  };
}

function publicUrgentBody(overrides = {}) {
  return {
    customer_name: "à¸¥à¸¹à¸à¸„à¹‰à¸²à¸”à¹ˆà¸§à¸™",
    customer_phone: "0899999999",
    job_type: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ",
    appointment_datetime: "2026-08-01T13:45:00+07:00",
    address_text: "à¸à¸£à¸¸à¸‡à¹€à¸—à¸žà¸¯",
    maps_url: "",
    job_zone: "",
    customer_note: "",
    allow_time_proposal: false,
    booking_mode: "urgent",
    ac_type: "à¸œà¸™à¸±à¸‡",
    btu: 12000,
    machine_count: 1,
    wash_variant: "à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²",
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
    DROP TABLE IF EXISTS public.technician_special_slots_v2, public.technician_workdays_v2,
      public.technician_monthly_work_calendar, public.technician_service_matrix,
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
      ,work_start TEXT DEFAULT '09:00'
      ,work_end TEXT DEFAULT '18:00'
    )
  `);
  await pool.query(`CREATE TABLE public.technician_service_matrix (username TEXT PRIMARY KEY, matrix_json JSONB)`);
  await pool.query(`CREATE TABLE public.technician_workdays_v2 (technician_username TEXT, work_date DATE, is_off BOOLEAN)`);
  await pool.query(`CREATE TABLE public.technician_special_slots_v2 (technician_username TEXT, slot_date DATE, start_time TEXT, end_time TEXT)`);
  await pool.query(`
    CREATE TABLE public.technician_monthly_work_calendar (
      technician_username TEXT,
      work_date DATE,
      day_status TEXT,
      can_accept_advance_job BOOLEAN,
      can_accept_urgent_job BOOLEAN,
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
    DROP TABLE IF EXISTS public.technician_special_slots_v2, public.technician_workdays_v2,
      public.technician_monthly_work_calendar, public.technician_service_matrix,
      public.job_updates_v2, public.job_units, public.job_promotions, public.job_offers, public.job_assignments,
      public.job_team_members, public.job_items, public.catalog_items,
      public.technician_profiles, public.users, public.jobs CASCADE
  `);
  await pool.end();
});

test.beforeEach(async () => {
  if (!pool) return;
  await pool.query(`TRUNCATE public.technician_special_slots_v2, public.technician_workdays_v2,
    public.technician_monthly_work_calendar, public.technician_service_matrix,
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
  const urgentPublicAdapter = urgentPublicAdapterBase;
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
    http409Conflict: (res, conflict) => res.status(409).json({ error: "à¸Šà¸™à¸„à¸´à¸§", conflict }),
    generateUniqueBookingCode: async () => `CWF-PR2-${++bookingCodeSequence}`,
    effectiveBlockMin: (duration) => Number(duration) + 30,
    iïÝ»¶‰žËkºwµçPñðíô¥t4(€€€€€€¤ì4(€€€ô°4(€€€€¸¸¹½Ù•ÉÉ¥‘•Ì°4(€ô¤ì4)ô4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0èÁÉ½‘ÕÑ¥½¸µÍ¡…Á•Õ¹¥ÑÌ…¹É•…°…Ù…¥±…‰¥±¥Ñä•¹¥¹”…ÁÁÉ½Ù”µÕ±Ñ¤µÍ•ÉÙ¥”Í¡•‘Õ±•‰½½­¥¹œˆ°…Íå¹Œ€ ¤€ôøì4(€…Ý…¥ÐÍ••‘I•…±Ù…¥±…‰¥±¥Ñä ¤ì4(€½¹ÍÐ‘•ÁÍ½È€ô€¡‘ˆ€ôÁ½½°¤€ôøÉ•…±Ù…¥±…‰¥±¥Ñå•Á•¹‘•¹¥•Ì¡‘ˆ¤ì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì¡ì4(€€€½µÁÕÑ•ÕÉ…Ñ¥½¹5¥¹5Õ±Ñ¤è€¡Á…å±½…¤€ôøÁÉ¥¥¹!•±Á•ÉÌ¹½µÁÕÑ•ÕÉ…Ñ¥½¹5¥¹5Õ±Ñ¤¡Á…å±½…°ìÍ½ÕÉ”è€‰ÁÈÍ}É•…±}•¹¥¹”ˆ°½¹Í•ÉÙ…Ñ¥Ù”èÑÉÕ”ô¤°4(€€€ÕÍÑ½µ•ÉÙ…¥±…‰¥±¥Ñäè…Ù…¥±…‰¥±¥Ñå¹¥¹”°4(€€€ÁÕ‰±¥ÕÍÑ½µ•ÉÙ…¥±…‰¥±¥Ñå•ÁÌè‘•ÁÍ½È°4(€ô¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä¡ì4(€€€Í¡•‘Õ±•‘}É•ÅÕ•ÍÑ}­•äè€‰Í¡•‘Õ±•µÁÈÌµÉ•…°µ•¹¥¹”´ÀÀÀÄˆ°4(€€€©½‰}ÑåÁ”è€‹‚â—‚æ'‚âË‚âˆ°4(€€€…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°4(€€€‰ÑÔè€ÄÈÀÀÀ°4(€€€µ…¡¥¹•}½Õ¹Ðè€Ì°4(€€€Í•ÉÙ¥•Ìèl4(€€€€€ì©½‰}ÑåÁ”è€‹‚â—‚æ'‚âË‚âˆ°…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°Ý…Í¡}Ù…É¥…¹Ðè€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ°‰ÑÔè€ÄÈÀÀÀ°µ…¡¥¹•}½Õ¹Ðè€Èô°4(€€€€€ì©½‰}ÑåÁ”è€‹‚â—‚æ'‚âË‚âˆ°…}ÑåÁ”è€‹‚â«‚â×‚æ#‚â_‚âÓ‚â£‚â_‚âË‚âˆ°Ý…Í¡}Ù…É¥…¹Ðè€ˆˆ°‰ÑÔè€ÈÐÀÀÀ°µ…¡¥¹•}½Õ¹Ðè€Äô°4(€€€t°4(€ô¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•…Ñ•¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(4(€½¹ÍÐÕ¹¥ÑÌ€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä 4(€€€M1PÕ¹¥Ñ}¹¼°…}ÑåÁ”°Ý…Í¡}ÑåÁ”°‰ÑÔ4(€€€€€€I=4ÁÕ‰±¥Œ¹©½‰}Õ¹¥ÑÌ4(€€€€€]!I©½‰}¥ôÄ4(€€€€€=IH	dÕ¹¥Ñ}¹½€°4(€€€mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t4(€€¤¤¹É½ÝÌì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡Õ¹¥ÑÌ°l4(€€€ìÕ¹¥Ñ}¹¼è€Ä°…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°Ý…Í¡}ÑåÁ”è€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ°‰ÑÔè€ˆÄÈÀÀÀˆô°4(€€€ìÕ¹¥Ñ}¹¼è€È°…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°Ý…Í¡}ÑåÁ”è€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ°‰ÑÔè€ˆÄÈÀÀÀˆô°4(€€€ìÕ¹¥Ñ}¹¼è€Ì°…}ÑåÁ”è€‹‚â«‚â×‚æ#‚â_‚âÓ‚â£‚â_‚âË‚âˆ°Ý…Í¡}ÑåÁ”è¹Õ±°°‰ÑÔè€ˆÈÐÀÀÀˆô°4(€t¤ì4(4(€½¹ÍÐ•Ù•¹ÑÌ€ôíôì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡•Ù•¹ÑÌ°ì4(€€€…Ù…¥±…‰¥±¥Ñå¹¥¹”°4(€€€•ÑÙ…¥±…‰¥±¥Ñå•Á•¹‘•¹¥•Ìè‘•ÁÍ½È°4(€ô¤ì4(€½¹ÍÐ…ÁÁÉ½Ù•€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÁÁÉ½Ù•¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÁÁÉ½Ù•¹‰½‘ä¹É•Á±…å•°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌI=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹5%9}M!U1}A9%9¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹¥¹½µ”¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹‘¥É•Ð¹±•¹Ñ °€Ä¤ì4)ô¤ì4(4)…Íå¹Œ™Õ¹Ñ¥½¸¥¹Ù½­•ÁÁÉ½Ù…°¡¡…¹‘±•È°©½‰%°‰½‘ä€ôíô¤ì4(€½¹ÍÐÉ•Ä€ôìÁ…É…µÌèì©½‰}¥èMÑÉ¥¹œ¡©½‰%¤ô°‰½‘ä°…ÕÑ èìÕÍ•É¹…µ”è€‰…‘µ¥¸µÑ•ÍÐˆôôì4(€½¹ÍÐÉ•Ì€ôÉ•ÍÁ½¹Í•!…É¹•ÍÌ ¤ì4(€…Ý…¥Ð¡…¹‘±•È¡É•Ä°É•Ì¤ì4(€É•ÑÕÉ¸É•Ìì4)ô4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0èÍ¡•‘Õ±•…ÁÁÉ½Ù…°É•…Ñ•Ì½¹”…ÍÍ¥¹µ•¹Ð…™Ñ•ÈÉ•Ù…±¥‘…Ñ¥½¸…¹É•Á±…ä¡…Ì¹¼‘ÕÁ±¥…Ñ”Í¥‘”•™™•Ðˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€½¹ÍÐ•Ù•¹ÑÌ€ôíôì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡•Ù•¹ÑÌ¤ì4(€½¹ÍÐ™¥ÉÍÐ€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€½¹ÍÐÉ•Á±…ä€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥ÉÍÐ¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥ÉÍÐ¹‰½‘ä¹É•Á±…å•°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Á±…ä¹‰½‘ä¹É•Á±…å•°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹É•Í•ÉÙ•=ÁÑ¥½¹Ì¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹É•Í•ÉÙ•=ÁÑ¥½¹ÍlÁt¹ÁÉ•™•ÉÉ•‘}ÕÍ•É¹…µ”°€‰Ñ• µ„ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹É•Í•ÉÙ•=ÁÑ¥½¹ÍlÁt¹¥¹½É•}©½‰}¥°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹¥¹½µ”¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹‘¥É•Ð¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹…Õ‘¥Ð¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹…Õ‘¥ÑlÁt¹…Ñ¥½¸°€‰ÕÍÑ½µ•É}‰½½­¥¹}…ÁÁÉ½Ù•ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€Ä¤ì4(€½¹ÍÐ©½ˆ€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌI=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁtì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡©½ˆ¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹5%9}M!U1}A9%9¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è¥¹Ù…±¥É•Í•ÉÙ•Ñ•¡¹¥¥…¸¥ÌÍ…™•±äÉ•…ÍÍ¥¹•¥¸Ñ¡”Í…µ”…ÁÁÉ½Ù…°ÑÉ…¹Í…Ñ¥½¸ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€½¹ÍÐ…±±Ì€ômtì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡íô°ì4(€€€…Ù…¥±…‰¥±¥Ñå¹¥¹”èì4(€€€€€É•Í•ÉÙ•AÕ‰±¥ÕÍÑ½µ•ÉQ•¡¹¥¥…¸è…Íå¹Œ€¡}‘•ÁÌ°½ÁÑ¥½¹Ì¤€ôøì4(€€€€€€€…±±Ì¹ÁÕÍ ¡½ÁÑ¥½¹Ì¤ì4(€€€€€€€¥˜€¡½ÁÑ¥½¹Ì¹ÁÉ•™•ÉÉ•‘}ÕÍ•É¹…µ”¤ì4(€€€€€€€€€½¹ÍÐ•ÉÉ½È€ô¹•ÜÉÉ½È ‰UMQ=5I}M1=Q}MQ1ˆ¤ì4(€€€€€€€€€•ÉÉ½È¹ÍÑ…ÑÕÌ€ô€ÐÀäì4(€€€€€€€€€Ñ¡É½Ü•ÉÉ½Èì4(€€€€€€€ô4(€€€€€€€É•ÑÕÉ¸ìÕÍ•É¹…µ”è€‰Ñ• µˆˆôì4(€€€€€ô°4(€€€ô°4(€ô¤ì4(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±Ì¹±•¹Ñ °€È¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÁt¹ÁÉ•™•ÉÉ•‘}ÕÍ•É¹…µ”°€‰Ñ• µ„ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±ÍlÅt¹ÁÉ•™•ÉÉ•‘}ÕÍ•É¹…µ”°Õ¹‘•™¥¹•¤ì4(€½¹ÍÐ…ÍÍ¥¹µ•¹Ð€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1PÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁtì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÍÍ¥¹µ•¹Ð¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°€‰Ñ• µˆˆ¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è…ÁÁÉ½Ù…°™…¥±ÕÉ”É½±±Ì‰…¬…¹±•…Ù•ÌÁ•¹‘¥¹œÉ•Í•ÉÙ…Ñ¥½¸¥¹Ñ…Ðˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡íô°ì4(€€€…Ù…¥±…‰¥±¥Ñå¹¥¹”èì4(€€€€€É•Í•ÉÙ•AÕ‰±¥ÕÍÑ½µ•ÉQ•¡¹¥¥…¸è…Íå¹Œ€ ¤€ôøì4(€€€€€€€½¹ÍÐ•ÉÉ½È€ô¹•ÜÉÉ½È ‰UMQ=5I}M1=Q}MQ1ˆ¤ì4(€€€€€€€•ÉÉ½È¹ÍÑ…ÑÕÌ€ô€ÐÀäì4(€€€€€€€Ñ¡É½Ü•ÉÉ½Èì4(€€€€€ô°4(€€€ô°4(€ô¤ì4(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹ÍÑ…ÑÕÍ½‘”°€ÐÀä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€À¤ì4(€½¹ÍÐ©½ˆ€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌ°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”I=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁtì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡©½ˆ¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹UMQ=5I}M!U1}IY%\¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡©½ˆ¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°€‰Ñ• µ„ˆ¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è…ÁÁÉ½Ù…°™…¥±Ì±½Í•Ý¡•¸Á•¹‘¥¹œÉ•Í•ÉÙ…Ñ¥½¸…±É•…‘ä¡…Ì…ÍÍ¥¹µ•¹ÐÍÑ…Ñ”ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€…Ý…¥ÐÁ½½°¹ÅÕ•Éä 4(€€€%9MIP%9Q<ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ€¡©½‰}¥°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°ÍÑ…ÑÕÌ¤Y1UL€ Ä°Õ¹•áÁ•Ñ•µÑ• œ°¥¹}ÁÉ½É•ÍÌœ¥€°4(€€€mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t4(€€¤ì4(€½¹ÍÐ•Ù•¹ÑÌ€ôíôì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡•Ù•¹ÑÌ¤ì4(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹ÍÑ…ÑÕÍ½‘”°€ÐÀä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹‰½‘ä¹½‘”°€‰A9%9}IMIYQ%=9}MQQ}I%Pˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌI=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹UMQ=5I}M!U1}IY%\¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0èÁÕ‰±¥ŒÕÉ•¹Ð™…±±‰…¬¥Ì¹½Ð…Ñ•‰äÑ¡”±•…ä…‘µ¥¸µ…ÁÁÉ½Ù…°µÕÑ…Ñ¥½¸ˆ°…Íå¹Œ€ ¤€ôøì(€…Ý…¥ÐÍ••‘Q•¡¹¥¥…¹Ì ¤ì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥UÉ•¹Ñ	½‘ä ¤¤ì4(€½¹ÍÐ•Ù•¹ÑÌ€ôíôì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡•Ù•¹ÑÌ°ì4(€€€¹½Ñ¥™åUÉ•¹Ñ=™™•Èè…Íå¹Œ€¡Á…å±½…¤€ôøì4(€€€€€½¹ÍÐ½µµ¥ÑÑ•€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌI=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÁ…å±½…¹©½‰}¥‘t¤ì4(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½µµ¥ÑÑ•¹É½ÝÍlÁt¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹5%9}UI9Q}]%Q%9¤ì4(€€€€€•Ù•¹ÑÌ¹½™™•ÉÌ€ô€¡•Ù•¹ÑÌ¹½™™•ÉÌñðmt¤¹½¹…Ð¡mÁ…å±½…‘t¤ì4(€€€ô°4(€ô¤ì4(€½¹ÍÐ™¥ÉÍÐ€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥°ìÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”è€‰Ñ• µ„ˆô¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥ÉÍÐ¹ÍÑ…ÑÕÍ½‘”°€ÐÀä¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹½™™•ÉÌ°Õ¹‘•™¥¹•¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}½™™•ÉÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€À¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}Ñ•…µ}µ•µ‰•ÉÌ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€À¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0èÉ•©•Ð±•…ÉÌ¡¥‘‘•¸É•Í•ÉÙ…Ñ¥½¸…¹É•±•…Í•ÌÍ¡•‘Õ±•±½…ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€½¹ÍÐ‰•™½É”€ô…Ý…¥Ð±½…‘ÕÍÑ½µ•ÉM¡•‘Õ±•‘1½…‘5…À¡Á½½°°€ˆÈÀÈØ´Àà´ÀÄˆ°l‰Ñ• µ„‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡‰•™½É”¹•Ð ‰Ñ• µ„ˆ¤¹©½‰Í}½Õ¹Ð°€Ä¤ì4(€½¹ÍÐ•Ù•¹ÑÌ€ôíôì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡•Ù•¹ÑÌ¤ì4(€½¹ÍÐÉ•©•Ñ•€ô…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹É•©•Ð°É•…Ñ•¹‰½‘ä¹©½‰}¥°ìÉ•…Í½¸è€‰¹½Ð…ÁÁÉ½Ù•ˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•©•Ñ•¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(€½¹ÍÐ…™Ñ•È€ô…Ý…¥Ð±½…‘ÕÍÑ½µ•ÉM¡•‘Õ±•‘1½…‘5…À¡Á½½°°€ˆÈÀÈØ´Àà´ÀÄˆ°l‰Ñ• µ„‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…™Ñ•È¹•Ð ‰Ñ• µ„ˆ¤¹©½‰Í}½Õ¹Ð°€À¤ì4(€½¹ÍÐÉ½Ü€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1PÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”°…¹•±•‘}…Ð°…¹•±}É•…Í½¸I=4ÁÕ‰±¥Œ¹©½‰Ì]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁtì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É½Ü¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”°¹Õ±°¤ì4(€…ÍÍ•ÉÐ¹½¬¡É½Ü¹…¹•±•‘}…Ð¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É½Ü¹…¹•±}É•…Í½¸°€‰¹½Ð…ÁÁÉ½Ù•ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹…Õ‘¥Ð¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹…Õ‘¥ÑlÁt¹…Ñ¥½¸°€‰ÕÍÑ½µ•É}‰½½­¥¹}É•©•Ñ•ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•Ù•¹ÑÌ¹…Õ‘¥ÑlÁt¹Á…å±½…¹É•Í•ÉÙ•‘}Ñ•¡¹¥¥…¸°€‰Ñ• µ„ˆ¤ì4(€½¹ÍÐ…Õ‘¥Ð€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P…Ñ¥½¸°Á…å±½…‘}©Í½¸I=4ÁÕ‰±¥Œ¹©½‰}ÕÁ‘…Ñ•Í}ØÈ]!I©½‰}¥ôÅ€°mÉ•…Ñ•¹‰½‘ä¹©½‰}¥‘t¤¤¹É½ÝÍlÁtì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…Õ‘¥Ð¹…Ñ¥½¸°€‰ÕÍÑ½µ•É}‰½½­¥¹}É•©•Ñ•ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…Õ‘¥Ð¹Á…å±½…‘}©Í½¸¹É•Í•ÉÙ•‘}Ñ•¡¹¥¥…¸°€‰Ñ• µ„ˆ¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è•á…ÐÁ•¹‘¥¹œÉ•Í•ÉÙ…Ñ¥½¸¥Ì¡¥‘‘•¸Õ¹Ñ¥°…ÍÍ¥¹µ•¹Ð…ÁÁÉ½Ù…°ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ‰½½­¥¹œ€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐÉ•…Ñ•€ô…Ý…¥Ð¥¹Ù½­”¡‰½½­¥¹œ¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥M¡•‘Õ±•‘	½‘ä ¤¤ì4(€½¹ÍÐ¡¥‘‘•¸€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä 4(€€€M1P©½‰}¥I=4ÁÕ‰±¥Œ¹©½‰Ì¨4(€€€€€]!I¨¹©½‰}¥ôÄ9¨¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ôÈ4(€€€€€€€99=P€‘íÁ•¹‘¥¹ÕÍÑ½µ•ÉM¡•‘Õ±•‘I•Í•ÉÙ…Ñ¥½¹MÅ° ‰¨ˆ¥õ€°4(€€€mÉ•…Ñ•¹‰½‘ä¹©½‰}¥°€‰Ñ• µ„‰t4(€€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡¡¥‘‘•¸¹É½ÝÌ¹±•¹Ñ °€À¤ì4(€½¹ÍÐ…ÁÁÉ½Ù…°€ôµ…­•ÁÁÉ½Ù…±M•ÉÙ¥”¡íô¤ì4(€…Ý…¥Ð¥¹Ù½­•ÁÁÉ½Ù…°¡…ÁÁÉ½Ù…°¹…ÁÁÉ½Ù”°É•…Ñ•¹‰½‘ä¹©½‰}¥¤ì4(€½¹ÍÐÙ¥Í¥‰±”€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä 4(€€€M1P¨¹©½‰}¥I=4ÁÕ‰±¥Œ¹©½‰Ì¨4(€€€€€]!I¨¹©½‰}¥ôÄ9€ 4(€€€€€€€€¡¨¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ôÈ99=P€‘íÁ•¹‘¥¹ÕÍÑ½µ•ÉM¡•‘Õ±•‘I•Í•ÉÙ…Ñ¥½¹MÅ° ‰¨ˆ¥ô¤4(€€€€€€€=Ha%MQL€¡M1P€ÄI=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ©„]!I©„¹©½‰}¥õ¨¹©½‰}¥9©„¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ôÈ¤4(€€€€€€¥€°4(€€€mÉ•…Ñ•¹‰½‘ä¹©½‰}¥°€‰Ñ• µ„‰t4(€€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Ù¥Í¥‰±”¹É½ÝÌ¹±•¹Ñ °€Ä¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è‘µ¥¸ÕÑ¼°M¥¹±”°Q•…´°…¹½É•ÁÉ•Í•ÉÙ”…ÍÍ¥¹µ•¹ÑÌ…¹ÍÑ…ÑÕÌˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ…Í•Ì€ôl4(€€€ì¹…µ”è€‰…ÕÑ¼ˆ°Á…Ñ èì…ÍÍ¥¹}µ½‘”è€‰…ÕÑ¼ˆô°•áÁ•Ñ•èl‰Ñ• µ„‰tô°4(€€€ì¹…µ”è€‰Í¥¹±”ˆ°Á…Ñ èì…ÍÍ¥¹}µ½‘”è€‰Í¥¹±”ˆ°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”è€‰Ñ• µ„ˆô°•áÁ•Ñ•èl‰Ñ• µ„‰tô°4(€€€ì¹…µ”è€‰Ñ•…´ˆ°Á…Ñ èì…ÍÍ¥¹}µ½‘”è€‰Ñ•…´ˆ°Ñ•…µ}µ•µ‰•ÉÌèl‰Ñ• µ„ˆ°€‰Ñ• µˆ‰tô°•áÁ•Ñ•èl‰Ñ• µ„ˆ°€‰Ñ• µˆ‰tô°4(€€€ì¹…µ”è€‰™½É•ˆ°Á…Ñ èì…ÍÍ¥¹}µ½‘”è€‰Í¥¹±”ˆ°‘¥ÍÁ…Ñ¡}µ½‘”è€‰™½É•ˆ°Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”è€‰Ñ• µ„ˆô°•áÁ•Ñ•èl‰Ñ• µ„‰tô°4(€tì4(€™½È€¡½¹ÍÐ•¹ÑÉä½˜…Í•Ì¤ì4(€€€…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡QIU9QÁÕ‰±¥Œ¹©½‰}ÁÉ½µ½Ñ¥½¹Ì°ÁÕ‰±¥Œ¹©½‰}½™™•ÉÌ°ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ°ÁÕ‰±¥Œ¹©½‰}Ñ•…µ}µ•µ‰•ÉÌ°ÁÕ‰±¥Œ¹©½‰}¥Ñ•µÌ°ÁÕ‰±¥Œ¹©½‰ÌIMQIP%9Q%QdM€¤ì4(€€€…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡QIU9QÁÕ‰±¥Œ¹Ñ•¡¹¥¥…¹}µ½¹Ñ¡±å}Ý½É­}…±•¹‘…È°(€€€€€ÁÕ‰±¥Œ¹Ñ•¡¹¥¥…¹}Í•ÉÙ¥•}µ…ÑÉ¥à°ÁÕ‰±¥Œ¹Ñ•¡¹¥¥…¹}ÁÉ½™¥±•Ì°ÁÕ‰±¥Œ¹ÕÍ•ÉÍ€¤ì(€€€…Ý…¥ÐÍ••‘Q•¡¹¥¥…¹Ì ¤ì4(€€€½¹ÍÐÍ•ÉÙ¥”€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¥¹Ù½­”¡Í•ÉÙ¥”¹¡…¹‘±•‘µ¥¹	½½­XÈ°ì4(€€€€€ÕÍÑ½µ•É}¹…µ”è‘µ¥¸€‘í•¹ÑÉä¹¹…µ•õ€°4(€€€€€ÕÍÑ½µ•É}Á¡½¹”è€ˆÀàÀÀÀÀÀÀÀÀˆ°4(€€€€€©½‰}ÑåÁ”è€‹‚â—‚æ'‚âË‚â‚æ‚â·‚â‚æ0ˆ°4(€€€€€…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”è€ˆÈÀÈØ´Àà´ÀÅPÀäèÀÀèÀÀ¬ÀÜèÀÀˆ°4(€€€€€…‘‘É•ÍÍ}Ñ•áÐè€‹‚â‚â‚âã‚â‚æ‚â_‚â{‚â¼ˆ°4(€€€€€‰½½­¥¹}µ½‘”è€‰Í¡•‘Õ±•ˆ°4(€€€€€Ñ•¡}ÑåÁ”è€‰…±°ˆ°4(€€€€€…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°4(€€€€€µ…¡¥¹•}½Õ¹Ðè€Ä°4(€€€€€Ý…Í¡}Ù…É¥…¹Ðè€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ°4(€€€€€€¸¸¹•¹ÑÉä¹Á…Ñ °4(€€€ô¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ°•¹ÑÉä¹¹…µ”¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P©½‰}ÍÑ…ÑÕÌI=4ÁÕ‰±¥Œ¹©½‰Í€¤¤¹É½ÝÍlÁt¹©½‰}ÍÑ…ÑÕÌ°)=	}MQQUL¹5%9}M!U1}A9%9¤ì4(€€€½¹ÍÐ…ÍÍ¥¹•€ô€¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1PÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”I=4ÁÕ‰±¥Œ¹©½‰}…ÍÍ¥¹µ•¹ÑÌ=IH	dÑ•¡¹¥¥…¹}ÕÍ•É¹…µ•€¤¤¹É½ÝÌ¹µ…À ¡É½Ü¤€ôøÉ½Ü¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”¤ì4(€€€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡…ÍÍ¥¹•°•¹ÑÉä¹•áÁ•Ñ•°•¹ÑÉä¹¹…µ”¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¹©½‰}¥Ñ•µÍ€¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€Ä°•¹ÑÉä¹¹…µ”¤ì4(€ô4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0è¥¹Ñ•É¹…°‰½½­¥¹œÁÉ•Í•ÉÙ•ÌÙ…±¥‘…Ñ¥½¸…¹…‘µ¥¸µ¹½Ñ¥™¥…Ñ¥½¸Í•É¥…±¥é…Ñ¥½¸ˆ°…Íå¹Œ€ ¤€ôøì4(€…Ý…¥ÐÍ••‘Q•¡¹¥¥…¹Ì ¤ì4(€½¹ÍÐÍ•ÉÙ¥”€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì ¤¤ì4(€½¹ÍÐ¥¹Ù…±¥€ô…Ý…¥Ð¥¹Ù½­”¡Í•ÉÙ¥”¹¡…¹‘±•%¹Ñ•É¹…±	½½­É½µ¤°ìÕÍÑ½µ•É}¹…µ”è€‰$ˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡¥¹Ù…±¥¹ÍÑ…ÑÕÍ½‘”°€ÐÀÀ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡¥¹Ù…±¥¹‰½‘ä¹µ¥ÍÍ¥¹}™¥•±‘Ì°l‰©½‰}ÑåÁ”ˆ°€‰…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”ˆ°€‰…‘‘É•ÍÍ}Ñ•áÐ‰t¤ì4(4(€½¹ÍÐÙ…±¥€ô…Ý…¥Ð¥¹Ù½­”¡Í•ÉÙ¥”¹¡…¹‘±•%¹Ñ•É¹…±	½½­É½µ¤°ì4(€€€ÕÍÑ½µ•É}¹…µ”è€‰$ÕÍÑ½µ•Èˆ°4(€€€ÕÍÑ½µ•É}Á¡½¹”è€ˆÀàÄÄÄÄÄÄÄÄˆ°4(€€€©½‰}ÑåÁ”è€‹‚â—‚æ'‚âË‚â‚æ‚â·‚â‚æ0ˆ°4(€€€…ÁÁ½¥¹Ñµ•¹Ñ}‘…Ñ•Ñ¥µ”è€ˆÈÀÈØ´Àà´ÀÅPÄÀèÀÀèÀÀ¬ÀÜèÀÀˆ°4(€€€…‘‘É•ÍÍ}Ñ•áÐè€‹‚â‚â‚âã‚â‚æ‚â_‚â{‚â¼ˆ°4(€€€‰½½­¥¹}µ½‘”è€‰Í¡•‘Õ±•ˆ°4(€€€Ñ•¡}ÑåÁ”è€‰…±°ˆ°4(€€€…ÍÍ¥¹}µ½‘”è€‰…ÕÑ¼ˆ°4(€€€…}ÑåÁ”è€‹‚âs‚âg‚âÇ‚âˆ°4(€€€µ…¡¥¹•}½Õ¹Ðè€Ä°4(€€€Ý…Í¡}Ù…É¥…¹Ðè€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ°4(€ô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Ù…±¥¹ÍÑ…ÑÕÍ½‘”°€ÈÀÀ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Ù…±¥¹‰½‘ä¹ÍÕ•ÍÌ°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Ù…±¥¹‰½‘ä¹…‘µ¥¹}¹½Ñ¥™¥…Ñ¥½¸¹•Ù•¹Ð°€‰¹•Ý}‰½½­¥¹}É•…Ñ•‘}™É½µ}…¤ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Ù…±¥¹‰½‘ä¹…‘µ¥¹}¹½Ñ¥™¥…Ñ¥½¸¹µ•ÍÍ…•}™¥•±‘Ì¹©½‰}¥°9Õµ‰•È¡Ù…±¥¹‰½‘ä¹©½‰}¥¤¤ì4)ô¤ì4(4)‘‰Q•ÍÐ ‰É•…°A½ÍÑÉ•ME0èÕÉ•¹ÐÑÉ…¹Í…Ñ¥½¸É½±±‰…¬±•…Ù•Ì¹¼Á…ÉÑ¥…°©½ˆ°¥Ñ•µÌ°½È½™™•ÉÌˆ°…Íå¹Œ€ ¤€ôøì4(€…Ý…¥ÐÍ••‘Q•¡¹¥¥…¹Ì ¤ì4(€½¹ÍÐÍ•ÉÙ¥”€ôÉ•…Ñ•	½½­¥¹)½‰M•ÉÙ¥”¡µ…­••Á•¹‘•¹¥•Ì¡ì4(€€€•¹ÍÕÉ•	½½­¥¹)½‰U¹¥ÑÌè…Íå¹Œ€ ¤€ôøìÑ¡É½Ü¹•ÜÉÉ½È ‰™¥áÑÕÉ”ÕÉ•¹ÐÉ½±±‰…¬ˆ¤ìô°4(€ô¤¤ì4(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¥¹Ù½­”¡Í•ÉÙ¥”¹¡…¹‘±•AÕ‰±¥	½½¬°ÁÕ‰±¥UÉ•¹Ñ	½‘ä¡ìÕÉ•¹Ñ}É•ÅÕ•ÍÑ}­•äè€‰ÕÉ•¹ÐµÁÈÈµ­•äµÉ½±±‰…¬ˆô¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÕ±Ð¹ÍÑ…ÑÕÍ½‘”°€ÔÀÀ¤ì4(€™½È€¡½¹ÍÐÑ…‰±”½˜l‰©½‰Ìˆ°€‰©½‰}¥Ñ•µÌˆ°€‰©½‰}½™™•ÉÌ‰t¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡9Õµ‰•È ¡…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡M1P=U9P ¨¤I=4ÁÕ‰±¥Œ¸‘íÑ…‰±•õ€¤¤¹É½ÝÍlÁt¹½Õ¹Ð¤°€À°Ñ…‰±”¤ì4(€ô4)ô¤ì4(