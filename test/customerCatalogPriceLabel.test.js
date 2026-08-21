"use strict";

// Issue 318 - a Store service-package bundle must advertise its starting price,
// not "สอบถามราคา".
//
// A bundle parent is inserted with base_price = 0 and unit_label = 'package'
// (storeServicePackageCatalogService), and carries its real prices on its tiers.
// Three customer surfaces each had their own price helper:
//   - ui.js catalogDisplayPrice   -> display/active/base only  => "สอบถามราคา"
//   - advisor.js priceText        -> display/active/base only  => "สอบถามราคา"
//   - store.js effectiveSalePrice -> package-aware             => "เริ่ม 699 บาท"
// so the same promotion showed a price on the Store page and "ask us" on the
// homepage and in the Smart Advisor. Fixing the two copies would have left the
// drift possible, so there is now exactly one resolver in utils.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// Load the real shipped utils module.
function loadUtils() {
  const context = {
    window: { CWFCustomerAppV2: {} },
    document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null },
    console: { info() {}, warn() {} },
    location: { hash: "" },
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(read("customer-app/modules/utils.js"), context);
  return context.window.CWFCustomerAppV2.utils;
}

function bundle(overrides = {}) {
  return {
    item_id: 51, item_name: "Premium Day", booking_mode: "service_package",
    base_price: 0, display_price: 0, active_price: null, unit_label: "package",
    service_package_variants: [
      { package_key: "small", tiers: [
        { tier_key: "q1", fixed_total_price: "699.00", is_active: true },
        { tier_key: "q2", fixed_total_price: "1399.00", is_active: true },
      ] },
      { package_key: "large", tiers: [
        { tier_key: "q1", fixed_total_price: "899.00", is_active: true },
      ] },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

test("Issue 318: a package advertises its lowest active tier price, marked as a starting price", () => {
  const utils = loadUtils();
  const item = bundle();
  assert.deepEqual({ ...utils.catalogStartingPrice(item) }, { amount: 699, isFrom: true });
  assert.equal(utils.catalogPriceLabel(item), "เริ่ม 699 บาท");
  assert.equal(utils.catalogPriceIsAsk(item), false);
});

test("Issue 318: an inactive or unpriced tier never becomes the advertised price", () => {
  const utils = loadUtils();
  // a cheaper but DEACTIVATED tier must not be advertised
  const withInactive = bundle({ service_package_variants: [
    { package_key: "small", tiers: [
      { tier_key: "old", fixed_total_price: "199.00", is_active: false },
      { tier_key: "q1", fixed_total_price: "699.00", is_active: true },
    ] },
  ] });
  assert.equal(utils.catalogPriceLabel(withInactive), "เริ่ม 699 บาท");
  // zero / negative / non-numeric tier prices are ignored, never shown as free
  const junk = bundle({ service_package_variants: [
    { package_key: "small", tiers: [
      { tier_key: "a", fixed_total_price: "0.00", is_active: true },
      { tier_key: "b", fixed_total_price: "-5.00", is_active: true },
      { tier_key: "c", fixed_total_price: "ฟรี", is_active: true },
      { tier_key: "d", fixed_total_price: "899.00", is_active: true },
    ] },
  ] });
  assert.equal(utils.catalogPriceLabel(junk), "เริ่ม 899 บาท");
});

test("Issue 318: a package with nothing sellable still says สอบถามราคา", () => {
  const utils = loadUtils();
  for (const variants of [[], [{ package_key: "x", tiers: [] }], [{ package_key: "x", tiers: [{ fixed_total_price: "0.00", is_active: true }] }]]) {
    const item = bundle({ service_package_variants: variants });
    assert.equal(utils.catalogPriceLabel(item), "สอบถามราคา");
    assert.equal(utils.catalogPriceIsAsk(item), true);
  }
  // and a malformed variants payload must not throw
  assert.equal(utils.catalogPriceLabel(bundle({ service_package_variants: null })), "สอบถามราคา");
  assert.equal(utils.catalogPriceLabel(bundle({ service_package_variants: [null, { tiers: null }] })), "สอบถามราคา");
});

test("Issue 318: ordinary catalog items keep their existing price behaviour exactly", () => {
  const utils = loadUtils();
  assert.equal(utils.catalogPriceLabel({ booking_mode: "bookable", display_price: 590, base_price: 0 }), "590 บาท");
  assert.equal(utils.catalogPriceLabel({ booking_mode: "bookable", display_price: 0, active_price: 480, base_price: 700 }), "480 บาท");
  assert.equal(utils.catalogPriceLabel({ booking_mode: "bookable", display_price: 0, active_price: 0, base_price: 700 }), "700 บาท");
  assert.equal(utils.catalogPriceLabel({ booking_mode: "contact_admin", base_price: 0 }), "สอบถามราคา");
  assert.equal(utils.catalogPriceLabel(null), "สอบถามราคา");
  assert.equal(utils.catalogPriceLabel(undefined), "สอบถามราคา");
  // no "เริ่ม" prefix outside packages - an exact price must not read as a range
  assert.doesNotMatch(utils.catalogPriceLabel({ booking_mode: "bookable", display_price: 590 }), /เริ่ม/);
});

test("Issue 318: a package shows no unit suffix, so the internal token 'package' never leaks", () => {
  const utils = loadUtils();
  assert.equal(utils.catalogPriceUnitLabel(bundle()), "");
  assert.equal(utils.catalogPriceUnitLabel({ booking_mode: "bookable", display_price: 590, unit_label: "เครื่อง" }), "เครื่อง");
  // an item with no published price shows no unit either
  assert.equal(utils.catalogPriceUnitLabel({ booking_mode: "bookable", base_price: 0, unit_label: "เครื่อง" }), "");
  assert.equal(utils.catalogPriceUnitLabel(null), "");
});

// ---------------------------------------------------------------------------
// every surface uses it
// ---------------------------------------------------------------------------

test("Issue 318: homepage cards, Smart Advisor and Store all resolve price through utils", () => {
  const ui = read("customer-app/modules/ui.js");
  const advisor = read("customer-app/modules/advisor.js");
  const store = read("customer-app/modules/store.js");

  assert.match(ui, /function catalogDisplayPrice\(item\) \{\s*\n\s*return root\.utils\.catalogPriceLabel\(item\);/);
  assert.match(advisor, /function priceText\(item\) \{\s*\n\s*return root\.utils\.catalogPriceLabel\(item\);/);
  assert.match(store, /function priceLabel\(item\) \{\s*\n\s*return root\.utils\.catalogPriceLabel\(item\);/);
  assert.match(store, /function effectiveSalePrice\(item\) \{[\s\S]*?root\.utils\.catalogStartingPrice\(item\)/);
  assert.match(store, /function priceIsAsk\(item\) \{\s*\n\s*return root\.utils\.catalogPriceIsAsk\(item\);/);

  // no surface may keep its own display/active/base-only copy
  for (const [name, source] of [["ui.js", ui], ["advisor.js", advisor], ["store.js", store]]) {
    assert.doesNotMatch(source, /display_price \?\? item\??\.?active_price/, `${name} still has a private price helper`);
  }
  // and no surface may hand-build the unit suffix from unit_label any more
  for (const [name, source] of [["ui.js", ui], ["store.js", store]]) {
    assert.doesNotMatch(source, /unit && !priceIsAsk\(item\)/, `${name} still appends unit_label directly`);
    assert.doesNotMatch(source, /item\.unit_label && price !== "สอบถามราคา"/, `${name} still appends unit_label directly`);
  }
});

test("Issue 318: the shared resolver is exported from utils", () => {
  const utils = read("customer-app/modules/utils.js");
  for (const name of ["catalogStartingPrice", "catalogPriceIsAsk", "catalogPriceLabel", "catalogPriceUnitLabel"]) {
    assert.match(utils, new RegExp(`^\\s{4}${name},$`, "m"), `${name} must be on root.utils`);
  }
  // utils.js loads before ui/advisor/store, so the helper is always available
  const index = read("customer-app/index.html");
  const order = ["modules/utils.js", "modules/advisor.js", "modules/ui.js", "modules/store.js"].map((file) => index.indexOf(file));
  assert.ok(order.every((position) => position > 0), "all four modules must be loaded");
  assert.ok(order[0] < order[1] && order[0] < order[2] && order[0] < order[3], "utils.js must load before its consumers");
});

test("Issue 318: the customer runtime is cache-busted and admin ids stay put", () => {
  const BUILD = "20260821_issue318_package_starting_price_v1";
  assert.match(read("customer-app/sw.js"), new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(read("customer-app/assets/customer-app.js"), new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(read("customer-app/index.html"), new RegExp(`modules/utils\\.js\\?v=${BUILD}`));
  assert.match(read("customer-app/manifest.webmanifest"), new RegExp(BUILD));
  assert.match(read("admin-add-v2.html"), /admin-add-v2\.js\?v=20260820_issue310_package_minimum_quantity_v1/);
});
