"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  PromotionPolicyAdminError,
  normalizePolicy,
} = require("../server/services/packages/promotionPolicyAdminService");

function valid(overrides = {}) {
  return {
    pricing_strategy: "total_quantity_tier_plus_unit_modifiers",
    selection_mode: "multi_variant",
    maximum_total_quantity: 4,
    payment_mode: "book_now",
    warranty_days: 60,
    is_active: true,
    is_customer_visible: true,
    variants: [
      { package_key: "small", service_level_key: "standard", service_level_label: "STANDARD", unit_price_modifier: "0" },
      { package_key: "large", service_level_key: "standard", service_level_label: "STANDARD", unit_price_modifier: "100" },
    ],
    ...overrides,
  };
}

test("Issue #329 promotion policy normalizes generic pricing/payment/warranty fields", () => {
  const value = normalizePolicy(valid());
  assert.equal(value.pricing_strategy, "total_quantity_tier_plus_unit_modifiers");
  assert.equal(value.selection_mode, "multi_variant");
  assert.equal(value.maximum_total_quantity, 4);
  assert.equal(value.payment_mode, "book_now");
  assert.equal(value.warranty_days, 60);
  assert.equal(value.variants[1].unit_price_modifier, "100.00");
});

test("Issue #329 promotion policy accepts prepaid_full as a generic configuration value", () => {
  const value = normalizePolicy(valid({ payment_mode: "prepaid_full" }));
  assert.equal(value.payment_mode, "prepaid_full");
});

test("Issue #329 promotion policy rejects invalid max, warranty, modifier, duplicates and enums", () => {
  const cases = [
    valid({ maximum_total_quantity: 100 }),
    valid({ warranty_days: 0 }),
    valid({ payment_mode: "cash_later" }),
    valid({ pricing_strategy: "air_reset" }),
    valid({ variants: [{ package_key: "x", unit_price_modifier: "-1" }] }),
    valid({ variants: [{ package_key: "x" }, { package_key: "x" }] }),
  ];
  for (const payload of cases) {
    assert.throws(() => normalizePolicy(payload), (error) => error instanceof PromotionPolicyAdminError);
  }
});

test("Admin Store loads generic promotion-policy extension after the stable editor", () => {
  const html = fs.readFileSync("admin-store-catalog.html", "utf8");
  const js = fs.readFileSync("admin-store-promotion-policy-extension.js", "utf8");
  assert.match(html, /admin-store-catalog\.js[^\n]+admin-store-promotion-policy-extension\.js/s);
  assert.match(js, /bm_pricing_strategy/);
  assert.match(js, /bm_payment_mode/);
  assert.match(js, /bm_warranty_days/);
  assert.match(js, /unit_price_modifier/);
  assert.match(js, /payload\.is_active = false/);
  assert.match(js, /payload\.is_customer_visible = false/);
  assert.match(js, /\/promotion-policy/);
});

test("Admin promotion-policy routes are permission guarded", () => {
  const source = fs.readFileSync("server/routes/admin/storeServicePackageCatalog.js", "utf8");
  assert.match(source, /\/promotion-policy\", requireAdminSession/);
  assert.match(source, /policyService\.get/);
  assert.match(source, /policyService\.update/);
});
