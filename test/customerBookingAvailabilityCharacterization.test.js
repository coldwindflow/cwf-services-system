"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const availabilityEngine = require("../server/services/booking/availabilityEngine");
const customerAvailability = require("../server/services/public/customerAvailability");
const { registerPublicCustomerAvailabilityRoutes } = require("../server/routes/public/customerAvailability");
const { registerAdminAvailabilityRoutes } = require("../server/routes/admin/adminAvailability");

const repoRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

function toMin(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function minToHHMM(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function makeEngineDeps({
  techs = [{ username: "tech-a", full_name: "Technician A", work_start: "09:00", work_end: "12:00" }],
  special = [],
  busyByTech = {},
  freeByTech = {},
} = {}) {
  return {
    pool: {
      async query(sql) {
        if (String(sql).includes("technician_special_slots_v2")) return { rows: special };
        if (String(sql).includes("FROM public.users")) {
          return { rows: techs.map((tech) => ({ username: tech.username })) };
        }
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => techs,
    buildOffMapForDate: async () => new Map(),
    isTechOffOnDate: () => false,
    buildTechWindowsMin(tech, _date, specialMap, uiStart, uiEnd) {
      const windows = [{ startMin: Math.max(uiStart, toMin(tech.work_start)), endMin: Math.min(uiEnd, toMin(tech.work_end)) }];
      for (const row of specialMap.get(tech.username) || []) {
        windows.push({ startMin: Math.max(uiStart, toMin(row.start)), endMin: Math.min(uiEnd, toMin(row.end)) });
      }
      return windows.filter((window) => window.endMin > window.startMin);
    },
    listBusyBlocksForTechOnDate: async (username) => busyByTech[username] || [],
    buildBusyIntervalsConservative: (blocks) => (blocks || []).map((block) => ({
      startMin: block.startMin,
      endMin: block.busyEndMin,
    })),
    buildFreeIntervalsForWindow(blocks, startMin, endMin) {
      if (!(blocks || []).length) return [{ startMin, endMin }];
      return [];
    },
    buildStartIntervalsByCollision(blocks, startMin, endMin, durationMin) {
      if ((blocks || []).length) return [];
      return [{ startMin, endMin: endMin - durationMin }];
    },
    isTechFree: async (username) => freeByTech[username] !== false,
    toMin,
    minToHHMM,
    fmtHHMMFromMin: minToHHMM,
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 8, mm: 5 }),
    travelBufferMin: 30,
  };
}

function makeApp() {
  const routes = new Map();
  return {
    routes,
    get(routePath, ...handlers) {
      routes.set(routePath, handlers);
    },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("public compatibility adapter re-exports the single booking availability engine", () => {
  assert.equal(customerAvailability, availabilityEngine);
  const adapterSource = read("server/services/public/customerAvailability.js");
  assert.match(adapterSource, /module\.exports = require\("\.\.\/booking\/availabilityEngine"\)/);
  assert.doesNotMatch(adapterSource, /function\s+compute|SELECT\s+/i);
});

test("route adapters contain no SQL or slot sweep calculator and index only composes them", () => {
  const publicRoute = read("server/routes/public/customerAvailability.js");
  const adminRoute = read("server/routes/admin/adminAvailability.js");
  const indexSource = read("index.js");
  for (const source of [publicRoute, adminRoute]) {
    assert.doesNotMatch(source, /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
    assert.doesNotMatch(source, /events\s*=\s*new Map|buildStartIntervalsByCollision|allSlots\.push/);
  }
  assert.match(indexSource, /registerPublicCustomerAvailabilityRoutes\(app/);
  assert.match(indexSource, /registerAdminAvailabilityRoutes\(app/);
  assert.doesNotMatch(indexSource, /app\.get\("\/public\/availability(?:_v2|_calendar_v2|)"/);
  assert.doesNotMatch(indexSource, /app\.get\("\/admin\/availability_by_tech_v2"/);
});

test("forced public-v2 compatibility path preserves field shape, slot order, and special windows", async () => {
  const result = await availabilityEngine.computeForcedAvailability(makeEngineDeps({
    special: [{ technician_username: "tech-a", start_time: "08:00", end_time: "09:00" }],
  }), {
    date: "2026-06-02",
    tech_type: "company",
    duration_min: 60,
    crew_size: 1,
    include_full: false,
    mode: "start",
    debug: false,
    preview_team: false,
    assign_mode: "auto",
  });
  assert.deepEqual(Object.keys(result), [
    "date", "tech_type", "forced", "work_start", "work_end", "travel_buffer_min",
    "duration_min", "effective_block_min", "slot_step_min", "tech_count", "crew_size",
    "mode", "slots", "debug",
  ]);
  assert.equal(result.forced, true);
  assert.equal(result.work_start, "09:00");
  assert.equal(result.work_end, "18:00");
  assert.equal(result.slots[0].start, "08:00");
  assert.equal(result.slots[0].slot_kind, "start_step");
  assert.deepEqual(Object.keys(result.slots[0]), [
    "start", "end", "available", "available_tech_ids", "capacity", "available_count", "crew_size", "slot_kind",
  ]);
  assert.deepEqual([...result.slots].map((slot) => slot.start), [...result.slots].map((slot) => slot.start).sort());
});

test("forced public-v2 empty result keeps legacy no-events response shape", async () => {
  const result = await availabilityEngine.computeForcedAvailability(makeEngineDeps({ techs: [] }), {
    date: "2026-06-02",
    tech_type: "company",
    duration_min: 60,
    crew_size: 1,
    include_full: false,
    mode: "start",
    debug: false,
  });
  assert.equal(result.tech_count, 0);
  assert.deepEqual(result.slots, []);
  assert.equal(Object.hasOwn(result, "mode"), false);
});

test("admin by-technician path preserves aliases, capacity block fields, and ordering", async () => {
  const result = await availabilityEngine.computeAdminAvailabilityByTech(makeEngineDeps({
    techs: [
      { username: "tech-a", full_name: "Technician A", work_start: "09:00", work_end: "12:00" },
      { username: "tech-b", full_name: null, work_start: "10:00", work_end: "12:00" },
    ],
    freeByTech: { "tech-a": true, "tech-b": false },
  }), {
    date: "2026-06-02",
    tech_type: "company",
    duration_min: 60,
    include_paused: true,
  });
  assert.deepEqual(Object.keys(result), [
    "date", "tech_type", "work_start", "work_end", "duration_min", "effective_block_min",
    "slot_step_min", "tech_count", "all_slots", "techs", "technicians", "slots_by_tech",
  ]);
  assert.deepEqual(Object.keys(result.all_slots[0]), ["start", "end", "service_min", "block_min"]);
  assert.deepEqual(result.technicians, [
    { username: "tech-a", full_name: "Technician A" },
    { username: "tech-b", full_name: "tech-b" },
  ]);
  assert.equal(result.slots_by_tech["tech-a"][0].available, true);
  assert.equal(result.slots_by_tech["tech-b"][0].available, false);
  assert.deepEqual(result.all_slots.map((slot) => slot.start), [...result.all_slots.map((slot) => slot.start)].sort());
});

test("legacy public availability keeps Bangkok ISO, capacity, busy count, and slot bounds", async () => {
  const seen = [];
  const deps = makeEngineDeps({
    techs: [{ username: "tech-a" }, { username: "tech-b" }],
  });
  deps.isTechFree = async (username, iso, duration) => {
    seen.push({ username, iso, duration });
    return username === "tech-a";
  };
  const result = await availabilityEngine.computeLegacyPublicAvailability(deps, {
    date: "2026-06-02",
    start: "08:00",
    end: "09:00",
    slot_min: 30,
  });
  assert.deepEqual(result, {
    date: "2026-06-02",
    start: "08:00",
    end: "09:00",
    slot_min: 30,
    tech_count: 2,
    slots: [
      { time: "08:00", available: true, capacity: 2, busy: 1 },
      { time: "08:30", available: true, capacity: 2, busy: 1 },
    ],
  });
  assert.ok(seen.every((call) => call.iso.endsWith("+07:00")));
  assert.ok(seen.every((call) => call.duration === 30));
});

test("legacy invalid numeric query behavior remains unchanged across forced, admin, and public paths", async () => {
  const deps = makeEngineDeps({ techs: [] });
  const forced = await availabilityEngine.computeForcedAvailability(deps, {
    date: "2026-06-02",
    tech_type: "company",
    duration_min: Number.NaN,
    crew_size: 1,
    include_full: false,
    mode: "start",
    debug: false,
  });
  assert.equal(forced.duration_min, 1);
  assert.equal(forced.effective_block_min, 31);

  const admin = await availabilityEngine.computeAdminAvailabilityByTech(deps, {
    date: "2026-06-02",
    tech_type: "company",
    duration_min: Number.NaN,
    include_paused: false,
  });
  assert.equal(Number.isNaN(admin.duration_min), true);
  assert.equal(admin.effective_block_min, 90);

  const legacy = await availabilityEngine.computeLegacyPublicAvailability(deps, {
    date: "2026-06-02",
    start: "08:00",
    end: "09:00",
    slot_min: Number.NaN,
  });
  assert.equal(Number.isNaN(legacy.slot_min), true);
  assert.deepEqual(legacy.slots, []);
});

test("public routes preserve scheduled, calendar, forced, legacy, cache, and error serialization", async () => {
  const app = makeApp();
  const calls = [];
  const engine = {
    async computePublicCustomerSlots(_deps, options) {
      calls.push(["scheduled", options]);
      return { date: options.date, duration_min: options.duration_min, slot_step_min: 30, slots: [] };
    },
    async computeForcedAvailability(_deps, options) {
      calls.push(["forced", options]);
      return { date: options.date, forced: true, slots: [] };
    },
    async computeCalendarSummary(_deps, options) {
      calls.push(["calendar", options]);
      return { month: options.month, days: [] };
    },
    async computeLegacyPublicAvailability(_deps, options) {
      calls.push(["legacy", options]);
      return { ...options, tech_count: 0, slots: [] };
    },
  };
  registerPublicCustomerAvailabilityRoutes(app, {
    engine,
    getDependencies: () => ({ token: "deps" }),
    isEnabled: () => true,
    getBangkokTodayYMD: () => "2026-06-02",
  });
  assert.deepEqual([...app.routes.keys()], [
    "/public/availability_v2",
    "/public/availability_calendar_v2",
    "/public/availability",
  ]);

  let res = makeResponse();
  await app.routes.get("/public/availability_v2")[0]({ query: { date: "2026-06-02", duration_min: "60" } }, res);
  assert.equal(calls.at(-1)[0], "scheduled");
  assert.equal(res.headers["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0");
  assert.deepEqual(res.body, { date: "2026-06-02", duration_min: 60, slot_step_min: 30, slots: [] });

  res = makeResponse();
  await app.routes.get("/public/availability_v2")[0]({ query: { date: "2026-06-02", forced: "1" } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "FORCED_AVAILABILITY_ADMIN_ONLY", code: "FORCED_AVAILABILITY_ADMIN_ONLY" });

  res = makeResponse();
  await app.routes.get("/public/availability_calendar_v2")[0]({ query: { month: "bad" } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "กรุณาระบุเดือนให้ถูกต้อง" });

  res = makeResponse();
  await app.routes.get("/public/availability")[0]({ query: { start: "08:00", end: "09:00" } }, res);
  assert.equal(calls.at(-1)[0], "legacy");
  assert.equal(calls.at(-1)[1].date, "2026-06-02");
});

test("admin route preserves current middleware boundary and caller evidence", () => {
  const app = makeApp();
  const requireAdminSession = () => {};
  registerAdminAvailabilityRoutes(app, {
    engine: {},
    getDependencies: () => ({}),
    isEnabled: () => true,
    requireAdminSession,
  });
  assert.equal(app.routes.get("/admin/availability_by_tech_v2").length, 2);
  assert.equal(app.routes.get("/admin/availability_by_tech_v2")[0], requireAdminSession);
  assert.equal(app.routes.get("/admin/customer-eligibility-diagnostic").length, 2);
  assert.equal(app.routes.get("/admin/customer-eligibility-diagnostic")[0], requireAdminSession);

  const adminQueue = read("admin-queue-v2.js");
  const adminAdd = read("admin-add-v2.js");
  const adminReview = read("admin-review-v2.js");
  assert.match(adminQueue, /\/admin\/availability_by_tech_v2[\s\S]*forced=1/);
  assert.doesNotMatch(adminQueue, /\/public\/availability_v2[^\n]*forced=1/);
  assert.doesNotMatch(adminAdd, /apiFetch\(`\/public\/availability_v2/);
  assert.match(adminAdd, /\/admin\/availability_by_tech_v2/);
  assert.match(adminReview, /\/public\/availability_v2/);
});
