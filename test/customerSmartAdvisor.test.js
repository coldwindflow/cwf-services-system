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
    item_name: `à¸šà¸£à¸´à¸à¸²à¸£ ${id}`,
    item_category: "à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ",
    job_category: "à¸¥à¹‰à¸²à¸‡",
    booking_mode: "bookable",
    booking_ac_type: "à¸œà¸™à¸±à¸‡",
    booking_btu: 12000,
    booking_wash_variant: "à¸¥à¹‰à¸²à¸‡à¸˜à¸£à¸£à¸¡à¸”à¸²",
    is_active: true,
    is_customer_visible: true,
    display_price: 750,
    unit_label: "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡",
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
      formatBaht: (value) => `${value} à¸šà¸²à¸—`,
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
    const result = evaluate({ acType, monthsBand: "m6_8", symptoms: ["routine"], repairSignals: ["none"] });÷¼¶‰žËkºwµçMÕµ•¹Ð¤ì4(€½¹ÍÐ½¹Ñ…¥¹•È€ôìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðôì4(€½¹ÍÐ½¹ÑÉ½±±•È€ôÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡½¹Ñ…¥¹•È¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€½¹ÍÐ½Á•¹¥¹A½ÉÑ…°€ôÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹Á½ÉÑ…°ì4(€½¹ÍÐ½Á•¹¥¹M¡•±°€ôµ½Õ¹Ð¹¡½ÍÐ¹¥¹¹•É!Q50ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡½Á•¹¥¹M¡•±°°€½…‘Ù¥Í½ÈµÍ¡••Ðµ±…å•È¥Ìµ½Á•¹¥¹œ¼¤ì4(€…ÍÍ•ÉÐ¹½¬¡µ½Õ¹Ð¹±…å•È¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¥Ìµ½Á•¹¥¹œˆ¤¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ…Œˆè€‰Ý…±°ˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹¡½ÍÐ¹¥¹¹•É!Q50°½Á•¹¥¹M¡•±°¤ì4(€…ÍÍ•ÉÐ¹½¬ …µ½Õ¹Ð¹±…å•È¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¥Ìµ½Á•¹¥¹œˆ¤¤ì4(€…ÍÍ•ÉÐ¹½¬¡µ½Õ¹Ð¹‰½‘ä¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¥ÌµÍÑ•Àµ™½ÉÝ…Éˆ¤¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ‰…¬ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(€…ÍÍ•ÉÐ¹½¬¡µ½Õ¹Ð¹‰½‘ä¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¥ÌµÍÑ•Àµ‰…¬ˆ¤¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ…Œˆè€‰Ý…±°ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµµ½¹Ñ¡Ìˆè€‰´Ñ|Ôˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½´ˆè€‰É½ÕÑ¥¹”ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÉ•Á…¥Èˆè€‰¹½¹”ˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍÑ•À°€Ð¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(4(€½¹ÍÐ™½ÕÍ•‘	•™½É•I•™É•Í €ô¹•Ü…­•±•µ•¹Ð ¤ì4(€ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹…Ñ¥Ù•±•µ•¹Ð€ô™½ÕÍ•‘	•™½É•I•™É•Í ì4(€µ½Õ¹Ð¹ÍÉ½±°¹ÍÉ½±±Q½À€ô€ÄÜÌì4(€½¹ÍÐÉ•ÍÕ±Ñ½ÕÍ•Ì€ôµ½Õ¹Ð¹É•ÍÕ±Ñ½ÕÍ•Ìì4(€ÉÕ¹Ñ¥µ”¹…ÁÀ¹ÍÑ…Ñ”¹…Ñ…±½œ¹ÍÑ…ÑÕÌ€ô€‰ÍÕ•ÍÌˆì4(€ÉÕ¹Ñ¥µ”¹…ÁÀ¹ÍÑ…Ñ”¹…Ñ…±½œ¹¥Ñ•µÌ€ôm…Ñ…±½%Ñ•´ Ä¥tì4(€ÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹É•™É•Í¡…Ñ…±½œ¡½¹Ñ…¥¹•È¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹¡½ÍÐ¹¥¹¹•É!Q50°½Á•¹¥¹M¡•±°¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹ÍÉ½±°¹ÍÉ½±±Q½À°€ÄÜÌ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹…Ñ¥Ù•±•µ•¹Ð°™½ÕÍ•‘	•™½É•I•™É•Í ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹É•ÍÕ±Ñ½ÕÍ•Ì°É•ÍÕ±Ñ½ÕÍ•Ì¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹…Ñ…±½œ¹¥¹¹•É!Q50°€½‘…Ñ„µ…‘Ù¥Í½ÈµÁÉ½‘ÕÐôˆÄˆ¼¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±½Í”ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹¡½ÍÐ¹¥¹¹•É!Q50°€ˆˆ¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹¹½ÑÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹Á½ÉÑ…°°½Á•¹¥¹A½ÉÑ…°¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹Í¡•±±]É¥Ñ•Ì°€Ä¤ì4(€…ÍÍ•ÉÐ¹½¬¡µ½Õ¹Ð¹±…å•È¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¥Ìµ½Á•¹¥¹œˆ¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰µÕ±Ñ¤µÍ•±•Ð•á±ÕÍ¥Ù”¡½¥•Ì…¹	…¬ÁÉ•Í•ÉÙ”Ñ¡”•á¥ÍÑ¥¹œ…¹ÍÝ•ÉÌˆ°€ ¤€ôøì4(€½¹ÍÐÉÕ¹Ñ¥µ”€ô±½…‘‘Ù¥Í½È ¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¤ì4(€½¹ÍÐ½¹ÑÉ½±±•È€ôÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ…Œˆè€‰Ý…±°ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµµ½¹Ñ¡Ìˆè€‰´Ù|àˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½´ˆè€‰¡•…Ùå}ÕÍ”ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½´ˆè€‰Á•ÑÌˆô¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ÉÉ…ä¹™É½´¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍåµÁÑ½µÌ¤°l‰¡•…Ùå}ÕÍ”ˆ°€‰Á•ÑÌ‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍÑ•À°€È¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹…Ñ¥½¹Ì¹¥¹¹•É!Q50°€½‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½µÌµ‘½¹”¼¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½µÌµ‘½¹”ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍÑ•À°€Ì¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ‰…¬ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍÑ•À°€È¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ÉÉ…ä¹™É½´¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍåµÁÑ½µÌ¤°l‰¡•…Ùå}ÕÍ”ˆ°€‰Á•ÑÌ‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹ÍÉ½±°¹ÍÉ½±±Q½À°€À¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Í…Á”°‰…­‘É½À°™½ÕÌÑÉ…À…¹±•…¹ÕÀ±½Í”Ñ¡”Í¡••ÐÝ¥Ñ¡½ÕÐ±•…­¥¹œ±¥ÍÑ•¹•ÉÌˆ°€ ¤€ôøì4(€½¹ÍÐÉÕ¹Ñ¥µ”€ô±½…‘‘Ù¥Í½È ¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¤ì4(€½¹ÍÐ½¹ÑÉ½±±•È€ôÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹±¥ÍÑ•¹•ÉÌ¹Í¥é”°€Ä¤ì4(€ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹…Ñ¥Ù•±•µ•¹Ð€ôµ½Õ¹Ð¹¹•áÑ	ÕÑÑ½¸ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹­•å‘½Ý¸ ‰Q…ˆˆ¤°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹…Ñ¥Ù•±•µ•¹Ð°µ½Õ¹Ð¹±½Í•	ÕÑÑ½¸¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹­•å‘½Ý¸ ‰Í…Á”ˆ¤°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹¥Í=Á•¸°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹±¥ÍÑ•¹•ÉÌ¹Í¥é”°€À¤ì4(4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€µ½Õ¹Ð¹±¥­	…­‘É½À ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹¥Í=Á•¸°™…±Í”¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€½¹ÑÉ½±±•È¹±•…¹ÕÀ ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹±¥ÍÑ•¹•ÉÌ¹Í¥é”°€À¤ì4(€…ÍÍ•ÉÐ¹½¬ …ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹‰½‘ä¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰¡…Ìµ…‘Ù¥Í½ÈµÍ¡••Ðˆ¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹±¥ÍÑ•¹•ÉÌ¹Í¥é”°€À¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰±½Í•É•ÍÕ±ÐÍÑ…åÌ½µÁ…Ð…¹¹•Ù•È•áÁ½Í•Ì…Ñ…±½œ…É‘Ì½¸!½µ”ˆ°€ ¤€ôøì4(€½¹ÍÐÉÕ¹Ñ¥µ”€ô±½…‘‘Ù¥Í½È¡ì…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèm…Ñ…±½%Ñ•´ Ä¥tôô¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¤ì4(€½¹ÍÐ½¹ÑÉ½±±•È€ôÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðô¤ì4(€½µÁ±•Ñ•]…±±MÑ…¹‘…É‘‘Ù¥Í½È¡µ½Õ¹Ð¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹É•½µµ•¹‘…Ñ¥½¸¹Ù•É‘¥Ð°€‰ÍÑ…¹‘…É‘}±•…¸ˆ¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹¡Ñµ° ¤°€½…‘Ù¥Í½ÈµÉ•ÍÕ±ÐµÁÉ½‘ÕÑÌ¼¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±½Í”ˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹±…Õ¹¡•È¹¥¹¹•É!Q50°€¿‚âs‚â—‚â—‚æ#‚âË‚â«‚âã‚âP¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹±…Õ¹¡•È¹¥¹¹•É!Q50°€¿‚âS‚âç‚âs‚â—‚âo‚â‚âÃ‚æ‚â‡‚âÓ‚âd¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡µ½Õ¹Ð¹±…Õ¹¡•È¹¥¹¹•É!Q50°€½…‘Ù¥Í½ÈµÁÉ½‘ÕÑñ‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸¼¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ½Õ¹Ð¹¡½ÍÐ¹¥¹¹•É!Q50°€ˆˆ¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÉ•Í•Ðµ±…Õ¹¡•Èˆè€ˆˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹É•½µµ•¹‘…Ñ¥½¸°¹Õ±°¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹ÍÑ•À°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹¥Í=Á•¸°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ½Õ¹Ð¹¡Ñµ° ¤°€½‘…Ñ„µ…‘Ù¥Í½Èµ…Œô¼¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰‰½½­¥¹œ¡…¹‘½™˜É½ÕÑ•Ì½¹±ä…™Ñ•È‰½Ñ •á¥ÍÑ¥¹œ…‘…ÁÑ•ÉÌÍÕ••…¹½Ñ¡•ÉÝ¥Í”½¹Ñ…ÑÌˆ°€ ¤€ôøì4(€½¹ÍÐ¥Ñ•´€ô…Ñ…±½%Ñ•´ à¤ì4(€½¹ÍÐÍÕ•ÍÌ€ô±½…‘‘Ù¥Í½È¡ì…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèm¥Ñ•µtôô¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÍÕ•ÍÌ¹‘½Õµ•¹Ð¤ì4(€½¹ÍÐ½¹Ñ…¥¹•È€ôìÅÕ•ÉåM•±•Ñ½Èè€¡Í•±•Ñ½È¤€ôøÍ•±•Ñ½È€ôôô€‰m‘…Ñ„µÍµ…ÉÐµ…‘Ù¥Í½Étˆ€üµ½Õ¹Ð€è¹Õ±°ôì4(€ÍÕ•ÍÌ¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡½¹Ñ…¥¹•È¤ì4(€½µÁ±•Ñ•]…±±MÑ…¹‘…É‘‘Ù¥Í½È¡µ½Õ¹Ð¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸ˆè€ˆàˆô¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ÍÕ•ÍÌ¹É½ÕÑ•Ì°l‰Í¡•‘Õ±•‰t¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÕ•ÍÌ¹…ÁÁ±¥•¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÍÕ•ÍÌ¹½¹Ñ…ÑÌ¹±•¹Ñ °€À¤ì4(4(€½¹ÍÐ‘•¹¥•€ô±½…‘‘Ù¥Í½È¡ì…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèm¥Ñ•µtô°…‘…ÁÑ•Èè€ ¤€ôø¹Õ±°ô¤ì4(€½¹ÍÐ‘•¹¥•‘5½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡‘•¹¥•¹‘½Õµ•¹Ð¤ì4(€‘•¹¥•¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôø‘•¹¥•‘5½Õ¹Ðô¤ì4(€½µÁ±•Ñ•]…±±MÑ…¹‘…É‘‘Ù¥Í½È¡‘•¹¥•‘5½Õ¹Ð¤ì4(€‘•¹¥•‘5½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸ˆè€ˆàˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•¹¥•¹É½ÕÑ•Ì¹±•¹Ñ °€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•¹¥•¹½¹Ñ…ÑÌ¹±•¹Ñ °€Ä¤ì4(4(€½¹ÍÐ…ÁÁ±å•¹¥•€ô±½…‘‘Ù¥Í½È¡ì…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèm¥Ñ•µtô°…ÁÁ±äè€ ¤€ôø™…±Í”ô¤ì4(€½¹ÍÐ…ÁÁ±å5½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡…ÁÁ±å•¹¥•¹‘½Õµ•¹Ð¤ì4(€…ÁÁ±å•¹¥•¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôø…ÁÁ±å5½Õ¹Ðô¤ì4(€½µÁ±•Ñ•]…±±MÑ…¹‘…É‘‘Ù¥Í½È¡…ÁÁ±å5½Õ¹Ð¤ì4(€…ÁÁ±å5½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸ˆè€ˆàˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÁÁ±å•¹¥•¹É½ÕÑ•Ì¹±•¹Ñ °€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÁÁ±å•¹¥•¹½¹Ñ…ÑÌ¹±•¹Ñ °€Ä¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰µ…¹¥ÁÕ±…Ñ•Õ¹É•±…Ñ•…Ñ…±½œ¥Ñ•´¥¥ÌÉ•©•Ñ•‰•™½É”‰½½­¥¹œ…‘…ÁÑ•ÉÌÉÕ¸ˆ°€ ¤€ôøì4(€±•Ð…‘…ÁÑ•É…±±Ì€ô€Àì4(€±•Ð…ÁÁ±å…±±Ì€ô€Àì4(€½¹ÍÐÕ¹É•±…Ñ•€ô…Ñ…±½%Ñ•´ ä°ì‰½½­¥¹}…}ÑåÁ”è€‹‚â«‚â×‚æ#‚â_‚âÓ‚â£‚â_‚âË‚âˆ°‰½½­¥¹}Ý…Í¡}Ù…É¥…¹Ðè¹Õ±°ô¤ì4(€½¹ÍÐÉÕ¹Ñ¥µ”€ô±½…‘‘Ù¥Í½È¡ì4(€€€…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèmÕ¹É•±…Ñ•‘tô°4(€€€…‘…ÁÑ•Èè€ ¤€ôøì…‘…ÁÑ•É…±±Ì€¬ô€ÄìÉ•ÑÕÉ¸ì‘É…™Ðèíôôìô°4(€€€…ÁÁ±äè€ ¤€ôøì…ÁÁ±å…±±Ì€¬ô€ÄìÉ•ÑÕÉ¸ÑÉÕ”ìô°4(€ô¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¤ì4(€ÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðô¤ì4(€½µÁ±•Ñ•]…±±MÑ…¹‘…É‘‘Ù¥Í½È¡µ½Õ¹Ð¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸ˆè€ˆäˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…‘…ÁÑ•É…±±Ì°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡…ÁÁ±å…±±Ì°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹É½ÕÑ•Ì¹±•¹Ñ °€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹½¹Ñ…ÑÌ¹±•¹Ñ °€Ä¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰É•Á…¥ÈÉ•ÍÕ±Ð…±Ý…åÌ½Á•¹Ì½¹Ñ…ÐM¡••Ð•Ù•¸Ý¡•¸„É•Á…¥È¥Ñ•´¡…Ì…‘…ÁÑ•Èµ½µÁ…Ñ¥‰±”µ•Ñ…‘…Ñ„ˆ°€ ¤€ôøì4(€½¹ÍÐÉ•Á…¥É%Ñ•´€ô…Ñ…±½%Ñ•´ ä°ì¥Ñ•µ}¹…µ”è€‹‚âW‚â‚âŸ‚â#‚æ‚â+‚æ‚â‚æ‚â·‚â‚æ0ˆ°©½‰}…Ñ•½Éäè€‹‚âW‚â‚âŸ‚â#‚æ‚â+‚æ‚âˆô¤ì4(€½¹ÍÐÉÕ¹Ñ¥µ”€ô±½…‘‘Ù¥Í½È¡ì4(€€€…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèmÉ•Á…¥É%Ñ•µtô°4(€€€Ù¥ÍÕ…±Y¥•ÝÁ½ÉÐèì¡•¥¡Ðè€ÔÈÀ°½™™Í•ÑQ½Àè€ÌÈô°4(€ô¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¤ì4(€½¹ÍÐ½¹Ñ…¥¹•È€ôìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðôì4(€½¹ÍÐ½¹ÑÉ½±±•È€ôÉÕ¹Ñ¥µ”¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡½¹Ñ…¥¹•È¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ˆè€ˆˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ…Œˆè€‰Ý…±°ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµµ½¹Ñ¡Ìˆè€‰´Ñ|Ôˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½´ˆè€‰É½ÕÑ¥¹”ˆô¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½ÈµÉ•Á…¥Èˆè€‰•ÉÉ½É}½‘”ˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡½¹ÑÉ½±±•È¹ÍÑ…Ñ” ¤¹É•½µµ•¹‘…Ñ¥½¸¹Ù•É‘¥Ð°€‰É•Á…¥É}¡•¬ˆ¤ì4(€µ½Õ¹Ð¹±¥¬¡ì€‰‘…Ñ„µ…‘Ù¥Í½Èµ¥Ñ•´µ…Ñ¥½¸ˆè€ˆäˆô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹É½ÕÑ•Ì¹±•¹Ñ °€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹…ÁÁ±¥•¹±•¹Ñ °€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹½¹Ñ…ÑÌ¹±•¹Ñ °€Ä¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹Ù¥ÍÕ…±Y¥•ÝÁ½ÉÐ¹±¥ÍÑ•¹•ÉÌ¹Í¥é”°€À¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÉÕ¹Ñ¥µ”¹‘½Õµ•¹Ð¹Á½ÉÑ…°°¹Õ±°¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰…‘Ù¥Í½ÈÉ•¹‘•È½¹ÑÉ…Ð¥Ì…•ÍÍ¥‰±”°½µÁ…Ð°µ½Ñ¥½¸µÍ…™”°…¹¡…Ì¹¼…ÕÑ½Á±…äÑ¥µ•Èˆ°€ ¤€ôøì4(€½¹ÍÐì…ÁÀô€ô±½…‘‘Ù¥Í½È ¤ì4(€½¹ÍÐ¡Ñµ°€ô…ÁÀ¹…‘Ù¥Í½È¹É•¹‘•ÉM•Ñ¥½¸¡ìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèmtô¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°€½‘…Ñ„µÍµ…ÉÐµ…‘Ù¥Í½È¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°€¿‚æ‚â‡‚æ#‚æ‚âg‚æ#‚æ‚â#‚âŸ‚æ#‚âË‚â‚âŸ‚â‚â—‚æ'‚âË‚â‚â¯‚â‚âß‚â·‚â/‚æ#‚â·‚â„¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°€½‘…Ñ„µ…‘Ù¥Í½Èµ±…Õ¹ ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°€½…É¥„µ•áÁ…¹‘•ô‰™…±Í”ˆ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡Ñµ°°€½‘…Ñ„µ…‘Ù¥Í½ÈµÍ¡••Ðµ¡½ÍÑñ‘…Ñ„µ…‘Ù¥Í½ÈµÁ½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡Ñµ°°€½‘…Ñ„µ¥½¸ô‰Á±…äˆ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡M=UI°€½‘…Ñ„µ…‘Ù¥Í½Èµ¹•áÑðû‚â‚âÇ‚æ'‚âg‚âW‚æ#‚â·‚æ‚âlñðû‚âS‚âç‚âs‚â—‚âo‚â‚âÃ‚æ‚â‡‚âÓ‚âdð¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡Ñµ°°€½‘…Ñ„µ…‘Ù¥Í½Èµ…ñ‘…Ñ„µ…‘Ù¥Í½Èµµ½¹Ñ¡Íñ‘…Ñ„µ…‘Ù¥Í½ÈµÍåµÁÑ½µñ‘…Ñ„µ…‘Ù¥Í½ÈµÉ•Á…¥È¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡Ñµ°°€¿‚â‚âŸ‚âË‚â‡‚â‚âß‚âk‚â¯‚âg‚æ'‚âË‚â‚âË‚â‚âo‚â‚âÃ‚æ‚â‡‚âÓ‚âeó‚â‚âÇ‚æ'‚âg‚â_‚â×‚æ €Äƒ‚â#‚âË‚â€Ð¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡¡Ñµ°°€¿‚âS‚âç‚âk‚â‚âÓ‚â‚âË‚â‚â#‚â‚âÓ‚â‚â#‚âË‚â…Ñ…±½œ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡ÁÉ•™•ÉÌµÉ•‘Õ•µµ½Ñ¥½¸èÉ•‘Õ•p¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••ÑmqÍqMt¨ýµ…àµ¡•¥¡Ðè€äÁ‘Ù ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ…Ñ¥½¹ÍmqÍqMt¨ýÍ…™”µ…É•„µ¥¹Í•Ðµ‰½ÑÑ½´¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÁ½ÉÑ…°µÉ½½ÐqímqÍqMt¨ýÁ½Í¥Ñ¥½¸è™¥á•‘mqÍqMt¨ýèµ¥¹‘•àè€ÄÀÀÀÁmqÍqMt¨ý¥Í½±…Ñ¥½¸è¥Í½±…Ñ”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðp¹…‘Ù¥Í½Èµ¡¥ÀµÉ¥‘mqÍqMt¨ýÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹Ìèµ¥¹µ…áp À°€Å™Ép¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡µ…àµÝ¥‘Ñ è€ÌàÁÁáp¥mqÍqMt¨ýp¹…‘Ù¥Í½ÈµÍ¡••Ðp¹…‘Ù¥Í½Èµ¡½¥”µÉ¥qìÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹Ìèµ¥¹µ…áp À°€Å™Ép¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡µ…àµÝ¥‘Ñ è€ØÀÁÁáp¥mqÍqMt¨ý¡•¥¡ÐèÙ…Ép ´µ…‘Ù¥Í½ÈµÙ¥•ÝÁ½ÉÐµ¡•¥¡Ð°€ÄÀÁ‘Ù¡p¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡µ…àµÝ¥‘Ñ è€ØÀÁÁáp¥mqÍqMt¨ýµ…àµ¡•¥¡Ðè¹½¹•mqÍqMt¨ý‰½É‘•ÈµÉ…‘¥ÕÌè€À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½‰½‘åp¹¡…Ìµ…‘Ù¥Í½ÈµÍ¡••Ðqì½Ù•É™±½Üè¡¥‘‘•¸¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹Íµ…ÉÐµ…‘Ù¥Í½ÈµÍ•Ñ¥½¸qímqÍqMt¨ýµ¥¸µ¡•¥¡Ðè€äÙÁámqÍqMt¨ýÁ…‘‘¥¹œè€ÄÁÁà¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½Èµ±…Õ¹¡•Èµ½ÉˆqímqÍqMt¨ýÝ¥‘Ñ è€ÌÑÁámqÍqMt¨ý¡•¥¡Ðè€ÌÑÁà¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½Èµ±…Õ¹¡•Èµ½Áä ÈqímqÍqMt¨ýÝ¡¥Ñ”µÍÁ…”è¹½ÝÉ…À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½Èµ±…Õ¹¡•Èµ…Ñ¥½¹Ìp¹ÁÉ¥µ…Éäµ‰Ñ¸qímqÍqMt¨ý©ÕÍÑ¥™äµ½¹Ñ•¹Ðè•¹Ñ•ÉmqÍqMt¨ýµ¥¸µ¡•¥¡Ðè€ÌáÁà¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡µ…àµÝ¥‘Ñ è€ØÀÁÁáp¥mqÍqMt¨ýp¹…‘Ù¥Í½Èµ±…Õ¹¡•Èµ½ÁäÀqì‘¥ÍÁ±…äè¹½¹”ìqô¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••ÐµÍÉ½±°qímqÍqMt¨ý½Ù•É™±½Üµäè…ÕÑ½mqÍqMt¨ý½Ù•ÉÍÉ½±°µ‰•¡…Ù¥½Èè½¹Ñ…¥¸¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ…Ñ¥½¹ÌqímqÍqMt¨ýÍ…™”µ…É•„µ¥¹Í•Ðµ‰½ÑÑ½´¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ½É‰¥Ð¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ½Éˆµ‰É•…Ñ¡”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ±…Õ¹¡•ÈµÍ¡••¸¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ¡½¥”µÍÝ••À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ¡•¬µÍÁÉ¥¹œ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½Èµ½¹™¥‘•¹”µÁ½À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½ÈµÍ¡••ÐµÕÀ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½ÈµÅÕ•ÍÑ¥½¸µ™½ÉÝ…É¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½­•å™É…µ•Ì…‘Ù¥Í½ÈµÉ•ÍÕ±ÐµÉ•Ù•…°¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ±…å•Ép¹¥Ìµ½Á•¹¥¹œqì…¹¥µ…Ñ¥½¸è…‘Ù¥Í½Èµ‰…­‘É½Àµ¥¸¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ±…å•Ép¹¥Ìµ½Á•¹¥¹œp¹…‘Ù¥Í½ÈµÍ¡••Ðqì…¹¥µ…Ñ¥½¸è…‘Ù¥Í½ÈµÍ¡••ÐµÕÀ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡MM}M=UI¹µ…Ñ  ½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ±…å•ÈqímqÍqMt¨ýqô¼¤ü¹lÁtñð€ˆˆ°€½…¹¥µ…Ñ¥½¸è¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡MM}M=UI¹µ…Ñ  ½p¹…‘Ù¥Í½ÈµÍ¡••ÐqímqÍqMt¨ýqô¼¤ü¹lÁtñð€ˆˆ°€½…¹¥µ…Ñ¥½¸è¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ‰½‘åp¹¥ÌµÍÑ•Àµ™½ÉÝ…É€øp¹…‘Ù¥Í½ÈµÍÑ•À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½p¹…‘Ù¥Í½ÈµÍ¡••Ðµ‰½‘åp¹¥ÌµÍÑ•Àµ‰…¬€øp¹…‘Ù¥Í½ÈµÍÑ•À¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡MM}M=UI°€½µ•‘¥„p¡ÁÉ•™•ÉÌµÉ•‘Õ•µµ½Ñ¥½¸èÉ•‘Õ•p¥mqÍqMt¨ýp¹…‘Ù¥Í½ÈµÍ¡••Ðµ±…å•ÉmqÍqMt¨ý…¹¥µ…Ñ¥½¸è¹½¹”€…¥µÁ½ÉÑ…¹Ð¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡M=UI°€½Í•Ñ%¹Ñ•ÉÙ…±qÌ©p ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡M=UI°€½‘½Õµ•¹Ñp¹‰½‘åp¹…ÁÁ•¹‘¡¥±‘p¡Á½ÉÑ…±I½½Ñp¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡M=UI°€½µ…Ñ¡5•‘¥…pýp¹p ‰p¡ÁÉ•™•ÉÌµÉ•‘Õ•µµ½Ñ¥½¸èÉ•‘Õ•p¤‰p¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡M=UI°€½Ý¥¹‘½Ýp¹Ù¥ÍÕ…±Y¥•ÝÁ½ÉÐ¼¤ì4(€½¹ÍÐÉ•‘Õ•€ô±½…‘‘Ù¥Í½È¡ìÉ•‘Õ•‘5½Ñ¥½¸èÑÉÕ”ô¤ì4(€½¹ÍÐµ½Õ¹Ð€ô¹•Ü…­•5½Õ¹Ð¡É•‘Õ•¹‘½Õµ•¹Ð¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•‘Õ•¹…ÁÀ¹…‘Ù¥Í½È¹‰¥¹¡ìÅÕ•ÉåM•±•Ñ½Èè€ ¤€ôøµ½Õ¹Ðô¤¹É•‘Õ•‘5½Ñ¥½¸°ÑÉÕ”¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰!½µ”Á±…•Ì‰Õ¥±Ðµ¥¸…‘Ù¥Í½È…™Ñ•ÈEÕ¥¬Ñ¥½¹Ì…¹‰•™½É”•…ÑÕÉ•M•ÉÙ¥•Ìˆ°€ ¤€ôøì4(€½¹ÍÐ…ÁÀ€ôì4(€€€ÍÑ…Ñ”èì4(€€€€€¡½µ•Á…”èì½¹™¥œèìÍ•Ñ¥½¹Ìèl4(€€€€€€€ì¥è€‰¡•É¼ˆ°ÑåÁ”è€‰¡•É¼ˆ°•¹…‰±•èÑÉÕ”°Í½ÉÑ}½É‘•Èè€ÄÀ°Ñ¥Ñ±”è€‰!•É¼ˆ°¥Ñ•µÌèmtô°4(€€€€€€€ì¥è€‰ÅÕ¥¬ˆ°ÑåÁ”è€‰ÅÕ¥¬ˆ°•¹…‰±•èÑÉÕ”°Í½ÉÑ}½É‘•Èè€ÈÀ°¥Ñ•µÌèmtô°4(€€€€€€€ì¥è€‰™•…ÑÕÉ•ˆ°ÑåÁ”è€‰™•…ÑÕÉ•‘}Í•ÉÙ¥•Ìˆ°•¹…‰±•èÑÉÕ”°Í½ÉÑ}½É‘•Èè€ÌÀ°Ñ¥Ñ±”è€‰•…ÑÕÉ•ˆ°¥Ñ•µÌèmtô°4(€€€€€tôô°4(€€€€€…Ñ…±½œèìÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°¥Ñ•µÌèmtô°4(€€€ô°4(€€€…‘Ù¥Í½ÈèìÉ•¹‘•ÉM•Ñ¥½¸è€ ¤€ôø€ñÍ•Ñ¥½¸‘…Ñ„µÍµ…ÉÐµ…‘Ù¥Í½Èù‘Ù¥Í½Èð½Í•Ñ¥½¸ù€ô°4(€€€ÕÑ¥±Ìèì•Í…Á•!Ñµ°°¥½¸è€ ¤€ôø€ˆˆ°™½Éµ…Ñ	…¡Ðè€ ¤€ôø€ˆ´ˆ°ÍÑ…Ñ•	½àè€ ¤€ôø€ˆˆô°4(€€€Í•ÉÙ¥•ÌèìÅÕ¥­M•ÉÙ¥•Ìèmt°]11}è€‹‚âs‚âg‚âÇ‚âˆô°4(€ôì4(€Ù´¹ÉÕ¹%¹9•Ý½¹Ñ•áÐ¡U%}M=UI°ì4(€€€Ý¥¹‘½Üèì]ÕÍÑ½µ•ÉÁÁXÈè…ÁÀô°4(€€€‘½Õµ•¹Ðèì‰½‘äèì±…ÍÍ1¥ÍÐèì…‘ ¤íô°É•µ½Ù” ¤íôôô°•Ñ±•µ•¹Ñ	å%è€ ¤€ôø¹Õ±°ô°4(€€€UI0°4(€€€]•…­5…À°4(€€€M•Ð°4(€€€½¹Í½±”°4(€ô¤ì4(€½¹ÍÐ¡Ñµ°€ô…ÁÀ¹Õ¤¹}Ñ•ÍÐ¹É•¹‘•É!½µ•Á…•M•Ñ¥½¹Í]¥Ñ¡‘Ù¥Í½È ¤ì4(€…ÍÍ•ÉÐ¹½¬¡¡Ñµ°¹¥¹‘•á=˜ ‰‘…Ñ„µ¡½µ”µÍ•Ñ¥½¸õp‰ÅÕ¥­pˆˆ¤€ð¡Ñµ°¹¥¹‘•á=˜ ‰‘…Ñ„µÍµ…ÉÐµ…‘Ù¥Í½Èˆ¤¤ì4(€…ÍÍ•ÉÐ¹½¬¡¡Ñµ°¹¥¹‘•á=˜ ‰‘…Ñ„µÍµ…ÉÐµ…‘Ù¥Í½Èˆ¤€ð¡Ñµ°¹¥¹‘•á=˜ ‰‘…Ñ„µ¡½µ”µ™•…ÑÕÉ•µÍ•Ñ¥½¸ˆ¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰…‘Ù¥Í½Èµ½‘Õ±”¥Ì±½…‘•‰•™½É”Õ¤¹©Ì…¹ÁÉ•…¡•Õ¹‘•ÈÑ¡”Í¡…É•‰Õ¥±¥ˆ°€ ¤€ôøì4(€½¹ÍÐ‰Õ¥±€ô€ˆÈÀÈØÀÜÈÙ}ÕÉ•¹Ñ}‘¥É•Ñ}…ÕÑ½}½™™•É}ØÄˆì(€…ÍÍ•ÉÐ¹½¬¡%9a}M=UI¹¥¹‘•á=˜¡µ½‘Õ±•Ì½…‘Ù¥Í½È¹©ÌýØô‘í‰Õ¥±‘õ€¤€ð%9a}M=UI¹¥¹‘•á=˜¡µ½‘Õ±•Ì½Õ¤¹©ÌýØô‘í‰Õ¥±‘õ€¤¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡M]}M=UI°¹•ÜI•áÀ¡	U%1}%€ô€ˆ‘í‰Õ¥±‘ô‰€¤¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡M]}M=UI°€½µ½‘Õ±•Íp½…‘Ù¥Í½Ép¹©ÍpýØõp‘qí	U%1}%qô¼¤ì4)ô¤ì4(