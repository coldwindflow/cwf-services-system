"use strict";

const PROMOTION_THEMES = new Set(["default", "premium", "limited_time", "new"]);
const PROMOTION_EFFECTS = new Set(["none", "soft_glow", "shimmer_border", "badge_pulse"]);
const BOOKING_FLOW_POLICIES = new Set(["scheduled_only", "scheduled_and_urgent"]);

class CatalogCampaignPolicyError extends Error {
  constructor(code, field) { super(code); this.name = "CatalogCampaignPolicyError"; this.code = code; this.field = field; }
}

function fail(code, field) { throw new CatalogCampaignPolicyError(code, field); }
function boundedPlainText(value, field, max) {
  if (value == null || String(value).trim() === "") return null;
  const result = String(value).trim();
  if (result.length > max || /[<>]/.test(result)) fail("INVALID_PROMOTION_TEXT", field);
  return result;
}
function enumValue(value, field, allowed, fallback) {
  const result = value == null || value === "" ? fallback : String(value).trim();
  if (!allowed.has(result)) fail("INVALID_CATALOG_CAMPAIGN_POLICY", field);
  return result;
}
function booleanValue(value, field, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "boolean") fail("INVALID_CATALOG_CAMPAIGN_POLICY", field);
  return value;
}

function validateCatalogCampaignPolicy(input = {}, { oldClient = false } = {}) {
  return {
    promotion_badge_text: boundedPlainText(input.promotion_badge_text, "promotion_badge_text", 80),
    promotion_theme_preset: enumValue(input.promotion_theme_preset, "promotion_theme_preset", PROMOTION_THEMES, "default"),
    promotion_effect_preset: enumValue(input.promotion_effect_preset, "promotion_effect_preset", PROMOTION_EFFECTS, "none"),
    show_sale_countdown: booleanValue(input.show_sale_countdown, "show_sale_countdown", false),
    promotion_supporting_text: boundedPlainText(input.promotion_supporting_text, "promotion_supporting_text", 200),
    // Missing values from old clients always fail closed. On PATCH callers merge
    // the existing row first, so an explicit persisted choice is retained.
    booking_flow_policy: enumValue(input.booking_flow_policy, "booking_flow_policy", BOOKING_FLOW_POLICIES, "scheduled_only"),
    old_client_defaulted: oldClient && input.booking_flow_policy == null,
  };
}

function safeCatalogCampaignPolicy(row = {}) {
  let value;
  try { value = validateCatalogCampaignPolicy(row, { oldClient: true }); }
  catch (_) { value = validateCatalogCampaignPolicy({}); }
  delete value.old_client_defaulted;
  return value;
}

module.exports = {
  PROMOTION_THEMES, PROMOTION_EFFECTS, BOOKING_FLOW_POLICIES,
  CatalogCampaignPolicyError, validateCatalogCampaignPolicy, safeCatalogCampaignPolicy,
};
