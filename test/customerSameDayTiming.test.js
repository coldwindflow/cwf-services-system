const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const jobTiming = require("../server/services/jobTiming");
const pricing = require("../server/pricing");
const customerAvailability = require("../server/services/public/customerAvailability");

const GOOD_MATRIX = { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } };
const SERVICE = { job_type: "wash", ac_type: "wall", wash_variant: "normal", btu: 9000, machine_count: 1 };

function toMin(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}

function minToHHMM(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function intervalsFromBusy(blocks, startMin, endMin, durationMin) {
  const dur = Math.max(1, Number(durationMin || 0));
  const busy = (blocks || []).slice().sort((a, b) => a.startMin - b.startMin);
  const out = [];
  let cursor = startMin;
  for (const b of busy) {
    const bs = Math.max(startMin, Number(b.startMin));
    const be = Math.min(endMin, Number(b.busyEndMin ?? b.endMin));
    if (bs - cursor >= dur) out.push({ startMin: cursor, endMin: bs - dur });
    cursor = Math.max(cursor, be);
  }
  if (endMin - cursor >= dur) out.push({ startMin: cursor, endMin: endMin - dur });
  return out;
}

function makeDeps({ nowParts, busyBlocks = [] } = {}) {
  return {
    pool: {
      async query(sql, params = []) {
        const text = String(sql);
        if (text.includes("technician_service_matrix")) {
          return { rows: [{ username: "tech-a", matrix_json: GOOD_MATRIX }] };
        }
        if (text.includes("technician_monthly_work_calendar")) {
          return {
            rows: [{
              technician_username: "tech-a",
              work_date: params[1],
              day_status: "advance_only",
              can_accept_advance_job: true,
              start_time: "09:00",
              end_time: "18:00",
              max_jobs_per_day: null,
              max_units_per_day: null,
              source: "technician_default",
            }],
          };
        }
        if (text.includes("WITH assigned AS")) return { rows: [] };
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => [{ username: "tech-a", customer_slot_visible: true }],
    listBusyBlocksForTechOnDate: async () => busyBlocks,
    buildStartIntervalsByCollision: intervalsFromBusy,
    toMin,
    minToHHMM,
    getNowBangkokParts: () => nowParts,
  };
}

test("canonical timing separates service duration and one turnaround buffer", () => {
  assert.equal(jobTiming.computeServiceDurationMinMulti({ ...SERVICE, machine_count: 1 }, { conservative: true }), 60);
  assert.equal(jobTiming.computeServiceDurationMinMulti({ ...SERVICE, machine_count: 2 }, { conservative: true }), 90);
  assert.equal(jobTiming.computeServiceDurationMinMulti({ ...SERVICE, machine_count: 3 }, { conservative: true }), 120);

  const timing = jobTiming.computeJobTiming({ ...SERVICE, machine_count: 2 }, { source: "test", conservative: true });
  assert.equal(timing.service_duration_min, 90);
  assert.equal(timing.turnaround_buffer_min, 30);
  assert.equal(timing.occupied_duration_min, 120);
  const anonymous = jobTiming.computeJobTiming({
    services: [{ ...SERVICE, assigned_technician_username: "secret-tech" }],
  }, { source: "test", conservative: true });
  assert.doesNotMatch(JSON.stringify(anonymous.breakdown), /secret-tech/);
});

test("pricing and admin/public duration wrapper use the shared timing helper without adding buffer to price", () => {
  assert.equal(pricing.computeDurationMinMulti({ ...SERVICE, machine_count: 2 }, { source: "pricing_preview", conservative: true }), 90);
  assert.equal(pricing.computeStandardPriceMulti({ ...SERVICE, machine_count: 2 }), 1200);
});

test("same-day Bangkok cutoff removes starts before the rounded next 30-minute slot", async () => {
  const base = { date: "2026-06-22", tech_type: "company", duration_min: 60, services: [SERVICE] };

  let result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    nowParts: { dateStr: "2026-06-22", hour: 12, minute: 39 },
  }), base);
  assert.equal(result.minimum_start, "13:00");
  assert.ok(result.slots.length > 0);
  assert.ok(result.slots.every((slot) => slot.start >= "13:00"));

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    nowParts: { dateStr: "2026-06-22", hour: 12, minute: 1 },
  }), base);
  assert.equal(result.minimum_start, "12:30");
  assert.ok(result.slots.every((slot) => slot.start >= "12:30"));

  result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    nowParts: { dateStr: "2026-06-22", hour: 12, minute: 30 },
  }), base);
  assert.equal(result.minimum_start, "12:30");
  assert.ok(result.slots.some((slot) => slot.start === "12:30"));
});

test("future dates still show morning slots and two-unit service displays service end only", async () => {
  const result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    nowParts: { dateStr: "2026-06-22", hour: 23, minute: 50 },
  }), {
    date: "2026-06-23",
    tech_type: "company",
    duration_min: 90,
    services: [{ ...SERVICE, machine_count: 2 }],
  });
  assert.ok(result.slots.some((slot) => slot.start === "09:00"));
  assert.ok(result.slots.some((slot) => slot.start === "16:30" && slot.end === "18:00"));
  assert.ok(result.slots.every((slot) => slot.end !== "18:30"));
});

test("busy block with buffer blocks the next start until occupied end", async () => {
  const result = await customerAvailability.computePublicCustomerSlots(makeDeps({
    nowParts: { dateStr: "2026-06-22", hour: 8, minute: 0 },
    busyBlocks: [{ startMin: toMin("16:30"), endMin: toMin("18:00"), busyEndMin: toMin("18:30") }],
  }), {
    date: "2026-06-23",
    tech_type: "company",
    duration_min: 60,
    services: [SERVICE],
  });
  assert.ok(!result.slots.some((slot) => slot.start === "18:00"));
});

test("availability endpoints are no-store and expired submit returns SLOT_IN_PAST", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(index, /Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"/);
  assert.match(index, /code: "SLOT_IN_PAST"/);
  assert.match(index, /server_now/);
  assert.match(index, /minimum_start/);
});

test("customer app disables availability HTTP cache and refreshes same-day slots", () => {
  const api = fs.readFileSync(path.join(__dirname, "..", "customer-app/modules/api.js"), "utf8");
  const availability = fs.readFileSync(path.join(__dirname, "..", "customer-app/modules/availability.js"), "utf8");
  const scheduled = fs.readFileSync(path.join(__dirname, "..", "customer-app/modules/bookingScheduled.js"), "utf8");
  assert.match(api, /cache: "no-store"/);
  assert.match(availability, /_slot_bucket/);
  assert.match(availability, /minimumStartForDate/);
  assert.match(scheduled, /5 \* 60 \* 1000/);
  assert.match(scheduled, /visibilitychange/);
});

test("customer app build and service worker cache IDs changed", () => {
  const id = "20260709_review_legacy_v1";
  for (const file of [
    "customer-app/index.html",
    "customer-app/sw.js",
    "customer-app/assets/customer-app.js",
    "customer-app/manifest.webmanifest",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(source, new RegExp(id));
  }
});
