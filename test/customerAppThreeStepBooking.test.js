const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

function file(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeContext({ session = {} } = {}) {
  const sessionStore = new Map(Object.entries(session));
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://app.example.test", pathname: "/customer-app/", search: "", hash: "" },
    sessionStorage: {
      getItem(key) { return sessionStore.has(key) ? sessionStore.get(key) : null; },
      setItem(key, value) { sessionStore.set(key, String(value)); },
      removeItem(key) { sessionStore.delete(key); },
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  const context = {
    window,
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      createElement(tagName) {
        return { tagName: String(tagName || "").toUpperCase(), className: "", dataset: {}, textContent: "" };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    navigator: {},
    history: { replaceState() {} },
    Element: function Element() {},
    URL,
    URLSearchParams,
    Intl,
    Date,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function load(modules, opts) {
  const context = makeContext(opts);
  for (const modulePath of modules) {
    vm.runInContext(file(modulePath), context, { filename: modulePath });
  }
  return { context, root: context.window.CWFCustomerAppV2 };
}

function loadBooking(opts) {
  return load([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/services.js",
    "customer-app/modules/availability.js",
    "customer-app/modules/bookingScheduled.js",
  ], opts);
}

function renderInto(root, step = 1) {
  root.state.setScheduledWizard({ step });
  const container = {
    html: "",
    dataset: {},
    set innerHTML(value) { this.html = String(value || ""); },
    get innerHTML() { return this.html; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
  };
  root.api = {
    previewPricing: async () => ({ active_price: 500, duration_min: 60, promo: { promo_name: "Promo" } }),
    loadAvailabilityCalendar: async () => ({ month: root.state.draft.scheduled.calendar_month, days: [] }),
    loadAvailability: async () => ({ date: root.state.draft.scheduled.date, duration_min: 60, slots: [{ start: "09:00", end: "10:00", available: true }] }),
  };
  root.bookingScheduled.render(container);
  return container.html;
}

function sampleLines(root) {
  return [
    root.services.createServiceLine({ line_id: "a", ac_type: "ผนัง", btu: 12000, machine_count: 2, wash_variant: "ล้างธรรมดา" }),
    root.services.createServiceLine({ line_id: "b", ac_type: "ผนัง", btu: 18000, machine_count: 1, wash_variant: "ล้างพรีเมียม" }),
    root.services.createServiceLine({ line_id: "c", ac_type: "สี่ทิศทาง", btu: 24000, machine_count: 1, wash_variant: "" }),
  ];
}

test("scheduled wizard state has exactly five steps", () => {
  const { root } = loadBooking();
  assert.equal(root.state.scheduledWizard.maxStep, 5);
  root.state.setScheduledWizard({ step: 99 });
  assert.equal(root.state.scheduledWizard.step, 5);
});

test("Customer App customer-facing UI does not expose internal public endpoint names", () => {
  const uiSources = [
    "customer-app/index.html",
    "customer-app/assets/customer-app.css",
    "customer-app/modules/auth.js",
    "customer-app/modules/bookingScheduled.js",
    "customer-app/modules/bookingUrgent.js",
    "customer-app/modules/profile.js",
    "customer-app/modules/router.js",
    "customer-app/modules/state.js",
    "customer-app/modules/ui.js",
  ].map(file).join("\n");
  assert.doesNotMatch(uiSources, /\/public\/|pricing_preview|availability_v2|public\/book|endpoint|implementation/i);
  const { root } = loadBooking();
  assert.doesNotMatch(renderInto(root, 3), /\/public\/|pricing_preview|availability_v2|public\/book|endpoint|implementation/i);
});

test("service step omits redundant single-option service-kind selector", () => {
  const { root } = loadBooking();
  const html = renderInto(root, 2);
  assert.doesNotMatch(html, /data-scheduled-choice="service_kind"|service-kind-grid|ประเภทบริการ/);
  assert.match(html, /data-line-choice="ac_type"/);
  assert.match(html, /data-line-choice="btu"/);
  assert.match(html, /data-line-field="machine_count"/);
});

test("multi-service draft keeps wall methods, quantities, and non-wall blank method", () => {
  const { root } = loadBooking();
  root.state.updateDraft("scheduled", { services: sampleLines(root) });
  const lines = root.services.normalizeServiceLines(root.state.draft.scheduled);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].machine_count, 2);
  assert.equal(lines[0].wash_variant, "ล้างธรรมดา");
  assert.equal(lines[1].wash_variant, "ล้างพรีเมียม");
  assert.equal(lines[2].ac_type, "สี่ทิศทาง");
  assert.equal(lines[2].wash_variant, "");
});

test("pricing, availability, and submit payload include every service line", () => {
  const { root } = loadBooking();
  root.state.updateDraft("scheduled", {
    services: sampleLines(root),
    customer_name: "A",
    customer_phone: "0812345678",
    address_text: "Address",
    selectedSlot: { date: root.state.draft.scheduled.date, start: "09:00", end: "10:00", key: "k", query_key: "q" },
  });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 120, active_price: 2000 }, error: "" });
  const pricingPayload = root.services.payloadFromScheduledDraft(root.state.draft.scheduled);
  const availabilityQuery = root.bookingScheduled._test.currentAvailabilityQuery();
  const submitPayload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(pricingPayload.services.length, 3);
  assert.match(availabilityQuery.services, /"machine_count":2/);
  assert.equal(submitPayload.services.length, 3);
  assert.equal(submitPayload.services[2].wash_variant, undefined);
  assert.equal(submitPayload.ac_type, "ผนัง");
});

test("calendar query includes normalized service list and combined duration", () => {
  const { root } = loadBooking();
  root.state.updateDraft("scheduled", { services: sampleLines(root) });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 210, active_price: 3000 }, error: "" });
  const query = root.bookingScheduled._test.currentCalendarQuery();
  assert.equal(query.duration_min, 210);
  assert.equal(query.month, root.state.draft.scheduled.calendar_month);
  assert.match(query.services, /"btu":18000/);
});

test("changing a service line invalidates stale price, calendar, and selected slot through commerce draft reset", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60 }, error: "" });
  root.state.setScheduledPreview("availability", { status: "success", data: { slots: [] }, query_key: "x", error: "" });
  root.state.setScheduledPreview("calendar", { status: "success", data: { days: [] }, query_key: "y", error: "" });
  root.state.updateDraft("scheduled", { selectedSlot: { key: "old" } });
  root.services.applyCommerceDraft("scheduled", root.services.commerceItem("cassette"));
  assert.equal(root.state.scheduledPreview.pricing.status, "idle");
  assert.equal(root.state.scheduledPreview.availability.status, "idle");
  assert.equal(root.state.scheduledPreview.calendar.status, "idle");
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
});

test("time preference defaults exact and submit payload sends boolean", () => {
  const { root } = loadBooking();
  assert.equal(root.state.draft.scheduled.allow_time_proposal, false);
  let payload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(payload.allow_time_proposal, false);
  root.state.updateDraft("scheduled", { allow_time_proposal: true });
  payload = root.bookingScheduled._test.buildSubmitPayload();
  assert.equal(payload.allow_time_proposal, true);
});

test("review screen displays selected time preference", () => {
  const { root } = loadBooking();
  root.state.updateDraft("scheduled", { allow_time_proposal: true });
  const html = renderInto(root, 5);
  assert.match(html, /สามารถเสนอเวลาใหม่ให้ฉันได้/);
  assert.match(html, /การเสนอเวลา/);
});

test("calendar marks available and full dates without technician identity", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 500 }, error: "" });
  const key = root.availability.calendarQueryKey(root.bookingScheduled._test.currentCalendarQuery());
  root.state.setScheduledPreview("calendar", {
    status: "success",
    data: { month: root.state.draft.scheduled.calendar_month, days: [
      { date: root.state.draft.scheduled.date, available: true, first_available: "09:00", technician_name: "Hidden" },
      { date: "2099-12-31", available: false, first_available: null, technician_count: 3 },
    ] },
    error: "",
    query_key: key,
  });
  const html = renderInto(root, 4);
  assert.match(html, /มีคิว/);
  assert.doesNotMatch(html, /Hidden|technician_name|technician_id|technician_count|matrix_json/);
});

test("anonymous slots render complete time range without technician identity or counts", () => {
  const { root } = loadBooking();
  root.state.setScheduledWizard({ step: 4 });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 90, active_price: 900 }, error: "" });
  const query = root.bookingScheduled._test.currentAvailabilityQuery();
  root.state.setScheduledPreview("availability", {
    status: "success",
    data: { date: root.state.draft.scheduled.date, duration_min: 90, slots: [{ start: "10:00", end: "10:30", available: true, technician_name: "Hidden Tech", technician_id: 42 }] },
    error: "",
    query_key: root.availability.queryKey(query),
  });
  const html = renderInto(root, 4);
  assert.match(html, /10:00-11:30/);
  assert.doesNotMatch(html, /Hidden Tech|technician_id|42|candidate|คน/);
});

test("stale slot cannot be submitted", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 500 }, error: "" });
  root.state.updateDraft("scheduled", { selectedSlot: { key: "old", date: root.state.draft.scheduled.date, start: "09:00", end: "10:00", query_key: "old" } });
  root.state.setScheduledPreview("availability", { status: "success", data: { date: root.state.draft.scheduled.date, duration_min: 60, slots: [] }, query_key: "new", error: "" });
  assert.match(root.bookingScheduled._test.validateSlotStep(), /ข้อมูลล่าสุด|เลือกเวลาใหม่|โหลดคิว/);
});

test("home primary booking CTA opens scheduled booking and all service categories remain visible", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/services.js", "customer-app/modules/ui.js"]);
  let routed = "";
  root.utils.routeTo = (route) => { routed = route; };
  const item = root.services.commerceItem("wall-normal");
  assert.equal(root.services.applyCommerceDraft("scheduled", item), true);
  root.utils.routeTo("scheduled");
  assert.equal(routed, "scheduled");
  assert.equal(root.state.scheduledWizard.step, 1);
  assert.equal(root.services.commerceCategories.map((entry) => entry.id).join(","), "clean,repair,install,move,inspect,urgent");
});

test("login controls disappear when authenticated", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  root.state.customer = { logged_in: true, user: { name: "User", provider: "google" }, profile: {} };
  const html = root.auth.renderLoginPanel();
  assert.doesNotMatch(html, /data-auth-provider|Guest/);
  assert.match(html, /data-auth-logout/);
});

test("header account chip markup has one label mount and one avatar mount", () => {
  const html = file("customer-app/index.html");
  assert.equal((html.match(/data-account-chip-label/g) || []).length, 1);
  assert.equal((html.match(/data-account-chip-avatar/g) || []).length, 1);
});

test("profile renders exactly one avatar and no inline onerror handler", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  root.state.customer = { logged_in: true, user: { name: "User", picture: "https://example.test/u.jpg" }, profile: {} };
  const html = root.auth.renderLoginPanel();
  assert.equal((html.match(/<(?:img|span) class="account-avatar"/g) || []).length, 1);
  assert.match(html, /<img class="account-avatar"/);
  assert.doesNotMatch(html, /onerror=/);
});

test("avatar image fallback keeps valid images and replaces broken images with one initial", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  let errorHandler = null;
  let replacement = null;
  const img = {
    className: "account-avatar",
    dataset: { avatarInitial: "U" },
    complete: false,
    naturalWidth: 1,
    addEventListener(type, handler) { if (type === "error") errorHandler = handler; },
    replaceWith(node) { replacement = node; },
  };
  const container = { querySelectorAll(selector) { return selector === "img[data-avatar-initial]" ? [img] : []; } };
  root.auth.bindAvatarFallbacks(container);
  assert.equal(typeof errorHandler, "function");
  assert.equal(replacement, null);
  errorHandler();
  assert.equal(replacement.className, "account-avatar");
  assert.equal(replacement.textContent, "U");
});

test("saved address prefills empty fields only and never overwrites typed address", () => {
  const { root } = loadBooking();
  root.state.customer = { logged_in: true, profile: { address: "Saved address", maps_url: "https://maps.google.com/?q=1" } };
  assert.equal(root.state.prefillSavedAddress("scheduled"), true);
  assert.equal(root.state.draft.scheduled.address_text, "Saved address");
  root.state.updateDraft("scheduled", { address_text: "Typed address", maps_url: "https://maps.google.com/?q=typed" });
  assert.equal(root.state.prefillSavedAddress("scheduled"), false);
  assert.equal(root.state.draft.scheduled.address_text, "Typed address");
});

test("Customer App does not send Admin-only fields", () => {
  const { root } = loadBooking();
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  for (const key of ["technician_username", "assign_mode", "dispatch_mode", "override_price", "override_duration_min", "team_members", "special_slots"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key);
  }
});
