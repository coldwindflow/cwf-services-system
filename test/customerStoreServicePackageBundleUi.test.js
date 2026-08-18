"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
const scheduled = fs.readFileSync("customer-app/modules/bookingScheduled.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");
const admin = fs.readFileSync("admin-store-catalog.js", "utf8");

function storeTestApi() {
  const context = { window: { CWFCustomerAppV2: {} }, console: { info() {} } };
  vm.runInNewContext(store, context);
  return context.window.CWFCustomerAppV2.store._test;
}

test("bundle configurator is modal-only and keeps the composite parent payload", () => {
  assert.match(store, /service_package_variants\.map/);
  assert.match(store, /data-bundle-package/);
  assert.match(store, /data-bundle-quantity[^>]*type="number"[^>]*min="0"[^>]*max="99"[^>]*step="1"/);
  assert.doesNotMatch(store, /tier\.quantity === 1[\s\S]{0,120}prior\.components/);
  assert.match(store, /service_package_groups: result\.groups/);
  assert.doesNotMatch(store, /Premium Day|premium-day/);
  const detail = store.slice(store.indexOf("function renderDetailContent"), store.indexOf("function renderDetailBody"));
  assert.doesNotMatch(detail, /renderBundleConfigurator/);
});

test("detail booking CTAs open the same scheduled or urgent bundle sheet", () => {
  const detail = store.slice(store.indexOf("function bindDetailBody"), store.indexOf("function openDetail"));
  assert.match(detail, /openBundleConfigurator\(container, item, "scheduled", bookButton\)/);
  assert.match(detail, /openBundleConfigurator\(container, item, "urgent", bookButton\)/);
  assert.match(store, /booking_mode: scope/);
});

test("bundle quantities support accessible minus, typed input, plus, and strict bounds", () => {
  assert.match(store, /data-bundle-dec[^>]*aria-label="ลดจำนวน/);
  assert.match(store, /data-bundle-inc[^>]*aria-label="เพิ่มจำนวน/);
  assert.match(store, /data-bundle-quantity type="number" min="0" max="99" step="1" inputmode="numeric"/);
  assert.match(store, /addEventListener\("input", refreshQuote\)/);
  assert.match(store, /data-bundle-row-error[^>]*aria-live="polite"/);
  const api = storeTestApi();
  assert.equal(api.parseBundleQuantity("0"), 0);
  assert.equal(api.parseBundleQuantity("99"), 99);
  assert.throws(() => api.parseBundleQuantity("1.5"), /จำนวนเต็ม/);
  assert.throws(() => api.parseBundleQuantity("100"), /0 ถึง 99/);
  assert.equal(api.clampBundleQuantity("0", -1), 0);
  assert.equal(api.clampBundleQuantity("99", 1), 99);
  assert.equal(api.clampBundleQuantity("invalid", 1), 1);
});

test("live quote is debounced, authoritative, stale-safe, and gates confirmation", () => {
  assert.match(store, /setTimeout\(async \(\) =>[\s\S]*root\.api\.quoteCatalogBooking/);
  assert.match(store, /\}, 300\)/);
  assert.match(store, /requestId !== bundleQuoteRequestId/);
  assert.match(store, /verifiedSignature = signature/);
  assert.match(store, /root\.utils\.formatBaht\(quote\.fixed_total_price\)/);
  assert.match(store, /quote\?\.duration_minutes/);
  assert.match(store, /data-bundle-confirm disabled/);
  assert.match(store, /verifiedQuote = null[\s\S]*confirm\) confirm\.disabled = true/);
  assert.match(store, /verifiedQuote = quote[\s\S]*confirm\) confirm\.disabled = false/);
  assert.doesNotMatch(store, /composeBundleTiers\([^)]*\)[\s\S]{0,200}data-bundle-price/);
});

test("bundle sheet closes from backdrop, close button, Escape, and restores focus", () => {
  assert.match(store, /contact-sheet-backdrop" data-bundle-close/);
  assert.match(store, /contact-sheet-close[^>]*data-bundle-close/);
  assert.match(store, /event\.key === "Escape"/);
  assert.match(store, /trigger\?\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(store, /document\.body\.classList\.remove\("has-contact-sheet"\)/);
});

test("mobile 360 and 390 layouts collapse rows without horizontal overflow", () => {
  assert.match(css, /\.store-bundle-sheet \{[^}]*overflow-x: hidden/);
  assert.match(css, /\.store-bundle-stepper \{[^}]*grid-template-columns: 40px minmax\(0, 1fr\) 40px/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.store-bundle-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  for (const viewport of [360, 390]) assert.ok(viewport <= 480);
  assert.doesNotMatch(css.match(/\.store-bundle-row \{[^}]+\}/)?.[0] || "", /width:\s*[4-9]\d{2}px/);
});

test("scheduled flow and Admin use the composite contract instead of standalone package seeding", () => {
  assert.match(scheduled, /service_package_groups/);
  assert.match(admin, /\/admin\/catalog\/service-package-bundles/);
  assert.match(admin, /บันทึกสินค้าและแพ็กเกจ/);
  assert.match(admin, /loadCatalogItems\(\)/);
});

test("Store grid binds urgent actions with policy and runtime availability gates", () => {
  const grid = store.slice(store.indexOf("function bindGridActions"), store.indexOf("function patchGrid"));
  const detail = store.slice(store.indexOf("function bindDetailBody"), store.indexOf("function openDetail"));
  assert.match(grid, /querySelectorAll\("\[data-store-urgent\]"\)/);
  assert.match(grid, /allowsUrgentBooking\(item\)/);
  assert.match(grid, /urgentBookingAvailable/);
  assert.doesNotMatch(detail, /querySelectorAll\("\[data-store-urgent\]"\)/);
});

test("sale expiry gates actions independently from countdown presentation", () => {
  assert.match(store, /data-campaign-sale-end/);
  assert.match(store, /querySelectorAll\("\[data-campaign-sale-end\]"\)/);
  assert.match(store, /querySelector\("\[data-campaign-countdown\]"\)/);
  assert.match(store, /button\.disabled = true/);
  assert.match(store, /Math\.min\(60000, Math\.max\(1, remaining\)\)/);
});
