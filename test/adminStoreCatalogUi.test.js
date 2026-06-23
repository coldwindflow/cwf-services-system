const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const commonJsSource = fs.readFileSync(path.join(__dirname, "..", "admin-v2-common.js"), "utf8");
const catalogHtmlSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.html"), "utf8");
const catalogJsSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.js"), "utf8");
const catalogCssSource = fs.readFileSync(path.join(__dirname, "..", "admin-store-catalog.css"), "utf8");

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function extractCatalogModalHtml() {
  const m = catalogJsSource.match(/wrap\.innerHTML = `([\s\S]*?)`;\n  document\.body\.appendChild/);
  if (!m) throw new Error("could not find ensureCatalogModal's wrap.innerHTML template");
  return m[1];
}

// Walks the modal's HTML template as a real tag stack (not just text matching), so a
// stray/missing closing tag is caught even when it doesn't disturb any single regex window.
function buildTagDepthTrace(html) {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;
  const stack = [];
  const trace = [];
  let match;
  while ((match = tagRe.exec(html))) {
    const [, closing, name, attrs, selfClose] = match;
    const lower = name.toLowerCase();
    if (closing) {
      const top = stack[stack.length - 1];
      if (!top || top.name !== lower) {
        throw new Error(`mismatched closing tag </${lower}> at offset ${match.index}; stack top was ${top ? top.name : "(empty)"}`);
      }
      stack.pop();
      continue;
    }
    const idMatch = attrs.match(/id="([^"]+)"/);
    const classMatch = attrs.match(/class="([^"]+)"/);
    const entry = { name: lower, id: idMatch ? idMatch[1] : null, classes: classMatch ? classMatch[1].split(/\s+/) : [], depth: stack.length };
    trace.push(entry);
    if (!selfClose && !VOID_TAGS.has(lower)) stack.push(entry);
  }
  if (stack.length) {
    throw new Error(`unclosed tag(s) remain on stack: ${stack.map((s) => s.name + (s.id ? "#" + s.id : "")).join(", ")}`);
  }
  return trace;
}

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

test("admin-store-catalog.js builds a modal/bottom-sheet with 7 non-redundant sections, with price-rule-matching fields collapsed into an accordion", () => {
  assert.match(catalogJsSource, /cwf-modal-backdrop/);
  assert.match(catalogJsSource, /1\) ข้อมูลหลัก/);
  assert.match(catalogJsSource, /2\) รูปภาพสินค้า/);
  assert.match(catalogJsSource, /3\) ราคาและโปรโมชั่น/);
  assert.match(catalogJsSource, /4\) การจอง/);
  assert.match(catalogJsSource, /5\) รายละเอียด/);
  assert.match(catalogJsSource, /6\) การแสดงผล/);
  assert.match(catalogJsSource, /7\) ข้อมูลจับคู่ระบบราคา/);
  // legacy cover image and the multi-image gallery must be merged into one section, not split
  assert.match(catalogJsSource, /2\) รูปภาพสินค้า[\s\S]*?id="cm_image_input"[\s\S]*?id="cm_gallery_section"/);
  // base_price must live with pricing, not under a separate "advanced" section
  assert.doesNotMatch(catalogJsSource, /ขั้นสูง/);
  assert.match(catalogJsSource, /3\) ราคาและโปรโมชั่น[\s\S]*?id="cm_base_price"/);
  // price-rule-matching fields must be collapsed by default (native <details>, no "open" attribute)
  const accordionMatch = catalogJsSource.match(/<details class="asc-section asc-accordion">[\s\S]*?<\/details>/);
  assert.ok(accordionMatch, "price-rule-matching accordion not found");
  assert.doesNotMatch(accordionMatch[0], /<details[^>]* open/);
  assert.match(accordionMatch[0], /id="cm_job_category"/);
  assert.match(accordionMatch[0], /id="cm_ac_type"/);
  assert.match(accordionMatch[0], /id="cm_wash_variant"/);
  assert.match(accordionMatch[0], /id="cm_btu_min"/);
  assert.match(accordionMatch[0], /id="cm_btu_max"/);
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

test("the 7-section reorganization does not change which element id backs each field: every id read in catalogModalPayload is also written in openCatalogModalForEdit, so reordering sections never drops a value on open+save", () => {
  const payloadMatch = catalogJsSource.match(/function catalogModalPayload\(\)[\s\S]*?\n}\n/);
  const editMatch = catalogJsSource.match(/function openCatalogModalForEdit\(itemId\)[\s\S]*?\n}\n/);
  assert.ok(payloadMatch, "catalogModalPayload function not found");
  assert.ok(editMatch, "openCatalogModalForEdit function not found");
  const payloadIds = [...payloadMatch[0].matchAll(/el\("(cm_[a-z_]+)"\)/g)].map((m) => m[1]);
  const editIds = [...editMatch[0].matchAll(/el\("(cm_[a-z_]+)"\)\.value =/g)].map((m) => m[1]);
  const missing = payloadIds.filter((id) => !editIds.includes(id));
  assert.deepEqual(missing, [], `fields read by catalogModalPayload but never populated in openCatalogModalForEdit: ${missing.join(", ")}`);
});

test("no two distinct DOM elements in the modal share the same id (no duplicate inputs writing into the same field)", () => {
  const ids = [...catalogJsSource.matchAll(/id="(cm_[a-z_]+)"/g)].map((m) => m[1]);
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  const duplicates = Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(duplicates, [], `duplicate field ids found: ${duplicates.join(", ")}`);
});

test("hidden/collapsed fields (price-rule-matching accordion, booking advanced subsection) are populated on edit just like visible fields, so collapsing them never clears stored values", () => {
  const editMatch = catalogJsSource.match(/function openCatalogModalForEdit\(itemId\)[\s\S]*?\n}\n/);
  assert.ok(editMatch, "openCatalogModalForEdit function not found");
  const body = editMatch[0];
  for (const id of ["cm_job_category", "cm_ac_type", "cm_wash_variant", "cm_btu_min", "cm_btu_max", "cm_booking_service_key"]) {
    assert.match(body, new RegExp(`el\\("${id}"\\)\\.value = `), `${id} is not populated in openCatalogModalForEdit`);
  }
});

// ---------- Marketplace v2: admin UI ----------

test("modal includes booking_mode and is_featured under their own sections, plus description fields under รายละเอียด", () => {
  assert.match(catalogJsSource, /4\) การจอง[\s\S]*?id="cm_booking_mode"/);
  assert.match(catalogJsSource, /id="cm_booking_service_key"/);
  assert.match(catalogJsSource, /id="cm_booking_ac_type"/);
  assert.match(catalogJsSource, /id="cm_booking_btu"/);
  assert.match(catalogJsSource, /id="cm_booking_wash_variant"/);
  assert.match(catalogJsSource, /6\) การแสดงผล[\s\S]*?id="cm_is_featured"/);
  assert.match(catalogJsSource, /5\) รายละเอียด[\s\S]*?id="cm_short_description"/);
  assert.match(catalogJsSource, /id="cm_long_description"/);
  assert.match(catalogJsSource, /id="cm_highlights"/);
  assert.match(catalogJsSource, /id="cm_service_conditions"/);
});

test("booking section shows only booking_mode/ac_type/btu/wash_variant prominently; service_key is tucked into a collapsed Advanced subsection", () => {
  const sectionMatch = catalogJsSource.match(/4\) การจอง[\s\S]*?<\/div>\n\n        <div class="asc-section">\n          <div class="asc-section-title">5\)/);
  assert.ok(sectionMatch, "booking section not found");
  const section = sectionMatch[0];
  const detailsMatch = section.match(/<details class="asc-booking-advanced">[\s\S]*?<\/details>/);
  assert.ok(detailsMatch, "booking advanced <details> not found");
  assert.doesNotMatch(detailsMatch[0], /<details[^>]* open/);
  assert.match(detailsMatch[0], /id="cm_booking_service_key"/);
  // service_key must not also appear outside of the collapsed subsection
  const outsideDetails = section.replace(detailsMatch[0], "");
  assert.doesNotMatch(outsideDetails, /id="cm_booking_service_key"/);
});

test("the catalog modal's HTML template is a fully-balanced tag tree (catches stray/missing closing tags that text-window regexes can miss), and sections 5/6/7 plus the error box stay direct children of .cwf-modal-body", () => {
  const html = extractCatalogModalHtml();
  // buildTagDepthTrace throws on any mismatched/unclosed tag, which is itself the
  // regression check for the malformed-markup bug (an extra </div> after the booking
  // Advanced <details> used to close cm_booking_fields and the booking asc-section twice).
  const trace = buildTagDepthTrace(html);

  const modalBody = trace.find((e) => e.name === "div" && e.classes.includes("cwf-modal-body"));
  assert.ok(modalBody, ".cwf-modal-body not found");
  const bodyDepth = modalBody.depth + 1; // depth of elements that are direct children of .cwf-modal-body

  const bookingFields = trace.find((e) => e.id === "cm_booking_fields");
  assert.ok(bookingFields, "cm_booking_fields not found");
  // cm_booking_fields must sit inside exactly one asc-section wrapper, i.e. one level
  // deeper than the direct children of .cwf-modal-body, not two levels deeper (which is
  // what the extra stray </div> used to produce by closing the section's wrapper early).
  assert.equal(bookingFields.depth, bodyDepth + 1, "cm_booking_fields is not nested exactly one level inside its asc-section");

  const detailsAdvanced = trace.find((e) => e.name === "details" && e.classes.includes("asc-booking-advanced"));
  assert.ok(detailsAdvanced, "booking advanced <details> not found");
  assert.equal(detailsAdvanced.depth, bookingFields.depth + 1, "booking advanced <details> is not nested directly inside cm_booking_fields");

  for (const id of ["cm_short_description", "cm_is_active", "cm_job_category"]) {
    const found = trace.find((e) => e.id === id);
    assert.ok(found, `${id} not found in modal template`);
  }

  const errorBox = trace.find((e) => e.id === "catalog_modal_error");
  assert.ok(errorBox, "catalog_modal_error not found");
  assert.equal(errorBox.depth, bodyDepth, "catalog_modal_error must be a direct child of .cwf-modal-body");

  const section7 = trace.find((e) => e.name === "details" && e.classes.includes("asc-accordion") && e.classes.includes("asc-section"));
  assert.ok(section7, "section 7 (price-rule-matching accordion) not found");
  assert.equal(section7.depth, bodyDepth, "section 7 must be a direct child of .cwf-modal-body");
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

test("onGalleryImagePicked builds a per-file status queue, blocks picking while already uploading, and clearly reports over-limit truncation instead of staying silent", () => {
  const fnMatch = catalogJsSource.match(/async function onGalleryImagePicked\(event\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "onGalleryImagePicked function not found");
  const body = fnMatch[0];
  assert.match(body, /Array\.from\(event\.target\.files\)/);
  assert.match(body, /if \(!files\.length \|\| !editingItemId \|\| galleryUploading\) return;/);
  assert.match(body, /const activeBefore = galleryActiveCount\(\);/);
  assert.match(body, /const remaining = Math\.max\(0, MAX_GALLERY_IMAGES - activeBefore\);/);
  assert.match(body, /files\.slice\(0, remaining\)/);
  assert.match(body, /if \(!toUpload\.length\) \{/);
  assert.match(body, /galleryPickNotice = `เลือกแล้ว \$\{files\.length\} รูป/);
  assert.match(body, /if \(files\.length > toUpload\.length\) \{/);
  assert.match(body, /เลือกมาเกินจำนวนที่ว่าง จะอัปโหลดเฉพาะ/);
  assert.match(body, /status: "pending",/);
  assert.match(body, /await runGalleryUploadQueue\(newlyQueued\);/);
});

test("runGalleryUploadQueue uploads sequentially with per-file status transitions, reloads the gallery, keeps failed items for retry, and never re-uploads a succeeded file", () => {
  const fnMatch = catalogJsSource.match(/async function runGalleryUploadQueue\(itemsToRun\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "runGalleryUploadQueue function not found");
  const body = fnMatch[0];
  assert.match(body, /galleryUploading = true;/);
  assert.match(body, /for \(const queued of itemsToRun\)/);
  assert.match(body, /queued\.status = "uploading";/);
  assert.match(body, /queued\.status = "done";/);
  assert.match(body, /queued\.status = "error";/);
  assert.match(body, /galleryUploading = false;/);
  // succeeded items are removed from the queue so a later retry pass can never re-upload them
  assert.match(body, /const doneItems = galleryUploadQueue\.filter\(\(q\) => q\.status === "done"\);/);
  assert.match(body, /galleryUploadQueue = galleryUploadQueue\.filter\(\(q\) => q\.status !== "done"\);/);
  assert.match(body, /await loadGalleryImages\(editingItemId\);/);
});

test("a single failed upload can be retried without touching files that already succeeded, and can be dismissed without retrying", () => {
  assert.match(catalogJsSource, /async function onGalleryRetry\(localId\)/);
  const retryMatch = catalogJsSource.match(/async function onGalleryRetry\(localId\)[\s\S]*?\n}\n/);
  assert.ok(retryMatch, "onGalleryRetry function not found");
  assert.match(retryMatch[0], /if \(galleryUploading\) return;/);
  assert.match(retryMatch[0], /await runGalleryUploadQueue\(\[queued\]\);/);

  assert.match(catalogJsSource, /function onGalleryDismissFailed\(localId\)/);
  const dismissMatch = catalogJsSource.match(/function onGalleryDismissFailed\(localId\)[\s\S]*?\n}\n/);
  assert.ok(dismissMatch, "onGalleryDismissFailed function not found");
  assert.match(dismissMatch[0], /URL\.revokeObjectURL\(queued\.localUrl\);/);
  assert.match(dismissMatch[0], /galleryUploadQueue = galleryUploadQueue\.filter\(\(q\) => q\.localId !== localId\);/);
});

test("the gallery upload queue shows a per-file pending/uploading/done/error status with a retry/remove action on failure, and a live in-progress count", () => {
  assert.match(catalogJsSource, /function galleryStatusLabel\(status\)/);
  assert.match(catalogJsSource, /if \(status === "uploading"\) return "กำลังอัปโหลด\.\.\.";/);
  assert.match(catalogJsSource, /if \(status === "done"\) return "สำเร็จ";/);
  assert.match(catalogJsSource, /if \(status === "error"\) return "ล้มเหลว";/);
  assert.match(catalogJsSource, /function galleryQueueThumbHtml\(queued\)/);
  const thumbMatch = catalogJsSource.match(/function galleryQueueThumbHtml\(queued\)[\s\S]*?\n}\n/);
  assert.ok(thumbMatch, "galleryQueueThumbHtml function not found");
  assert.match(thumbMatch[0], /asc-gallery-thumb-status-\$\{queued\.status\}/);
  assert.match(thumbMatch[0], /data-qact="retry"/);
  assert.match(thumbMatch[0], /data-qact="remove"/);

  const renderMatch = catalogJsSource.match(/function renderGalleryManager\(\)[\s\S]*?\n}\n/);
  assert.ok(renderMatch, "renderGalleryManager function not found");
  assert.match(renderMatch[0], /มีอยู่ \$\{activeCount\} \/ \$\{MAX_GALLERY_IMAGES\} รูป/);
  assert.match(renderMatch[0], /กำลังเพิ่มอีก \$\{inFlightCount\} รูป \(เสร็จแล้ว \$\{settledCount\}\/\$\{galleryUploadQueue\.length\}\)/);
});

test("bindGalleryActions wires retry/remove buttons (data-qact) in addition to the existing image actions (data-gact)", () => {
  const fnMatch = catalogJsSource.match(/function bindGalleryActions\(\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "bindGalleryActions function not found");
  assert.match(fnMatch[0], /qact === "retry"\) onGalleryRetry\(localId\);/);
  assert.match(fnMatch[0], /qact === "remove"\) onGalleryDismissFailed\(localId\);/);
});

test("closeCatalogModal refuses to close while a gallery upload is in flight instead of silently discarding it", () => {
  const fnMatch = catalogJsSource.match(/function closeCatalogModal\(\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "closeCatalogModal function not found");
  assert.match(fnMatch[0], /if \(galleryUploading\) \{/);
  assert.match(fnMatch[0], /กำลังอัปโหลดรูปภาพ กรุณารอให้เสร็จก่อนปิดหน้านี้/);
  assert.match(fnMatch[0], /return;/);
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
