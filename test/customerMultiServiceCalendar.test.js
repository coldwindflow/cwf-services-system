const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "index.js"), "utf8").replace(/\r\n/g, "\n");
const customerAvailability = require("../server/services/public/customerAvailability");

function section(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test("calendar route is public-safe and mounted through shared availability helper", () => {
  const calendar = section('app.get("/public/availability_calendar_v2"', '// Admin: availability by technician');
  assert.match(calendar, /customerAvailability\.computeCalendarSummary/);
  assert.doesNotMatch(calendar, /username|technician_name|technician_id|tech_count|available_count|capacity|matrix_json/);
  assert.match(calendar, /month/);
  assert.match(calendar, /duration_min/);
});

test("public availability and public booking share the customer availability helper", () => {
  const availability = section('app.get("/public/availability_v2"', 'app.get("/public/availability_calendar_v2"');
  const booking = section('app.post("/public/book"', 'app.get("/public/track"');
  assert.match(availability, /customerAvailability\.computePublicCustomerSlots/);
  assert.match(booking, /customerAvailability\.hasAvailableStart/);
  assert.match(booking, /customerAvailability\.reservePublicCustomerTechnician/);
  assert.match(booking, /technician_username/);
  assert.match(booking, /job_status='รอตรวจสอบ'|VALUES \([\s\S]*'รอตรวจสอบ'/);
});

test("public book validates and persists allow_time_proposal as a jobs column", () => {
  const booking = section('app.post("/public/book"', 'app.get("/public/track"');
  assert.match(booking, /allow_time_proposal/);
  assert.match(booking, /allowTimeProposal == null/);
  assert.match(booking, /booking_mode, allow_time_proposal\)/);
  assert.match(booking, /\$13,\$15\)/);
  assert.match(booking, /allowTimeProposal/);
  assert.doesNotMatch(booking, /customer_note\s*[:=][\s\S]{0,200}allowTimeProposal/);
});

test("helper rejects incomplete multi-service criteria", () => {
  const list = customerAvailability.buildCriteriaList({
    services: [
      { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" },
      { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "" },
    ],
  });
  assert.equal(customerAvailability.validateCriteriaList(list), false);
});

test("helper requires one technician matrix to support every selected service line", () => {
  const list = customerAvailability.buildCriteriaList({
    services: [
      { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" },
      { job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม" },
      { job_type: "ล้าง", ac_type: "สี่ทิศทาง", wash_variant: "" },
    ],
  });
  assert.equal(customerAvailability.validateCriteriaList(list), true);
  assert.equal(customerAvailability.techMatchesAllCriteriaStrict({
    job_types: { wash: true },
    ac_types: { wall: true, fourway: true },
    wash_wall_variants: { normal: true, premium: false },
  }, list), false);
  assert.equal(customerAvailability.techMatchesAllCriteriaStrict({
    job_types: { wash: true },
    ac_types: { wall: true, fourway: true },
    wash_wall_variants: { normal: true, premium: true },
  }, list), true);
});

function makeAvailabilityDeps({ calendar = true, usage = {}, matrix, busyBlocks = [] } = {}) {
  return {
    pool: {
      async query(sql, params = []) {
        const text = String(sql);
        if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (text.includes("technician_service_matrix")) {
          return { rows: [{ username: "tech-a", matrix_json: matrix || { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } } }] };
        }
        if (text.includes("technician_monthly_work_calendar")) {
          if (!calendar) return { rows: [] };
          return { rows: [{
            technician_username: "tech-a",
            work_date: params[1],
            day_status: "available",
            can_accept_advance_job: calendar === "false" ? false : true,
            start_time: "09:00",
            end_time: "12:00",
            max_jobs_per_day: calendar?.max_jobs_per_day ?? 2,
            max_units_per_day: calendar?.max_units_per_day ?? 4,
          }] };
        }
        if (text.includes("WITH assigned AS")) {
          return { rows: usage.rows || [] };
        }
        if (text.includes("technician_special_slots_v2")) return { rows: [] };
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => [{ username: "tech-a", customer_slot_visible: true, work_start: "09:00", work_end: "12:00", weekly_off_days: "" }],
    buildOffMapForDate: async () => new Map(),
    isTechOffOnDate: () => false,
    buildTechWindowsMin: () => [{ startMin: 540, endMin: 720 }],
    listBusyBlocksForTechOnDate: async () => busyBlocks,
    buildStartIntervalsByCollision: (blocks, startMin, endMin, durationMin) => {
      if ((blocks || []).length) return [];
      return [{ startMin, endMin: endMin - durationMin }];
    },
    toMin(value) {
      const [h, m] = value.split(":").map(Number);
      return h * 60 + m;
    },
    minToHHMM(value) {
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    },
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 8, mm: 0 }),
  };
}

test("calendar summary contains only date availability and first available start", async () => {
  const deps = makeAvailabilityDeps();
  const summary = await customerAvailability.computeCalendarSummary(deps, {
    month: "2026-06",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  });
  assert.equal(summary.month, "2026-06");
  assert.equal(summary.days[0].date, "2026-06-01");
  assert.equal(summary.days[0].available, true);
  assert.equal(summary.days[0].status, "available");
  assert.equal(summary.days[0].reason_code, "AVAILABLE");
  assert.equal(summary.days[0].first_available, "09:00");
  assert.deepEqual(Object.keys(summary.days[0]).sort(), ["available", "date", "first_available", "reason_code", "status"]);
});

test("monthly advance calendar is required for customer slots", async () => {
  const base = {
    date: "2026-06-02",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  };
  let result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({ calendar: true }), base);
  assert.ok(result.slots.length > 0);

  result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({ calendar: false }), base);
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "no_open_slots");
  assert.equal(result.reason_code, "NO_ADVANCE_CALENDAR_ROW");

  result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({ calendar: "false" }), base);
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "no_open_slots");
  assert.equal(result.reason_code, "ADVANCE_CLOSED");
});

test("advance calendar daily job and unit caps block public slots", async () => {
  const base = {
    date: "2026-06-02",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", machine_count: 2 }],
  };
  let result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({
    calendar: { max_jobs_per_day: 1, max_units_per_day: 4 },
    usage: { rows: [{ technician_username: "tech-a", jobs_count: 1, units_count: 1 }] },
  }), base);
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "full");
  assert.equal(result.reason_code, "CAPACITY_FULL");

  result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({
    calendar: { max_jobs_per_day: 2, max_units_per_day: 2 },
    usage: { rows: [{ technician_username: "tech-a", jobs_count: 0, units_count: 1 }] },
  }), base);
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "full");
  assert.equal(result.reason_code, "CAPACITY_FULL");
});

test("collision-only unavailable slots are marked full", async () => {
  const result = await customerAvailability.computePublicCustomerSlots(makeAvailabilityDeps({
    busyBlocks: [{ startMin: 540, endMin: 720 }],
  }), {
    date: "2026-06-02",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", machine_count: 1 }],
  });
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "full");
  assert.equal(result.reason_code, "COLLISION_FULL");
});

test("draft reservation uses advisory lock, rechecks exact slot, and picks anonymous technician", async () => {
  const picked = await customerAvailability.reservePublicCustomerTechnician({
    ...makeAvailabilityDeps(),
    db: makeAvailabilityDeps().pool,
  }, {
    date: "2026-06-02",
    start: "09:00",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  });
  assert.equal(picked.jobs_count, 0);
  assert.equal(picked.units_count, 0);
  assert.equal(picked.scheduled_minutes, 0);
  assert.equal(picked.username, "tech-a");
});

test("stale requested slot returns 409 during draft reservation", async () => {
  await assert.rejects(
    customerAvailability.reservePublicCustomerTechnician({
      ...makeAvailabilityDeps({ busyBlocks: [{ startMin: 540, endMin: 600 }] }),
      db: makeAvailabilityDeps({ busyBlocks: [{ startMin: 540, endMin: 600 }] }).pool,
    }, {
      date: "2026-06-02",
      start: "09:00",
      duration_min: 60,
      tech_type: "company",
      services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
    }),
    (err) => err && err.status === 409 && err.message === "CUSTOMER_SLOT_STALE"
  );
});

test("technician draft jobs are locked in backend workflow before approval", () => {
  assert.match(source, /TECHNICIAN_DRAFT_JOB_LOCKED/);
  assert.match(source, /ร่างงาน — รอแอดมินอนุมัติ/);
  assert.match(source, /assertJobActionableForTechnician\(pool, realId\)/);
  assert.match(source, /assertJobActionableForTechnician\(client, realId\)/);
});

test("admin review displays and preselects the draft technician reservation", () => {
  const adminReview = fs.readFileSync(path.join(repoRoot, "admin-review-v2.js"), "utf8");
  assert.match(adminReview, /ร่างจองช่าง/);
  assert.match(adminReview, /CURRENT\.technician_username/);
  assert.match(adminReview, /currentPrimary = CURRENT\?\.technician_username \|\| primarySel\.value/);
  assert.match(adminReview, /function technicianTypeForUsername/);
  assert.match(adminReview, /draftType \|\| \(\(CURRENT\.booking_mode === "urgent"\) \? "partner" : "company"\)/);
});

test("dispatch_v2 refreshes technician income preview after forced approval", () => {
  assert.match(source, /app\.post\("\/jobs\/:job_id\/dispatch_v2"[\s\S]*await client\.query\('COMMIT'\);[\s\S]*_refreshTechnicianIncomePreviewForJob\(job_id,\s*safeTeam,\s*\{ source: 'job_preview' \}\)/);
});

test("technician UI marks draft jobs read-only", () => {
  const app = fs.readFileSync(path.join(repoRoot, "app.js"), "utf8");
  assert.match(app, /ร่างงาน — รอแอดมินอนุมัติ/);
  assert.match(app, /workflowDisabled = isDraftJob \|\| historyMode/);
  assert.match(app, /isDraftJob[\s\S]*โทรลูกค้า[\s\S]*disabled/);
});

test("repair matrix round-trip includes repair variants and preserves unknown keys", () => {
  const adminTech = fs.readFileSync(path.join(repoRoot, "admin-technicians-v2.js"), "utf8");
  const adminHtml = fs.readFileSync(path.join(repoRoot, "admin-technicians-v2.html"), "utf8");
  assert.match(adminHtml, /cap_repair_leak_check/);
  assert.match(adminHtml, /cap_repair_inspection/);
  assert.match(adminHtml, /cap_repair_parts/);
  assert.match(adminHtml, /cap_repair_general/);
  assert.match(adminTech, /repair_variants/);
  assert.match(adminTech, /\.\.\.\(currentMatrix && typeof currentMatrix === 'object' \? currentMatrix : \{\}\)/);
});
