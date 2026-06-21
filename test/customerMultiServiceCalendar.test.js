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

test("calendar summary contains only date availability and first available start", async () => {
  const deps = {
    pool: {
      async query(sql) {
        if (String(sql).includes("technician_service_matrix")) return { rows: [{ username: "tech-a", matrix_json: { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } } }] };
        if (String(sql).includes("technician_special_slots_v2")) return { rows: [] };
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => [{ username: "tech-a", customer_slot_visible: true, work_start: "09:00", work_end: "10:00", weekly_off_days: "" }],
    buildOffMapForDate: async () => new Map(),
    isTechOffOnDate: () => false,
    buildTechWindowsMin: () => [{ startMin: 540, endMin: 600 }],
    listBusyBlocksForTechOnDate: async () => [],
    buildStartIntervalsByCollision: () => [{ startMin: 540, endMin: 540 }],
    toMin(value) {
      const [h, m] = value.split(":").map(Number);
      return h * 60 + m;
    },
    minToHHMM(value) {
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    },
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 8, mm: 0 }),
  };
  const summary = await customerAvailability.computeCalendarSummary(deps, {
    month: "2026-06",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  });
  assert.equal(summary.month, "2026-06");
  assert.equal(summary.days[0].date, "2026-06-01");
  assert.equal(summary.days[0].available, true);
  assert.equal(summary.days[0].first_available, "09:00");
  assert.deepEqual(Object.keys(summary.days[0]).sort(), ["available", "date", "first_available"]);
});
