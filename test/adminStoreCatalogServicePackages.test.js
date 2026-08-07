"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const js = fs.readFileSync(path.join(__dirname, "../admin-store-catalog.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../admin-store-catalog.html"), "utf8");

test("new flow offers immutable ordinary or Service Package type while ordinary save payload stays on its original endpoint", () => {
  assert.match(js, /Choose item type/);
  assert.match(js, /Ordinary catalog item/);
  assert.match(js, /Service Package promotion/);
  assert.match(js, /new_ordinary_item[\s\S]*openCatalogModalForNew/);
  assert.match(js, /new_package_item[\s\S]*openPackageModal/);
  assert.match(js, /savedItem = await apiFetch\("\/admin\/catalog\/items", \{ method: "POST", body: JSON\.stringify\(payload\) \}\)/);
});

test("package form sends only management-domain fields and no ordinary price, rule, image, booking-mode, delete or key mutation", () => {
  const payload = js.match(/function packagePayload\(\)[\s\S]*?\n}\n/)[0];
  for (const forbidden of ["base_price", "normal_price", "customer_service_price_rules", "booking_mode", "item_id", "package_key"]) assert.doesNotMatch(payload, new RegExp(forbidden));
  assert.match(payload, /display_name/); assert.match(payload, /service_unit_duration_minutes/); assert.match(payload, /fixed_total_price/);
  assert.match(js, /\/admin\/service-packages\/catalog/);
  assert.match(js, /pm_package_key" disabled/);
  assert.doesNotMatch(js.match(/async function saveServicePackage\(\)[\s\S]*?\n}\n/)[0], /\/admin\/catalog\/items/);
});

test("package tier editor is repeatable, supports inactive tiers and preserves form state on safe failure", () => {
  assert.match(js, /pm_add_tier/); assert.match(js, /packageTierDrafts\.push/); assert.match(js, /data-remove-tier/);
  assert.match(js, /data-tier-field="is_active"/);
  const save = js.match(/async function saveServicePackage\(\)[\s\S]*?\n}\n/)[0];
  assert.match(save, /catch \(error\)[\s\S]*box\.textContent/);
  assert.doesNotMatch(save, /catch \(error\)[\s\S]*openCatalogModalForNew/);
});

test("same Admin page renders full package history lifecycle statuses and uses cache-busted assets", () => {
  assert.match(html, /id="package_catalog_list"/);
  for (const status of ["Draft", "Disabled", "Hidden", "Upcoming", "On sale", "Sale ended", "Redeem ended"]) assert.match(js, new RegExp(status));
  assert.match(html, /admin-store-catalog\.js\?v=20260808_service_packages/);
  assert.match(html, /admin-store-catalog\.css\?v=20260808_service_packages/);
});
