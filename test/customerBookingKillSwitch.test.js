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
  const urgentRouteIdx = bookHandler.indexOf("return handlePublicCustomerUrgentBook");
  const tokenIdx = bookHandler.indexOf("deriveCustomerScheduledBookingToken(scheduledRequestKey)");
  const insertIdx = bookHandler.indexOf("INSERT INTO public.jobs");
  assert.ok(gateIdx > 0, "gate missing");
  assert.ok(gateIdx < urgentRouteIdx, "gate must precede urgent routing");
  assert.ok(gateIdx < tokenIdx, "gate must precede request-key derivation");
  assert.ok(gateIdx < insertIdx, "gate must precede the job insert");
});

// ---------- client_app is NOT a security boundary (canonical protections) ----

test("urgent routing keys off the canonical booking_mode, not client_app", () => {
  // Every public urgent request must reach the customer-safe adapter on mode
  // alone — an unauthenticated caller must not be able to drop/forge client_app
  // to skip the sanitiser and hit the raw urgent engine.
  assert.match(bookHandler, /if \(canonicalBookingMode === "urgent"\) \{\s*\n\s*return handlePublicCustomerUrgentBook\(req, res\);/);
  assert.doesNotMatch(bookHandler, /if \(isCustomerAppUrgentBook\(req\.body/);
});

test("scheduled request-key/idempotency is required for ALL scheduled bookings, not gated on client_app", () => {
  // The key is read + required on the canonical booking_mode, never client_app.
  assert.match(bookHandler, /const scheduledRequestKey = bm === "scheduled"\s*\n\s*\? String\(scheduled_request_key/);
  assert.match(bookHandler, /if \(bm === "scheduled" && !validScheduledRequestKey\) \{/);
  assert.doesNotMatch(bookHandler, /clientApp === "customer_app_v2" && !validScheduledRequestKey/);
  // The idempotency replay itself keys only off the request key, not client_app.
  assert.match(bookHandler, /if \(scheduledRequestKey && scheduledDeterministicToken\) \{/);
});

test("scheduled availability + reservation no longer depend on client_app", () => {
  // The customer availability check and the technician reservation gate on the
  // canonical scheduled mode, so a forged/omitted client_app cannot downgrade
  // to a weaker (or missing) capacity path.
  assert.doesNotMatch(bookHandler, /bm === "scheduled" && clientApp === "customer_app_v2"/);
});

test("scheduled idempotency is payload-bound and checked before the availability gate", () => {
  // The pre-flight replay lookup must run before the "slot full" availability
  // check, so a genuine retry replays even though its own job now holds the slot.
  const preflightIdx = bookHandler.indexOf("Payload-bound idempotency (checked BEFORE the availability gate)");
  const availabilityIdx = bookHandler.indexOf("customerAvailability.hasAvailableStart");
  assert.ok(preflightIdx > 0, "pre-flight idempotency block missing");
  assert.ok(preflightIdx < availabilityIdx, "idempotency replay must precede the availability gate");
  // Reusing a key with a different payload is a 409, never a silent old-job return.
  assert.match(bookHandler, /code: "IDEMPOTENCY_KEY_REUSED"/);
  // Both the pre-flight and the in-transaction race path use the SAME full match.
  assert.equal((bookHandler.match(/scheduledPayloadMatchesExisting\(pool, /g) || []).length, 2);
});

test("idempotency payload comparison covers every canonical material field", () => {
  // Scalars persisted on the jobs row.
  assert.match(indexSrc, /function scheduledScalarsMatch\(jobRow, incoming\)/);
  for (const field of ["customer_phone", "customer_name", "address_text", "maps_url", "job_zone", "job_type", "customer_note", "allow_time_proposal", "duration_min"]) {
    assert.match(indexSrc, new RegExp(field), `scalar comparison must include ${field}`);
  }
  // The service composition (AC type/variant/BTU/qty/price) is compared via the
  // canonical job_items signature, built with the SAME normalizer as a real booking.
  assert.match(indexSrc, /function bookingLineSignature\(rows\)/);
  assert.match(indexSrc, /loadStoredBookingLineSignature/);
  assert.match(indexSrc, /buildIncomingBookingLineSignature/);
  assert.match(indexSrc, /customerPricingHelpers\.buildCustomerServiceLineItemsFromPayload/);
  // The full match = scalars + line signature.
  assert.match(indexSrc, /async function scheduledPayloadMatchesExisting\(db, jobRow, incoming\)/);
  assert.match(indexSrc, /storedSig === incomingSig/);
  // The pre-flight replay lookup still precedes the availability gate.
  const preflightIdx = bookHandler.indexOf("Payload-bound idempotency (checked BEFORE the availability gate)");
  const availabilityIdx = bookHandler.indexOf("customerAvailability.hasAvailableStart");
  assert.ok(preflightIdx > 0 && preflightIdx < availabilityIdx, "idempotency replay must precede the availability gate");
});

test("legacy customer.html is redirect-only and contains no booking implementation", () => {
  const customerHtml = fs.readFileSync(path.join(REPO_ROOT, "customer.html"), "utf8");
  assert.match(customerHtml, /location\.replace\("\/customer-app\/index\.html#booking"\)/);
  assert.match(customerHtml, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(customerHtml, /scheduled_request_key|\/public\/book|sessionStorage|booking form/i);
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
