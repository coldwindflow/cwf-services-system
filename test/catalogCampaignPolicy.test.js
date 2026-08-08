"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCatalogCampaignPolicy, safeCatalogCampaignPolicy } = require("../server/services/catalogCampaignPolicy");

test("campaign presentation accepts only bounded presets and catalog flow policy", () => {
  assert.deepEqual(validateCatalogCampaignPolicy({
    promotion_badge_text: "Weekend",
    promotion_theme_preset: "limited_time",
    promotion_effect_preset: "soft_glow",
    show_sale_countdown: true,
    promotion_supporting_text: "While slots last",
    booking_flow_policy: "scheduled_and_urgent",
  }), {
    promotion_badge_text: "Weekend", promotion_theme_preset: "limited_time",
    promotion_effect_preset: "soft_glow", show_sale_countdown: true,
    promotion_supporting_text: "While slots last", booking_flow_policy: "scheduled_and_urgent",
    old_client_defaulted: false,
  });
  assert.throws(() => validateCatalogCampaignPolicy({ promotion_badge_text: "<b>sale</b>" }), /INVALID_PROMOTION_TEXT/);
  assert.throws(() => validateCatalogCampaignPolicy({ promotion_theme_preset: "custom-css" }), /INVALID_CATALOG_CAMPAIGN_POLICY/);
});

test("missing or corrupt catalog policy fails closed", () => {
  assert.equal(validateCatalogCampaignPolicy({}).booking_flow_policy, "scheduled_only");
  assert.deepEqual(safeCatalogCampaignPolicy({ booking_flow_policy: "invented" }), {
    promotion_badge_text: null, promotion_theme_preset: "default", promotion_effect_preset: "none",
    show_sale_countdown: false, promotion_supporting_text: null, booking_flow_policy: "scheduled_only",
  });
});
