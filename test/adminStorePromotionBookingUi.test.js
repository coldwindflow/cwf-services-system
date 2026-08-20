"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("admin-add-v2.html", "utf8");
const js = fs.readFileSync("admin-add-v2.js", "utf8");
const booking = fs.readFileSync("server/services/booking/createBookingJob.js", "utf8");
const policy = fs.readFileSync("server/services/booking/catalogBookingPolicy.js", "utf8");
const guard = fs.readFileSync("server/services/booking/adminStorePromotionPolicy.js", "utf8");
const routes = fs.readFileSync("server/routes/admin/adminBookings.js", "utf8");

test("Admin Add Job selects Store parents, quotes arbitrary mixed groups and retains ordinary catalog identity", () => {
  assert.match(html, /store_bookable_item_id/);
  assert.match(html, /store_service_bundle_key/);
  assert.match(js, /data-admin-bundle-quantity/);
  assert.match(js, /\/admin\/catalog\/service-package-bundles\/quote/);
  assert.match(js, /service_package_groups = selectedBundleGroups/);
  assert.match(js, /catalog_item_id: state\.selected_store_catalog_item_id/);
  assert.match(js, /el\("job_type"\)\.value = item\.job_category \|\| ""/);
  assert.doesNotMatch(js, /el\("job_type"\)\.value = item\.booking_job_type/);
  assert.match(js, /admin_request_key/);
  assert.doesNotMatch(js, /data-admin-bundle-quantity[^\n]+max=/);
  assert.match(booking, /AND p\.catalog_item_id IS NULL/);
  assert.match(booking, /ADMIN_IDEMPOTENCY_KEY_REUSED/);
  assert.match(routes, /\/admin\/catalog-booking-preview/);
  assert.match(js, /\/admin\/catalog-booking-preview/);
  assert.match(js, /applySelectedStoreFlowPolicy/);
  assert.match(js, /urgent\.disabled = !!blocked/);
  assert.match(js, /state\.service_lines = \[\]/);
  assert.match(js, /state\.selected_items = \[\]/);
  assert.match(js, /if \(state\.selected_store_catalog_item_id\)[\s\S]*?delete payload\.services/);
  assert.match(booking, /validateAdminStorePromotionRequest/);
  assert.match(booking, /buildCatalogBookingItem/);
  assert.match(booking, /buildCatalogBookingPayload/);
  assert.match(booking, /CATALOG_STACKING_UNSUPPORTED/);
  assert.match(policy, /ci\.job_category AS booking_job_type/);
  assert.match(policy, /exact_total/);
  assert.match(guard, /STORE_PROMOTION_STACKING_UNSUPPORTED/);
  assert.match(booking, /pricing\.total_exact/);
  assert.match(booking, /total_exact: pricing\.total_exact/);
  assert.match(js, /state\.exact_total = String\(quote\.exact_total/);
  assert.match(js, /state\.exact_total \|\| fmtMoney/);
});

test("Admin Add Job runtime uses the deploy-safe Issue 307 asset URL", () => {
  assert.match(html, /admin-add-v2\.js\?v=20260820_issue310_package_minimum_quantity_v1/);
  assert.doesNotMatch(html, /admin-add-v2\.js\?v=20260809_issue267_catalog_flow_v9/);
  assert.doesNotMatch(html, /admin-add-v2\.js\?v=20260809_issue267_catalog_flow_v2/);
});

test("Admin Store bundle quote ignores stale responses and refreshes the authoritative summary", () => {
  const preview = js.match(/async function previewServiceBundle\(\)[\s\S]*?\n}\n/)[0];
  const invalidate = js.match(/function invalidateServicePackagePreview\([\s\S]*?\n}\n/)[0];
  assert.match(js, /service_bundle_quote_request_id: 0/);
  assert.match(preview, /const requestId = \+\+state\.service_bundle_quote_request_id/);
  assert.match(preview, /requestId !== state\.service_bundle_quote_request_id \|\| fingerprint !== bundleFingerprint\(\)/);
  assert.match(preview, /state\.service_bundle_quote_fingerprint = fingerprint/);
  assert.match(preview, /await refreshPreview\(\)/);
  assert.match(invalidate, /state\.service_bundle_quote_request_id \+= 1/);
  assert.match(invalidate, /const legacySelected =/);
  assert.match(invalidate, /panel\.style\.display = legacySelected/);
});
