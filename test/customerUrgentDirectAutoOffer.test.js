"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveUrgentCapability } = require("../server/services/urgent/capability");
const { createUrgentDispatchService } = require("../server/services/urgent/dispatch");
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
  assert.equal(connects, 0);
  enabled = true;
  const opened = await invoke({ booking_mode: "urgent", urgent: false });
  assert.notEqual(opened.statusCode, 503);
  assert.equal(connects, 0);
});

function dispatchFixture(overrides = {}) {
  const rows = overrides.rows || [{
    username: "ready-partner",
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
          rows: overrides.calendar === false ? [] : [{
            technician_username: "ready-partner",
            day_status: "working",
            can_accept_urgent_job: overrides.urgentDay !== false,
            start_time: overrides.calendarStart || "09:00",
            end_time: overrides.calendarEnd || "18:00",
          }],
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
  assert.match(source, /employment_type[\s\S]*='partner'/);
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
  const noMatrix = dispatchFixture({ rows: [{ ...dispatchFixture().service, username: "x", work_start: "09:00", work_end: "18:00", matrix_json: {} }] });
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
  assert.match(index, /FROM public\.job_offers[\s\S]*FOR UPDATE/);
  assert.match(index, /FROM public\.jobs WHERE job_id=\$1 FOR UPDATE/);
  assert.match(index, /INSERT INTO public\.job_assignments[\s\S]*ON CONFLICT/);
  assert.match(index, /UPDATE public\.job_offers SET status='expired' WHERE job_id=\$1 AND status='pending'/);
  const acceptRoute = index.slice(
    index.indexOf('app.post("/offers/:offer_id/accept"'),
    index.indexOf('app.post("/offers/:offer_id/time-proposal"'),
  );
  assert.ok(
    acceptRoute.indexOf('client.query("COMMIT")') < acceptRoute.indexOf("await _notifyDirectJobAssigned"),
    "accept notification must happen after commit",
  );
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
