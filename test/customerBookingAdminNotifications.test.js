"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.js");
const adminReview = read("admin-review-v2.js");
const adminReviewHtml = read("admin-review-v2.html");
const scheduled = read("customer-app/modules/bookingScheduled.js");
const state = read("customer-app/modules/state.js");
const customerIndex = read("customer-app/index.html");
const customerSw = read("customer-app/sw.js");
const customerManifest = read("customer-app/manifest.webmanifest");

test("scheduled customer booking has durable request-key idempotency before reservation", () => {
  assert.match(index, /function deriveCustomerScheduledBookingToken\(requestKey\)/);
  assert.match(index, /scheduled_request_key/);
  assert.match(index, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(index, /WHERE booking_token=\$1[\s\S]*job_source='customer'[\s\S]*COALESCE\(booking_mode,'scheduled'\)='scheduled'/);
  assert.match(index, /replayed:\s*true/);
  assert.ok(index.indexOf("SELECT pg_advisory_xact_lock(hashtext($1))") < index.indexOf("reservePublicCustomerTechnician"));
});

test("scheduled customer app sends one request key and clears it on new booking reset", () => {
  assert.match(state, /scheduled_request_key:\s*""/);
  assert.match(scheduled, /function ensureScheduledRequestKey\(\)/);
  assert.match(scheduled, /root\.utils\.randomKey\(\)/);
  assert.match(scheduled, /scheduled_request_key:\s*ensureScheduledRequestKey\(\)/);
  assert.match(scheduled, /root\.state\.resetScheduledDraft\(\)/);
});

test("admin review queue includes urgent waiting rows as read-only without offer join duplication", () => {
  assert.match(index, /WAITING_URGENT_STATUS/);
  assert.match(index, /allow\.push\(WAITING_URGENT_STATUS\)/);
  assert.match(index, /pending_offer_count/);
  assert.match(index, /json_agg\(json_build_object/);
  assert.match(index, /AS items/);
  assert.match(index, /AS service_units/);
  assert.match(index, /AS admin_action_required/);
  assert.doesNotMatch(index, /FROM public\.jobs\s+j\s+JOIN public\.job_offers/);
});

test("admin review UI separates waiting urgent jobs and disables duplicate dispatch actions", () => {
  assert.match(adminReviewHtml, /<option value="waiting">/);
  assert.match(adminReview, /waiting:\s*REVIEW_WAITING_STATUS/);
  assert.match(adminReview, /function queueBucket\(row\)/);
  assert.match(adminReview, /waiting_technician/);
  assert.match(adminReview, /function isAdminActionAllowed\(row\)/);
  assert.match(adminReview, /\$\("btnDispatch"\)\.disabled = !actionAllowed/);
  assert.match(adminReview, /\$\("btnRebroadcast"\)\.disabled = !actionAllowed/);
  assert.match(adminReview, /\$\{actionAllowed \? "" : "disabled"\} onclick="rebroadcastOfferQuick/);
});

test("admin review polling is visible-only, single-flight, and auth-aware", () => {
  assert.match(adminReview, /const REVIEW_POLL_MS = 12000/);
  assert.match(adminReview, /REVIEW_QUEUE_LOAD_GUARD\.inFlight/);
  assert.match(adminReview, /function scheduleReviewQueuePolling\(\)/);
  assert.match(adminReview, /document\.hidden/);
  assert.match(adminReview, /visibilitychange/);
  assert.match(adminReview, /window\.addEventListener\("focus"/);
  assert.match(adminReview, /window\.addEventListener\("pageshow"/);
  assert.match(adminReview, /window\.addEventListener\("pagehide"/);
  assert.match(adminReview, /beforeunload/);
  assert.match(adminReview, /Number\(e\.status\) === 401 \|\| Number\(e\.status\) === 403/);
  assert.match(adminReview, /stopPollingForAuth\(\)/);
});

test("admin review new-job notification uses first-load baseline and one sound per job id", () => {
  assert.match(adminReview, /baselineReady/);
  assert.match(adminReview, /knownIds/);
  assert.match(adminReview, /notifiedIds/);
  assert.match(adminReview, /sessionStorage\.getItem\(REVIEW_NOTIFY_STORAGE_KEY\)/);
  assert.match(adminReview, /sessionStorage\.setItem\(REVIEW_NOTIFY_STORAGE_KEY/);
  assert.match(adminReview, /reason === "filter_change" \|\| reason === "manual_reload"/);
  assert.match(adminReview, /AudioContext \|\| window\.webkitAudioContext/);
  assert.match(adminReview, /__CWF_LAST_ADMIN_ALERT_SOUND_AT/);
  assert.match(adminReview, /review-card-new/);
  assert.match(adminReview, /document\.title = count > 0/);
});

test("admin/customer frontend cache versions are bumped for booking notification changes", () => {
  assert.match(adminReviewHtml, /admin-review-v2\.js\?v=20260707_customer_booking_notify_v1/);
  assert.match(customerIndex, /bookingScheduled\.js\?v=20260707_booking_admin_notify_v1/);
  assert.match(customerIndex, /state\.js\?v=20260707_booking_admin_notify_v1/);
  assert.match(customerSw, /const BUILD_ID = "20260707_booking_admin_notify_v1"/);
  assert.match(customerManifest, /20260707_booking_admin_notify_v1/);
});
