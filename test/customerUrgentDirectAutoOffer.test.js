"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { resolveUrgentCapability } = require("../server/services/urgent/capability");
const {
  createUrgentDispatchService,
  normalizeUrgentTechType,
  isUrgentEmploymentEligible,
} = require("../server/services/urgent/dispatch");
const { createBookingJobService } = require("../server/services/booking/createBookingJob");
const urgentPublicAdapter = require("../server/services/urgentPublicAdapter");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("persisted page_availability.urgent is read on every request and needs no ENV or restart", async () => {
  let urgent = false;
  let reads = 0;
  const pool = {
    async query() {
      reads += 1;
      return { rows: [{ published_config: { page_availability: { urgent } } }] };
    },
  };
  assert.equal((await resolveUrgentCapability(pool)).enabled, false);
  urgent = true;
  assert.equal((await resolveUrgentCapability(pool)).enabled, true);
  urgent = false;
  assert.equal((await resolveUrgentCapability(pool)).enabled, false);
  assert.equal(reads, 3);
  assert.doesNotMatch(read("server/services/urgent/capability.js"), /process\.env|ENABLE_/);
});

test("urgent capability opens only for an explicitly published boolean true", async () => {
  const cases = [
    { label: "true", rows: [{ published_config: { page_availability: { urgent: true } } }], enabled: true },
    { label: "false", rows: [{ published_config: { page_availability: { urgent: false } } }], enabled: false },
    { label: "no row", rows: [], enabled: false },
    { label: "missing published", rows: [{ published_config: null }], enabled: false },
    { label: "missing page availability", rows: [{ published_config: {} }], enabled: false },
    { label: "missing urgent", rows: [{ published_config: { page_availability: { home: true } } }], enabled: false },
    { label: "null", rows: [{ published_config: { page_availability: { urgent: null } } }], enabled: false },
    { label: "string", rows: [{ published_config: { page_availability: { urgent: "true" } } }], enabled: false },
    { label: "number", rows: [{ published_config: { page_availability: { urgent: 1 } } }], enabled: false },
    { label: "array", rows: [{ published_config: { page_availability: [] } }], enabled: false },
  ];
  for (const scenario of cases) {
    const result = await resolveUrgentCapability({ query: async () => ({ rows: scenario.rows }) });
    assert.equal(result.enabled, scenario.enabled, scenario.label);
  }
  assert.equal((await resolveUrgentCapability(null)).enabled, false);
  assert.equal((await resolveUrgentCapability({ query: async () => { throw new Error("db down"); } })).enabled, false);
});

test("closed authoritative urgent switch rejects before database mutation and ignores caller flags", async () => {
  let enabled = false;
  let connects = 0;
  const service = createBookingJobService({
    pool: { async connect() { connects += 1; throw new Error("must not connect"); } },
    urgentPublicAdapter,
    isServiceZoneFilterEnabled: () => false,
    isCustomerScheduledBookingEnabled: () => true,
    resolveCustomerUrgentCapability: async () => ({ enabled }),
  });
  const invoke = async (body) => {
    const reply = { statusCode: 200, body: null };
    const res = {
      status(code) { reply.statusCode = code; return this; },
      json(value) { reply.body = value; return value; },
    };
    await service.handlePublicBook({ body }, res);
    return reply;
  };
  const closed = await invoke({ booking_mode: "urgent", urgent: true, enabled: true });
  assert.equal(closed.statusCode, 503);
  assert.equal(closed.body.code, "URGENT_BOOKING_DISABLED");
  assert.equal(connects, 0);
  enabled = true;
  const opened = await invoke({ booking_mode: "urgent", urgent: false });
  assert.notEqual(opened.statusCode, 503);
  assert.equal(connects, 0);
});

function dispatchFixture(overrides = {}) {
  const rows = overrides.rows || [{
    username: "ready-partner",
    employment_type: "partner",
    home_service_zone_code: "BKK",
    secondary_service_zone_code: null,
    allow_out_of_zone: false,
    work_start: "09:00",
    work_end: "18:00",
    weekly_off_days: "",
    matrix_json: { ok: true },
  }];
  const db = {
    async query(sql) {
      if (/FROM public\.users/.test(sql)) return { rows };
      if (/technician_monthly_work_calendar/.test(sql)) {
        return {
          rows: overrides.calendar === false ? [] : rows.map((row) => ({
            technician_username: row.username,
            day_status: "working",
            can_accept_urgent_job: overrides.urgentDay !== false,
            start_time: overrides.calendarStart || "09:00",
            end_time: overrides.calendarEnd || "18:00",
          })),
        };
      }
      if (/technician_workdays_v2/.test(sql)) return { rows: overrides.workdays || [] };
      if (/technician_special_slots_v2/.test(sql)) return { rows: overrides.special || [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const service = createUrgentDispatchService({
    pool: db,
    availabilityEngine: {
      buildCriteriaList: () => [{ job: "wash", ac: "wall", wash: "normal" }],
      validateCriteriaList: () => true,
      techMatchesAllCriteriaStrict: (matrix) => matrix?.ok === true,
      loadUrgentCapacityMap: async (_db, _date, usernames) => new Map(
        usernames.map((username) => [username, overrides.capacity !== false]),
      ),
    },
    detectServiceZoneFromText: async () => ({ service_zone_code: overrides.zone || "BKK" }),
    rankTechniciansForServiceZone: (values) => values,
    isTechFree: async () => overrides.free !== false,
    isServiceZoneFilterEnabled: () => overrides.zoneFilter !== false,
  });
  return { service, db };
}

test("canonical urgent eligibility applies ready/partner SQL, strict zone, all-line matrix, workday/window and collision", async () => {
  const source = read("server/services/urgent/dispatch.js");
  assert.match(source, /accept_status[\s\S]*='ready'/);
  assert.match(source, /accept_status_expires_at > NOW\(\)/);
  assert.doesNotMatch(source, /can_accept_advance_job/);
  assert.match(source, /techMatchesAllCriteriaStrict/);
  assert.match(source, /technician_monthly_work_calendar/);
  assert.match(source, /can_accept_urgent_job/);
  assert.match(source, /loadUrgentCapacityMap/);
  assert.match(source, /technician_workdays_v2/);
  assert.match(source, /technician_special_slots_v2/);
  assert.match(source, /isTechFree/);

  const job = {
    appointment_datetime: "2026-07-27T10:00:00+07:00",
    duration_min: 60,
    address_text: "Bangkok",
  };
  const criteriaList = [{ job: "wash", ac: "wall", wash: "normal" }];
  const good = dispatchFixture();
  assert.deepEqual((await good.service.findEligibleTechnicians(job, { db: good.db, criteriaList })).available, ["ready-partner"]);

  const wrongZone = dispatchFixture({ zone: "CNX" });
  assert.deepEqual((await wrongZone.service.findEligibleTechnicians(job, { db: wrongZone.db, criteriaList })).available, []);
  const noMatrix = dispatchFixture({ rows: [{
    username: "x", employment_type: "partner", home_service_zone_code: "BKK",
    work_start: "09:00", work_end: "18:00", matrix_json: {},
  }] });
  assert.deepEqual((await noMatrix.service.findEligibleTechnicians(job, { db: noMatrix.db, criteriaList })).available, []);
  const off = dispatchFixture({ workdays: [{ technician_username: "ready-partner", is_off: true }] });
  assert.deepEqual((await off.service.findEligibleTechnicians(job, { db: off.db, criteriaList })).available, []);
  const urgentDisabledDay = dispatchFixture({ urgentDay: false });
  assert.deepEqual((await urgentDisabledDay.service.findEligibleTechnicians(job, { db: urgentDisabledDay.db, criteriaList })).available, []);
  const outsideWindow = dispatchFixture({ calendarStart: "11:00" });
  assert.deepEqual((await outsideWindow.service.findEligibleTechnicians(job, { db: outsideWindow.db, criteriaList })).available, []);
  const capacityFull = dispatchFixture({ capacity: false });
  assert.deepEqual((await capacityFull.service.findEligibleTechnicians(job, { db: capacityFull.db, criteriaList })).available, []);
  const collision = dispatchFixture({ free: false });
  assert.deepEqual((await collision.service.findEligibleTechnicians(job, { db: collision.db, criteriaList })).available, []);
});

test("canonical dispatch preserves partner, company-compatible, all, and invalid scopes", async () => {
  const rows = [
    { username: "partner", employment_type: "partner" },
    { username: "company", employment_type: "company" },
    { username: "custom", employment_type: "custom" },
    { username: "special", employment_type: "special_only" },
  ].map((row) => ({
    ...row,
    home_service_zone_code: "BKK",
    secondary_service_zone_code: null,
    allow_out_of_zone: false,
    work_start: "09:00",
    work_end: "18:00",
    weekly_off_days: "",
    matrix_json: { ok: true },
  }));
  const fixture = dispatchFixture({ rows });
  const job = {
    appointment_datetime: "2026-07-27T10:00:00+07:00",
    duration_min: 60,
    address_text: "Bangkok",
  };
  const criteriaList = [{ job: "wash", ac: "wall", wash: "normal" }];
  const find = async (techType) => (await fixture.service.findEligibleTechnicians(
    job,
    { db: fixture.db, criteriaList, techType },
  )).available.sort();

  assert.deepEqual(await find("partner"), ["partner"]);
  assert.deepEqual(await find("company"), ["company", "custom", "special"]);
  assert.deepEqual(await find("all"), ["company", "custom", "partner", "special"]);
  assert.equal(isUrgentEmploymentEligible("partner", "company"), false);
  assert.equal(isUrgentEmploymentEligible("custom", "company"), true);
  assert.throws(() => normalizeUrgentTechType("other"), { code: "INVALID_URGENT_TECH_TYPE" });
  await assert.rejects(() => find("other"), { code: "INVALID_URGENT_TECH_TYPE" });
});

test("Bangkok weekly off is deterministic under UTC and Asia/Bangkok host timezones", async () => {
  const modulePath = path.join(ROOT, "server/services/urgent/dispatch.js");
  const probe = `
    const d = require(${JSON.stringify(modulePath)});
    process.stdout.write(JSON.stringify({
      weekday: d.bangkokWeekday("2026-07-27"),
      mondayOff: d.weeklyOff("1", "2026-07-27"),
      sundayOff: d.weeklyOff("0", "2026-07-27"),
      emptySunday: d.weeklyOff("", "2026-07-26")
    }));
  `;
  const run = (tz) => {
    const result = spawnSync(process.execPath, ["-e", probe], {
      encoding: "utf8",
      env: { ...process.env, TZ: tz },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const utc = run("UTC");
  const bangkok = run("Asia/Bangkok");
  assert.deepEqual(utc, { weekday: 1, mondayOff: true, sundayOff: false, emptySunday: false });
  assert.deepEqual(bangkok, utc);

  const job = {
    appointment_datetime: "2026-07-27T10:00:00+07:00",
    duration_min: 60,
    address_text: "Bangkok",
  };
  const criteriaList = [{ job: "wash", ac: "wall", wash: "normal" }];
  const mondayOff = dispatchFixture({ rows: [{
    username: "monday-off", employment_type: "partner", home_service_zone_code: "BKK",
    work_start: "09:00", work_end: "18:00", weekly_off_days: "1", matrix_json: { ok: true },
  }] });
  const sundayOff = dispatchFixture({ rows: [{
    username: "sunday-off", employment_type: "partner", home_service_zone_code: "BKK",
    work_start: "09:00", work_end: "18:00", weekly_off_days: "0", matrix_json: { ok: true },
  }] });
  assert.deepEqual((await mondayOff.service.findEligibleTechnicians(job, { db: mondayOff.db, criteriaList })).available, []);
  assert.deepEqual((await sundayOff.service.findEligibleTechnicians(job, { db: sundayOff.db, criteriaList })).available, ["sunday-off"]);
});

test("urgent creation, offer expiry, post-commit notification, first-wins locks and finalizer invariants are wired", () => {
  const booking = read("server/services/booking/createBookingJob.js");
  const index = read("index.js");
  const finalizer = read("server/services/urgent/finalizer.js");
  const offerInsert = booking.indexOf("INSERT INTO public.job_offers", booking.indexOf("CREATE_URGENT_OFFERS_V2"));
  const itemInsert = booking.indexOf("INSERT INTO public.job_items", offerInsert);
  const commit = booking.indexOf('client.query("COMMIT")', itemInsert);
  const notify = booking.indexOf("await _notifyUrgentOffer", commit);
  assert.ok(offerInsert > 0 && itemInsert > offerInsert && commit > itemInsert && notify > commit);
  assert.match(booking, /NOW\(\) \+ INTERVAL '10 minutes'/);
  assert.match(booking, /const urgentOfferEnabled = bm === "urgent"/);
  assert.match(booking, /JOB_STATUS\.ADMIN_URGENT_WAITING/);
  assert.match(booking, /JOB_STATUS\.URGENT_NO_TECHNICIAN/);
  assert.match(booking, /techType:\s*"all"/);
  assert.doesNotMatch(booking, /techType:\s*payloadV2\.tech_type/);
  assert.match(index, /FROM public\.job_offers[\s\S]*FOR UPDATE/);
  assert.match(index, /FROM public\.jobs WHERE job_id=\$1 FOR UPDATE/);
  assert.match(index, /INSERT INTO public\.job_assignments[\s\S]*ON CONFLICT/);
  assert.match(index, /UPDATE public\.job_offers[\s\S]*SET status='expired'[\s\S]*WHERE job_id=\$1 AND status='pending'/);
  const acceptRoute = index.slice(
    index.indexOf('app.post("/offers/:offer_id/accept"'),
    index.indexOf('app.post("/offers/:offer_id/time-proposal"'),
  );
  assert.ok(
    acceptRoute.indexOf('client.query("COMMIT")') < acceptRoute.indexOf("await _notifyDirectJobAssigned"),
    "accept notification must happen after commit",
  );
  assert.ok(
    acceptRoute.indexOf("FROM public.jobs WHERE job_id=$1 FOR UPDATE")
      < acceptRoute.indexOf("FROM public.job_offers", acceptRoute.indexOf("FROM public.jobs WHERE job_id=$1 FOR UPDATE")),
    "accept must lock the job before the offer so cancellation uses the same order",
  );
  assert.match(acceptRoute, /canceled_at[\s\S]*URGENT_JOB_NOT_ACCEPTABLE/);
  assert.match(finalizer, /status='pending'[\s\S]*expires_at >= NOW\(\)/);
  assert.match(finalizer, /status='accepted'/);
});

test("urgent customer copy exposes searching, assigned and fallback without approval/internal wording", () => {
  const copy = read("customer-app/modules/customerCopy.js");
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const tracking = read("customer-app/modules/tracking.js");
  const combined = `${copy}\n${urgent}\n${tracking}`;
  for (const text of [
    "รับคำขอแล้ว กำลังส่งงานให้ช่างที่พร้อมรับงาน",
    "กำลังค้นหาช่างที่พร้อมรับงาน",
    "ช่างรับงานแล้ว",
    "ขณะนี้ยังไม่มีช่างรับงาน คุณสามารถติดตามสถานะหรือติดต่อแอดมินได้",
  ]) assert.match(combined, new RegExp(text));
  assert.doesNotMatch(urgent, /รอแอดมินอนุมัติ|แอดมินจะเลือกช่าง|แอดมินจะส่งต่อให้ช่าง|แอดมินกำลังตรวจสอบรายละเอียด/);
});
