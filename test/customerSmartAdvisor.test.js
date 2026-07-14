"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/advisor.js"), "utf8");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/ui.js"), "utf8");
const CSS_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.css"), "utf8");
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/index.html"), "utf8");
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/sw.js"), "utf8");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function catalogItem(id, overrides = {}) {
  return {
    item_id: id,
    item_name: `บริการ ${id}`,
    item_category: "ล้างแอร์",
    job_category: "ล้าง",
    booking_mode: "bookable",
    booking_ac_type: "ผนัง",
    booking_btu: 12000,
    booking_wash_variant: "ล้างธรรมดา",
    is_active: true,
    is_customer_visible: true,
    display_price: 750,
    unit_label: "เครื่อง",
    images: [],
    ...overrides,
  };
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(value, force) { if (force) this.values.add(value); else this.values.delete(value); }
}

class FakeProgress {
  constructor() { this.classList = new FakeClassList(); this.attributes = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
}

class FakeMount {
  constructor() {
    this.isConnected = true;
    this.listeners = new Map();
    this.body = { innerHTML: "" };
    this.progress = [new FakeProgress(), new FakeProgress(), new FakeProgress(), new FakeProgress()];
    this.resultFocuses = 0;
    this.firstFocuses = 0;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  querySelector(selector) {
    if (selector === "[data-advisor-body]") return this.body;
    if (selector === "[data-advisor-result]") return { focus: () => { this.resultFocuses += 1; } };
    if (selector === "[data-advisor-ac]") return { focus: () => { this.firstFocuses += 1; } };
    return null;
  }
  querySelectorAll(selector) { return selector === "[data-advisor-progress]" ? this.progress : []; }
  click(attributes) {
    const button = {
      hasAttribute: (name) => Object.hasOwn(attributes, name),
      getAttribute: (name) => attributes[name] ?? null,
    };
    this.listeners.get("click")?.({ target: { closest: () => button } });
  }
}

function loadAdvisor(options = {}) {
  const routes = [];
  const contacts = [];
  const applied = [];
  const catalog = options.catalog || { status: "success", items: [] };
  const app = {
    state: { catalog },
    utils: {
      escapeHtml,
      formatBaht: (value) => `${value} บาท`,
      icon: (name) => `<i data-icon="${name}"></i>`,
      routeTo: (route) => routes.push(route),
    },
    services: {
      catalogItemToCommerceDraft: options.adapter || ((item) => item.booking_mode === "bookable" && item.booking_btu ? { id: item.item_id, draft: {} } : null),
      applyCommerceDraft: options.apply || ((scope, draft) => { applied.push({ scope, draft }); return true; }),
    },
    ui: { openContactSheet: (_container, item) => contacts.push(item) },
  };
  vm.runInNewContext(SOURCE, {
    window: { CWFCustomerAppV2: app, matchMedia: () => ({ matches: options.reducedMotion === true }) },
    Set,
    WeakMap,
    requestAnimationFrame: (fn) => fn(),
  }, { filename: "advisor.js" });
  return { app, routes, contacts, applied };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("wall recommendation engine covers standard premium coil overhaul and uncertain overdue cases", () => {
  const { app } = loadAdvisor();
  const evaluate = app.advisor._test.evaluateRecommendation;
  assert.equal(evaluate({ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["none"] }).verdict, "standard_clean");
  assert.equal(evaluate({ acType: "wall", monthsBand: "m6_8", symptoms: ["heavy_use"], repairSignals: ["none"] }).verdict, "premium_clean");
  assert.equal(evaluate({ acType: "wall", monthsBand: "m9_12", symptoms: ["weak_airflow", "odor"], repairSignals: ["none"] }).verdict, "hanging_coil");
  assert.equal(evaluate({ acType: "wall", monthsBand: "over12", symptoms: ["heavy_dirt"], repairSignals: ["none"] }).verdict, "big_wash");
  const uncertain = evaluate({ acType: "wall", monthsBand: "over12", symptoms: ["routine"], repairSignals: ["none"] });
  assert.equal(uncertain.verdict, "hanging_coil");
  assert.equal(uncertain.alternative, "big_wash");
  assert.equal(uncertain.confidence, "assessment");
});

test("repair signals override cleaning while reduced cooling alone does not", () => {
  const { app } = loadAdvisor();
  const evaluate = app.advisor._test.evaluateRecommendation;
  for (const signal of ["error_code", "outdoor_not_running", "indoor_not_running", "breaker_trip", "ac_not_running", "burning_smell"]) {
    const result = evaluate({ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: [signal] });
    assert.equal(result.verdict, "repair_check", signal);
    assert.equal(result.action, "contact");
  }
  assert.notEqual(evaluate({ acType: "wall", monthsBand: "m6_8", symptoms: ["reduced_cooling"], repairSignals: ["none"] }).verdict, "repair_check");
});

test("unknown and non-wall AC types fail closed without a wall wash variant", () => {
  const { app } = loadAdvisor();
  const evaluate = app.advisor._test.evaluateRecommendation;
  const unknown = evaluate({ acType: "unknown", monthsBand: "m6_8", symptoms: ["routine"], repairSignals: ["none"] });
  assert.equal(unknown.verdict, "needs_assessment");
  assert.equal(unknown.catalogIntent, null);
  for (const acType of ["fourway", "hanging", "ceiling"]) {
    const result = evaluate({ acType, monthsBand: "m6_8", symptoms: ["routine"], repairSignals: ["none"] });
    assert.equal(result.verdict, "needs_assessment");
    assert.equal(result.catalogIntent.acType, acType);
    assert.equal(result.catalogIntent.variant, undefined);
  }
});

test("catalog mapping uses exact authoritative metadata for all wash variants and repair", () => {
  const { app } = loadAdvisor();
  const { evaluateRecommendation, mapCatalogItems } = app.advisor._test;
  const items = [
    catalogItem(1),
    catalogItem(2, { booking_wash_variant: "ล้างพรีเมียม" }),
    catalogItem(3, { booking_wash_variant: "ล้างแขวนคอยล์" }),
    catalogItem(4, { booking_wash_variant: "ล้างแบบตัดล้าง" }),
    catalogItem(5, { item_name: "ตรวจเช็คแอร์", item_category: "ตรวจเช็ค", job_category: "ตรวจเช็ค", booking_mode: "contact_admin", booking_ac_type: null, booking_btu: null, booking_wash_variant: null }),
  ];
  const cases = [
    [{ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["none"] }, 1],
    [{ acType: "wall", monthsBand: "m6_8", symptoms: ["heavy_use"], repairSignals: ["none"] }, 2],
    [{ acType: "wall", monthsBand: "m9_12", symptoms: ["odor"], repairSignals: ["none"] }, 3],
    [{ acType: "wall", monthsBand: "over12", symptoms: ["heavy_dirt"], repairSignals: ["none"] }, 4],
    [{ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["error_code"] }, 5],
  ];
  for (const [input, expectedId] of cases) {
    const matches = mapCatalogItems(evaluateRecommendation(input), items, { adapter: (item) => item.booking_mode === "bookable" ? { draft: {} } : null });
    assert.equal(matches[0].item.item_id, expectedId);
    assert.equal(matches[0].exact, true);
    if (expectedId === 5) assert.equal(matches[0].directBook, false);
  }
});

test("catalog mapping filters inactive hidden duplicate rows and never treats incomplete metadata as direct-book", () => {
  const { app } = loadAdvisor();
  const recommendation = app.advisor._test.evaluateRecommendation({ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["none"] });
  const items = [
    catalogItem(1),
    catalogItem(1, { item_name: "duplicate" }),
    catalogItem(2, { is_active: false }),
    catalogItem(3, { is_customer_visible: false }),
    catalogItem(4, { booking_btu: null }),
  ];
  const matches = app.advisor._test.mapCatalogItems(recommendation, items, {
    adapter: (item) => item.booking_btu ? { draft: {} } : null,
  });
  assert.deepEqual(plain(matches.map((match) => match.item.item_id)), [1, 4]);
  assert.equal(matches[0].directBook, true);
  assert.equal(matches[1].directBook, false);
});

test("non-wall catalog matching requires the exact AC type", () => {
  const { app } = loadAdvisor();
  const recommendation = app.advisor._test.evaluateRecommendation({ acType: "fourway", monthsBand: "m6_8", symptoms: ["routine"], repairSignals: ["none"] });
  const matches = app.advisor._test.mapCatalogItems(recommendation, [
    catalogItem(1),
    catalogItem(2, { booking_ac_type: "สี่ทิศทาง", booking_wash_variant: null, item_name: "ล้างแอร์สี่ทิศทาง" }),
  ], { adapter: () => ({ draft: {} }) });
  assert.equal(matches[0].item.item_id, 2);
  assert.equal(matches[0].exact, true);
});

test("wizard advances, supports multi-select, refreshes Catalog, resets, and binds once", () => {
  const { app } = loadAdvisor({ catalog: { status: "loading", items: [] } });
  const mount = new FakeMount();
  const container = { querySelector: (selector) => selector === "[data-smart-advisor]" ? mount : null };
  const first = app.advisor.bind(container);
  const second = app.advisor.bind(container);
  assert.equal(first, second);
  assert.equal(mount.listeners.size, 1);

  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-months": "m6_8" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-symptom": "heavy_use" });
  mount.click({ "data-advisor-symptom": "pets" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-repair": "none" });
  mount.click({ "data-advisor-next": "" });
  assert.equal(first.state().recommendation.verdict, "premium_clean");
  assert.match(mount.body.innerHTML, /กำลังค้นหาบริการที่ตรงจาก Catalog/);
  assert.equal(mount.resultFocuses, 1);

  app.state.catalog.status = "success";
  app.state.catalog.items = [catalogItem(2, { booking_wash_variant: "ล้างพรีเมียม", item_name: "ล้างแอร์พรีเมียม" })];
  app.advisor.refreshCatalog(container);
  assert.match(mount.body.innerHTML, /ล้างแอร์พรีเมียม/);
  mount.click({ "data-advisor-back": "" });
  assert.equal(first.state().step, 3);
  mount.click({ "data-advisor-reset": "" });
  assert.equal(first.state().step, 0);
  assert.equal(mount.firstFocuses, 1);
  first.cleanup();
  assert.equal(mount.listeners.size, 0);
});

test("booking handoff routes only after both existing adapters succeed and otherwise contacts", () => {
  const item = catalogItem(8);
  const success = loadAdvisor({ catalog: { status: "success", items: [item] } });
  const mount = new FakeMount();
  const container = { querySelector: (selector) => selector === "[data-smart-advisor]" ? mount : null };
  success.app.advisor.bind(container);
  mount.click({ "data-advisor-item-action": "8" });
  assert.deepEqual(success.routes, ["scheduled"]);
  assert.equal(success.applied.length, 1);
  assert.equal(success.contacts.length, 0);

  const denied = loadAdvisor({ catalog: { status: "success", items: [item] }, adapter: () => null });
  const deniedMount = new FakeMount();
  denied.app.advisor.bind({ querySelector: () => deniedMount });
  deniedMount.click({ "data-advisor-item-action": "8" });
  assert.equal(denied.routes.length, 0);
  assert.equal(denied.contacts.length, 1);

  const applyDenied = loadAdvisor({ catalog: { status: "success", items: [item] }, apply: () => false });
  const applyMount = new FakeMount();
  applyDenied.app.advisor.bind({ querySelector: () => applyMount });
  applyMount.click({ "data-advisor-item-action": "8" });
  assert.equal(applyDenied.routes.length, 0);
  assert.equal(applyDenied.contacts.length, 1);
});

test("repair result always opens Contact Sheet even when a repair item has adapter-compatible metadata", () => {
  const repairItem = catalogItem(9, { item_name: "ตรวจเช็คแอร์", job_category: "ตรวจเช็ค" });
  const runtime = loadAdvisor({ catalog: { status: "success", items: [repairItem] } });
  const mount = new FakeMount();
  const container = { querySelector: () => mount };
  const controller = runtime.app.advisor.bind(container);
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-repair": "error_code" });
  mount.click({ "data-advisor-next": "" });
  assert.equal(controller.state().recommendation.verdict, "repair_check");
  mount.click({ "data-advisor-item-action": "9" });
  assert.equal(runtime.routes.length, 0);
  assert.equal(runtime.applied.length, 0);
  assert.equal(runtime.contacts.length, 1);
});

test("advisor render contract is accessible, compact, motion-safe, and has no autoplay timer", () => {
  const { app } = loadAdvisor();
  const html = app.advisor.renderSection({ status: "success", items: [] });
  assert.match(html, /data-smart-advisor/);
  assert.match(html, /แอร์ของคุณเป็นแบบไหน/);
  assert.match(html, /aria-label="ความคืบหน้าการประเมิน"/);
  assert.match(CSS_SOURCE, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS_SOURCE, /\.advisor-choice,[\s\S]*?min-height: 44px/);
  assert.match(CSS_SOURCE, /@keyframes advisor-step-in/);
  assert.match(CSS_SOURCE, /@keyframes health-ring-sweep/);
  assert.doesNotMatch(SOURCE, /setInterval\s*\(/);
  assert.match(SOURCE, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  const reduced = loadAdvisor({ reducedMotion: true });
  const mount = new FakeMount();
  assert.equal(reduced.app.advisor.bind({ querySelector: () => mount }).reducedMotion, true);
});

test("Home places built-in advisor after Quick Actions and before Featured Services", () => {
  const app = {
    state: {
      homepage: { config: { sections: [
        { id: "hero", type: "hero", enabled: true, sort_order: 10, title: "Hero", items: [] },
        { id: "quick", type: "quick", enabled: true, sort_order: 20, items: [] },
        { id: "featured", type: "featured_services", enabled: true, sort_order: 30, title: "Featured", items: [] },
      ] } },
      catalog: { status: "success", items: [] },
    },
    advisor: { renderSection: () => `<section data-smart-advisor>Advisor</section>` },
    utils: { escapeHtml, icon: () => "", formatBaht: () => "-", stateBox: () => "" },
    services: { quickServices: [], WALL_AC: "ผนัง" },
  };
  vm.runInNewContext(UI_SOURCE, {
    window: { CWFCustomerAppV2: app },
    document: { body: { classList: { add() {}, remove() {} } }, getElementById: () => null },
    URL,
    WeakMap,
    Set,
    console,
  });
  const html = app.ui._test.renderHomepageSectionsWithAdvisor();
  assert.ok(html.indexOf("data-home-section=\"quick\"") < html.indexOf("data-smart-advisor"));
  assert.ok(html.indexOf("data-smart-advisor") < html.indexOf("data-home-featured-section"));
});

test("advisor module is loaded before ui.js and precached under the shared build id", () => {
  const build = "20260714_customer_smart_advisor_motion_v1";
  assert.ok(INDEX_SOURCE.indexOf(`modules/advisor.js?v=${build}`) < INDEX_SOURCE.indexOf(`modules/ui.js?v=${build}`));
  assert.match(SW_SOURCE, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(SW_SOURCE, /modules\/advisor\.js\?v=\$\{BUILD_ID\}/);
});
