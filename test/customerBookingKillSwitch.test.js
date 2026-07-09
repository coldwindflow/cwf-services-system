"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(REPO_ROOT, "index.js"), "utf8");
const scheduledSrc = fs.readFileSync(path.join(REPO_ROOT, "customer-app", "modules", "bookingScheduled.js"), "utf8");
const urgentSrc = fs.readFileSync(path.join(REPO_ROOT, "customer-app", "modules", "bookingUrgent.js"), "utf8");

// The /public/book source (handler body only) for gate-ordering assertions.
const bookHandler = indexSrc.slice(indexSrc.indexOf('app.post("/public/book"'));

test("both kill switches exist and default to OFF (fail closed)", () => {
  assert.match(indexSrc, /const ENABLE_CUSTOMER_SCHEDULED_BOOKING = envBool\("ENABLE_CUSTOMER_SCHEDULED_BOOKING", false\);/);
  assert.match(indexSrc, /const ENABLE_CUSTOMER_URGENT_BOOKING = envBool\("ENABLE_CUSTOMER_URGENT_BOOKING", false\);/);
});

test("the kill-switch gate keys off the canonical booking_mode, NOT the attacker-controlled client_app", () => {
  const gate = bookHandler.match(/const canonicalBookingMode = String\(booking_mode[\s\S]*?SCHEDULED_BOOKING_DISABLED[\s\S]*?\n  \}/);
  assert.ok(gate, "canonical kill-switch gate not found");
  // The whole gate block must not mention client_app — it is not a boundary.
  assert.doesNotMatch(gate[0], /client_app|clientApp/);
  assert.match(gate[0], /canonicalBookingMode === "urgent" && !ENABLE_CUSTOMER_URGENT_BOOKING/);
  assert.match(gate[0], /canonicalBookingMode === "scheduled" && !ENABLE_CUSTOMER_SCHEDULED_BOOKING/);
  assert.match(gate[0], /status\(503\)/);
  assert.match(gate[0], /line_url: CWF_LINE_CONTACT_URL/);
});

test("an unknown booking mode is rejected outright (no fall-through)", () => {
  assert.match(bookHandler, /canonicalBookingMode !== "scheduled" && canonicalBookingMode !== "urgent"/);
  assert.match(bookHandler, /code: "UNKNOWN_BOOKING_MODE"/);
});

test("the gate runs BEFORE urgent routing, request-key derivation, and any insert", () => {
  const gateIdx = bookHandler.indexOf("canonicalBookingMode");
  const urgentRouteIdx = bookHandler.indexOf("isCustomerAppUrgentBook(req.body");
  const tokenIdx = bookHandler.indexOf("deriveCustomerScheduledBookingToken(scheduledRequestKey)");
  const insertIdx = bookHandler.indexOf("INSERT INTO public.jobs");
  assert.ok(gateIdx > 0, "gate missing");
  assert.ok(gateIdx < urgentRouteIdx, "gate must precede urgent routing");
  assert.ok(gateIdx < tokenIdx, "gate must precede request-key derivation");
  assert.ok(gateIdx < insertIdx, "gate must precede the job insert");
});

test("each customer flag is referenced only at its declaration and the single gate (admin booking untouched)", () => {
  // Declaration line mentions the name twice (const + env string) + one gate use.
  assert.equal((indexSrc.match(/ENABLE_CUSTOMER_SCHEDULED_BOOKING/g) || []).length, 3);
  assert.equal((indexSrc.match(/ENABLE_CUSTOMER_URGENT_BOOKING/g) || []).length, 3);
});

test("the LINE contact URL is configurable with a safe default", () => {
  assert.match(indexSrc, /const CWF_LINE_CONTACT_URL = String\(process\.env\.CWF_LINE_CONTACT_URL \|\| "https:\/\/lin\.ee\/fG1Oq7y"\)\.trim\(\);/);
});

// ---------- client fallback ----------

test("scheduled wizard shows the LINE hand-off (and hides retry) when the lane is disabled", () => {
  assert.match(scheduledSrc, /SCHEDULED_BOOKING_DISABLED/);
  assert.match(scheduledSrc, /disabled_line_url/);
  assert.match(scheduledSrc, /ติดต่อแอดมินทาง LINE/);
  assert.match(scheduledSrc, /submit\.status === "error" && submit\.disabled_line_url \? "" : `<button type="button" class="primary-btn wizard-submit-btn"/);
});

test("urgent review shows the LINE hand-off (and hides confirm) when the lane is disabled", () => {
  assert.match(urgentSrc, /URGENT_BOOKING_DISABLED/);
  assert.match(urgentSrc, /disabled_line_url/);
  assert.match(urgentSrc, /ติดต่อแอดมินทาง LINE/);
  assert.match(urgentSrc, /flow\.disabled_line_url\s*\n?\s*\? `<a class="primary-btn line-fallback-btn"/);
});

test("cache-bust markers are present for the changed booking modules", () => {
  assert.match(scheduledSrc, /\[customer-booking\] launch-gate 20260708 loaded/);
  assert.match(urgentSrc, /\[customer-urgent\] launch-gate 20260708 loaded/);
});

// ---------- P0-5: /public/review write authorisation ----------

const reviewStart = indexSrc.indexOf('app.post("/public/review"');
const reviewHandler = indexSrc.slice(reviewStart, indexSrc.indexOf("\napp.", reviewStart + 10));

test("public review looks up by exactly one credential path — never `code OR token`", () => {
  assert.doesNotMatch(reviewHandler, /WHERE booking_code=\$1 OR booking_token=\$1/);
  assert.match(reviewHandler, /WHERE booking_token=\$1 LIMIT 1 FOR UPDATE/);
  assert.match(reviewHandler, /WHERE booking_code=\$1 LIMIT 1 FOR UPDATE/);
});

test("a tokened job cannot be reviewed via the legacy code+phone path (no downgrade)", () => {
  assert.match(reviewHandler, /const jobHasToken = Boolean\(String\(job\.booking_token \|\| ""\)\.trim\(\)\)/);
  assert.match(reviewHandler, /if \(jobHasToken\) deny\(\);/);
  // Legacy path requires a full exact phone match.
  assert.match(reviewHandler, /jobPhoneDigits !== phoneDigits/);
});

test("public review is dual rate-limited (IP + identifier) and returns no PII/token", () => {
  assert.match(reviewHandler, /publicReviewIpRateLimiter\.check\(trackingPrivacy\.clientIpKey\(req\)\)/);
  assert.match(reviewHandler, /publicReviewKeyRateLimiter\.check\(identifierKey\)/);
  assert.match(reviewHandler, /res\.json\(\{ success: true \}\)/);
  assert.doesNotMatch(reviewHandler, /avg_rating: avg/);
});

test("public review collapses all authz/eligibility failures to one generic error", () => {
  assert.match(reviewHandler, /GENERIC_REVIEW_ERROR/);
  assert.match(reviewHandler, /const deny = \(\) => \{[\s\S]*?e\.generic = true; throw e; \};/);
});
