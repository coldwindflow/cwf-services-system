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
    photos: [{ photo_id: 900, public_url: "https://x/y.jpg", phase: "after" }],
    units: [{
      unit_id: 700,
      unit_no: 1,
      unit_code: "AC-01",
      label: "ห้องนอน",
      checklist_summary: {
        pre_completed: true,
        post_completed: true,
        issue_count: 0,
        post_issue_count: 0,
        metric_statuses: { refrigerant: "normal", cooling: "normal", airflow: "normal", drain: "normal" },
        raw_checklist_json: [{ note: "technician-only" }],
      },
      photos: [{ photo_id: 901, public_url: "https://x/u.jpg" }],
    }],
    cancel_reason: "ลูกค้ายกเลิก",
    review: { review_text: "ดีมาก" },
    catalog_review: { eligible: true, already_reviewed: true, review: { rating: 5, comment: "ดี", moderation_status: "pending", created_at: "2026-07-10" } },
    customer_complaint: "ช้า",
  };
}

// Booking-code reads use a customer-facing allowlist. Nested projectors also
// remove internal identifiers and write/document metadata.
const ALLOWED_CODE_KEYS = new Set([
  "access_level", "capabilities", "can_view_full_tracking", "can_use_token_actions",
  "legacy_review_eligible", "booking_code", "customer_name", "customer_phone",
  "job_type", "job_status", "booking_mode", "dispatch_mode", "appointment_datetime",
  "duration_min", "job_price", "payment_status", "paid_at", "address_text",
  "maps_url", "job_zone", "gps_latitude", "gps_longitude", "created_at",
  "travel_started_at", "checkin_at", "started_at", "finished_at", "canceled_at",
  "cancel_reason", "technician_note", "service_items", "photos", "units",
  "technician", "technician_team", "review", "catalog_review",
]);

test("booking_code gets full customer-facing detail without privileged fields", () => {
  const redacted = trackingPrivacy.redactPublicTrackPayload(richPayload());
  for (const key of Object.keys(redacted)) {
    assert.ok(ALLOWED_CODE_KEYS.has(key), `unexpected key leaked to code lookup: ${key}`);
  }
  for (const gone of ["booking_token", "job_id", "receipt_url", "document_key", "auth_token", "customer_complaint"]) {
    assert.equal(redacted[gone], undefined, `${gone} must not be present for a code lookup`);
  }
  assert.equal(redacted.access_level, "code");
  assert.equal(redacted.can_view_full_tracking, true);
  assert.equal(redacted.can_use_token_actions, false);
  assert.equal(redacted.capabilities.can_view_documents, false);
  assert.equal(redacted.capabilities.can_submit_review, false);
  assert.equal(redacted.customer_name, richPayload().customer_name);
  assert.equal(redacted.customer_phone, "0812345678");
  assert.equal(redacted.address_text, richPayload().address_text);
  assert.equal(redacted.job_status, "รอดำเนินการ");
  assert.equal(redacted.booking_code, "CWFABCDEFG");
  assert.equal(redacted.technician.username, undefined);
  assert.equal(redacted.technician.full_name, richPayload().technician.full_name);
  assert.equal(redacted.photos[0].photo_id, undefined);
  assert.equal(redacted.units[0].unit_id, undefined);
  assert.equal(redacted.units[0].photos[0].photo_id, undefined);
  assert.deepEqual(redacted.units[0].checklist_summary.metric_statuses, {
    refrigerant: "normal",
    cooling: "normal",
    airflow: "normal",
    drain: "normal",
  });
  assert.equal(redacted.units[0].checklist_summary.post_issue_count, 0);
  assert.equal(redacted.units[0].checklist_summary.raw_checklist_json, undefined);
  assert.equal(redacted.catalog_review.eligible, false);
  assert.equal(redacted.catalog_review.review.moderation_status, undefined);
});

test("a brand-new sensitive field added upstream does NOT leak through code redaction", () => {
  const payload = { ...richPayload(), some_future_pii_field: "secret home code 1234" };
  const redacted = trackingPrivacy.redactPublicTrackPayload(payload);
  assert.equal(redacted.some_future_pii_field, undefined);
});

test("booking-code read model exposes only legacy full-phone-proof eligibility and never catalog/token write eligibility", () => {
  assert.equal(trackingPrivacy.redactPublicTrackPayload(richPayload()).legacy_review_eligible, false);
  const eligible = trackingPrivacy.redactPublicTrackPayload({ ...richPayload(), legacy_review_eligible: true });
  assert.equal(eligible.legacy_review_eligible, true);
  assert.equal(eligible.capabilities.can_submit_review, false);
  assert.equal(eligible.catalog_review.eligible, false);
  assert.equal(eligible.booking_token, undefined);
});

function checklist(type, completed, rows) {
  return { checklist_type: type, completed_at: completed ? "2026-07-14T12:00:00Z" : null, checklist_json: rows };
}

test("pre issue plus completed clean post keeps after-service metrics normal", () => {
  const summary = trackingPrivacy.summarizeUnitChecklists([
    checklist("pre", true, [{ label: "ความเย็นก่อนล้าง", checked: false, issue: true }]),
    checklist("post", true, [{ label: "แอร์เย็นหลังล้าง", checked: true, issue: false, status: "ปกติ" }]),
  ]);
  assert.equal(summary.pre_completed, true);
  assert.equal(summary.post_completed, true);
  assert.equal(summary.issue_count, 1);
  assert.equal(summary.post_issue_count, 0);
  assert.deepEqual(summary.metric_statuses, {
    refrigerant: "normal",
    cooling: "normal",
    airflow: "normal",
    drain: "normal",
  });
});

test("pre-only and unfinished post issues never affect after-service health", () => {
  for (const checks of [
    [checklist("pre", true, [{ label: "ความเย็นก่อนล้าง", checked: false, issue: true }])],
    [checklist("post", false, [{ label: "แอร์ไม่เย็น", checked: false, issue: true }])],
  ]) {
    const summary = trackingPrivacy.summarizeUnitChecklists(checks);
    assert.equal(summary.issue_count, 1);
    assert.equal(summary.post_issue_count, 0);
    assert.deepEqual(summary.metric_statuses, { refrigerant: null, cooling: null, airflow: null, drain: null });
  }
});

test("post-checklist issues affect only deterministically matched metrics", () => {
  const cases = [
    ["ความเย็นหลังล้าง", "cooling"],
    ["ตรวจระบบน้ำทิ้ง / ระบายน้ำ", "drain"],
    ["แรงดันน้ำยา PSI", "refrigerant"],
    ["แรงลมจาก blower", "airflow"],
  ];
  for (const [label, expectedMetric] of cases) {
    const summary = trackingPrivacy.summarizeUnitChecklists([
      checklist("post", true, [
        { label, checked: false, issue: true, status: "ควรตรวจ", note: "raw private note" },
        { label: "พื้นที่ทำงานสะอาดเรียบร้อย", checked: true, issue: false, status: "ผ่าน" },
      ]),
    ]);
    assert.equal(summary.issue_count, 1);
    assert.equal(summary.post_issue_count, 1);
    for (const [metric, status] of Object.entries(summary.metric_statuses)) {
      assert.equal(status, metric === expectedMetric ? "issue" : null, `${label} must not affect ${metric}`);
    }
    assert.equal(JSON.stringify(summary).includes("raw private note"), false);
  }
});

test("unknown and multi-metric issues remain deterministic without broad warnings", () => {
  const unknown = trackingPrivacy.summarizeUnitChecklists([
    checklist("post", true, [{ label: "หน้ากากประกอบไม่สนิท", issue: true, note: "internal" }]),
  ]);
  assert.equal(unknown.issue_count, 1);
  assert.equal(unknown.post_issue_count, 1);
  assert.deepEqual(unknown.metric_statuses, { refrigerant: null, cooling: null, airflow: null, drain: null });

  const multiple = trackingPrivacy.summarizeUnitChecklists([
    checklist("post", true, [{ label: "แรงดันน้ำยาและแรงลม", issue: true }]),
  ]);
  assert.deepEqual(multiple.metric_statuses, { refrigerant: "issue", cooling: null, airflow: "issue", drain: null });
});

test("maskPhone handles empty/short values safely", () => {
  assert.equal(trackingPrivacy.maskPhone(""), null);
  assert.equal(trackingPrivacy.maskPhone(null), null);
  assert.equal(trackingPrivacy.maskPhone("08-1234-5678"), "•••• 5678");
});

test("tracking phone normalization accepts local, dashed, +66, and 0066 formats", () => {
  for (const value of ["0812345678", "081-234-5678", "+66812345678", "0066812345678"]) {
    assert.deepEqual(trackingPrivacy.normalizeTrackingPhone(value), {
      phone_norm: "0812345678",
      match_digits: ["0812345678", "66812345678", "0066812345678"],
    });
  }
  assert.equal(trackingPrivacy.normalizeTrackingPhone("not-a-phone"), null);
  assert.equal(trackingPrivacy.normalizeTrackingPhone("12345"), null);
});

test("tracking selection references are job-bound, short-lived, and fail closed", () => {
  const secret = "test-secret-not-production";
  const issuedAt = 1_720_000_000_000;
  const reference = trackingPrivacy.createTrackingSelectionReference(42, secret, { now: issuedAt, ttlSec: 300 });
  assert.match(reference, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const visibleReferenceBytes = Buffer.concat(reference.split(".").map((part) => Buffer.from(part, "base64url")));
  assert.equal(visibleReferenceBytes.includes(Buffer.from('"job_id":42')), false);
  assert.deepEqual(trackingPrivacy.verifyTrackingSelectionReference(reference, secret, { now: issuedAt + 60_000 }), {
    job_id: 42,
    expires_at: Math.floor(issuedAt / 1000) + 300,
  });
  const modified = `${reference[0] === "A" ? "B" : "A"}${reference.slice(1)}`;
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference(modified, secret, { now: issuedAt }), null);
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference(reference, "wrong-secret", { now: issuedAt }), null);
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference(reference, secret, { now: issuedAt + 301_000 }), null);
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference("malformed", secret, { now: issuedAt }), null);
});

test("phone lookup list projection exposes only safe fields plus the opaque selection reference", () => {
  const projected = trackingPrivacy.safeTrackingResult({
    job_id: 99,
    booking_code: "CWFABC1234",
    booking_token: "private-token",
    customer_phone: "0812345678",
    appointment_datetime: "2026-07-18T09:00:00+07:00",
    job_type: "ล้างแอร์",
    job_status: "เสร็จแล้ว",
    job_zone: "บางนา",
    address_text: "99/1 precise private address",
    maps_url: "https://maps.example/private",
  }, "opaque-reference");
  assert.deepEqual(Object.keys(projected).sort(), [
    "appointment_datetime", "booking_code", "job_status", "location_summary",
    "selection_ref", "service_summary",
  ]);
  assert.equal(projected.location_summary, "บางนา");
  assert.equal(projected.selection_ref, "opaque-reference");
  for (const forbidden of ["job_id", "booking_token", "customer_phone", "address_text", "maps_url"]) {
    assert.equal(projected[forbidden], undefined);
  }
});

test("safe lookup response supports one or many jobs with independently job-bound references", () => {
  const rows = [
    { job_id: 11, booking_code: "CWFJOB0001", appointment_datetime: "2026-07-18", job_type: "ล้างแอร์", job_status: "เสร็จแล้ว", job_zone: "บางนา" },
    { job_id: 12, booking_code: "CWFJOB0002", appointment_datetime: "2026-07-19", job_type: "ซ่อมแอร์", job_status: "รอดำเนินการ", job_zone: "พระโขนง" },
  ];
  const secret = "lookup-test-secret";
  const now = 1_720_000_000_000;
  const single = trackingPrivacy.buildSafeTrackingLookupResponse(rows.slice(0, 1), "booking_code", secret, { now });
  const multiple = trackingPrivacy.buildSafeTrackingLookupResponse(rows, "phone", secret, { now });
  assert.equal(single.lookup_type, "booking_code");
  assert.equal(single.jobs.length, 1);
  assert.equal(multiple.lookup_type, "phone");
  assert.equal(multiple.jobs.length, 2);
  assert.notEqual(multiple.jobs[0].selection_ref, multiple.jobs[1].selection_ref);
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference(multiple.jobs[0].selection_ref, secret, { now }).job_id, 11);
  assert.equal(trackingPrivacy.verifyTrackingSelectionReference(multiple.jobs[1].selection_ref, secret, { now }).job_id, 12);
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

test("/public/track is rate-limited and issues a signed selection projection for non-token lookups", () => {
  assert.match(indexSrc, /publicTrackRateLimiter\.check\(trackingPrivacy\.clientIpKey\(req\)\)/);
  assert.match(indexSrc, /const fullAccess = !selection && trackingPrivacy\.isFullAccessQuery\(q, row\);/);
  assert.match(indexSrc, /trackingPrivacy\.selectionPublicTrackPayload\(/);
  assert.match(indexSrc, /app\.post\("\/public\/track\/lookup"/);
  assert.match(indexSrc, /app\.post\("\/public\/track\/select", publicTrackHandler\)/);
  assert.match(indexSrc, /trackingPrivacy\.summarizeUnitChecklists\(checksByUnit\.get\(String\(unit\.unit_id\)\) \|\| \[\]\)/);
});

test("phone and Booking Code lookup wiring uses safe rows and never accepts a client job_id", () => {
  const route = indexSrc.match(/app\.post\("\/public\/track\/lookup"[\s\S]*?\n}\);/);
  assert.ok(route, "tracking lookup route not found");
  assert.match(route[0], /normalizeTrackingPhone\(identifier\)/);
  assert.match(route[0], /regexp_replace\(COALESCE\(customer_phone/);
  assert.match(route[0], /= ANY\(\$1::text\[\]\)/);
  assert.match(route[0], /WHERE booking_code=\$1/);
  assert.match(route[0], /LIMIT 2/);
  assert.match(route[0], /buildSafeTrackingLookupResponse/);
  assert.doesNotMatch(route[0], /req\.body\?\.job_id|req\.body\.job_id/);
});

test("technician review accepts only verified token/selection credentials and rechecks eligibility under lock", () => {
  const route = indexSrc.match(/app\.post\("\/public\/review"[\s\S]*?\n}\);/);
  assert.ok(route, "public review route not found");
  assert.match(route[0], /verifyTrackingSelectionReference\(selectionReference, getJwtSecret\(\)\)/);
  assert.match(route[0], /FROM public\.jobs WHERE job_id=\$1 LIMIT 1 FOR UPDATE/);
  assert.match(route[0], /if \(job\.canceled_at\) deny\(\)/);
  assert.match(route[0], /if \(job\.customer_rating\) deny\(\)/);
  assert.match(route[0], /if \(!job\.technician_username\) deny\(\)/);
  assert.match(route[0], /ON CONFLICT \(job_id\) DO NOTHING/);
  assert.match(route[0], /console\.error\("\[public\/review\] failed", \{ code: String\(e\?\.code \|\| "REVIEW_FAILED"\) \}\)/);
  assert.doesNotMatch(route[0], /console\.(?:log|warn|error)\([^\n]*identifierValue/);
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

test("the customer app keeps document access token-only and injects review credentials from memory", () => {
  // The receipt URL still carries the booking_token as ?key=, but it is now
  // constructed at click time from state (receiptUrl(data)) instead of being
  // interpolated into rendered HTML — see Blocker 1.
  assert.match(trackingClientSrc, /`\/docs\/receipt\/\$\{encodeURIComponent\(data\.job_id\)\}\?key=\$\{encodeURIComponent\(data\.booking_token\)\}`/);
  // Documents remain token-only; selected jobs may use an opaque review reference.
  assert.match(trackingClientSrc, /if \(!canUseTokenActions\(data\)\) return "";/);
  assert.match(trackingClientSrc, /const reviewToken = canUseTokenActions\(data\)/);
  assert.match(trackingClientSrc, /if \(!catalogReview\.eligible \|\| !canUseTokenActions\(data\)\) return "";/);
  // Neither credential may be embedded in rendered HTML or hidden inputs.
  assert.doesNotMatch(trackingClientSrc, /name="booking_token"/);
  assert.match(trackingClientSrc, /payload\.booking_token = token/);
  assert.match(trackingClientSrc, /payload\.selection_ref = selectionReference/);
  assert.doesNotMatch(trackingClientSrc, /<input type="hidden" name="q"/);
  assert.doesNotMatch(trackingClientSrc, /name="customer_phone"|เบอร์โทรที่ใช้จอง \(ยืนยันตัวตน\)/);
});
