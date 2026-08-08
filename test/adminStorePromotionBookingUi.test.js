"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("admin-add-v2.html", "utf8");
const js = fs.readFileSync("admin-add-v2.js", "utf8");
const booking = fs.readFileSync("server/services/booking/createBookingJob.js", "utf8");

test("Admin Add Job selects Store parents, quotes arbitrary mixed groups and retains ordinary catalog identity", () => {
  assert.match(html, /store_bookable_item_id/);
  assert.match(html, /store_service_bundle_key/);
  assert.match(js, /data-admin-bundle-quantity/);
  assert.match(js, /\/admin\/catalog\/service-package-bundles\/quote/);
  assert.match(js, /service_package_groups = selectedBundleGroups/);
  assert.match(js, /catalog_item_id: state\.selected_store_catalog_item_id/);
  assert.match(js, /admin_request_key/);
  assert.doesNotMatch(js, /data-admin-bundle-quantity[^\n]+max=/);
  assert.match(booking, /AND p\.catalog_item_id IS NULL/);
  assert.match(booking, /ADMIN_IDEMPOTENCY_KEY_REUSED/);
});
