"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/ui.js"), "utf8");

function item(id, options = {}) {
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

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  emit(type, values = {}) {
    const event = { type, target: this, relatedTarget: null, ...values };
    for (const handler of Array.from(this.listeners.get(type) || [])) handler(event);
  }
  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
  totalListenerCount() {
    return Array.from(this.listeners.values()).reduce((total, handlers) => total + handlers.size, 0);
  }
}

class FakeClassList {
  constructor(active = false) {
    this.values = new Set(active ? ["is-active"] : []);
  }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) {
    if (force) this.values.add(value);
    else this.values.delete(value);
  }
}

class FakeControl {
  constructor() {
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

class FakePage extends FakeTarget {
  constructor(index) {
    super();
    this.classList = new FakeClassList(index === 0);
    this.attributes = new Map([["aria-hidden", index === 0 ? "false" : "true"]]);
    this.controls = [new FakeControl(), new FakeControl()];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll() { return this.controls; }
}

class FakeDot extends FakeTarget {
  constructor(index) {
    super();
    this.classList = new FakeClassList(index === 0);
    this.attributes = new Map([["aria-selected", index === 0 ? "true" : "false"]]);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function fakeClock() {
  let nextId = 1;
  let now = 0;
  const pending = new Map();
  const nextEntry = () => Array.from(pending.entries()).sort((a, b) => a[1].due - b[1].due)[0];
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      pending.set(id, { fn, delay, due: now + delay });
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
    count() { return pending.size; },
    nextDelay() {
      const entry = nextEntry();
      return entry ? entry[1].due - now : null;
    },
    runNext() {
      const entry = nextEntry();
      assert.ok(entry, "expected a pending timer");
      pending.delete(entry[0]);
      now = entry[1].due;
      entry[1].fn();
      return entry[1].delay;
    },
    advance(delay) {
      const target = now + delay;
      let entry = nextEntry();
      while (entry && entry[1].due <= target) {
        pending.delete(entry[0]);
        now = entry[1].due;
        entry[1].fn();
        entry = nextEntry();
      }
      now = target;
    },
  };
}

function fakeRotator(pageCount) {
  const pages = Array.from({ length: pageCount }, (_, index) => new FakePage(index));
  const dots = Array.from({ length: pageCount }, (_, index) => new FakeDot(index));
  const interaction = new FakeTarget();
  interaction.contains = (target) => !!target?.insideInteraction;
  const rotator = new FakeTarget();
  rotator.pages = pages;
  rotator.dots = dots;
  rotator.interaction = interaction;
  rotator.dataset = {};
  rotator.isConnected = true;
  rotator.attributes = new Map();
  rotator.querySelectorAll = (selector) => {
    if (selector === "[data-featured-page]") return pages;
    if (selector === "[data-featured-dot]") return dots;
    if (selector === "[data-featured-rotator]") return [rotator];
    return [];
  };
  rotator.querySelector = (selector) => selector === "[data-featured-pages]" ? interaction : null;
  rotator.matches = (selector) => selector === "[data-featured-rotator]";
  return rotator;
}

function loadUi(items, { reducedMotion = false } = {}) {
  const clock = fakeClock();
  const document = new FakeTarget();
  document.visibilityState = "visible";
  document.getElementById = () => null;
  document.body = { classList: new FakeClassList() };
  const app = {
    state: { catalog: { status: "success", items } },
    utils: {
      escapeHtml: (value) => String(value == null ? "" : value),
      formatBaht: (value) => `${value} บาท`,
      icon: () => "<i></i>",
      stateBox: (_kind, message) => `<p>${message}</p>`,
    },
    services: { WALL_AC: "ผนัง" },
  };
  vm.runInNewContext(UI_SOURCE, {
    window: { CWFCustomerAppV2: app, matchMedia: () => ({ matches: reducedMotion }) },
    document,
    console,
    URL,
    WeakMap,
    Set,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    requestAnimationFrame: (callback) => callback(),
  });
  return { app, clock, document };
}

function fakeContactSheetContainer() {
  const closeButton = new FakeTarget();
  closeButton.focus = () => {};
  const mount = {
    innerHTML: "",
    querySelectorAll: (selector) => selector === "[data-contact-close]" ? [closeButton] : [],
    querySelector: (selector) => selector === ".contact-sheet-close" ? closeButton : null,
  };
  return {
    mount,
    container: {
      querySelector: (selector) => selector === "[data-contact-sheet-mount]" ? mount : null,
      appendChild: () => {},
    },
  };
}

const ids = (page) => Array.from(page, (row) => row.item_id);

test("auto pool keeps every eligible unique item with featured and bookable priority", () => {
  const { app } = loadUi([
    item(1),
    item(2, { booking_mode: "bookable" }),
    item(3, { is_featured: true }),
    item(4, { is_featured: true, booking_mode: "bookable" }),
    item(4, { is_featured: true }),
    item(5, { is_active: false }),
    item(6, { is_customer_visible: false }),
  ]);
  assert.deepEqual(ids(app.ui._test.featuredCatalogPool({ featured_mode: "auto", featured_limit: 1 })), [4, 3, 2, 1]);
  assert.equal(app.ui._test.featuredPageSize({ featured_limit: 99 }), 6);
  assert.equal(app.ui._test.featuredPageSize({ featured_limit: 0 }), 1);
});

test("page builder covers 6, 7, 12 and 13-item pools before wrapping", () => {
  const { app } = loadUi([]);
  const build = (count) => app.ui._test.buildFeaturedPages(Array.from({ length: count }, (_, index) => item(index + 1)), 6);
  assert.deepEqual(Array.from(build(6), ids), [[1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(Array.from(build(7), ids), [[1, 2, 3, 4, 5, 6], [7, 1, 2, 3, 4, 5]]);
  assert.deepEqual(Array.from(build(12), ids), [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
  assert.deepEqual(Array.from(build(13), ids), [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 1, 2, 3, 4, 5]]);
  for (const page of build(13)) assert.equal(new Set(ids(page)).size, page.length);
});

test("manual pool preserves selected order, filters hidden rows and never pulls other catalog items", () => {
  const { app } = loadUi([
    item(1), item(2), item(3), item(4, { is_active: false }), item(5), item(6), item(7), item(8),
  ]);
  const pool = app.ui._test.featuredCatalogPool({
    featured_mode: "manual",
    featured_limit: 6,
    item_ids: [8, 2, 8, 4, 1, 7, 6, 5, 3],
  });
  assert.deepEqual(ids(pool), [8, 2, 1, 7, 6, 5, 3]);
  assert.deepEqual(Array.from(app.ui._test.buildFeaturedPages(pool, 6), ids), [
    [8, 2, 1, 7, 6, 5],
    [3, 8, 2, 1, 7, 6],
  ]);
});

test("render contract exposes exactly one active six-card page and accessible inactive pages", () => {
  const { app } = loadUi(Array.from({ length: 13 }, (_, index) => item(index + 1)));
  const html = app.ui._test.renderHomepageFeaturedServices({ featured_mode: "auto", featured_limit: 6 });
  assert.equal((html.match(/data-featured-page="/g) || []).length, 3);
  assert.equal((html.match(/aria-hidden="false"/g) || []).length, 1);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 2);
  assert.equal((html.match(/data-featured-dot="/g) || []).length, 3);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((html.match(/class="homepage-service-card"/g) || []).length, 18);
  assert.match(html, /data-featured-page="1"[\s\S]*?data-home-featured-detail="7"/);
  assert.match(html, /data-featured-page="2"[\s\S]*?data-home-featured-detail="13"/);
  assert.doesNotMatch(html, /homepage-featured-page[\s\S]*grid-template-columns[^]*repeat\(4/);
});

test("rotator advances, loops, resets on dots, pauses safely and cleans up duplicate binding", () => {
  const { app, clock, document } = loadUi([]);
  const rotator = fakeRotator(3);
  const container = { querySelectorAll: () => [rotator] };
  const [controller] = app.ui._test.bindHomepageFeaturedRotators(container);
  assert.equal(clock.count(), 1);
  assert.equal(clock.runNext(), app.ui._test.FEATURED_ROTATION_INTERVAL_MS);
  assert.equal(controller.getActiveIndex(), 1);
  assert.equal(clock.count(), 1);
  clock.runNext();
  assert.equal(controller.getActiveIndex(), 2);
  clock.runNext();
  assert.equal(controller.getActiveIndex(), 0);

  rotator.dots[1].emit("click");
  assert.equal(controller.getActiveIndex(), 1);
  assert.equal(rotator.pages[0].getAttribute("aria-hidden"), "true");
  assert.equal(rotator.pages[0].controls[0].getAttribute("tabindex"), "-1");
  assert.equal(rotator.dots[1].getAttribute("aria-selected"), "true");
  assert.equal(clock.count(), 1);

  rotator.interaction.emit("pointerenter");
  assert.equal(clock.count(), 0);
  rotator.interaction.emit("pointerleave");
  assert.equal(clock.count(), 1);
  rotator.interaction.emit("pointerdown");
  assert.equal(clock.count(), 0);
  document.emit("pointerup");
  assert.equal(clock.count(), 1);
  rotator.interaction.emit("focusin");
  assert.equal(clock.count(), 0);
  rotator.interaction.emit("focusout", { relatedTarget: null });
  assert.equal(clock.count(), 1);
  document.visibilityState = "hidden";
  document.emit("visibilitychange");
  assert.equal(clock.count(), 0);
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  assert.equal(clock.count(), 1);

  const [sameController] = app.ui._test.bindHomepageFeaturedRotators(container);
  assert.equal(sameController, controller);
  assert.equal(clock.count(), 1);
  app.ui._test.cleanupHomepageFeaturedRotators(rotator);
  assert.equal(clock.count(), 0);
  assert.equal(document.listenerCount("visibilitychange"), 0);
});

test("featured inquiry contact sheet pauses only its rotator and restarts one fresh timer on close", () => {
  const { app, clock } = loadUi([]);
  const rotator = fakeRotator(3);
  const [controller] = app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
  const { container } = fakeContactSheetContainer();
  const trigger = { closest: (selector) => selector === "[data-featured-rotator]" ? rotator : null };

  assert.equal(clock.count(), 1);
  const firstSheet = app.ui._test.openFeaturedContactSheet(container, trigger, { title: "สอบถามบริการ" });
  assert.equal(clock.count(), 0);
  clock.advance(app.ui._test.FEATURED_ROTATION_INTERVAL_MS * 2);
  assert.equal(controller.getActiveIndex(), 0);
  firstSheet.close();
  assert.equal(clock.count(), 1);
  assert.equal(clock.nextDelay(), app.ui._test.FEATURED_ROTATION_INTERVAL_MS);

  for (let index = 0; index < 3; index += 1) {
    const sheet = app.ui._test.openFeaturedContactSheet(container, trigger, { title: "สอบถามบริการ" });
    assert.equal(clock.count(), 0);
    sheet.close();
    assert.equal(clock.count(), 1);
  }
  controller.cleanup();
});

test("closing a featured contact sheet after route cleanup cannot restart a destroyed rotator", () => {
  const { app, clock, document } = loadUi([]);
  const rotator = fakeRotator(2);
  app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
  const { container } = fakeContactSheetContainer();
  const trigger = { closest: () => rotator };
  const sheet = app.ui._test.openFeaturedContactSheet(container, trigger, { title: "สอบถามบริการ" });

  app.ui._test.cleanupHomepageFeaturedRotators(rotator);
  assert.equal(clock.count(), 0);
  assert.equal(document.totalListenerCount(), 0);
  sheet.close();
  assert.equal(clock.count(), 0);
  assert.equal(document.totalListenerCount(), 0);
});

test("outside pointer release and cancellation always release the temporary press pause", () => {
  for (const releaseType of ["pointerup", "pointercancel", "touchcancel"]) {
    const { app, clock, document } = loadUi([]);
    const rotator = fakeRotator(2);
    const [controller] = app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
    rotator.interaction.emit(releaseType === "touchcancel" ? "touchstart" : "pointerdown");
    assert.equal(clock.count(), 0, `${releaseType} press must pause`);
    assert.equal(document.listenerCount(releaseType), 1);

    document.emit(releaseType);
    assert.equal(clock.count(), 1, `${releaseType} must restart one timer`);
    for (const type of ["pointerup", "pointercancel", "touchend", "touchcancel"]) {
      assert.equal(document.listenerCount(type), 0, `${type} listener must be removed after ${releaseType}`);
    }
    controller.cleanup();
    assert.equal(document.totalListenerCount(), 0);
  }
});

test("cleanup during an active press removes timers and every temporary or permanent listener", () => {
  const { app, clock, document } = loadUi([]);
  const rotator = fakeRotator(2);
  const [controller] = app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
  rotator.interaction.emit("pointerdown");
  assert.equal(clock.count(), 0);
  assert.equal(document.listenerCount("pointerup"), 1);
  assert.equal(document.listenerCount("visibilitychange"), 1);

  controller.cleanup();
  assert.equal(clock.count(), 0);
  assert.equal(document.totalListenerCount(), 0);
  document.emit("pointerup");
  assert.equal(clock.count(), 0);
});

test("reduced motion disables auto rotation while keeping manual dots usable", () => {
  const { app, clock } = loadUi([], { reducedMotion: true });
  const rotator = fakeRotator(2);
  const [controller] = app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
  assert.equal(clock.count(), 0);
  rotator.dots[1].emit("click");
  assert.equal(controller.getActiveIndex(), 1);
  assert.equal(clock.count(), 0);
  controller.cleanup();
});

test("disconnected rotator self-cleans instead of rescheduling an orphan timer", () => {
  const { app, clock, document } = loadUi([]);
  const rotator = fakeRotator(2);
  app.ui._test.bindHomepageFeaturedRotators({ querySelectorAll: () => [rotator] });
  rotator.isConnected = false;
  clock.runNext();
  assert.equal(clock.count(), 0);
  assert.equal(document.listenerCount("visibilitychange"), 0);
});

test("compact CSS and cache build remain consistent with six-card rotation", () => {
  const css = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.css"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "customer-app/index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "customer-app/sw.js"), "utf8");
  const boot = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.js"), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, "customer-app/manifest.webmanifest"), "utf8");
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /\.homepage-service-action\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(css.match(/\.homepage-service-card \.homepage-card-body strong\s*\{[^}]*\}/)[0], /min-height/);
  assert.match(css, /\.homepage-featured-page\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s);
  assert.match(css, /transition:\s*opacity 350ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  const build = "20260715_smart_advisor_mobile_polish_v2";
  for (const source of [html, sw, boot, manifest]) assert.match(source, new RegExp(build));
});
