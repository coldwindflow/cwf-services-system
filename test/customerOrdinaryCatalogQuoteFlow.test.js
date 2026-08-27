"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const servicesSource = fs.readFileSync("customer-app/modules/services.js", "utf8");
const storeSource = fs.readFileSync("customer-app/modules/store.js", "utf8");
const { catalogPriceHelpers } = require("./helpers/customerCatalogPrice");

function item(id) {
  return {
    item_id: id,
    item_name: `TEST Catalog ${id}`,
    booking_mode: "bookable",
    booking_ac_type: "ผนัง",
    booking_btu: 12000,
    booking_wash_variant: "ล้างธรรมดา",
    job_category: "ล้าง",
    base_price: "999.00",
  };
}

function quote(id, total = "1399.50", campaign = "TEST Campaign") {
  return {
    kind: "bookable",
    catalog_item_id: id,
    fixed_total_price: total,
    unit_price: total,
    normal_unit_price: "1599.50",
    duration_minutes: 45,
    machine_count: 1,
    price_label: "TEST price",
    campaign_name: campaign,
    service: { job_type: "ล้าง", ac_type: "ผนัง", btu: 12000, wash_variant: "ล้างธรรมดา", machine_count: 1 },
  };
}

function harness(quoteCatalogBooking) {
  const state = {
    currentRoute: "store",
    draft: { scheduled: {}, urgent: {} },
    scheduledPreview: { pricing: null },
    urgentFlow: {},
    updateDraft(scope, patch) { Object.assign(this.draft[scope], patch); },
    setScheduledPreview(name, value) { this.scheduledPreview[name] = value; },
    setUrgentFlow(patch) { Object.assign(this.urgentFlow, patch); },
    setScheduledWizard() {},
    setScheduledSubmit() {},
  };
  const root = {
    state,
    api: { quoteCatalogBooking },
    utils: {
      routeTo(route) { state.currentRoute = route; },
      formatBaht(value) { return String(value); },
      escapeHtml(value) { return String(value); },
      icon() { return ""; },
      ...catalogPriceHelpers(),
    },
  };
  const window = { CWFCustomerAppV2: root, scrollY: 0, pageYOffset: 0 };
  const document = { visibilityState: "visible", createElement() { return { setAttribute() {}, className: "", textContent: "" }; } };
  vm.runInNewContext(servicesSource, { window, document, console, Date, Math, BigInt, Intl, Set }, { filename: "services.js" });
  vm.runInNewContext(storeSource, { window, document, console, Date, Math, BigInt, Intl, Set, clearInterval, setInterval, clearTimeout, setTimeout }, { filename: "store.js" });
  const status = { textContent: "", setAttribute() {} };
  const buttons = [{ disabled: false, setAttribute() {}, removeAttribute() {} }];
  const container = {
    querySelector(selector) { return selector === "[data-catalog-quote-status]" ? status : null; },
    querySelectorAll() { return buttons; },
    prepend() {},
  };
  return { root, state, status, buttons, begin: root.store._test.beginOrdinaryBooking, container };
}

test("ordinary Store quote drives the visible scheduled draft, exact price, duration and campaign", async () => {
  const flow = harness(async () => quote(7));
  assert.equal(await flow.begin(flow.container, item(7), "scheduled", "test"), true);
  assert.equal(flow.state.currentRoute, "scheduled");
  assert.equal(flow.state.draft.scheduled.catalog_item_id, 7);
  assert.equal(flow.state.draft.scheduled.catalog_booking_quote.fixed_total_price, "1399.50");
  assert.equal(flow.state.draft.scheduled.catalog_booking_quote.duration_min, 45);
  assert.equal(flow.state.scheduledPreview.pricing.data.active_price, "1399.50");
  assert.equal(flow.state.scheduledPreview.pricing.data.promo.promo_name, "TEST Campaign");
  assert.equal(flow.buttons[0].disabled, false);
});

test("ordinary quote ignores stale out-of-order responses and suppresses duplicate submit", async () => {
  const pending = [];
  const flow = harness((payload) => new Promise((resolve) => pending.push({ payload, resolve })));
  const first = flow.begin(flow.container, item(7), "scheduled", "test");
  const duplicate = flow.begin(flow.container, item(7), "scheduled", "test");
  assert.equal(await duplicate, false);
  assert.equal(pending.length, 1);

  const second = flow.begin(flow.container, item(8), "scheduled", "test");
  assert.equal(pending.length, 2);
  pending[1].resolve(quote(8, "899.00", "NEW Campaign"));
  assert.equal(await second, true);
  pending[0].resolve(quote(7));
  assert.equal(await first, false);
  assert.equal(flow.state.draft.scheduled.catalog_item_id, 8);
  assert.equal(flow.state.draft.scheduled.catalog_booking_quote.fixed_total_price, "899.00");
});

test("ordinary quote 4xx/409/5xx/network failure stays retryable without routing or a verified draft", async () => {
  for (const status of [400, 409, 503, 0]) {
    const flow = harness(async () => { const error = new Error("quote failed"); error.status = status; throw error; });
    assert.equal(await flow.begin(flow.container, item(status || 9), "urgent", "test"), false);
    assert.equal(flow.state.currentRoute, "store");
    assert.equal(flow.state.draft.urgent.catalog_booking_quote, undefined);
    assert.match(flow.status.textContent, /ลองใหม่/);
    assert.equal(flow.buttons[0].disabled, false);
  }
});
