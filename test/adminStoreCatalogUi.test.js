const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const commonJsSource = fs.readFileSync(path.join(__dirname, "..", "admin-v2-common.js"), "utf8");
const catalogHtmlSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.html"), "utf8");
const catalogJsSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.js"), "utf8");
const catalogCssSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.css"), "utf8");

test("shared admin menu includes a link to /admin-store-catalog.html", () => {
  assert.match(commonJsSource, /data-href="\/admin-store-catalog\.html"/);
});

test("shared admin menu catalog link has the expected Thai label", () => {
  assert.match(commonJsSource, /data-href="\/admin-store-catalog\.html">[^<]*รายการบริการในร้านค้า/);
});

test("the /admin-store-catalog.html menu link appears exactly once", () => {
  const matches = commonJsSource.match(/data-href="\/admin-store-catalog\.html"/g) || [];
  assert.equal(matches.length, 1);
});

test("admin-store-catalog.html still loads the shared admin-v2-common.js script", () => {
  assert.match(catalogHtmlSource, /<script src="\/admin-v2-common\.js\?v=[^"]+"><\/script>/);
});

test("admin-store-catalog.html loads its own admin-store-catalog.js script", () => {
  assert.match(catalogHtmlSource, /<script src="\/admin-store-catalog\.js\?v=[^"]+"><\/script>/);
});

test("admin-store-catalog.html loads its own admin-store-catalog.css file", () => {
  assert.match(catalogHtmlSource, /<link rel="stylesheet" href="\/admin-store-catalog\.css\?v=[^"]+"\/>/);
});

test("the main page no longer contains the old always-open long inline form", () => {
  assert.doesNotMatch(catalogHtmlSource, /id="catalog_form_card"/);
  assert.doesNotMatch(catalogHtmlSource, /id="btnSaveItem"/);
});

test("main page contains header, add-button, search, filter, card list and store preview", () => {
  assert.match(catalogHtmlSource, /รายการบริการในร้านค้า \(Admin\)/);
  assert.match(catalogHtmlSource, /id="btnNewItem"[^>]*>\+ เพิ่มบริการ/);
  assert.match(catalogHtmlSource, /id="catalog_search"/);
  assert.match(catalogHtmlSource, /id="catalog_filter_active"/);
  assert.match(catalogHtmlSource, /id="catalog_filter_visible"/);
  assert.match(catalogHtmlSource, /id="catalog_list"/);
  assert.match(catalogHtmlSource, /id="catalog_preview"/);
});

test("admin-store-catalog.js builds a modal/bottom-sheet with 5 sections", () => {
  assert.match(catalogJsSource, /cwf-modal-backdrop/);
  assert.match(catalogJsSource, /1\) ข้อมูลบริการ/);
  assert.match(catalogJsSource, /2\) รูปบริการ/);
  assert.match(catalogJsSource, /3\) ราคาและโปรโมชั่น/);
  assert.match(catalogJsSource, /4\) การแสดงผล/);
  assert.match(catalogJsSource, /5\) ขั้นสูง/);
});

test("modal contains normal_price and active_price fields", () => {
  assert.match(catalogJsSource, /cm_normal_price/);
  assert.match(catalogJsSource, /cm_active_price/);
});

test("modal contains an image file input and a delete-image button with confirmation", () => {
  assert.match(catalogJsSource, /id="cm_image_input" type="file"/);
  assert.match(catalogJsSource, /id="cm_image_delete"/);
  assert.match(catalogJsSource, /confirm\(.*ลบรูปภาพ/);
});

test("cards use compact actions, not multiple full-width buttons", () => {
  assert.match(catalogJsSource, /data-act="edit"/);
  assert.match(catalogJsSource, /data-act="more"/);
  assert.doesNotMatch(catalogJsSource, /svc-row/);
});

test("the exact required pricing warning text is present", () => {
  assert.match(
    catalogJsSource,
    /ราคานี้ใช้ร่วมกับระบบจองลูกค้า การแก้ไขจะมีผลกับการประเมินราคาใหม่ แต่ไม่แก้ราคางานเก่าย้อนหลัง/
  );
});

test("catalog list renders loading, empty, and error states", () => {
  assert.match(catalogJsSource, /asc-loading/);
  assert.match(catalogJsSource, /asc-empty/);
  assert.match(catalogJsSource, /asc-error/);
});

test("image upload only happens after the item is saved and an itemId exists", () => {
  const saveFnMatch = catalogJsSource.match(/async function saveCatalogItem\(\)[\s\S]*?\n}\n/);
  assert.ok(saveFnMatch, "saveCatalogItem function not found");
  const body = saveFnMatch[0];
  const saveCallIndex = body.search(/await apiFetch\(`\/admin\/catalog\/items/);
  const itemIdAssignIndex = body.indexOf("const itemId = savedItem.item_id;");
  const uploadCallIndex = body.search(/\/admin\/catalog\/items\/\$\{itemId\}\/image/);
  assert.ok(saveCallIndex >= 0 && itemIdAssignIndex > saveCallIndex && uploadCallIndex > itemIdAssignIndex);
});

test("saveCatalogItem guards against double submission", () => {
  assert.match(catalogJsSource, /if \(isSaving\) return;/);
  assert.match(catalogJsSource, /isSaving = true;/);
});

test("admin-store-catalog.css exists and includes responsive rules for 320-360px without horizontal overflow", () => {
  assert.match(catalogCssSource, /@media \(max-width: 360px\)/);
  assert.match(catalogCssSource, /asc-item-card/);
});

test("openCatalogModalForEdit populates cm_effective_from and cm_effective_to from the item", () => {
  assert.match(catalogJsSource, /el\("cm_effective_from"\)\.value = toDateInputValue\(item\.effective_from\);/);
  assert.match(catalogJsSource, /el\("cm_effective_to"\)\.value = toDateInputValue\(item\.effective_to\);/);
});

test("openCatalogModalForEdit no longer hardcodes cm_pricing_is_active to \"1\" regardless of state", () => {
  assert.doesNotMatch(catalogJsSource, /cm_pricing_is_active"\)\.value = item\.price_rule_id \? "1" : "1";/);
  assert.match(catalogJsSource, /cm_pricing_is_active"\)\.value = item\.price_rule_id \? \(item\.pricing_is_active \? "1" : "0"\) : "1";/);
});

test("catalogModalPayload sends pricing.pricing_is_active, not pricing.is_active", () => {
  assert.match(catalogJsSource, /pricing_is_active: el\("cm_pricing_is_active"\)\.value === "1",/);
  assert.doesNotMatch(catalogJsSource, /pricing\.is_active\b/);
});
