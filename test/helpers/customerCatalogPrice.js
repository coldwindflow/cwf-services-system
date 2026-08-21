"use strict";

// Issue 318 test helper.
//
// Several customer-app UI suites fake `root.utils` with a small literal
// ({ escapeHtml, formatBaht, icon, stateBox }). Since the catalog price
// resolver moved into utils.js, those fakes have to provide it too — and
// re-typing the logic in six stubs would recreate exactly the duplication this
// issue removed. So the fakes borrow the REAL implementation instead.
//
// Not named *.test.js on purpose: `npm test` globs test/*.test.js, so this file
// is a helper module, never a suite.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let cached = null;

/** The real catalog price helpers, loaded once from the shipped utils module. */
function catalogPriceHelpers() {
  if (cached) return cached;
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "customer-app", "modules", "utils.js"), "utf8");
  const context = {
    window: { CWFCustomerAppV2: {} },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    console: { info() {}, warn() {} },
    location: { hash: "" },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context);
  const utils = context.window.CWFCustomerAppV2.utils;
  cached = {
    catalogStartingPrice: utils.catalogStartingPrice,
    catalogPriceIsAsk: utils.catalogPriceIsAsk,
    catalogPriceLabel: utils.catalogPriceLabel,
    catalogPriceUnitLabel: utils.catalogPriceUnitLabel,
  };
  return cached;
}

module.exports = { catalogPriceHelpers };
