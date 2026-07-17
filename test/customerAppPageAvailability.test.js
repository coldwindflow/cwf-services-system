"use strict";

// Focused tests for Customer App V2 page-availability (admin rollout control).
//  - The pageAvailability module: flag validation, route mapping, load
//    priority (server → cache → degraded), the locked-maintenance model (menus/
//    CTAs are never hidden — applyToDom is a no-op), and the static blurred
//    maintenance screen.
//  - Runtime router-guard tests: a disabled route shows the maintenance screen
//    with its nav item still present + active, and never runs its handler/API.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const moduleSrc = read("customer-app/modules/pageAvailability.js");
const routerSrc = read("customer-app/modules/router.js");
const bootSrc = read("customer-app/assets/customer-app.js");
const uiSrc = read("customer-app/modules/ui.js");
const apiSrc = read("customer-app/modules/api.js");
const indexHtml = read("customer-app/index.html");
const swSrc = read("customer-app/sw.js");

const ALL = { home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true };
const DEGRADED = { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false };

// getFlags() objects are created inside the vm realm, so strict deepEqual would
// fail on prototype identity — normalize both sides to plain test-realm objects.
function assertFlags(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

// ---- minimal DOM + window sandbox ---------------------------------------
function makeEl(attrs, opts = {}) {
  const store = { ...attrs };
  const el = {
    _attrs: store,
    getAttribute(name) { return name in store ? store[name] : null; },
    setAttribute(name, val) { store[name] = String(val); },
    hasAttribute(name) { return name in store; },
    removeAttribute(name) { delete store[name]; },
  };
  if (opts.hasDisabled) el.disabled = !!opts.disabled;
  return el;
}

function loadModule({ routeEls = [] } = {}) {
  const store = new Map();
  const appEl = makeEl({ id: "app" });
  const documentEls = routeEls;
  const documentObj = {
    getElementById(id) { return id === "app" ? appEl : null; },
    querySelectorAll(sel) {
      assert.equal(sel, "[data-route]");
      return documentEls.filter((el) => el.hasAttribute("data-route"));
    },
  };
  let apiResponse = { impl: async () => { throw new Error("no api set"); } };
  const win = {};
  win.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  win.CWFCustomerAppV2 = {
    api: { loadCustomerAppConfig: (...a) => apiResponse.impl(...a) },
    utils: { escapeHtml: (s) => String(s == null ? "" : s) },
  };
  const sandbox = {
    window: win,
    document: documentObj,
    MutationObserver: function () { this.observe = () => {}; },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout,
    clearTimeout,
    Promise, Object, Array, String, Number, Boolean, JSON, Date, Set, Error, Math,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(moduleSrc, sandbox);
  const pa = win.CWFCustomerAppV2.pageAvailability;
  return {
    pa,
    appEl,
    storage: store,
    setApi: (impl) => { apiResponse.impl = impl; },
    rawCache: () => (store.has("cwf_customer_app_page_availability_v1") ? JSON.parse(store.get("cwf_customer_app_page_availability_v1")) : null),
  };
}

// ============================ flag validation =============================
test("isValidFlags: exactly 7 boolean keys, ≥1 enabled; rejects unknown/missing/non-bool/all-off", () => {
  const { pa } = loadModule();
  assert.equal(pa._isValidFlags({ ...ALL }), true);
  assert.equal(pa._isValidFlags({ ...DEGRADED }), true);
  // missing a key
  const missing = { ...ALL }; delete missing.profile;
  assert.equal(pa._isValidFlags(missing), false);
  // unknown extra key
  assert.equal(pa._isValidFlags({ ...ALL, extra: true }), false);
  // non-boolean
  assert.equal(pa._isValidFlags({ ...ALL, home: "yes" }), false);
  // all disabled
  assert.equal(pa._isValidFlags({ home: false, store: false, booking: false, scheduled: false, urgent: false, tracking: false, profile: false }), false);
  // not an object
  assert.equal(pa._isValidFlags(null), false);
  assert.equal(pa._isValidFlags([]), false);
});

// ============================ route mapping ===============================
test("availabilityKey: storeItem-<n> inherits store; known routes map to self; unknown → null", () => {
  const { pa } = loadModule();
  assert.equal(pa.availabilityKey("storeItem-123"), "store");
  assert.equal(pa.availabilityKey("store"), "store");
  assert.equal(pa.availabilityKey("tracking"), "tracking");
  assert.equal(pa.availabilityKey("home"), "home");
  assert.equal(pa.availabilityKey("bogus"), null);
  assert.equal(pa.availabilityKey("storeItem-abc"), null); // non-numeric id
  assert.equal(pa.availabilityKey(""), null);
  assert.equal(pa.availabilityKey(null), null);
});

// ============================ load priority ===============================
test("load: a valid non-degraded server config wins and is cached", async () => {
  const flags = { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false };
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: flags }));
  await h.pa.load();
  assert.equal(h.pa.isReady(), true);
  assertFlags(h.pa.getFlags(), flags);
  assert.equal(h.pa.isEnabled("tracking"), true);
  assert.equal(h.pa.isEnabled("store"), false);
  assert.equal(h.pa.isEnabled("storeItem-9"), false); // inherits store
  // cached
  assertFlags(h.rawCache().page_availability, flags);
});

test("load: server degraded:true is ignored → falls through to cache/degraded", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: true, page_availability: { ...DEGRADED } }));
  await h.pa.load();
  assertFlags(h.pa.getFlags(), DEGRADED); // built-in degraded (no cache)
  assert.equal(h.rawCache(), null, "a degraded server response must not be cached");
});

test("load: server failure with a valid cache uses the last-known-good cache", async () => {
  const cachedFlags = { home: true, store: true, booking: true, scheduled: false, urgent: false, tracking: true, profile: true };
  const h = loadModule();
  h.storage.set("cwf_customer_app_page_availability_v1", JSON.stringify({ version: 1, saved_at: 1, page_availability: cachedFlags }));
  h.setApi(async () => { throw new Error("network down"); });
  await h.pa.load();
  assertFlags(h.pa.getFlags(), cachedFlags);
});

test("load: nothing trustworthy → built-in degraded (Home + Tracking only)", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: false }));
  await h.pa.load();
  assertFlags(h.pa.getFlags(), DEGRADED);
  assert.equal(h.pa.isEnabled("home"), true);
  assert.equal(h.pa.isEnabled("tracking"), true);
  assert.equal(h.pa.isEnabled("booking"), false);
});

test("load: an invalid all-disabled server config is rejected (falls to degraded)", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: false, store: false, booking: false, scheduled: false, urgent: false, tracking: false, profile: false } }));
  await h.pa.load();
  assertFlags(h.pa.getFlags(), DEGRADED);
});

// ============================ firstEnabledRoute ===========================
test("firstEnabledRoute: honors priority order and always returns an enabled route", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: false, store: true, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load();
  // priority: home, tracking, store... → tracking beats store
  assert.equal(h.pa.firstEnabledRoute(), "tracking");
});

// ============================ locked-maintenance model ====================
// Menus/CTAs are NEVER hidden: applyToDom must not touch [data-route] controls.
test("applyToDom does NOT hide [data-route] controls (menus/CTAs stay intact)", async () => {
  const trackingBtn = makeEl({ "data-route": "tracking" });
  const storeBtn = makeEl({ "data-route": "store" }); // points at a DISABLED route
  const h = loadModule({ routeEls: [trackingBtn, storeBtn] });
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load(); // load() calls applyToDom(document)
  // Neither the enabled nor the disabled control is hidden/disabled/aria-hidden.
  for (const btn of [trackingBtn, storeBtn]) {
    assert.equal(btn.hasAttribute("hidden"), false, "must not set hidden");
    assert.equal(btn.hasAttribute("data-cwf-avail"), false, "must not mark controls off");
    assert.equal(btn.getAttribute("aria-hidden"), null, "must not aria-hide");
    assert.equal(btn.getAttribute("tabindex"), null, "must not remove from tab order");
  }
  // Explicit applyToDom(scope) is a harmless no-op too.
  h.pa.applyToDom(h.appEl);
  assert.equal(storeBtn.hasAttribute("hidden"), false);
});

test("startObserver is a no-op (nothing is hidden, so nothing to reapply)", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { ...ALL } }));
  await h.pa.load();
  // Must not throw and must not require a MutationObserver.
  assert.doesNotThrow(() => h.pa.startObserver());
});

// ============================ maintenance screen ==========================
test("maintenanceHtml is a STATIC blurred skeleton + readable overlay (no live data)", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: false, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load();
  const html = h.pa.maintenanceHtml("store");
  // Static blurred skeleton behind a readable overlay.
  assert.match(html, /maintenance-skeleton/);
  assert.match(html, /sk-block/);
  assert.match(html, /aria-hidden="true"/); // skeleton hidden from a11y tree
  assert.match(html, /maintenance-overlay/);
  assert.match(html, /role="status"/);
  // Message + page label + back-to-enabled + contact actions.
  assert.match(html, /หน้านี้กำลังปรับปรุง/);
  assert.match(html, /ร้านค้า/); // page label for 'store'
  assert.match(html, /data-route="tracking"/); // firstEnabledRoute back button
  assert.match(html, /lin\.ee\/fG1Oq7y/);
  assert.match(html, /tel:0988777321/);
  // The skeleton must be generic placeholder markup — never real customer data.
  assert.doesNotMatch(html, /booking_code|booking_token|customer_name|address_text|\?q=|\?token=/i);
});

// ============================ router guard (source) =======================
test("router guard runs before the handler: disabled → maintenance, no handler/API call", () => {
  // Guard checks readiness and enablement before resolving/invoking the handler.
  assert.match(routerSrc, /const paReady = !!pa && typeof pa\.isReady === "function" && pa\.isReady\(\)/);
  // Unknown route → redirect to first enabled route (not silent home fallback).
  assert.match(routerSrc, /if \(!pa\.availabilityKey\(requestedRoute\)\)/);
  assert.match(routerSrc, /root\.utils\.routeTo\(fallback\)/);
  // Disabled route → renderMaintenance and RETURN before handler(app).
  assert.match(routerSrc, /if \(paReady && !pa\.isEnabled\(route\)\)/);
  assert.match(routerSrc, /pa\.renderMaintenance\(app, route\)/);
  // The maintenance branch returns before the handler call further below.
  const guardIdx = routerSrc.indexOf("pa.renderMaintenance(app, route)");
  const handlerIdx = routerSrc.indexOf("handler(app);");
  assert.ok(guardIdx !== -1 && handlerIdx !== -1 && guardIdx < handlerIdx, "maintenance render must precede the handler call");
  // After a successful handler render, re-hide disabled CTAs.
  assert.match(routerSrc, /if \(paReady && typeof pa\.applyToDom === "function"\) pa\.applyToDom\(app\)/);
});

// ============================ boot order (source) =========================
test("boot loads availability before router.init, gates Home prefetch, and starts the observer", () => {
  // Await load() (ready) BEFORE registering routes / router.init.
  assert.match(bootSrc, /const pa = App\.pageAvailability;[\s\S]*await pa\.load\(\);/);
  const loadIdx = bootSrc.indexOf("await pa.load();");
  const initIdx = bootSrc.indexOf("App.router.init();");
  assert.ok(loadIdx !== -1 && initIdx !== -1 && loadIdx < initIdx, "pa.load() must be awaited before router.init()");
  // Home prefetch only when home enabled AND initial route is home.
  assert.match(bootSrc, /homeEnabled && initialRouteHome \? App\.ui\.prefetchHome\(\) : Promise\.resolve\(\)/);
  // If home disabled and no explicit route, land on the first enabled route.
  assert.match(bootSrc, /!pa\.isEnabled\("home"\)\) \{[\s\S]*firstEnabledRoute\(\)/);
  // Observer started.
  assert.match(bootSrc, /pa\.startObserver\(\)/);
});

// ============================ booking-mode empty state ====================
test("renderBookingMode gates each card and shows an empty state when both are disabled", () => {
  assert.match(uiSrc, /const scheduledOn = !paReady \|\| pa\.isEnabled\("scheduled"\)/);
  assert.match(uiSrc, /const urgentOn = !paReady \|\| pa\.isEnabled\("urgent"\)/);
  assert.match(uiSrc, /ระบบจองออนไลน์กำลังปรับปรุง/);
  // Empty-state offers LINE + phone.
  assert.match(uiSrc, /booking-empty-card/);
});

// ============================ api + build wiring ==========================
test("api exposes loadCustomerAppConfig as a no-store GET to /public/customer-app-config", () => {
  assert.match(apiSrc, /loadCustomerAppConfig\(\)/);
  assert.match(apiSrc, /"\/public\/customer-app-config", \{ cache: "no-store" \}/);
});

test("build wiring: pageAvailability.js is registered in the HTML shell and the SW cache, with the new build id", () => {
  const build = "20260717_customer_history_simple_link_v1";
  assert.match(indexHtml, new RegExp(`modules/pageAvailability\\.js\\?v=${build}`));
  assert.match(swSrc, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(swSrc, /modules\/pageAvailability\.js\?v=\$\{BUILD_ID\}/);
  // Loaded after api.js, before services.js (dependency order).
  assert.ok(indexHtml.indexOf("modules/api.js") < indexHtml.indexOf("modules/pageAvailability.js"));
  assert.ok(indexHtml.indexOf("modules/pageAvailability.js") < indexHtml.indexOf("modules/services.js"));
});

/* ==========================================================================
   RUNTIME tests (execute the real code in a VM — not regex assertions).
   ========================================================================== */

const BUILD = "20260717_customer_history_simple_link_v1";
const adminSrc = read("admin-homepage-cms.js");

function reqUrlOf(req) {
  return req && typeof req === "object" && "url" in req ? String(req.url) : String(req);
}

// Extract a full brace-balanced function body from source text.
function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `signature not found: ${signature}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error("unbalanced braces");
}

// ---- Service worker harness ----------------------------------------------
function loadServiceWorker() {
  const rec = { put: [], match: [], open: [], deleted: [] };
  const handlers = {};
  let existingCacheKeys = [];
  let fetchImpl = async () => ({ ok: true, clone: () => ({ __clone: true }) });

  function cacheObj() {
    return {
      addAll: () => Promise.resolve(),
      put: (request) => { rec.put.push(reqUrlOf(request)); return Promise.resolve(); },
      match: (request) => { rec.match.push(reqUrlOf(request)); return Promise.resolve(undefined); },
    };
  }
  const caches = {
    open: (name) => { rec.open.push(name); return Promise.resolve(cacheObj()); },
    keys: () => Promise.resolve(existingCacheKeys.slice()),
    delete: (key) => { rec.deleted.push(key); return Promise.resolve(true); },
    // Top-level fallback lookup: return a shell marker only for the canonical
    // credential-free shell path, undefined otherwise.
    match: (request) => {
      const u = reqUrlOf(request);
      rec.match.push(u);
      return Promise.resolve(u.includes("index.html") ? { __shell: true } : undefined);
    },
  };
  const selfObj = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    location: { origin: "https://cwf.example.com" },
  };
  const sandbox = {
    self: selfObj,
    caches,
    fetch: (request, opts) => fetchImpl(request, opts),
    URL,
    Response: { error: () => ({ __error: true }) },
    Promise,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(swSrc, sandbox);
  return {
    handlers,
    rec,
    origin: selfObj.location.origin,
    setFetch: (fn) => { fetchImpl = fn; },
    setExistingCacheKeys: (keys) => { existingCacheKeys = keys; },
  };
}

function swRequest(sw, pathAndQuery, { mode = "navigate", method = "GET" } = {}) {
  return { url: sw.origin + pathAndQuery, mode, method };
}

async function swFetch(sw, request) {
  let responded;
  sw.handlers.fetch({ request, respondWith: (p) => { responded = p; } });
  return responded === undefined ? { __noRespond: true } : responded;
}

const TOKEN = "PRIVATE_TOKEN_9xZ";

test("SW: navigation with ?q=<token> is network-only and never written to Cache Storage", async () => {
  const sw = loadServiceWorker();
  const marker = { ok: true, __net: true, clone: () => ({}) };
  sw.setFetch(async () => marker);
  const res = await swFetch(sw, swRequest(sw, `/customer-app/index.html?q=${TOKEN}#tracking`));
  assert.equal(res, marker, "must return the network response directly");
  assert.equal(sw.rec.put.length, 0, "must never cache.put a credential-bearing navigation");
  assert.equal(sw.rec.match.length, 0, "must not caches.match the credential-bearing request on success");
  const allKeys = [...sw.rec.put, ...sw.rec.match].join(" | ");
  assert.ok(!allKeys.includes(TOKEN), "no cache key/lookup may contain the token");
});

test("SW: navigation with ?token=<token> is network-only and never cached", async () => {
  const sw = loadServiceWorker();
  const marker = { ok: true, clone: () => ({}) };
  sw.setFetch(async () => marker);
  const res = await swFetch(sw, swRequest(sw, `/customer-app/index.html?token=${TOKEN}#tracking`));
  assert.equal(res, marker);
  assert.equal(sw.rec.put.length, 0);
  const allKeys = [...sw.rec.put, ...sw.rec.match, ...sw.rec.open].join(" | ");
  assert.ok(!allKeys.includes(TOKEN), "token must never appear in any cache key");
});

test("SW: offline sensitive navigation falls back to the canonical credential-free app shell", async () => {
  const sw = loadServiceWorker();
  sw.setFetch(async () => { throw new Error("offline"); });
  const res = await swFetch(sw, swRequest(sw, `/customer-app/index.html?q=${TOKEN}#tracking`));
  assert.deepEqual(res, { __shell: true }, "offline → cached app shell");
  assert.equal(sw.rec.put.length, 0, "still no cache.put on the credential-bearing request");
  // The only cache lookup is for the credential-free shell.
  assert.deepEqual(sw.rec.match, [`./index.html?v=${BUILD}`]);
  assert.ok(!sw.rec.match.join(" ").includes(TOKEN));
});

test("SW: a normal versioned asset still caches (put) on success", async () => {
  const sw = loadServiceWorker();
  const marker = { ok: true, clone: () => ({ __copy: true }) };
  sw.setFetch(async () => marker);
  const assetUrl = `/customer-app/modules/router.js?v=${BUILD}`;
  const res = await swFetch(sw, swRequest(sw, assetUrl, { mode: "no-cors" }));
  assert.equal(res, marker);
  assert.deepEqual(sw.rec.put, [sw.origin + assetUrl], "normal asset must be cached");
});

test("SW: a plain navigation WITHOUT a credential still uses the caching path", async () => {
  const sw = loadServiceWorker();
  const marker = { ok: true, clone: () => ({ __copy: true }) };
  sw.setFetch(async () => marker);
  const res = await swFetch(sw, swRequest(sw, `/customer-app/index.html?v=${BUILD}`));
  assert.equal(res, marker);
  assert.deepEqual(sw.rec.put, [`${sw.origin}/customer-app/index.html?v=${BUILD}`]);
});

test("SW: /public/ requests stay network-only (never cached)", async () => {
  const sw = loadServiceWorker();
  const marker = { ok: true, clone: () => ({}) };
  sw.setFetch(async () => marker);
  const res = await swFetch(sw, swRequest(sw, `/public/track?q=${TOKEN}`, { mode: "cors" }));
  assert.equal(res, marker, "network response returned directly");
  assert.equal(sw.rec.put.length, 0, "/public/ must never be cached");
  assert.ok(![...sw.rec.put, ...sw.rec.match].join(" ").includes(TOKEN));
});

test("SW: activation deletes stale Customer App cache namespaces and keeps the current one", async () => {
  const sw = loadServiceWorker();
  const current = `cwf-customer-app-v2-${BUILD}`;
  const stale = "cwf-customer-app-v2-20260101_old";
  sw.setExistingCacheKeys([stale, current, "some-other-cache"]);
  let captured;
  sw.handlers.activate({ waitUntil: (p) => { captured = p; } });
  await captured;
  assert.ok(sw.rec.deleted.includes(stale), "stale Customer App cache must be deleted");
  assert.ok(!sw.rec.deleted.includes(current), "current cache must be kept");
  assert.ok(!sw.rec.deleted.includes("some-other-cache"), "unrelated caches untouched");
});

// ---- Router guard runtime harness ----------------------------------------
function makeNavItem(route) {
  let active = false;
  const attrs = { "data-route": route };
  return {
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
    hasAttribute: (n) => n in attrs,
    classList: { toggle: (cls, force) => { if (cls === "is-active") active = !!force; } },
    get isActive() { return active; },
  };
}

function loadRouterRuntime() {
  const store = new Map();
  const appEl = { innerHTML: "", dataset: {}, focus() {}, querySelectorAll: () => [] };
  const body = { classList: { add() {}, remove() {}, toggle() {} } };
  // The real Bottom Navigation (5 fixed items) — none are ever hidden/removed.
  const navItems = ["home", "store", "booking", "tracking", "profile"].map(makeNavItem);
  const documentObj = {
    getElementById: (id) => (id === "app" ? appEl : null),
    querySelectorAll: (sel) => (String(sel).includes("nav-item") ? navItems : []),
    addEventListener: () => {},
    body,
  };
  const history = { replaceState: () => {} };
  const routeToCalls = [];
  const handlerCalls = { home: 0, store: 0, storeItem: 0, booking: 0, scheduled: 0, urgent: 0, tracking: 0, profile: 0, homeLeave: 0 };
  const apiCalls = { track: 0, pricing: 0, availability: 0, urgent: 0, store: 0 };
  let apiResponse = async () => ({ ok: false });

  const state = {
    requested: "home",
    route: null,
    readRouteFromHash: () => state.requested,
    setRoute: (r) => { state.route = r; },
  };
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    addEventListener: () => {},
  };
  win.CWFCustomerAppV2 = {
    api: {
      loadCustomerAppConfig: (...a) => apiResponse(...a),
      trackBooking: () => { apiCalls.track += 1; },
      previewPricing: () => { apiCalls.pricing += 1; },
      loadAvailability: () => { apiCalls.availability += 1; },
      submitUrgentRequest: () => { apiCalls.urgent += 1; },
    },
    utils: { escapeHtml: (s) => String(s == null ? "" : s), routeTo: (r) => { routeToCalls.push(r); } },
    state,
  };
  const sandbox = {
    window: win,
    document: documentObj,
    history,
    MutationObserver: function () { this.observe = () => {}; },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setTimeout,
    clearTimeout,
    Promise, Object, Array, String, Number, Boolean, JSON, Date, Set, Error, Math,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(moduleSrc, sandbox); // pageAvailability
  vm.runInContext(routerSrc, sandbox); // router
  const root = win.CWFCustomerAppV2;

  // Real handlers render into the #app container they receive; the spies do too
  // so a successful (enabled) render overwrites any prior maintenance markup.
  const paint = (name) => (app) => { if (app) app.innerHTML = `<section data-rendered="${name}">ok</section>`; };
  const home = (app) => { handlerCalls.home += 1; paint("home")(app); };
  home.onLeave = () => { handlerCalls.homeLeave += 1; };
  root.router.register({
    home,
    store: (app) => { handlerCalls.store += 1; apiCalls.store += 1; paint("store")(app); },
    storeItem: (app) => { handlerCalls.storeItem += 1; apiCalls.store += 1; paint("storeItem")(app); },
    booking: (app) => { handlerCalls.booking += 1; paint("booking")(app); },
    scheduled: (app) => { handlerCalls.scheduled += 1; root.api.previewPricing(); root.api.loadAvailability(); paint("scheduled")(app); },
    urgent: (app) => { handlerCalls.urgent += 1; root.api.submitUrgentRequest(); paint("urgent")(app); },
    tracking: (app) => { handlerCalls.tracking += 1; root.api.trackBooking(); paint("tracking")(app); },
    profile: (app) => { handlerCalls.profile += 1; paint("profile")(app); },
  });

  return {
    root, state, appEl, handlerCalls, apiCalls, routeToCalls, navItems,
    setFlags: (flags) => { apiResponse = async () => ({ ok: true, degraded: false, page_availability: flags }); },
    load: () => root.pageAvailability.load(),
    render: (requested) => { state.requested = requested; root.router.render({ focus: false }); },
    isMaintenance: () => String(appEl.innerHTML).includes("หน้านี้กำลังปรับปรุง"),
    navActive: (route) => navItems.find((n) => n.getAttribute("data-route") === route).isActive,
    navHidden: (route) => navItems.find((n) => n.getAttribute("data-route") === route).hasAttribute("hidden"),
  };
}

const flags = (over) => ({ home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true, ...over });

test("router runtime: an ENABLED route calls its handler exactly once", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags());
  await h.load();
  h.render("home");
  assert.equal(h.handlerCalls.home, 1);
  assert.equal(h.isMaintenance(), false);
});

test("router runtime: disabled Tracking never calls the tracking handler or /public/track", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ tracking: false }));
  await h.load();
  h.render("tracking");
  assert.equal(h.handlerCalls.tracking, 0, "tracking handler must not run");
  assert.equal(h.apiCalls.track, 0, "no /public/track lookup may fire");
  assert.equal(h.isMaintenance(), true, "maintenance screen shown");
});

test("router runtime: disabled Booking keeps its Bottom-Nav item present + active, shows maintenance, no booking handler/API", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ booking: false }));
  await h.load();
  h.render("booking");
  // DoD: the "จอง" menu item stays in the nav (never hidden/removed) …
  assert.equal(h.navHidden("booking"), false, "booking nav item must not be hidden");
  // … and is shown active for the disabled route it points at.
  assert.equal(h.navActive("booking"), true, "booking nav item must be active");
  // Route resolves to #booking and shows the locked maintenance screen …
  assert.equal(h.state.route, "booking", "URL/route stays #booking");
  assert.equal(h.isMaintenance(), true, "maintenance screen shown");
  // … without ever running the booking handler (so no scheduled/urgent API).
  assert.equal(h.handlerCalls.booking, 0);
  assert.equal(h.apiCalls.pricing, 0);
  assert.equal(h.apiCalls.availability, 0);
  assert.equal(h.apiCalls.urgent, 0);
});

test("router runtime: re-enabling a page restores normal behaviour (handler runs, no maintenance)", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ booking: false }));
  await h.load();
  h.render("booking");
  assert.equal(h.isMaintenance(), true);
  // Admin re-enables booking; a fresh availability load flips the flag.
  h.setFlags(flags());
  await h.load();
  h.render("booking");
  assert.equal(h.handlerCalls.booking, 1, "handler runs once the page is enabled again");
  assert.equal(h.isMaintenance(), false, "no maintenance once enabled");
});

test("router runtime: disabled Scheduled never calls the handler, pricing, or availability", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ scheduled: false }));
  await h.load();
  h.render("scheduled");
  assert.equal(h.handlerCalls.scheduled, 0);
  assert.equal(h.apiCalls.pricing, 0);
  assert.equal(h.apiCalls.availability, 0);
});

test("router runtime: disabled Urgent never calls the urgent handler/API", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ urgent: false }));
  await h.load();
  h.render("urgent");
  assert.equal(h.handlerCalls.urgent, 0);
  assert.equal(h.apiCalls.urgent, 0);
});

test("router runtime: disabled Store never calls the store handler", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ store: false }));
  await h.load();
  h.render("store");
  assert.equal(h.handlerCalls.store, 0);
  assert.equal(h.isMaintenance(), true);
});

test("router runtime: disabled storeItem-123 never calls the store-detail handler", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ store: false }));
  await h.load();
  h.render("storeItem-123");
  assert.equal(h.handlerCalls.storeItem, 0);
  assert.equal(h.isMaintenance(), true);
});

test("router runtime: reaching a disabled route (as via routeTo/hash) cannot bypass the guard", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ store: false }));
  await h.load();
  // Simulate routeTo('store') landing (it sets the hash → render reads it).
  h.render("store");
  assert.equal(h.handlerCalls.store, 0, "guard blocks regardless of navigation source");
  assert.equal(h.isMaintenance(), true);
});

test("router runtime: a direct disabled hash renders the maintenance screen", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags({ profile: false }));
  await h.load();
  h.render("profile");
  assert.equal(h.handlerCalls.profile, 0);
  assert.equal(h.isMaintenance(), true);
});

test("router runtime: an unknown route redirects to the first enabled route (no handler run)", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags()); // all enabled → firstEnabledRoute = home
  await h.load();
  h.render("totally-bogus");
  assert.deepEqual(h.routeToCalls, ["home"], "unknown → firstEnabledRoute");
  assert.equal(h.handlerCalls.home, 0, "redirect returns before any handler runs");
});

test("router runtime: onLeave of the previous route fires on navigation, and the new enabled handler runs", async () => {
  const h = loadRouterRuntime();
  h.setFlags(flags());
  await h.load();
  h.render("home");
  assert.equal(h.handlerCalls.home, 1);
  const leaveBase = h.handlerCalls.homeLeave;
  h.render("store");
  assert.equal(h.handlerCalls.homeLeave, leaveBase + 1, "home.onLeave fires when leaving home");
  assert.equal(h.handlerCalls.store, 1, "enabled handler still runs after the guard");
});

// ---- CMS final-toggle pure decision (runtime) ----------------------------
function loadToggleDecision() {
  const src = extractFn(adminSrc, "function pageAvailabilityToggleAllowed(");
  const sandbox = {
    PAGE_AVAILABILITY_KEYS: ["home", "store", "booking", "scheduled", "urgent", "tracking", "profile"],
  };
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nglobalThis.__fn = pageAvailabilityToggleAllowed;`, sandbox);
  return sandbox.__fn;
}

test("CMS toggle decision: turning off one of many enabled pages is allowed", () => {
  const allow = loadToggleDecision();
  const pa = { home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true };
  assert.equal(allow(pa, "store", false), true);
});

test("CMS toggle decision: turning off the LAST enabled page is refused (never all-disabled)", () => {
  const allow = loadToggleDecision();
  const pa = { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: false, profile: false };
  assert.equal(allow(pa, "home", false), false, "cannot disable the final enabled page");
  // Applying the guard leaves config unchanged (simulate the handler).
  const before = { ...pa };
  if (allow(pa, "home", false)) pa.home = false;
  assert.deepEqual(pa, before, "config must not become all-disabled");
});

test("CMS toggle decision: turning a page ON is always allowed", () => {
  const allow = loadToggleDecision();
  const pa = { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: false, profile: false };
  assert.equal(allow(pa, "store", true), true);
});

test("CMS toggle handler reverts the checkbox + shows the message, and backend guards remain", () => {
  // Handler wiring (checkbox revert + status) — supporting source assertions.
  assert.match(adminSrc, /if \(!pageAvailabilityToggleAllowed\(config\.page_availability, key, target\.checked\)\) \{/);
  assert.match(adminSrc, /target\.checked = true;/);
  assert.match(adminSrc, /setStatus\("ต้องเปิดอย่างน้อย 1 หน้า", "bad"\)/);
  // Defense-in-depth: publish still refuses an all-disabled config.
  assert.match(adminSrc, /enabledCount === 0/);
  assert.match(adminSrc, /ต้องเปิดอย่างน้อย 1 หน้าก่อน Publish/);
});

/* ==========================================================================
   Secure tracking deep link — fragment credential parse + URL scrub (runtime),
   referrer policy, and boot wiring.
   ========================================================================== */

// Execute the real parseTrackingBoot() from customer-app.js in a VM.
function loadParseTrackingBoot() {
  const src = extractFn(bootSrc, "function parseTrackingBoot(");
  const sandbox = { URL, URLSearchParams, String };
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nglobalThis.__fn = parseTrackingBoot;`, sandbox);
  return sandbox.__fn;
}

const ORIGIN = "https://cwf.example.com";
const BASE = `${ORIGIN}/customer-app/index.html`;
const CRED = "PRIVATE_TOKEN_9xZ";

test("parseTrackingBoot: official fragment form #tracking?q= captures + scrubs the credential", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}#tracking?q=${CRED}`);
  assert.equal(r.credential, CRED);
  assert.equal(r.isTracking, true);
  assert.equal(r.changed, true);
  assert.ok(!r.cleanUrl.includes(CRED), "cleanUrl must not contain the credential");
  assert.ok(!r.cleanUrl.includes("q="), "cleanUrl must not contain q=");
  assert.equal(r.cleanUrl, `${BASE}#tracking`, "scrubbed to a clean #tracking");
});

test("parseTrackingBoot: official fragment form #tracking?token= is captured + scrubbed", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}#tracking?token=${CRED}`);
  assert.equal(r.credential, CRED);
  assert.equal(r.cleanUrl, `${BASE}#tracking`);
  assert.ok(!r.cleanUrl.includes(CRED));
});

test("parseTrackingBoot: legacy query ?q=...#tracking still works and is scrubbed", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}?q=${CRED}#tracking`);
  assert.equal(r.credential, CRED);
  assert.equal(r.isTracking, true);
  assert.equal(r.changed, true);
  assert.equal(r.cleanUrl, `${BASE}#tracking`);
  assert.ok(!r.cleanUrl.includes(CRED));
  assert.ok(!/\?q=|\?token=/.test(r.cleanUrl), "no credential query remains");
});

test("parseTrackingBoot: legacy query ?token=...#tracking still works and is scrubbed", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}?token=${CRED}#tracking`);
  assert.equal(r.credential, CRED);
  assert.equal(r.cleanUrl, `${BASE}#tracking`);
  assert.ok(!r.cleanUrl.includes(CRED));
});

test("parseTrackingBoot: unrelated query params are preserved (fragment form)", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}?utm_source=line#tracking?q=${CRED}`);
  assert.equal(r.credential, CRED);
  assert.ok(r.cleanUrl.includes("utm_source=line"), "utm param preserved");
  assert.ok(r.cleanUrl.endsWith("#tracking"));
  assert.ok(!r.cleanUrl.includes(CRED));
});

test("parseTrackingBoot: unrelated query params are preserved (legacy form)", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}?utm_source=line&q=${CRED}#tracking`);
  assert.equal(r.credential, CRED);
  assert.ok(r.cleanUrl.includes("utm_source=line"));
  assert.ok(!r.cleanUrl.includes(CRED));
  assert.ok(!/[?&]q=/.test(r.cleanUrl), "q removed but utm kept");
});

test("parseTrackingBoot: a normal URL without a credential is left unchanged", () => {
  const parse = loadParseTrackingBoot();
  const r = parse(`${BASE}?utm_source=line#home`);
  assert.equal(r.credential, "");
  assert.equal(r.changed, false, "no scrub needed → no replaceState");
});

test("parseTrackingBoot: the credential never survives in cleanUrl across all sensitive forms", () => {
  const parse = loadParseTrackingBoot();
  const forms = [
    `${BASE}#tracking?q=${CRED}`,
    `${BASE}#tracking?token=${CRED}`,
    `${BASE}?q=${CRED}#tracking`,
    `${BASE}?token=${CRED}#tracking`,
    `${BASE}?utm_source=line#tracking?q=${CRED}`,
  ];
  for (const href of forms) {
    const r = parse(href);
    assert.equal(r.credential, CRED, `captured for ${href}`);
    assert.ok(!r.cleanUrl.includes(CRED), `scrubbed for ${href}`);
    assert.ok(r.isTracking, `tracking route for ${href}`);
  }
});

test("boot wiring: scrub-before-init, single setInitialCredential, replaceState (no new history entry)", () => {
  // Parse + scrub happens before App.state.init().
  const parseIdx = bootSrc.indexOf("parseTrackingBoot(window.location.href)");
  const stateInitIdx = bootSrc.indexOf("App.state.init();");
  assert.ok(parseIdx !== -1 && stateInitIdx !== -1 && parseIdx < stateInitIdx, "parse+scrub must precede state.init()");
  // Uses history.replaceState (not a new history entry) to drop the credential.
  assert.match(bootSrc, /window\.history\.replaceState\(null, "", boot\.cleanUrl\)/);
  // The credential is handed over exactly once, from the parsed value.
  const occurrences = (bootSrc.match(/setInitialCredential\?\.\(boot\.credential\)/g) || []).length;
  assert.equal(occurrences, 1, "setInitialCredential called exactly once with the parsed credential");
  // The credential path must NOT persist the token anywhere serialisable.
  assert.doesNotMatch(bootSrc, /localStorage\.setItem\([^)]*boot\.credential/);
  assert.doesNotMatch(bootSrc, /sessionStorage\.setItem\([^)]*boot\.credential/);
});

test("referrer policy: index.html sets no-referrer before any resource link/script, exactly once", () => {
  assert.match(indexHtml, /<meta name="referrer" content="no-referrer">/);
  const metaIdx = indexHtml.indexOf('<meta name="referrer"');
  const firstLink = indexHtml.indexOf("<link");
  const firstScript = indexHtml.indexOf("<script");
  assert.ok(metaIdx !== -1);
  assert.ok(firstLink === -1 || metaIdx < firstLink, "referrer meta must precede the first <link>");
  assert.ok(firstScript === -1 || metaIdx < firstScript, "referrer meta must precede the first <script>");
  const count = (indexHtml.match(/name="referrer"/g) || []).length;
  assert.equal(count, 1, "exactly one referrer policy (no duplicate/conflicting)");
  assert.doesNotMatch(indexHtml, /http-equiv="referrer"/i, "no conflicting http-equiv referrer");
});
