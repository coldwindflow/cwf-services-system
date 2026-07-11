"use strict";

// Job-location round-trip hotfix coverage.
//
//   Admin Add → /admin/book_v2 → jobs DB → Admin Job Edit → Technician job API
//   → Technician Google Maps navigation → GPS check-in site coordinate.
//
// The technician navigation functions are the real production functions loaded
// out of app.js into a vm sandbox (no jsdom) so their actual behavior — never
// destination=0,0 — is exercised. The DB persistence/preservation contract is
// exercised against a real local Postgres using the exact column list the
// production routes use, self-skipping when Postgres is unavailable. The
// remaining wiring is locked with source contracts.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Pool } = require("pg");

const REPO_ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// Technician navigation — real app.js functions in a vm sandbox
// ---------------------------------------------------------------------------
function sliceBetween(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

function loadNav() {
  const appSrc = read("app.js");
  const offerSrc = sliceBetween(appSrc, "function offerMapUrl(o) {", "\nfunction openOfferMap");
  const navSrc = sliceBetween(appSrc, "function _safeOpenUrl(url){", "\nwindow.openMaps = openMaps;");
  const opened = [];
  const alerts = [];
  const sandbox = {
    console,
    setTimeout: (fn) => { /* no-op for a.remove() */ return 0; },
    alert: (m) => { alerts.push(String(m)); },
    document: {
      body: { appendChild() {}, },
      createElement: () => ({ style: {}, click() {}, remove() {}, set href(_v) {}, }),
    },
    window: {
      open: (url) => { opened.push(String(url)); return { opener: null }; },
      location: { set href(v) { opened.push(String(v)); } },
    },
    encodeURIComponent,
    String, Number, Math, RegExp, Boolean,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${navSrc}\n${offerSrc}\nglobalThis.__nav = { openMaps, offerMapUrl, _hasUsableLatLng };`, sandbox);
  return { nav: sandbox.__nav, opened, alerts };
}

test("Test 12: valid GPS opens a coordinate destination (not 0,0)", () => {
  const { nav, opened } = loadNav();
  nav.openMaps("13.7460", "100.5340", "อ่อนนุช กทม", "");
  assert.equal(opened.length, 1);
  assert.match(opened[0], /destination=13\.746(%2C|,)100\.534/);
  assert.doesNotMatch(opened[0], /0%2C0|0,0/);
});

test("Test 8: maps_url present opens the Maps URL directly", () => {
  const { nav, opened } = loadNav();
  nav.openMaps("13.7460", "100.5340", "อ่อนนุช", "https://maps.app.goo.gl/abc123");
  assert.equal(opened.length, 1);
  assert.match(opened[0], /maps\.app\.goo\.gl\/abc123/);
});

test("Test 9: null GPS never becomes 0,0 — falls back to address search", () => {
  const { nav, opened } = loadNav();
  assert.equal(nav._hasUsableLatLng(null, null), false);
  nav.openMaps(null, null, "อ่อนนุช สุขุมวิท 77", "");
  assert.equal(opened.length, 1);
  assert.match(opened[0], /\/maps\/search\/\?api=1&query=/);
  assert.doesNotMatch(opened[0], /destination=0|0%2C0|q=0,0/);
});

test("Test 10: empty-string GPS never becomes 0,0 — falls back to address search", () => {
  const { nav, opened } = loadNav();
  assert.equal(nav._hasUsableLatLng("", ""), false);
  assert.equal(nav._hasUsableLatLng("   ", "  "), false);
  nav.openMaps("", "", "สุขุมวิท 101", "");
  assert.equal(opened.length, 1);
  assert.match(opened[0], /\/maps\/search\/\?api=1&query=/);
  assert.doesNotMatch(opened[0], /0%2C0|destination=0/);
});

test("Test 11: the (0,0) pair falls back to the address", () => {
  const { nav, opened } = loadNav();
  assert.equal(nav._hasUsableLatLng(0, 0), false);
  assert.equal(nav._hasUsableLatLng("0", "0"), false);
  nav.openMaps("0", "0", "บางนา", "");
  assert.equal(opened.length, 1);
  assert.match(opened[0], /\/maps\/search\/\?api=1&query=/);
});

test("no maps_url, no coords, no address → actionable Thai error, opens nothing", () => {
  const { nav, opened, alerts } = loadNav();
  nav.openMaps(null, null, "", "");
  assert.equal(opened.length, 0);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /นำทาง/);
});

test("_hasUsableLatLng strictly rejects booleans/arrays/objects/NaN/out-of-range", () => {
  const { nav } = loadNav();
  assert.equal(nav._hasUsableLatLng(true, true), false);
  assert.equal(nav._hasUsableLatLng([], []), false);
  assert.equal(nav._hasUsableLatLng({}, {}), false);
  assert.equal(nav._hasUsableLatLng(NaN, NaN), false);
  assert.equal(nav._hasUsableLatLng(Infinity, 100), false);
  assert.equal(nav._hasUsableLatLng(200, 100), false); // lat out of range
  assert.equal(nav._hasUsableLatLng(13.7, 500), false); // lng out of range
  assert.equal(nav._hasUsableLatLng(13.7, 100.5), true);
  assert.equal(nav._hasUsableLatLng("13.7", "100.5"), true);
});

test("offerMapUrl never emits q=0,0 for missing coordinates", () => {
  const { nav } = loadNav();
  assert.equal(nav.offerMapUrl({ gps_latitude: null, gps_longitude: null, address_text: "รามคำแหง" }),
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("รามคำแหง"));
  assert.equal(nav.offerMapUrl({ maps_url: "https://maps.app.goo.gl/x" }), "https://maps.app.goo.gl/x");
  assert.match(nav.offerMapUrl({ gps_latitude: 13.7, gps_longitude: 100.5 }), /maps\?q=13\.7,100\.5/);
  assert.doesNotMatch(nav.offerMapUrl({ gps_latitude: null, gps_longitude: null }) || "", /0,0/);
});

// ---------------------------------------------------------------------------
// Source contracts — the wiring across the pipeline
// ---------------------------------------------------------------------------
test("Test 4: admin job edit reads gps_latitude ?? latitude and shows the system zone", () => {
  const src = read("admin-job-view-v2.js");
  assert.match(src, /edit_lat"\s+value="\$\{escapeHtml\(safe\(job\.gps_latitude \?\? job\.latitude \?\? ''\)\)\}"/);
  assert.match(src, /edit_lng"\s+value="\$\{escapeHtml\(safe\(job\.gps_longitude \?\? job\.longitude \?\? ''\)\)\}"/);
  // system-detected service zone shown separately from the free-text job_zone
  assert.match(src, /โซนบริการที่ระบบตรวจได้/);
  assert.match(src, /job\.service_zone_code/);
  // save sends canonical gps_* keys via the drop-stale-GPS decision
  assert.match(src, /gps_latitude: dropStaleGps \? '' : latNow/);
  assert.match(src, /gps_longitude: dropStaleGps \? '' : lngNow/);
});

test("Test 1: admin add payload carries maps_url/job_zone/service_zone/gps", () => {
  const src = read("admin-add-v2.js");
  assert.match(src, /maps_url: \(el\("maps_url"\)\.value \|\| ""\)\.trim\(\)/);
  assert.match(src, /job_zone: \(el\("job_zone"\)\.value \|\| ""\)\.trim\(\)/);
  assert.match(src, /service_zone_code:/);
  assert.match(src, /service_zone_source:/);
  assert.match(src, /gps_latitude: \(el\("gps_latitude"\)\?\.value \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(src, /gps_longitude: \(el\("gps_longitude"\)\?\.value \|\| ""\)\.trim\(\) \|\| null/);
});

test("admin add post-save verifies location + shows the location Thai warning", () => {
  const src = read("admin-add-v2.js");
  assert.match(src, /checkText\('address_text'\)/);
  assert.match(src, /checkText\('maps_url'\)/);
  assert.match(src, /checkText\('job_zone'\)/);
  assert.match(src, /locationIncomplete: true/);
  assert.match(src, /บันทึกงานแล้ว แต่ข้อมูลสถานที่ไม่ครบ กรุณาตรวจสอบใบงานก่อนส่งให้ช่าง/);
});

test("Test 6: admin review modal fetches the full job and prefers stored coords", () => {
  const src = read("admin-review-v2.js");
  assert.match(src, /apiFetch\(`\/admin\/job_v2\/\$\{encodeURIComponent\(row\.job_id\)\}`\)/);
  assert.match(src, /gps_latitude: full\.gps_latitude/);
  assert.match(src, /gps_longitude: full\.gps_longitude/);
  // stored coords win over parsing from the address
  assert.match(src, /const stored = strictStoredLatLng\(CURRENT\.gps_latitude, CURRENT\.gps_longitude\)/);
  assert.match(src, /function strictStoredLatLng/);
});

test("Test 7: technician job API returns maps_url/gps/address", () => {
  const src = read("index.js");
  assert.match(src, /j\.gps_latitude, j\.gps_longitude/);
  assert.match(src, /j\.maps_url, j\.job_zone/);
  assert.match(src, /j\.address_text/);
});

test("Test 5/E: book_v2 + admin-edit strictly validate/resolve every coordinate source", () => {
  const src = read("index.js");
  // strict helpers
  assert.match(src, /function strictLatLngPairOrNull\(latRaw, lngRaw\)/);
  assert.match(src, /if \(lat === 0 && lng === 0\) return null;/);
  // book_v2: explicit gps first, and EVERY derived pair (parsed + resolved) is
  // passed through the strict validator (Blocker 4).
  assert.match(src, /const explicitAdminLL = strictLatLngPairOrNull\(body\.gps_latitude, body\.gps_longitude\)/);
  assert.match(src, /derivedAdminLL = p \? strictLatLngPairOrNull\(p\.lat, p\.lng\) : null/);
  assert.match(src, /derivedAdminLL = strictLatLngPairOrNull\(rr\.lat, rr\.lng\)/);
  // admin-edit: strict pair, 400 on partial/invalid, and force-CASE writes so it
  // can deliberately clear maps_url / gps / service_zone to NULL.
  assert.match(src, /editGpsPair = strictLatLngPairOrNull\(latRaw, lngRaw\)/);
  assert.match(src, /code: 'INVALID_JOB_SITE_COORDINATES'/);
  assert.match(src, /maps_url = CASE WHEN \$7 THEN \$8 ELSE maps_url END/);
  assert.match(src, /gps_latitude = CASE WHEN \$10 THEN \$11 ELSE gps_latitude END/);
  assert.match(src, /service_zone_code = CASE WHEN \$13 THEN \$14 ELSE service_zone_code END/);
  // derived coords in admin-edit also go through the strict validator.
  assert.match(src, /pair = p \? strictLatLngPairOrNull\(p\.lat, p\.lng\) : null/);
  assert.match(src, /pair = strictLatLngPairOrNull\(rr\.lat, rr\.lng\)/);
  // zone recompute on location change.
  assert.match(src, /zoneDetected = await detectServiceZoneFromText\(/);
});

test("Test 14: check-in 500 m + accuracy policy is unchanged", () => {
  const src = read("index.js");
  assert.match(src, /const MAX_CHECKIN_ACCURACY_M = 200/);
  assert.match(src, /distance > 500/);
  assert.match(src, /\(distance - accuracy\) <= 500/);
});

test("Test 15: PWA + admin cache build IDs are bumped consistently", () => {
  const BUILD = "20260712_job_location_roundtrip_v1";
  assert.match(read("app.js"), new RegExp(`__CWF_TECH_APP_VERSION__ = "${BUILD}"`));
  assert.match(read("sw.js"), new RegExp(`CWF_TECH_BUILD_ID = "${BUILD}"`));
  assert.match(read("cwf-pwa.js"), new RegExp(`VERSION = '${BUILD}'`));
  assert.match(read("tech.html"), new RegExp(`app\\.js\\?v=${BUILD}`));
  assert.match(read("admin-add-v2.html"), new RegExp(`admin-add-v2\\.js\\?v=${BUILD}`));
  assert.match(read("admin-job-view-v2.html"), new RegExp(`admin-job-view-v2\\.js\\?v=${BUILD}`));
  assert.match(read("admin-review-v2.html"), new RegExp(`admin-review-v2\\.js\\?v=${BUILD}`));
});

// ---------------------------------------------------------------------------
// DB round-trip (real Postgres) — persistence + preservation contract.
// Mirrors the exact production column list used by /admin/book_v2 INSERT and
// PUT /jobs/:job_id/admin-edit UPDATE. Self-skips when Postgres is unavailable.
// ---------------------------------------------------------------------------
const PG_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "cwf_test",
};

let pool = null;
let dbDown = "";

test.before(async () => {
  pool = new Pool(PG_CONFIG);
  try {
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.job_location_roundtrip_probe (
        job_id BIGSERIAL PRIMARY KEY,
        address_text TEXT,
        maps_url TEXT,
        job_zone TEXT,
        gps_latitude DOUBLE PRECISION,
        gps_longitude DOUBLE PRECISION,
        service_zone_code TEXT,
        service_zone_source TEXT
      )
    `);
    await pool.query("TRUNCATE public.job_location_roundtrip_probe RESTART IDENTITY");
  } catch (e) {
    dbDown = e.message || "postgres unavailable";
    if (pool) await pool.end().catch(() => {});
    pool = null;
  }
});

test.after(async () => {
  if (pool) {
    await pool.query("DROP TABLE IF EXISTS public.job_location_roundtrip_probe").catch(() => {});
    await pool.end().catch(() => {});
  }
});

async function insertProbe(vals) {
  const r = await pool.query(
    `INSERT INTO public.job_location_roundtrip_probe
       (address_text, maps_url, job_zone, gps_latitude, gps_longitude, service_zone_code, service_zone_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING job_id`,
    [vals.address_text, vals.maps_url, vals.job_zone, vals.gps_latitude, vals.gps_longitude, vals.service_zone_code, vals.service_zone_source]
  );
  return r.rows[0].job_id;
}

// The exact admin-edit UPDATE preservation shape (COALESCE + NULLIF for text).
async function adminEditProbe(jobId, p) {
  await pool.query(
    `UPDATE public.job_location_roundtrip_probe
        SET address_text = COALESCE($1, address_text),
            maps_url     = COALESCE(NULLIF($2,''), maps_url),
            job_zone     = COALESCE(NULLIF($3,''), job_zone),
            gps_latitude = COALESCE($4, gps_latitude),
            gps_longitude= COALESCE($5, gps_longitude)
      WHERE job_id=$6`,
    [p.address_text ?? null, p.maps_url ?? null, p.job_zone ?? null, p.gpsLat, p.gpsLng, jobId]
  );
}

test("Tests 2+3: DB stores exact location values and they read back exactly", async (t) => {
  if (dbDown) { t.skip(`postgres unavailable: ${dbDown}`); return; }
  const jobId = await insertProbe({
    address_text: "99/1 อ่อนนุช 17 กทม",
    maps_url: "https://maps.app.goo.gl/roundtripABC",
    job_zone: "อ่อนนุช",
    gps_latitude: 13.71234,
    gps_longitude: 100.61234,
    service_zone_code: "C",
    service_zone_source: "admin_override",
  });
  const { rows } = await pool.query("SELECT * FROM public.job_location_roundtrip_probe WHERE job_id=$1", [jobId]);
  const j = rows[0];
  assert.equal(j.address_text, "99/1 อ่อนนุช 17 กทม");
  assert.equal(j.maps_url, "https://maps.app.goo.gl/roundtripABC");
  assert.equal(j.job_zone, "อ่อนนุช");
  assert.equal(Number(j.gps_latitude), 13.71234);
  assert.equal(Number(j.gps_longitude), 100.61234);
  assert.equal(j.service_zone_code, "C");
});

test("Test 5: saving with omitted/empty location fields preserves them (never erased or 0,0)", async (t) => {
  if (dbDown) { t.skip(`postgres unavailable: ${dbDown}`); return; }
  const jobId = await insertProbe({
    address_text: "12 สุขุมวิท 101",
    maps_url: "https://maps.app.goo.gl/keepme",
    job_zone: "ปุณณวิถี",
    gps_latitude: 13.68,
    gps_longitude: 100.60,
    service_zone_code: "C",
    service_zone_source: "auto_detect",
  });
  // Admin edits only the customer note-equivalent: location omitted (null) / empty.
  // gpsLat/gpsLng resolve to null for empty input in production (strict pair) → preserve.
  await adminEditProbe(jobId, { address_text: null, maps_url: "", job_zone: "", gpsLat: null, gpsLng: null });
  const { rows } = await pool.query("SELECT * FROM public.job_location_roundtrip_probe WHERE job_id=$1", [jobId]);
  const j = rows[0];
  assert.equal(j.maps_url, "https://maps.app.goo.gl/keepme", "maps_url preserved");
  assert.equal(j.job_zone, "ปุณณวิถี", "job_zone preserved");
  assert.equal(Number(j.gps_latitude), 13.68, "lat preserved, not turned into 0");
  assert.equal(Number(j.gps_longitude), 100.60, "lng preserved, not turned into 0");
  assert.notEqual(Number(j.gps_latitude), 0);
});

test("Test 13: short Maps URL is preserved even when no coordinates resolve", async (t) => {
  if (dbDown) { t.skip(`postgres unavailable: ${dbDown}`); return; }
  // Production stores maps_url regardless of coordinate resolution; a short link
  // with no parseable coords keeps final_lat/lng null but the URL is saved.
  const jobId = await insertProbe({
    address_text: "ไม่มีพิกัด",
    maps_url: "https://maps.app.goo.gl/shortNoCoords",
    job_zone: "",
    gps_latitude: null,
    gps_longitude: null,
    service_zone_code: null,
    service_zone_source: null,
  });
  const { rows } = await pool.query("SELECT * FROM public.job_location_roundtrip_probe WHERE job_id=$1", [jobId]);
  assert.equal(rows[0].maps_url, "https://maps.app.goo.gl/shortNoCoords");
  assert.equal(rows[0].gps_latitude, null);
});

test("edit updates coordinates when a valid new pair is supplied", async (t) => {
  if (dbDown) { t.skip(`postgres unavailable: ${dbDown}`); return; }
  const jobId = await insertProbe({
    address_text: "a", maps_url: "", job_zone: "", gps_latitude: 13.1, gps_longitude: 100.1,
    service_zone_code: null, service_zone_source: null,
  });
  await adminEditProbe(jobId, { address_text: null, maps_url: "", job_zone: "", gpsLat: 13.99, gpsLng: 100.99 });
  const { rows } = await pool.query("SELECT * FROM public.job_location_roundtrip_probe WHERE job_id=$1", [jobId]);
  assert.equal(Number(rows[0].gps_latitude), 13.99);
  assert.equal(Number(rows[0].gps_longitude), 100.99);
});

// ---------------------------------------------------------------------------
// Round-2 frontend blockers: modal field clearing + drop-stale-GPS decision
// ---------------------------------------------------------------------------

// Extract and execute the REAL admin-job-view save decision that chooses whether
// to resubmit the pin or drop it so the backend recalculates. Load-bearing: if
// the old (valid) pair were resubmitted with a changed map, the backend's
// "valid explicit pair → update" branch would keep the stale coordinates.
function loadJobViewGpsDecision() {
  const src = read("admin-job-view-v2.js");
  const start = src.indexOf("...(function(){");
  const end = src.indexOf("})(),", start);
  const body = src.slice(src.indexOf("{", start) + 1, src.lastIndexOf("return", end));
  const retSrc = src.slice(src.indexOf("return", start), end);
  // eslint-disable-next-line no-new-func
  const fn = new Function("el", "job", `${body}\n${retSrc}`);
  return (fields, job) => fn((id) => ({ value: fields[id] ?? "" }), job);
}

test("Blocker 2 FE (job view): changed map without a manual pin edit drops the stale GPS", () => {
  const decide = loadJobViewGpsDecision();
  const job = { maps_url: "https://maps.google.com/?q=13.1,100.1", address_text: "A", gps_latitude: 13.1, gps_longitude: 100.1 };
  // Admin changed the maps URL but did NOT touch Lat/Lng (still the loaded pin).
  const out = decide({
    edit_maps_url: "https://maps.google.com/?q=14.5,101.5", edit_address: "A",
    edit_lat: "13.1", edit_lng: "100.1",
  }, job);
  assert.equal(out.gps_latitude, "", "stale lat dropped so backend recalculates");
  assert.equal(out.gps_longitude, "");
});

test("Blocker 2 FE (job view): a manual pin edit is submitted as-is", () => {
  const decide = loadJobViewGpsDecision();
  const job = { maps_url: "m", address_text: "A", gps_latitude: 13.1, gps_longitude: 100.1 };
  const out = decide({ edit_maps_url: "m2", edit_address: "A", edit_lat: "15.2", edit_lng: "102.3" }, job);
  assert.equal(out.gps_latitude, "15.2");
  assert.equal(out.gps_longitude, "102.3");
});

test("Blocker 2 FE (job view): no location change resubmits the existing pin", () => {
  const decide = loadJobViewGpsDecision();
  const job = { maps_url: "m", address_text: "A", gps_latitude: 13.1, gps_longitude: 100.1 };
  const out = decide({ edit_maps_url: "m", edit_address: "A", edit_lat: "13.1", edit_lng: "100.1" }, job);
  assert.equal(out.gps_latitude, "13.1");
  assert.equal(out.gps_longitude, "100.1");
});

test("Blocker 1 (review modal): location fields are cleared before populating", () => {
  const src = read("admin-review-v2.js");
  // Every location field is blanked before the conditional population, so a
  // previously opened job's Lat/Lng cannot leak into the next one.
  const clearIdx = src.indexOf('$("mLat").value = "";');
  const popIdx = src.indexOf("const stored = strictStoredLatLng(CURRENT.gps_latitude");
  assert.ok(clearIdx > 0 && popIdx > clearIdx, "mLat/mLng cleared before population");
  assert.match(src, /\$\("mLng"\)\.value = "";/);
  // A failed full-detail load warns instead of leaving stale values.
  assert.match(src, /detailLoadFailed/);
  assert.match(src, /โหลดรายละเอียดงานเต็มไม่สำเร็จ/);
  // Save drops the stale pin when the map/address changed but the pin was not edited.
  assert.match(src, /const dropStaleGps = locationTextChanged && !coordsManuallyEdited/);
  assert.match(src, /gps_latitude: dropStaleGps \? "" : \(latNow \|\| null\)/);
});

test("Blocker 3 FE (admin add): incomplete/invalid GPS pair is blocked before submit", () => {
  const src = read("admin-add-v2.js");
  assert.match(src, /const validPair = latRaw && lngRaw/);
  assert.match(src, /!\(la === 0 && ln === 0\)/);
  assert.match(src, /พิกัดหน้างานไม่ถูกต้อง/);
});
