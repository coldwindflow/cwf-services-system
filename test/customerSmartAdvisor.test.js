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

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
}

function fakeEventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); },
  };
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
    this.style = new FakeStyle();
    this.document = fakeDocument;
    if (this.document) this.document.mount = this;
    this.launcher = new FakeElement((node) => { this.launcherFocuses += 1; if (this.document) this.document.activeElement = node; });
    this.resultFocuses = 0;
    this.questionFocuses = 0;
    this.launcherFocuses = 0;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  get portal() { return this.document?.portal || null; }
  get shellWrites() { return this.portal?.shellWrites || 0; }
  get host() { return this.portal || new FakeElement(); }
  get layer() { return this.portal?.layer || new FakeElement(); }
  get body() { return this.portal?.body || new FakeElement(); }
  get actions() { return this.portal?.actions || new FakeElement(); }
  get catalog() { return this.portal?.catalog || new FakeElement(); }
  get scroll() { return this.portal?.scroll || new FakeElement(); }
  get result() { return this.portal?.result || new FakeElement(); }
  get nextButton() { return this.portal?.nextButton || new FakeElement(); }
  get closeButton() { return this.portal?.closeButton || new FakeElement(); }
  html() { return [this.portal?.innerHTML, this.portal?.body.innerHTML, this.portal?.catalog.innerHTML, this.portal?.actions.innerHTML].join(""); }
  querySelector(selector) {
    if (selector === "[data-advisor-launcher-content]") return this.launcher;
    if (selector === "[data-advisor-launch]") return this.launcher;
    return null;
  }
  querySelectorAll() { return []; }
  click(attributes) {
    const button = {
      hasAttribute: (name) => Object.hasOwn(attributes, name),
      getAttribute: (name) => attributes[name] ?? null,
    };
    const launcherClick = Object.hasOwn(attributes, "data-advisor-launch") || Object.hasOwn(attributes, "data-advisor-reset-launcher");
    (launcherClick ? this.listeners.get("click") : this.portal?.listeners.get("click"))?.({ target: { closest: () => button } });
  }
  clickBackdrop() {
    const backdrop = new FakeElement();
    this.portal?.listeners.get("click")?.({ target: { closest: (selector) => selector === "[data-advisor-backdrop]" ? backdrop : null } });
  }
}

class FakePortal {
  constructor(fakeDocument) {
    this.document = fakeDocument;
    this.isConnected = false;
    this.parentElement = null;
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.attributes = new Map();
    this._innerHTML = "";
    this.shellWrites = 0;
    this.layer = new FakeElement();
    this.body = new FakeElement();
    this.actions = new FakeElement();
    this.stepLabel = new FakeElement();
    this.progress = new FakeElement();
    this.leading = new FakeElement();
    this.catalog = new FakeElement();
    this.closeButton = new FakeElement((node) => { this.document.activeElement = node; });
    this.nextButton = new FakeElement((node) => { this.document.activeElement = node; });
    this.question = new FakeElement((node) => {
      this.document.activeElement = node;
      if (this.document.mount) this.document.mount.questionFocuses += 1;
    });
    this.result = new FakeElement((node) => {
      this.document.activeElement = node;
      if (this.document.mount) this.document.mount.resultFocuses += 1;
    });
    this.scroll = new FakeElement();
    this.dialog = new FakeElement();
    this.dialog.querySelectorAll = () => [this.closeButton, this.nextButton];
  }
  set className(value) { this.classList.values = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return Array.from(this.classList.values).join(" "); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.shellWrites += 1; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  remove() { this.document.body.removeChild(this); }
  querySelector(selector) {
    const open = this.innerHTML.includes("data-advisor-dialog");
    if (selector === "[data-advisor-backdrop]") return open ? this.layer : null;
    if (selector === "[data-advisor-dialog]") return open ? this.dialog : null;
    if (selector === "[data-advisor-close]") return open ? this.closeButton : null;
    if (selector === "[data-advisor-scroll]") return open ? this.scroll : null;
    if (selector === "[data-advisor-body]") return open ? this.body : null;
    if (selector === "[data-advisor-actions]") return open ? this.actions : null;
    if (selector === "[data-advisor-step-label]") return open ? this.stepLabel : null;
    if (selector === "[data-advisor-progress]") return open ? this.progress : null;
    if (selector === "[data-advisor-header-leading]") return open ? this.leading : null;
    if (selector === "[data-advisor-catalog]") return open && this.body.innerHTML.includes("data-advisor-catalog") ? this.catalog : null;
    if (selector === "[data-advisor-question-title]") return open && !this.body.innerHTML.includes("data-advisor-result") ? this.question : null;
    if (selector === "[data-advisor-result]") return open && this.body.innerHTML.includes("data-advisor-result") ? this.result : null;
    return null;
  }
  querySelectorAll() { return []; }
}

function fakeDocument() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    portal: null,
    documentElement: { clientHeight: 760 },
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    keydown(key, options = {}) {
      let prevented = false;
      listeners.get("keydown")?.({ key, shiftKey: options.shiftKey === true, preventDefault: () => { prevented = true; } });
      return prevented;
    },
  };
  document.createElement = () => new FakePortal(document);
  document.body = {
    classList: new FakeClassList(),
    children: [],
    appendChild(node) {
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
      document.portal = node;
      return node;
    },
    removeChild(node) {
      this.children = this.children.filter((child) => child !== node);
      node.parentElement = null;
      node.isConnected = false;
      if (document.portal === node) document.portal = null;
    },
  };
  return document;
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
  const visualViewport = options.visualViewport ? fakeEventTarget({
    height: options.visualViewport.height,
    offsetTop: options.visualViewport.offsetTop || 0,
  }) : null;
  const fakeWindow = fakeEventTarget({
    CWFCustomerAppV2: app,
    innerHeight: options.innerHeight || 760,
    visualViewport,
    matchMedia: () => ({ matches: options.reducedMotion === true }),
  });
  const timers = new Map();
  let nextTimerId = 1;
  const setTimer = options.deferTimers
    ? (callback) => {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    }
    : (callback) => {
      callback();
      return nextTimerId++;
    };
  const clearTimer = (id) => timers.delete(id);
  const runTimers = () => {
    const callbacks = Array.from(timers.values());
    timers.clear();
    callbacks.forEach((callback) => callback());
  };
  vm.runInNewContext(SOURCE, {
    window: fakeWindow,
    document,
    Set,
    WeakMap,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: setTimer,
    clearTimeout: clearTimer,
  }, { filename: "advisor.js" });
  return { app, routes, contacts, applied, document, window: fakeWindow, visualViewport, timers, runTimers };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function completeWallStandardAdvisor(mount) {
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-repair": "none" });
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
  assert.match(html, /class="primary-btn"[^>]*data-advisor-contact/);
  assert.doesNotMatch(html, /จองบริการนี้/);
});

test("result footer keeps reset secondary while business actions remain primary", () => {
  const { app } = loadAdvisor();
  const resultState = {
    ...app.advisor._test.initialState(),
    step: 4,
    recommendation: app.advisor._test.evaluateRecommendation({
      acType: "wall",
      monthsBand: "m4_5",
      symptoms: ["routine"],
      repairSignals: ["none"],
    }),
  };
  const footer = app.advisor._test.sheetActions(resultState);
  assert.match(footer, /data-advisor-back/);
  assert.match(footer, /data-advisor-reset/);
  assert.doesNotMatch(footer, /primary-btn/);

  const exactHtml = app.advisor._test.stepContent(resultState, {
    status: "success",
    items: [catalogItem(1)],
  });
  assert.match(exactHtml, /class="primary-btn"[^>]*data-advisor-item-action/);

  const repairState = {
    ...resultState,
    recommendation: app.advisor._test.evaluateRecommendation({
      acType: "wall",
      monthsBand: "m4_5",
      symptoms: ["routine"],
      repairSignals: ["error_code"],
    }),
  };
  const repairHtml = app.advisor._test.stepContent(repairState, {
    status: "success",
    items: [],
  });
  assert.match(repairHtml, /class="primary-btn"[^>]*data-advisor-contact/);
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
  mount.click({ "data-advisor-months": "m6_8" });
  mount.click({ "data-advisor-symptom": "heavy_use" });
  mount.click({ "data-advisor-symptom": "pets" });
  mount.click({ "data-advisor-symptoms-done": "" });
  mount.click({ "data-advisor-repair": "none" });
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

test("sheet uses one body-level portal with separate event delegation and no orphan nodes", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  assert.equal(runtime.document.body.children.length, 0);

  mount.click({ "data-advisor-launch": "" });
  const firstPortal = runtime.document.portal;
  assert.ok(firstPortal);
  assert.equal(firstPortal.parentElement, runtime.document.body);
  assert.equal(firstPortal.getAttribute("data-advisor-portal"), "");
  assert.equal(runtime.document.body.children.length, 1);
  assert.equal(mount.listeners.size, 1);
  assert.equal(firstPortal.listeners.size, 1);
  assert.equal(mount.querySelector("[data-advisor-dialog]"), null);
  assert.match(firstPortal.innerHTML, /data-advisor-dialog/);

  mount.click({ "data-advisor-close": "" });
  assert.equal(runtime.document.portal, null);
  assert.equal(runtime.document.body.children.length, 0);
  assert.equal(firstPortal.listeners.size, 0);

  mount.click({ "data-advisor-launch": "" });
  assert.notEqual(runtime.document.portal, firstPortal);
  assert.equal(runtime.document.body.children.length, 1);
  controller.cleanup();
  assert.equal(runtime.document.portal, null);
  assert.equal(runtime.document.body.children.length, 0);
  assert.equal(mount.listeners.size, 0);
});

test("single choices auto-flow while symptoms remain multi-select and Back preserves answers", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  assert.equal(controller.state().step, 0);
  assert.equal(mount.actions.hidden, true);

  mount.click({ "data-advisor-ac": "wall" });
  assert.equal(controller.state().step, 1);
  assert.match(runtime.document.portal.leading.innerHTML, /data-advisor-back/);
  assert.match(runtime.document.portal.leading.innerHTML, /aria-label="ย้อนกลับ"/);
  assert.match(runtime.document.portal.leading.innerHTML, /data-advisor-icon="arrow-left"/);
  assert.doesNotMatch(runtime.document.portal.leading.innerHTML, /data-icon="sparkle"/);
  mount.click({ "data-advisor-months": "m6_8" });
  assert.equal(controller.state().step, 2);

  mount.click({ "data-advisor-symptom": "heavy_use" });
  mount.click({ "data-advisor-symptom": "pets" });
  assert.equal(controller.state().step, 2);
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use", "pets"]);
  assert.match(mount.actions.innerHTML, /data-advisor-symptoms-done/);
  assert.doesNotMatch(mount.actions.innerHTML, /ขั้นต่อไป/);
  mount.click({ "data-advisor-symptoms-done": "" });
  assert.equal(controller.state().step, 3);
  assert.equal(mount.actions.hidden, true);
  assert.doesNotMatch(mount.actions.innerHTML, /ดูผลประเมิน/);

  mount.click({ "data-advisor-back": "" });
  assert.equal(controller.state().step, 2);
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use", "pets"]);
  mount.click({ "data-advisor-symptoms-done": "" });
  mount.click({ "data-advisor-repair": "error_code" });
  assert.equal(controller.state().step, 4);
  assert.equal(controller.state().recommendation.verdict, "repair_check");
});

test("semantic Back icon has its own arrow path instead of a utility fallback", () => {
  assert.match(SOURCE, /"arrow-left":\s*'<path d="M19 12H5M11 18l-6-6 6-6"\/>'/);
  assert.match(SOURCE, /data-advisor-back[^>]*aria-label="ย้อนกลับ"[^>]*>\$\{semanticIcon\("arrow-left", 19\)\}/);
  assert.doesNotMatch(SOURCE, /data-advisor-back[^>]*>\$\{icon\("arrow-left"/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-back\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(CSS_SOURCE, /\.advisor-portal-root\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(CSS_SOURCE, /\.advisor-portal-root\.is-open\s*\{\s*pointer-events:\s*auto;?\s*\}/);
  assert.match(CSS_SOURCE, /\.advisor-portal-root\.is-closing\s*\{\s*pointer-events:\s*none;?\s*\}/);
});

test("routine and no-repair choices auto-flow without dropping exclusive state", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-symptom": "heavy_use" });
  mount.click({ "data-advisor-symptom": "routine" });
  assert.equal(controller.state().step, 3);
  assert.deepEqual(Array.from(controller.state().symptoms), ["routine"]);
  mount.click({ "data-advisor-repair": "none" });
  assert.equal(controller.state().step, 4);
  assert.equal(controller.state().recommendation.verdict, "standard_clean");
  mount.click({ "data-advisor-back": "" });
  assert.equal(controller.state().step, 3);
  mount.click({ "data-advisor-back": "" });
  assert.equal(controller.state().step, 2);
  mount.click({ "data-advisor-symptom": "routine" });
  assert.equal(controller.state().step, 3);
  assert.deepEqual(Array.from(controller.state().symptoms), ["routine"]);
});

test("repair choices evaluate immediately with repair-first outcomes", () => {
  for (const signal of ["error_code", "outdoor_not_running", "breaker_trip"]) {
    const runtime = loadAdvisor();
    const mount = new FakeMount(runtime.document);
    const controller = runtime.app.advisor.bind({ querySelector: () => mount });
    mount.click({ "data-advisor-launch": "" });
    mount.click({ "data-advisor-ac": "wall" });
    mount.click({ "data-advisor-months": "m4_5" });
    mount.click({ "data-advisor-symptom": "routine" });
    assert.equal(controller.state().step, 3, signal);
    assert.equal(mount.actions.hidden, true, signal);
    mount.click({ "data-advisor-repair": signal });
    assert.equal(controller.state().step, 4, signal);
    assert.equal(controller.state().recommendation.verdict, "repair_check", signal);
    controller.cleanup();
  }
});

test("selection lock prevents double advance and close cancels ghost navigation", () => {
  const runtime = loadAdvisor({ deferTimers: true });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-ac": "fourway" });
  assert.equal(controller.state().step, 0);
  assert.equal(controller.state().acType, "wall");
  assert.equal(runtime.timers.size, 1);
  runtime.runTimers();
  assert.equal(controller.state().step, 1);

  mount.click({ "data-advisor-months": "m4_5" });
  assert.equal(runtime.timers.size, 1);
  mount.click({ "data-advisor-close": "" });
  assert.equal(controller.state().isOpen, false);
  assert.equal(runtime.timers.size, 1);
  runtime.runTimers();
  assert.equal(controller.state().step, 1);
  assert.equal(runtime.document.portal, null);

  const reduced = loadAdvisor({ reducedMotion: true });
  const reducedMount = new FakeMount(reduced.document);
  const reducedController = reduced.app.advisor.bind({ querySelector: () => reducedMount });
  reducedMount.click({ "data-advisor-launch": "" });
  reducedMount.click({ "data-advisor-ac": "wall" });
  assert.equal(reducedController.state().step, 1);
  assert.equal(reduced.timers.size, 0);
});

test("semantic choice icons are deterministic, distinct, and emoji-free", () => {
  const { app } = loadAdvisor();
  const renderIcons = (step) => Array.from(app.advisor._test.stepContent({
    step,
    acType: "",
    monthsBand: "",
    symptoms: [],
    repairSignals: [],
    recommendation: null,
  }, { status: "success", items: [] }).matchAll(/data-advisor-icon="([^"]+)"/g), (match) => match[1]);
  const acIcons = renderIcons(0);
  const monthIcons = renderIcons(1);
  const symptomIcons = renderIcons(2);
  const repairIcons = renderIcons(3);
  assert.equal(acIcons.length, 5);
  assert.equal(new Set(acIcons).size, 5);
  assert.equal(monthIcons.length, 6);
  assert.ok(new Set(monthIcons).size > 3);
  assert.equal(symptomIcons.length, 12);
  assert.equal(new Set(symptomIcons).size, 12);
  assert.equal(repairIcons.length, 7);
  assert.equal(new Set(repairIcons).size, 7);
  assert.doesNotMatch([acIcons, monthIcons, symptomIcons, repairIcons].flat().join(""), /[\u{1F300}-\u{1FAFF}]/u);
});

test("visualViewport drives the mobile panel and listeners clean up on close and route leave", () => {
  const runtime = loadAdvisor({ visualViewport: { height: 612.4, offsetTop: 48.6 } });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  const portal = runtime.document.portal;
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "612px");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "49px");
  assert.deepEqual(Array.from(runtime.visualViewport.listeners.keys()).sort(), ["resize", "scroll"]);

  runtime.visualViewport.height = 488.2;
  runtime.visualViewport.offsetTop = 72.1;
  runtime.visualViewport.emit("resize");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "488px");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "72px");
  runtime.visualViewport.offsetTop = 16;
  runtime.visualViewport.emit("scroll");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "16px");

  mount.click({ "data-advisor-close": "" });
  assert.equal(runtime.visualViewport.listeners.size, 0);
  assert.equal(runtime.document.portal, null);
  mount.click({ "data-advisor-launch": "" });
  controller.cleanup();
  assert.equal(runtime.visualViewport.listeners.size, 0);
});

test("animated close preserves viewport geometry until the panel is removed", () => {
  const runtime = loadAdvisor({
    deferTimers: true,
    visualViewport: { height: 486.2, offsetTop: 71.7 },
  });
  const mount = new FakeMount(runtime.document);
  runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  const portal = runtime.document.portal;
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "486px");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "72px");

  mount.click({ "data-advisor-close": "" });
  assert.equal(runtime.visualViewport.listeners.size, 0);
  assert.ok(!portal.classList.contains("is-open"));
  assert.ok(portal.classList.contains("is-closing"));
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "486px");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "72px");
  assert.match(mount.host.innerHTML, /data-advisor-dialog/);
  assert.ok(mount.layer.classList.contains("is-closing"));

  runtime.visualViewport.height = 760;
  runtime.visualViewport.offsetTop = 0;
  runtime.visualViewport.emit("resize");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "486px");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "72px");

  runtime.runTimers();
  assert.equal(mount.host.innerHTML, "");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-height"), "");
  assert.equal(portal.style.getPropertyValue("--advisor-viewport-top"), "");
  assert.equal(runtime.document.portal, null);
});

test("animated close blocks every Portal action before the node is removed", () => {
  let adapterCalls = 0;
  let applyCalls = 0;
  const runtime = loadAdvisor({
    deferTimers: true,
    catalog: { status: "success", items: [catalogItem(1)] },
    adapter: (item) => { adapterCalls += 1; return { id: item.item_id, draft: {} }; },
    apply: () => { applyCalls += 1; return true; },
  });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  runtime.runTimers();
  mount.click({ "data-advisor-months": "m4_5" });
  runtime.runTimers();
  mount.click({ "data-advisor-symptom": "routine" });
  runtime.runTimers();
  mount.click({ "data-advisor-repair": "none" });
  runtime.runTimers();
  assert.equal(controller.state().step, 4);

  const portal = runtime.document.portal;
  const stateBeforeClose = controller.state();
  const adapterCallsBeforeClose = adapterCalls;
  const applyCallsBeforeClose = applyCalls;
  mount.click({ "data-advisor-close": "" });
  assert.ok(!portal.classList.contains("is-open"));
  assert.ok(portal.classList.contains("is-closing"));
  assert.equal(portal.listeners.size, 1);

  mount.click({ "data-advisor-ac": "fourway" });
  mount.click({ "data-advisor-back": "" });
  mount.click({ "data-advisor-repair": "error_code" });
  mount.click({ "data-advisor-item-action": "1" });
  mount.click({ "data-advisor-detail": "1" });
  mount.click({ "data-advisor-contact": "" });
  mount.click({ "data-advisor-reset": "" });

  assert.deepEqual(plain(controller.state()), plain({ ...stateBeforeClose, isOpen: false }));
  assert.equal(adapterCalls, adapterCallsBeforeClose);
  assert.equal(applyCalls, applyCallsBeforeClose);
  assert.deepEqual(runtime.routes, []);
  assert.deepEqual(runtime.contacts, []);
  assert.equal(runtime.timers.size, 1);

  runtime.runTimers();
  assert.equal(runtime.document.portal, null);
  assert.equal(portal.listeners.size, 0);
});

test("reopening during a pending close replaces the Portal and binds one working listener", () => {
  const runtime = loadAdvisor({ deferTimers: true });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  const closingPortal = runtime.document.portal;
  mount.click({ "data-advisor-close": "" });
  assert.equal(runtime.timers.size, 1);
  assert.ok(closingPortal.classList.contains("is-closing"));

  mount.click({ "data-advisor-launch": "" });
  const reopenedPortal = runtime.document.portal;
  assert.notEqual(reopenedPortal, closingPortal);
  assert.equal(runtime.timers.size, 0);
  assert.equal(runtime.document.body.children.length, 1);
  assert.equal(closingPortal.listeners.size, 0);
  assert.equal(reopenedPortal.listeners.size, 1);
  assert.ok(reopenedPortal.classList.contains("is-open"));
  assert.ok(!reopenedPortal.classList.contains("is-closing"));

  mount.click({ "data-advisor-ac": "wall" });
  assert.equal(runtime.timers.size, 1);
  runtime.runTimers();
  assert.equal(controller.state().step, 1);
  assert.equal(controller.state().acType, "wall");
  controller.cleanup();
});

test("immediate close and cleanup remove viewport listeners and variables without delay", () => {
  const immediateRuntime = loadAdvisor({
    deferTimers: true,
    visualViewport: { height: 520, offsetTop: 36 },
  });
  const immediateMount = new FakeMount(immediateRuntime.document);
  const immediateController = immediateRuntime.app.advisor.bind({ querySelector: () => immediateMount });
  immediateMount.click({ "data-advisor-launch": "" });
  const immediatePortal = immediateRuntime.document.portal;
  immediateController.close({ immediate: true });
  assert.equal(immediateRuntime.visualViewport.listeners.size, 0);
  assert.equal(immediatePortal.style.getPropertyValue("--advisor-viewport-height"), "");
  assert.equal(immediatePortal.style.getPropertyValue("--advisor-viewport-top"), "");
  assert.equal(immediateRuntime.document.portal, null);
  assert.equal(immediateMount.host.innerHTML, "");

  const cleanupRuntime = loadAdvisor({
    deferTimers: true,
    visualViewport: { height: 440, offsetTop: 84 },
  });
  const cleanupMount = new FakeMount(cleanupRuntime.document);
  const cleanupController = cleanupRuntime.app.advisor.bind({ querySelector: () => cleanupMount });
  cleanupMount.click({ "data-advisor-launch": "" });
  cleanupMount.click({ "data-advisor-close": "" });
  assert.equal(cleanupRuntime.timers.size, 1);
  cleanupController.cleanup();
  assert.equal(cleanupRuntime.timers.size, 0);
  assert.equal(cleanupRuntime.visualViewport.listeners.size, 0);
  assert.equal(cleanupRuntime.document.portal, null);
  assert.ok(!cleanupRuntime.document.body.classList.contains("has-advisor-sheet"));
});

test("visualViewport fallback uses window height and removes its resize listener", () => {
  const runtime = loadAdvisor({ innerHeight: 701 });
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  assert.equal(runtime.document.portal.style.getPropertyValue("--advisor-viewport-height"), "701px");
  assert.deepEqual(Array.from(runtime.window.listeners.keys()), ["resize"]);
  runtime.window.innerHeight = 640;
  runtime.window.emit("resize");
  assert.equal(runtime.document.portal.style.getPropertyValue("--advisor-viewport-height"), "640px");
  controller.cleanup();
  assert.equal(runtime.window.listeners.size, 0);
});

test("sheet shell opens once while steps and Catalog refresh update in place", () => {
  const runtime = loadAdvisor({ catalog: { status: "loading", items: [] } });
  const mount = new FakeMount(runtime.document);
  const container = { querySelector: () => mount };
  const controller = runtime.app.advisor.bind(container);

  mount.click({ "data-advisor-launch": "" });
  const openingPortal = runtime.document.portal;
  const openingShell = mount.host.innerHTML;
  assert.equal(mount.shellWrites, 1);
  assert.match(openingShell, /advisor-sheet-layer is-opening/);
  assert.ok(mount.layer.classList.contains("is-opening"));

  mount.click({ "data-advisor-ac": "wall" });
  assert.equal(mount.shellWrites, 1);
  assert.equal(mount.host.innerHTML, openingShell);
  assert.ok(!mount.layer.classList.contains("is-opening"));
  assert.ok(mount.body.classList.contains("is-step-forward"));

  mount.click({ "data-advisor-back": "" });
  assert.equal(mount.shellWrites, 1);
  assert.ok(mount.body.classList.contains("is-step-back"));

  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-repair": "none" });
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
  assert.notEqual(runtime.document.portal, openingPortal);
  assert.equal(mount.shellWrites, 1);
  assert.ok(mount.layer.classList.contains("is-opening"));
});

test("multi-select exclusive choices and Back preserve the existing answers", () => {
  const runtime = loadAdvisor();
  const mount = new FakeMount(runtime.document);
  const controller = runtime.app.advisor.bind({ querySelector: () => mount });
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-months": "m6_8" });
  mount.click({ "data-advisor-symptom": "heavy_use" });
  mount.click({ "data-advisor-symptom": "pets" });
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use", "pets"]);
  assert.equal(controller.state().step, 2);
  assert.match(mount.actions.innerHTML, /data-advisor-symptoms-done/);
  mount.click({ "data-advisor-symptoms-done": "" });
  assert.equal(controller.state().step, 3);
  mount.click({ "data-advisor-back": "" });
  assert.equal(controller.state().step, 2);
  assert.deepEqual(Array.from(controller.state().symptoms), ["heavy_use", "pets"]);
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
  const mount = new FakeMount(success.document);
  const container = { querySelector: (selector) => selector === "[data-smart-advisor]" ? mount : null };
  success.app.advisor.bind(container);
  completeWallStandardAdvisor(mount);
  mount.click({ "data-advisor-item-action": "8" });
  assert.deepEqual(success.routes, ["scheduled"]);
  assert.equal(success.applied.length, 1);
  assert.equal(success.contacts.length, 0);

  const denied = loadAdvisor({ catalog: { status: "success", items: [item] }, adapter: () => null });
  const deniedMount = new FakeMount(denied.document);
  denied.app.advisor.bind({ querySelector: () => deniedMount });
  completeWallStandardAdvisor(deniedMount);
  deniedMount.click({ "data-advisor-item-action": "8" });
  assert.equal(denied.routes.length, 0);
  assert.equal(denied.contacts.length, 1);

  const applyDenied = loadAdvisor({ catalog: { status: "success", items: [item] }, apply: () => false });
  const applyMount = new FakeMount(applyDenied.document);
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
  const mount = new FakeMount(runtime.document);
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
  const runtime = loadAdvisor({
    catalog: { status: "success", items: [repairItem] },
    visualViewport: { height: 520, offsetTop: 32 },
  });
  const mount = new FakeMount(runtime.document);
  const container = { querySelector: () => mount };
  const controller = runtime.app.advisor.bind(container);
  mount.click({ "data-advisor-launch": "" });
  mount.click({ "data-advisor-ac": "wall" });
  mount.click({ "data-advisor-months": "m4_5" });
  mount.click({ "data-advisor-symptom": "routine" });
  mount.click({ "data-advisor-repair": "error_code" });
  assert.equal(controller.state().recommendation.verdict, "repair_check");
  mount.click({ "data-advisor-item-action": "9" });
  assert.equal(runtime.routes.length, 0);
  assert.equal(runtime.applied.length, 0);
  assert.equal(runtime.contacts.length, 1);
  assert.equal(runtime.visualViewport.listeners.size, 0);
  assert.equal(runtime.document.portal, null);
});

test("advisor render contract is accessible, compact, motion-safe, and has no autoplay timer", () => {
  const { app } = loadAdvisor();
  const html = app.advisor.renderSection({ status: "success", items: [] });
  assert.match(html, /data-smart-advisor/);
  assert.match(html, /ไม่แน่ใจว่าควรล้างหรือซ่อม/);
  assert.match(html, /data-advisor-launch/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /data-advisor-sheet-host|data-advisor-portal/);
  assert.doesNotMatch(html, /data-icon="play"/);
  assert.doesNotMatch(SOURCE, /data-advisor-next|>ขั้นต่อไป<|>ดูผลประเมิน</);
  assert.doesNotMatch(html, /data-advisor-ac|data-advisor-months|data-advisor-symptom|data-advisor-repair/);
  assert.doesNotMatch(html, /ความคืบหน้าการประเมิน|ขั้นที่ 1 จาก 4/);
  assert.doesNotMatch(html, /ดูบริการจริงจาก Catalog/);
  assert.match(CSS_SOURCE, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS_SOURCE, /\.advisor-sheet[\s\S]*?max-height: 90dvh/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-actions[\s\S]*?safe-area-inset-bottom/);
  assert.match(CSS_SOURCE, /\.advisor-portal-root \{[\s\S]*?position: fixed[\s\S]*?z-index: 10000[\s\S]*?isolation: isolate/);
  assert.match(CSS_SOURCE, /\.advisor-sheet \.advisor-chip-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS_SOURCE, /@media \(max-width: 380px\)[\s\S]*?\.advisor-sheet \.advisor-choice-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS_SOURCE, /@media \(max-width: 600px\)[\s\S]*?height: var\(--advisor-viewport-height, 100dvh\)/);
  assert.match(CSS_SOURCE, /@media \(max-width: 600px\)[\s\S]*?max-height: none[\s\S]*?border-radius: 0/);
  assert.match(CSS_SOURCE, /body\.has-advisor-sheet \{ overflow: hidden/);
  assert.match(CSS_SOURCE, /\.smart-advisor-section \{[\s\S]*?min-height: 96px[\s\S]*?padding: 10px/);
  assert.match(CSS_SOURCE, /\.advisor-launcher-orb \{[\s\S]*?width: 34px[\s\S]*?height: 34px/);
  assert.match(CSS_SOURCE, /\.advisor-launcher-copy h2 \{[\s\S]*?white-space: nowrap/);
  assert.match(CSS_SOURCE, /\.advisor-launcher-actions \.primary-btn \{[\s\S]*?justify-content: center[\s\S]*?min-height: 38px/);
  assert.match(CSS_SOURCE, /@media \(max-width: 600px\)[\s\S]*?\.advisor-launcher-copy p \{ display: none; \}/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-scroll \{[\s\S]*?overflow-y: auto[\s\S]*?overscroll-behavior: contain/);
  assert.match(CSS_SOURCE, /\.advisor-sheet-actions \{[\s\S]*?safe-area-inset-bottom/);
  assert.match(CSS_SOURCE, /@keyframes advisor-orbit/);
  assert.match(CSS_SOURCE, /@keyframes advisor-orb-breathe/);
  assert.match(CSS_SOURCE, /@keyframes advisor-launcher-sheen/);
  assert.match(CSS_SOURCE, /@keyframes advisor-choice-sweep/);
  assert.match(CSS_SOURCE, /@keyframes advisor-check-spring/);
  assert.match(CSS_SOURCE, /@keyframes advisor-confidence-pop/);
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
  assert.match(SOURCE, /document\.body\.appendChild\(portalRoot\)/);
  assert.match(SOURCE, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(SOURCE, /window\.visualViewport/);
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
  const build = "20260715_smart_advisor_portal_autoflow_v3";
  assert.ok(INDEX_SOURCE.indexOf(`modules/advisor.js?v=${build}`) < INDEX_SOURCE.indexOf(`modules/ui.js?v=${build}`));
  assert.match(SW_SOURCE, new RegExp(`BUILD_ID = "${build}"`));
  assert.match(SW_SOURCE, /modules\/advisor\.js\?v=\$\{BUILD_ID\}/);
});
