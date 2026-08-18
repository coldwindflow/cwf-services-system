"use strict";

class AdminStorePromotionPolicyError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = "AdminStorePromotionPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function present(value) { return value != null && String(value).trim() !== ""; }
function positive(value) { return Number(value || 0) > 0; }

function validateAdminStorePromotionRequest(body = {}, { createdBySource = "admin" } = {}) {
  if (createdBySource !== "admin") return { kind: null };
  const composite = Array.isArray(body.service_package_groups);
  const ordinary = !composite && present(body.catalog_item_id);
  if (!composite && !ordinary) return { kind: null };
  if (!present(body.admin_request_key)) throw new AdminStorePromotionPolicyError("MISSING_ADMIN_REQUEST_KEY");

  const commonConflict = present(body.promotion_id) || positive(body.override_price)
    || positive(body.override_duration_min) || (Array.isArray(body.items) && body.items.length > 0);
  if (commonConflict) throw new AdminStorePromotionPolicyError("STORE_PROMOTION_STACKING_UNSUPPORTED");

  if (composite) {
    if (present(body.catalog_item_id) || present(body.service_package_key) || present(body.service_package_tier_key)
        || (Array.isArray(body.services) && body.services.length > 0)
        || (Array.isArray(body.service_lines) && body.service_lines.length > 0)) {
      throw new AdminStorePromotionPolicyError("STORE_PROMOTION_STACKING_UNSUPPORTED");
    }
    return { kind: "service_package" };
  }

  const services = Array.isArray(body.services) ? body.services
    : (Array.isArray(body.service_lines) ? body.service_lines : []);
  if (services.length > 0) throw new AdminStorePromotionPolicyError("STORE_PROMOTION_STACKING_UNSUPPORTED");
  return { kind: "bookable" };
}

module.exports = { AdminStorePromotionPolicyError, validateAdminStorePromotionRequest };
