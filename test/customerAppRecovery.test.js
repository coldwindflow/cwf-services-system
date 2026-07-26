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

function makeLifecycleContext() {
  const context = makeContext();
  const listeners = {
    window: new Map(),
    document: new Map(),
  };
  const intervals = new Map();
  let nextIntervalId = 1;

  function addListener(target, type, listener) {
    if (!listeners[target].has(type)) listeners[target].set(type, new Set());
    listeners[target].get(type).add(listener);
  }

  function removeListener(target, type, listener) {
    listeners[target].get(type)?.delete(listener);
  }

  function setTestInterval(callback) {
    const id = nextIntervalId;
    nextIntervalId += 1;
    intervals.set(id, callback);
    return id;
  }

  function clearTestInterval(id) {
    intervals.delete(id);
  }

  context.window.addEventListener = (type, listener) => addListener("window", type, listener);
  context.window.removeEventListener = (type, listener) => removeListener("window", type, listener);
  context.document.visibilityState = "visible";
  context.document.addEventListener = (type, listener) => addListener("document", type, listener);
  context.document.removeEventListener = (type, listener) => removeListener("document", type, listener);
  context.window.setInterval = setTestInterval;
  context.window.clearInterval = clearTestInterval;
  context.setInterval = setTestInterval;
  context.clearInterval = clearTestInterval;
  context.__lifecycle = {
    intervals,
    listenerCount(target, type) {
      return listeners[target].get(type)?.size || 0;
    },
    async fire(target, type) {
      const callbacks = [...(listeners[target].get(type) || [])];
      await Promise.all(callbacks.map((callback) => callback({ type })));
    },
    async runIntervals() {
      await Promise.all([...intervals.values()].map((callback) => callback()));
    },
  };
  return context;
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
    this.renderCount = 0;
    this._innerHTML = "";
  }
  set innerHTML(value) {
    this.renderCount += 1;
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
  const build = "20260726_urgent_direct_auto_offer_v1";

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
  const build = "20260726_urgent_direct_auto_offer_v1";

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
  assert.match(html, /à¸šà¸±à¸à¸Šà¸µà¸‚à¸­à¸‡à¸‰à¸±à¸™/);
  assert.match(html, /Logged Customer/);
  assert.doesNotMatch(html, /data-auth-provider|Guest/);

  root.state.customer = { logged_in: false };
  root.state.authConfig = { providers: { line: { available: true, start_url: "/auth/line/start" }, google: { available: false } } };
  html = root.auth.renderLoginPanelãÞõêÚ$z{-®éÜj×fVçBÓÓÒ&7ve÷7F÷&Uöf–ÇFW""bbRæf–ÇFW%öæÖRÓÓÒ'VWVU÷FöF’"“°Ð¢76W'Bæö²‡VWVTWfVçB“°Ð¢76W'BæWVÂ‡VWVTWfVçBæf–ÇFW%÷fÇVRÂG'VR“°Ð§Ò“°Ð Ð§FW7B‚'7F÷&RgVææVÂæÇ—F–73¢7ve÷7F÷&Uö&Vv–åö&öö¶–æræB7ve÷7F÷&Uö6öçF7EöFÖ–âf—&Rv—F‚ÆÆ÷vVBf–VÆG2öæÇ’Âæò&öö¶–ær6öFRõ”’"Â7–æ2‚’Óâ°Ð¢6öç7B6öçFW‡BÒÖ¶T6öçFW‡B‚“°Ð¢6öç7B&ö÷BÒÆöD7W7FöÖW$g&öçFVæB†6öçFW‡B“°Ð¢6öç7B—FV×2Ò°Ð¢²—FVÕö–C¢3Â—FVÕöæÖS¢.Š^˜ž‹.ˆ~˜ŠÞŠ>˜Î‰Î‰ž‹ˆrŠ^˜ž‹.ˆ~‰¾ˆ‰^‹B"Â&öö¶–æuöÖöFS¢&&öö¶&ÆR"Â&öö¶–æuö5÷G—S¢.‰Î‰ž‹ˆr"Â&öö¶–æu÷v6…÷f&–çC¢.Š^˜ž‹.ˆ~‰ŽŠ>Š>Š‰N‹""Â&öö¶–æuö'GS¢“ÂF—7Æ•÷&–6S¢SÂ&6U÷&–6S¢SÒÀÐ¢²—FVÕö–C¢3"Â—FVÕöæÖS¢.‰^‹N‰N‰^‹˜žˆ~˜ŠÞŠ>˜Î˜>Š¾Š˜‚"Â&öö¶–æuöÖöFS¢&6öçF7B"ÂF—7Æ•÷&–6S¢Â&6U÷&–6S¢ÒÀÐ¢Ó°Ð¢&ö÷Bæ’æÆöD6FÆöt—FV×2Ò7–æ2‚’Óâ—FV×3°Ð Ð¢6öç7B6öçF–æW"ÒæWrf¶TÖ÷VçB‚“°Ð¢&ö÷Bç7F÷&Rç&VæFW"†6öçF–æW"“°Ð¢v—BæWr&öÖ—6R‚‡&W6öÇfR’Óâ6WEF–ÖV÷WB‡&W6öÇfRÂ’“°Ð Ð¢6öç7B&öö´'WGFöâÒ6öçF–æW"çVW'•6VÆV7F÷$ÆÂ‚%¶FF×7F÷&RÖ&ööµÒ"’æf–æB‚†"’Óâ"ævWDGG&–'WFR‚&FF×7F÷&RÖ&öö²"’ÓÓÒ#3"“°Ð¢v—B&öö´'WGFöâæ6Æ–6²‚“°Ð¢6öç7B&öö¶–ætWfVçBÒ6öçFW‡Bçv–æF÷ræFFÆ–W"æf–æB‚†R’ÓâRæWfVçBÓÓÒ&7ve÷7F÷&Uö&Vv–åö&öö¶–ær"“°Ð¢76W'Bæö²†&öö¶–ætWfVçB“°Ð¢76W'BæWVÂ†&öö¶–ætWfVçBæ—FVÕö–BÂ3“°Ð¢76W'Bæö²‚‚&&öö¶–æuö6öFR"–â&öö¶–ætWfVçB’bb‚'†öæR"–â&öö¶–ætWfVçB’bb‚'Fö¶Vâ"–â&öö¶–ætWfVçB’“°Ð Ð¢6öç7B6öçF7D'WGFöâÒ6öçF–æW"çVW'•6VÆV7F÷$ÆÂ‚%¶FF×7F÷&RÖ6öçF7EÒ"’æf–æB‚†"’Óâ"ævWDGG&–'WFR‚&FF×7F÷&RÖ6öçF7B"’ÓÓÒ#3""“°Ð¢v—B6öçF7D'WGFöâæ6Æ–6²‚“°Ð¢6öç7B6öçF7DWfVçBÒ6öçFW‡Bçv–æF÷ræFFÆ–W"æf–æB‚†R’ÓâRæWfVçBÓÓÒ&7ve÷7F÷&Uö6öçF7EöFÖ–â"“°Ð¢76W'Bæö²†6öçF7DWfVçB“°Ð¢76W'BæWVÂ†6öçF7DWfVçBæ—FVÕö–BÂ3"“°Ð§Ò“°Ð Ð§FW7B‚'7F÷&RW&f÷&Öæ6RwV&C¢æf–vF–ærg&öÒF†RÆöFVBÆ—7BFò&öGV7BFWF–ÂvR&WW6W2F†R66†VB6FÆörÆ—7B–ç7FVBöb&VfWF6†–ær—B"Â7–æ2‚’Óâ°Ð¢6öç7B6öçFW‡BÒÖ¶T6öçFW‡B‚“°Ð¢6öç7B&ö÷BÒÆöD7W7FöÖW$g&öçFVæB†6öçFW‡B“°Ð¢6öç7B—FV×2Ò7F÷&Tf–ÇFW$f—‡GW&T—FV×2‚“°Ð¢ÆWBÆ—7D6ÆÇ2Ò°Ð¢ÆWBFWF–Ä6ÆÇ2Ò°Ð¢&ö÷Bæ’æÆöD6FÆöt—FV×2Ò7–æ2‚’Óâ²Æ—7D6ÆÇ2³Ò²&WGW&â—FV×3²Ó°Ð¢&ö÷Bæ’æÆöD6FÆöt—FVÒÒ7–æ2†–B’Óâ²FWF–Ä6ÆÇ2³Ò²&WGW&â—FV×2æf–æB‚†—B’Óâ7G&–ær†—Bæ—FVÕö–B’ÓÓÒ7G&–ær†–B’“²Ó°Ð Ð¢6öç7BÆ—7D6öçF–æW"ÒæWrf¶TÖ÷VçB‚“°Ð¢&ö÷Bç7F÷&Rç&VæFW"†Æ—7D6öçF–æW"“°Ð¢v—BæWr&öÖ—6R‚‡&W6öÇfR’Óâ6WEF–ÖV÷WB‡&W6öÇfRÂ’“°Ð¢76W'BæWVÂ†Æ—7D6ÆÇ2Â“°Ð Ð¢&ö÷Bç7FFRç6WE&÷WFR‚'7F÷&T—FVÒÓ#"“°Ð¢6öç7BFWF–Ä6öçF–æW"ÒæWrf¶TÖ÷VçB‚“°Ð¢&ö÷Bç7F÷&Rç&VæFW$FWF–Â†FWF–Ä6öçF–æW"“°Ð¢v—BæWr&öÖ—6R‚‡&W6öÇfR’Óâ6WEF–ÖV÷WB‡&W6öÇfRÂ’“°Ð¢v—BæWr&öÖ—6R‚‡&W6öÇfR’Óâ6WEF–ÖV÷WB‡&W6öÇfRÂ’“°Ð Ð¢76W'BæWVÂ†FWF–Ä6ÆÇ2ÂÂ&FWF–Â×W7BfWF6‚F†R&÷WFVB—FVÒW†7FÇ’öæ6R"“°Ð¢76W'BæWVÂ†Æ—7D6ÆÇ2ÂÂ&âÇ&VG’ÖÆöFVB6FÆörÆ—7B×W7BæWfW"&R&VfWF6†VB§W7BFò÷VÆFR6–&Æ–æw2÷&VÆFVB—FV×2öâF†RFWF–ÂvR"“°Ð§Ò“°Ð Ð¢òòÒÒÒÒG&6¶–ær†÷Ff—ƒ¢66W72ÖÆWfVÂv&R7W7FöÖW"–æf÷&ÖF–öâÒÒÒÒÒÒÒÒÒÒÒÒÐÐ§FW7B‚'G&6¶–ærgVÆÂ‡Fö¶Vâ’66W72&VæFW'2F†R7W7FöÖW"Ö–æf÷&ÖF–öâ6V7F–öâ"Â‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B‡FÖÂÒ&VæFW%G&6¶–ær‡&ö÷BÂ°Ð¢66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æu÷Fö¶Vã¢%Dô³"Â&öö¶–æuö6öFS¢$$³"ÀÐ¢¦ö%÷7FGW3¢.ˆ‹>Š^‹ˆ~‰N‹>˜‰ž‹N‰žˆ‹.Š2"Âö–çFÖVçEöFFWF–ÖS¢###bÓbÓ#C££¢"ÀÐ¢7W7FöÖW%öæÖS¢.ˆN‹Ž‰>Š®Šˆ®‹.Š""Â7W7FöÖW%÷†öæS¢#ƒ#3CScs‚"ÂFG&W75÷FW‡C¢.ŠÞ˜ŽŠÞ‰ž‰ž‹Žˆ¢ˆ‰~Š"ÀÐ¢Ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþˆN‹Ž‰>Š®Šˆ®‹.Š"ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂóƒ#3CScs‚ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþŠÞ˜ŽŠÞ‰ž‰ž‹Žˆ¢ˆ‰~Šò“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂ÷G&6¶–ærÖÆ–Ö—FVBÖæ÷FRò“°Ð§Ò“°Ð Ð§FW7B‚'G&6¶–ær6öFRÖöæÇ’66W72&VæFW'2F†RgVÆÂ&VBÖöFVÂv—F†÷WBFö¶Vâ7F–öç2"Â‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B‡FÖÂÒ&VæFW%G&6¶–ær‡&ö÷BÂ°Ð¢66W75öÆWfVÃ¢&6öFR"Â6å÷f–WuögVÆÅ÷G&6¶–æs¢G'VRÂ6å÷W6U÷Fö¶Våö7F–öç3¢fÇ6RÀÐ¢&öö¶–æuö6öFS¢$$³"Â¦ö%÷7FGW3¢.ˆ‹>Š^‹ˆ~‰N‹>˜‰ž‹N‰žˆ‹.Š2"ÀÐ¢ö–çFÖVçEöFFWF–ÖS¢###bÓbÓ#C££¢"Â7W7FöÖW%÷†öæS¢#ƒ#3CScs‚"ÀÐ¢7W7FöÖW%öæÖS¢.ˆN‹Ž‰>Š®Šˆ®‹.Š""ÂFG&W75÷FW‡C¢.ŠÞ˜ŽŠÞ‰ž‰ž‹Žˆ¢ˆ‰~Š"ÀÐ¢Ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþˆN‹Ž‰>Š®Šˆ®‹.Š"ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂóƒ#3CScs‚ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþŠÞ˜ŽŠÞ‰ž‰ž‹Žˆ¢ˆ‰~Šò“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂöFF×&Wf–WrÖf÷&×Æ÷VâÖW6Æ—ÅÂöFö75Â÷&V6V—Bò“°Ð§Ò“°Ð Ð¢òò&Æö6¶W"¢F†R&öö¶–æu÷Fö¶Vâ—2&—fFR&WVW7B7&VFVçF–ÂæB×W7BæWfW Ð¢òò&R&VæFW&VB–çFòF†RG&6¶–ærT’†—B—2æ÷B‡VÖâÖf6–ærG&6¶–ærçVÖ&W"’àÐ¢òògFW"7V66W76gVÂÆöö·WF†Rf—6–&ÆR6V&6‚f–VÆB—2æ÷&ÖÆ—6VBFòF†PÐ¢òò&öö¶–æuö6öFR‡6VRÆöö·W‚’’Â6òF†R&VæFW"F‚×W7BVÖ—BF†R6öFR(	BæWfW Ð¢òòF†RFö¶Vâ(	Bç—v†W&S¢&V6V—BÆ–æ²Â&Wf–Wrf÷&×2ÂF–ÖVÆ–æRÂ÷"6V&6‚–çWBàÐ§FW7B‚'G&6¶–æræWfW"&VæFW'2F†R&öö¶–æu÷Fö¶Vâ–çFòF†R7W7FöÖW"…DÔÂ"Â‚’Óâ°Ð¢6öç7B4T5$UEõDô´TâÒ%Dô´Tåõ4T5$UEõ¥¥¥ó—ƒ‡“w¢#°Ð¢6öç7BFFÒ°Ð¢66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æu÷Fö¶Vã¢4T5$UEõDô´TâÂ&öö¶–æuö6öFS¢$$³"ÀÐ¢¦ö%÷7FGW3¢.˜Š®Š>˜~ˆŽ˜Š^˜žŠr"Âf–æ—6†VEöC¢###bÓbÓ#C££¢"ÀÐ¢ö–çFÖVçEöFFWF–ÖS¢###bÓbÓ#C££¢"ÀÐ¢7W7FöÖW%öæÖS¢.ˆN‹Ž‰>Š®Šˆ®‹.Š""Â7W7FöÖW%÷†öæS¢#ƒ#3CScs‚"ÂFG&W75÷FW‡C¢.ŠÞ˜ŽŠÞ‰ž‰ž‹Žˆ¢ˆ‰~Š"ÀÐ¢&Wf–Ws¢²Ç&VG•÷&Wf–WvVC¢fÇ6RÒÀÐ¢Ó°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢òò÷7BÖÆöö·W7FFS¢F†R6V&6‚f–VÆB†öÆG2F†R‡VÖâÖf6–ær&öö¶–æuö6öFRÀÐ¢òòF†RFö¶Vâ7F—2öæÇ’–ç6–FR&ö÷Bç7FFRçG&6¶–æræFF2F†R7&VFVçF–ÂàÐ¢&ö÷Bç7FFRçWFFTG&gB‚'G&6¶–ær"Â²G&6¶–æt6öFS¢FFæ&öö¶–æuö6öFRÒ“°Ð¢&ö÷Bç7FFRç6WEG&6¶–ær‡²7FGW3¢'7V66W72"ÂFFÂW'&÷#¢""Ò“°Ð¢6öç7B6öçF–æW"ÒæWrG&6¶–æt6öçF–æW"‚“°Ð¢&ö÷BçG&6¶–ærç&VæFW"†6öçF–æW"“°Ð¢6öç7B‡FÖÂÒ6öçF–æW"æ–ææW$…DÔÃ°Ð¢76W'Bæö²‚‡FÖÂæ–æ6ÇVFW2…4T5$UEõDô´Tâ’Â'&VæFW&VBG&6¶–ær…DÔÂ×W7Bæ÷B6öçF–âF†R&öö¶–æu÷Fö¶Vâ"“°Ð¢76W'BæÖF6‚†‡FÖÂÂô$³ò“²òòF†Rf—6–&ÆRG&6¶–ærçVÖ&W"7F—2&öö¶–æuö6öFPÐ§Ò“°Ð Ð¢òòÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÐÐ¢òò&÷VæBÓ2&Æö6¶W'3¢&—fFRFö¶VâÖ7&VFVçF–ÂÆ–fV7–6ÆR²6öFRÖöæÇ’&æòFV6‚ Ð¢òòÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÐÐ Ð¦6öç7BFVÆ’Ò†×2’ÓâæWr&öÖ—6R‚‡&W6öÇfR’Óâ6WEF–ÖV÷WB‡&W6öÇfRÂ×2’“°Ð Ð¢òòÆ—fRDôÒÖ—6‚VÆVÖVçBF†B&V6÷&G2–ææW$…DÔÂ÷fÇVRæB6GW&W2Æ—7FVæW'26ðÐ¢òòFW7G26âG&—fR6Æ–6·2÷7V&Ö—G2âVW'•6VÆV7F÷"Ö2Fòf—†VB6†–ÆB&Vv—7G'’àÐ¦gVæ7F–öâÖ¶TÆ—fTVÂ†6†–ÆG&VâÂW‡G&’°Ð¢6öç7BÆ—7FVæW'2Ò·Ó°Ð¢6öç7BVÂÒ°Ð¢fÇVS¢""ÂFF6WC¢·ÒÂö‡FÖÃ¢""Âö6†–ÆG&Vã¢6†–ÆG&VâÇÂ·ÒÀÐ¢6WB–ææW$…DÔÂ‡b’²F†—2åö‡FÖÂÒ7G&–ær‡bÓÒçVÆÂò""¢b“²ÒÀÐ¢vWB–ææW$…DÔÂ‚’²&WGW&âF†—2åö‡FÖÃ²ÒÀÐ¢FDWfVçDÆ—7FVæW"‡G—RÂfâ’²Æ—7FVæW'5·G—UÒÒfã²ÒÀÐ¢7–æ2f—&R‡G—RÂWfVçB’²–b†Æ—7FVæW'5·G—UÒ’v—BÆ—7FVæW'5·G—UÒ†WfVçBÇÂ²&WfVçDFVfVÇB‚’·ÒÒ“²ÒÀÐ¢6WDGG&–'WFR‚’·ÒÂvWDGG&–'WFR‚’²&WGW&âçVÆÃ²ÒÀÐ¢†4GG&–'WFR†æÖR’²&WGW&â†W‡G&bbW‡G&åöGG'2bbW‡G&åöGG'5¶æÖUÒ“²ÒÀÐ¢6Æ÷6W7B‚’²&WGW&âçVÆÃ²ÒÀÐ¢VW'•6VÆV7F÷"‡6VÂ’²&WGW&âF†—2åö6†–ÆG&Vå·6VÅÒÇÂçVÆÃ²ÒÀÐ¢VW'•6VÆV7F÷$ÆÂ‚’²&WGW&âµÓ²ÒÀÐ¢Ó°Ð¢&WGW&âö&¦V7Bæ76–vâ†VÂÂW‡G&ÇÂ·Ò“°Ð§ÐÐ Ð¢òò6öçF–æW"v†÷6RVW'•6VÆV7F÷"&WGW&ç27F&ÆR6WBöbÆ—fRVÆVÖVçG2f÷"F†PÐ¢òò6VÆV7F÷'2G&6¶–ærç&VæFW"‚’öÆöö·W‚’ö&–æE&W7VÇD7F–öç2‚’7GVÆÇ’VW'’àÐ¦gVæ7F–öâÖ¶TÆ—fUG&6¶–æt6öçF–æW"†÷G2’°Ð¢÷G2Ò÷G2ÇÂ·Ó°Ð¢6öç7B–çWBÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7B&W7VÇBÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7BF–ÖVÆ–æRÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7B&VD'FâÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7B&Vg&W6„'FâÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7BÖÒ°Ð¢"7G&6¶–ærÖ6öFR#¢–çWBÀÐ¢%¶FF×G&6¶–ær×&W7VÇEÒ#¢&W7VÇBÀÐ¢%¶FF×G&6¶–ær×F–ÖVÆ–æUÒ#¢F–ÖVÆ–æRÀÐ¢%¶FFÖ7F–öãÒwG&6²×&VBuÒ#¢&VD'FâÀÐ¢%¶FFÖ7F–öãÒwG&6²×&Vg&W6‚uÒ#¢&Vg&W6„'FâÀÐ¢Ó°Ð¢–b†÷G2ç&Wf–Wtf÷&Ò’Ö²%¶FF×&Wf–WrÖf÷&ÕÒ%ÒÒ÷G2ç&Wf–Wtf÷&Ó°Ð¢6öç7B6öçF–æW"Ò°Ð¢ö‡FÖÃ¢""ÀÐ¢6WB–ææW$…DÔÂ‡b’²F†—2åö‡FÖÂÒ7G&–ær‡bÓÒçVÆÂò""¢b“²ÒÀÐ¢vWB–ææW$…DÔÂ‚’²&WGW&âF†—2åö‡FÖÃ²ÒÀÐ¢VW'•6VÆV7F÷"‡6VÂ’²&WGW&âÖ·6VÅÒÇÂçVÆÃ²ÒÀÐ¢VW'•6VÆV7F÷$ÆÂ‚’²&WGW&âµÓ²ÒÀÐ¢Ó°Ð¢&WGW&â²6öçF–æW"Â–çWBÂ&W7VÇBÂF–ÖVÆ–æRÂ&VD'FâÂ&Vg&W6„'FâÓ°Ð§ÐÐ Ð¢òò&V6÷&BWfW'’7&VFVçF–ÂF†R7GVÆÇ’6VæG2FòG&6´&öö¶–æràÐ¦gVæ7F–öâ–ç7FÆÅ&V6÷&F–æt’‡&ö÷BÂ&W7öæFW"’°Ð¢6öç7B6ÆÇ2ÒµÓ°Ð¢&ö÷Bæ’çG&6´&öö¶–ærÒ7–æ2‡’Óâ²6ÆÇ2çW6‚‡“²&WGW&â&W7öæFW"‡“²Ó°Ð¢&WGW&â²6ÆÇ2Ó°Ð§ÐÐ Ð¦6öç7B4T5$UBÒ%Dô´Tåõ4T5$UEôÄ”dT5”4ÄUó—§‚#°Ð Ð§FW7B‚$&Æö6¶W"¢÷Fö¶Vâ7F—2÷WBöbF†Rf—6–&ÆRT’v†–ÆRF†RÆöö·W—2VæF–ær"Â7–æ2‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢ÆWB&VÆV6S°Ð¢6öç7BvFRÒæWr&öÖ—6R‚‡&W6öÇfR’Óâ²&VÆV6RÒ&W6öÇfS²Ò“°Ð¢6öç7B²6ÆÇ2ÒÒ–ç7FÆÅ&V6÷&F–æt’‡&ö÷BÂ7–æ2‚’Óâ²v—BvFS²&WGW&â²66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æuö6öFS¢$$´Ä•dR"Â&öö¶–æu÷Fö¶Vã¢4T5$UBÓ²Ò“°Ð¢6öç7B²6öçF–æW"Â–çWBÂ&W7VÇBÒÒÖ¶TÆ—fUG&6¶–æt6öçF–æW"‚“°Ð Ð¢&ö÷BçG&6¶–ærç6WD–æ—F–Ä7&VFVçF–Â…4T5$UB“°Ð¢&ö÷BçG&6¶–ærç&VæFW"†6öçF–æW"“°Ð¢v—BFVÆ’ƒR“²òòÆWBF†R&VæFW"w2WFòÖÆöö·W7F'BæB&V6‚F†RVæF–ærv—@Ð Ð¢76W'BæWVÂ†6ÆÇ5³ÒÂ4T5$UBÂ'F†RÆöö·W×W7BW6RF†R&—fFRFö¶Vâ7&VFVçF–Â"“°Ð¢76W'BæWVÂ†–çWBçfÇVRÂ""Â'F†R6V&6‚–çWB×W7B&R&Ææ²v†–ÆRF†RFö¶VâÆöö·W—2VæF–ær"“°Ð¢76W'Bæö²‚6öçF–æW"æ–ææW$…DÔÂæ–æ6ÇVFW2…4T5$UB’Â&6öçF–æW"…DÔÂ×W7Bæ÷B6öçF–âF†RFö¶Vâv†–ÆRVæF–ær"“°Ð¢76W'Bæö²‚&W7VÇBæ–ææW$…DÔÂæ–æ6ÇVFW2…4T5$UB’Â'&W7VÇB…DÔÂ×W7Bæ÷B6öçF–âF†RFö¶Vâv†–ÆRVæF–ær"“°Ð¢76W'Bæö²‚7G&–ær‡&ö÷Bç7FFRæG&gBçG&6¶–ærçG&6¶–æt6öFRÇÂ""’æ–æ6ÇVFW2…4T5$UB’Â'F†RG&gB×W7BæWfW"†öÆBF†RFö¶Vâ"“°Ð Ð¢&VÆV6R‚“°Ð¢v—BFVÆ’ƒR“°Ð¢76W'BæWVÂ†–çWBçfÇVRÂ$$´Ä•dR"Â&gFW"7V66W72F†R–çWB6†÷w2F†R&öö¶–æuö6öFR"“°Ð¢76W'Bæö²‚&W7VÇBæ–ææW$…DÔÂæ–æ6ÇVFW2…4T5$UB’Â'F†RFö¶VâæWfW"V'2gFW"7V66W72"“°Ð§Ò“°Ð Ð§FW7B‚$&Æö6¶W"¢f–ÆVBFö¶VâÆöö·W7F–ÆÂ¶VW2F†RFö¶Vâ÷WBöbF†Rf—6–&ÆRT’"Â7–æ2‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B²6ÆÇ2ÒÒ–ç7FÆÅ&V6÷&F–æt’‡&ö÷BÂ7–æ2‚’Óâ²F‡&÷ræWrW'&÷"‚.˜NŠ˜Ž‰î‰®ˆ.˜žŠÞŠ‹žŠ^ˆ~‹.‰’"“²Ò“°Ð¢6öç7B²6öçF–æW"Â–çWBÂ&W7VÇBÒÒÖ¶TÆ—fUG&6¶–æt6öçF–æW"‚“°Ð Ð¢&ö÷BçG&6¶–ærç6WD–æ—F–Ä7&VFVçF–Â…4T5$UB“°Ð¢&ö÷BçG&6¶–ærç&VæFW"†6öçF–æW"“°Ð¢v—BFVÆ’ƒR“°Ð Ð¢76W'BæWVÂ†6ÆÇ5³ÒÂ4T5$UB“°Ð¢76W'BæWVÂ†–çWBçfÇVRÂ""Â&–çWB7F—2&Ææ²öâf–ÆVBFö¶VâÆöö·W"“°Ð¢76W'Bæö²‚6öçF–æW"æ–ææW$…DÔÂæ–æ6ÇVFW2…4T5$UB’“°Ð¢76W'Bæö²‚&W7VÇBæ–ææW$…DÔÂæ–æ6ÇVFW2…4T5$UB’Â'F†RFö¶Vâ×W7Bæ÷BÆV²–çFòF†RW'&÷"T’"“°Ð¢76W'Bæö²‚7G&–ær‡&ö÷Bç7FFRæG&gBçG&6¶–ærçG&6¶–æt6öFRÇÂ""’æ–æ6ÇVFW2…4T5$UB’“°Ð§Ò“°Ð Ð§FW7B‚$&Æö6¶W"#¢&Vg&W6‚&WW6W2F†R&—fFRFö¶VâæB&W6W'fW2gVÆÂ‡Fö¶Vâ’66W72"Â7–æ2‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B²6ÆÇ2ÒÒ–ç7FÆÅ&V6÷&F–æt’‡&ö÷BÂ7–æ2‡’Óâ°Ð¢–b‡ÓÓÒ4T5$UB’&WGW&â²66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æuö6öFS¢$$´Ä•dR"Â&öö¶–æu÷Fö¶Vã¢4T5$UBÂ7W7FöÖW%öæÖS¢.ˆN‹Ž‰>˜ŠÒ"Â7W7FöÖW%÷†öæS¢#ƒ#3CScs‚"ÂFV6†æ–6–ã¢²gVÆÅöæÖS¢.ˆ®˜Ž‹.ˆ~‰®‹R"ÂW6W&æÖS¢'FV6…ö""ÒÓ°Ð¢&WGW&â²66W75öÆWfVÃ¢&6öFR"Â&öö¶–æuö6öFS¢$$´Ä•dR"Â7W7FöÖW%÷†öæS¢.(
.(
.(
.(
"Scs‚"Ó°Ð¢Ò“°Ð¢6öç7B²6öçF–æW"Â–çWBÂ&Vg&W6„'FâÒÒÖ¶TÆ—fUG&6¶–æt6öçF–æW"‚“°Ð Ð¢&ö÷BçG&6¶–ærç6WD–æ—F–Ä7&VFVçF–Â…4T5$UB“°Ð¢&ö÷BçG&6¶–ærç&VæFW"†6öçF–æW"“°Ð¢v—BFVÆ’ƒR“°Ð¢76W'BæWVÂ†6ÆÇ5³ÒÂ4T5$UB“°Ð¢76W'BæWVÂ†–çWBçfÇVRÂ$$´Ä•dR"Â&–çWBæ÷&ÖÆ—6VBFò&öö¶–æuö6öFRgFW"F†RFö¶VâÆöö·W"“°Ð¢76W'BæWVÂ‡&ö÷Bç7FFRçG&6¶–æræFFæ66W75öÆWfVÂÂ'Fö¶Vâ"“°Ð Ð¢v—B&Vg&W6„'Fâæf—&R‚&6Æ–6²"“°Ð¢v—BFVÆ’ƒR“°Ð¢76W'BæWVÂ†6ÆÇ5³ÒÂ4T5$UBÂ%&Vg&W6‚×W7B&WW6RF†R&—fFRFö¶VâÂæ÷BF†Rf—6–&ÆR&öö¶–æuö6öFR"“°Ð¢76W'BæWVÂ‡&ö÷Bç7FFRçG&6¶–æræFFæ66W75öÆWfVÂÂ'Fö¶Vâ"Â&66W727F—2gVÆÂgFW"&Vg&W6‚"“°Ð¢76W'BæWVÂ‡&ö÷Bç7FFRçG&6¶–æræFFæ7W7FöÖW%öæÖRÂ.ˆN‹Ž‰>˜ŠÒ"Â&7W7FöÖW"FWF–Ç2&VÖ–âf—6–&ÆRgFW"&Vg&W6‚"“°Ð§Ò“°Ð Ð§FW7B‚$&Æö6¶W"#¢FV6†æ–6–â×&Wf–Wr7V66W72&VÆöG2v—F‚F†R&—fFRFö¶Vâ"Â7–æ2‚’Óâ°Ð¢6öç7B6öçFW‡BÒÖ¶T6öçFW‡B‚“°Ð¢6öçFW‡Bäf÷&ÔFFÒ6Æ72²6öç7G'V7F÷"‚’²F†—2åöRÒµ²'&F–ær"Â#R%ÕÓ²ÒVçG&–W2‚’²&WGW&âF†—2åöS²ÒÓ°Ð¢6öçFW‡BæfWF6‚Ò7–æ2‚’Óâ‡²ö³¢G'VRÂ§6öã¢7–æ2‚’Óâ‡·Ò’Ò“°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB†6öçFW‡B“°Ð¢6öç7B²6ÆÇ2ÒÒ–ç7FÆÅ&V6÷&F–æt’‡&ö÷BÂ7–æ2‡’Óâ°Ð¢–b‡ÓÓÒ4T5$UB’&WGW&â²66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æuö6öFS¢$$´Ä•dR"Â&öö¶–æu÷Fö¶Vã¢4T5$UBÂ¦ö%÷7FGW3¢.˜Š®Š>˜~ˆŽ˜Š^˜žŠr"Âf–æ—6†VEöC¢###bÓbÓ#C££¢"Â&Wf–Ws¢²Ç&VG•÷&Wf–WvVC¢fÇ6RÒÓ°Ð¢&WGW&â²66W75öÆWfVÃ¢&6öFR"Â&öö¶–æuö6öFS¢$$´Ä•dR"Ó°Ð¢Ò“°Ð¢6öç7B7FGW2ÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7B7V&Ö—BÒÖ¶TÆ—fTVÂ‚“°Ð¢6öç7B&Wf–Wtf÷&ÒÒÖ¶TÆ—fTVÂ‡²%¶FF×&Wf–Wr×7FGW5Ò#¢7FGW2Â&'WGFöå·G—SÒw7V&Ö—BuÒ#¢7V&Ö—BÒÂ²öGG'3¢²&FF×&Wf–Wr×Fö¶Vâ#¢G'VRÒÒ“°Ð¢6öç7B²6öçF–æW"ÒÒÖ¶TÆ—fUG&6¶–æt6öçF–æW"‡²&Wf–Wtf÷&ÒÒ“°Ð Ð¢&ö÷BçG&6¶–ærç6WD–æ—F–Ä7&VFVçF–Â…4T5$UB“°Ð¢&ö÷BçG&6¶–ærç&VæFW"†6öçF–æW"“°Ð¢v—BFVÆ’ƒR“°Ð¢76W'BæWVÂ†6ÆÇ5³ÒÂ4T5$UB“°Ð Ð¢v—B&Wf–Wtf÷&Òæf—&R‚'7V&Ö—B"“°Ð¢v—BFVÆ’ƒSc“²òò†æFÆW"&VÆöG2f–6WEF–ÖV÷WB‡&VÆöD7W'&VçBÂSÐ¢76W'BæWVÂ†6ÆÇ5¶6ÆÇ2æÆVæwF‚ÒÒÂ4T5$UBÂ'&Wf–Wr7V66W72×W7B&VÆöBW6–ærF†R&—fFRFö¶Vâ"“°Ð§Ò“°Ð Ð§FW7B‚&6öFRÖöæÇ’÷fW'f–WrW6W2&VB6&–Æ—G’æB7W&W76W2&—f–ÆVvVB7F–öç2"Â‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B‡FÖÂÒ&VæFW%G&6¶–ær‡&ö÷BÂ°Ð¢66W75öÆWfVÃ¢&6öFR"Â6å÷f–WuögVÆÅ÷G&6¶–æs¢G'VRÂ6å÷W6U÷Fö¶Våö7F–öç3¢fÇ6RÀÐ¢&öö¶–æuö6öFS¢$$´4ôDR"Â&öö¶–æuöÖöFS¢'W&vVçB"ÀÐ¢¦ö%÷7FGW3¢.ˆ‹>Š^‹ˆ~‰N‹>˜‰ž‹N‰žˆ‹.Š2"Âö–çFÖVçEöFFWF–ÖS¢###bÓbÓ#C££¢"ÀÐ¢7W7FöÖW%÷†öæS¢#ƒ#3CScs‚"ÂFV6†æ–6–ã¢²gVÆÅöæÖS¢.ˆ®˜Ž‹.ˆ~Š®Šˆ®‹.Š""ÒÀÐ¢Ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþˆ®˜Ž‹.ˆ~Š®Šˆ®‹.Š"ò“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂþ˜.Š¾Š‰NˆŽ‹>ˆ‹‰Nˆ.˜žŠÞŠ‹žŠRò“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂöFF×&Wf–WrÖf÷&×Æ÷VâÖW6Æ—ò“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂþ˜‰¾Š^‹^˜ŽŠ.‰ž˜‰¾˜~‰žˆŽŠÞˆ~Š^˜ŽŠ~ˆ~Š¾‰ž˜ž‹"ò“°Ð§Ò“°Ð Ð§FW7B‚$&Æö6¶W"3¢Fö¶Vâ†gVÆÂ’66W727F–ÆÂ6†÷w2F†R&VÂFV6†æ–6–â"Â‚’Óâ°Ð¢6öç7B&ö÷BÒÆöEG&6¶–ætg&öçFVæB‚“°Ð¢6öç7B‡FÖÂÒ&VæFW%G&6¶–ær‡&ö÷BÂ°Ð¢66W75öÆWfVÃ¢'Fö¶Vâ"Â&öö¶–æuö6öFS¢$$´eTÄÂ"Â&öö¶–æu÷Fö¶Vã¢%C"ÀÐ¢¦ö%÷7FGW3¢.ˆ‹>Š^‹ˆ~‰N‹>˜‰ž‹N‰žˆ‹.Š2"Âö–çFÖVçEöFFWF–ÖS¢###bÓbÓ#C££¢"ÀÐ¢FV6†æ–6–ã¢²gVÆÅöæÖS¢.ˆ®˜Ž‹.ˆ~Š®Šˆ®‹.Š""ÂW6W&æÖS¢'6öÖ6†’"Â†öæS¢#ƒ“““““““’"ÒÀÐ¢Ò“°Ð¢76W'BæÖF6‚†‡FÖÂÂþˆ®˜Ž‹.ˆ~Š®Šˆ®‹.Š"òÂ'F†R7GVÂFV6†æ–6–â—26†÷vâöâgVÆÂ66W72"“°Ð¢76W'BæFöW4æ÷DÖF6‚†‡FÖÂÂþ˜.Š¾Š‰NˆŽ‹>ˆ‹‰Nˆ.˜žŠÞŠ‹žŠRòÂ&æòÆ–Ö—FVBÖ66W72æ÷F–6RöâgVÆÂ66W72"“°Ð§Ò“°Ð