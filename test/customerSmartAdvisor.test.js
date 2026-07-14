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
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(onFocus, onHtmlChange) {
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this._innerHTML = "";
    this.textContent = "";
    this.scrollTop = 99;
    this.hidden = false;
    this.disabled = false;
    this.onFocus = onFocus;
    this.onHtmlChange = onHtmlChange;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.onHtmlChange?.(this._innerHTML); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.onFocus?.(this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeMount {
  constructor(fakeDocument = null) {
    this.isConnected = true;
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.document = fakeDocument;
    this.shellWrites = 0;
    this.launcher = new FakeElement((node) => { this.launcherFocuses += 1; if (this.document) this.document.activeElement = node; });
    this.host = new FakeElement(null, () => { this.shellWrites += 1; });
    this.layer = new FakeElement();
    this.body = new FakeElement();
    this.actions = new FakeElement();
    this.stepLabel = new FakeElement();
    this.progress = new FakeElement();
    this.catalog = new FakeElement();
    this.closeButton = new FakeElement((node) => { if (this.document) this.document.activeElement = node; });
    this.nextButton = new FakeElement((node) => { if (this.document) this.document.activeElement = node; });
    this.question = new FakeElement((node) => { this.questionFocuses += 1; if (this.document) this.document.activeElement = node; });
    this.result = new FakeElement((node) => { this.resultFocuses += 1; if (this.document) this.document.activeElement = node; });
    this.scroll = new FakeElement();
    this.dialog = new FakeElement();
    this.dialog.querySelectorAll = () => [this.closeButton, this.nextButton];
    this.resultFocuses = 0;
    this.questionFocuses = 0;
    this.launcherFocuses = 0;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  html() { return [this.host.innerHTML, this.body.innerHTML, this.catalog.innerHTML, this.actions.innerHTML].join(""); }
  querySelector(selector) {
    const open = this.host.innerHTML.includes("data-advisor-dialog");
    if (selector === "[data-advisor-launcher-content]") return this.launcher;
    if (selector === "[data-advisor-sheet-host]") return this.host;
    if (selector === "[data-advisor-launch]") return this.launcher;
    if (selector === "[data-advisor-backdrop]") return open ? this.layer : null;
    if (selector === "[data-advisor-dialog]") return open ? this.dialog : null;
    if (selector === "[data-advisor-close]") return open ? this.closeButton : null;
    if (selector === "[data-advisor-next]") return open ? this.nextButton : null;
    if (selector === "[data-advisor-scroll]") return open ? this.scroll : null;
    if (selector === "[data-advisor-body]") return open ? this.body : null;
    if (selector === "[data-advisor-actions]") return open ? this.actions : null;
    if (selector === "[data-advisor-step-label]") return open ? this.stepLabel : null;
    if (selector === "[data-advisor-progress]") return open ? this.progress : null;
    if (selector === "[data-advisor-catalog]") return open && this.body.innerHTML.includes("data-advisor-catalog") ? this.catalog : null;
    if (selector === "[data-advisor-question-title]") return open && !this.body.innerHTML.includes("data-advisor-result") ? this.question : null;
    if (selector === "[data-advisor-result]") return open && this.body.innerHTML.includes("data-advisor-result") ? this.result : null;
    return null;
  }
  querySelectorAll() { return []; }
  click(attributes) {
    const button = {
      hasAttribute: (name) => Object.hasOwn(attributes, name),
      getAttribute: (name) => attributes[name] ?? null,
    };
    this.listeners.get("click")?.({ target: { closest: () => button } });
  }
  clickBackdrop() {
    const backdrop = new FakeElement();
    this.listeners.get("click")?.({ target: { closest: (selector) => selector === "[data-advisor-backdrop]" ? backdrop : null } });
  }
}

function fakeDocument() {
  const listeners = new Map();
  return {
    activeElement: null,
    body: { classList: new FakeClassList() },
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    keydown(key, options = {}) {
      let prevented = false;
      listeners.get("keydown")?.({ key, shiftKey: options.shiftKey === true, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
}

function loadAdvisor(options = {}) {
  const routes = [];
  const contacts = [];
  const applied = [];
  const document = fakeDocument();
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
    document,
    Set,
    WeakMap,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {},
  }, { filename: "advisor.js" });
  return { app, routes, contacts, applied, document };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function completeWallStandardAdvisor(mount) {
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-repair": "none" });
  mount.click({ "data-advisor-next": "" });
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
  assert.equal(matches.length, 1);
});

test("catalog mapping excludes cross-AC and limits wrong wall variants to explicit alternatives", () => {
  const { app } = loadAdvisor();
  const standard = app.advisor._test.evaluateRecommendation({ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["none"] });
  const premium = catalogItem(2, { booking_wash_variant: "ล้างพรีเมียม", item_name: "ล้างพรีเมียม" });
  const fourway = catalogItem(3, { booking_ac_type: "สี่ทิศทาง", booking_wash_variant: null, item_name: "ล้างแอร์สี่ทิศทาง" });
  const matches = app.advisor._test.mapCatalogItems(standard, [premium, fourway], { adapter: () => ({ draft: {} }) });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].item.item_id, 2);
  assert.equal(matches[0].matchType, "alternative");
  assert.equal(matches[0].directBook, false);

  const html = app.advisor._test.stepContent({
    step: 4,
    acType: "wall",
    monthsBand: "m4_5",
    symptoms: ["routine"],
    repairSignals: ["none"],
    recommendation: standard,
  }, { status: "success", items: [premium, fourway] });
  assert.match(html, /ทางเลือกสำรอง/);
  assert.doesNotMatch(html, /ล้างแอร์สี่ทิศทาง/);
  assert.doesNotMatch(html, /จองบริการนี้/);
});

test("no exact Catalog match renders assessment CTA instead of a wrong direct-book action", () => {
  const { app } = loadAdvisor();
  const recommendation = app.advisor._test.evaluateRecommendation({ acType: "wall", monthsBand: "m4_5", symptoms: ["routine"], repairSignals: ["none"] });
  recommendation.alternative = null;
  const html = app.advisor._test.stepContent({
    step: 4,
    acType: "wall",
    monthsBand: "m4_5",
    symptoms: ["routine"],
    repairSignals: ["none"],
    recommendation,
  }, { status: "success", items: [catalogItem(9, { booking_ac_type: "สี่ทิศทาง" })] });
  assert.match(html, /ให้ทีมช่วยประเมิน/);
  assert.doesNotMatch(html, /จองบริการนี้/);
});

test("wizard advances, supports multi-select, refreshes Catalog, resets, and binds once", () => {
  const { app, document } = loadAdvisor({ catalog: { status: "loading", items: [] } });
  const mount = new FakeMount(document);
  const container = { querySelector: (selector) => selector === "[data-smart-advisor]" ? mount : null };
  const first = app.advisor.bind(container);
  const second = app.advisor.bind(container);
  assert.equal(first, second);
  assert.equal(mount.listeners.size, 1);

  mount.click({ "data-advisor-launch": "" });
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
  assert.match(mount.html(), /กำลังค้นหาบริการที่ตรงจาก Catalog/);
  assert.equal(mount.resultFocuses, 1);

  app.state.catalog.status = "success";
  app.state.catalog.items = [catalogItem(2, { booking_wash_variant: "ล้างพรีเมียม", item_name: "ล้างแอร์พรีเมียม" })];
  app.advisor.refreshCatalog(container);
  assert.match(mount.html(), /ล้างแอร์พรีเมียม/);
  mount.click({ "data-advisor-back": "" });
  assert.equal(first.state().step, 3);
  mount.click({ "data-advisor-reset": "" });
  assert.equal(first.state().step, 0);
  assert.equal(first.state().recommendation, null);
  assert.match(mount.html(), /แอร์ของคุณเป็นแบบไหน/);
  first.cleanup();
  assert.equal(mount.listeners.size, 0);
});

test("launcher opens an accessible sheet and close resumes the saved step", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  assert.equal(mount.host.innerHTML, "");
  assert.doesNotMatch(mount.launcher.innerHTML, /data-advisor-ac/);

  mount.click({ "data-advisor-launch": "" });
  assert.equal(controller.state().isOpen, true);
  assert.match(mount.launcher.innerHTML, /aria-expanded="true"/);
  assert.match(mount.host.innerHTML, /role="dialog"/);
  assert.match(mount.host.innerHTML, /aria-modal="true"/);
  assert.match(mount.html(), /data-advisor-ac/);
  assert.ok(runtime.document.body.classList.contains("has-advisor-sheet"));
  assert.equal(mount.questionFocuses, 1);

  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  assert.equal(controller.state().step, 1);
  assert.equal(mount.scroll.scrollTop, 0);
  mount.click({ "data-advisor-close": "" });
  assert.equal(controller.state().isOpen, false);
  assert.equal(controller.state().acType, "wall");
  assert.equal(mount.host.innerHTML, "");
  assert.match(mount.launcher.innerHTML, /ทำแบบประเมินต่อ/);
  assert.match(mount.launcher.innerHTML, /ทำถึงขั้นที่ 2 จาก 4/);
  assert.ok(!runtime.document.body.classList.contains("has-advisor-sheet"));
  assert.equal(mount.launcherFocuses, 1);
  assert.match(mount.launcher.innerHTML, /aria-expanded="false"/);

  mount.click({ "data-advisor-launch": "" });
  assert.equal(controller.state().step, 1);
  assert.match(mount.html(), /data-advisor-months/);
  assert.doesNotMatch(mount.html(), /data-advisor-ac=/);
});

test("sheet shell opens once while steps and Catalog refresh update in place", () => {
  const runtime = loadAdvisor({ catalog: { status: "loading", items: [] } });
  const mount = new FakeMount(runtime.document);
  const container = { querySelector: () => mount };
  const controller = runtime.app.advisor.bind(container);

  mount.click({ "data-advisor-launch": "" });
  const openingShell = mount.host.innerHTML;
  assert.equal(mount.shellWrites, 1);
  assert.match(openingShell, /advisor-sheet-layer is-opening/);
  assert.ok(mount.layer.classList.contains("is-opening"));

  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  assert.equal(mount.shellWrites, 1);
  assert.equal(mount.host.innerHTML, openingShell);
  assert.ok(!mount.layer.classList.contains("is-opening"));
  assert.ok(mount.body.classList.contains("is-step-forward"));

  mount.click({ "data-advisor-back": "" });
  assert.equal(mount.shellWrites, 1);
  assert.ok(mount.body.classList.contains("is-step-back"));

  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-repair": "none" });
  mount.click({ "data-advisor-next": "" });
  assert.equal(controller.state().step, 4);
  assert.equal(mount.shellWrites, 1);

  const focusedBeforeRefresh = new FakeElement();
  runtime.document.activeElement = focusedBeforeRefresh;
  mount.scroll.scrollTop = 173;
  const resultFocuses = mount.resultFocuses;
  runtime.app.state.catalog.status = "success";
  runtime.app.state.catalog.items = [catalogItem(1)];
  runtime.app.advisor.refreshCatalog(container);
  assert.equal(mount.shellWrites, 1);
  assert.equal(mount.host.innerHTML, openingShell);
  assert.equal(mount.scroll.scrollTop, 173);
  assert.equal(runtime.document.activeElement, focusedBeforeRefresh);
  assert.equal(mount.resultFocuses, resultFocuses);
  assert.match(mount.catalog.innerHTML, /data-advisor-product="1"/);

  mount.click({ "data-advisor-close": "" });
  assert.equal(mount.host.innerHTML, "");
  mount.click({ "data-advisor-launch": "" });
  assert.equal(mount.shellWrites, 3);
  assert.ok(mount.layer.classList.contains("is-opening"));
});

test("multi-select exclusive choices and Back preserve the existing answers", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-months": "m6_8" });
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-symptom": "heavy_use" });
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use"]);
  mount.click({ "data-advisor-next": "" });
  mount.click({ "data-advisor-repair": "none" });
  mount.click({ "data-advisor-repair": "error_code" });
  assert.deepEqual(Array.from(controller.state().repairSignals), ["error_code"]);
  mount.click({ "data-advisor-back": "" });
  assert.equal(controller.state().step, 2);
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use"]);
  assert.equal(mount.scroll.scrollTop, 0);
});

test("Escape, backdrop, focus trap and cleanup close the sheet without leaking listeners", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  assert.equal(runtime.document.listeners.size, 1);
  runtime.document.activeElement = mount.nextButton;
  assert.equal(runtime.document.keydown("Tab"), true);
  assert.equal(runtime.document.activeElement, mount.closeButton);
  assert.equal(runtime.document.keydown("Escape"), true);
  assert.equal(controller.state().isOpen, false);
  assert.equal(runtime.document.listeners.size, 0);

  mount.click({ "data-advisor-launch": "" });
  mount.clickBackdrop();
  assert.equal(controller.state().isOpen, false);
  mount.click({ "data-advisor-launch": "" });
  controller.cleanup();
  assert.equal(runtime.document.listeners.size, 0);
  assert.ok(!runtime.document.body.classList.contains("has-advisor-sheet"));
  assert.equal(mount.listeners.size, 0);
});

test("closed result stays compact and never exposes Catalog cards on Home", () => {
  const runtime = loadAdvisor({ catalog: { status: "success", items: [catalogItem(1)] } });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  completeWallStandardAdvisor(mount);
  assert.equal(controller.state().recommendation.verdict, "standard_clean");
  assert.match(mount.html(), /advisor-result-products/);
  mount.click({ "data-advisor-close": "" });
  assert.match(mount.launcher.innerHTML, /ผลล่าสุด/);
  assert.match(mount.launcher.innerHTML, /ดูผลประเมิน/);
  assert.doesNotMatch(mount.launcher.innerHTML, /advisor-product|data-advisor-item-action/);
  assert.equal(mount.host.innerHTML, "");
  mount.click({ "data-advisor-reset-launcher": "" });
  assert.equal(controller.state().recommendation, null);
  assert.equal(controller.state().step, 0);
  assert.equal(controller.state().isOpen, true);
  assert.match(mount.html(), /data-advisor-ac=/);
});

test("booking handoff routes only after both existing adapters succeed and otherwise contacts", () => {
  const item = catalogItem(8);
  const success = loadAdvisor({ catalog: { status: "success", items: [item] } });
  const mount = new FakeMount();
  const container = { querySelector: (selector) => selector === "[data-smart-advisor]" ? mount : null };
  success.app.advisor.bind(container);
  completeWallStandardAdvisor(mount);
  mount.click({ "data-advisor-item-action": "8" });
  assert.deepEqual(success.routes, ["scheduled"]);
  assert.equal(success.applied.length, 1);
  assert.equal(success.contacts.length, 0);

  const denied = loadAdvisor({ catalog: { status: "success", items: [item] }, adapter: () => null });
  const deniedMount = new FakeMount();
  denied.app.advisor.bind({ querySelector: () => deniedMount });
  completeWallStandardAdvisor(deniedMount);
  deniedMount.click({ "data-advisor-item-action": "8" });
  assert.equal(denied.routes.length, 0);
  assert.equal(denied.contacts.length, 1);

  const applyDenied = loadAdvisor({ catalog: { status: "success", items: [item] }, apply: () => false });
  const applyMount = new FakeMount();
  applyDenied.app.advisor.bind({ querySelector: () => applyMount });
  completeWallStandardAdvisor(applyMount);
  applyMount.click({ "data-advisor-item-action": "8" });
  assert.equal(applyDenied.routes.length, 0);
  assert.equal(applyDenied.contacts.length, 1);
});

test("manipulated unrelated Catalog item id is rejected before booking adapters run", () => {
  let adapterCalls = 0;
  let applyCalls = 0;
  const unrelated = catalogItem(9, { booking_ac_type: "สี่ทิศทาง", booking_wash_variant: null });
  const runtime = loadAdvisor({
    catalog: { status: "success", items: [unrelated] },
    adapter: () => { adapterCalls += 1; return { draft: {} }; },
    apply: () => { applyCalls += 1; return true; },
  });
  const mount = new FakeMount();
  runtime.app.advisor.bind({ querySelector: () => mount });
  completeWallStandardAdvisor(mount);
  mount.click({ "data-advisor-item-action": "9" });
  assert.equal(adapterCalls, 0);
  assert.equal(applyCalls, 0);
  assert.equal(runtime.routes.length, 0);
  assert.equal(runtime.contacts.length, 1);
});

test("repair result always opens Contact Sheet even when a repair item has adapter-compatible metadata", () => {
  const repairItem = catalogItem(9, { item_name: "ตรวจเช็คแอร์", job_category: "ตรวจเช็ค" });
  const runtime = loadAdvisor({ catalog: { status: "success", items: [repairItem] } });
  const mount = new FakeMount();
  const container = { querySelector: () => mount };
  const controller = runtime.app.advisor.bind(container);
  mount.click({ "data-advisor-launch": "" });
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
  assert.match(html, /ไม่แน่ใจว่าควรล้างหรือซ่อม/);
  assert.match(html, /data-advisor-launch/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /data-advisor-ac|data-advisor-months|data-advisor-symptom|data-advisor-repair/);
  assert.doesNotMatch(html, /ความคืบหน้าการประเมิน|ขั้นที่ 1 จาก 4/);
  assert.match(CSS_SOURCE, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS_SOURCE, /\.advisor-sheet[\s\S]*?max-height: 90dvh/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-actions[\s\S]*?safe-area-inset-bottom/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-layer[\s\S]*?z-index: 100/);
  assert.match(CSS_SOURCE, /\.advisor-sheet \.advisor-chip-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS_SOURCE, /@media \(max-width: 380px\)[\s\S]*?\.advisor-sheet \.advisor-choice-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS_SOURCE, /@media \(max-height: 620px\)[\s\S]*?max-height: 92dvh/);
  assert.match(CSS_SOURCE, /body\.has-advisor-sheet \{ overflow: hidden/);
  assert.match(CSS_SOURCE, /@keyframes advisor-orbit/);
  assert.match(CSS_SOURCE, /@keyframes advisor-sheet-up/);
  assert.match(CSS_SOURCE, /@keyframes advisor-question-forward/);
  assert.match(CSS_SOURCE, /@keyframes advisor-result-reveal/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-layer\.is-opening \{ animation: advisor-backdrop-in/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-layer\.is-opening \.advisor-sheet \{ animation: advisor-sheet-up/);
  assert.doesNotMatch(CSS_SOURCE.match(/\.advisor-sheet-layer \{[\s\S]*?\}/)?.[0] || "", /animation:/);
  assert.doesNotMatch(CSS_SOURCE.match(/\.advisor-sheet \{[\s\S]*?\}/)?.[0] || "", /animation:/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-body\.is-step-forward > \.advisor-step/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-body\.is-step-back > \.advisor-step/);
  assert.match(CSS_SOURCE, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.advisor-sheet-layer[\s\S]*?animation: none !important/);
  assert.doesNotMatch(SOURCE, /setInterval\s*\(/);
  assert.match(SOURCE, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  const reduced = loadAdvisor({ reducedMotion: true });
  const mount = new FakeMount(reduced.document);
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
  const build = "20260714_smart_advisor_compact_sheet_v1";
  assert.ok(INDEX_SOURCE.indexOf(`modules/advisor.js?v=${build}`) < INDEX_SOURCE.indexOf(`modules/ui.js?v=${build}`));
  assert.match(SW_SOURCE, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(SW_SOURCE, /modules\/advisor\.js\?v=\$\{BUILD_ID\}/);
});
