"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const trackingPrivacy = require("../server/services/public/trackingPrivacy");

const REPO_ROOT = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(REPO_ROOT, "index.js"), "utf8");
const docsSrc = fs.readFileSync(path.join(REPO_ROOT, "server", "routes", "docs.js"), "utf8");
const trackingClientSrc = fs.readFileSync(path.join(REPO_ROOT, "customer-app", "modules", "tracking.js"), "utf8");

// ---------- access level ----------

test("only the exact booking_token grants full access — booking_code and near-misses do not", () => {
  const row = { booking_token: "a1b2c3d4e5f6", booking_code: "CWFABCDEFG" };
  assert.equal(trackingPrivacy.isFullAccessQuery("a1b2c3d4e5f6", row), true);
  assert.equal(trackingPrivacy.isFullAccessQuery("CWFABCDEFG", row), false);
  assert.equal(trackingPrivacy.isFullAccessQuery("a1b2c3d4e5f", row), false);
  assert.equal(trackingPrivacy.isFullAccessQuery("", row), false);
  assert.equal(trackingPrivacy.isFullAccessQuery("a1b2c3d4e5f6", { booking_code: "CWFABCDEFG" }), false);
});

// ---------- redaction ----------

function samplePayload() {
  return {
    access_level: "code",
    job_id: 42,
    booking_code: "CWFABCDEFG",
    booking_token: "a1b2c3d4e5f6",
    customer_name: "คุณทดสอบ",
    customer_phone: "0812345678",
    address_text: "99/1 หมู่บ้านทดสอบ ซอยลึกมาก ถนนยาว แขวงหนึ่ง เขตสอง กทม 10250",
    maps_url: "https://maps.app.goo.gl/abc",
    gps_latitude: 13.75,
    gps_longitude: 100.5,
    receipt_url: "https://host/docs/receipt/42?key=a1b2c3d4e5f6",
    technician: { username: "tech1", full_name: "ช่าง หนึ่ง", phone: "0899999999" },
    technician_team: [{ username: "tech1", phone: "0899999999" }, { username: "tech2", phone: "0888888888" }],
    job_status: "รอดำเนินการ",
  };
}

test("booking_code lookups get masked PII: no token echo, masked phone, shortened address, no GPS/maps/receipt", () => {
  const original = samplePayload();
  const redacted = trackingPrivacy.redactPublicTrackPayload(original);

  assert.equal(redacted.booking_token, null); // never escalate code -> token
  assert.equal(redacted.customer_phone, "•••• 5678");
  assert.ok(redacted.address_text.length < original.address_text.length);
  assert.ok(redacted.address_text.endsWith("…"));
  assert.equal(redacted.maps_url, null);
  assert.equal(redacted.gps_latitude, null);
  assert.equal(redacted.gps_longitude, null);
  assert.equal(redacted.receipt_url, null);
  assert.equal(redacted.technician.phone, null);
  assert.ok(redacted.technician_team.every((m) => m.phone === null));
  assert.equal(redacted.access_level, "code");

  // Non-PII stays intact so the tracking page still works.
  assert.equal(redacted.booking_code, "CWFABCDEFG");
  assert.equal(redacted.job_status, "รอดำเนินการ");
  assert.equal(redacted.customer_name, "คุณทดสอบ");

  // The input object must never be mutated.
  assert.equal(original.booking_token, "a1b2c3d4e5f6");
  assert.equal(original.customer_phone, "0812345678");
  assert.equal(original.technician.phone, "0899999999");
});

test("maskPhone and shortenAddress handle empty/short values safely", () => {
  assert.equal(trackingPrivacy.maskPhone(""), null);
  assert.equal(trackingPrivacy.maskPhone(null), null);
  assert.equal(trackingPrivacy.maskPhone("08-1234-5678"), "•••• 5678");
  assert.equal(trackingPrivacy.shortenAddress("สั้น"), "สั้น");
  assert.equal(trackingPrivacy.shortenAddress(""), "");
});

// ---------- rate limiter ----------

test("rate limiter allows up to max per window, then answers 429 with retry_after, and resets next window", () => {
  let t = 0;
  const limiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 3, now: () => t });
  assert.equal(limiter.check("ip1").allowed, true);
  assert.equal(limiter.check("ip1").allowed, true);
  assert.equal(limiter.check("ip1").allowed, true);
  const blocked = limiter.check("ip1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retry_after_s >= 1);
  // Another client is unaffected.
  assert.equal(limiter.check("ip2").allowed, true);
  // Window rolls over -> allowed again.
  t = 60001;
  assert.equal(limiter.check("ip1").allowed, true);
});

test("rate limiter caps its key map (LRU) so it cannot grow without bound", () => {
  const limiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 5, maxKeys: 100 });
  for (let i = 0; i < 500; i += 1) limiter.check(`ip-${i}`);
  assert.ok(limiter._size() <= 100);
});

test("clientIpKey prefers the first X-Forwarded-For hop", () => {
  assert.equal(
    trackingPrivacy.clientIpKey({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, ip: "9.9.9.9" }),
    "1.2.3.4"
  );
  assert.equal(trackingPrivacy.clientIpKey({ headers: {}, ip: "9.9.9.9" }), "9.9.9.9");
});

// ---------- wiring contracts (index.js / docs.js / client) ----------

test("/public/track is rate-limited and answers with the redacted payload for code lookups", () => {
  assert.match(indexSrc, /publicTrackRateLimiter\.check\(trackingPrivacy\.clientIpKey\(req\)\)/);
  assert.match(indexSrc, /const fullAccess = trackingPrivacy\.isFullAccessQuery\(q, row\);/);
  assert.match(indexSrc, /res\.json\(fullAccess \? trackPayload : trackingPrivacy\.redactPublicTrackPayload\(trackPayload\)\);/);
});

test("/public/urgent-status is rate-limited", () => {
  assert.match(indexSrc, /publicUrgentStatusRateLimiter\.check\(trackingPrivacy\.clientIpKey\(req\)\)/);
});

test("booking codes come from a CSPRNG, not Math.random", () => {
  const fn = indexSrc.match(/function makeRandomBookingCode\(\)[\s\S]*?\n}/);
  assert.ok(fn, "makeRandomBookingCode not found");
  assert.match(fn[0], /crypto\.randomInt\(/);
  assert.doesNotMatch(fn[0], /Math\.random/);
});

test("receipt links embed the booking_token key and are only issued on full access", () => {
  assert.match(indexSrc, /\/docs\/receipt\/\$\{row\.job_id\}\?key=\$\{encodeURIComponent\(row\.booking_token\)\}/);
});

test("job documents (receipt/e-slip) require the booking_token key or an admin session and answer 404 otherwise", () => {
  assert.match(docsSrc, /async function canViewJobDoc\(req, data\)/);
  assert.match(docsSrc, /trackingPrivacy\.timingSafeEqualStr\(key, String\(token\)\)/);
  // Both PII documents are gated.
  const receiptRoute = docsSrc.match(/router\.get\("\/docs\/receipt\/:job_id"[\s\S]*?\n  \}\);/);
  const eslipRoute = docsSrc.match(/router\.get\("\/docs\/eslip\/:job_id"[\s\S]*?\n  \}\);/);
  assert.ok(receiptRoute && /canViewJobDoc/.test(receiptRoute[0]), "receipt route not gated");
  assert.ok(eslipRoute && /canViewJobDoc/.test(eslipRoute[0]), "eslip route not gated");
  // Denial mirrors "not found" so the route is not an existence oracle.
  assert.match(receiptRoute[0], /status\(404\)/);
  // Rate limited too.
  assert.match(docsSrc, /function docsRateLimited\(req, res\)/);
});

test("the customer app only builds receipt fallback links when it holds the booking_token", () => {
  assert.match(trackingClientSrc, /data\.booking_token\s*\?\s*`\/docs\/receipt\/\$\{encodeURIComponent\(data\.job_id\)\}\?key=/);
  assert.doesNotMatch(trackingClientSrc, /`\/docs\/receipt\/\$\{encodeURIComponent\(data\.job_id\)\}`/);
});
