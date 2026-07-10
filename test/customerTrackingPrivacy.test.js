"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const trackingPrivacy = require("../server/services/public/trackingPrivacy");
const createDocumentRoutes = require("../server/routes/docs");

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

// ---------- redaction is an ALLOWLIST ----------

function richPayload() {
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
    job_status: "รอดำเนินการ",
    booking_mode: "scheduled",
    dispatch_mode: "normal",
    appointment_datetime: "2026-07-10T09:00:00+07:00",
    duration_min: 90,
    finished_at: null,
    technician_note: "ลูกค้าไม่อยู่บ้าน",
    technician: { username: "tech1", full_name: "ช่าง หนึ่ง", phone: "0899999999" },
    technician_team: [{ username: "tech1", phone: "0899999999" }],
    photos: [{ public_url: "https://x/y.jpg" }],
    units: [{ location_label: "ห้องนอน", checklist: [{ issue: "ตัน" }] }],
    cancel_reason: "ลูกค้ายกเลิก",
    review: { review_text: "ดีมาก" },
    customer_complaint: "ช้า",
  };
}

// Fields a booking_code lookup is ALLOWED to return — everything else must be absent.
const ALLOWED_CODE_KEYS = new Set([
  "access_level", "legacy_review_eligible", "booking_code", "job_status",
  "booking_mode", "dispatch_mode", "appointment_datetime", "duration_min",
  "travel_started_at", "checkin_at", "started_at", "finished_at", "canceled_at",
  "customer_phone",
]);

test("booking_code redaction returns ONLY the allowlisted keys (blacklist-proof)", () => {
  const redacted = trackingPrivacy.redactPublicTrackPayload(richPayload());
  for (const key of Object.keys(redacted)) {
    assert.ok(ALLOWED_CODE_KEYS.has(key), `unexpected key leaked to code lookup: ${key}`);
  }
  // Spot-check the sensitive ones are truly gone.
  for (const gone of ["booking_token", "customer_name", "address_text", "maps_url",
    "gps_latitude", "gps_longitude", "job_id", "technician_note", "technician",
    "technician_team", "photos", "units", "cancel_reason", "review", "customer_complaint", "receipt_url"]) {
    assert.equal(redacted[gone], undefined, `${gone} must not be present for a code lookup`);
  }
  assert.equal(redacted.access_level, "code");
  assert.equal(redacted.customer_phone, "•••• 5678"); // masked confirmation aid
  assert.equal(redacted.job_status, "รอดำเนินการ");
  assert.equal(redacted.booking_code, "CWFABCDEFG");
});

test("a brand-new sensitive field added upstream does NOT leak through code redaction", () => {
  const payload = { ...richPayload(), some_future_pii_field: "secret home code 1234" };
  const redacted = trackingPrivacy.redactPublicTrackPayload(payload);
  assert.equal(redacted.some_future_pii_field, undefined);
});

test("legacy_review_eligible passes through as a non-sensitive boolean (default false, no token leak)", () => {
  // Absent upstream -> false, never undefined/truthy by accident.
  assert.equal(trackingPrivacy.redactPublicTrackPayload(richPayload()).legacy_review_eligible, false);
  // Explicit true is surfaced so the UI can offer the legacy phone form...
  const eligible = trackingPrivacy.redactPublicTrackPayload({ ...richPayload(), legacy_review_eligible: true });
  assert.equal(eligible.legacy_review_eligible, true);
  // ...but it must never carry the token alongside it.
  assert.equal(eligible.booking_token, undefined);
});

test("maskPhone handles empty/short values safely", () => {
  assert.equal(trackingPrivacy.maskPhone(""), null);
  assert.equal(trackingPrivacy.maskPhone(null), null);
  assert.equal(trackingPrivacy.maskPhone("08-1234-5678"), "•••• 5678");
});

// ---------- rate limiter ----------

test("rate limiter allows up to max per window, then 429 with retry_after, then resets", () => {
  let t = 0;
  const limiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 3, now: () => t });
  assert.equal(limiter.check("ip1").allowed, true);
  assert.equal(limiter.check("ip1").allowed, true);
  assert.equal(limiter.check("ip1").allowed, true);
  const blocked = limiter.check("ip1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retry_after_s >= 1);
  assert.equal(limiter.check("ip2").allowed, true);
  t = 60001;
  assert.equal(limiter.check("ip1").allowed, true);
});

test("rate limiter caps its key map (LRU) so it cannot grow without bound", () => {
  const limiter = trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 5, maxKeys: 100 });
  for (let i = 0; i < 500; i += 1) limiter.check(`ip-${i}`);
  assert.ok(limiter._size() <= 100);
});

test("clientIpKey uses the framework-resolved req.ip and IGNORES raw X-Forwarded-For", () => {
  // req.ip is derived under the app's `trust proxy` setting; the raw header is
  // attacker-controlled and must not create a fresh identity.
  assert.equal(trackingPrivacy.clientIpKey({ ip: "203.0.113.7", headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }), "203.0.113.7");
  assert.equal(trackingPrivacy.clientIpKey({ headers: { "x-forwarded-for": "9.9.9.9" }, socket: { remoteAddress: "10.0.0.5" } }), "10.0.0.5");
  // Spoofing XFF cannot change the key when req.ip is stable.
  const a = trackingPrivacy.clientIpKey({ ip: "203.0.113.7", headers: { "x-forwarded-for": "1.1.1.1" } });
  const b = trackingPrivacy.clientIpKey({ ip: "203.0.113.7", headers: { "x-forwarded-for": "8.8.8.8" } });
  assert.equal(a, b);
});

// ---------- docs routes: mounted-router HTTP integration ----------

function docsFakePool(job) {
  return {
    async query(sql) {
      const s = String(sql);
      if (s.includes("FROM public.jobs WHERE job_id=$1")) return { rows: job ? [job] : [] };
      return { rows: [] }; // job_items, job_promotions, job_photos
    },
  };
}

function startDocsServer({ job, isAdmin = false } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createDocumentRoutes({
    pool: docsFakePool(job),
    isAdminRequest: async () => isAdmin,
    docsRateLimiter: trackingPrivacy.createPublicLookupRateLimiter({ windowMs: 60000, max: 50 }),
    accountingOwnerSignaturePublicUrl: () => "",
    accountingSignaturePublicUrl: () => "",
    accountingOwnerSignerName: () => "",
    accountingOwnerSignerPosition: () => "",
  }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const durl = (s) => `http://127.0.0.1:${s.address().port}`;
const JOB = { job_id: 7, booking_code: "CWFJOB7", booking_token: "tok_secret_77", customer_name: "ลูกค้า", customer_phone: "0810000000", job_type: "ล้างแอร์", address_text: "บ้านเลขที่ลับ", job_price: 500 };

test("job documents (quote/receipt/eslip) 404 on a bare job_id, 200 with the exact token key", async () => {
  const server = await startDocsServer({ job: JOB });
  try {
    for (const doc of ["quote", "receipt", "eslip"]) {
      const bare = await fetch(`${durl(server)}/docs/${doc}/7`);
      assert.equal(bare.status, 404, `${doc} bare job_id must 404`);
      const wrong = await fetch(`${durl(server)}/docs/${doc}/7?key=tok_wrong`);
      assert.equal(wrong.status, 404, `${doc} wrong key must 404`);
      const ok = await fetch(`${durl(server)}/docs/${doc}/7?key=tok_secret_77`);
      assert.equal(ok.status, 200, `${doc} correct key must 200`);
      assert.match(ok.headers.get("cache-control") || "", /no-store/);
      assert.equal(ok.headers.get("referrer-policy"), "no-referrer");
      assert.match(ok.headers.get("x-robots-tag") || "", /noindex/);
    }
  } finally { server.close(); }
});

test("job documents open for an authenticated admin without any key", async () => {
  const server = await startDocsServer({ job: JOB, isAdmin: true });
  try {
    const res = await fetch(`${durl(server)}/docs/receipt/7`);
    assert.equal(res.status, 200);
  } finally { server.close(); }
});

// ---------- wiring contracts ----------

test("/public/track is rate-limited and redacts code lookups via the allowlist", () => {
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

test("all three job-doc routes share one gate helper + sensitive headers", () => {
  assert.match(docsSrc, /async function canViewJobDoc\(req, data\)/);
  assert.match(docsSrc, /trackingPrivacy\.timingSafeEqualStr\(key, String\(token\)\)/);
  assert.match(docsSrc, /function setSensitiveDocHeaders\(res\)/);
  assert.match(docsSrc, /async function loadAuthorizedJobDoc\(req, res\)/);
  for (const doc of ["quote", "receipt", "eslip"]) {
    const route = docsSrc.match(new RegExp(`router\\.get\\("/docs/${doc}/:job_id"[\\s\\S]*?\\n  \\}\\);`));
    assert.ok(route, `${doc} route not found`);
    assert.match(route[0], /loadAuthorizedJobDoc\(req, res\)/, `${doc} not gated`);
  }
});

test("the customer app only builds receipt links + review form on full (token) access", () => {
  assert.match(trackingClientSrc, /data\.booking_token\s*\?\s*`\/docs\/receipt\/\$\{encodeURIComponent\(data\.job_id\)\}\?key=/);
  assert.match(trackingClientSrc, /data\.access_level === "token" \? \(data\.booking_token \|\| ""\) : ""/);
  assert.match(trackingClientSrc, /name="booking_token"/);
  assert.doesNotMatch(trackingClientSrc, /<input type="hidden" name="q"/);
});
