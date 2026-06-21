const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeContext() {
  const storage = new Map();
  const listeners = {};
  const window = {
    CWFCustomerAppV2: {},
    location: { protocol: "https:", origin: "https://app.example.test", pathname: "/customer-app/index.html", search: "", hash: "" },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  const context = {
    window,
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener(type, listener) { listeners[type] = listener; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
    },
    history: { replaceState(_a, _b, url) { window.location.hash = String(url || "").replace(/^[^#]*/, ""); } },
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

class FakeButton {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.disabled = false;
    this.listeners = {};
  }
  getAttribute(name) { return this.attrs[name] || ""; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  async click() {
    if (this.listeners.click) await this.listeners.click({ preventDefault() {} });
  }
}

class HomeContainer {
  constructor() {
    this.buttons = [];
    this._innerHTML = "";
  }
  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.buttons = [];
    const commerce = [...this._innerHTML.matchAll(/data-commerce-service="([^"]+)"/g)];
    commerce.forEach((match) => this.buttons.push(new FakeButton({ "data-commerce-service": match[1] })));
    const contact = [...this._innerHTML.matchAll(/data-contact-service="([^"]+)"/g)];
    contact.forEach((match) => this.buttons.push(new FakeButton({ "data-contact-service": match[1] })));
  }
  get innerHTML() { return this._innerHTML; }
  appendChild() {}
  querySelector() { return null; }
  querySelectorAll(selector) {
    if (selector === "[data-commerce-service]") return this.buttons.filter((button) => button.hasAttribute("data-commerce-service"));
    if (selector === "[data-contact-service]") return this.buttons.filter((button) => button.hasAttribute("data-contact-service"));
    if (selector === "[data-commerce-method]") return [];
    return [];
  }
}

class WizardContainer {
  constructor(root) {
    this.root = root;
    this.buttons = [];
    this.inputs = [];
    this._innerHTML = "";
  }
  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.buttons = [];
    this.inputs = [];
    [...this._innerHTML.matchAll(/data-action="([^"]+)"/g)].forEach((match) => this.buttons.push(new FakeButton({ "data-action": match[1] })));
    [...this._innerHTML.matchAll(/data-scheduled-choice="([^"]+)"[^>]*data-choice-value="([^"]+)"/g)]
      .forEach((match) => this.buttons.push(new FakeButton({ "data-scheduled-choice": match[1], "data-choice-value": match[2] })));
  }
  get innerHTML() { return this._innerHTML; }
  scrollIntoView() {}
  querySelectorAll(selector) {
    if (selector === "[data-action]") return this.buttons.filter((button) => button.hasAttribute("data-action"));
    if (selector === "[data-scheduled-choice]") return this.buttons.filter((button) => button.hasAttribute("data-scheduled-choice"));
    return [];
  }
}

function loadCustomerFrontend(context = makeContext()) {
  return load(context, [
    "customer-app/modules/utils.js",
    "customer-app/modules/state.js",
    "customer-app/modules/api.js",
    "customer-app/modules/services.js",
    "customer-app/modules/ui.js",
    "customer-app/modules/auth.js",
    "customer-app/modules/availability.js",
    "customer-app/modules/bookingScheduled.js",
    "customer-app/modules/bookingUrgent.js",
    "customer-app/modules/router.js",
  ]);
}

test("Customer App build id is consistent across shell and service worker", () => {
  const index = read("customer-app/index.html");
  const sw = read("customer-app/sw.js");
  const app = read("customer-app/assets/customer-app.js");
  const manifest = read("customer-app/manifest.webmanifest");
  const build = "20260621_eligibility_techtype_v3";

  assert.match(index, new RegExp(`customer-app\\.css\\?v=${build}`));
  assert.match(index, new RegExp(`bookingUrgent\\.js\\?v=${build}`));
  assert.match(sw, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(app, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(manifest, new RegExp(`index\\.html\\?v=${build}#home`));
  assert.doesNotMatch(sw, /"\.\/index\.html"/);
  assert.match(sw, /cwf-customer-app-v2-/);
  assert.match(app, /document\.readyState === "complete"/);
  assert.match(app, /window\.addEventListener\("load", registerServiceWorker/);
});

test("auth rendering separates logged-in account from provider login buttons", () => {
  const context = makeContext();
  const root = load(context, [
    "customer-app/modules/utils.js",
    "customer-app/modules/state.js",
    "customer-app/modules/auth.js",
  ]);

  root.state.customer = {
    logged_in: true,
    user: { name: "Logged Customer", email: "customer@example.test", provider: "line" },
    profile: { phone: "0812345678" },
  };
  root.state.authStatus = "success";
  let html = root.auth.renderLoginPanel();
  assert.match(html, /บัญชีของฉัน/);
  assert.match(html, /Logged Customer/);
  assert.doesNotMatch(html, /data-auth-provider|Guest/);

  root.state.customer = { logged_in: false };
  root.state.authConfig = { providers: { line: { available: true, start_url: "/auth/line/start" }, google: { available: false } } };
  html = root.auth.renderLoginPanel();
  assert.match(html, /data-auth-provider="line"/);
  assert.match(html, /จองแบบ Guest/);
});

test("account chip has narrow-screen avatar-only protection", () => {
  const css = read("customer-app/assets/customer-app.css");
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /\.icon-pill\.is-logged-in\s*\{/);
  assert.match(css, /clip-path: inset\(50%\)/);
  assert.match(css, /text-overflow: ellipsis/);
});

test("scheduled draft persists and restores three-step state", () => {
  const context = makeContext();
  let root = load(context, ["customer-app/modules/state.js"]);
  root.state.updateDraft("scheduled", { customer_name: "Persisted Customer", address_text: "Persisted Address" });
  root.state.setScheduledWizard({ step: 3 });

  context.window.CWFCustomerAppV2 = {};
  root = load(context, ["customer-app/modules/state.js"]);
  root.state.init();

  assert.equal(root.state.scheduledWizard.step, 3);
  assert.equal(root.state.scheduledWizard.maxStep, 3);
  assert.equal(root.state.draft.scheduled.customer_name, "Persisted Customer");
  assert.equal(root.state.draft.scheduled.address_text, "Persisted Address");
});

test("legacy scheduled draft from older flow is mapped safely into the three-step flow", () => {
  const context = makeContext();
  context.window.sessionStorage.setItem("cwf_customer_app_v2_scheduled_v2", JSON.stringify({
    version: 2,
    saved_at: Date.now(),
    step: 5,
    draft: { customer_name: "Legacy Customer", address_text: "Legacy Address" },
    wizard: { step: 5, maxStep: 5 },
    preview: {},
    submit: {},
  }));

  const root = load(context, ["customer-app/modules/state.js"]);
  root.state.init();

  assert.equal(root.state.scheduledWizard.step, 3);
  assert.equal(root.state.scheduledWizard.maxStep, 3);
  assert.equal(root.state.draft.scheduled.customer_name, "Legacy Customer");
  assert.equal(root.state.draft.scheduled.address_text, "Legacy Address");
});

test("home CTA click writes scheduled draft and routes to scheduled flow", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => {
    routeCalls.push(route);
    root.state.setRoute(route);
  };
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  const container = new HomeContainer();

  root.ui.renderHome(container);
  const cta = container.querySelectorAll("[data-commerce-service]").find((button) => button.getAttribute("data-commerce-service") === "wall-normal");
  assert.ok(cta);
  await cta.click();

  assert.deepEqual(routeCalls, ["scheduled"]);
  assert.equal(root.state.scheduledWizard.step, 1);
  assert.equal(root.state.draft.scheduled.job_type, "ล้าง");
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
});

test("scheduled booking renders one active step and preserves draft across three steps", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.customer = { logged_in: false };
  root.api.previewPricing = async () => ({ duration_min: 90, active_price: 1200, standard_price: 1200 });
  root.api.loadAvailabilityCalendar = async () => ({
    month: root.state.draft.scheduled.calendar_month,
    days: [{ date: root.state.draft.scheduled.date, available: true, first_available: "09:00" }],
  });
  root.api.loadAvailability = async () => ({ date: root.state.draft.scheduled.date, duration_min: 90, slot_step_min: 30, slots: [{ start: "09:00", end: "12:00", available: true }] });

  const container = new WizardContainer(root);
  root.bookingScheduled.render(container);
  assert.match(container.innerHTML, /data-booking-step="1"/);
  assert.doesNotMatch(container.innerHTML, /data-booking-step="2"|data-booking-step="3"|data-booking-step="4"|data-booking-step="5"/);
  assert.match(container.innerHTML, /data-line-choice="ac_type"/);

  root.state.updateDraft("scheduled", {
    customer_name: "Test Customer",
    customer_phone: "0812345678",
    address_text: "123 Test Condo",
    maps_url: "https://maps.app.goo.gl/test",
  });
  await container.querySelectorAll("[data-action]").find((button) => button.getAttribute("data-action") === "wizard-next").click();
  assert.equal(root.state.scheduledWizard.step, 2);
  assert.match(container.innerHTML, /data-booking-step="2"/);
  assert.doesNotMatch(container.innerHTML, /data-booking-step="1"|data-booking-step="3"|data-booking-step="4"|data-booking-step="5"/);
  assert.equal(root.state.draft.scheduled.address_text, "123 Test Condo");
  assert.match(container.innerHTML, /09:00/);

  const slot = root.availability.normalizePublicSlots(root.state.scheduledPreview.availability.data, 90)[0];
  root.state.updateDraft("scheduled", { selectedSlot: { ...slot, query_key: root.state.scheduledPreview.availability.query_key } });
  root.bookingScheduled.render(container);
  await container.querySelectorAll("[data-action]").find((button) => button.getAttribute("data-action") === "wizard-next").click();
  assert.equal(root.state.scheduledWizard.step, 3);
  assert.match(container.innerHTML, /data-booking-step="3"/);
  assert.doesNotMatch(container.innerHTML, /data-booking-step="1"|data-booking-step="2"|data-booking-step="4"|data-booking-step="5"/);
  assert.equal(root.state.draft.scheduled.address_text, "123 Test Condo");
});
test("anonymous slots render without technician identity or counts", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const container = new WizardContainer(root);
  root.state.setScheduledWizard({ step: 2 });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 900 }, error: "" });
  root.state.setScheduledPreview("availability", {
    status: "success",
    data: { date: root.state.draft.scheduled.date, duration_min: 60, slots: [{ start: "10:00", end: "11:00", available: true, technician_name: "Hidden Tech", technician_id: 42 }] },
    error: "",
    query_key: "q",
    loaded_at: "",
  });

  root.bookingScheduled.render(container);
  assert.match(container.innerHTML, /10:00/);
  assert.doesNotMatch(container.innerHTML, /Hidden Tech|technician_id|42|candidate|คน/);
});

test("stale slot rejection returns customer to date and time step", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setScheduledWizard({ step: 3 });
  root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: 60, active_price: 900 }, error: "" });
  const query = root.availability.publicAvailabilityQuery(root.state.draft.scheduled, root.services.payloadFromServiceDraft(root.state.draft.scheduled), root.state.scheduledPreview.pricing.data);
  const queryKey = root.availability.queryKey(query);
  root.state.updateDraft("scheduled", {
    customer_name: "Test Customer",
    customer_phone: "0812345678",
    address_text: "123 Test Condo",
    selectedSlot: { key: `${root.state.draft.scheduled.date}|10:00|60`, date: root.state.draft.scheduled.date, start: "10:00", end: "11:00", duration_min: 60, query_key: queryKey },
  });
  root.state.setScheduledPreview("availability", { status: "success", data: { date: root.state.draft.scheduled.date, duration_min: 60, slots: [] }, error: "", query_key: queryKey, loaded_at: "" });
  root.api.loadAvailability = async () => ({ date: root.state.draft.scheduled.date, duration_min: 60, slots: [] });
  root.api.submitScheduledBooking = async () => { throw new Error("should not submit stale slot"); };
  const container = new WizardContainer(root);

  root.bookingScheduled.render(container);
  await container.querySelectorAll("[data-action]").find((button) => button.getAttribute("data-action") === "submit-scheduled").click();

  assert.equal(root.state.scheduledWizard.step, 2);
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
});

test("urgent route is registered and renders distinct urgent screen", () => {
  const shell = read("customer-app/assets/customer-app.js");
  const router = read("customer-app/modules/router.js");
  assert.match(shell, /urgent: App\.bookingUrgent\.render/);
  assert.doesNotMatch(router, /requested === "urgent"\) return "booking"/);
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("urgent");
  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);
  assert.match(container.innerHTML, /data-urgent-step="form"/);
  assert.match(container.innerHTML, /คิวด่วน/);
});
