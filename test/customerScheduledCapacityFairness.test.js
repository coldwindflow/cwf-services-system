const test = require("node:test");
const assert = require("node:assert/strict");

const customerAvailability = require("../server/services/public/customerAvailability");
const {
  normWorkDayPayload,
  resolveTechnicianCalendarCaps,
  sourceForWorkDayPayload,
} = require("../server/lib/technicianCalendar");
const {
  rankCustomerScheduledCandidates,
} = require("../server/services/public/customerScheduledAssignment");

const GOOD_MATRIX = { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } };
const CRITERIA = {
  date: "2026-06-22",
  tech_type: "company",
  duration_min: 60,
  services: [{ job_type: "wash", ac_type: "wall", wash_variant: "normal", machine_count: 1 }],
};

function intervalsFromBusy(blocks, startMin, endMin, durationMin) {
  const dur = Math.max(1, Number(durationMin || 0));
  const busy = (blocks || []).slice().sort((a, b) => a.startMin - b.startMin);
  const out = [];
  let cursor = startMin;
  for (const b of busy) {
    const bs = Math.max(startMin, Number(b.startMin));
    const be = Math.min(endMin, Number(b.endMin));
    if (bs - cursor >= dur) out.push({ startMin: cursor, endMin: bs - dur });
    cursor = Math.max(cursor, be);
  }
  if (endMin - cursor >= dur) out.push({ startMin: cursor, endMin: endMin - dur });
  return out;
}

function makeDeps({ calendar = {}, usage = {}, busyByTech = {} } = {}) {
  const techs = Object.keys(calendar).length ? Object.keys(calendar) : ["tech-a"];
  return {
    pool: {
      async query(sql, params = []) {
        const text = String(sql);
        if (text.includes("technician_service_matrix")) {
          return { rows: techs.map((username) => ({ username, matrix_json: GOOD_MATRIX })) };
        }
        if (text.includes("technician_monthly_work_calendar")) {
          const date = params[1];
          return { rows: techs.map((technician_username) => ({
            technician_username,
            work_date: date,
            day_status: "advance_only",
            can_accept_advance_job: true,
            start_time: "09:00",
            end_time: "18:00",
            max_jobs_per_day: calendar[technician_username]?.max_jobs_per_day ?? null,
            max_units_per_day: calendar[technician_username]?.max_units_per_day ?? null,
            source: calendar[technician_username]?.source ?? null,
          })) };
        }
        if (text.includes("WITH assigned AS")) {
          return { rows: Object.entries(usage).map(([technician_username, u]) => ({ technician_username, ...u })) };
        }
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => techs.map((username) => ({ username, customer_slot_visible: true })),
    listBusyBlocksForTechOnDate: async (username) => busyByTech[username] || [],
    buildStartIntervalsByCollision: intervalsFromBusy,
    toMin(value) {
      const [h, m] = String(value).split(":").map(Number);
      return h * 60 + m;
    },
    minToHHMM(value) {
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    },
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 8, mm: 0 }),
  };
}

test("cap policy resolves null/default, legacy 1/5, and custom 1/5 correctly", () => {
  const open = normWorkDayPayload({ can_accept_advance_job: true });
  assert.equal(open.max_jobs_per_day, null);
  assert.equal(open.max_units_per_day, null);
  assert.equal(sourceForWorkDayPayload(open), "technician_default");
  assert.deepEqual(resolveTechnicianCalendarCaps(open), {
    cap_mode: "system_default",
    raw_max_jobs: null,
    raw_max_units: null,
    effective_max_jobs: 4,
    effective_max_units: null,
    is_legacy_system_default: false,
  });

  const capped = normWorkDayPayload({ can_accept_advance_job: true, max_jobs_per_day: 1, max_units_per_day: 1 });
  assert.equal(capped.max_jobs_per_day, 1);
  assert.equal(capped.max_units_per_day, 1);
  assert.equal(sourceForWorkDayPayload(capped), "technician_custom");
  assert.equal(resolveTechnicianCalendarCaps({ source: "technician", max_jobs_per_day: 1, max_units_per_day: 5 }).cap_mode, "legacy_system_default");
  assert.equal(resolveTechnicianCalendarCaps({ source: "technician", max_jobs_per_day: 1, max_units_per_day: 5 }).effective_max_jobs, 4);
  assert.equal(resolveTechnicianCalendarCaps({ source: "technician", max_jobs_per_day: 1, max_units_per_day: 5 }).effective_max_units, null);
  const custom = resolveTechnicianCalendarCaps({ source: "technician_custom", max_jobs_per_day: 1, max_units_per_day: 5 });
  assert.equal(custom.cap_mode, "technician_custom");
  assert.equal(custom.effective_max_jobs, 1);
  assert.equal(custom.effective_max_units, 5);
});

test("system default allows up to four jobs, while explicit caps still apply", async () => {
  let result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": { max_jobs_per_day: null, max_units_per_day: null } },
    usage: { "tech-a": { jobs_count: 3, units_count: 9 } },
  }), CRITERIA);
  assert.ok(result.slots.length > 0);

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": { source: "technician", max_jobs_per_day: 1, max_units_per_day: 5 } },
    usage: { "tech-a": { jobs_count: 1, units_count: 99 } },
  }), CRITERIA);
  assert.ok(result.slots.length > 0);

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": { max_jobs_per_day: null, max_units_per_day: null } },
    usage: { "tech-a": { jobs_count: 4, units_count: 1 } },
  }), CRITERIA);
  assert.equal(result.reason_code, "CAPACITY_FULL");

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": { source: "technician_custom", max_jobs_per_day: 1, max_units_per_day: null } },
    usage: { "tech-a": { jobs_count: 1, units_count: 1 } },
  }), CRITERIA);
  assert.equal(result.reason_code, "CAPACITY_FULL");

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": { source: "technician_custom", max_jobs_per_day: null, max_units_per_day: 2 } },
    usage: { "tech-a": { jobs_count: 0, units_count: 1 } },
  }), { ...CRITERIA, services: [{ ...CRITERIA.services[0], machine_count: 2 }] });
  assert.equal(result.reason_code, "CAPACITY_FULL");
});

test("busy afternoon leaves morning slots and busy morning leaves afternoon slots", async () => {
  const morning = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": {} },
    busyByTech: { "tech-a": [{ startMin: 13 * 60, endMin: 18 * 60 }] },
  }), CRITERIA);
  assert.ok(morning.slots.some((s) => s.start === "09:00"));

  const afternoon = await customerAvailability.computePublicCustomerSlots(makeDeps({
    calendar: { "tech-a": {} },
    busyByTech: { "tech-a": [{ startMin: 9 * 60, endMin: 12 * 60 }] },
  }), CRITERIA);
  assert.ok(afternoon.slots.some((s) => s.start === "12:00" || s.start === "12:30"));
});

test("duration controls slot visibility inside real gaps", async () => {
  const deps = makeDeps({
    calendar: { "tech-a": {} },
    busyByTech: { "tech-a": [{ startMin: 10 * 60, endMin: 18 * 60 }] },
  });
  const sixty = await customerAvailability.computePublicCustomerSlots(deps, { ...CRITERIA, duration_min: 60 });
  assert.ok(sixty.slots.some((s) => s.start === "09:00"));

  const twoHours = await customerAvailability.computePublicCustomerSlots(deps, { ...CRITERIA, duration_min: 120 });
  assert.equal(twoHours.slots.length, 0);
  assert.equal(twoHours.reason_code, "COLLISION_FULL");
});

test("technician UI disables locked date editing and separates job/unit overrides", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app, /editBtn\.disabled = locked/);
  assert.match(app, /workDayJobLimitEnabled/);
  assert.match(app, /workDayUnitLimitEnabled/);
  assert.match(app, /bulkDayJobLimitEnabled/);
  assert.match(app, /bulkDayUnitLimitEnabled/);
});

test("calendar read API exposes trusted cap metadata while public slots stay anonymous", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const readRoute = fs.readFileSync(path.join(__dirname, "..", "server/routes/technicianCalendarReadOnly.js"), "utf8");
  const publicAdapter = fs.readFileSync(path.join(__dirname, "..", "server/services/public/customerAvailability.js"), "utf8");
  const publicSvc = fs.readFileSync(path.join(__dirname, "..", "server/services/booking/availabilityEngine.js"), "utf8");
  assert.match(readRoute, /resolveTechnicianCalendarCaps/);
  assert.match(readRoute, /cap_mode/);
  assert.match(readRoute, /effective_max_jobs_per_day/);
  assert.match(readRoute, /effective_max_units_per_day/);
  assert.match(publicSvc, /resolveTechnicianCalendarCaps/);
  assert.match(publicAdapter, /require\("\.\.\/booking\/availabilityEngine"\)/);
  const slotPush = publicSvc.match(/slots\.push\(\{[\s\S]*?\n\s*\}\);/);
  assert.ok(slotPush, "public slot push block exists");
  assert.doesNotMatch(slotPush[0], /username|technician/i);
});

test("fair assignment ranking prioritizes projected minutes, older auto assignment, and non-username rotation", () => {
  let ranked = rankCustomerScheduledCandidates([
    { username: "a-user", scheduled_minutes: 120, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 0 },
    { username: "z-user", scheduled_minutes: 30, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 0 },
  ], { date: "2026-06-22", start: "09:00", duration_min: 60 });
  assert.equal(ranked[0].username, "z-user");

  ranked = rankCustomerScheduledCandidates([
    { username: "newer", scheduled_minutes: 0, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 200 },
    { username: "older", scheduled_minutes: 0, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 100 },
  ], { date: "2026-06-22", start: "09:00", duration_min: 60 });
  assert.equal(ranked[0].username, "older");

  const base = [
    { username: "alice", scheduled_minutes: 0, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 0 },
    { username: "bob", scheduled_minutes: 0, jobs_count: 0, units_count: 0, previous_job_end_min: -1, last_auto_assign_ms: 0 },
  ];
  const firstA = rankCustomerScheduledCandidates(base, { date: "2026-06-22", start: "09:00", duration_min: 60 })[0].username;
  const firstB = rankCustomerScheduledCandidates(base, { date: "2026-06-22", start: "10:00", duration_min: 60 })[0].username;
  assert.notEqual(firstA, firstB);
});
