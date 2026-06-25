const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const storeSource = fs.readFileSync(path.join(__dirname, "..", "customer-app", "modules", "store.js"), "utf8");
const servicesSource = fs.readFileSync(path.join(__dirname, "..", "customer-app", "modules", "services.js"), "utf8");

test("store.js resolves the displayed/booked variant through one shared helper, never duplicated inline logic", () => {
  const helperDefMatches = storeSource.match(/function currentVariantDisplayItem\(/g) || [];
  assert.equal(helperDefMatches.length, 1, "currentVariantDisplayItem must be defined exactly once");

  const callSites = storeSource.match(/currentVariantDisplayItem\(item, variantSiblings\(item, allItems\)\)/g) || [];
  assert.ok(callSites.length >= 1, "the book-button click handler must resolve the booked item via the same helper used for price display");

  // Only one place may ever assign to the module-level selection — every other
  // read must go through currentVariantDisplayItem()/variantSiblings() instead
  // of re-deriving "which sibling is selected" locally.
  const assignments = storeSource.match(/selectedVariantItemId\s*=/g) || [];
  assert.equal(assignments.length, 3, "selectedVariantItemId must only ever be declared once, set by the variant-option click handler, and reset on new-detail-load -- not derived ad-hoc elsewhere");
});

test("services.js exposes a single catalogItemToCommerceDraft adapter, and store.js never builds a booking draft from booking_ac_type/booking_btu/booking_wash_variant by hand", () => {
  const adapterDefMatches = servicesSource.match(/function catalogItemToCommerceDraft\(/g) || [];
  assert.equal(adapterDefMatches.length, 1, "catalogItemToCommerceDraft must be the single legacy-bookable adapter");

  const storeCallSites = storeSource.match(/root\.services\.catalogItemToCommerceDraft\(/g) || [];
  assert.equal(storeCallSites.length, 2, "both the store grid's book button and the product detail's book button must route through the shared adapter");

  // store.js must never read these raw booking_* fields itself to build a draft;
  // only the shared adapter in services.js is allowed to interpret them.
  assert.ok(!/draft:\s*\{[^}]*booking_ac_type/.test(storeSource), "store.js must not hand-construct a booking draft from booking_ac_type");
  assert.ok(!storeSource.includes("createServiceLine("), "store.js must not call createServiceLine() directly -- only the shared adapter does");
});

test("catalogItemToCommerceDraft refuses to fabricate a draft when any bookable field is unsupported, routing the caller to contact-admin instead", () => {
  assert.match(servicesSource, /if \(!matchedAcType\) return null;/);
  assert.match(servicesSource, /if \(!matchedBtu\) return null;/);
  assert.match(servicesSource, /if \(!matchedWash\) return null;/);
});

test("product detail review summary shows an honest empty state instead of a fabricated (0) count", () => {
  const fn = storeSource.match(/function renderReviewsSectionBody\([\s\S]*?\n  \}/)[0];
  assert.ok(!/<span class="store-rating-count">\(\$\{count\}\)<\/span>\s*<\/div>/.test(fn), "must not unconditionally render a (0) count badge when there are no reviews yet");
  assert.match(fn, /hasReviews \? `<span class="store-rating-value">[\s\S]*?<\/span><span class="store-rating-count">\(\$\{count\}\)<\/span>` : `<span class="store-rating-count store-rating-count-empty">ยังไม่มีรีวิว<\/span>`/);
});
