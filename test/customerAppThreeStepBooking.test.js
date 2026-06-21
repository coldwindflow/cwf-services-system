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
        return {
          tagName: String(tagName || "").toUpperCase(),
          className: "",
          dataset: {},
          textContent: "",
        };
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

function renderInto(root, route = "scheduled") {
  root.state.currentRoute = route;
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
    loadAvailability: async () => ({ date: root.state.draft.scheduled.date, duration_min: 60, slots: [{ start: "09:00", end: "10:00", available: true }] }),
  };
  root.bookingScheduled.render(container);
  return container.html;
}

test("scheduled wizard state has exactly three steps", () => {
  const { root } = loadBooking();
  assert.equal(root.state.scheduledWizard.maxStep, 3);
  root.state.setScheduledWizard({ step: 99 });
  assert.equal(root.state.scheduledWizard.step, 3);
});

test("old labels or routes for separate steps 4 and 5 are absent", () => {
  const source = file("customer-app/modules/bookingScheduled.js");
  assert.doesNotMatch(source, /ขั้นตอน\s*4\s*จาก\s*5|ขั้นตอน\s*5\s*จาก\s*5/);
  assert.doesNotMatch(source, /renderStepPrice|renderStepFour|maxStep:\s*5|Math\.min\(5/);
});

test("step 1 contains air selection and real price preview", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { active_price: 500, duration_min: 60, promo: { promo_name: "Promo" } }, error: "" });
  const html = renderInto(root);
  assert.match(html, /ขั้นตอน 1 จาก 3/);
  assert.match(html, /เลือกบริการและดูราคา/);
  assert.match(html, /data-scheduled-choice="ac_type"/);
  assert.match(html, /data-scheduled-choice="btu"/);
  assert.match(html, /ราคาประมาณการ/);
  assert.match(html, /Promo/);
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
  const html = renderInto(root);
  assert.doesNotMatch(html, /\/public\/|pricing_preview|availability_v2|public\/book|endpoint|implementation/i);
});

test("scheduled step 1 omits redundant single-option service-kind selector", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { active_price: 500, duration_min: 60 }, error: "" });
  const html = renderInto(root);
  assert.doesNotMatch(html, /data-scheduled-choice="service_kind"/);
  assert.doesNotMatch(html, /service-kind-grid/);
  assert.match(html, /data-scheduled-choice="ac_type"/);
  assert.match(html, /data-scheduled-choice="btu"/);
  assert.match(html, /data-scheduled-field="machine_count"/);
});

test("step 2 contains all required contact and location fields", () => {
  const { root } = loadBooking();
  root.state.setScheduledWizard({ step: 2 });
  const html = renderInto(root);
  assert.match(html, /ขั้นตอน 2 จาก 3/);
  for (const field of ["customer_name", "customer_phone", "address_text", "maps_url", "job_zone", "customer_note"]) {
    assert.match(html, new RegExp(`data-scheduled-field="${field}"`));
  }
});

test("step 3 contains date, real slots, final summary, and submit", () => {
  const { root } = loadBooking();
  root.state.setScheduledWizard({ step: 3 });
  root.state.setScheduledPreview("pricing", { status: "success", data: { active_price: 500, duration_min: 60 }, error: "" });
  root.state.setScheduledPreview("availability", {
    status: "success",
    data: { date: root.state.draft.scheduled.date, duration_min: 60, slots: [{ start: "09:00", end: "10:00", available: true }] },
    error: "",
    query_key: root.availability.queryKey(root.bookingScheduled._test.currentAvailabilityQuery()),
  });
  const html = renderInto(root);
  assert.match(html, /ขั้นตอน 3 จาก 3/);
  assert.match(html, /booking-calendar/);
  assert.match(html, /real-slot-card/);
  assert.match(html, /สรุปก่อนยืนยัน/);
  assert.match(html, /data-action="submit-scheduled"/);
});

test("old persisted five-step draft maps safely to the new flow", () => {
  const saved = JSON.stringify({
    version: 2,
    saved_at: Date.now(),
    step: 5,
    draft: { customer_name: "Saved", customer_phone: "0812345678", address_text: "Address" },
  });
  const { root } = loadBooking({ session: { cwf_customer_app_v2_scheduled_v2: saved } });
  root.state.init();
  assert.equal(root.state.scheduledWizard.step, 1);
  assert.equal(root.state.scheduledWizard.maxStep, 3);
  assert.equal(root.state.draft.scheduled.customer_name, "Saved");
});

test("home primary booking CTA opens scheduled booking", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/services.js", "customer-app/modules/ui.js"]);
  let routed = "";
  root.utils.routeTo = (route) => { routed = route; };
  const item = root.services.commerceItem("wall-normal");
  assert.equal(root.services.applyCommerceDraft("scheduled", item), true);
  root.utils.routeTo("scheduled");
  assert.equal(routed, "scheduled");
  assert.equal(root.state.scheduledWizard.step, 1);
});

test("home displays all six required service categories", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/services.js"]);
  assert.equal(root.services.commerceCategories.map((item) => item.id).join(","), "clean,repair,install,move,inspect,urgent");
});

test("login controls disappear when authenticated", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  root.state.customer = { logged_in: true, user: { name: "User", provider: "google" }, profile: {} };
  const html = root.auth.renderLoginPanel();
  assert.doesNotMatch(html, /data-auth-provider/);
  assert.match(html, /data-auth-logout/);
});

test("guest content disappears when authenticated", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  root.state.customer = { logged_in: true, user: { name: "User" }, profile: {} };
  assert.doesNotMatch(root.auth.renderLoginPanel(), /Guest/);
});

test("header account chip markup has one label mount and one avatar mount", () => {
  const html = file("customer-app/index.html");
  assert.equal((html.match(/data-account-chip-label/g) || []).length, 1);
  assert.equal((html.match(/data-account-chip-avatar/g) || []).length, 1);
});

test("profile renders exactly one avatar for a logged-in account card", () => {
  const { root } = load([
    "customer-app/modules/state.js",
    "customer-app/modules/utils.js",
    "customer-app/modules/auth.js",
  ]);
  root.state.customer = { logged_in: true, user: { name: "User", picture: "https://example.test/u.jpg" }, profile: {} };
  const html = root.auth.renderLoginPanel();
  assert.equal((html.match(/<(?:img|span) class="account-avatar"/g) || []).length, 1);
  assert.match(html, /<img class="account-avatar"/);
  assert.doesNotMatch(html, /onerror=/);
  assert.match(html, /data-avatar-initial=/);
});

test("Customer App avatar markup has no inline onerror handlers", () => {
  const sources = [
    "customer-app/modules/auth.js",
    "customer-app/modules/ui.js",
  ].map(file).join("\n");
  assert.doesNotMatch(sources, /onerror\s*=/i);
});

test("avatar image fallback keeps valid images and replaces broken images with one initial", () => {
  const { root } = load(["customer-app/modules/state.js", "customer-app/modules/utils.js", "customer-app/modules/auth.js"]);
  root.state.customer = { logged_in: true, user: { name: "User", picture: "https://example.test/u.jpg" }, profile: {} };
  const html = root.auth.renderLoginPanel();
  assert.equal((html.match(/<img class="account-avatar"/g) || []).length, 1);
  assert.equal((html.match(/class="account-avatar"/g) || []).length, 1);

  let errorHandler = null;
  let replacement = null;
  const img = {
    className: "account-avatar",
    dataset: { avatarInitial: "U" },
    complete: false,
    naturalWidth: 1,
    addEventListener(type, handler) {
      if (type === "error") errorHandler = handler;
    },
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

test("saved information prefills empty fields only", () => {
  const { root } = loadBooking();
  root.state.customer = { logged_in: true, profile: { address: "Saved address", maps_url: "https://maps.google.com/?q=1" } };
  assert.equal(root.state.prefillSavedAddress("scheduled"), true);
  assert.equal(root.state.draft.scheduled.address_text, "Saved address");
});

test("manual customer edits are not overwritten", () => {
  const { root } = loadBooking();
  root.state.customer = { logged_in: true, profile: { address: "Saved address", maps_url: "https://maps.google.com/?q=1" } };
  root.state.updateDraft("scheduled", { address_text: "Typed address", maps_url: "https://maps.google.com/?q=typed" });
  assert.equal(root.state.prefillSavedAddress("scheduled"), false);
  assert.equal(root.state.draft.scheduled.address_text, "Typed address");
});

test("slot request uses service payload and calculated duration", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 75, active_price: 700 }, error: "" });
  const query = root.bookingScheduled._test.currentAvailabilityQuery();
  assert.equal(query.duration_min, 75);
  assert.equal(query.job_type, "ล้าง");
  assert.equal(query.ac_type, "ผนัง");
  assert.equal(query.machine_count, 1);
  assert.match(query.services, /"job_type":"ล้าง"/);
});

test("technician identity is absent from customer slot output", () => {
  const { root } = loadBooking();
  const slots = root.availability.normalizePublicSlots({
    date: "2026-06-22",
    duration_min: 60,
    slots: [{ start: "09:00", end: "11:00", available: true, technician_username: "tech1", team_count: 2 }],
  }, 60);
  assert.ok(slots.length > 0);
  assert.equal("technician_username" in slots[0], false);
  assert.equal("team_count" in slots[0], false);
});

test("stale slot cannot be submitted", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 500 }, error: "" });
  root.state.updateDraft("scheduled", { selectedSlot: { key: "old", date: root.state.draft.scheduled.date, start: "09:00", end: "10:00", query_key: "old" } });
  root.state.setScheduledPreview("availability", { status: "success", data: { date: root.state.draft.scheduled.date, duration_min: 60, slots: [] }, query_key: "new", error: "" });
  assert.match(root.bookingScheduled._test.validateSlotStep(), /ข้อมูลล่าสุด|เลือกเวลาใหม่|โหลดคิว/);
});

test("pricing and slot state reset after service changes", () => {
  const { root } = loadBooking();
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60 }, error: "" });
  root.state.setScheduledPreview("availability", { status: "success", data: { slots: [] }, query_key: "x", error: "" });
  root.services.applyCommerceDraft("scheduled", root.services.commerceItem("cassette"));
  assert.equal(root.state.scheduledPreview.pricing.status, "idle");
  assert.equal(root.state.scheduledPreview.availability.status, "idle");
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
});

test("/public/book payload retains all required customer-safe fields", () => {
  const { root } = loadBooking();
  const date = root.state.draft.scheduled.date;
  root.state.updateDraft("scheduled", {
    customer_name: "A",
    customer_phone: "0812345678",
    address_text: "Address",
    maps_url: "https://maps.google.com/?q=1",
    customer_note: "Parking",
    job_zone: "Bangna",
    selectedSlot: { date, start: "09:00", end: "10:00", key: `${date}|09:00|60`, query_key: "q" },
  });
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  for (const key of ["customer_name", "customer_phone", "appointment_datetime", "address_text", "maps_url", "customer_note", "job_zone", "booking_mode", "client_app", "job_type", "service_kind", "ac_type", "btu", "machine_count", "services"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(payload, key), key);
  }
  assert.equal(payload.booking_mode, "scheduled");
});

test("Customer App does not send Admin-only fields", () => {
  const { root } = loadBooking();
  const payload = root.bookingScheduled._test.buildSubmitPayload();
  for (const key of ["technician_username", "assign_mode", "dispatch_mode", "override_price", "override_duration_min", "team_members", "special_slots"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key);
  }
});
