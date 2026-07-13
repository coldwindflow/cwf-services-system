"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function loadHomepage(items) {
  const app = {
    state: { catalog: { status: "success", items } },
    utils: {
      escapeHtml: (value) => String(value == null ? "" : value),
      formatBaht: (value) => `${Number(value).toLocaleString("th-TH")} บาท`,
      icon: () => "<i></i>",
      stateBox: (_kind, message) => `<p>${message}</p>`,
    },
    services: { WALL_AC: "ผนัง" },
  };
  vm.runInNewContext(read("customer-app/modules/ui.js"), {
    window: { CWFCustomerAppV2: app },
    document: {},
    console: { info() {} },
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  return app;
}

function catalogItem(id, options = {}) {
  return {
    item_id: id,
    item_name: `บริการ ${id}`,
    is_active: true,
    is_customer_visible: true,
    is_featured: false,
    booking_mode: "contact_admin",
    base_price: 500 + id,
    unit_label: "เครื่อง",
    ...options,
  };
}

test("featured auto mode fills six unique visible active items with featured then bookable priority", () => {
  const app = loadHomepage([
    catalogItem(1, { is_featured: true }),
    catalogItem(2, { is_featured: true, booking_mode: "bookable" }),
    catalogItem(2, { is_featured: true, booking_mode: "bookable" }),
    catalogItem(3, { is_featured: true, is_active: false }),
    catalogItem(4, { is_featured: true, is_customer_visible: false }),
    catalogItem(5, { booking_mode: "bookable" }),
    catalogItem(6),
    catalogItem(7, { booking_mode: "bookable" }),
    catalogItem(8),
  ]);
  const selected = app.ui._test.featuredCatalogPool({ featured_mode: "auto", featured_limit: 6 });
  assert.deepEqual(Array.from(selected, (item) => item.item_id), [2, 1, 5, 7, 6, 8]);
});

test("featured manual mode preserves configured order, removes duplicates, and never auto-fills", () => {
  const app = loadHomepage([
    catalogItem(1, { is_featured: true }),
    catalogItem(2),
    catalogItem(3),
  ]);
  const selected = app.ui._test.featuredCatalogPool({ featured_mode: "manual", featured_limit: 6, item_ids: [3, 1, 3] });
  assert.deepEqual(Array.from(selected, (item) => item.item_id), [3, 1]);
  assert.deepEqual(Array.from(app.ui._test.featuredCatalogPool({ featured_mode: "manual", featured_limit: 6, item_ids: [] })), []);
});

test("homepage renders a single compact page without timer controls when the pool has six items", () => {
  const app = loadHomepage(Array.from({ length: 6 }, (_, index) => catalogItem(index + 1, { is_featured: index < 2 })));
  const html = app.ui._test.renderHomepageFeaturedServices({ featured_mode: "auto", featured_limit: 6 });
  assert.equal((html.match(/class="homepage-service-card"/g) || []).length, 6);
  assert.match(html, /homepage-featured-grid/);
  assert.match(html, /data-featured-page-count="1"/);
  assert.doesNotMatch(html, /data-featured-dot|aria-hidden="true"/);
});

test("homepage hero expands and six-card grid is genuinely compact without shrinking its CTA", () => {
  const css = read("customer-app/assets/customer-app.css");
  const hero = css.match(/\.homepage-hero\s*\{[^}]*\}/)[0];
  const title = css.match(/\.homepage-hero h2\s*\{[^}]*\}/)[0];
  const body = css.match(/\.homepage-hero p\s*\{[^}]*\}/)[0];
  const cardImage = css.match(/\.homepage-service-card \.homepage-card-image\s*\{[^}]*\}/)[0];
  const cardBody = css.match(/\.homepage-service-card \.homepage-card-body\s*\{[^}]*\}/)[0];
  const cardTitle = css.match(/\.homepage-service-card \.homepage-card-body strong\s*\{[^}]*\}/)[0];
  const cardAction = css.match(/\.homepage-service-action\s*\{[^}]*\}/)[0];
  assert.match(hero, /min-height:\s*220px/);
  assert.doesNotMatch(hero, /\n\s*height:/);
  assert.doesNotMatch(title, /line-clamp|text-overflow|overflow:\s*hidden/);
  assert.doesNotMatch(body, /line-clamp|text-overflow|overflow:\s*hidden/);
  assert.match(css, /\.homepage-featured-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(cardImage, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.doesNotMatch(cardImage, /aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(cardBody, /gap:\s*2px/);
  assert.match(cardBody, /padding:\s*6px 8px 4px/);
  assert.match(cardTitle, /line-clamp:\s*3/);
  assert.doesNotMatch(cardTitle, /min-height/);
  assert.match(cardAction, /min-height:\s*44px/);
  assert.match(cardAction, /margin:\s*0 8px 8px/);
});

test("homepage hero renders long CMS title and body without altering or truncating content", () => {
  const app = loadHomepage([]);
  const title = "บริการล้างแอร์ครบทุกประเภทสำหรับบ้าน คอนโด และสำนักงานของคุณ";
  const body = "เลือกบริการ ตรวจสอบราคา และจองวันเวลาที่สะดวกจากคิวช่างจริง พร้อมติดตามสถานะงานได้ทุกขั้นตอน";
  const html = app.ui._test.renderHomepageHero({
    type: "hero",
    title,
    body,
    image_url: "https://example.test/hero.jpg",
    cta_primary: { label: "จองบริการ", route: "booking" },
  });
  assert.match(html, new RegExp(title));
  assert.match(html, new RegExp(body));
  assert.doesNotMatch(html, /\.\.\.|…/);
});

function runRedirectStub(file, search = "") {
  const html = read(file);
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
  let destination = "";
  vm.runInNewContext(script, {
    window: {
      location: {
        search,
        replace(value) { destination = value; },
      },
    },
    URLSearchParams,
    encodeURIComponent,
  });
  return { destination, html };
}

test("legacy static booking and profile pages replace history with Customer App V2", () => {
  const customer = runRedirectStub("customer.html");
  const register = runRedirectStub("register.html");
  assert.equal(customer.destination, "/customer-app/index.html#booking");
  assert.equal(register.destination, "/customer-app/index.html#profile");
  for (const page of [customer.html, register.html]) {
    assert.match(page, /noindex,nofollow/);
    assert.match(page, /name="referrer" content="no-referrer"/);
    assert.match(page, /http-equiv="Cache-Control" content="no-store/);
    assert.doesNotMatch(page, /\/public\/book|\/public\/register|fetch\(/);
  }
});

test("legacy tracking stub maps only audited q/token credentials into the fragment", () => {
  assert.equal(runRedirectStub("track.html").destination, "/customer-app/index.html#tracking");
  assert.equal(runRedirectStub("track.html", "?q=CWFTEST123").destination, "/customer-app/index.html#tracking?q=CWFTEST123");
  assert.equal(runRedirectStub("track.html", "?q=private%20token%2F%2B").destination, "/customer-app/index.html#tracking?q=private%20token%2F%2B");
  assert.equal(runRedirectStub("track.html", "?token=private-token").destination, "/customer-app/index.html#tracking?q=private-token");
  const html = read("track.html");
  assert.doesNotMatch(html, /localStorage|sessionStorage|console\.|fetch\(|booking_token/);
});

test("server legacy redirects are registered before static serving and keep credentials out of destination query", () => {
  const source = read("index.js");
  const routeIndex = source.indexOf('app.get(["/customer", "/customer.html"]');
  const staticIndex = source.indexOf("app.use(express.static(ROOT_DIR))");
  assert.ok(routeIndex > 0 && routeIndex < staticIndex);
  assert.match(source, /app\.get\(\["\/register", "\/register\.html"\]/);
  assert.match(source, /app\.get\(\["\/track", "\/track\.html"\]/);
  assert.match(source, /req\.query\?\.q \|\| req\.query\?\.token/);
  assert.match(source, /`\$\{CUSTOMER_APP_TRACKING_URL\}\?q=\$\{encodeURIComponent\(credential\)\}`/);
  assert.doesNotMatch(source.slice(routeIndex, staticIndex), /sendFile\(sendHtml\("(?:customer|track|register)\.html"\)\)/);
});

test("legacy customer auth callback and GET logout return to Customer App profile", () => {
  const source = read("index.js");
  const callback = source.slice(source.indexOf("app.get('/auth/line/callback'"), source.indexOf("app.get('/auth/line/app'"));
  const logout = source.slice(source.indexOf("app.get('/public/logout'"), source.indexOf("app.post('/public/logout'"));
  assert.match(callback, /redirectLegacyCustomerPage\(res, CUSTOMER_APP_PROFILE_URL\)/);
  assert.doesNotMatch(callback, /customer\.html/);
  assert.match(logout, /redirectLegacyCustomerPage\(res, CUSTOMER_APP_PROFILE_URL\)/);
  assert.doesNotMatch(logout, /customer\.html/);
});

function loadRootServiceWorker(options = {}) {
  const listeners = {};
  const deleted = [];
  const matchCalls = [];
  const openCalls = [];
  const cacheKeys = options.cacheKeys || [];
  const caches = {
    async keys() { return cacheKeys; },
    async delete(key) { deleted.push(key); return true; },
    async open(key) {
      openCalls.push(key);
      return { addAll: async () => {}, put: async () => {} };
    },
    async match(key) {
      matchCalls.push(key);
      return options.match ? options.match(key) : undefined;
    },
  };
  const sandbox = {
    self: {
      location: { origin: "https://app.example.test" },
      addEventListener(type, handler) { listeners[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: options.fetch || (async () => new Response("network")),
    URL,
    Response,
  };
  vm.runInNewContext(read("sw.js"), sandbox, { filename: "sw.js" });
  return { listeners, deleted, matchCalls, openCalls };
}

async function runSwFetch(harness, url, mode = "navigate") {
  let responsePromise;
  harness.listeners.fetch({
    request: { method: "GET", url, mode },
    respondWith(value) { responsePromise = Promise.resolve(value); },
  });
  return { responded: !!responsePromise, response: responsePromise ? await responsePromise : null };
}

test("root service worker handles every legacy path network-only before generic caching", async () => {
  const fetchCalls = [];
  const harness = loadRootServiceWorker({
    fetch: async (request, options) => {
      fetchCalls.push({ request, options });
      return new Response("redirect", { status: 200 });
    },
  });
  for (const pathname of ["/customer", "/customer.html", "/track", "/track.html?q=CWFTEST123", "/register", "/register.html/"]) {
    const result = await runSwFetch(harness, `https://app.example.test${pathname}`);
    assert.equal(result.response.status, 200);
  }
  assert.equal(fetchCalls.length, 6);
  assert.ok(fetchCalls.every((call) => call.options.cache === "no-store"));
  assert.equal(harness.openCalls.length, 0);
  assert.equal(harness.matchCalls.length, 0);
});

test("offline legacy navigation never returns cached legacy or Tech fallback", async () => {
  const harness = loadRootServiceWorker({
    fetch: async () => { throw new Error("offline"); },
    match: async () => new Response("must not be used"),
  });
  const result = await runSwFetch(harness, "https://app.example.test/track.html?token=private-token");
  assert.equal(result.response.status, 503);
  assert.equal(harness.matchCalls.length, 0);
  assert.equal(harness.openCalls.length, 0);
});

test("root cache activation removes prior root caches but preserves current and Customer App V2 caches", async () => {
  const current = "cwf-root-tech-app-20260712_job_location_roundtrip_v1-20260703_accounting_payout_adjustment_v1-20260713_retire_legacy_customer_ui_v1";
  const harness = loadRootServiceWorker({ cacheKeys: ["cwf-root-tech-app-old", current, "cwf-customer-app-v2-current", "other-cache"] });
  let activation;
  harness.listeners.activate({ waitUntil(value) { activation = Promise.resolve(value); } });
  await activation;
  assert.deepEqual(harness.deleted, ["cwf-root-tech-app-old"]);
});

test("root service worker keeps API bypass and Tech offline fallback behavior", async () => {
  const harness = loadRootServiceWorker({
    fetch: async () => { throw new Error("offline"); },
    match: async (key) => typeof key === "string" && key.startsWith("/tech.html") ? new Response("tech-shell") : undefined,
  });
  const api = await runSwFetch(harness, "https://app.example.test/api/jobs", "cors");
  assert.equal(api.responded, false);
  const tech = await runSwFetch(harness, "https://app.example.test/tech.html");
  assert.equal(await tech.response.text(), "tech-shell");
  assert.ok(harness.matchCalls.some((key) => typeof key === "string" && key.startsWith("/tech.html")));
});
