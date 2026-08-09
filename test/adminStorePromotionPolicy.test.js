"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAdminStorePromotionRequest } = require("../server/services/booking/adminStorePromotionPolicy");

const key = "admin_store_request_123456";

test("manual and legacy Admin booking contracts remain unchanged", () => {
  assert.deepEqual(validateAdminStorePromotionRequest({ services: [{ job_type: "wash" }] }), { kind: null });
  assert.deepEqual(validateAdminStorePromotionRequest({ catalog_item_id: 41 }, { createdBySource: "customer" }), { kind: null });
});

test("ordinary Store promotion requires idempotency and rejects unsupported stacking", () => {
  assert.throws(() => validateAdminStorePromotionRequest({ catalog_item_id: 41 }), /MISSING_ADMIN_REQUEST_KEY/);
  assert.deepEqual(validateAdminStorePromotionRequest({ catalog_item_id: 41, admin_request_key: key }), { kind: "bookable" });
  for (const conflict of [
    { promotion_id: 7 }, { override_price: "1.00" }, { override_duration_min: 10 },
    { items: [{ item_id: 2, qty: 1 }] }, { services: [{}] }, { service_lines: [{}] },
  ]) {
    assert.throws(() => validateAdminStorePromotionRequest({ catalog_item_id: 41, admin_request_key: key, ...conflict }), /STORE_PROMOTION_STACKING_UNSUPPORTED/);
  }
});

test("composed Store package accepts only its authoritative groups", () => {
  assert.deepEqual(validateAdminStorePromotionRequest({ service_package_groups: [{ package_key: "group", quantity: 2 }],
    admin_request_key: key }), { kind: "service_package" });
  for (const conflict of [
    { catalog_item_id: 41 }, { service_package_key: "legacy" }, { service_package_tier_key: "tier" },
    { services: [{}] }, { service_lines: [{}] }, { promotion_id: 7 }, { override_price: 1 }, { items: [{}] },
  ]) {
    assert.throws(() => validateAdminStorePromotionRequest({ service_package_groups: [], admin_request_key: key, ...conflict }), /STORE_PROMOTION_STACKING_UNSUPPORTED/);
  }
});
