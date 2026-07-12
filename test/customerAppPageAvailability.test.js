"use strict";

// Focused tests for Customer App V2 page-availability (admin rollout control).
//  - The pageAvailability module: flag validation, route mapping, load
//    priority (server → cache → degraded), DOM hiding that preserves
//    business-disabled controls, and the maintenance screen.
//  - Source contracts for the central router guard, boot order, and the
//    booking-mode empty state, so a disabled page is truly unreachable and
//    never calls its handler or page-specific API.

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

// ============================ DOM hiding ==================================
test("applyToDom hides controls for disabled/unknown routes and restores them when re-enabled", async () => {
  const trackingBtn = makeEl({ "data-route": "tracking" });
  const storeBtn = makeEl({ "data-route": "store" });
  const h = loadModule({ routeEls: [trackingBtn, storeBtn] });
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load(); // load() calls applyToDom(document)
  // tracking enabled → visible; store disabled → hidden
  assert.equal(trackingBtn.hasAttribute("hidden"), false);
  assert.equal(storeBtn.getAttribute("data-cwf-avail"), "off");
  assert.equal(storeBtn.hasAttribute("hidden"), true);
  assert.equal(storeBtn.getAttribute("aria-hidden"), "true");

  // Re-enable store and re-apply → restored.
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { ...ALL } }));
  await h.pa.load();
  assert.equal(storeBtn.hasAttribute("hidden"), false);
  assert.equal(storeBtn.hasAttribute("data-cwf-avail"), false);
});

test("applyToDom never re-enables a control that other business logic had disabled", async () => {
  // A booking CTA that was already disabled by business logic, pointing at a
  // disabled route. When we later restore it, it must stay disabled.
  const bizDisabled = makeEl({ "data-route": "store" }, { hasDisabled: true, disabled: true });
  const h = loadModule({ routeEls: [bizDisabled] });
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load();
  assert.equal(bizDisabled.disabled, true);
  // Re-enable the store page → restore should recover the PRIOR disabled state.
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { ...ALL } }));
  await h.pa.load();
  assert.equal(bizDisabled.disabled, true, "must not silently re-enable a business-disabled control");
});

// ============================ maintenance screen ==========================
test("maintenanceHtml shows the page label, a back button to the first enabled route, LINE + phone", async () => {
  const h = loadModule();
  h.setApi(async () => ({ ok: true, degraded: false, page_availability: { home: false, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false } }));
  await h.pa.load();
  const html = h.pa.maintenanceHtml("store");
  assert.match(html, /หน้านี้กำลังปรับปรุง/);
  assert.match(html, /ร้านค้า/); // page label for 'store'
  assert.match(html, /data-route="tracking"/); // firstEnabledRoute
  assert.match(html, /lin\.ee\/fG1Oq7y/);
  assert.match(html, /tel:0988777321/);
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
  const build = "20260712_page_controls_tracking_link_v1";
  assert.match(indexHtml, new RegExp(`modules/pageAvailability\\.js\\?v=${build}`));
  assert.match(swSrc, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(swSrc, /modules\/pageAvailability\.js\?v=\$\{BUILD_ID\}/);
  // Loaded after api.js, before services.js (dependency order).
  assert.ok(indexHtml.indexOf("modules/api.js") < indexHtml.indexOf("modules/pageAvailability.js"));
  assert.ok(indexHtml.indexOf("modules/pageAvailability.js") < indexHtml.indexOf("modules/services.js"));
});
