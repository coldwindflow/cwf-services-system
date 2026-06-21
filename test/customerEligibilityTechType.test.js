const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const customerAvailability = require("../server/services/public/customerAvailability");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");
}

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

// ---- Shared fake deps for the eligibility engine ----
function makeDeps({ techs = [], matrix = {}, calendar = {}, usage = {}, busy = [] } = {}) {
  const pool = {
    async query(sql, params) {
      if (/technician_service_matrix/.test(sql)) {
        return { rows: Object.entries(matrix).map(([username, matrix_json]) => ({ username, matrix_json })) };
      }
      if (/technician_monthly_work_calendar/.test(sql)) {
        const date = (params && params[1]) || null;
        return { rows: Object.entries(calendar).map(([technician_username, row]) => ({ technician_username, work_date: date, ...row })) };
      }
      if (/item_units|assigned AS/.test(sql)) {
        return { rows: Object.entries(usage).map(([technician_username, u]) => ({ technician_username, jobs_count: u.jobs_count, units_count: u.units_count })) };
      }
      return { rows: [] };
    },
  };
  return {
    pool,
    db: pool,
    listTechniciansByType: async () => techs,
    toMin: (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h * 60) + m; },
    minToHHMM: (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
    listBusyBlocksForTechOnDate: async () => busy,
    buildStartIntervalsByCollision: (blocks, startMin, endMin, dur) => (
      (endMin - startMin) >= dur ? [{ startMin, endMin: endMin - dur }] : []
    ),
    buildTechWindowsMin: () => [],
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 0, mm: 0 }),
  };
}

const CRITERIA = { date: "2026-06-22", tech_type: "all", duration_min: 90, job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ธรรมดา" };
const GOOD_MATRIX = { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } };
const GOOD_CAL = { day_status: "advance_only", can_accept_advance_job: true, start_time: "09:00", end_time: "18:00", max_jobs_per_day: 5, max_units_per_day: 10 };

// ============ Defect 1: all admin-enabled employment types eligible ============
test("Defect 1: visible PARTNER technician can produce scheduled customer slots (tech_type=all)", async () => {
  const deps = makeDeps({
    techs: [{ username: "p1", employment_type: "partner", customer_slot_visible: true }],
    matrix: { p1: GOOD_MATRIX },
    calendar: { p1: GOOD_CAL },
  });
  const eligible = await customerAvailability.eligibleCustomerTechnicians(deps, { ...CRITERIA });
  assert.deepEqual(eligible.map((t) => t.username), ["p1"]);
});

test("Defect 1: visible COMPANY technician also eligible under tech_type=all", async () => {
  const deps = makeDeps({
    techs: [{ username: "c1", employment_type: "company", customer_slot_visible: true }],
    matrix: { c1: GOOD_MATRIX },
    calendar: { c1: GOOD_CAL },
  });
  const eligible = await customerAvailability.eligibleCustomerTechnicians(deps, { ...CRITERIA });
  assert.deepEqual(eligible.map((t) => t.username), ["c1"]);
});

test("Customer frontend queries use tech_type=all, never hardcoded company", () => {
  const availability = read("customer-app/modules/availability.js");
  assert.match(availability, /tech_type:\s*"all"/);
  assert.doesNotMatch(availability, /tech_type:\s*"company"/);
  const state = read("customer-app/modules/state.js");
  assert.match(state, /tech_type:\s*"all"/);
  assert.doesNotMatch(state, /tech_type:\s*"company"/);
});

test("Customer App V2 scheduled booking requests tech_type=all server-side", () => {
  const index = read("index.js");
  const booking = section(index, 'app.post("/public/book"', 'app.get("/public/track"');
  assert.match(booking, /clientApp === "customer_app_v2" \? "all" : "company"/);
});

// ============ Defect 2/3: explicit visibility, fail-closed ============
test("Invisible technician is excluded (visibility=false)", async () => {
  const deps = makeDeps({
    techs: [{ username: "x", employment_type: "partner", customer_slot_visible: false }],
    matrix: { x: GOOD_MATRIX },
    calendar: { x: GOOD_CAL },
  });
  const eligible = await customerAvailability.eligibleCustomerTechnicians(deps, { ...CRITERIA });
  assert.deepEqual(eligible, []);
});

test("Null/unset visibility is excluded (fail-closed)", async () => {
  const deps = makeDeps({
    techs: [{ username: "x", employment_type: "company", customer_slot_visible: null }],
    matrix: { x: GOOD_MATRIX },
    calendar: { x: GOOD_CAL },
  });
  const eligible = await customerAvailability.eligibleCustomerTechnicians(deps, { ...CRITERIA });
  assert.deepEqual(eligible, []);
});

test("Admin visibility UI only checks when value is strictly true; save verifies read-back", () => {
  const adminJs = read("admin-technicians-v2.js");
  assert.match(adminJs, /const sv = \(t\.customer_slot_visible === true\)/);
  assert.match(adminJs, /persistedVisible !== payload\.customer_slot_visible/);
  const index = read("index.js");
  assert.match(index, /RETURNING username, employment_type, customer_slot_visible/);
});

// ============ Defect 7: admin-only eligibility diagnostic ============
test("Diagnostic: fully-configured visible partner reports AVAILABLE with all gates true", async () => {
  const deps = makeDeps({
    techs: [{ username: "p1", employment_type: "partner", customer_slot_visible: true }],
    matrix: { p1: GOOD_MATRIX },
    calendar: { p1: GOOD_CAL },
  });
  const r = await customerAvailability.diagnoseTechnicianEligibility(deps, { username: "p1", ...CRITERIA });
  assert.equal(r.reason, "AVAILABLE");
  assert.equal(r.gates.final_eligible, true);
  assert.equal(r.gates.explicit_visible, true);
  assert.equal(r.gates.matrix_matched, true);
  assert.equal(r.gates.advance_enabled, true);
  assert.equal(r.gates.collision_ok, true);
});

test("Diagnostic pinpoints NOT_CUSTOMER_VISIBLE gate", async () => {
  const deps = makeDeps({
    techs: [{ username: "p1", employment_type: "partner", customer_slot_visible: null }],
    matrix: { p1: GOOD_MATRIX },
    calendar: { p1: GOOD_CAL },
  });
  const r = await customerAvailability.diagnoseTechnicianEligibility(deps, { username: "p1", ...CRITERIA });
  assert.equal(r.reason, "NOT_CUSTOMER_VISIBLE");
  assert.equal(r.gates.account_exists, true);
  assert.equal(r.gates.explicit_visible, false);
  assert.equal(r.gates.final_eligible, false);
});

test("Diagnostic pinpoints NO_ADVANCE_CALENDAR_ROW gate", async () => {
  const deps = makeDeps({
    techs: [{ username: "p1", employment_type: "partner", customer_slot_visible: true }],
    matrix: { p1: GOOD_MATRIX },
    calendar: {},
  });
  const r = await customerAvailability.diagnoseTechnicianEligibility(deps, { username: "p1", ...CRITERIA });
  assert.equal(r.reason, "NO_ADVANCE_CALENDAR_ROW");
  assert.equal(r.gates.matrix_matched, true);
  assert.equal(r.gates.calendar_row_exists, false);
});

test("Diagnostic pinpoints ADVANCE_CLOSED gate", async () => {
  const deps = makeDeps({
    techs: [{ username: "p1", employment_type: "partner", customer_slot_visible: true }],
    matrix: { p1: GOOD_MATRIX },
    calendar: { p1: { ...GOOD_CAL, can_accept_advance_job: false } },
  });
  const r = await customerAvailability.diagnoseTechnicianEligibility(deps, { username: "p1", ...CRITERIA });
  assert.equal(r.reason, "ADVANCE_CLOSED");
  assert.equal(r.gates.calendar_row_exists, true);
  assert.equal(r.gates.advance_enabled, false);
});

test("Diagnostic pinpoints unknown technician", async () => {
  const deps = makeDeps({ techs: [] });
  const r = await customerAvailability.diagnoseTechnicianEligibility(deps, { username: "ghost", ...CRITERIA });
  assert.equal(r.reason, "TECHNICIAN_NOT_FOUND");
  assert.equal(r.gates.account_exists, false);
});

test("Diagnostic route is admin-only and never public", () => {
  const index = read("index.js");
  assert.match(index, /app\.get\("\/admin\/customer-eligibility-diagnostic", requireAdminSession/);
  // The diagnostic must not be wired under any /public/ path.
  assert.doesNotMatch(index, /\/public\/[a-z-]*eligibility-diagnostic/);
});

// ============ Defect 4/6: technician calendar identity ============
test("Technician calendar uses session endpoints only (no username-keyed admin route)", () => {
  const appJs = read("app.js");
  const fn = section(appJs, "function cwfCalendarApi", "function cwfDefaultCalendarItem");
  assert.match(fn, /\/tech\/work-calendar\$\{path\}/);
  assert.doesNotMatch(fn, /work-calendar-v2/);
  // Session copy endpoint exists server-side.
  const index = read("index.js");
  assert.match(index, /app\.post\('\/tech\/work-calendar\/copy-previous-month', requireTechnicianSession/);
});

test("Technician calendar reloads from server after save (no submitted-payload paint)", () => {
  const appJs = read("app.js");
  const save = section(appJs, "async function saveCalendarDays", "function buildDayPayload");
  // single -> /day, many -> /bulk; never /batch
  assert.match(save, /single \? '\/day' : '\/bulk'/);
  assert.doesNotMatch(save, /\/batch/);
});
