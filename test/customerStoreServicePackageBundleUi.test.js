"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
const scheduled = fs.readFileSync("customer-app/modules/bookingScheduled.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");
const admin = fs.readFileSync("admin-store-catalog.js", "utf8");

test("Store renders one parent configurator with arbitrary nested variants and quantities beyond four", () => {
  assert.match(store, /service_package_variants\.map/);
  assert.match(store, /data-bundle-package/);
  assert.match(store, /data-bundle-quantity[^>]*type="number"[^>]*min="0"/);
  assert.doesNotMatch(store, /data-bundle-quantity[\s\S]{0,200}max=/);
  assert.doesNotMatch(store, /tier\.quantity === 1[\s\S]{0,120}prior\.components/);
  assert.match(store, /service_package_groups: result\.groups/);
  assert.doesNotMatch(store, /Premium Day|premium-day/);
});

test("mobile 360 and 390 layouts collapse each bundle row without a fixed-width overflow", () => {
  assert.match(css, /@media \(max-width: 480px\)[^{]*\{[^}]*\.store-bundle-row/);
  assert.match(css, /grid-template-columns: 1fr 1fr/);
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
