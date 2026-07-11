"use strict";

// Focused tests for the tracking + technician GPS check-in production hotfix.
//  - Secure tracking link uses booking_token; booking_code stays limited.
//  - /public/track aggregates the technician from every assignment source.
//  - track.html falls back from an empty technician_team and escapes values.
//  - Technician checkin() never strands the busy lock and maps errors to Thai.
//  - Backend /jobs/:job_id/checkin validates coordinates + structured codes.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const indexSrc = read("index.js");
const appSrc = read("app.js");
const trackHtml = read("track.html");
const trackingJs = read("customer-app/modules/tracking.js");

// ---- helpers to slice a contiguous source region -------------------------
function sliceBetween(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  assert.notEqual(a, -1, `missing start marker: ${startMarker}`);
  const b = src.indexOf(endMarker, a + startMarker.length);
  assert.notEqual(b, -1, `missing end marker: ${endMarker}`);
  return src.slice(a, b);
}

// ============================ A. Secure tracking link =====================

test("official confirmation tracking_url uses booking_token when present (not booking_code)", () => {
  assert.match(indexSrc, /const trackingCredential = String\(job\.booking_token \|\| ''\)\.trim\(\)/);
  assert.match(indexSrc, /tracking_url: `\$\{origin\}\/track\.html\?q=\$\{encodeURIComponent\(trackingCredential\)\}`/);
  // The visible job number stays booking_code.
  assert.match(indexSrc, /booking_code: booking,/);
  // The summary query must actually load booking_token to build the link.
  assert.match(indexSrc, /SELECT job_id, booking_code, booking_token, customer_name/);
});

test("booking_token is never rendered as visible confirmation text nor logged", () => {
  const fn = sliceBetween(indexSrc, "function buildCustomerConfirmationVars(", "\napp.get(\"/jobs/:job_id/summary\"");
  // token appears only as the URL credential, never as its own visible var.
  assert.doesNotMatch(fn, /booking_token: /);
  assert.doesNotMatch(fn, /console\.[a-z]+\([^)]*booking_token/);
});

// ============================ A5. Technician aggregation ==================

test("/public/track technician aggregation includes job_assignments (active only) + dedup", () => {
  const region = sliceBetween(indexSrc, "TEAM (Public Tracking)", "Access level: the long random booking_token");
  assert.match(region, /FROM public\.job_assignments/);
  assert.match(region, /COALESCE\(status,'in_progress'\) IN \('in_progress','done'\)/);
  assert.match(region, /job_team_members/);
  // Deduplicate by normalized username; keep primary technician first.
  assert.match(region, /const seen = new Set\(\)/);
  assert.match(region, /norm = u\.toLowerCase\(\)/);
  // Assigned username kept even without a technician_profiles row.
  assert.match(region, /const d = byU\.get\(u\) \|\| \{\}/);
});

// ============================ A4. track.html fallback + escaping ==========

test("track.html uses technician_team only when it is a non-empty array, else falls back", () => {
  assert.match(trackHtml, /Array\.isArray\(data\.technician_team\) && data\.technician_team\.length/);
  assert.match(trackHtml, /:\s*\(data\.technician \? \[data\.technician\] : \[\]\)/);
});

test("track.html escapes customer/technician/address/photo/phone values", () => {
  assert.match(trackHtml, /ชื่อลูกค้า:<\/b> \$\{esc\(data\.customer_name/);
  assert.match(trackHtml, /ที่อยู่:<\/b> \$\{esc\(data\.address_text/);
  assert.match(trackHtml, /src="\$\{esc\(photo\)\}"/);
  assert.match(trackHtml, /tel:\$\{esc\(phone\)\}/);
  assert.match(trackHtml, /tel:\$\{esc\(firstTel\)\}/);
});

// ============================ A3. Customer App tracking rendering =========

test("customer-app tracking is access-level aware (full customer info vs limited notice)", () => {
  assert.match(trackingJs, /const isFull = data\.access_level === "token"/);
  assert.match(trackingJs, /if \(isFull && data\.customer_name\)/);
  assert.match(trackingJs, /if \(isFull && data\.address_text\)/);
  assert.match(trackingJs, /tracking-limited-note/);
  // The limited notice appears only when NOT full access.
  assert.match(trackingJs, /const limitedNotice = !isFull \?/);
});

// ============================ B6. Backend coordinate validation ===========

test("checkin backend validates coordinates + accuracy with structured codes", () => {
  const route = sliceBetween(indexSrc, 'app.post("/jobs/:job_id/checkin"', "// 📷 PHOTOS");
  assert.match(route, /!Number\.isFinite\(lat\) \|\| !Number\.isFinite\(lng\) \|\| lat < -90 \|\| lat > 90 \|\| lng < -180 \|\| lng > 180/);
  assert.match(route, /code: "INVALID_COORDINATES"/);
  assert.match(route, /code: "INVALID_JOB_REFERENCE"/);
  assert.match(route, /code: "OUTSIDE_CHECKIN_RADIUS"/);
  assert.match(route, /code: "LOCATION_ACCURACY_TOO_LOW"/);
  // accuracy gate: only reject as outside when confidently outside.
  assert.match(route, /\(distance - accuracy\) <= 500/);
  // idempotent: preserve the first check-in timestamp.
  assert.match(route, /checkin_at=COALESCE\(checkin_at, NOW\(\)\)/);
  // reads accuracy + captured_at from the body.
  assert.match(route, /const accuracy = hasAccuracy \? Number\(body\.accuracy\) : null/);
  assert.match(route, /captured_at/);
  // never logs raw coordinates.
  assert.doesNotMatch(route, /console\.[a-z]+\([^)]*\blat\b[^)]*\blng\b/);
});

test("ownership helper returns structured codes without weakening the check", () => {
  const fn = sliceBetween(indexSrc, "async function requireTechOwnsResolvedJob(", "async function auditLog(");
  assert.match(fn, /code: 'AUTH_REQUIRED'/);
  assert.match(fn, /code: 'TECH_NOT_ASSIGNED'/);
  assert.match(fn, /assertTechBelongsToJob\(clientOrPool, realId, tech\)/);
});

// ============================ B1-B5. Technician checkin() behaviour ========
// Evaluate the real checkin() (+ helpers) from app.js in a controlled sandbox
// with mocked geolocation / DOM / fetch so we can assert the busy-lock lifecycle.

function loadCheckin({ geo, fetchImpl, cssBroken = false } = {}) {
  const cssEscape = sliceBetween(appSrc, "function cssEscapeCompat(value) {", "\n// ✅ เปิดปุ่ม");
  const checkinBlock = sliceBetween(appSrc, "// Robust geolocation for Check-in.", "// 📝 NOTE");

  const alerts = [];
  const busy = {};
  const btn = { disabled: false, innerHTML: "เช็คอิน" };
  const hint = { innerHTML: "" };
  const doc = {
    querySelector() {
      if (cssBroken) throw new Error("CSS.escape missing");
      return btn;
    },
    getElementById() { return hint; },
  };
  const win = { isSecureContext: true, __CWF_CHECKIN_BUSY: busy };
  const navigator = {
    geolocation: geo === null ? undefined : (geo || {
      getCurrentPosition: (ok) => ok({ coords: { latitude: 13.7, longitude: 100.5, accuracy: 12 }, timestamp: Date.now() }),
    }),
  };
  const sandbox = {
    window: win,
    document: doc,
    navigator,
    alert: (m) => alerts.push(String(m)),
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })),
    setTimeout: () => {},
    loadJobs: () => {},
    API_BASE: "http://test",
    console: { log() {}, info() {}, warn() {}, error() {} },
    Promise, Number, String, Date, JSON, Math, encodeURIComponent, Set,
    CSS: cssBroken ? undefined : { escape: (s) => s },
  };
  vm.createContext(sandbox);
  const code = `${cssEscape}\n${checkinBlock}\nglobalThis.__api = { checkin, cwfGetCheckinPosition, mapCheckinServerError };`;
  vm.runInContext(code, sandbox);
  return { api: sandbox.__api, alerts, busy, btn, hint, win };
}

test("16/17: a synchronous selector failure (no CSS.escape) still releases the busy lock", async () => {
  const h = loadCheckin({ cssBroken: true });
  await h.api.checkin("J1");
  assert.equal(h.busy["J1"], false, "busy lock must be cleared after a selector failure");
});

test("18: unsupported geolocation releases the busy lock and warns", async () => {
  const h = loadCheckin({ geo: null });
  await h.api.checkin("J2");
  assert.equal(h.busy["J2"], false);
  assert.ok(h.alerts.some((a) => /ไม่รองรับ/.test(a)));
});

test("19: permission denied releases the busy lock with a clear Thai message", async () => {
  const geo = { getCurrentPosition: (_ok, err) => err({ code: 1, message: "denied" }) };
  const h = loadCheckin({ geo });
  await h.api.checkin("J3");
  assert.equal(h.busy["J3"], false);
  assert.ok(h.alerts.some((a) => /อนุญาต|สิทธิ์ตำแหน่ง/.test(a)));
});

test("20/22: timeout / position-unavailable retries exactly once then can succeed", async () => {
  let calls = 0;
  const geo = {
    getCurrentPosition: (ok, err) => {
      calls += 1;
      if (calls === 1) return err({ code: 3, message: "timeout" });
      return ok({ coords: { latitude: 13.7, longitude: 100.5, accuracy: 20 }, timestamp: Date.now() });
    },
  };
  const h = loadCheckin({ geo });
  await h.api.checkin("J4");
  assert.equal(calls, 2, "should retry exactly once");
  assert.equal(h.busy["J4"], false);
});

test("21: a failed retry still releases the busy lock", async () => {
  let calls = 0;
  const geo = { getCurrentPosition: (_ok, err) => { calls += 1; err({ code: 3, message: "timeout" }); } };
  const h = loadCheckin({ geo });
  await h.api.checkin("J5");
  assert.equal(calls, 2, "one initial + one retry");
  assert.equal(h.busy["J5"], false);
  assert.ok(h.alerts.some((a) => /นานเกินไป|ลองใหม่/.test(a)));
});

test("23: a successful position sends lat, lng, accuracy and captured_at", async () => {
  let sent = null;
  const fetchImpl = async (_url, opts) => { sent = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ success: true }) }; };
  const h = loadCheckin({ fetchImpl });
  await h.api.checkin("J6");
  assert.equal(typeof sent.lat, "number");
  assert.equal(typeof sent.lng, "number");
  assert.equal(sent.accuracy, 12);
  assert.match(String(sent.captured_at), /\dT\d/);
  assert.equal(h.busy["J6"], false);
});

test("24: a network failure releases the busy lock", async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  const h = loadCheckin({ fetchImpl });
  await h.api.checkin("J7");
  assert.equal(h.busy["J7"], false);
  assert.ok(h.alerts.some((a) => /เครือข่าย|ลองใหม่/.test(a)));
});

test("25: a server rejection releases the busy lock and maps the code to Thai", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: "x", code: "OUTSIDE_CHECKIN_RADIUS", distance: 820 }) });
  const h = loadCheckin({ fetchImpl });
  await h.api.checkin("J8");
  assert.equal(h.busy["J8"], false);
  assert.ok(h.alerts.some((a) => /นอกพื้นที่หน้างาน/.test(a) && /820/.test(a)));
});

test("26/27: a second tap while active does not duplicate; a tap after failure can retry", async () => {
  // Hold the first request open so the lock is genuinely active.
  let release;
  let fetchCalls = 0;
  const gate = new Promise((r) => { release = r; });
  const fetchImpl = async () => { fetchCalls += 1; await gate; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
  const h = loadCheckin({ fetchImpl });
  const first = h.api.checkin("J9");
  const second = h.api.checkin("J9"); // must be ignored while in-flight
  await second;
  assert.equal(fetchCalls, 1, "second tap while active must not create a duplicate request");
  release({});
  await first;
  assert.equal(h.busy["J9"], false);
  // After completion a fresh tap works again.
  await h.api.checkin("J9");
  assert.equal(fetchCalls, 2, "a tap after completion can retry");
});

// ---- server-error mapper (unit) ------------------------------------------
test("mapCheckinServerError maps important codes to actionable Thai", () => {
  const h = loadCheckin();
  const m = h.api.mapCheckinServerError;
  assert.match(m({ code: "AUTH_REQUIRED" }, 401), /เข้าสู่ระบบใหม่/);
  assert.match(m({ code: "TECH_NOT_ASSIGNED" }, 403), /ยังไม่ได้ถูกมอบหมาย/);
  assert.match(m({ code: "LOCATION_ACCURACY_TOO_LOW" }, 400), /ไม่แม่นพอ/);
  assert.match(m({ code: "INVALID_COORDINATES" }, 400), /ไม่ถูกต้อง/);
});

// ---- geolocation options (contract) --------------------------------------
test("checkin() uses cssEscapeCompat and a high-accuracy-first geolocation strategy", () => {
  const block = sliceBetween(appSrc, "// Robust geolocation for Check-in.", "// 📝 NOTE");
  assert.match(block, /cssEscapeCompat\(key\)/);
  assert.doesNotMatch(block, /CSS\.escape\(key\)/);
  assert.match(block, /enableHighAccuracy: true/);
  assert.match(block, /body: JSON\.stringify\(\{ lat, lng, accuracy, captured_at \}\)/);
  assert.match(block, /finally \{/);
});
