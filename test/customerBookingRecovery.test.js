const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");
const customerAvailability = require("../server/services/public/customerAvailability");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeContext() {
  const storage = new Map();
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://app.example.test", pathname: "/customer-app/index.html", search: "", hash: "" },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    addEventListener() {},
  };
  const context = {
    window,
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      querySelectorAll() { return []; },
      getElementById() { return null; },
    },
    history: { replaceState() {} },
    URL,
    URLSearchParams,
    Intl,
    Date,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return fn(); },
    fetch: async () => ({ ok: true, text: async () => "{}" }),
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function load(context, modules) {
  for (const modulePath of modules) {
    vm.runInContext(read(modulePath), context, { filename: modulePath });
  }
  return context.window.CWFCustomerAppV2;
}

const FRONTEND_MODULES = [
  "customer-app/modules/utils.js",
  "customer-app/modules/customerCopy.js",
  "customer-app/modules/state.js",
  "customer-app/modules/api.js",
  "customer-app/modules/services.js",
  "customer-app/modules/ui.js",
  "customer-app/modules/auth.js",
  "customer-app/modules/availability.js",
  "customer-app/modules/bookingScheduled.js",
  "customer-app/modules/bookingUrgent.js",
  "customer-app/modules/router.js",
];

class WizardContainer {
  constructor() {
    this._innerHTML = "";
    this.buttons = [];
  }
  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.buttons = [];
    [...this._innerHTML.matchAll(/data-action="([^"]+)"/g)].forEach((m) => this.buttons.push({ attr: m[1] }));
  }
  get innerHTML() { return this._innerHTML; }
  scrollIntoView() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

// Persist a scheduled draft at a given step using a throwaway state load, then return a fresh
// frontend whose state.init() restores it — exactly the "reload into Step N" production path.
function restoreFrontendAtStep(step, draftPatch = {}) {
  const context = makeContext();
  let root = load(context, ["customer-app/modules/state.js"]);
  if (Object.keys(draftPatch).length) root.state.updateDraft("scheduled", draftPatch);
  root.state.setScheduledWizard({ step });

  context.window.CWFCustomerAppV2 = {};
  root = load(context, FRONTEND_MODULES);
  root.state.init();
  root.state.customer = { logged_in: false };
  root.utils.routeTo = () => {};
  return { context, root };
}

test("Restored Step 2 recovers pricing, calendar, and selected-day slots", async () => {
  const { root } = restoreFrontendAtStep(2);
  assert.equal(root.state.scheduledWizard.step, 2);
  // Reload clears the in-memory preview: nothing is persisted except the draft + step.
  assert.equal(root.state.scheduledPreview.pricing.data, null);

  const d = root.state.draft.scheduled;
  let pricingCalls = 0;
  let calendarCalls = 0;
  let availabilityCalls = 0;
  root.api.previewPricing = async () => { pricingCalls += 1; return { duration_min: 90, active_price: 1200, standard_price: 1200 }; };
  root.api.loadAvailabilityCalendar = async () => { calendarCalls += 1; return { month: d.calendar_month, days: [{ date: d.date, available: true, status: "available", first_available: "09:00" }] }; };
  root.api.loadAvailability = async () => { availabilityCalls += 1; return { date: d.date, duration_min: 90, slot_step_min: 30, slots: [{ start: "09:00", end: "12:00", available: true }] }; };

  const container = new WizardContainer();
  root.bookingScheduled.render(container);
  await flush();

  assert.equal(root.state.scheduledPreview.pricing.status, "success");
  assert.equal(root.state.scheduledPreview.calendar.status, "success");
  assert.equal(root.state.scheduledPreview.availability.status, "success");
  assert.equal(pricingCalls, 1, "pricing recovered exactly once (no duplicate requests)");
  assert.equal(calendarCalls, 1);
  assert.equal(availabilityCalls, 1);
  assert.doesNotMatch(container.innerHTML, /ข้อมูลบริการหรือราคายังไม่พร้อม/);
  assert.match(container.innerHTML, /09:00/);
});

test("Restored Step 3 recovers dependencies and preserves the selected slot", async () => {
  const seedDate = (() => {
    const ctx = makeContext();
    const r = load(ctx, ["customer-app/modules/state.js"]);
    return r.state.draft.scheduled.date;
  })();
  const { root } = restoreFrontendAtStep(3, {
    customer_name: "Step3 Customer",
    customer_phone: "0812345678",
    address_text: "Step3 Condo",
    selectedSlot: { key: `${seedDate}|09:00|90`, date: seedDate, start: "09:00", end: "10:30", duration_min: 90, query_key: "stale-key-from-previous-session" },
  });
  assert.equal(root.state.scheduledWizard.step, 3);
  assert.ok(root.state.draft.scheduled.selectedSlot, "restored draft still carries the chosen slot");

  const d = root.state.draft.scheduled;
  root.api.previewPricing = async () => ({ duration_min: 90, active_price: 1200, standard_price: 1200 });
  root.api.loadAvailabilityCalendar = async () => ({ month: d.calendar_month, days: [{ date: d.date, available: true, status: "available", first_available: "09:00" }] });
  root.api.loadAvailability = async () => ({ date: d.date, duration_min: 90, slot_step_min: 30, slots: [{ start: "09:00", end: "12:00", available: true }] });

  const container = new WizardContainer();
  root.bookingScheduled.render(container);
  await flush();

  assert.equal(root.state.scheduledPreview.pricing.status, "success");
  assert.equal(root.state.scheduledPreview.availability.status, "success");
  assert.ok(root.state.draft.scheduled.selectedSlot, "recovery must not drop the customer's slot");
  assert.equal(root.state.draft.scheduled.selectedSlot.start, "09:00");
  assert.equal(root.state.scheduledWizard.step, 3, "customer is not bounced back to an earlier step");
});

test("Calendar shows pending (not no-open-slots) while data is unresolved", () => {
  const { root } = restoreFrontendAtStep(2);
  // APIs that never resolve: the recovery chain stays in-flight, calendar data is unavailable.
  root.api.previewPricing = () => new Promise(() => {});
  root.api.loadAvailabilityCalendar = () => new Promise(() => {});
  root.api.loadAvailability = () => new Promise(() => {});

  const container = new WizardContainer();
  root.bookingScheduled.render(container);

  // No backend no_open_slots response yet -> must not manufacture "ยังไม่มีคิวเปิด".
  assert.doesNotMatch(container.innerHTML, /ยังไม่มีคิวเปิด/);
  assert.match(container.innerHTML, /\.\.\./);
});

test("Calendar shows explicit no_open_slots and full only from backend status", () => {
  const { root } = restoreFrontendAtStep(2);
  const d = root.state.draft.scheduled;
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 900 }, error: "" });
  const query = root.availability.publicCalendarQuery(d, root.services.payloadFromScheduledDraft(d), root.state.scheduledPreview.pricing.data);
  const key = root.availability.calendarQueryKey(query);
  // Keep recovery a no-op by marking availability resolved.
  root.state.setScheduledPreview("availability", { status: "success", data: { date: d.date, slots: [], availability_status: "no_open_slots" }, error: "", query_key: "k", loaded_at: "x" });

  function calendarHtmlFor(status) {
    // d.date is "today" in Asia/Bangkok, always inside the selectable range and the rendered month.
    root.state.setScheduledPreview("calendar", {
      status: "success",
      data: { month: query.month, days: [{ date: d.date, available: false, status }] },
      error: "",
      query_key: key,
      loaded_at: "x",
    });
    const container = new WizardContainer();
    root.bookingScheduled.render(container);
    return container.innerHTML;
  }

  assert.match(calendarHtmlFor("no_open_slots"), /ยังไม่มีคิวเปิด/);
  assert.match(calendarHtmlFor("full"), /เต็ม/);
});

test("Slot list uses the central no-slot customer copy for every empty availability result", () => {
  const { root } = restoreFrontendAtStep(2);
  const d = root.state.draft.scheduled;
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 900 }, error: "" });
  root.state.setScheduledPreview("calendar", { status: "success", data: { month: d.calendar_month, days: [] }, error: "", query_key: "k", loaded_at: "x" });

  function slotsHtmlFor(status) {
    root.state.setScheduledPreview("availability", { status: "success", data: { date: d.date, duration_min: 60, slots: [], availability_status: status }, error: "", query_key: "k", loaded_at: "x" });
    const container = new WizardContainer();
    root.bookingScheduled.render(container);
    return container.innerHTML;
  }

  const copy = /ยังไม่มีคิวว่างในวันที่เลือก กรุณาเลือกวันอื่น/;
  assert.match(slotsHtmlFor("full"), copy);
  assert.match(slotsHtmlFor("no_open_slots"), copy);
  assert.match(slotsHtmlFor(""), copy);
});

// --- Defect E: monthly work calendar is the source of truth ---

function makeOffDeps(overrides = {}) {
  return {
    pool: {
      async query(sql, params = []) {
        const text = String(sql);
        if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (text.includes("technician_service_matrix")) {
          return { rows: [{ username: "tech-a", matrix_json: { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } } }] };
        }
        if (text.includes("technician_monthly_work_calendar")) {
          if (overrides.calendar === false) return { rows: [] };
          return { rows: [{
            technician_username: "tech-a",
            work_date: params[1],
            day_status: "available",
            can_accept_advance_job: true,
            start_time: "09:00",
            end_time: "12:00",
            max_jobs_per_day: 2,
            max_units_per_day: 4,
          }] };
        }
        if (text.includes("WITH assigned AS")) return { rows: [] };
        if (text.includes("technician_special_slots_v2")) return { rows: [] };
        return { rows: [] };
      },
    },
    listTechniciansByType: async () => [{ username: "tech-a", customer_slot_visible: true, weekly_off_days: "0,1,2,3,4,5,6", work_start: "09:00", work_end: "12:00" }],
    // Legacy off-day logic reports the technician as OFF for every date.
    buildOffMapForDate: async () => new Map([["tech-a", true]]),
    isTechOffOnDate: () => true,
    buildTechWindowsMin: () => [{ startMin: 540, endMin: 720 }],
    listBusyBlocksForTechOnDate: async () => [],
    buildStartIntervalsByCollision: (blocks, startMin, endMin, durationMin) => ((blocks || []).length ? [] : [{ startMin, endMin: endMin - durationMin }]),
    toMin(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; },
    minToHHMM(value) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; },
    getNowBangkokParts: () => ({ Y: "2026", M: "06", D: "01", hh: 8, mm: 0 }),
  };
}

test("Monthly advance opt-in is not overridden by legacy weekly off-days", async () => {
  const base = {
    date: "2026-06-02",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  };
  const result = await customerAvailability.computePublicCustomerSlots(makeOffDeps(), base);
  assert.ok(result.slots.length > 0, "technician opted in via monthly calendar must remain available");
  assert.equal(result.availability_status, "available");
});

test("Missing monthly calendar row stays fail-closed even if legacy off-day allows it", async () => {
  const base = {
    date: "2026-06-02",
    duration_min: 60,
    tech_type: "company",
    services: [{ job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา" }],
  };
  const result = await customerAvailability.computePublicCustomerSlots(makeOffDeps({ calendar: false }), base);
  assert.equal(result.slots.length, 0);
  assert.equal(result.availability_status, "no_open_slots");
  assert.equal(result.reason_code, "NO_ADVANCE_CALENDAR_ROW");
});
