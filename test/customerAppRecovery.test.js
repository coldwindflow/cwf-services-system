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
    // Unref'd so a timer left running by a module under test (e.g. a
    // forgotten cleanup call) never keeps the test process alive.
    setInterval(...args) {
      const timer = setInterval(...args);
      if (typeof timer.unref === "function") timer.unref();
      return timer;
    },
    clearInterval,
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
    [...this._innerHTML.matchAll(/data-urgent-action="([^"]+)"/g)].forEach((match) => this.buttons.push(new FakeButton({ "data-urgent-action": match[1] })));
  }
  get innerHTML() { return this._innerHTML; }
  scrollIntoView() {}
  querySelector(selector) {
    if (selector === "[data-urgent-live-status]") return null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "[data-action]") return this.buttons.filter((button) => button.hasAttribute("data-action"));
    if (selector === "[data-scheduled-choice]") return this.buttons.filter((button) => button.hasAttribute("data-scheduled-choice"));
    if (selector === "[data-urgent-action]") return this.buttons.filter((button) => button.hasAttribute("data-urgent-action"));
    if (selector === "[data-urgent-field]" || selector === "[data-urgent-choice]") return [];
    return [];
  }
}

class FakeMount {
  constructor() {
    this._html = "";
    this.mountCache = new Map();
    this.singleCache = new Map();
    this.multiCache = new Map();
  }
  set innerHTML(value) {
    this._html = String(value || "");
    this.mountCache.clear();
    this.singleCache.clear();
    this.multiCache.clear();
  }
  get innerHTML() { return this._html; }
  appendChild() {}
  _findOwner(attr) {
    if (this._html.includes(attr)) return this;
    for (const child of this.mountCache.values()) {
      const found = child._findOwner(attr);
      if (found) return found;
    }
    return null;
  }
  static parseAttrs(tagHtml) {
    const attrs = {};
    [...tagHtml.matchAll(/([a-z-]+)="([^"]*)"/g)].forEach(([, k, v]) => { attrs[k] = v; });
    return attrs;
  }
  querySelector(selector) {
    const m = selector.match(/\[data-([a-z-]+)\]/);
    if (!m) return null;
    const attr = `data-${m[1]}`;
    if (attr === "data-store-body" || attr === "data-store-grid-mount" || attr === "data-contact-sheet-mount" || attr === "data-store-detail-body") {
      const owner = this._findOwner(attr);
      if (!owner) return null;
      if (!owner.mountCache.has(attr)) owner.mountCache.set(attr, new FakeMount());
      return owner.mountCache.get(attr);
    }
    const owner = this._findOwner(attr);
    if (!owner) return null;
    if (owner.singleCache.has(attr)) return owner.singleCache.get(attr);
    const tagMatch = owner._html.match(new RegExp(`<(input|select|button)[^>]*${attr}[^>]*>`));
    if (!tagMatch) return null;
    const attrs = FakeMount.parseAttrs(tagMatch[0]);
    const el = tagMatch[1] === "button" ? new FakeButton(attrs) : new FakeInput(attrs);
    owner.singleCache.set(attr, el);
    return el;
  }
  querySelectorAll(selector) {
    const m = selector.match(/\[data-([a-z-]+)\]/);
    if (!m) return [];
    const attr = `data-${m[1]}`;
    const owner = this._findOwner(attr);
    if (!owner) return [];
    if (owner.multiCache.has(attr)) return owner.multiCache.get(attr);
    const results = [];
    for (const match of owner._html.matchAll(new RegExp(`<button[^>]*${attr}="([^"]*)"[^>]*>`, "g"))) {
      results.push(new FakeButton(FakeMount.parseAttrs(match[0])));
    }
    owner.multiCache.set(attr, results);
    return results;
  }
}

class FakeInput {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.value = attrs.value || "";
    this.listeners = {};
  }
  getAttribute(name) { return this.attrs[name] || ""; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  async dispatch(type) {
    if (this.listeners[type]) await this.listeners[type]({});
  }
}

function loadCustomerFrontend(context = makeContext()) {
  return load(context, [
    "customer-app/modules/utils.js",
    "customer-app/modules/state.js",
    "customer-app/modules/api.js",
    "customer-app/modules/services.js",
    "customer-app/modules/ui.js",
    "customer-app/modules/store.js",
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
  const build = "20260623_catalog_marketplace_v2";

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

test("store module is loaded in index.html and precached in the service worker app shell", () => {
  const index = read("customer-app/index.html");
  const sw = read("customer-app/sw.js");
  const build = "20260623_catalog_marketplace_v2";

  assert.match(index, new RegExp(`modules/store\\.js\\?v=${build}`));
  assert.match(sw, /`\.\/modules\/store\.js\?v=\$\{BUILD_ID\}`/);
});

test("bottom navigation has exactly 5 items in the required order with a centered primary booking action", () => {
  const index = read("customer-app/index.html");
  const navMatch = index.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/);
  assert.ok(navMatch, "bottom-nav markup not found");
  const navHtml = navMatch[0];
  const routes = [...navHtml.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(routes, ["home", "store", "booking", "tracking", "profile"]);
  const bookingButtonMatch = navHtml.match(/<button[^>]*data-route="booking"[^>]*>/);
  assert.ok(bookingButtonMatch, "booking nav button not found");
  assert.match(bookingButtonMatch[0], /class="[^"]*nav-item-primary[^"]*"/);
});

test("store route is registered in the router setup", () => {
  const app = read("customer-app/assets/customer-app.js");
  assert.match(app, /store:\s*App\.store\.render/);
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

test("customer urgent booking reuses existing offer flow without client fake appointment", () => {
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const api = read("customer-app/modules/api.js");
  const server = read("index.js");

  assert.doesNotMatch(urgent, /nextUrgentAppointmentIso/);
  assert.doesNotMatch(urgent, /appointment_datetime:\s*nextUrgentAppointmentIso/);
  assert.match(urgent, /allow_time_proposal:\s*true/);
  assert.match(api, /dispatch_mode:\s*"offer"/);
  assert.match(api, /allow_time_proposal:\s*true/);
  assert.match(server, /function handlePublicCustomerUrgentBook/);
  assert.match(server, /return handleAdminBookV2\(req,\s*res\)/);
  assert.match(server, /req\.cwfBookSource = "customer"/);
});

test("customer urgent waiting room polls anonymous existing offer status", () => {
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const api = read("customer-app/modules/api.js");
  const server = read("index.js");

  assert.match(api, /loadUrgentStatus/);
  assert.match(urgent, /pollUrgentStatus/);
  assert.match(urgent, /data-urgent-live-status/);
  assert.match(server, /app\.get\("\/public\/urgent-status"/);
  const statusRoute = server.slice(server.indexOf('app.get("/public/urgent-status"'), server.indexOf('app.get("/public/track"'));
  assert.match(statusRoute, /next_offer_expires_at/);
  assert.match(statusRoute, /phase/);
  assert.doesNotMatch(statusRoute, /tech_name|full_name|matrix_json|technician_count/);
});

test("urgent waiting room navigates to tracking once the live status reports an accepted offer", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => { routeCalls.push(route); root.state.setRoute(route); };
  root.state.setRoute("urgent");
  root.state.setUrgentFlow({
    step: "waiting", status: "success", error: "",
    result: { booking_code: "BK1", token: "TOK1", offers_count: 1 },
    liveStatus: null, liveStatusError: "",
  });
  root.api.loadUrgentStatus = async () => ({
    success: true, booking_code: "BK1", phase: "accepted", confirmed: true, terminal: false,
    server_now: "2026-06-22T10:00:00+07:00", next_offer_expires_at: null, allow_time_proposal: true,
  });

  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(routeCalls, ["tracking"]);
  assert.equal(root.state.draft.tracking.trackingCode, "TOK1");
  root.bookingUrgent.render.onLeave();
});

test("urgent waiting room shows the terminal message and stops polling without navigating", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => { routeCalls.push(route); root.state.setRoute(route); };
  root.state.setRoute("urgent");
  root.state.setUrgentFlow({
    step: "waiting", status: "success", error: "",
    result: { booking_code: "BK2", token: "TOK2", offers_count: 1 },
    liveStatus: null, liveStatusError: "",
  });
  let calls = 0;
  root.api.loadUrgentStatus = async () => {
    calls += 1;
    return {
      success: true, booking_code: "BK2", phase: "admin_review", confirmed: false, terminal: true,
      server_now: "2026-06-22T10:00:00+07:00", next_offer_expires_at: null, allow_time_proposal: true,
    };
  };

  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(routeCalls, []);
  assert.equal(root.state.urgentFlow.liveStatus.terminal, true);
  assert.match(container.innerHTML, /คำขอคิวด่วนนี้ปิดแล้ว/);
  assert.equal(calls, 1);
  root.bookingUrgent.render.onLeave();
});

test("urgent request key is generated once, reused on resubmits, and cleared on a genuinely new request", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.updateDraft("urgent", {
    customer_name: "Somchai", customer_phone: "0812345678", address_text: "123 Rd", symptom: "ไม่เย็น",
  });
  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);

  let capturedPayload = null;
  root.api.submitUrgentRequest = async (payload) => { capturedPayload = payload; return { success: true, booking_code: "BK3", token: "TOK3" }; };

  root.state.setUrgentFlow({ step: "review" });
  root.bookingUrgent.render(container);
  return container.querySelectorAll("[data-urgent-action]")
    .find((button) => button.getAttribute("data-urgent-action") === "confirm").click()
    .then(() => {
      assert.ok(capturedPayload.urgent_request_key);
      assert.equal(capturedPayload.urgent_request_key.length >= 16, true);
      const firstKey = capturedPayload.urgent_request_key;
      assert.equal(root.state.draft.urgent.urgent_request_key, firstKey);

      root.bookingUrgent.render.onLeave();

      // While the request is still non-terminal (waiting/time_proposed/
      // admin_review), "new-request" must be a no-op: the key must survive.
      return container.querySelectorAll("[data-urgent-action]")
        .find((button) => button.getAttribute("data-urgent-action") === "new-request")
        .click()
        .then(() => {
          assert.equal(root.state.draft.urgent.urgent_request_key, firstKey);

          // Only once the live status is genuinely terminal does the
          // "new-request" action clear the key and reset the flow.
          root.state.setUrgentFlow({ liveStatus: { terminal: true, phase: "closed" } });
          root.bookingUrgent.render(container);
          return container.querySelectorAll("[data-urgent-action]")
            .find((button) => button.getAttribute("data-urgent-action") === "new-request")
            .click();
        });
    })
    .then(() => {
      assert.equal(root.state.draft.urgent.urgent_request_key, "");
    });
});

test("store contains no hardcoded fake catalog items and only sources data from the real API", () => {
  const storeSrc = read("customer-app/modules/store.js");
  assert.match(storeSrc, /root\.api\.loadCatalogItems\(\)/);
  assert.doesNotMatch(storeSrc, /item_name:\s*"/);
  assert.doesNotMatch(storeSrc, /base_price:\s*\d/);
});

test("store loads real catalog items via root.api.loadCatalogItems and renders them", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  let calls = 0;
  root.api.loadCatalogItems = async () => {
    calls += 1;
    return [
      { item_id: 1, item_name: "ล้างแอร์ผนัง 12000 BTU", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 12000 },
      { item_id: 2, item_name: "ซ่อมแอร์ไม่เย็น", item_category: "ซ่อมแอร์", base_price: 0, unit_label: "งาน" },
    ];
  };

  const container = new FakeMount();
  root.store.render(container);
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /ล้างแอร์ผนัง 12000 BTU/);
  assert.match(body.innerHTML, /700/);
  assert.match(body.innerHTML, /สอบถามราคา/);
});

test("store renders an honest empty state instead of mock products when the API returns no items", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.doesNotMatch(body.innerHTML, /store-card/);
  assert.match(body.innerHTML, /ยังไม่มีรายการที่เปิดให้ลูกค้าดู/);
});

test("store renders an error state with a working retry button that re-fetches", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  let calls = 0;
  root.api.loadCatalogItems = async () => {
    calls += 1;
    if (calls === 1) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    return [{ item_id: 9, item_name: "ล้างแอร์สี่ทิศทาง", item_category: "ล้างแอร์", base_price: 1200, unit_label: "เครื่อง" }];
  };

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  let body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /is-error/);
  const retry = container.querySelector("[data-store-retry]");
  assert.ok(retry, "retry button not found in error state");

  await retry.click();
  body = container.querySelector("[data-store-body]");
  assert.equal(calls, 2);
  assert.match(body.innerHTML, /ล้างแอร์สี่ทิศทาง/);
});

test("store search and category filters narrow already-loaded items without extra API calls", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  let calls = 0;
  root.api.loadCatalogItems = async () => {
    calls += 1;
    return [
      { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
      { item_id: 2, item_name: "ล้างแอร์เปลือย", item_category: "ล้างแอร์", base_price: 800, unit_label: "เครื่อง" },
      { item_id: 3, item_name: "ซ่อมคอมเพรสเซอร์", item_category: "ซ่อมแอร์", base_price: 0, unit_label: "งาน" },
    ];
  };

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const search = container.querySelector("[data-store-search]");
  assert.ok(search, "search input not found");
  search.value = "เปลือย";
  await search.dispatch("input");

  let grid = container.querySelector("[data-store-grid-mount]");
  assert.match(grid.innerHTML, /ล้างแอร์เปลือย/);
  assert.doesNotMatch(grid.innerHTML, /ล้างแอร์ผนัง/);
  assert.doesNotMatch(grid.innerHTML, /ซ่อมคอมเพรสเซอร์/);

  search.value = "";
  await search.dispatch("input");

  const category = container.querySelector("[data-store-category]");
  assert.ok(category, "category select not found");
  category.value = "ซ่อมแอร์";
  await category.dispatch("change");

  grid = container.querySelector("[data-store-grid-mount]");
  assert.match(grid.innerHTML, /ซ่อมคอมเพรสเซอร์/);
  assert.doesNotMatch(grid.innerHTML, /ล้างแอร์ผนัง/);
  assert.doesNotMatch(grid.innerHTML, /ล้างแอร์เปลือย/);

  assert.equal(calls, 1);
});

test("store shows a contact button (never a booking button) for an item without an explicit bookable booking_mode", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /data-store-contact="1"/);
  assert.doesNotMatch(body.innerHTML, /data-store-book="1"/);

  assert.doesNotMatch(container.innerHTML, /ราคาที่แน่นอนตอนจอง/);
  assert.doesNotMatch(container.innerHTML, /เพิ่มในรายการจอง/);
  assert.doesNotMatch(container.innerHTML, /เพิ่มลงตะกร้า/);
});

test("store shows a real booking button only when the item's booking_mode is explicitly bookable", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 12000 },
    { item_id: 2, item_name: "ติดตั้งแอร์ใหม่", item_category: "ติดตั้ง", base_price: 0, unit_label: "งาน", booking_mode: "contact_admin" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /data-store-book="1"/);
  assert.doesNotMatch(body.innerHTML, /data-store-book="2"/);
  assert.match(body.innerHTML, /data-store-contact="2"/);
});

test("store BTU label formats min/max/range/neither cases correctly", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "รุ่นช่วงบีทียู", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", btu_min: 9000, btu_max: 12000 },
    { item_id: 2, item_name: "รุ่นบีทียูเท่ากัน", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", btu_min: 12000, btu_max: 12000 },
    { item_id: 3, item_name: "รุ่นมีแค่ต่ำสุด", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", btu_min: 18000 },
    { item_id: 4, item_name: "รุ่นมีแค่สูงสุด", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", btu_max: 12000 },
    { item_id: 5, item_name: "รุ่นไม่มีบีทียู", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /9,000–12,000 BTU/);
  assert.match(body.innerHTML, /12,000 BTU/);
  assert.match(body.innerHTML, /ตั้งแต่ 18,000 BTU/);
  assert.match(body.innerHTML, /ไม่เกิน 12,000 BTU/);

  const card5 = body.innerHTML.split("รุ่นไม่มีบีทียู")[1] || "";
  const nextCardBoundary = card5.indexOf("</article>");
  const card5Scope = nextCardBoundary >= 0 ? card5.slice(0, nextCardBoundary) : card5;
  assert.doesNotMatch(card5Scope, /BTU/);
});

test("store renders the real image_url with lazy loading and an alt from the item name", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", image_url: "https://res.cloudinary.com/demo/x.jpg" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /<img class="store-card-slide" src="https:\/\/res\.cloudinary\.com\/demo\/x\.jpg" alt="ล้างแอร์ผนัง" loading="lazy"/);
});

test("store shows a placeholder when an item has no image_url", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /store-card-image-placeholder/);
  assert.doesNotMatch(body.innerHTML, /<img class="store-card-image"/);
});

test("store image has an onerror fallback to the placeholder for broken images", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", image_url: "https://res.cloudinary.com/demo/broken.jpg" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /onerror="this\.style\.visibility='hidden';"/);
});

test("store shows the real sale price prominently with the normal price struck through when discounted", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    {
      item_id: 1, item_name: "ล้างแอร์โปรหน้าฝน", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
      display_price: 500, normal_price: 700, active_price: 500, has_active_promotion: true, campaign_name: "โปรดูแลแอร์รับหน้าฝน",
    },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /class="price-text[^"]*">500/);
  assert.match(body.innerHTML, /class="price-strike">700/);
  assert.match(body.innerHTML, /class="store-badge store-badge-promo">โปรดูแลแอร์รับหน้าฝน/);
});

test("store falls back to base_price when there is no active price rule", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 650, unit_label: "เครื่อง", display_price: null, has_promo: false },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /650/);
  assert.doesNotMatch(body.innerHTML, /สอบถามราคา/);
});

test("store grid uses a 2-column-first mobile layout that expands at larger breakpoints", () => {
  const css = read("customer-app/assets/customer-app.css");
  const gridBlock = css.slice(css.indexOf(".store-grid {"), css.indexOf(".store-grid {") + 400);
  assert.match(gridBlock, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(min-width: 700px\)[\s\S]{0,80}repeat\(3,/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]{0,80}repeat\(4,/);
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]{0,80}repeat\(5,/);
});

test("store card shows a multi-image slider with dot indicators when an item has several images", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    {
      item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
      images: [
        { image_id: 1, image_url: "https://res.cloudinary.com/demo/a.jpg", alt_text: null },
        { image_id: 2, image_url: "https://res.cloudinary.com/demo/b.jpg", alt_text: null },
        { image_id: 3, image_url: "https://res.cloudinary.com/demo/c.jpg", alt_text: null },
      ],
    },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.equal((body.innerHTML.match(/class="store-card-slide"/g) || []).length, 3);
  assert.match(body.innerHTML, /store-card-dots/);
  assert.equal((body.innerHTML.match(/class="store-card-dot is-active"/g) || []).length, 1);
});

test("storeItem dynamic route is registered and dispatches to the product detail handler with the numeric id", () => {
  const shell = read("customer-app/assets/customer-app.js");
  assert.match(shell, /storeItem:\s*App\.store\.renderDetail/);

  const context = makeContext();
  const root = load(context, ["customer-app/modules/utils.js", "customer-app/modules/state.js", "customer-app/modules/router.js"]);
  root.router.register({ home() {}, store() {}, storeItem() {} });

  assert.equal(root.router.canonicalRoute("storeItem-42"), "storeItem-42");
  assert.equal(root.router.resolveHandler("storeItem-42"), root.router.routes.storeItem);
  assert.equal(root.router.routeParam("storeItem-42"), "42");
  assert.equal(root.router.routeParam("store"), "");
  assert.equal(root.router.canonicalRoute("storeItem-abc"), "home");
});

test("product detail page loads the real item by id and renders gallery, content, and a working back button", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-7");
  let requestedId = null;
  root.api.loadCatalogItem = async (id) => {
    requestedId = id;
    return {
      item_id: 7, item_name: "ล้างแอร์พรีเมียม", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง",
      booking_mode: "bookable", short_description: "สั้นๆ", long_description: "ยาวๆ", service_conditions: "เงื่อนไข",
      highlights: ["จุดเด่นหนึ่ง", "จุดเด่นสอง"],
      images: [
        { image_id: 1, image_url: "https://res.cloudinary.com/demo/a.jpg", alt_text: null },
        { image_id: 2, image_url: "https://res.cloudinary.com/demo/b.jpg", alt_text: null },
      ],
    };
  };

  const container = new FakeMount();
  root.store.renderDetail(container);
  assert.equal(requestedId, "7");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /ล้างแอร์พรีเมียม/);
  assert.match(body.innerHTML, /สั้นๆ/);
  assert.match(body.innerHTML, /ยาวๆ/);
  assert.match(body.innerHTML, /เงื่อนไข/);
  assert.match(body.innerHTML, /จุดเด่นหนึ่ง/);
  assert.equal((body.innerHTML.match(/class="store-detail-slide"/g) || []).length, 2);
  assert.match(body.innerHTML, /data-store-detail-back/);

  const storeSrc = read("customer-app/modules/store.js");
  const backBinding = storeSrc.slice(storeSrc.indexOf("[data-store-detail-back]"), storeSrc.indexOf("[data-store-detail-back]") + 150);
  assert.match(backBinding, /routeTo\("store"\)/);
});

test("product detail shows a 404-style not-found error when the catalog item does not exist", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-999");
  root.api.loadCatalogItem = async () => {
    const error = new Error("ไม่พบรายการนี้");
    error.status = 404;
    throw error;
  };

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /ไม่พบรายการนี้/);
  assert.doesNotMatch(body.innerHTML, /data-store-detail-book/);
});

test("product detail escapes hostile text in description, highlight, and image alt fields", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-1");
  root.api.loadCatalogItem = async () => ({
    item_id: 1,
    item_name: '<img src=x onerror=alert(1)>',
    item_category: "ล้างแอร์",
    base_price: 700,
    unit_label: "เครื่อง",
    short_description: '<script>alert("short")</script>',
    long_description: '<script>alert("long")</script>',
    service_conditions: '<script>alert("cond")</script>',
    highlights: ['<script>alert("hl")</script>'],
    images: [{ image_id: 1, image_url: "https://res.cloudinary.com/demo/a.jpg", alt_text: '<script>alert("alt")</script>' }],
  });

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.doesNotMatch(body.innerHTML, /<script>/);
  assert.match(body.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(body.innerHTML, /<img src=x onerror=alert\(1\)>/);
});

test("clicking a bookable card's book button prefills the real scheduled draft from the catalog item's booking fields", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    {
      item_id: 1, item_name: "ล้างแอร์แขวนพรีเมียม", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง",
      booking_mode: "bookable", booking_ac_type: "แขวน", booking_btu: 18000, booking_wash_variant: "ล้างพรีเมียม",
    },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const routeCalls = [];
  root.utils.routeTo = (route) => routeCalls.push(route);
  const book = container.querySelectorAll("[data-store-book]")[0];
  assert.ok(book);
  await book.click();

  assert.deepEqual(routeCalls, ["scheduled"]);
  assert.equal(root.state.draft.scheduled.ac_type, "แขวน");
  assert.equal(root.state.draft.scheduled.btu, "18000");
});

test("a contact_admin item's contact button never applies a commerce draft or routes into booking", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 2, item_name: "ติดตั้งแอร์ใหม่", item_category: "ติดตั้ง", base_price: 0, unit_label: "งาน", booking_mode: "contact_admin" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const routeCalls = [];
  root.utils.routeTo = (route) => routeCalls.push(route);
  let applyCalled = false;
  root.services.applyCommerceDraft = (...args) => { applyCalled = true; return true; };
  root.ui.openContactSheet = () => {};

  const contact = container.querySelectorAll("[data-store-contact]")[0];
  assert.ok(contact);
  await contact.click();

  assert.equal(applyCalled, false);
  assert.deepEqual(routeCalls, []);
});

test("legacy single-image catalog items still render through the gallery fallback on the product detail page", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-3");
  root.api.loadCatalogItem = async () => ({
    item_id: 3, item_name: "ล้างแอร์รุ่นเก่า", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
    image_url: "https://res.cloudinary.com/demo/legacy.jpg",
  });

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /<img class="store-detail-slide" src="https:\/\/res\.cloudinary\.com\/demo\/legacy\.jpg"/);
  assert.doesNotMatch(body.innerHTML, /store-detail-dots/);
});

test("store shows สอบถามราคา when there is no price at all", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ซ่อมแอร์ไม่เย็น", item_category: "ซ่อมแอร์", base_price: 0, unit_label: "งาน" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /สอบถามราคา/);
});
