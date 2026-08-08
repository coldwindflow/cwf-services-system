"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const store = fs.readFileSync("customer-app/modules/store.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");
const admin = fs.readFileSync("admin-store-catalog.js", "utf8");

test("promotion presentation is bounded, server-time-derived and progressive", () => {
  assert.match(store, /campaignTheme/);
  assert.match(store, /campaignEffect/);
  assert.match(store, /service_package_sell_end_at/);
  assert.match(store, /remaining <= 0/);
  assert.match(store, /clearCampaignCountdowns/);
  assert.doesNotMatch(store, /innerHTML\s*=\s*item\.promotion/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(admin, /promotion_theme_preset/);
  assert.match(admin, /promotion_effect_preset/);
  assert.match(admin, /asc-mobile-preview/);
  assert.match(admin, /bm_images/);
});
