"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const js = fs.readFileSync(path.join(__dirname, "../admin-store-catalog.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../admin-store-catalog.html"), "utf8");

test("new flow offers immutable ordinary or Service Package type while ordinary save payload stays on its original endpoint", () => {
  assert.match(js, /เลือกประเภทรายการ/);
  assert.match(js, /รายการบริการปกติ/);
  assert.match(js, /โปรโมชั่นแพ็กเกจ/);
  assert.match(js, /new_ordinary_item[\s\S]*openCatalogModalForNew/);
  assert.match(js, /new_package_item[\s\S]*openBundleModal/);
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
  assert.match(save, /catch \(_error\)[\s\S]*box\.textContent/);
  assert.doesNotMatch(save, /catch \(_error\)[\s\S]*openCatalogModalForNew/);
});

test("same Admin page renders full package history lifecycle statuses and uses cache-busted assets", () => {
  assert.match(html, /id="package_catalog_list"/);
  for (const status of ["แบบร่าง", "ปิดใช้งาน", "ซ่อนจากลูกค้า", "ยังไม่ถึงวันขาย", "กำลังเปิดขาย", "ปิดการขายแล้ว", "หมดเขตใช้สิทธิ์"]) assert.match(js, new RegExp(status));
  for (const statusKey of ["draft", "disabled", "hidden", "upcoming", "on-sale", "sale-ended", "redeem-ended"]) assert.match(js, new RegExp(`(?:^|[" ])${statusKey}(?:[":]|$)`));
  assert.match(html, /admin-store-catalog\.js\?v=20260809_store_service_package_bundles_v1/);
  assert.match(html, /admin-store-catalog\.css\?v=20260809_store_service_package_bundles_v1/);
});

test("bundle controls keep taxonomy and stable keys in the atomic JSON contract", () => {
  const save = js.match(/async function saveBundle\(\)[\s\S]*?\r?\n}\r?\n/)[0];
  assert.match(save, /service-package-bundles/);
  assert.match(js, /package_key\/tier_key/);
  for (const field of ["job_type", "ac_type", "wash_variant", "tier_key", "fixed_total_price"]) assert.match(js, new RegExp(field));
  assert.match(js, /loadCatalogItems\(\)/);
});
