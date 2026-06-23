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

test("openCatalogModalForEdit populates cm_effective_from and cm_effective_to from raw pricing fields with fallback", () => {
  assert.match(catalogJsSource, /el\("cm_effective_from"\)\.value = toDateInputValue\(item\.pricing_effective_from \?\? item\.effective_from\);/);
  assert.match(catalogJsSource, /el\("cm_effective_to"\)\.value = toDateInputValue\(item\.pricing_effective_to \?\? item\.effective_to\);/);
});

test("openCatalogModalForEdit no longer hardcodes cm_pricing_is_active to \"1\" regardless of state", () => {
  assert.doesNotMatch(catalogJsSource, /cm_pricing_is_active"\)\.value = item\.price_rule_id \? "1" : "1";/);
  assert.match(catalogJsSource, /const rawPricingIsActive = item\.pricing_is_active != null \? item\.pricing_is_active : true;/);
  assert.match(catalogJsSource, /cm_pricing_is_active"\)\.value = item\.price_rule_id \? \(rawPricingIsActive \? "1" : "0"\) : "1";/);
});

test("openCatalogModalForEdit reads raw pricing_* fields first, falling back to the effective field names", () => {
  assert.match(catalogJsSource, /item\.pricing_wash_variant \?\? item\.wash_variant \?\? ""/);
  assert.match(catalogJsSource, /const rawNormalPrice = item\.pricing_normal_price \?\? item\.normal_price;/);
  assert.match(catalogJsSource, /const rawActivePrice = item\.pricing_active_price \?\? item\.sale_price;/);
  assert.match(catalogJsSource, /const rawPriority = item\.pricing_priority \?\? item\.priority;/);
  assert.match(catalogJsSource, /item\.pricing_label \?\? item\.price_label \?\? ""/);
  assert.match(catalogJsSource, /item\.pricing_campaign_name \?\? item\.campaign_name \?\? ""/);
});

test("openCatalogModalForEdit never assigns blank/empty values when raw pricing data exists (no data loss on open+save)", () => {
  const fnMatch = catalogJsSource.match(/function openCatalogModalForEdit\(itemId\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "openCatalogModalForEdit function not found");
  const body = fnMatch[0];
  assert.doesNotMatch(body, /el\("cm_normal_price"\)\.value = "";/);
  assert.doesNotMatch(body, /el\("cm_active_price"\)\.value = "";/);
  assert.doesNotMatch(body, /el\("cm_label"\)\.value = "";/);
  assert.doesNotMatch(body, /el\("cm_campaign_name"\)\.value = "";/);
});

test("catalogModalPayload sends pricing.pricing_is_active, not pricing.is_active", () => {
  assert.match(catalogJsSource, /pricing_is_active: el\("cm_pricing_is_active"\)\.value === "1",/);
  assert.doesNotMatch(catalogJsSource, /pricing\.is_active\b/);
});

// ---------- Marketplace v2: admin UI ----------

test("modal includes a marketplace section with booking_mode, is_featured, and description fields", () => {
  assert.match(catalogJsSource, /6\) ข้อมูลตลาด \(Marketplace\)/);
  assert.match(catalogJsSource, /id="cm_booking_mode"/);
  assert.match(catalogJsSource, /id="cm_booking_service_key"/);
  assert.match(catalogJsSource, /id="cm_booking_ac_type"/);
  assert.match(catalogJsSource, /id="cm_booking_btu"/);
  assert.match(catalogJsSource, /id="cm_booking_wash_variant"/);
  assert.match(catalogJsSource, /id="cm_is_featured"/);
  assert.match(catalogJsSource, /id="cm_short_description"/);
  assert.match(catalogJsSource, /id="cm_long_description"/);
  assert.match(catalogJsSource, /id="cm_highlights"/);
  assert.match(catalogJsSource, /id="cm_service_conditions"/);
});

test("booking detail fields are wrapped in a container that toggles visibility based on booking_mode", () => {
  assert.match(catalogJsSource, /id="cm_booking_fields" style="display:none;"/);
  assert.match(catalogJsSource, /function updateBookingFieldsVisibility\(\)/);
  assert.match(catalogJsSource, /el\("cm_booking_mode"\)\.addEventListener\("change", updateBookingFieldsVisibility\)/);
});

test("catalogModalPayload includes booking_mode, is_featured, highlights array, and description fields", () => {
  assert.match(catalogJsSource, /booking_mode: el\("cm_booking_mode"\)\.value,/);
  assert.match(catalogJsSource, /is_featured: el\("cm_is_featured"\)\.value === "1",/);
  assert.match(catalogJsSource, /highlights: \(el\("cm_highlights"\)\.value \|\| ""\)\.split\("\\n"\)\.map\(\(line\) => line\.trim\(\)\)\.filter\(Boolean\),/);
  assert.match(catalogJsSource, /short_description: trimmedOrEmpty\("cm_short_description"\),/);
  assert.match(catalogJsSource, /long_description: trimmedOrEmpty\("cm_long_description"\),/);
  assert.match(catalogJsSource, /service_conditions: trimmedOrEmpty\("cm_service_conditions"\),/);
});

test("client-side validation rejects a bookable item with an unsupported/missing booking_ac_type, booking_btu, or wash_variant", () => {
  assert.match(catalogJsSource, /if \(!BOOKING_AC_TYPES\.includes\(payload\.booking_ac_type\)\) \{/);
  assert.match(catalogJsSource, /if \(!BOOKING_BTU_OPTIONS\.includes\(Number\(payload\.booking_btu\)\)\) \{/);
  assert.match(catalogJsSource, /if \(payload\.booking_ac_type === BOOKING_WALL_AC_TYPE && !BOOKING_WASH_VARIANTS\.includes\(payload\.booking_wash_variant\)\) \{/);
});

test("booking ac_type, btu, and wash_variant are <select> dropdowns built from the canonical allow-lists, not free-text inputs", () => {
  assert.match(catalogJsSource, /const BOOKING_AC_TYPES = \["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"\];/);
  assert.match(catalogJsSource, /const BOOKING_BTU_OPTIONS = \[9000, 12000, 18000, 24000, 30000\];/);
  assert.match(catalogJsSource, /const BOOKING_WASH_VARIANTS = \["ล้างธรรมดา", "ล้างพรีเมียม", "ล้างแขวนคอยล์", "ล้างแบบตัดล้าง"\];/);
  assert.match(catalogJsSource, /<select id="cm_booking_ac_type">/);
  assert.match(catalogJsSource, /<select id="cm_booking_btu">/);
  assert.match(catalogJsSource, /<select id="cm_booking_wash_variant">/);
  assert.doesNotMatch(catalogJsSource, /<input[^>]*id="cm_booking_ac_type"/);
  assert.doesNotMatch(catalogJsSource, /<input[^>]*id="cm_booking_btu"/);
  assert.doesNotMatch(catalogJsSource, /<input[^>]*id="cm_booking_wash_variant"/);
});

test("the wash_variant field only shows for wall-mounted ac_type and toggles on ac_type change", () => {
  assert.match(catalogJsSource, /id="cm_booking_wash_variant_field"/);
  assert.match(catalogJsSource, /el\("cm_booking_ac_type"\)\.addEventListener\("change", updateBookingFieldsVisibility\)/);
  assert.match(catalogJsSource, /const isWallAc = el\("cm_booking_ac_type"\)\.value === BOOKING_WALL_AC_TYPE;/);
  assert.match(catalogJsSource, /el\("cm_booking_wash_variant_field"\)\.style\.display = isWallAc \? "block" : "none";/);
});

test("openCatalogModalForEdit populates marketplace fields from the item, including a fallback booking_mode", () => {
  assert.match(catalogJsSource, /el\("cm_booking_mode"\)\.value = BOOKING_MODES\.includes\(item\.booking_mode\) \? item\.booking_mode : "contact_admin";/);
  assert.match(catalogJsSource, /el\("cm_highlights"\)\.value = Array\.isArray\(item\.highlights\) \? item\.highlights\.join\("\\n"\) : "";/);
});

test("admin card thumbnail uses the Primary image from item.images before falling back to legacy image_url", () => {
  const fnMatch = catalogJsSource.match(/function catalogItemThumbUrl\(item\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, "catalogItemThumbUrl function not found");
  assert.match(fnMatch[0], /find\(\(img\) => img\.is_primary\)/);
  assert.match(fnMatch[0], /\|\| item\.image_url/);
  assert.match(catalogJsSource, /const thumbUrl = catalogItemThumbUrl\(item\);/);
});

test("catalog item cards show a bookable/contact-admin badge and a featured badge when applicable", () => {
  assert.match(catalogJsSource, /item\.booking_mode === "bookable" \? `<span class="asc-badge asc-badge-bookable">/);
  assert.match(catalogJsSource, /item\.is_featured \? `<span class="asc-badge asc-badge-featured">/);
});

test("a multi-image gallery manager section exists and is wired to the /images REST endpoints", () => {
  assert.match(catalogJsSource, /id="cm_gallery_section"/);
  assert.match(catalogJsSource, /function loadGalleryImages\(itemId\)/);
  assert.match(catalogJsSource, /apiFetch\(`\/admin\/catalog\/items\/\$\{itemId\}\/images`\)/);
  assert.match(catalogJsSource, /apiFetch\(`\/admin\/catalog\/items\/\$\{editingItemId\}\/images`, \{ method: "POST", body: formData \}\)/);
  assert.match(catalogJsSource, /apiFetch\(`\/admin\/catalog\/items\/\$\{editingItemId\}\/images\/\$\{imageId\}`, \{ method: "DELETE" \}\)/);
  assert.match(catalogJsSource, /apiFetch\(`\/admin\/catalog\/items\/\$\{editingItemId\}\/images\/\$\{imageId\}\/primary`, \{ method: "POST" \}\)/);
  assert.match(catalogJsSource, /apiFetch\(`\/admin\/catalog\/items\/\$\{editingItemId\}\/images\/reorder`,/);
});

test("the gallery manager shows a save-first message instead of upload controls when there is no editingItemId yet", () => {
  const fnMatch = catalogJsSource.match(/function renderGalleryManager\(\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "renderGalleryManager function not found");
  assert.match(fnMatch[0], /if \(!editingItemId\) \{/);
  assert.match(fnMatch[0], /บันทึกข้อมูลบริการก่อน/);
});

test("gallery delete and set-primary actions ask for confirmation only on delete", () => {
  assert.match(catalogJsSource, /async function onGalleryDelete\(imageId\) \{[\s\S]*?confirm\(.*ลบรูปภาพ/);
});

test("admin-store-catalog.html script and stylesheet references were bumped to the marketplace v2 build id", () => {
  assert.match(catalogHtmlSource, /admin-store-catalog\.css\?v=20260623_catalog_marketplace_v2/);
  assert.match(catalogHtmlSource, /admin-store-catalog\.js\?v=20260623_catalog_marketplace_v2/);
});

test("admin-store-catalog.css defines gallery grid and badge styles for the marketplace UI", () => {
  assert.match(catalogCssSource, /\.asc-gallery-grid\{/);
  assert.match(catalogCssSource, /\.asc-badge-bookable\{/);
  assert.match(catalogCssSource, /\.asc-badge-featured\{/);
});

// ---------- Autoplay toggle, multi-image upload queue, delete confirmation ----------

test("modal includes an is_autoplay_enabled select defaulting to enabled, wired into reset/edit/payload", () => {
  assert.match(catalogJsSource, /<select id="cm_is_autoplay_enabled">/);
  assert.match(catalogJsSource, /el\("cm_is_autoplay_enabled"\)\.value = "1";/);
  assert.match(catalogJsSource, /el\("cm_is_autoplay_enabled"\)\.value = item\.is_autoplay_enabled === false \? "0" : "1";/);
  assert.match(catalogJsSource, /is_autoplay_enabled: el\("cm_is_autoplay_enabled"\)\.value === "1",/);
});

test("gallery file input supports selecting multiple files and enforces a max of MAX_GALLERY_IMAGES", () => {
  assert.match(catalogJsSource, /const MAX_GALLERY_IMAGES = 4;/);
  assert.match(catalogJsSource, /<input id="cm_gallery_input" type="file" accept="[^"]+" multiple>/);
});

test("onGalleryImagePicked uploads multiple files sequentially, truncates over the remaining slot count, and hides the input while uploading", () => {
  const fnMatch = catalogJsSource.match(/async function onGalleryImagePicked\(event\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "onGalleryImagePicked function not found");
  const body = fnMatch[0];
  assert.match(body, /Array\.from\(event\.target\.files\)/);
  assert.match(body, /const remaining = Math\.max\(0, MAX_GALLERY_IMAGES - galleryImages\.length\);/);
  assert.match(body, /files\.slice\(0, remaining\)/);
  assert.match(body, /galleryUploading = true;/);
  assert.match(body, /galleryUploading = false;/);
  assert.match(body, /for \(const file of toUpload\)/);

  const renderMatch = catalogJsSource.match(/function renderGalleryManager\(\)[\s\S]*?\n}\n/);
  assert.ok(renderMatch, "renderGalleryManager function not found");
  assert.match(renderMatch[0], /const inputArea = galleryUploading/);
});

test("the more-sheet has a delete option that opens the delete confirmation modal", () => {
  assert.match(catalogJsSource, /<button class="danger" data-act="delete" type="button">ลบรายการนี้<\/button>/);
  assert.match(catalogJsSource, /if \(act === "delete"\) \{ closeMoreSheet\(\); openDeleteModal\(item\.item_id\); return; \}/);
});

test("delete confirmation modal requires typing the exact item_name before the confirm button is enabled", () => {
  assert.match(catalogJsSource, /function updateDeleteConfirmButtonState\(\)/);
  assert.match(catalogJsSource, /typed !== item\.item_name/);
  assert.match(catalogJsSource, /id="asc_delete_modal_confirm" class="danger" type="button" disabled>/);
});

test("delete confirmation modal warns extra when the item is currently active and visible to customers", () => {
  const fnMatch = catalogJsSource.match(/function openDeleteModal\(itemId\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "openDeleteModal function not found");
  assert.match(fnMatch[0], /item\.is_active && item\.is_customer_visible \? "block" : "none"/);
});

test("gallery delete/set-primary/reorder actions guard against double-clicks while a gallery action is in flight", () => {
  const deleteFn = catalogJsSource.match(/async function onGalleryDelete\(imageId\)[\s\S]*?\n}\n/);
  const primaryFn = catalogJsSource.match(/async function onGallerySetPrimary\(imageId\)[\s\S]*?\n}\n/);
  const reorderFn = catalogJsSource.match(/async function onGalleryReorder\(imageId, direction\)[\s\S]*?\n}\n/);
  assert.ok(deleteFn && primaryFn && reorderFn, "gallery action functions not found");
  for (const fn of [deleteFn[0], primaryFn[0], reorderFn[0]]) {
    assert.match(fn, /galleryUploading\) return;/);
    assert.match(fn, /galleryUploading = true;/);
    assert.match(fn, /finally \{\s*\n\s*galleryUploading = false;/);
  }
});

test("confirmDeleteCatalogItem calls the real DELETE endpoint and surfaces a Cloudinary cleanup warning distinctly from plain success", () => {
  const fnMatch = catalogJsSource.match(/async function confirmDeleteCatalogItem\(\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "confirmDeleteCatalogItem function not found");
  const body = fnMatch[0];
  assert.match(body, /apiFetch\(`\/admin\/catalog\/items\/\$\{itemId\}`, \{ method: "DELETE" \}\)/);
  assert.match(body, /if \(result && result\.warning\) showToast\(result\.warning, "error"\);/);
  assert.match(body, /else showToast\("ลบรายการแล้ว", "success"\);/);
});
