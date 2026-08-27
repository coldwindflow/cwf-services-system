"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { catalogPriceHelpers } = require("./helpers/customerCatalogPrice");

const ROOT = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

function loadUi() {
  const state = {
    catalog: { status: "success", items: [] },
    homeServicePackages: { status: "success", items: [], error: "" },
    draft: { scheduled: {} },
    scheduledPreview: {},
    updateDraft(_scope, patch) { this.draft.scheduled = { ...this.draft.scheduled, ...patch }; },
    setScheduledWizard(patch) { this.scheduledWizard = { ...(this.scheduledWizard || {}), ...patch }; },
    setScheduledPreview(name, patch) { this.scheduledPreview[name] = patch; },
  };
  const routed = [];
  const app = {
    state,
    utils: {
      escapeHtml: (value) => String(value == null ? "" : value),
      routeTo: (route) => routed.push(route),
      formatBaht: String,
      ...catalogPriceHelpers(),
      icon: () => "",
      iconSlot: () => "",
      stateBox: () => "",
    },
    services: { WALL_AC: "ผนัง" },
  };
  const document = { getElementById: () => null, body: { classList: { add() {}, remove() {} } }, visibilityState: "visible" };
  vm.runInNewContext(read("customer-app/modules/ui.js"), {
    window: { CWFCustomerAppV2: app, matchMedia: () => ({ matches: true }) }, document, console, URL, WeakMap, Set,
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: (fn) => fn(), IntersectionObserver: undefined,
  });
  return { app, routed };
}

function packageDto(overrides = {}) {
  return {
    package_key: "summer-clean",
    package_name: "ล้างแอร์รับหน้าร้อน",
    description: "ราคาพิเศษตามจำนวนเครื่อง",
    service: { service_key: "clean", service_name: "ล้างแอร์" },
    sell_end_at: "2099-12-31T16:59:59.000Z",
    redeem_until: "2100-01-31T16:59:59.000Z",
    tiers: [
      { tier_key: "one", tier_name: "แพ็ก 1 เครื่อง", quantity: 1, fixed_total_price: "699.00" },
      { tier_key: "two", tier_name: "แพ็ก 2 เครื่อง", quantity: 2, fixed_total_price: "1399.00" },
    ],
    ...overrides,
  };
}

test("eligible public DTO renders all exact server tiers and sits after hero before quick actions", () => {
  const { app } = loadUi();
  app.state.homeServicePackages.items = [packageDto()];
  const html = app.ui._test.renderHomepageServicePackages();
  assert.match(html, /ล้างแอร์รับหน้าร้อน/);
  assert.match(html, /1 เครื่อง — 699\.00 บาท/);
  assert.match(html, /2 เครื่อง — 1399\.00 บาท/);
  assert.doesNotMatch(html, /service_package_id|unit_duration_minutes/);
  const page = app.ui._test.renderHomepageSectionsWithAdvisor();
  assert.ok(page.indexOf("homepage-hero") < page.indexOf("data-home-service-packages"));
  assert.ok(page.indexOf("data-home-service-packages") < page.indexOf("homepage-quick-grid"));
});

test("inactive, hidden, future, expired, empty and no-tier responses create no package card", () => {
  const { app } = loadUi();
  assert.equal(app.ui._test.renderHomepageServicePackages(), "");
  app.state.homeServicePackages.items = [
    packageDto({ tiers: [] }),
    packageDto({ package_key: "", tiers: packageDto().tiers }),
    packageDto({ package_key: "inactive", is_active: false }),
    packageDto({ package_key: "hidden", is_customer_visible: false }),
    packageDto({ package_key: "future", sell_start_at: "2999-01-01T00:00:00.000Z", sell_end_at: null }),
    packageDto({ package_key: "expired", sell_start_at: null, sell_end_at: "2000-01-01T00:00:00.000Z" }),
  ];
  assert.equal(app.ui._test.renderHomepageServicePackages(), "");
});

test("tier click hands off stable identities only and leaves scheduled server preview required", () => {
  const { app, routed } = loadUi();
  let click;
  const button = {
    getAttribute(name) { return name === "data-home-package-key" ? "summer-clean" : "two"; },
    addEventListener(type, handler) { if (type === "click") click = handler; },
  };
  const container = {
    querySelector: () => null,
    querySelectorAll(selector) { return selector === "[data-home-package-key][data-home-package-tier-key]" ? [button] : []; },
  };
  app.ui._test.bindHomepage(container);
  click();
  assert.equal(app.state.draft.scheduled.service_package_key, "summer-clean");
  assert.equal(app.state.draft.scheduled.service_package_tier_key, "two");
  for (const key of ["fixed_total_price", "quantity", "unit_duration_minutes", "service_package_id"]) assert.equal(key in app.state.draft.scheduled, false);
  assert.equal(app.state.scheduledPreview.package.verified, false);
  assert.equal(app.state.scheduledPreview.package.status, "idle");
  assert.deepEqual(routed, ["scheduled"]);
  assert.match(read("customer-app/modules/bookingScheduled.js"), /hasPackageSelection\(\)[\s\S]*previewServicePackage|selectServicePackage\(draft\(\)\.service_package_key/);
});

test("homepage package API failure is isolated from the all-settled homepage load", () => {
  const source = read("customer-app/modules/ui.js");
  assert.match(source, /loadHomeServicePackagesData[\s\S]*catch \(error\)[\s\S]*homeServicePackages[^]*status: "error"/);
  assert.match(source, /homeLoadPromise = Promise\.allSettled\(tasks\)/);
  assert.match(read("customer-app/modules/api.js"), /loadServicePackages\(\)[\s\S]*\/public\/service-packages[\s\S]*cache: "no-store"/);
});
