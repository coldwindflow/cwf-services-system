"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(REPO_ROOT, "index.js"), "utf8");
const scheduledSrc = fs.readFileSync(path.join(REPO_ROOT, "customer-app", "modules", "bookingScheduled.js"), "utf8");
const urgentSrc = fs.readFileSync(path.join(REPO_ROOT, "customer-app", "modules", "bookingUrgent.js"), "utf8");

// The customer self-booking lanes must FAIL CLOSED: OFF unless the operator
// explicitly enables them in the environment. When off, /public/book answers
// 503 with a machine-readable code + LINE URL BEFORE any job work, so a closed
// lane can never create a job (and therefore never a duplicate).

test("both kill switches exist and default to OFF (fail closed)", () => {
  assert.match(indexSrc, /const ENABLE_CUSTOMER_SCHEDULED_BOOKING = envBool\("ENABLE_CUSTOMER_SCHEDULED_BOOKING", false\);/);
  assert.match(indexSrc, /const ENABLE_CUSTOMER_URGENT_BOOKING = envBool\("ENABLE_CUSTOMER_URGENT_BOOKING", false\);/);
});

test("scheduled gate rejects customer_app_v2 scheduled bookings with 503 + code + LINE url before any booking work", () => {
  const gate = indexSrc.match(/if \(bm === "scheduled" && clientApp === "customer_app_v2" && !ENABLE_CUSTOMER_SCHEDULED_BOOKING\) \{[\s\S]*?\n  \}/);
  assert.ok(gate, "scheduled kill-switch gate not found");
  assert.match(gate[0], /status\(503\)/);
  assert.match(gate[0], /SCHEDULED_BOOKING_DISABLED/);
  assert.match(gate[0], /line_url: CWF_LINE_CONTACT_URL/);
  // The gate must run before the request-key/idempotency/insert pipeline.
  const gateIndex = indexSrc.indexOf("SCHEDULED_BOOKING_DISABLED");
  const insertIndex = indexSrc.indexOf("deriveCustomerScheduledBookingToken(scheduledRequestKey)");
  assert.ok(gateIndex > 0 && insertIndex > 0 && gateIndex < insertIndex, "gate must precede booking pipeline");
});

test("urgent gate rejects customer urgent bookings with 503 + code + LINE url before the urgent handler", () => {
  const gate = indexSrc.match(/if \(isCustomerAppUrgentBook\(req\.body \|\| \{\}\)\) \{[\s\S]*?return handlePublicCustomerUrgentBook\(req, res\);\n  \}/);
  assert.ok(gate, "urgent branch not found");
  assert.match(gate[0], /!ENABLE_CUSTOMER_URGENT_BOOKING/);
  assert.match(gate[0], /URGENT_BOOKING_DISABLED/);
  assert.match(gate[0], /status\(503\)/);
  assert.match(gate[0], /line_url: CWF_LINE_CONTACT_URL/);
  // Reject BEFORE handlePublicCustomerUrgentBook is invoked.
  assert.ok(gate[0].indexOf("URGENT_BOOKING_DISABLED") < gate[0].indexOf("handlePublicCustomerUrgentBook(req, res)"));
});

test("admin booking is not gated by the customer kill switches", () => {
  // The flags are referenced only at the declaration (name appears twice on
  // that line: const + env var string) and at the single public customer gate.
  const scheduledUses = indexSrc.match(/ENABLE_CUSTOMER_SCHEDULED_BOOKING/g) || [];
  const urgentUses = indexSrc.match(/ENABLE_CUSTOMER_URGENT_BOOKING/g) || [];
  assert.equal(scheduledUses.length, 3); // declaration (x2) + gate
  assert.equal(urgentUses.length, 3); // declaration (x2) + gate
});

test("the LINE contact URL is configurable with a safe default", () => {
  assert.match(indexSrc, /const CWF_LINE_CONTACT_URL = String\(process\.env\.CWF_LINE_CONTACT_URL \|\| "https:\/\/lin\.ee\/fG1Oq7y"\)\.trim\(\);/);
});

// ---------- client fallback ----------

test("scheduled wizard shows the LINE hand-off (and hides retry) when the lane is disabled", () => {
  assert.match(scheduledSrc, /SCHEDULED_BOOKING_DISABLED/);
  assert.match(scheduledSrc, /disabled_line_url/);
  assert.match(scheduledSrc, /ติดต่อแอดมินทาง LINE/);
  // When disabled, the submit button is replaced (retrying a closed lane is pointless).
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
