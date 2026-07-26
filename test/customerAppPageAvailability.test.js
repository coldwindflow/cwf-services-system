"use strict";

// Focused tests for Customer App V2 page-availability (admin rollout control).
//  - The pageAvailability module: flag validation, route mapping, load
//    priority (server â†’ cache â†’ degraded), the locked-maintenance model (menus/
//    CTAs are never hidden â€” applyToDom is a no-op), and the static blurred
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
// fail on prototype identity â€” normalize both sides to plain test-realm objects.
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
test("isValidFlags: exactly 7 boolean keys, â‰¥1 enabled; rejects unknown/missing/non-bool/all-off", () => {
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
test("availabilityKey: storeItem-<n> inherits store; known routes map to self; unknown â†’ null", () => {
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

test("load: server degraded:true is ignored â†’ falls through to cache/degraded", async () => {
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

test("load: nothing trustworthy â†’ built-in degraded (Home + Tracking only)", async () => {
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
  // priority: home, tracking, store... â†’ tracking beats store
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
  assert.match(html, /à¸«à¸™à¹‰à¸²à¸™à¸µà¹‰à¸à¸³à¸¥à¸±à¸‡à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡/);
  assert.match(html, /à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²/); // page label for 'store'
  assert.match(html, /data-route="tracking"/); // firstEnabledRoute back button
  assert.match(html, /lin\.ee\/fG1Oq7y/);
  assert.match(html, /tel:0988777321/);
  // The skeleton must be generic placeholder markup â€” never real customer data.
  assert.doesNotMatch(html, /booking_code|booking_token|customer_name|address_text|\?q=|\?token=/i);
});

// ============================ router guard (source) =======================
test("router guard runs before the handler: disabled â†’ maintenance, no handler/API call", () => {
  // Guard checks readiness and enablement before resolving/invoking the handler.
  assert.match(routerSrc, /const paReady = !!pa && typeof pa\.isReady === "function" && pa\.isReady\(\)/);
  // Unknown route â†’ redirect to first enabled route (not silent home fallback).
  assert.match(routerSrc, /if \(!pa\.availabilityKey\(requestedRoute\)\)/);
  assert.match(routerSrc, /root\.utils\.routeTo\(fallback\)/);
  // Disabled route â†’ renderMaintenance and RETURN before handler(app).
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
  assert.match(uiSrc, /à¸£à¸°à¸šà¸šà¸ˆà¸­à¸‡à¸­à¸­à¸™à¹„à¸¥à¸™à¹Œà¸à¸³à¸¥à¸±à¸‡à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡/);
  // Empty-state offers LINE + phone.
  assert.match(uiSrc, /booking-empty-card/);
});

// ============================ api + build wiring ==========================
test("api exposes loadCustomerAppConfig as a no-store GET to /public/customer-app-config", () => {
  assert.match(apiSrc, /loadCustomerAppConfig\(\)/);
  assert.match(apiSrc, /"\/public\/customer-app-config", \{ cache: "no-store" \}/);
});

test("build wiring: pageAvailability.js is registered in the HTML shell and the SW cache, with the new build id", () => {
  const build = "20260726_urgent_direct_auto_offer_v1";
  assert.match(indexHtml, new RegExp(`modules/pageAvailability\\.js\\?v=${build}`));
  assert.match(sßÎö¶‰žËkºwµç}Ð¹…Á¤¹ÍÕ‰µ¥ÑUÉ•¹ÑI•ÅÕ•ÍÐ ¤ìÁ…¥¹Ð ‰ÕÉ•¹Ðˆ¤¡…ÁÀ¤ìô°4(€€€ÑÉ…­¥¹œè€¡…ÁÀ¤€ôøì¡…¹‘±•É…±±Ì¹ÑÉ…­¥¹œ€¬ô€ÄìÉ½½Ð¹…Á¤¹ÑÉ…­	½½­¥¹œ ¤ìÁ…¥¹Ð ‰ÑÉ…­¥¹œˆ¤¡…ÁÀ¤ìô°4(€€€ÁÉ½™¥±”è€¡…ÁÀ¤€ôøì¡…¹‘±•É…±±Ì¹ÁÉ½™¥±”€¬ô€ÄìÁ…¥¹Ð ‰ÁÉ½™¥±”ˆ¤¡…ÁÀ¤ìô°4(€ô¤ì4(4(€É•ÑÕÉ¸ì4(€€€É½½Ð°ÍÑ…Ñ”°…ÁÁ°°¡…¹‘±•É…±±Ì°…Á¥…±±Ì°É½ÕÑ•Q½…±±Ì°¹…Ù%Ñ•µÌ°4(€€€Í•Ñ±…Ìè€¡™±…Ì¤€ôøì…Á¥I•ÍÁ½¹Í”€ô…Íå¹Œ€ ¤€ôø€¡ì½¬èÑÉÕ”°‘•É…‘•è™…±Í”°Á…•}…Ù…¥±…‰¥±¥Ñäè™±…Ìô¤ìô°4(€€€±½…è€ ¤€ôøÉ½½Ð¹Á…•Ù…¥±…‰¥±¥Ñä¹±½… ¤°4(€€€É•¹‘•Èè€¡É•ÅÕ•ÍÑ•¤€ôøìÍÑ…Ñ”¹É•ÅÕ•ÍÑ•€ôÉ•ÅÕ•ÍÑ•ìÉ½½Ð¹É½ÕÑ•È¹É•¹‘•È¡ì™½ÕÌè™…±Í”ô¤ìô°4(€€€¥Í5…¥¹Ñ•¹…¹”è€ ¤€ôøMÑÉ¥¹œ¡…ÁÁ°¹¥¹¹•É!Q50¤¹¥¹±Õ‘•Ì ‹‚â¯‚âg‚æ'‚âË‚âg‚â×‚æ'‚â‚âÏ‚â—‚âÇ‚â‚âo‚â‚âÇ‚âk‚âo‚â‚âã‚âˆ¤°4(€€€¹…ÙÑ¥Ù”è€¡É½ÕÑ”¤€ôø¹…Ù%Ñ•µÌ¹™¥¹ ¡¸¤€ôø¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÉ½ÕÑ”ˆ¤€ôôôÉ½ÕÑ”¤¹¥ÍÑ¥Ù”°4(€€€¹…Ù!¥‘‘•¸è€¡É½ÕÑ”¤€ôø¹…Ù%Ñ•µÌ¹™¥¹ ¡¸¤€ôø¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÉ½ÕÑ”ˆ¤€ôôôÉ½ÕÑ”¤¹¡…ÍÑÑÉ¥‰ÕÑ” ‰¡¥‘‘•¸ˆ¤°4(€ôì4)ô4(4)½¹ÍÐ™±…Ì€ô€¡½Ù•È¤€ôø€¡ì¡½µ”èÑÉÕ”°ÍÑ½É”èÑÉÕ”°‰½½­¥¹œèÑÉÕ”°Í¡•‘Õ±•èÑÉÕ”°ÕÉ•¹ÐèÑÉÕ”°ÑÉ…­¥¹œèÑÉÕ”°ÁÉ½™¥±”èÑÉÕ”°€¸¸¹½Ù•Èô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è…¸9	1É½ÕÑ”…±±Ì¥ÑÌ¡…¹‘±•È•á…Ñ±ä½¹”ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì ¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰¡½µ”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹¡½µ”°€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°™…±Í”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•QÉ…­¥¹œ¹•Ù•È…±±ÌÑ¡”ÑÉ…­¥¹œ¡…¹‘±•È½È€½ÁÕ‰±¥Œ½ÑÉ…¬ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÑÉ…­¥¹œè™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰ÑÉ…­¥¹œˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÑÉ…­¥¹œ°€À°€‰ÑÉ…­¥¹œ¡…¹‘±•ÈµÕÍÐ¹½ÐÉÕ¸ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹ÑÉ…¬°€À°€‰¹¼€½ÁÕ‰±¥Œ½ÑÉ…¬±½½­ÕÀµ…ä™¥É”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”°€‰µ…¥¹Ñ•¹…¹”ÍÉ••¸Í¡½Ý¸ˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•	½½­¥¹œ­••ÁÌ¥ÑÌ	½ÑÑ½´µ9…Ø¥Ñ•´ÁÉ•Í•¹Ð€¬…Ñ¥Ù”°Í¡½ÝÌµ…¥¹Ñ•¹…¹”°¹¼‰½½­¥¹œ¡…¹‘±•È½A$ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ì‰½½­¥¹œè™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰‰½½­¥¹œˆ¤ì4(€€¼¼½èÑ¡”€‹‚â#‚â·‚âˆµ•¹Ô¥Ñ•´ÍÑ…åÌ¥¸Ñ¡”¹…Ø€¡¹•Ù•È¡¥‘‘•¸½É•µ½Ù•¤ƒŠ˜4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¹…Ù!¥‘‘•¸ ‰‰½½­¥¹œˆ¤°™…±Í”°€‰‰½½­¥¹œ¹…Ø¥Ñ•´µÕÍÐ¹½Ð‰”¡¥‘‘•¸ˆ¤ì4(€€¼¼ƒŠ˜…¹¥ÌÍ¡½Ý¸…Ñ¥Ù”™½ÈÑ¡”‘¥Í…‰±•É½ÕÑ”¥ÐÁ½¥¹ÑÌ…Ð¸4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¹…ÙÑ¥Ù” ‰‰½½­¥¹œˆ¤°ÑÉÕ”°€‰‰½½­¥¹œ¹…Ø¥Ñ•´µÕÍÐ‰”…Ñ¥Ù”ˆ¤ì4(€€¼¼I½ÕÑ”É•Í½±Ù•ÌÑ¼€‰½½­¥¹œ…¹Í¡½ÝÌÑ¡”±½­•µ…¥¹Ñ•¹…¹”ÍÉ••¸ƒŠ˜4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹ÍÑ…Ñ”¹É½ÕÑ”°€‰‰½½­¥¹œˆ°€‰UI0½É½ÕÑ”ÍÑ…åÌ€‰½½­¥¹œˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”°€‰µ…¥¹Ñ•¹…¹”ÍÉ••¸Í¡½Ý¸ˆ¤ì4(€€¼¼ƒŠ˜Ý¥Ñ¡½ÕÐ•Ù•ÈÉÕ¹¹¥¹œÑ¡”‰½½­¥¹œ¡…¹‘±•È€¡Í¼¹¼Í¡•‘Õ±•½ÕÉ•¹ÐA$¤¸4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹‰½½­¥¹œ°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹ÁÉ¥¥¹œ°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹…Ù…¥±…‰¥±¥Ñä°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹ÕÉ•¹Ð°€À¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”èÉ”µ•¹…‰±¥¹œ„Á…”É•ÍÑ½É•Ì¹½Éµ…°‰•¡…Ù¥½ÕÈ€¡¡…¹‘±•ÈÉÕ¹Ì°¹¼µ…¥¹Ñ•¹…¹”¤ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ì‰½½­¥¹œè™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰‰½½­¥¹œˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”¤ì4(€€¼¼‘µ¥¸É”µ•¹…‰±•Ì‰½½­¥¹œì„™É•Í …Ù…¥±…‰¥±¥Ñä±½…™±¥ÁÌÑ¡”™±…œ¸4(€ ¹Í•Ñ±…Ì¡™±…Ì ¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰‰½½­¥¹œˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹‰½½­¥¹œ°€Ä°€‰¡…¹‘±•ÈÉÕ¹Ì½¹”Ñ¡”Á…”¥Ì•¹…‰±•……¥¸ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°™…±Í”°€‰¹¼µ…¥¹Ñ•¹…¹”½¹”•¹…‰±•ˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•M¡•‘Õ±•¹•Ù•È…±±ÌÑ¡”¡…¹‘±•È°ÁÉ¥¥¹œ°½È…Ù…¥±…‰¥±¥Ñäˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÍ¡•‘Õ±•è™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰Í¡•‘Õ±•ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹Í¡•‘Õ±•°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹ÁÉ¥¥¹œ°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹…Ù…¥±…‰¥±¥Ñä°€À¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•UÉ•¹Ð¹•Ù•È…±±ÌÑ¡”ÕÉ•¹Ð¡…¹‘±•È½A$ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÕÉ•¹Ðè™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰ÕÉ•¹Ðˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÕÉ•¹Ð°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹…Á¥…±±Ì¹ÕÉ•¹Ð°€À¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•MÑ½É”¹•Ù•È…±±ÌÑ¡”ÍÑ½É”¡…¹‘±•Èˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÍÑ½É”è™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰ÍÑ½É”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÍÑ½É”°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è‘¥Í…‰±•ÍÑ½É•%Ñ•´´ÄÈÌ¹•Ù•È…±±ÌÑ¡”ÍÑ½É”µ‘•Ñ…¥°¡…¹‘±•Èˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÍÑ½É”è™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰ÍÑ½É•%Ñ•´´ÄÈÌˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÍÑ½É•%Ñ•´°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”èÉ•…¡¥¹œ„‘¥Í…‰±•É½ÕÑ”€¡…ÌÙ¥„É½ÕÑ•Q¼½¡…Í ¤…¹¹½Ð‰åÁ…ÍÌÑ¡”Õ…Éˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÍÑ½É”è™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€€¼¼M¥µÕ±…Ñ”É½ÕÑ•Q¼ ÍÑ½É”œ¤±…¹‘¥¹œ€¡¥ÐÍ•ÑÌÑ¡”¡…Í ƒŠHÉ•¹‘•ÈÉ•…‘Ì¥Ð¤¸4(€ ¹É•¹‘•È ‰ÍÑ½É”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÍÑ½É”°€À°€‰Õ…É‰±½­ÌÉ•…É‘±•ÍÌ½˜¹…Ù¥…Ñ¥½¸Í½ÕÉ”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è„‘¥É•Ð‘¥Í…‰±•¡…Í É•¹‘•ÉÌÑ¡”µ…¥¹Ñ•¹…¹”ÍÉ••¸ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì¡ìÁÉ½™¥±”è™…±Í”ô¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰ÁÉ½™¥±”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÁÉ½™¥±”°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¥Í5…¥¹Ñ•¹…¹” ¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è…¸Õ¹­¹½Ý¸É½ÕÑ”É•‘¥É•ÑÌÑ¼Ñ¡”™¥ÉÍÐ•¹…‰±•É½ÕÑ”€¡¹¼¡…¹‘±•ÈÉÕ¸¤ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì ¤¤ì€¼¼…±°•¹…‰±•ƒŠH™¥ÉÍÑ¹…‰±•‘I½ÕÑ”€ô¡½µ”4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰Ñ½Ñ…±±äµ‰½ÕÌˆ¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ ¹É½ÕÑ•Q½…±±Ì°l‰¡½µ”‰t°€‰Õ¹­¹½Ý¸ƒŠH™¥ÉÍÑ¹…‰±•‘I½ÕÑ”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹¡½µ”°€À°€‰É•‘¥É•ÐÉ•ÑÕÉ¹Ì‰•™½É”…¹ä¡…¹‘±•ÈÉÕ¹Ìˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É½ÕÑ•ÈÉÕ¹Ñ¥µ”è½¹1•…Ù”½˜Ñ¡”ÁÉ•Ù¥½ÕÌÉ½ÕÑ”™¥É•Ì½¸¹…Ù¥…Ñ¥½¸°…¹Ñ¡”¹•Ü•¹…‰±•¡…¹‘±•ÈÉÕ¹Ìˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ €ô±½…‘I½ÕÑ•ÉIÕ¹Ñ¥µ” ¤ì4(€ ¹Í•Ñ±…Ì¡™±…Ì ¤¤ì4(€…Ý…¥Ð ¹±½… ¤ì4(€ ¹É•¹‘•È ‰¡½µ”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹¡½µ”°€Ä¤ì4(€½¹ÍÐ±•…Ù•	…Í”€ô ¹¡…¹‘±•É…±±Ì¹¡½µ•1•…Ù”ì4(€ ¹É•¹‘•È ‰ÍÑ½É”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹¡½µ•1•…Ù”°±•…Ù•	…Í”€¬€Ä°€‰¡½µ”¹½¹1•…Ù”™¥É•ÌÝ¡•¸±•…Ù¥¹œ¡½µ”ˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ ¹¡…¹‘±•É…±±Ì¹ÍÑ½É”°€Ä°€‰•¹…‰±•¡…¹‘±•ÈÍÑ¥±°ÉÕ¹Ì…™Ñ•ÈÑ¡”Õ…Éˆ¤ì4)ô¤ì4(4(¼¼€´´´´5L™¥¹…°µÑ½±”ÁÕÉ”‘•¥Í¥½¸€¡ÉÕ¹Ñ¥µ”¤€´´´´´´´´´´´´´´´´´´´´´´´´´´´´4)™Õ¹Ñ¥½¸±½…‘Q½±••¥Í¥½¸ ¤ì4(€½¹ÍÐÍÉŒ€ô•áÑÉ…Ñ¸¡…‘µ¥¹MÉŒ°€‰™Õ¹Ñ¥½¸Á…•Ù…¥±…‰¥±¥ÑåQ½±•±±½Ý• ˆ¤ì4(€½¹ÍÐÍ…¹‘‰½à€ôì4(€€€A}Y%1	%1%Qe}-eLèl‰¡½µ”ˆ°€‰ÍÑ½É”ˆ°€‰‰½½­¥¹œˆ°€‰Í¡•‘Õ±•ˆ°€‰ÕÉ•¹Ðˆ°€‰ÑÉ…­¥¹œˆ°€‰ÁÉ½™¥±”‰t°4(€ôì4(€Ù´¹É•…Ñ•½¹Ñ•áÐ¡Í…¹‘‰½à¤ì4(€Ù´¹ÉÕ¹%¹½¹Ñ•áÐ¡€‘íÍÉõq¹±½‰…±Q¡¥Ì¹}}™¸€ôÁ…•Ù…¥±…‰¥±¥ÑåQ½±•±±½Ý•í€°Í…¹‘‰½à¤ì4(€É•ÑÕÉ¸Í…¹‘‰½à¹}}™¸ì4)ô4(4)Ñ•ÍÐ ‰5LÑ½±”‘•¥Í¥½¸èÑÕÉ¹¥¹œ½™˜½¹”½˜µ…¹ä•¹…‰±•Á…•Ì¥Ì…±±½Ý•ˆ°€ ¤€ôøì4(€½¹ÍÐ…±±½Ü€ô±½…‘Q½±••¥Í¥½¸ ¤ì4(€½¹ÍÐÁ„€ôì¡½µ”èÑÉÕ”°ÍÑ½É”èÑÉÕ”°‰½½­¥¹œèÑÉÕ”°Í¡•‘Õ±•èÑÉÕ”°ÕÉ•¹ÐèÑÉÕ”°ÑÉ…­¥¹œèÑÉÕ”°ÁÉ½™¥±”èÑÉÕ”ôì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±½Ü¡Á„°€‰ÍÑ½É”ˆ°™…±Í”¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰5LÑ½±”‘•¥Í¥½¸èÑÕÉ¹¥¹œ½™˜Ñ¡”1MP•¹…‰±•Á…”¥ÌÉ•™ÕÍ•€¡¹•Ù•È…±°µ‘¥Í…‰±•¤ˆ°€ ¤€ôøì4(€½¹ÍÐ…±±½Ü€ô±½…‘Q½±••¥Í¥½¸ ¤ì4(€½¹ÍÐÁ„€ôì¡½µ”èÑÉÕ”°ÍÑ½É”è™…±Í”°‰½½­¥¹œè™…±Í”°Í¡•‘Õ±•è™…±Í”°ÕÉ•¹Ðè™…±Í”°ÑÉ…­¥¹œè™…±Í”°ÁÉ½™¥±”è™…±Í”ôì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±½Ü¡Á„°€‰¡½µ”ˆ°™…±Í”¤°™…±Í”°€‰…¹¹½Ð‘¥Í…‰±”Ñ¡”™¥¹…°•¹…‰±•Á…”ˆ¤ì4(€€¼¼ÁÁ±å¥¹œÑ¡”Õ…É±•…Ù•Ì½¹™¥œÕ¹¡…¹•€¡Í¥µÕ±…Ñ”Ñ¡”¡…¹‘±•È¤¸4(€½¹ÍÐ‰•™½É”€ôì€¸¸¹Á„ôì4(€¥˜€¡…±±½Ü¡Á„°€‰¡½µ”ˆ°™…±Í”¤¤Á„¹¡½µ”€ô™…±Í”ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡Á„°‰•™½É”°€‰½¹™¥œµÕÍÐ¹½Ð‰•½µ”…±°µ‘¥Í…‰±•ˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰5LÑ½±”‘•¥Í¥½¸èÑÕÉ¹¥¹œ„Á…”=8¥Ì…±Ý…åÌ…±±½Ý•ˆ°€ ¤€ôøì4(€½¹ÍÐ…±±½Ü€ô±½…‘Q½±••¥Í¥½¸ ¤ì4(€½¹ÍÐÁ„€ôì¡½µ”èÑÉÕ”°ÍÑ½É”è™…±Í”°‰½½­¥¹œè™…±Í”°Í¡•‘Õ±•è™…±Í”°ÕÉ•¹Ðè™…±Í”°ÑÉ…­¥¹œè™…±Í”°ÁÉ½™¥±”è™…±Í”ôì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…±±½Ü¡Á„°€‰ÍÑ½É”ˆ°ÑÉÕ”¤°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰5LÑ½±”¡…¹‘±•ÈÉ•Ù•ÉÑÌÑ¡”¡•­‰½à€¬Í¡½ÝÌÑ¡”µ•ÍÍ…”°…¹‰…­•¹Õ…É‘ÌÉ•µ…¥¸ˆ°€ ¤€ôøì4(€€¼¼!…¹‘±•ÈÝ¥É¥¹œ€¡¡•­‰½àÉ•Ù•ÉÐ€¬ÍÑ…ÑÕÌ¤ƒŠPÍÕÁÁ½ÉÑ¥¹œÍ½ÕÉ”…ÍÍ•ÉÑ¥½¹Ì¸4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…‘µ¥¹MÉŒ°€½¥˜p …Á…•Ù…¥±…‰¥±¥ÑåQ½±•±±½Ý•‘p¡½¹™¥p¹Á…•}…Ù…¥±…‰¥±¥Ñä°­•ä°Ñ…É•Ñp¹¡•­•‘p¥p¤qì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…‘µ¥¹MÉŒ°€½Ñ…É•Ñp¹¡•­•€ôÑÉÕ”ì¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…‘µ¥¹MÉŒ°€½Í•ÑMÑ…ÑÕÍp ‹‚âW‚æ'‚â·‚â‚æ‚âo‚âÓ‚âS‚â·‚â‹‚æ#‚âË‚â‚âg‚æ'‚â·‚âˆ€Äƒ‚â¯‚âg‚æ'‚âÈˆ°€‰‰…‰p¤¼¤ì4(€€¼¼•™•¹Í”µ¥¸µ‘•ÁÑ èÁÕ‰±¥Í ÍÑ¥±°É•™ÕÍ•Ì…¸…±°µ‘¥Í…‰±•½¹™¥œ¸4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…‘µ¥¹MÉŒ°€½•¹…‰±•‘½Õ¹Ð€ôôô€À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…‘µ¥¹MÉŒ°€¿‚âW‚æ'‚â·‚â‚æ‚âo‚âÓ‚âS‚â·‚â‹‚æ#‚âË‚â‚âg‚æ'‚â·‚âˆ€Äƒ‚â¯‚âg‚æ'‚âË‚â‚æ#‚â·‚âdAÕ‰±¥Í ¼¤ì4)ô¤ì4(4(¼¨€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4(€€M•ÕÉ”ÑÉ…­¥¹œ‘••À±¥¹¬ƒŠP™É…µ•¹ÐÉ•‘•¹Ñ¥…°Á…ÉÍ”€¬UI0ÍÉÕˆ€¡ÉÕ¹Ñ¥µ”¤°4(€€É•™•ÉÉ•ÈÁ½±¥ä°…¹‰½½ÐÝ¥É¥¹œ¸4(€€€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô€¨¼4(4(¼¼á•ÕÑ”Ñ¡”É•…°Á…ÉÍ•QÉ…­¥¹	½½Ð ¤™É½´ÕÍÑ½µ•Èµ…ÁÀ¹©Ì¥¸„Y4¸4)™Õ¹Ñ¥½¸±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÍÉŒ€ô•áÑÉ…Ñ¸¡‰½½ÑMÉŒ°€‰™Õ¹Ñ¥½¸Á…ÉÍ•QÉ…­¥¹	½½Ð ˆ¤ì4(€½¹ÍÐÍ…¹‘‰½à€ôìUI0°UI1M•…É¡A…É…µÌ°MÑÉ¥¹œôì4(€Ù´¹É•…Ñ•½¹Ñ•áÐ¡Í…¹‘‰½à¤ì4(€Ù´¹ÉÕ¹%¹½¹Ñ•áÐ¡€‘íÍÉõq¹±½‰…±Q¡¥Ì¹}}™¸€ôÁ…ÉÍ•QÉ…­¥¹	½½Ðí€°Í…¹‘‰½à¤ì4(€É•ÑÕÉ¸Í…¹‘‰½à¹}}™¸ì4)ô4(4)½¹ÍÐ=I%%8€ô€‰¡ÑÑÁÌè¼½Ý˜¹•á…µÁ±”¹½´ˆì4)½¹ÍÐ	M€ô€‘í=I%%9ô½ÕÍÑ½µ•Èµ…ÁÀ½¥¹‘•à¹¡Ñµ±€ì4)½¹ÍÐI€ô€‰AI%YQ}Q=-9|åáhˆì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½Ðè½™™¥¥…°™É…µ•¹Ð™½É´€ÑÉ…­¥¹œýÄô…ÁÑÕÉ•Ì€¬ÍÉÕ‰ÌÑ¡”É•‘•¹Ñ¥…°ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôÑÉ…­¥¹œýÄô‘íIõ€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹¥ÍQÉ…­¥¹œ°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹¡…¹•°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤°€‰±•…¹UÉ°µÕÍÐ¹½Ð½¹Ñ…¥¸Ñ¡”É•‘•¹Ñ¥…°ˆ¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì ‰Äôˆ¤°€‰±•…¹UÉ°µÕÍÐ¹½Ð½¹Ñ…¥¸Äôˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹±•…¹UÉ°°€‘í	MôÑÉ…­¥¹€°€‰ÍÉÕ‰‰•Ñ¼„±•…¸€ÑÉ…­¥¹œˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½Ðè½™™¥¥…°™É…µ•¹Ð™½É´€ÑÉ…­¥¹œýÑ½­•¸ô¥Ì…ÁÑÕÉ•€¬ÍÉÕ‰‰•ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôÑÉ…­¥¹œýÑ½­•¸ô‘íIõ€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹±•…¹UÉ°°€‘í	MôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½Ðè±•…äÅÕ•Éä€ýÄô¸¸¸ÑÉ…­¥¹œÍÑ¥±°Ý½É­Ì…¹¥ÌÍÉÕ‰‰•ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôýÄô‘íIôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹¥ÍQÉ…­¥¹œ°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹¡…¹•°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹±•…¹UÉ°°€‘í	MôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤¤ì4(€…ÍÍ•ÉÐ¹½¬ „½pýÄõñpýÑ½­•¸ô¼¹Ñ•ÍÐ¡È¹±•…¹UÉ°¤°€‰¹¼É•‘•¹Ñ¥…°ÅÕ•ÉäÉ•µ…¥¹Ìˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½Ðè±•…äÅÕ•Éä€ýÑ½­•¸ô¸¸¸ÑÉ…­¥¹œÍÑ¥±°Ý½É­Ì…¹¥ÌÍÉÕ‰‰•ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôýÑ½­•¸ô‘íIôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹±•…¹UÉ°°€‘í	MôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½ÐèÕ¹É•±…Ñ•ÅÕ•ÉäÁ…É…µÌ…É”ÁÉ•Í•ÉÙ•€¡™É…µ•¹Ð™½É´¤ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôýÕÑµ}Í½ÕÉ”õ±¥¹”ÑÉ…­¥¹œýÄô‘íIõ€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹½¬¡È¹±•…¹UÉ°¹¥¹±Õ‘•Ì ‰ÕÑµ}Í½ÕÉ”õ±¥¹”ˆ¤°€‰ÕÑ´Á…É…´ÁÉ•Í•ÉÙ•ˆ¤ì4(€…ÍÍ•ÉÐ¹½¬¡È¹±•…¹UÉ°¹•¹‘Í]¥Ñ  ˆÑÉ…­¥¹œˆ¤¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½ÐèÕ¹É•±…Ñ•ÅÕ•ÉäÁ…É…µÌ…É”ÁÉ•Í•ÉÙ•€¡±•…ä™½É´¤ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôýÕÑµ}Í½ÕÉ”õ±¥¹”™Äô‘íIôÑÉ…­¥¹€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I¤ì4(€…ÍÍ•ÉÐ¹½¬¡È¹±•…¹UÉ°¹¥¹±Õ‘•Ì ‰ÕÑµ}Í½ÕÉ”õ±¥¹”ˆ¤¤ì4(€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤¤ì4(€…ÍÍ•ÉÐ¹½¬ „½lü™uÄô¼¹Ñ•ÍÐ¡È¹±•…¹UÉ°¤°€‰ÄÉ•µ½Ù•‰ÕÐÕÑ´­•ÁÐˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½Ðè„¹½Éµ…°UI0Ý¥Ñ¡½ÕÐ„É•‘•¹Ñ¥…°¥Ì±•™ÐÕ¹¡…¹•ˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐÈ€ôÁ…ÉÍ”¡€‘í	MôýÕÑµ}Í½ÕÉ”õ±¥¹”¡½µ•€¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°€ˆˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹¡…¹•°™…±Í”°€‰¹¼ÍÉÕˆ¹••‘•ƒŠH¹¼É•Á±…•MÑ…Ñ”ˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Á…ÉÍ•QÉ…­¥¹	½½ÐèÑ¡”É•‘•¹Ñ¥…°¹•Ù•ÈÍÕÉÙ¥Ù•Ì¥¸±•…¹UÉ°…É½ÍÌ…±°Í•¹Í¥Ñ¥Ù”™½ÉµÌˆ°€ ¤€ôøì4(€½¹ÍÐÁ…ÉÍ”€ô±½…‘A…ÉÍ•QÉ…­¥¹	½½Ð ¤ì4(€½¹ÍÐ™½ÉµÌ€ôl4(€€€€‘í	MôÑÉ…­¥¹œýÄô‘íIõ€°4(€€€€‘í	MôÑÉ…­¥¹œýÑ½­•¸ô‘íIõ€°4(€€€€‘í	MôýÄô‘íIôÑÉ…­¥¹€°4(€€€€‘í	MôýÑ½­•¸ô‘íIôÑÉ…­¥¹€°4(€€€€‘í	MôýÕÑµ}Í½ÕÉ”õ±¥¹”ÑÉ…­¥¹œýÄô‘íIõ€°4(€tì4(€™½È€¡½¹ÍÐ¡É•˜½˜™½ÉµÌ¤ì4(€€€½¹ÍÐÈ€ôÁ…ÉÍ”¡¡É•˜¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡È¹É•‘•¹Ñ¥…°°I°…ÁÑÕÉ•™½È€‘í¡É•™õ€¤ì4(€€€…ÍÍ•ÉÐ¹½¬ …È¹±•…¹UÉ°¹¥¹±Õ‘•Ì¡I¤°ÍÉÕ‰‰•™½È€‘í¡É•™õ€¤ì4(€€€…ÍÍ•ÉÐ¹½¬¡È¹¥ÍQÉ…­¥¹œ°ÑÉ…­¥¹œÉ½ÕÑ”™½È€‘í¡É•™õ€¤ì4(€ô4)ô¤ì4(4)Ñ•ÍÐ ‰‰½½ÐÝ¥É¥¹œèÍÉÕˆµ‰•™½É”µ¥¹¥Ð°Í¥¹±”Í•Ñ%¹¥Ñ¥…±É•‘•¹Ñ¥…°°É•Á±…•MÑ…Ñ”€¡¹¼¹•Ü¡¥ÍÑ½Éä•¹ÑÉä¤ˆ°€ ¤€ôøì4(€€¼¼A…ÉÍ”€¬ÍÉÕˆ¡…ÁÁ•¹Ì‰•™½É”ÁÀ¹ÍÑ…Ñ”¹¥¹¥Ð ¤¸4(€½¹ÍÐÁ…ÉÍ•%‘à€ô‰½½ÑMÉŒ¹¥¹‘•á=˜ ‰Á…ÉÍ•QÉ…­¥¹	½½Ð¡Ý¥¹‘½Ü¹±½…Ñ¥½¸¹¡É•˜¤ˆ¤ì4(€½¹ÍÐÍÑ…Ñ•%¹¥Ñ%‘à€ô‰½½ÑMÉŒ¹¥¹‘•á=˜ ‰ÁÀ¹ÍÑ…Ñ”¹¥¹¥Ð ¤ìˆ¤ì4(€…ÍÍ•ÉÐ¹½¬¡Á…ÉÍ•%‘à€„ôô€´Ä€˜˜ÍÑ…Ñ•%¹¥Ñ%‘à€„ôô€´Ä€˜˜Á…ÉÍ•%‘à€ðÍÑ…Ñ•%¹¥Ñ%‘à°€‰Á…ÉÍ”­ÍÉÕˆµÕÍÐÁÉ••‘”ÍÑ…Ñ”¹¥¹¥Ð ¤ˆ¤ì4(€€¼¼UÍ•Ì¡¥ÍÑ½Éä¹É•Á±…•MÑ…Ñ”€¡¹½Ð„¹•Ü¡¥ÍÑ½Éä•¹ÑÉä¤Ñ¼‘É½ÀÑ¡”É•‘•¹Ñ¥…°¸4(€…ÍÍ•ÉÐ¹µ…Ñ ¡‰½½ÑMÉŒ°€½Ý¥¹‘½Ýp¹¡¥ÍÑ½Éåp¹É•Á±…•MÑ…Ñ•p¡¹Õ±°°€ˆˆ°‰½½Ñp¹±•…¹UÉ±p¤¼¤ì4(€€¼¼Q¡”É•‘•¹Ñ¥…°¥Ì¡…¹‘•½Ù•È•á…Ñ±ä½¹”°™É½´Ñ¡”Á…ÉÍ•Ù…±Õ”¸4(€½¹ÍÐ½ÕÉÉ•¹•Ì€ô€¡‰½½ÑMÉŒ¹µ…Ñ  ½Í•Ñ%¹¥Ñ¥…±É•‘•¹Ñ¥…±pýp¹p¡‰½½Ñp¹É•‘•¹Ñ¥…±p¤½œ¤ñðmt¤¹±•¹Ñ ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½ÕÉÉ•¹•Ì°€Ä°€‰Í•Ñ%¹¥Ñ¥…±É•‘•¹Ñ¥…°…±±••á…Ñ±ä½¹”Ý¥Ñ Ñ¡”Á…ÉÍ•É•‘•¹Ñ¥…°ˆ¤ì4(€€¼¼Q¡”É•‘•¹Ñ¥…°Á…Ñ µÕÍÐ9=PÁ•ÉÍ¥ÍÐÑ¡”Ñ½­•¸…¹åÝ¡•É”Í•É¥…±¥Í…‰±”¸4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡‰½½ÑMÉŒ°€½±½…±MÑ½É…•p¹Í•Ñ%Ñ•µp¡mx¥t©‰½½Ñp¹É•‘•¹Ñ¥…°¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡‰½½ÑMÉŒ°€½Í•ÍÍ¥½¹MÑ½É…•p¹Í•Ñ%Ñ•µp¡mx¥t©‰½½Ñp¹É•‘•¹Ñ¥…°¼¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É•™•ÉÉ•ÈÁ½±¥äè¥¹‘•à¹¡Ñµ°Í•ÑÌ¹¼µÉ•™•ÉÉ•È‰•™½É”…¹äÉ•Í½ÕÉ”±¥¹¬½ÍÉ¥ÁÐ°•á…Ñ±ä½¹”ˆ°€ ¤€ôøì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¥¹‘•á!Ñµ°°€¼ñµ•Ñ„¹…µ”ô‰É•™•ÉÉ•Èˆ½¹Ñ•¹Ðô‰¹¼µÉ•™•ÉÉ•Èˆø¼¤ì4(€½¹ÍÐµ•Ñ…%‘à€ô¥¹‘•á!Ñµ°¹¥¹‘•á=˜ œñµ•Ñ„¹…µ”ô‰É•™•ÉÉ•Èˆœ¤ì4(€½¹ÍÐ™¥ÉÍÑ1¥¹¬€ô¥¹‘•á!Ñµ°¹¥¹‘•á=˜ ˆñ±¥¹¬ˆ¤ì4(€½¹ÍÐ™¥ÉÍÑMÉ¥ÁÐ€ô¥¹‘•á!Ñµ°¹¥¹‘•á=˜ ˆñÍÉ¥ÁÐˆ¤ì4(€…ÍÍ•ÉÐ¹½¬¡µ•Ñ…%‘à€„ôô€´Ä¤ì4(€…ÍÍ•ÉÐ¹½¬¡™¥ÉÍÑ1¥¹¬€ôôô€´Äñðµ•Ñ…%‘à€ð™¥ÉÍÑ1¥¹¬°€‰É•™•ÉÉ•Èµ•Ñ„µÕÍÐÁÉ••‘”Ñ¡”™¥ÉÍÐ€ñ±¥¹¬øˆ¤ì4(€…ÍÍ•ÉÐ¹½¬¡™¥ÉÍÑMÉ¥ÁÐ€ôôô€´Äñðµ•Ñ…%‘à€ð™¥ÉÍÑMÉ¥ÁÐ°€‰É•™•ÉÉ•Èµ•Ñ„µÕÍÐÁÉ••‘”Ñ¡”™¥ÉÍÐ€ñÍÉ¥ÁÐøˆ¤ì4(€½¹ÍÐ½Õ¹Ð€ô€¡¥¹‘•á!Ñµ°¹µ…Ñ  ½¹…µ”ô‰É•™•ÉÉ•Èˆ½œ¤ñðmt¤¹±•¹Ñ ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½Õ¹Ð°€Ä°€‰•á…Ñ±ä½¹”É•™•ÉÉ•ÈÁ½±¥ä€¡¹¼‘ÕÁ±¥…Ñ”½½¹™±¥Ñ¥¹œ¤ˆ¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¥¹‘•á!Ñµ°°€½¡ÑÑÀµ•ÅÕ¥Øô‰É•™•ÉÉ•Èˆ½¤°€‰¹¼½¹™±¥Ñ¥¹œ¡ÑÑÀµ•ÅÕ¥ØÉ•™•ÉÉ•Èˆ¤ì4)ô¤ì4(