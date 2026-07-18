const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "customer-app/modules/ui.js"), "utf8");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadUi(overrides = {}) {
  const labels = {
    home: "หน้าแรก",
    store: "ร้านค้า",
    booking: "จองบริการ",
    tracking: "ติดตามงาน",
    profile: "บัญชี",
  };
  const calls = { actionDecorations: 0, iconSlots: [], pageHeaderQueries: 0 };
  const app = {
    state: { homepage: { status: "success", config: {} } },
    utils: {
      escapeHtml,
      iconSlot(slot) {
        calls.iconSlots.push(slot);
        return `<span data-cwf-icon-slot="${escapeHtml(slot)}"></span>`;
      },
      decorateActionIcons() { calls.actionDecorations += 1; },
      ...(overrides.utils || {}),
    },
  };
  const document = {
    body: { classList: { add() {}, remove() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
  };
  const window = {
    CWFCustomerAppV2: app,
    CWFIconRegistry: {
      navigationItem(_config, page) { return { label: labels[page] }; },
    },
  };
  vm.runInNewContext(UI_SOURCE, { window, document, URL, WeakMap, Set, console, MutationObserver: overrides.MutationObserver }, { filename: "ui.js" });
  return { app, calls };
}

function routeContainer() {
  const insertions = [];
  const headingTarget = {
    querySelector(selector) {
      return selector === "[data-page-icon-heading]" && insertions.length ? {} : null;
    },
    insertAdjacentHTML(position, html) {
      assert.equal(position, "afterbegin");
      insertions.push(String(html));
    },
  };
  return {
    insertions,
    querySelector(selector) {
      if (selector === ".screen, .booking-wizard-page") return headingTarget;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-page-header]") return [];
      return [];
    },
  };
}

test("Customer App UI module has no startup debug logging", () => {
  assert.doesNotMatch(UI_SOURCE, /\bconsole\.(?:debug|info|log)\s*\(/);
});

test("all Customer App routes render one semantic text-only page heading", () => {
  const { app } = loadUi({
    utils: {
      iconSlot() { throw new Error("page heading must not request an icon slot"); },
    },
  });
  const routes = [
    ["home", "home", "หน้าแรก"],
    ["store", "store", "ร้านค้า"],
    ["storeItem", "store", "ร้านค้า"],
    ["storeItem-42", "store", "ร้านค้า"],
    ["booking", "booking", "จองบริการ"],
    ["scheduled", "booking", "จองบริการ"],
    ["urgent", "booking", "จองบริการ"],
    ["tracking", "tracking", "ติดตามงาน"],
    ["profile", "profile", "บัญชี"],
  ];

  for (const [route, page, label] of routes) {
    const container = routeContainer();
    app.ui.applyRouteIcons(container, route);
    app.ui.applyRouteIcons(container, route);

    assert.equal(container.insertions.length, 1, `${route} heading should not be injected twice`);
    const html = container.insertions[0];
    assert.match(html, /<header class="route-page-heading"/);
    assert.match(html, new RegExp(`data-page-icon-heading="${page}"`));
    assert.match(html, new RegExp(`<h2 class="route-page-heading__title">${label}</h2>`));
    assert.doesNotMatch(html, /<svg\b|<img\b|cwf-icon-slot|data-(?:cwf-)?icon-slot/i);
  }
});

test("applyRouteIcons keeps profile slots, action decoration, and page-header binding", () => {
  const { app, calls } = loadUi();
  const makeProfileMount = () => ({
    insertions: [],
    querySelector() { return null; },
    insertAdjacentHTML(_position, html) { this.insertions.push(String(html)); },
  });
  const address = makeProfileMount();
  const history = makeProfileMount();
  const container = {
    querySelector(selector) {
      if (selector === ".screen, .booking-wizard-page") return null;
      if (selector === "[data-profile-address]") return address;
      if (selector === "[data-profile-history]") return history;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-page-header]") calls.pageHeaderQueries += 1;
      return [];
    },
  };

  app.ui.applyRouteIcons(container, "profile");

  assert.deepEqual(calls.iconSlots, ["profile.address", "profile.history"]);
  assert.match(address.insertions[0], /data-profile-slot-icon/);
  assert.match(history.insertions[0], /data-profile-slot-icon/);
  assert.equal(calls.actionDecorations, 1);
  assert.equal(calls.pageHeaderQueries, 1);
});

test("async route repaint restores one heading only for the still-current route", () => {
  let observerCallback = null;
  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  }
  const { app } = loadUi({ MutationObserver: FakeMutationObserver });
  const container = routeContainer();
  app.state.currentRoute = "scheduled";

  app.ui.applyRouteIcons(container, "scheduled");
  assert.equal(container.insertions.length, 1);

  container.insertions.length = 0;
  observerCallback();
  observerCallback();
  assert.equal(container.insertions.length, 1, "repaint should restore exactly one heading");

  app.state.currentRoute = "tracking";
  container.insertions.length = 0;
  observerCallback();
  assert.equal(container.insertions.length, 0, "stale route observer must not decorate a different route");
});

test("route heading layout stays aligned and mobile overflow guards remain active", () => {
  const css = fs.readFileSync(path.join(ROOT, "customer-app/assets/customer-app.css"), "utf8");

  assert.match(css, /\.route-page-heading\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*0;/s);
  assert.match(css, /\.route-page-heading__title\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(css, /\.booking-wizard-page\s*\{[^}]*padding:\s*12px 16px 20px;/s);
  assert.match(css, /\.booking-wizard-page > \.route-page-heading\s*\{[^}]*margin:\s*0;/s);
  assert.match(css, /\.route-page-heading ~ \.page-header-mount:empty\s*\{\s*display:\s*none;/);
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden;/s);
  assert.match(css, /body\s*\{[^}]*overflow-x:\s*hidden;/s);
  assert.doesNotMatch(css, /\.page-icon-heading/);
});
