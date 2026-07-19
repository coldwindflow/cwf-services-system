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
    dataLayer: [],
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
    const featuredAction = [...this._innerHTML.matchAll(/data-home-featured-action="([^"]+)"/g)];
    featuredAction.forEach((match) => this.buttons.push(new FakeButton({ "data-home-featured-action": match[1] })));
    const featuredDetail = [...this._innerHTML.matchAll(/data-home-featured-detail="([^"]+)"/g)];
    featuredDetail.forEach((match) => this.buttons.push(new FakeButton({ "data-home-featured-detail": match[1] })));
  }
  get innerHTML() { return this._innerHTML; }
  appendChild() {}
  querySelector() { return null; }
  querySelectorAll(selector) {
    if (selector === "[data-commerce-service]") return this.buttons.filter((button) => button.hasAttribute("data-commerce-service"));
    if (selector === "[data-contact-service]") return this.buttons.filter((button) => button.hasAttribute("data-contact-service"));
    if (selector === "[data-home-featured-action]") return this.buttons.filter((button) => button.hasAttribute("data-home-featured-action"));
    if (selector === "[data-home-featured-detail]") return this.buttons.filter((button) => button.hasAttribute("data-home-featured-detail"));
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
    if (attr === "data-store-body" || attr === "data-store-grid-mount" || attr === "data-contact-sheet-mount" || attr === "data-store-detail-body" || attr === "data-store-reviews-section") {
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
    "customer-app/modules/customerCopy.js",
    "customer-app/modules/analytics.js",
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
  const build = "20260720_customer_booking_pr4_v2";

  assert.match(index, new RegExp(`customer-app\\.css\\?v=${build}`));
  assert.match(index, new RegExp(`modules\\/api\\.js\\?v=${build}`));
  assert.match(index, new RegExp(`modules\\/store\\.js\\?v=${build}`));
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
  const build = "20260720_customer_booking_pr4_v2";

  assert.match(index, new RegExp(`modules/store\\.js\\?v=${build}`));
  assert.match(sw, /`\.\/modules\/store\.js\?v=\$\{BUILD_ID\}`/);
});

test("store autoplay uses a ~3.5s interval, a ~5s resume delay after manual interaction, and a randomized first-tick jitter so cards do not advance in lock-step", () => {
  const storeSrc = read("customer-app/modules/store.js");
  assert.match(storeSrc, /const AUTOPLAY_INTERVAL_MS = 3500;/);
  assert.match(storeSrc, /const AUTOPLAY_RESUME_DELAY_MS = 5000;/);
  assert.match(storeSrc, /const AUTOPLAY_JITTER_MS = \d+;/);
  assert.match(storeSrc, /Math\.random\(\) \* AUTOPLAY_JITTER_MS/);
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

test("home featured service CTA writes scheduled draft from catalog metadata and routes to scheduled flow", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => {
    routeCalls.push(route);
    root.state.setRoute(route);
  };
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  root.state.setHomepage({
    status: "success",
    config: {
      version: 1,
      sections: [
        { id: "hero", type: "hero", enabled: true, sort_order: 1, title: "Home", items: [] },
        { id: "featured", type: "featured_services", enabled: true, sort_order: 2, title: "Services", items: [] },
      ],
    },
    fallback: false,
    error: "",
  });
  root.state.setCollection("catalog", {
    status: "success",
    error: "",
    items: [{
      item_id: 901,
      item_name: "ล้างแอร์ผนัง ล้างธรรมดา",
      is_featured: true,
      booking_mode: "bookable",
      booking_ac_type: "ผนัง",
      booking_btu: 9000,
      booking_wash_variant: "ล้างธรรมดา",
      job_type: "ล้าง",
      unit_label: "เครื่อง",
      display_price: 1200,
    }],
  });
  const container = new HomeContainer();

  root.ui.renderHome(container);
  const cta = container.querySelectorAll("[data-home-featured-action]").find((button) => button.getAttribute("data-home-featured-action") === "901");
  assert.ok(cta);
  await cta.click();

  assert.deepEqual(routeCalls, ["scheduled"]);
  assert.equal(root.state.scheduledWizard.step, 1);
  assert.equal(root.state.draft.scheduled.catalog_item_id, 901);
  assert.equal(root.state.draft.scheduled.ac_type, "ผนัง");
  assert.equal(root.state.draft.scheduled.btu, "9000");
  assert.equal(root.state.draft.scheduled.wash_variant, "ล้างธรรมดา");
  assert.equal(root.state.draft.scheduled.job_type, "ล้าง");
  assert.equal(root.state.draft.scheduled.selectedSlot, null);
});

test("homepage renders only enabled published sections without reviving hidden hero or featured", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  root.state.setHomepage({
    status: "success",
    fallback: false,
    error: "",
    config: {
      version: 1,
      sections: [
        { id: "hero", type: "hero", enabled: false, sort_order: 10, title: "Hidden Hero", items: [] },
        { id: "featured", type: "featured_services", enabled: false, sort_order: 20, title: "Hidden Featured", items: [] },
        { id: "trust", type: "trust", enabled: true, sort_order: 30, title: "Visible Trust", items: [{ title: "Trust A", body: "Trust body" }] },
      ],
    },
  });
  const container = new HomeContainer();

  root.ui.renderHome(container);

  assert.doesNotMatch(container.innerHTML, /Hidden Hero/);
  assert.doesNotMatch(container.innerHTML, /Hidden Featured/);
  assert.match(container.innerHTML, /Visible Trust/);
  assert.doesNotMatch(container.innerHTML, /data-homepage-featured/);
});

test("homepage section sort_order controls DOM order", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  root.state.setCollection("catalog", {
    status: "success",
    error: "",
    items: [{ item_id: 1, item_name: "Featured Item", is_featured: true, is_active: true, is_customer_visible: true }],
  });
  root.state.setHomepage({
    status: "success",
    fallback: false,
    error: "",
    config: {
      version: 1,
      sections: [
        { id: "featured", type: "featured_services", enabled: true, sort_order: 50, title: "Featured Later", body: "", items: [] },
        { id: "trust", type: "trust", enabled: true, sort_order: 10, title: "Trust First", items: [{ title: "Trust", body: "Body" }] },
      ],
    },
  });
  const container = new HomeContainer();

  root.ui.renderHome(container);

  assert.ok(container.innerHTML.indexOf("Trust First") >= 0);
  assert.ok(container.innerHTML.indexOf("Featured Later") >= 0);
  assert.ok(container.innerHTML.indexOf("Trust First") < container.innerHTML.indexOf("Featured Later"));
});

test("homepage announcement-card link targets (contact, route, external URL) render for manual sections, including the announcements section type itself", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  root.state.setHomepage({
    status: "success",
    fallback: false,
    error: "",
    config: {
      version: 1,
      sections: [
        {
          id: "quick",
          type: "quick",
          enabled: true,
          sort_order: 10,
          title: "Quick",
          items: [{ title: "Quick Contact", action: "contact", icon: "chat" }],
        },
        {
          id: "announcements",
          type: "announcements",
          enabled: true,
          sort_order: 20,
          title: "Announcements",
          items: [{ title: "Should render now", action: "contact" }],
        },
        {
          id: "updates",
          type: "updates",
          enabled: true,
          sort_order: 60,
          title: "Updates",
          items: [
            { title: "Contact Admin", action: "contact" },
            { title: "Open Store", route: "store" },
            { title: "External News", url: "https://example.com/news" },
          ],
        },
      ],
    },
  });
  const container = new HomeContainer();

  root.ui.renderHome(container);

  assert.match(container.innerHTML, /class="homepage-quick" href="#" data-home-contact="Quick Contact"/);
  assert.match(container.innerHTML, /class="homepage-announcement-card" href="#" data-home-contact="Should render now"/);
  assert.match(container.innerHTML, /class="homepage-update-card" href="#" data-home-contact="Contact Admin"/);
  assert.doesNotMatch(container.innerHTML, /data-home-contact="Contact Admin"[^>]*data-route="home"/);
  assert.doesNotMatch(container.innerHTML, /data-route="home"[^>]*Contact Admin/);
  assert.match(container.innerHTML, /class="homepage-update-card" href="#store" data-route="store"/);
  assert.match(container.innerHTML, /class="homepage-update-card" href="https:\/\/example\.com\/news" target="_blank" rel="noopener noreferrer"/);
});

test("homepage hero slider renders dots only for multiple slides", () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.auth = { displayName: () => "Customer", loadCustomer: async () => ({ logged_in: false }) };
  root.state.setHomepage({
    status: "success",
    fallback: false,
    error: "",
    config: {
      version: 1,
      sections: [{
        id: "hero",
        type: "hero",
        enabled: true,
        sort_order: 10,
        title: "Hero",
        items: [
          { title: "Slide A", cta_primary: { label: "A", route: "store" } },
          { title: "Slide B", cta_primary: { label: "B", route: "scheduled" } },
        ],
      }],
    },
  });
  const container = new HomeContainer();
  root.ui.renderHome(container);
  assert.match(container.innerHTML, /data-home-hero-dot="0"/);
  assert.match(container.innerHTML, /data-home-hero-dot="1"/);

  root.state.setHomepage({
    status: "success",
    fallback: false,
    error: "",
    config: {
      version: 1,
      sections: [{ id: "hero", type: "hero", enabled: true, sort_order: 10, title: "Single", items: [{ title: "Only" }] }],
    },
  });
  root.ui.renderHome(container);
  assert.doesNotMatch(container.innerHTML, /data-home-hero-dot=/);
});

test("homepage ui has no mojibake marker and renderHome has a single render path", () => {
  const uiSource = fs.readFileSync(path.join(__dirname, "..", "customer-app", "modules", "ui.js"), "utf8");
  assert.doesNotMatch(uiSource, /à¸|à¹/);
  assert.match(uiSource, /ดูทั้งหมด/);
  assert.equal((uiSource.match(/sectionByType\("hero"\) \|\| DEFAULT_HOME_CONFIG/g) || []).length, 0);
  const renderHomeSource = uiSource.slice(
    uiSource.indexOf("renderHome(container)"),
    uiSource.indexOf("renderBookingMode(container)"),
  );
  assert.equal((renderHomeSource.match(/container\.innerHTML/g) || []).length, 1);
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
  assert.match(container.innerHTML, /จองล้างแอร์ด่วน/);
});

test("customer urgent booking uses the PR3 pending-approval contract without client fake appointment", () => {
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const api = read("customer-app/modules/api.js");
  const server = read("server/services/booking/createBookingJob.js");

  assert.doesNotMatch(urgent, /nextUrgentAppointmentIso/);
  assert.doesNotMatch(urgent, /appointment_datetime:\s*nextUrgentAppointmentIso/);
  assert.match(urgent, /job_type:\s*"ล้าง"/);
  const urgentApi = api.slice(api.indexOf("async submitUrgentRequest"), api.indexOf("async loadCatalogItemReviews"));
  assert.match(urgentApi, /delete body\.dispatch_mode/);
  assert.match(urgentApi, /delete body\.allow_time_proposal/);
  assert.match(server, /function handlePublicCustomerUrgentBook/);
  assert.match(server, /req\.cwfBookSource = "customer"/);
  assert.match(server, /const urgentOfferEnabled = false/);
});

test("customer urgent submitted state polls status without rendering backend phase", () => {
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

test("urgent submitted pending DOM contains only pending-state copy", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("urgent");
  root.state.setUrgentFlow({
    step: "submitted", status: "success", error: "",
    result: { booking_code: "BK0", token: "TOK0" },
    liveStatus: null, liveStatusError: "",
  });
  root.api.loadUrgentStatus = async () => ({
    success: true, booking_code: "BK0", phase: "admin_review", confirmed: false, terminal: false,
  });

  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(container.innerHTML, /แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง/);
  assert.match(container.innerHTML, /รอแอดมินตรวจสอบ/);
  assert.match(container.innerHTML, /รอแอดมิน/);
  assert.doesNotMatch(container.innerHTML, /คำขอได้รับการยืนยันแล้ว|พร้อมติดตามงาน|คำขอสิ้นสุดแล้ว|คำขอนี้สิ้นสุดแล้ว|สิ้นสุดแล้ว/);
  assert.doesNotMatch(container.innerHTML, /phase|admin_review/);
  root.bookingUrgent.render.onLeave();
});

test("urgent submitted state maps approved status to safe Thai copy without automatic navigation", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => { routeCalls.push(route); root.state.setRoute(route); };
  root.state.setRoute("urgent");
  root.state.setUrgentFlow({
    step: "submitted", status: "success", error: "",
    result: { booking_code: "BK1", token: "TOK1" },
    liveStatus: null, liveStatusError: "",
  });
  root.api.loadUrgentStatus = async () => ({
    success: true, booking_code: "BK1", phase: "accepted", confirmed: true, terminal: false,
    server_now: "2026-06-22T10:00:00+07:00", next_offer_expires_at: null, allow_time_proposal: true,
  });

  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(routeCalls, []);
  assert.match(container.innerHTML, /แอดมินยืนยันคำขอแล้ว กรุณาติดตามสถานะงาน/);
  assert.match(container.innerHTML, /คำขอได้รับการยืนยันแล้ว|พร้อมติดตามงาน/);
  assert.doesNotMatch(container.innerHTML, /แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง|รอแอดมินตรวจสอบ|รอแอดมิน|คำขอสิ้นสุดแล้ว|คำขอนี้สิ้นสุดแล้ว|สิ้นสุดแล้ว/);
  assert.doesNotMatch(container.innerHTML, /phase|accepted/);
  root.bookingUrgent.render.onLeave();
});

test("urgent submitted state shows a safe terminal message and stops polling without navigating", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const routeCalls = [];
  root.utils.routeTo = (route) => { routeCalls.push(route); root.state.setRoute(route); };
  root.state.setRoute("urgent");
  root.state.setUrgentFlow({
    step: "submitted", status: "success", error: "",
    result: { booking_code: "BK2", token: "TOK2" },
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
  assert.match(container.innerHTML, /คำขอนี้สิ้นสุดแล้ว กรุณาติดต่อแอดมินหากต้องการความช่วยเหลือ/);
  assert.match(container.innerHTML, /ติดต่อแอดมินทาง LINE/);
  assert.doesNotMatch(container.innerHTML, /แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง|รอแอดมินตรวจสอบ|รอแอดมิน|คำขอได้รับการยืนยันแล้ว|แอดมินยืนยันคำขอแล้ว|พร้อมติดตามงาน/);
  assert.doesNotMatch(container.innerHTML, /phase|admin_review/);
  assert.equal(calls, 1);
  root.bookingUrgent.render.onLeave();
});

test("urgent request key is generated once and reused by a retry of the same request", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.updateDraft("urgent", {
    customer_name: "Somchai", customer_phone: "0812345678", address_text: "123 Rd", symptom: "ไม่เย็น",
  });
  const container = new WizardContainer(root);
  root.bookingUrgent.render(container);

  const capturedPayloads = [];
  root.api.submitUrgentRequest = async (payload) => {
    capturedPayloads.push(payload);
    if (capturedPayloads.length === 1) throw new TypeError("offline");
    return { success: true, booking_code: "BK3", token: "TOK3" };
  };

  root.state.setUrgentFlow({ step: "review" });
  root.bookingUrgent.render(container);
  await container.querySelectorAll("[data-urgent-action]")
    .find((button) => button.getAttribute("data-urgent-action") === "confirm").click();
  const firstKey = capturedPayloads[0].urgent_request_key;
  assert.ok(firstKey);
  assert.equal(firstKey.length >= 16, true);
  assert.equal(root.state.draft.urgent.urgent_request_key, firstKey);
  assert.match(container.innerHTML, /เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง/);

  await container.querySelectorAll("[data-urgent-action]")
    .find((button) => button.getAttribute("data-urgent-action") === "confirm").click();
  assert.equal(capturedPayloads[1].urgent_request_key, firstKey);
  assert.equal(root.state.urgentFlow.step, "submitted");
  root.bookingUrgent.render.onLeave();
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

test("store card and product detail use the exact required CTA wording for bookable vs contact_admin items", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const items = [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 12000 },
    { item_id: 2, item_name: "ติดตั้งแอร์ใหม่", item_category: "ติดตั้ง", base_price: 0, unit_label: "งาน", booking_mode: "contact_admin" },
  ];
  root.api.loadCatalogItems = async () => items;
  root.api.loadCatalogItem = async (id) => items.find((it) => String(it.item_id) === String(id));

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /data-store-book="1"[^>]*>จองคิว</);
  assert.match(body.innerHTML, /data-store-contact="2"[^>]*>สอบถามแอดมิน</);
  assert.doesNotMatch(body.innerHTML, /จองบริการนี้/);
  assert.doesNotMatch(body.innerHTML, /สอบถามรายการนี้/);

  root.state.setRoute("storeItem-1");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  let detailBody = container.querySelector("[data-store-detail-body]");
  assert.match(detailBody.innerHTML, /data-store-detail-book[^>]*>จองคิว</);

  root.state.setRoute("storeItem-2");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  detailBody = container.querySelector("[data-store-detail-body]");
  assert.match(detailBody.innerHTML, /data-store-detail-contact[^>]*>สอบถามแอดมิน</);
  assert.doesNotMatch(detailBody.innerHTML, /จองคิว/);
});

test("store card and product detail render product name before the rating badge, and price right after the rating", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const item = { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" };
  root.api.loadCatalogItems = async () => [item];
  root.api.loadCatalogItem = async () => item;

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const body = container.querySelector("[data-store-body]");
  const nameIndex = body.innerHTML.indexOf("ล้างแอร์ผนัง");
  const ratingIndex = body.innerHTML.indexOf("store-rating-badge");
  const priceIndex = body.innerHTML.indexOf("store-card-price");
  assert.ok(nameIndex > -1 && ratingIndex > -1 && priceIndex > -1);
  assert.ok(nameIndex < ratingIndex);
  assert.ok(ratingIndex < priceIndex);

  root.state.setRoute("storeItem-1");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const detailBody = container.querySelector("[data-store-detail-body]");
  const detailNameIndex = detailBody.innerHTML.indexOf("ล้างแอร์ผนัง");
  const detailRatingIndex = detailBody.innerHTML.indexOf("store-rating-badge");
  const detailPriceIndex = detailBody.innerHTML.indexOf("store-detail-price");
  assert.ok(detailNameIndex > -1 && detailRatingIndex > -1 && detailPriceIndex > -1);
  assert.ok(detailNameIndex < detailRatingIndex);
  assert.ok(detailRatingIndex < detailPriceIndex);
});

test("store hides the generic literal 'service'/'product' item_category entirely instead of showing it as a category tag", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "รายการทั่วไป", item_category: "service", base_price: 700, unit_label: "เครื่อง" },
    { item_id: 2, item_name: "สินค้าทั่วไป", item_category: "product", base_price: 700, unit_label: "ชิ้น" },
    { item_id: 3, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const body = container.querySelector("[data-store-body]");
  assert.doesNotMatch(body.innerHTML, /class="tag">service</);
  assert.doesNotMatch(body.innerHTML, /class="tag">product</);
  assert.doesNotMatch(body.innerHTML, /class="tag">บริการ</);
  assert.doesNotMatch(body.innerHTML, /class="tag">สินค้า</);
  assert.match(body.innerHTML, /class="tag">ล้างแอร์</);
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
  assert.match(body.innerHTML, /class="store-sale-badge"[^>]*>SALE -29%/);
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

test("store grid stays 2-column at every viewport width since the app shell never widens past its mobile column", () => {
  const css = read("customer-app/assets/customer-app.css");
  const gridBlock = css.slice(css.indexOf(".store-grid {"), css.indexOf(".store-grid {") + 400);
  assert.match(gridBlock, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  // .app-shell caps at max-width: 480px on every viewport, so escalating
  // .store-grid to 3/4/5 columns via viewport-width media queries squeezed
  // cards into unreadable slivers at desktop widths -- there must be no
  // such escalation.
  assert.doesNotMatch(css, /\.store-grid\s*\{\s*grid-template-columns:\s*repeat\(3,/);
  assert.doesNotMatch(css, /\.store-grid\s*\{\s*grid-template-columns:\s*repeat\(4,/);
  assert.doesNotMatch(css, /\.store-grid\s*\{\s*grid-template-columns:\s*repeat\(5,/);
});

test("store card text regions share horizontal padding while images stay edge-to-edge and CTAs align to the bottom", () => {
  const css = read("customer-app/assets/customer-app.css");
  const sharedPaddingBlock = css.slice(css.indexOf(".store-card-badges,"), css.indexOf(".store-card-badges,") + 260);
  for (const selector of [
    ".store-card-badges",
    ".store-card-head",
    ".store-rating-badge",
    ".store-booking-count",
    ".store-card-price",
    ".store-promo-info",
    ".store-card-actions",
  ]) {
    assert.match(sharedPaddingBlock, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(sharedPaddingBlock, /padding-left:\s*14px/);
  assert.match(sharedPaddingBlock, /padding-right:\s*14px/);
  const galleryBlock = css.slice(css.indexOf(".store-card-gallery {"), css.indexOf(".store-card-gallery {") + 260);
  assert.doesNotMatch(galleryBlock, /padding-left|padding-right|padding:/);
  const priceBlock = css.slice(css.indexOf(".store-card-price {"), css.indexOf(".store-card-price {") + 260);
  assert.match(priceBlock, /flex-wrap:\s*wrap/);
  assert.match(priceBlock, /column-gap:\s*8px/);
  assert.match(priceBlock, /row-gap:\s*3px/);
  assert.doesNotMatch(priceBlock, /white-space:\s*nowrap/);
  const unitBlock = css.slice(css.indexOf(".price-unit {"), css.indexOf(".price-unit {") + 120);
  assert.match(unitBlock, /flex-basis:\s*100%/);
  const actionsBlock = css.match(/\.store-card-actions \{\s*display: grid[\s\S]*?\}/)?.[0] || "";
  assert.match(actionsBlock, /margin-top:\s*auto/);
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

test("store card shows the CWF featured ribbon only for featured items, and an honest rating badge for every item", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "รายการแนะนำ", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", is_featured: true, image_url: "https://res.cloudinary.com/demo/a.jpg" },
    { item_id: 2, item_name: "รายการธรรมดา", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", is_featured: false, image_url: "https://res.cloudinary.com/demo/b.jpg" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.equal((body.innerHTML.match(/store-featured-ribbon/g) || []).length, 1);
  assert.match(body.innerHTML, /CWF แนะนำ/);
  assert.doesNotMatch(body.innerHTML, /store-badge-featured/);
  assert.equal((body.innerHTML.match(/store-rating-badge/g) || []).length, 2);
  assert.equal((body.innerHTML.match(/store-rating-label">รีวิว/g) || []).length, 2);
  assert.doesNotMatch(body.innerHTML, /มาตรฐาน CWF/);
  // neither item has real reviews yet, so both must render the honest empty
  // state: five outline stars (no filled) plus a "ยังไม่มีรีวิว" label — never
  // a fabricated full-star score or a value/count.
  assert.equal((body.innerHTML.match(/store-rating-star is-filled/g) || []).length, 0);
  assert.equal((body.innerHTML.match(/store-rating-empty">ยังไม่มีรีวิว<\/span>/g) || []).length, 2);
  assert.doesNotMatch(body.innerHTML, /store-rating-count/);
  assert.doesNotMatch(body.innerHTML, /store-rating-value/);
});

test("rating badge renders real rating_average/review_count with half stars and a visible count, but shows an honest empty state when there is no real data", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "มีรีวิวจริง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: 4.5, review_count: 12 },
    { item_id: 2, item_name: "ยังไม่มีรีวิว", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /store-rating-star is-half/);
  assert.match(body.innerHTML, /store-rating-value">4\.5<\/span>/);
  assert.match(body.innerHTML, /store-rating-count">\(12\)<\/span>/);
  // item 1 (real data) contributes 4 filled stars + 1 half; item 2 (no reviews
  // yet) contributes 0 filled stars and a "ยังไม่มีรีวิว" label instead.
  assert.equal((body.innerHTML.match(/store-rating-star is-filled/g) || []).length, 4);
  assert.match(body.innerHTML, /store-rating-empty">ยังไม่มีรีวิว<\/span>/);
});

test("rating badge star fill logic only shows a half star once the fractional part reaches 0.5; below that it rounds down to full/empty stars only", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "4.2 ดาว", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: 4.2, review_count: 6 },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /store-rating-value">4\.2<\/span>/);
  assert.match(body.innerHTML, /store-rating-count">\(6\)<\/span>/);
  assert.doesNotMatch(body.innerHTML, /store-rating-star is-half/);
  assert.equal((body.innerHTML.match(/store-rating-star is-filled/g) || []).length, 4);
});

test("rating badge ignores legacy rating_value and fails safe to the honest empty state on invalid/null rating_average or review_count", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    // legacy field present but must never be read as the rating contract
    { item_id: 1, item_name: "เคสเก่า rating_value", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_value: 4 },
    { item_id: 2, item_name: "rating_average ไม่ใช่ตัวเลข", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: "abc", review_count: 5 },
    { item_id: 3, item_name: "rating_average นอกช่วง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: 7, review_count: 3 },
    { item_id: 4, item_name: "review_count เป็น 0", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: 4.8, review_count: 0 },
    { item_id: 5, item_name: "review_count เป็น null", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", rating_average: 4.8, review_count: null },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  // every item must fail safe to the honest empty state -- outline stars + a
  // "ยังไม่มีรีวิว" label, never a fabricated full-star score or average/count
  assert.equal((body.innerHTML.match(/store-rating-badge/g) || []).length, 5);
  assert.equal((body.innerHTML.match(/store-rating-star is-filled/g) || []).length, 0);
  assert.equal((body.innerHTML.match(/store-rating-empty">ยังไม่มีรีวิว<\/span>/g) || []).length, 5);
  assert.doesNotMatch(body.innerHTML, /store-rating-star is-half/);
  assert.doesNotMatch(body.innerHTML, /store-rating-value/);
  assert.doesNotMatch(body.innerHTML, /store-rating-count/);
});

test("rating badge never displays a fabricated 5.0 average or the phrase \"มาตรฐาน CWF\"/\"คะแนนลูกค้า\" anywhere in its markup", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ยังไม่มีรีวิว", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง" },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  const badgeMatch = body.innerHTML.match(/<button type="button" class="store-rating-badge"[\s\S]*?<\/button>/);
  assert.ok(badgeMatch, "rating badge markup not found");
  assert.doesNotMatch(badgeMatch[0], /5\.0/);
  assert.doesNotMatch(badgeMatch[0], /มาตรฐาน CWF/);
  assert.doesNotMatch(badgeMatch[0], /คะแนนลูกค้า/);
  assert.match(badgeMatch[0], /รีวิว/);
});

test("product detail page uses the exact same renderRatingBadge output as the store card for both real and absent rating data", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItem = async () => ({
    item_id: 9, item_name: "ล้างแอร์มีรีวิว", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง",
    rating_average: 3.5, review_count: 8,
  });

  const container = new FakeMount();
  root.state.setRoute("storeItem-9");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /store-rating-star is-half/);
  assert.match(body.innerHTML, /store-rating-value">3\.5<\/span>/);
  assert.match(body.innerHTML, /store-rating-count">\(8\)<\/span>/);
  assert.equal((body.innerHTML.match(/store-rating-star is-filled/g) || []).length, 3);
});

test("store card and product detail gallery flag autoplay only for multi-image items with is_autoplay_enabled true", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    {
      item_id: 1, item_name: "เปิดออโต้เลื่อน", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
      is_autoplay_enabled: true,
      images: [
        { image_id: 1, image_url: "https://res.cloudinary.com/demo/a.jpg", alt_text: null },
        { image_id: 2, image_url: "https://res.cloudinary.com/demo/b.jpg", alt_text: null },
      ],
    },
    {
      item_id: 2, item_name: "ปิดออโต้เลื่อน", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
      is_autoplay_enabled: false,
      images: [
        { image_id: 3, image_url: "https://res.cloudinary.com/demo/c.jpg", alt_text: null },
        { image_id: 4, image_url: "https://res.cloudinary.com/demo/d.jpg", alt_text: null },
      ],
    },
    {
      item_id: 3, item_name: "รูปเดียวเปิดออโต้", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
      is_autoplay_enabled: true,
      image_url: "https://res.cloudinary.com/demo/e.jpg",
    },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.equal((body.innerHTML.match(/data-store-autoplay="1"/g) || []).length, 1);
});

test("product detail gallery flags autoplay for a multi-image bookable item with is_autoplay_enabled true", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-9");
  root.api.loadCatalogItem = async () => ({
    item_id: 9, item_name: "รายละเอียดออโต้เลื่อน", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง",
    is_autoplay_enabled: true, is_featured: true,
    images: [
      { image_id: 1, image_url: "https://res.cloudinary.com/demo/a.jpg", alt_text: null },
      { image_id: 2, image_url: "https://res.cloudinary.com/demo/b.jpg", alt_text: null },
    ],
  });

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /data-store-autoplay="1"/);
  assert.match(body.innerHTML, /store-featured-ribbon/);
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

test("catalog list payload without long-form fields never overwrites a loaded product detail payload", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-7");
  const detailItem = {
    item_id: 7,
    item_name: "Detail item",
    item_category: "service",
    base_price: 700,
    active_price: 650,
    normal_price: 800,
    unit_label: "unit",
    booking_mode: "bookable",
    job_category: "wash",
    ac_type: "wall",
    booking_ac_type: "wall",
    booking_btu: 12000,
    booking_wash_variant: "normal",
    has_queue_today: true,
    rating_average: 4.8,
    review_count: 12,
    booking_count: 3,
    image_url: "https://res.cloudinary.com/demo/detail.jpg",
    short_description: "Detail short",
    long_description: "Detail long",
    highlights: ["Highlight one", "Highlight two"],
    service_conditions: "Detail conditions",
  };
  const partialListItem = {
    item_id: 7,
    item_name: "Partial list item",
    item_category: "service",
    base_price: 999,
    active_price: 999,
    unit_label: "unit",
    booking_mode: "bookable",
    ac_type: "wall",
  };
  root.api.loadCatalogItem = async () => detailItem;
  root.api.loadCatalogItems = async () => [partialListItem];
  root.api.loadCatalogItemReviews = async () => ({ reviews: [], total: 0, rating_average: null, review_count: 0 });
  root.api.loadReviewEligibility = async () => ({ eligible: false, eligible_jobs: [] });

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body></section>`;
  await root.store._test.loadDetail(container, "7");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const item = root.state.storeDetail.data;
  assert.equal(item.item_id, 7);
  assert.equal(item.item_name, "Detail item");
  assert.equal(item.active_price, 650);
  assert.equal(item.image_url, "https://res.cloudinary.com/demo/detail.jpg");
  assert.equal(item.has_queue_today, true);
  assert.equal(item.booking_count, 3);
  assert.equal(item.short_description, "Detail short");
  assert.equal(item.long_description, "Detail long");
  assert.deepEqual(item.highlights, ["Highlight one", "Highlight two"]);
  assert.equal(item.service_conditions, "Detail conditions");
  const html = root.store._test.renderDetailBody();
  assert.match(html, /Detail long/);
  assert.match(html, /Detail conditions/);
  assert.match(html, /Highlight two/);
  assert.doesNotMatch(html, /Partial list item/);
});

test("opening item A then item B ignores the stale item A detail response", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const itemA = {
    item_id: 101,
    item_name: "Item A",
    item_category: "service",
    base_price: 500,
    booking_mode: "bookable",
    ac_type: "wall",
    long_description: "Long A",
    service_conditions: "Conditions A",
    highlights: ["Highlight A"],
  };
  const itemB = {
    item_id: 102,
    item_name: "Item B",
    item_category: "service",
    base_price: 900,
    booking_mode: "bookable",
    ac_type: "wall",
    long_description: "Long B",
    service_conditions: "Conditions B",
    highlights: ["Highlight B"],
    image_url: "https://res.cloudinary.com/demo/b.jpg",
    rating_average: 5,
    review_count: 1,
    booking_count: 2,
  };
  let resolveA;
  const itemAPromise = new Promise((resolve) => { resolveA = resolve; });
  root.api.loadCatalogItem = async (id) => (String(id) === "101" ? itemAPromise : itemB);
  root.api.loadCatalogItems = async () => [
    { item_id: 101, item_name: "List A", ac_type: "wall" },
    { item_id: 102, item_name: "List B", ac_type: "wall" },
  ];
  root.api.loadCatalogItemReviews = async () => ({ reviews: [], total: 0, rating_average: null, review_count: 0 });
  root.api.loadReviewEligibility = async () => ({ eligible: false, eligible_jobs: [] });

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body></section>`;
  root.state.setRoute("storeItem-101");
  const loadA = root.store._test.loadDetail(container, "101");
  root.state.setRoute("storeItem-102");
  await root.store._test.loadDetail(container, "102");
  resolveA(itemA);
  await loadA;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const item = root.state.storeDetail.data;
  assert.equal(root.state.storeDetail.itemId, "102");
  assert.equal(item.item_id, 102);
  assert.equal(item.item_name, "Item B");
  assert.equal(item.long_description, "Long B");
  assert.equal(item.service_conditions, "Conditions B");
  assert.deepEqual(item.highlights, ["Highlight B"]);
  const html = root.store._test.renderDetailBody();
  assert.match(html, /Long B/);
  assert.match(html, /Conditions B/);
  assert.doesNotMatch(html, /Long A/);
  assert.doesNotMatch(html, /Conditions A/);
});

test("store review card shows the public shortened reviewer name without คุณ prefix, full surname, or masking", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const item = { item_id: 1, item_name: "Review item", item_category: "service", base_price: 700 };
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: item, error: "" });
  root.api.loadCatalogItemReviews = async () => ({
    reviews: [{ review_id: 1, display_name: "สมชาย ใ.", rating: 5, comment: "ช่างสุภาพมาก ทำงานละเอียด", created_at: "2026-06-01T00:00:00Z" }],
    total: 1,
    rating_average: 5,
    review_count: 1,
  });

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  await root.store._test.loadReviewsList(container, item);

  const section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /สมชาย ใ\./);
  assert.match(section.innerHTML, /ช่างสุภาพมาก ทำงานละเอียด/);
  assert.doesNotMatch(section.innerHTML, /คุณ\s*สมชาย/);
  assert.doesNotMatch(section.innerHTML, /ใจดี/);
  assert.doesNotMatch(section.innerHTML, /\*\*\*\*/);
  const css = read("customer-app/assets/customer-app.css");
  const headBlock = css.slice(css.indexOf(".store-review-item-head {"), css.indexOf(".store-review-item-head {") + 220);
  const nameBlock = css.slice(css.indexOf(".store-review-item-name {"), css.indexOf(".store-review-item-name {") + 360);
  const starsBlock = css.slice(css.indexOf(".store-review-item-stars {"), css.indexOf(".store-review-item-stars {") + 180);
  assert.match(headBlock, /display:\s*flex/);
  assert.match(nameBlock, /min-width:\s*0/);
  assert.match(nameBlock, /overflow-wrap:\s*anywhere/);
  assert.match(nameBlock, /-webkit-line-clamp:\s*2/);
  assert.match(starsBlock, /flex:\s*0 0 auto/);
});

test("stale review list response from item A never replaces item B reviews", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const itemA = { item_id: 1, item_name: "Item A", item_category: "service", base_price: 700 };
  const itemB = { item_id: 2, item_name: "Item B", item_category: "service", base_price: 800 };
  let resolveA;
  root.api.loadCatalogItemReviews = async (id) => {
    if (String(id) === "1") {
      return new Promise((resolve) => { resolveA = resolve; });
    }
    return {
      reviews: [{ review_id: 2, display_name: "Reviewer B", rating: 4, comment: "Review B", created_at: "2026-06-02T00:00:00Z" }],
      total: 1,
      rating_average: 4,
      review_count: 1,
    };
  };

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: itemA, error: "" });
  const loadA = root.store._test.loadReviewsList(container, itemA);
  root.state.setRoute("storeItem-2");
  root.state.setStoreDetail({ status: "success", itemId: "2", data: itemB, error: "" });
  await root.store._test.loadReviewsList(container, itemB);
  resolveA({ reviews: [{ review_id: 1, display_name: "Reviewer A", rating: 5, comment: "Review A", created_at: "2026-06-01T00:00:00Z" }], total: 1, rating_average: 5, review_count: 1 });
  await loadA;

  const section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /Reviewer B/);
  assert.match(section.innerHTML, /Review B/);
  assert.doesNotMatch(section.innerHTML, /Reviewer A/);
  assert.doesNotMatch(section.innerHTML, /Review A/);
});

test("stale load-more response from item A is not appended into item B reviews", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const itemA = { item_id: 1, item_name: "Item A", item_category: "service", base_price: 700 };
  const itemB = { item_id: 2, item_name: "Item B", item_category: "service", base_price: 800 };
  let resolveALoadMore;
  root.api.loadCatalogItemReviews = async (id, { offset } = {}) => {
    if (String(id) === "1" && Number(offset) > 0) {
      return new Promise((resolve) => { resolveALoadMore = resolve; });
    }
    if (String(id) === "1") {
      return { reviews: [{ review_id: 1, display_name: "Reviewer A1", rating: 5, comment: "A1", created_at: "2026-06-01T00:00:00Z" }], total: 2, rating_average: 5, review_count: 2 };
    }
    return { reviews: [{ review_id: 3, display_name: "Reviewer B", rating: 4, comment: "B", created_at: "2026-06-03T00:00:00Z" }], total: 1, rating_average: 4, review_count: 1 };
  };

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: itemA, error: "" });
  await root.store._test.loadReviewsList(container, itemA);
  const appendA = root.store._test.loadReviewsList(container, itemA, { append: true });
  root.state.setRoute("storeItem-2");
  root.state.setStoreDetail({ status: "success", itemId: "2", data: itemB, error: "" });
  await root.store._test.loadReviewsList(container, itemB);
  resolveALoadMore({ reviews: [{ review_id: 2, display_name: "Reviewer A2", rating: 5, comment: "A2", created_at: "2026-06-02T00:00:00Z" }], total: 2, rating_average: 5, review_count: 2 });
  await appendA;

  const section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /Reviewer B/);
  assert.doesNotMatch(section.innerHTML, /Reviewer A1/);
  assert.doesNotMatch(section.innerHTML, /Reviewer A2/);
});

test("review load-more shows a loading state and ignores duplicate clicks while the request is pending", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const item = { item_id: 1, item_name: "Item", item_category: "service", base_price: 700 };
  let calls = 0;
  let resolveLoadMore;
  root.api.loadCatalogItemReviews = async (_id, { offset } = {}) => {
    calls += 1;
    if (Number(offset) > 0) {
      return new Promise((resolve) => { resolveLoadMore = resolve; });
    }
    return {
      reviews: [{ review_id: 1, display_name: "Reviewer 1", rating: 5, comment: "First", created_at: "2026-06-01T00:00:00Z" }],
      total: 2,
      rating_average: 5,
      review_count: 2,
    };
  };

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: item, error: "" });
  await root.store._test.loadReviewsList(container, item);
  const append = root.store._test.loadReviewsList(container, item, { append: true });

  let section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /กำลังโหลด\.\.\./);
  assert.match(section.innerHTML, /data-store-reviews-more disabled/);
  assert.equal(calls, 2);

  const more = container.querySelector("[data-store-reviews-more]");
  assert.ok(more);
  await more.click();
  assert.equal(calls, 2, "duplicate click while loading_more must not start a second request");

  resolveLoadMore({
    reviews: [{ review_id: 2, display_name: "Reviewer 2", rating: 4, comment: "Second", created_at: "2026-06-02T00:00:00Z" }],
    total: 2,
    rating_average: 4.5,
    review_count: 2,
  });
  await append;
  section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /Reviewer 1/);
  assert.match(section.innerHTML, /Reviewer 2/);
  assert.doesNotMatch(section.innerHTML, /กำลังโหลด\.\.\./);
});

test("stale eligibility response from item A never changes item B review panel", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.customer = { logged_in: true };
  const itemA = { item_id: 1, item_name: "Item A", item_category: "service", base_price: 700 };
  const itemB = { item_id: 2, item_name: "Item B", item_category: "service", base_price: 800 };
  let resolveA;
  root.api.loadReviewEligibility = async (id) => {
    if (String(id) === "1") return new Promise((resolve) => { resolveA = resolve; });
    return { eligible: false, eligible_jobs: [] };
  };

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: itemA, error: "" });
  const loadA = root.store._test.loadEligibility(container, itemA);
  root.state.setRoute("storeItem-2");
  root.state.setStoreDetail({ status: "success", itemId: "2", data: itemB, error: "" });
  await root.store._test.loadEligibility(container, itemB);
  resolveA({ eligible: true, eligible_jobs: [{ job_id: 1, appointment_datetime: "2026-06-01T10:00:00Z" }] });
  await loadA;

  const section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /เขียนรีวิวได้หลังงานบริการเสร็จสมบูรณ์/);
  assert.doesNotMatch(section.innerHTML, /data-store-review-open/);
  assert.doesNotMatch(section.innerHTML, /คุณยังไม่มีงาน/);
});

test("eligibility error shows retry for the current item instead of a no-eligible-job message", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.customer = { logged_in: true };
  const item = { item_id: 9, item_name: "Item 9", item_category: "service", base_price: 700 };
  let calls = 0;
  root.api.loadReviewEligibility = async (id) => {
    calls += 1;
    assert.equal(String(id), "9");
    if (calls === 1) throw new Error("network down");
    return { eligible: true, eligible_jobs: [{ job_id: 99, appointment_datetime: "2026-06-01T10:00:00Z" }] };
  };

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-9");
  root.state.setStoreDetail({ status: "success", itemId: "9", data: item, error: "" });
  await root.store._test.loadEligibility(container, item);
  let section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /ตรวจสอบสิทธิ์รีวิวไม่สำเร็จ/);
  assert.match(section.innerHTML, /ลองใหม่/);
  assert.doesNotMatch(section.innerHTML, /คุณยังไม่มีงาน/);

  const retry = container.querySelector("[data-store-review-retry]");
  assert.ok(retry);
  await retry.click();
  section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /data-store-review-open/);
  assert.doesNotMatch(section.innerHTML, /network down/);

  await container.querySelector("[data-store-review-open]").click();
  section = container.querySelector("[data-store-reviews-section]");
  assert.match(section.innerHTML, /data-store-review-next/);
  assert.doesNotMatch(section.innerHTML, /network down/);
});

test("stale review submit response from item A never patches item B detail state", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.customer = { logged_in: true };
  const itemA = { item_id: 1, item_name: "Item A", item_category: "service", base_price: 700 };
  const itemB = { item_id: 2, item_name: "Item B", item_category: "service", base_price: 800 };
  root.api.loadReviewEligibility = async () => ({ eligible: true, eligible_jobs: [{ job_id: 11, appointment_datetime: "2026-06-01T10:00:00Z" }] });
  root.api.loadCatalogItem = async () => itemB;
  root.api.loadCatalogItems = async () => [itemB];
  root.api.loadCatalogItemReviews = async () => ({ reviews: [], total: 0, rating_average: null, review_count: 0 });
  let resolveSubmit;
  root.api.submitCatalogItemReview = async () => new Promise((resolve) => { resolveSubmit = resolve; });

  const container = new FakeMount();
  container.innerHTML = `<section data-store-detail-body><div data-store-reviews-section></div></section>`;
  root.state.setRoute("storeItem-1");
  root.state.setStoreDetail({ status: "success", itemId: "1", data: itemA, error: "" });
  await root.store._test.loadEligibility(container, itemA);
  await container.querySelector("[data-store-review-open]").click();
  await container.querySelectorAll("[data-review-star]")[4].click();
  await container.querySelector("[data-store-review-next]").click();
  const submitPromise = container.querySelector("[data-store-review-confirm]").click();

  root.state.setRoute("storeItem-2");
  await root.store._test.loadDetail(container, "2");
  resolveSubmit({ review_id: 1, moderation_status: "pending" });
  await submitPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  assert.equal(root.state.storeDetail.itemId, "2");
  assert.match(body.innerHTML, /Item B/);
  assert.doesNotMatch(body.innerHTML, /ส่งรีวิวแล้ว/);
  assert.doesNotMatch(body.innerHTML, /Item A/);
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

test("a bookable item with incomplete/invalid booking fields never reaches the scheduled booking route", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    {
      // booking_mode is "bookable" and booking_service_key is set, but the
      // frontend does not use booking_service_key as a prefill source — without
      // a supported booking_ac_type/booking_btu this item must never open the
      // booking screen, only the contact-admin sheet.
      item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง",
      booking_mode: "bookable", booking_service_key: "wash_wall",
    },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const routeCalls = [];
  root.utils.routeTo = (route) => routeCalls.push(route);
  let applyCalled = false;
  root.services.applyCommerceDraft = (...args) => { applyCalled = true; return true; };
  let contactSheetOpened = false;
  root.ui.openContactSheet = () => { contactSheetOpened = true; };

  const book = container.querySelectorAll("[data-store-book]")[0];
  assert.ok(book);
  await book.click();

  assert.equal(applyCalled, false);
  assert.deepEqual(routeCalls, []);
  assert.equal(contactSheetOpened, true);
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

// Tracking page must never render the legacy technician-review form
// (data-review-form) at the same time as the new catalog-review form
// (data-catalog-review-form) for one job -- a customer must only ever see
// one review form. The catalog review's own server-derived eligibility
// gates whether it shows a form vs a status summary vs nothing; the legacy
// form is a fallback used only when data.catalog_review itself is absent
// (older API shape / migration not yet applied).
function loadTrackingFrontend(context = makeContext()) {
  return load(context, [
    "customer-app/modules/utils.js",
    "customer-app/modules/state.js",
    "customer-app/modules/api.js",
    "customer-app/modules/tracking.js",
  ]);
}

class TrackingContainer {
  constructor() { this._html = ""; }
  set innerHTML(value) { this._html = String(value || ""); }
  get innerHTML() { return this._html; }
  querySelector(selector) {
    if (selector === "#tracking-code") return { value: "", addEventListener() {} };
    if (selector === "[data-action='track-read']") return { addEventListener() {} };
    return null;
  }
  querySelectorAll() { return []; }
}

function renderTracking(root, data) {
  root.state.updateDraft("tracking", { trackingCode: data.booking_token || data.booking_code || "TOK1" });
  root.state.setTracking({ status: "success", data, error: "" });
  const container = new TrackingContainer();
  root.tracking.render(container);
  return container.innerHTML;
}

// A token-level lookup (the app received the long booking_token at booking
// time): access_level "token" travels alongside it. The legacy technician
// review form is a WRITE and only renders on token access — see the P0-5
// tracking privacy split — so these done-job fixtures carry it explicitly.
const DONE_JOB_BASE = {
  access_level: "token",
  booking_token: "TOK1", booking_code: "BK1", job_status: "เสร็จแล้ว", finished_at: "2026-06-20T10:00:00Z",
};

test("tracking page shows exactly one (catalog) review form when catalog_review is eligible", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    ...DONE_JOB_BASE,
    review: { already_reviewed: false },
    catalog_review: { eligible: true, already_reviewed: false },
  });
  assert.match(html, /data-catalog-review-form/);
  assert.doesNotMatch(html, /data-review-form/);
});

test("tracking page shows exactly one (catalog) review status summary when already reviewed via the catalog flow", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    ...DONE_JOB_BASE,
    review: { already_reviewed: false },
    catalog_review: { already_reviewed: true, review: { rating: 5, moderation_status: "approved", comment: "ดีมาก" } },
  });
  assert.match(html, /รีวิวบริการนี้/);
  assert.doesNotMatch(html, /data-review-form/);
  assert.doesNotMatch(html, /data-catalog-review-form/);
});

test("tracking page falls back to the legacy review form when catalog_review is unavailable (older API shape / unmigrated schema)", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    ...DONE_JOB_BASE,
    review: { already_reviewed: false },
    // no catalog_review key at all
  });
  assert.match(html, /data-review-form/);
  assert.doesNotMatch(html, /data-catalog-review-form/);
});

test("tracking page shows no review form at all before the job is done", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    booking_token: "TOK1", booking_code: "BK1", job_status: "กำลังดำเนินการ", finished_at: "",
    review: { already_reviewed: false },
    catalog_review: { eligible: true, already_reviewed: false },
  });
  assert.doesNotMatch(html, /data-review-form/);
  assert.doesNotMatch(html, /data-catalog-review-form/);
});

test("tracking page never renders both data-review-form and data-catalog-review-form together, across every catalog_review state", () => {
  const root = loadTrackingFrontend();
  const states = [
    { catalog_review: { eligible: true, already_reviewed: false } },
    { catalog_review: { eligible: false, already_reviewed: true, review: { rating: 4, moderation_status: "pending" } } },
    { catalog_review: { eligible: false, already_reviewed: false } },
    {},
  ];
  for (const extra of states) {
    const html = renderTracking(root, { ...DONE_JOB_BASE, review: { already_reviewed: false }, ...extra });
    const hasLegacy = /data-review-form/.test(html);
    const hasCatalog = /data-catalog-review-form/.test(html);
    assert.ok(!(hasLegacy && hasCatalog), `both forms rendered for state ${JSON.stringify(extra)}`);
  }
});

// ---------- Store/Product-Detail marketplace UX overhaul ----------

test("store availability badge shows มีคิววันนี้ only when item.has_queue_today is true (real data, never hardcoded for all items), and stays consistent between the list and the detail page", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => [
    { item_id: 1, item_name: "ล้างแอร์ A", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", has_queue_today: true },
    { item_id: 2, item_name: "ล้างแอร์ B", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", has_queue_today: false },
  ];

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /มีคิววันนี้/);
  const itemBChunk = body.innerHTML.slice(body.innerHTML.indexOf('data-store-item="2"'));
  const itemBCard = itemBChunk.slice(0, itemBChunk.indexOf("</article>"));
  assert.match(itemBCard, /จองได้/);
  assert.doesNotMatch(itemBCard, /มีคิววันนี้/);

  root.state.setRoute("storeItem-1");
  root.api.loadCatalogItem = async () => ({ item_id: 1, item_name: "ล้างแอร์ A", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", has_queue_today: true });
  const detailContainer = new FakeMount();
  root.store.renderDetail(detailContainer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const detailBody = detailContainer.querySelector("[data-store-detail-body]");
  assert.match(detailBody.innerHTML, /มีคิววันนี้/);
});

test("product detail restructures into a top always-visible zone plus default-collapsed accordion sections for highlights/full details/suitable AC types/conditions", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-5");
  root.api.loadCatalogItem = async () => ({
    item_id: 5, item_name: "ล้างแอร์เปลือยใต้ฝ้า", item_category: "ล้างแอร์", base_price: 650, unit_label: "เครื่อง",
    booking_mode: "bookable", job_category: "ล้าง", ac_type: "เปลือยใต้ฝ้า",
    short_description: "ล้างทำความสะอาดแอร์เปลือยใต้ฝ้าโดยช่างมืออาชีพ",
    long_description: "รายละเอียดบริการแบบยาวมาก ๆ ที่อธิบายขั้นตอนทั้งหมด",
    service_conditions: "ลูกค้าต้องเตรียมพื้นที่ให้ช่างเข้าถึงเครื่องได้สะดวก",
    highlights: ["ช่างผ่านการคัดกรอง", "รับประกันงาน 7 วัน"],
  });

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const html = body.innerHTML;

  assert.match(html, /class="[^"]*store-detail-summary[^"]*"/);
  assert.match(html, /ล้างทำความสะอาดแอร์เปลือยใต้ฝ้าโดยช่างมืออาชีพ/);

  const detailsBlocks = [...html.matchAll(/<details class="store-detail-accordion"([^>]*)>[\s\S]*?<span class="store-detail-accordion-title">([^<]+)<\/span>/g)];
  assert.ok(detailsBlocks.length >= 4, "expected at least 4 accordion sections");
  detailsBlocks.forEach(([, attrs]) => assert.doesNotMatch(attrs, /open/));
  const headings = detailsBlocks.map((m) => m[2]);
  assert.ok(headings.includes("จุดเด่นของบริการ"));
  assert.ok(headings.includes("รายละเอียดบริการ"));
  assert.ok(headings.includes("เหมาะกับแอร์แบบไหน"));
  assert.ok(headings.includes("เงื่อนไขบริการ"));
  assert.match(html, /แตะเพื่อดูรายละเอียด/);
  assert.match(html, /store-detail-accordion-chevron/);
  assert.match(html, /<summary>\s*<span class="store-detail-accordion-icon">/);

  // Collapsed accordion content is still present in the markup (native
  // <details>), so the customer can search/find it and existing regex-based
  // content checks keep working even though it is visually collapsed.
  assert.match(html, /รายละเอียดบริการแบบยาวมาก ๆ ที่อธิบายขั้นตอนทั้งหมด/);
  assert.match(html, /ลูกค้าต้องเตรียมพื้นที่ให้ช่างเข้าถึงเครื่องได้สะดวก/);
  assert.match(html, /ช่างผ่านการคัดกรอง/);
});

test("related products slider shows up to 4 real same-family items, includes the currently-viewed item marked as such, excludes BTU siblings of its own wash-variant and mismatched categories, and is clickable", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-10");
  const familyItems = [
    { item_id: 10, item_name: "ล้างแอร์ผนัง ล้างธรรมดา 9000-15000", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000 },
    { item_id: 11, item_name: "ล้างแอร์ผนัง ล้างธรรมดา 18000+", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 18000 },
    { item_id: 12, item_name: "ล้างแอร์ผนัง ล้างพรีเมียม", item_category: "ล้างแอร์", base_price: 650, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างพรีเมียม", booking_btu: 9000 },
    { item_id: 13, item_name: "ล้างแอร์ผนัง แขวนคอยล์", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_wash_variant: "ล้างแขวนคอยล์", booking_btu: 9000 },
    { item_id: 14, item_name: "ล้างแอร์ผนัง ตัดล้างใหญ่", item_category: "ล้างแอร์", base_price: 1500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_wash_variant: "ล้างแบบตัดล้าง", booking_btu: 9000 },
    { item_id: 99, item_name: "ซ่อมคอมเพรสเซอร์", item_category: "ซ่อมแอร์", base_price: 1200, unit_label: "งาน", booking_mode: "bookable", job_category: "ซ่อม", ac_type: "ผนัง" },
  ];
  root.api.loadCatalogItem = async () => familyItems[0];
  root.api.loadCatalogItems = async () => familyItems;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const html = body.innerHTML;

  assert.match(html, /เลือกวิธีล้างที่เหมาะกับคุณ/);
  assert.match(html, /data-store-related-item="12"/);
  assert.match(html, /data-store-related-item="13"/);
  assert.match(html, /data-store-related-item="14"/);
  // Same wash-variant sibling (11) belongs to the BTU selector, not "related".
  assert.doesNotMatch(html, /data-store-related-item="11"/);
  assert.doesNotMatch(html, /data-store-related-item="10"/);
  // Mismatched category/job_type never appears among related items.
  assert.doesNotMatch(html, /data-store-related-item="99"/);

  const relatedSection = html.slice(html.indexOf("เลือกวิธีล้างที่เหมาะกับคุณ"));
  assert.equal((relatedSection.match(/data-store-related-item="/g) || []).length, 3);
  // The currently-viewed item (10, "ล้างธรรมดา") is included too, marked as
  // currently viewing rather than as a clickable "related" card -- all 4 real
  // wash methods are now visible, not just the other 3.
  assert.match(relatedSection, /store-related-card is-current/);
  assert.match(relatedSection, /กำลังดู/);
  assert.equal((relatedSection.match(/store-related-card-image-wrap/g) || []).length, 4);

  const relatedButtons = container.querySelectorAll("[data-store-related-item]");
  const target = relatedButtons.find((b) => b.getAttribute("data-store-related-item") === "12");
  assert.ok(target, "related card for item 12 not found");
  await target.click();
  assert.equal(context.window.location.hash, "#storeItem-12");
});

test("related products slider shows fewer than 4 cards when fewer real same-family siblings exist", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-20");
  const items = [
    { item_id: 20, item_name: "ล้างแอร์สี่ทิศทาง ล้างธรรมดา", item_category: "ล้างแอร์", base_price: 600, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "สี่ทิศทาง", booking_ac_type: "สี่ทิศทาง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 12000 },
    { item_id: 21, item_name: "ล้างแอร์สี่ทิศทาง ล้างพรีเมียม", item_category: "ล้างแอร์", base_price: 800, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "สี่ทิศทาง", booking_ac_type: "สี่ทิศทาง", booking_wash_variant: "ล้างพรีเมียม", booking_btu: 12000 },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const html = body.innerHTML;
  assert.match(html, /data-store-related-item="21"/);
  assert.equal((html.match(/data-store-related-item="/g) || []).length, 1);
});

test("BTU/spec variant selector routes to the sibling's own detail URL on selection, reloading the whole page from a real per-item fetch, and the book button books the routed variant", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-10");
  const items = [
    { item_id: 10, item_name: "ล้างแอร์ผนัง ล้างธรรมดา", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", short_description: "เหมาะกับแอร์ขนาดเล็ก-กลาง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000 },
    { item_id: 11, item_name: "ล้างแอร์ผนัง ล้างธรรมดา ใหญ่", item_category: "ล้างแอร์", base_price: 750, unit_label: "เครื่อง", short_description: "เหมาะกับแอร์ขนาดใหญ่", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 18000 },
  ];
  const itemsById = new Map(items.map((it) => [String(it.item_id), it]));
  let detailCalls = 0;
  let listCalls = 0;
  root.api.loadCatalogItem = async (id) => { detailCalls += 1; return itemsById.get(String(id)); };
  root.api.loadCatalogItems = async () => { listCalls += 1; return items; };

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  let body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /9,000–15,000 BTU/);
  assert.match(body.innerHTML, /18,000 BTU ขึ้นไป/);
  assert.match(body.innerHTML, /500/);
  assert.match(body.innerHTML, /เหมาะกับแอร์ขนาดเล็ก-กลาง/);
  assert.equal(detailCalls, 1);
  assert.equal(listCalls, 1);

  const options = container.querySelectorAll("[data-store-variant-option]");
  const bigOption = options.find((o) => o.getAttribute("data-store-variant-option") === "11");
  assert.ok(bigOption, "18,000 BTU option not found");
  await bigOption.click();

  // The click handler only routes (root.utils.routeTo("storeItem-11")); the
  // real app's router then re-invokes store.renderDetail for the new route.
  // This fake DOM has no real EventTarget driving hashchange, so simulate
  // exactly what the router does on navigation: update the route, then
  // re-render the detail screen for it.
  root.state.setRoute("storeItem-11");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(detailCalls, 2, "switching the BTU variant must reload the whole page via a real per-item fetch");

  body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /750/);
  assert.match(body.innerHTML, /เหมาะกับแอร์ขนาดใหญ่/);

  const bookButtons = container.querySelectorAll("[data-store-detail-book]");
  assert.ok(bookButtons.length >= 1);
  await bookButtons[0].click();
  assert.equal(root.state.draft.scheduled.catalog_item_id, 11);
  assert.equal(root.state.draft.scheduled.btu, "18000");
});

test("4-way wall-AC cleaning-method comparison section only appears for wall AC (ผนัง) wash items, and lists all four real methods", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);

  root.state.setRoute("storeItem-30");
  root.api.loadCatalogItem = async () => ({
    item_id: 30, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง",
    booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง",
  });
  root.api.loadCatalogItems = async () => [];
  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const html = container.querySelector("[data-store-detail-body]").innerHTML;
  assert.match(html, /เปรียบเทียบวิธีล้าง/);
  assert.match(html, /ล้างปกติ/);
  assert.match(html, /ล้างพรีเมียม/);
  assert.match(html, /แขวนคอยล์/);
  assert.match(html, /ตัดล้างใหญ่/);
  // Comparison copy must only contain CWF-verified facts -- no disinfection,
  // no guaranteed-leak-fix, and no "removes the coil" claims.
  assert.doesNotMatch(html, /ฆ่าเชื้อ/);
  assert.doesNotMatch(html, /รับรองแก้น้ำหยด/);
  assert.doesNotMatch(html, /ถอดคอยล์ออก/);

  const context2 = makeContext();
  const root2 = loadCustomerFrontend(context2);
  root2.state.setRoute("storeItem-31");
  root2.api.loadCatalogItem = async () => ({
    item_id: 31, item_name: "ล้างแอร์แขวน", item_category: "ล้างแอร์", base_price: 600, unit_label: "เครื่อง",
    booking_mode: "bookable", job_category: "ล้าง", ac_type: "แขวน",
  });
  root2.api.loadCatalogItems = async () => [];
  const container2 = new FakeMount();
  root2.store.renderDetail(container2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const html2 = container2.querySelector("[data-store-detail-body]").innerHTML;
  assert.doesNotMatch(html2, /เปรียบเทียบวิธีล้าง/);
});

test("canonical product-family resolver groups ผนัง/wall AC-type synonyms into the same BTU variant family", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-40");
  const items = [
    { item_id: 40, item_name: "ล้างแอร์ผนัง ล้างธรรมดา 9000", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 9000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000 },
    { item_id: 41, item_name: "Wall mounted AC wash 18000", item_category: "wash", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "wash", ac_type: "wall", btu_min: 18000, booking_ac_type: "wall", booking_wash_variant: "ล้างธรรมดา", booking_btu: 18000 },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const options = container.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 2, "wall/ผนัง synonyms must resolve to the same canonical AC-type family");
});

test("canonical wash-variant resolver groups ล้างปกติ/ล้างธรรมดา synonyms, and แขวนคอยล์/ล้างแขวนคอยล์ synonyms, into the same BTU variant group", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-50");
  const items = [
    { item_id: 50, item_name: "ล้างแอร์ผนัง ล้างปกติ", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างปกติ", booking_btu: 9000 },
    { item_id: 51, item_name: "ล้างแอร์ผนัง ล้างธรรมดา ใหญ่", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 18000 },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  let options = container.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 2, "ล้างปกติ/ล้างธรรมดา synonyms must resolve to the same canonical wash variant");

  const context2 = makeContext();
  const root2 = loadCustomerFrontend(context2);
  root2.state.setRoute("storeItem-60");
  const items2 = [
    { item_id: 60, item_name: "ล้างแอร์ผนัง แขวนคอยล์", item_category: "ล้างแอร์", base_price: 800, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, booking_ac_type: "ผนัง", booking_wash_variant: "แขวนคอยล์", booking_btu: 9000 },
    { item_id: 61, item_name: "ล้างแอร์ผนัง ล้างแขวนคอยล์ ใหญ่", item_category: "ล้างแอร์", base_price: 950, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างแขวนคอยล์", booking_btu: 18000 },
  ];
  root2.api.loadCatalogItem = async () => items2[0];
  root2.api.loadCatalogItems = async () => items2;

  const container2 = new FakeMount();
  root2.store.renderDetail(container2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  options = container2.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 2, "แขวนคอยล์/ล้างแขวนคอยล์ synonyms must resolve to the same canonical wash variant");
});

test("canonical resolver never mixes repair items with wash items, and never puts cross-wash-method variants into the BTU selector", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-70");
  const items = [
    { item_id: 70, item_name: "ล้างแอร์ผนัง ล้างธรรมดา", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000 },
    { item_id: 71, item_name: "ล้างแอร์ผนัง ล้างพรีเมียม", item_category: "ล้างแอร์", base_price: 650, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_wash_variant: "ล้างพรีเมียม", booking_btu: 18000 },
    { item_id: 72, item_name: "ซ่อมแอร์ผนัง", item_category: "ซ่อมแอร์", base_price: 1200, unit_label: "งาน", booking_mode: "bookable", job_category: "ซ่อม", ac_type: "ผนัง", booking_ac_type: "ผนัง" },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const options = container.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 0, "a different wash method (ล้างพรีเมียม) must never enter the ล้างธรรมดา BTU selector");
  assert.doesNotMatch(body.innerHTML, /data-store-related-item="72"/, "repair items must never be mixed into a wash item's related family");
});

// ---------- Production-shaped legacy rows: booking_wash_variant is missing
// entirely (predates that field), so the wash method must be resolved from
// item_name as a deterministic last-resort fallback -- never left as an
// empty token that silently merges unrelated wash methods together.

test("legacy rows with no booking_wash_variant resolve ล้างปกติ/ล้างธรรมดา from item_name into the same BTU variant group, the whole page reloads on selection, and booking infers the real wash_variant from the routed item's name", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-80");
  const items = [
    { item_id: 80, item_name: "ล้างแอร์ผนัง ล้างปกติ 9000", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", short_description: "เหมาะกับแอร์ขนาดเล็ก", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 81, item_name: "ล้างแอร์ผนัง ล้างธรรมดา 18000+", item_category: "ล้างแอร์", base_price: 750, unit_label: "เครื่อง", short_description: "เหมาะกับแอร์ขนาดใหญ่", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 18000, booking_ac_type: "ผนัง", booking_btu: 18000 },
  ];
  const itemsById = new Map(items.map((it) => [String(it.item_id), it]));
  root.api.loadCatalogItem = async (id) => itemsById.get(String(id));
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  let body = container.querySelector("[data-store-detail-body]");
  let options = container.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 2, "ล้างปกติ/ล้างธรรมดา item_name fallback must resolve to the same canonical wash variant");
  assert.match(body.innerHTML, /500/);

  const bigOption = options.find((o) => o.getAttribute("data-store-variant-option") === "81");
  assert.ok(bigOption, "18,000+ option not found");
  await bigOption.click();

  // Simulate the router re-rendering the detail screen for the newly routed
  // item, exactly as it would after root.utils.routeTo("storeItem-81") fires
  // a real hashchange in the browser.
  root.state.setRoute("storeItem-81");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  body = container.querySelector("[data-store-detail-body]");
  assert.match(body.innerHTML, /750/);

  // catalogItemToCommerceDraft deterministically infers wash_variant from the
  // unambiguous "ธรรมดา" keyword in item 81's own name when the real
  // booking_wash_variant field is missing -- it must never refuse and fall
  // back to the contact-admin sheet when a fixed keyword resolves cleanly.
  let contactTitle = null;
  root.ui.openContactSheet = (_container, { title }) => { contactTitle = title; };
  const bookButtons = container.querySelectorAll("[data-store-detail-book]");
  assert.ok(bookButtons.length >= 1);
  await bookButtons[0].click();
  assert.equal(contactTitle, null, "a resolvable item-name keyword must never fall back to the contact-admin sheet");
  assert.equal(root.state.draft.scheduled.catalog_item_id, 81);
  assert.equal(root.state.draft.scheduled.wash_variant, "ล้างธรรมดา");
});

test("legacy rows with no booking_wash_variant show all 4 real wash methods (resolved from item_name) in the related slider, exactly once each", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-90");
  const items = [
    { item_id: 90, item_name: "ล้างแอร์ผนัง ล้างปกติ", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 91, item_name: "ล้างแอร์ผนัง ล้างพรีเมียม", item_category: "ล้างแอร์", base_price: 650, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 92, item_name: "ล้างแอร์ผนัง แขวนคอยล์", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 93, item_name: "ล้างแอร์ผนัง ตัดล้างใหญ่", item_category: "ล้างแอร์", base_price: 1500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const html = body.innerHTML;
  const relatedSection = html.slice(html.indexOf("เลือกวิธีล้างที่เหมาะกับคุณ"));
  assert.equal((relatedSection.match(/store-related-card-image-wrap/g) || []).length, 4, "all 4 real wash methods must appear exactly once");
  assert.match(relatedSection, /data-store-related-item="91"/);
  assert.match(relatedSection, /data-store-related-item="92"/);
  assert.match(relatedSection, /data-store-related-item="93"/);
});

test("a wall-wash item whose wash method cannot be resolved from any field or item_name keyword is never merged into another item's BTU group or counted as a related-slider method", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-100");
  const items = [
    { item_id: 100, item_name: "ล้างแอร์ผนัง ล้างปกติ", item_category: "ล้างแอร์", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 101, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 520, unit_label: "เครื่อง", booking_mode: "bookable", job_category: "ล้าง", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 12000 },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  let body = container.querySelector("[data-store-detail-body]");
  let options = container.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 0, "the resolvable item must not gain an unresolved-method sibling in its BTU selector");
  assert.doesNotMatch(body.innerHTML, /data-store-related-item="101"/, "an unresolved wash method must never be counted as a related-slider method card");

  const context2 = makeContext();
  const root2 = loadCustomerFrontend(context2);
  root2.state.setRoute("storeItem-101");
  root2.api.loadCatalogItem = async () => items[1];
  root2.api.loadCatalogItems = async () => items;
  const container2 = new FakeMount();
  root2.store.renderDetail(container2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  body = container2.querySelector("[data-store-detail-body]");
  options = container2.querySelectorAll("[data-store-variant-option]");
  assert.equal(options.length, 0, "the unresolved item itself must never gain a sibling either");
});

test("job_category and item_category empty: wash resolves from item_name alone, and a repair item named only in item_name is never mixed into the wash family", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.state.setRoute("storeItem-110");
  const items = [
    { item_id: 110, item_name: "ล้างแอร์ผนัง ล้างปกติ", base_price: 500, unit_label: "เครื่อง", booking_mode: "bookable", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 111, item_name: "ล้างแอร์ผนัง ล้างพรีเมียม", base_price: 650, unit_label: "เครื่อง", booking_mode: "bookable", ac_type: "ผนัง", booking_ac_type: "ผนัง", booking_btu: 9000 },
    { item_id: 112, item_name: "ซ่อมแอร์ผนัง", base_price: 1200, unit_label: "งาน", booking_mode: "bookable", ac_type: "ผนัง", booking_ac_type: "ผนัง" },
  ];
  root.api.loadCatalogItem = async () => items[0];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const body = container.querySelector("[data-store-detail-body]");
  const html = body.innerHTML;
  assert.match(html, /data-store-related-item="111"/, "job_category/item_category empty must still resolve wash via item_name");
  assert.doesNotMatch(html, /data-store-related-item="112"/, "a repair item named only in item_name must never be mixed into the wash family");
});

function storeFilterFixtureItems() {
  return [
    {
      item_id: 201, item_name: "ล้างแอร์ผนัง ล้างปกติ 9000 BTU", item_category: "ล้างแอร์",
      booking_mode: "bookable", booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000,
      display_price: 500, base_price: 500, has_queue_today: true, booking_count: 50,
      has_active_promotion: true, normal_price: 600, active_price: 500, campaign_name: "โปรซัมเมอร์", effective_to: "2026-12-31T00:00:00Z",
    },
    {
      item_id: 202, item_name: "ล้างแอร์สี่ทิศทาง ล้างพรีเมียม 12000 BTU", item_category: "ล้างแอร์",
      booking_mode: "bookable", booking_ac_type: "สี่ทิศทาง", booking_wash_variant: "ล้างพรีเมียม", booking_btu: 12000,
      display_price: 700, base_price: 700, has_queue_today: false, booking_count: 10,
    },
    {
      item_id: 203, item_name: "ล้างแอร์ผนัง ล้างปกติ 18000 BTU", item_category: "ล้างแอร์",
      booking_mode: "bookable", booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 18000,
      display_price: 300, base_price: 300, has_queue_today: false, booking_count: 5,
    },
  ];
}

test("store ac_type/wash_variant/BTU/queue-today filters narrow the grid using canonical values, never raw category strings", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => storeFilterFixtureItems();

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const acType = container.querySelector("[data-store-actype]");
  acType.value = "wall";
  await acType.dispatch("change");
  let body = container.querySelector("[data-store-grid-mount]");
  assert.match(body.innerHTML, /data-store-item="201"/);
  assert.match(body.innerHTML, /data-store-item="203"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="202"/);

  const btu = container.querySelector("[data-store-btu]");
  btu.value = "9000";
  await btu.dispatch("change");
  body = container.querySelector("[data-store-grid-mount]");
  assert.match(body.innerHTML, /data-store-item="201"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="203"/);

  btu.value = "";
  await btu.dispatch("change");
  acType.value = "";
  await acType.dispatch("change");
  const wash = container.querySelector("[data-store-wash]");
  wash.value = "premium";
  await wash.dispatch("change");
  body = container.querySelector("[data-store-grid-mount]");
  assert.match(body.innerHTML, /data-store-item="202"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="201"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="203"/);

  wash.value = "";
  await wash.dispatch("change");
  const queueToday = container.querySelector("[data-store-queue-today]");
  queueToday.checked = true;
  await queueToday.dispatch("change");
  body = container.querySelector("[data-store-grid-mount]");
  assert.match(body.innerHTML, /data-store-item="201"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="202"/);
  assert.doesNotMatch(body.innerHTML, /data-store-item="203"/);
});

test("store sort options order by CWF recommended (default), booking count, and price low/high", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => storeFilterFixtureItems();

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const sort = container.querySelector("[data-store-sort]");

  sort.value = "booking_count";
  await sort.dispatch("change");
  let grid = container.querySelector("[data-store-grid-mount]");
  let order = [...grid.innerHTML.matchAll(/data-store-item="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["201", "202", "203"], "must sort by booking_count descending");

  sort.value = "price_low";
  await sort.dispatch("change");
  grid = container.querySelector("[data-store-grid-mount]");
  order = [...grid.innerHTML.matchAll(/data-store-item="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["203", "201", "202"], "must sort by effective price ascending");

  sort.value = "price_high";
  await sort.dispatch("change");
  grid = container.querySelector("[data-store-grid-mount]");
  order = [...grid.innerHTML.matchAll(/data-store-item="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["202", "201", "203"], "must sort by effective price descending");
});

test("store card and detail show the real promotion name, savings amount, and end date only when has_active_promotion is true", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const items = storeFilterFixtureItems();
  root.api.loadCatalogItems = async () => items;
  root.api.loadCatalogItem = async (id) => items.find((it) => String(it.item_id) === String(id));

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const body = container.querySelector("[data-store-body]");
  assert.match(body.innerHTML, /store-promo-name">โปรซัมเมอร์/);
  assert.match(body.innerHTML, /ประหยัด/);
  const promoCardIndex = body.innerHTML.indexOf("data-store-item=\"201\"");
  const nextCardIndex = body.innerHTML.indexOf("data-store-item=\"202\"");
  const card202Html = body.innerHTML.slice(nextCardIndex, nextCardIndex + (body.innerHTML.length - nextCardIndex));
  assert.ok(promoCardIndex < nextCardIndex, "fixture order must put item 201 before 202");
  assert.ok(!card202Html.slice(0, card202Html.indexOf("</article>")).includes("store-promo-name"), "item without has_active_promotion must show no promo info");

  root.state.setRoute("storeItem-201");
  root.store.renderDetail(container);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const detailBody = container.querySelector("[data-store-detail-body]");
  assert.match(detailBody.innerHTML, /store-promo-name">โปรซัมเมอร์/);
  assert.match(detailBody.innerHTML, /ประหยัด/);
});

test("store funnel analytics: cwf_store_view fires on store list render and cwf_store_filter fires with canonical filter_name/filter_value, never PII", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  root.api.loadCatalogItems = async () => storeFilterFixtureItems();

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(context.window.dataLayer.some((e) => e.event === "cwf_store_view"));

  const acType = container.querySelector("[data-store-actype]");
  acType.value = "wall";
  await acType.dispatch("change");
  const filterEvent = context.window.dataLayer.find((e) => e.event === "cwf_store_filter" && e.filter_name === "ac_type");
  assert.ok(filterEvent, "ac_type filter change must emit cwf_store_filter");
  assert.equal(filterEvent.filter_value, "wall");
  assert.equal(Object.keys(filterEvent).sort().join(","), "event,filter_name,filter_value");

  const queueToday = container.querySelector("[data-store-queue-today]");
  queueToday.checked = true;
  await queueToday.dispatch("change");
  const queueEvent = context.window.dataLayer.find((e) => e.event === "cwf_store_filter" && e.filter_name === "queue_today");
  assert.ok(queueEvent);
  assert.equal(queueEvent.filter_value, true);
});

test("store funnel analytics: cwf_store_begin_booking and cwf_store_contact_admin fire with allowed fields only, no booking code/PII", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const items = [
    { item_id: 301, item_name: "ล้างแอร์ผนัง ล้างปกติ", booking_mode: "bookable", booking_ac_type: "ผนัง", booking_wash_variant: "ล้างธรรมดา", booking_btu: 9000, display_price: 500, base_price: 500 },
    { item_id: 302, item_name: "ติดตั้งแอร์ใหม่", booking_mode: "contact", display_price: 0, base_price: 0 },
  ];
  root.api.loadCatalogItems = async () => items;

  const container = new FakeMount();
  root.store.render(container);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const bookButton = container.querySelectorAll("[data-store-book]").find((b) => b.getAttribute("data-store-book") === "301");
  await bookButton.click();
  const bookingEvent = context.window.dataLayer.find((e) => e.event === "cwf_store_begin_booking");
  assert.ok(bookingEvent);
  assert.equal(bookingEvent.item_id, 301);
  assert.ok(!("booking_code" in bookingEvent) && !("phone" in bookingEvent) && !("token" in bookingEvent));

  const contactButton = container.querySelectorAll("[data-store-contact]").find((b) => b.getAttribute("data-store-contact") === "302");
  await contactButton.click();
  const contactEvent = context.window.dataLayer.find((e) => e.event === "cwf_store_contact_admin");
  assert.ok(contactEvent);
  assert.equal(contactEvent.item_id, 302);
});

test("store performance guard: navigating from the loaded list to a product detail page reuses the cached catalog list instead of refetching it", async () => {
  const context = makeContext();
  const root = loadCustomerFrontend(context);
  const items = storeFilterFixtureItems();
  let listCalls = 0;
  let detailCalls = 0;
  root.api.loadCatalogItems = async () => { listCalls += 1; return items; };
  root.api.loadCatalogItem = async (id) => { detailCalls += 1; return items.find((it) => String(it.item_id) === String(id)); };

  const listContainer = new FakeMount();
  root.store.render(listContainer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(listCalls, 1);

  root.state.setRoute("storeItem-201");
  const detailContainer = new FakeMount();
  root.store.renderDetail(detailContainer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(detailCalls, 1, "detail must fetch the routed item exactly once");
  assert.equal(listCalls, 1, "an already-loaded catalog list must never be refetched just to populate siblings/related items on the detail page");
});

// ---- Tracking hotfix: access-level aware customer information -------------
test("tracking full (token) access renders the customer-information section", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    access_level: "token", booking_token: "TOK1", booking_code: "BK1",
    job_status: "กำลังดำเนินการ", appointment_datetime: "2026-06-20T10:00:00Z",
    customer_name: "คุณสมชาย", customer_phone: "0812345678", address_text: "อ่อนนุช กทม",
  });
  assert.match(html, /คุณสมชาย/);
  assert.match(html, /0812345678/);
  assert.match(html, /อ่อนนุช กทม/);
  assert.doesNotMatch(html, /tracking-limited-note/);
});

test("tracking code-only access renders the full read model without token actions", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    access_level: "code", can_view_full_tracking: true, can_use_token_actions: false,
    booking_code: "BK1", job_status: "กำลังดำเนินการ",
    appointment_datetime: "2026-06-20T10:00:00Z", customer_phone: "0812345678",
    customer_name: "คุณสมชาย", address_text: "อ่อนนุช กทม",
  });
  assert.match(html, /คุณสมชาย/);
  assert.match(html, /0812345678/);
  assert.match(html, /อ่อนนุช กทม/);
  assert.doesNotMatch(html, /data-review-form|open-eslip|\/docs\/receipt/);
});

// Blocker 1: the booking_token is a private request credential and must never
// be rendered into the tracking UI (it is not a human-facing tracking number).
// After a successful lookup the visible search field is normalised to the
// booking_code (see lookup()), so the render path must emit the code — never
// the token — anywhere: receipt link, review forms, timeline, or search input.
test("tracking never renders the booking_token into the customer HTML", () => {
  const SECRET_TOKEN = "TOKEN_SECRET_ZZZ_9x8y7z";
  const data = {
    access_level: "token", booking_token: SECRET_TOKEN, booking_code: "BK1",
    job_status: "เสร็จแล้ว", finished_at: "2026-06-20T10:00:00Z",
    appointment_datetime: "2026-06-20T10:00:00Z",
    customer_name: "คุณสมชาย", customer_phone: "0812345678", address_text: "อ่อนนุช กทม",
    review: { already_reviewed: false },
  };
  const root = loadTrackingFrontend();
  // Post-lookup state: the search field holds the human-facing booking_code,
  // the token stays only inside root.state.tracking.data as the credential.
  root.state.updateDraft("tracking", { trackingCode: data.booking_code });
  root.state.setTracking({ status: "success", data, error: "" });
  const container = new TrackingContainer();
  root.tracking.render(container);
  const html = container.innerHTML;
  assert.ok(!html.includes(SECRET_TOKEN), "rendered tracking HTML must not contain the booking_token");
  assert.match(html, /BK1/); // the visible tracking number stays booking_code
});

// ==========================================================================
// Round-3 blockers: private token-credential lifecycle + code-only "no tech"
// ==========================================================================

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A live DOM-ish element that records innerHTML/value and captures listeners so
// tests can drive clicks/submits. querySelector maps to a fixed child registry.
function makeLiveEl(children, extra) {
  const listeners = {};
  const el = {
    value: "", dataset: {}, _html: "", _children: children || {},
    set innerHTML(v) { this._html = String(v == null ? "" : v); },
    get innerHTML() { return this._html; },
    addEventListener(type, fn) { listeners[type] = fn; },
    async fire(type, event) { if (listeners[type]) await listeners[type](event || { preventDefault() {} }); },
    setAttribute() {}, getAttribute() { return null; },
    hasAttribute(name) { return !!(extra && extra._attrs && extra._attrs[name]); },
    closest() { return null; },
    querySelector(sel) { return this._children[sel] || null; },
    querySelectorAll() { return []; },
  };
  return Object.assign(el, extra || {});
}

// A container whose querySelector returns a stable set of live elements for the
// selectors tracking.render()/lookup()/bindResultActions() actually query.
function makeLiveTrackingContainer(opts) {
  opts = opts || {};
  const input = makeLiveEl();
  const result = makeLiveEl();
  const timeline = makeLiveEl();
  const readBtn = makeLiveEl();
  const refreshBtn = makeLiveEl();
  const map = {
    "#tracking-code": input,
    "[data-tracking-result]": result,
    "[data-tracking-timeline]": timeline,
    "[data-action='track-read']": readBtn,
    "[data-action='track-refresh']": refreshBtn,
  };
  if (opts.reviewForm) map["[data-review-form]"] = opts.reviewForm;
  const container = {
    _html: "",
    set innerHTML(v) { this._html = String(v == null ? "" : v); },
    get innerHTML() { return this._html; },
    querySelector(sel) { return map[sel] || null; },
    querySelectorAll() { return []; },
  };
  return { container, input, result, timeline, readBtn, refreshBtn };
}

// Record every credential the app actually sends to trackBooking.
function installRecordingApi(root, responder) {
  const calls = [];
  root.api.trackBooking = async (q) => { calls.push(q); return responder(q); };
  return { calls };
}

const SECRET = "TOKEN_SECRET_LIFECYCLE_9zx";

test("Blocker 1: ?q token stays out of the visible UI while the lookup is pending", async () => {
  const root = loadTrackingFrontend();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { calls } = installRecordingApi(root, async () => { await gate; return { access_level: "token", booking_code: "BKLIVE", booking_token: SECRET }; });
  const { container, input, result } = makeLiveTrackingContainer();

  root.tracking.setInitialCredential(SECRET);
  root.tracking.render(container);
  await delay(5); // let the render's auto-lookup start and reach the pending await

  assert.equal(calls[0], SECRET, "the lookup must use the private token credential");
  assert.equal(input.value, "", "the search input must be blank while the token lookup is pending");
  assert.ok(!container.innerHTML.includes(SECRET), "container HTML must not contain the token while pending");
  assert.ok(!result.innerHTML.includes(SECRET), "result HTML must not contain the token while pending");
  assert.ok(!String(root.state.draft.tracking.trackingCode || "").includes(SECRET), "the draft must never hold the token");

  release();
  await delay(5);
  assert.equal(input.value, "BKLIVE", "after success the input shows the booking_code");
  assert.ok(!result.innerHTML.includes(SECRET), "the token never appears after success");
});

test("Blocker 1: a failed token lookup still keeps the token out of the visible UI", async () => {
  const root = loadTrackingFrontend();
  const { calls } = installRecordingApi(root, async () => { throw new Error("ไม่พบข้อมูลงาน"); });
  const { container, input, result } = makeLiveTrackingContainer();

  root.tracking.setInitialCredential(SECRET);
  root.tracking.render(container);
  await delay(5);

  assert.equal(calls[0], SECRET);
  assert.equal(input.value, "", "input stays blank on a failed token lookup");
  assert.ok(!container.innerHTML.includes(SECRET));
  assert.ok(!result.innerHTML.includes(SECRET), "the token must not leak into the error UI");
  assert.ok(!String(root.state.draft.tracking.trackingCode || "").includes(SECRET));
});

test("Blocker 2: Refresh reuses the private token and preserves full (token) access", async () => {
  const root = loadTrackingFrontend();
  const { calls } = installRecordingApi(root, async (q) => {
    if (q === SECRET) return { access_level: "token", booking_code: "BKLIVE", booking_token: SECRET, customer_name: "คุณเอ", customer_phone: "0812345678", technician: { full_name: "ช่างบี", username: "tech_b" } };
    return { access_level: "code", booking_code: "BKLIVE", customer_phone: "•••• 5678" };
  });
  const { container, input, refreshBtn } = makeLiveTrackingContainer();

  root.tracking.setInitialCredential(SECRET);
  root.tracking.render(container);
  await delay(5);
  assert.equal(calls[0], SECRET);
  assert.equal(input.value, "BKLIVE", "input normalised to booking_code after the token lookup");
  assert.equal(root.state.tracking.data.access_level, "token");

  await refreshBtn.fire("click");
  await delay(5);
  assert.equal(calls[1], SECRET, "Refresh must reuse the private token, not the visible booking_code");
  assert.equal(root.state.tracking.data.access_level, "token", "access stays full after Refresh");
  assert.equal(root.state.tracking.data.customer_name, "คุณเอ", "customer details remain visible after Refresh");
});

test("Blocker 2: technician-review success reloads with the private token", async () => {
  const context = makeContext();
  context.FormData = class { constructor() { this._e = [["rating", "5"]]; } entries() { return this._e; } };
  context.fetch = async () => ({ ok: true, json: async () => ({}) });
  const root = loadTrackingFrontend(context);
  const { calls } = installRecordingApi(root, async (q) => {
    if (q === SECRET) return { access_level: "token", booking_code: "BKLIVE", booking_token: SECRET, job_status: "เสร็จแล้ว", finished_at: "2026-06-20T10:00:00Z", review: { already_reviewed: false } };
    return { access_level: "code", booking_code: "BKLIVE" };
  });
  const status = makeLiveEl();
  const submit = makeLiveEl();
  const reviewForm = makeLiveEl({ "[data-review-status]": status, "button[type='submit']": submit }, { _attrs: { "data-review-token": true } });
  const { container } = makeLiveTrackingContainer({ reviewForm });

  root.tracking.setInitialCredential(SECRET);
  root.tracking.render(container);
  await delay(5);
  assert.equal(calls[0], SECRET);

  await reviewForm.fire("submit");
  await delay(560); // handler reloads via setTimeout(reloadCurrent, 500)
  assert.equal(calls[calls.length - 1], SECRET, "review success must reload using the private token");
});

test("code-only Overview uses read capability and suppresses privileged actions", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    access_level: "code", can_view_full_tracking: true, can_use_token_actions: false,
    booking_code: "BKCODE", booking_mode: "urgent",
    job_status: "กำลังดำเนินการ", appointment_datetime: "2026-06-20T10:00:00Z",
    customer_phone: "0812345678", technician: { full_name: "ช่างสมชาย" },
  });
  assert.match(html, /ช่างสมชาย/);
  assert.doesNotMatch(html, /โหมดจำกัดข้อมูล/);
  assert.doesNotMatch(html, /data-review-form|open-eslip/);
  assert.doesNotMatch(html, /เปลี่ยนเป็นจองล่วงหน้า/);
});

test("Blocker 3: token (full) access still shows the real technician", () => {
  const root = loadTrackingFrontend();
  const html = renderTracking(root, {
    access_level: "token", booking_code: "BKFULL", booking_token: "T1",
    job_status: "กำลังดำเนินการ", appointment_datetime: "2026-06-20T10:00:00Z",
    technician: { full_name: "ช่างสมชาย", username: "somchai", phone: "0899999999" },
  });
  assert.match(html, /ช่างสมชาย/, "the actual technician is shown on full access");
  assert.doesNotMatch(html, /โหมดจำกัดข้อมูล/, "no limited-access notice on full access");
});
