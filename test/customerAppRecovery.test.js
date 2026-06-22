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
  }
  set innerHTML(value) {
    this._html = String(value || "");
    this.mountCache.clear();
    this.singleCache.clear();
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
    if (attr === "data-store-body" || attr === "data-store-grid-mount" || attr === "data-contact-sheet-mount") {
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
    const results = [];
    for (const match of owner._html.matchAll(new RegExp(`<button[^>]*${attr}="([^"]*)"[^>]*>`, "g"))) {
      results.push(new FakeButton(FakeMount.parseAttrs(match[0])));
    }
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
  const build = "20260622_store_nav_phase1_v1";

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
  const build = "20260622_store_nav_phase1_v1";

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
  assert.match(body.innerHTML, /ราคาเริ่มต้น/);
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
