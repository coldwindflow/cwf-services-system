"use strict";

// Issue 316 - the customer can pin the job site in BOTH booking flows.
//
// Before this change:
//   - bookingScheduled.js had no geolocation at all, only a free-text
//     "ลิงก์ Google Maps" input;
//   - handlePublicBook discarded any pin that did arrive on a non-urgent
//     booking: `bm === "urgent" && gps_latitude != null ? ... : null`.
// So a scheduled job always reached the technician with gps_latitude = NULL,
// and app.js openMaps() - which navigates by coordinate first - had nothing to
// use but the free-text address.
//
// The pin must never be enforced by the UI alone: the server validates every
// customer-submitted pair with the same rules for both flows.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  validateCustomerLocationPin,
  persistableLocationPin,
  PIN_ELIGIBLE_BOOKING_MODES,
} = require("../server/services/booking/customerLocationPin");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const scheduledSource = read("customer-app/modules/bookingScheduled.js");
const urgentSource = read("customer-app/modules/bookingUrgent.js");

// The scheduled module's pin helpers, lifted out and run for real.
function loadScheduledPinHelpers() {
  const start = scheduledSource.indexOf("function normalizePin(source) {");
  const end = scheduledSource.indexOf("function clearLocationPin()");
  assert.ok(start > 0 && end > start, "pin helpers not found in bookingScheduled.js");
  const context = {};
  vm.runInNewContext(`${scheduledSource.slice(start, end)}\n;__api = { normalizePin, hasLocationPin, formatPin };`, context);
  return context.__api;
}

// ---------------------------------------------------------------------------
// 1) Server: the pin is a property of the booking, not of the booking mode
// ---------------------------------------------------------------------------

test("Issue 316: a scheduled booking now persists a valid pin instead of dropping it", () => {
  const pin = persistableLocationPin("scheduled", 13.7563, 100.5018);
  assert.deepEqual({ ...pin }, { latitude: 13.7563, longitude: 100.5018 });
  // urgent keeps working exactly as before
  assert.deepEqual({ ...persistableLocationPin("urgent", 13.7563, 100.5018) }, { latitude: 13.7563, longitude: 100.5018 });
  assert.equal(PIN_ELIGIBLE_BOOKING_MODES.has("scheduled"), true);
  assert.equal(PIN_ELIGIBLE_BOOKING_MODES.has("urgent"), true);
});

test("Issue 316: scheduled and urgent are held to identical validation rules", () => {
  const bad = [
    [null, 100.5], [13.7, null], ["", 100.5], [13.7, "   "],   // half pairs
    [0, 0], ["0", "0"],                                          // the null island
    [91, 100.5], [-91, 100.5], [13.7, 181], [13.7, -181],        // out of range
    ["abc", "def"], [NaN, NaN], [Infinity, 100.5],               // not finite
  ];
  for (const [lat, lng] of bad) {
    for (const mode of ["scheduled", "urgent"]) {
      const pin = persistableLocationPin(mode, lat, lng);
      assert.equal(pin.latitude, null, `${mode} must reject ${JSON.stringify([lat, lng])}`);
      assert.equal(pin.longitude, null, `${mode} must reject ${JSON.stringify([lat, lng])}`);
    }
    assert.equal(validateCustomerLocationPin(lat, lng).ok, false);
  }
  // no pin at all stays valid - pinning is optional in both flows
  assert.equal(validateCustomerLocationPin(null, null).ok, true);
  assert.equal(validateCustomerLocationPin(undefined, undefined).ok, true);
});

test("Issue 316: a booking mode that is not a customer flow still gets no pin", () => {
  for (const mode of ["", null, undefined, "contact_admin", "offer", "admin"]) {
    const pin = persistableLocationPin(mode, 13.7563, 100.5018);
    assert.equal(pin.latitude, null, `mode ${JSON.stringify(mode)} must not gain a pin`);
  }
});

test("Issue 316: handlePublicBook validates the pin server-side and no longer hardcodes urgent", () => {
  const source = read("server/services/booking/createBookingJob.js");
  // the old mode-gated drop is gone
  assert.doesNotMatch(source, /bm === "urgent" && gps_latitude != null/);
  assert.doesNotMatch(source, /bm === "urgent" && gps_longitude != null/);
  // and is replaced by the shared helper
  assert.match(source, /const persistedPin = persistableLocationPin\(bm, gps_latitude, gps_longitude\);/);
  assert.match(source, /const persistedGpsLatitude = persistedPin\.latitude;/);
  assert.match(source, /const persistedGpsLongitude = persistedPin\.longitude;/);
  // a customer-app request with a broken pair is rejected before anything is stored
  assert.match(source, /clientApp === "customer_app_v2" && \(coordFieldProvided\(gps_latitude\) \|\| coordFieldProvided\(gps_longitude\)\)/);
  assert.match(source, /code: "INVALID_GPS"/);
  assert.match(source, /ข้อมูลตำแหน่งไม่ถูกต้อง กรุณาปักหมุดใหม่อีกครั้ง/);
  // the urgent path keeps its own pre-validation untouched
  assert.match(source, /urgentPublicAdapter\.validateCustomerUrgentGps\(incoming\.gps_latitude, incoming\.gps_longitude\)/);
});

// ---------------------------------------------------------------------------
// 2) Client: the scheduled flow can pin, in Thai, with real states
// ---------------------------------------------------------------------------

test("Issue 316: the scheduled pin helpers accept only a complete, sane pair", () => {
  const { normalizePin, hasLocationPin, formatPin } = loadScheduledPinHelpers();
  // spread first: the helpers run in a vm realm, so compare by value not identity
  assert.deepEqual({ ...normalizePin({ gps_latitude: 13.7563, gps_longitude: 100.5018 }) }, { latitude: 13.7563, longitude: 100.5018 });
  assert.deepEqual({ ...normalizePin({ gps_latitude: "13.7563", gps_longitude: "100.5018" }) }, { latitude: 13.7563, longitude: 100.5018 });
  for (const source of [
    {}, { gps_latitude: 13.7 }, { gps_longitude: 100.5 },
    { gps_latitude: 0, gps_longitude: 0 },
    { gps_latitude: 91, gps_longitude: 100.5 },
    { gps_latitude: 13.7, gps_longitude: 181 },
    { gps_latitude: "abc", gps_longitude: "def" },
    { gps_latitude: null, gps_longitude: null },
  ]) {
    assert.equal(normalizePin(source), null, `must reject ${JSON.stringify(source)}`);
    assert.equal(hasLocationPin(source), false);
  }
  assert.equal(formatPin({ gps_latitude: 13.756331, gps_longitude: 100.501765 }), "13.75633, 100.50177");
  assert.equal(formatPin({}), "");
});

test("Issue 316: the scheduled step 2 UI offers the pin in Thai with loading/success/error states", () => {
  assert.match(scheduledSource, /ปักหมุดตำแหน่งบ้าน/);
  assert.match(scheduledSource, /data-scheduled-action="use-location"/);
  assert.match(scheduledSource, /data-scheduled-action="clear-location"/);
  assert.match(scheduledSource, /กำลังอ่านตำแหน่ง\.\.\./);      // loading
  assert.match(scheduledSource, /ใช้ตำแหน่งปัจจุบัน/);           // idle
  assert.match(scheduledSource, /ปักหมุดใหม่/);                  // already pinned
  assert.match(scheduledSource, /ปักหมุดตำแหน่งสำเร็จ ช่างจะนำทางมาที่จุดนี้/); // success
  assert.match(scheduledSource, /คุณปฏิเสธสิทธิ์ตำแหน่ง/);        // permission denied
  assert.match(scheduledSource, /อ่านตำแหน่งหมดเวลา/);           // timeout
  assert.match(scheduledSource, /เบราว์เซอร์นี้ไม่รองรับการอ่านตำแหน่ง/); // unsupported
  assert.match(scheduledSource, /ลบหมุดแล้ว/);                    // cleared
  // the button must be disabled while reading, so it cannot be double-tapped
  assert.match(scheduledSource, /wizard\.locationStatus === "loading" \? "disabled" : ""/);
  // no English leaked into the Thai UI
  const pinBlock = scheduledSource.slice(scheduledSource.indexOf("ปักหมุดตำแหน่งบ้าน"), scheduledSource.indexOf("data-scheduled-field=\"job_zone\""));
  assert.doesNotMatch(pinBlock, /\b(?:Use|Current|Location|Pin|Save|Remove)\b/);
});

test("Issue 316: the scheduled payload carries the pin only as a complete pair", () => {
  assert.match(scheduledSource, /\.\.\.\(normalizePin\(d\) \? \{ gps_latitude: normalizePin\(d\)\.latitude, gps_longitude: normalizePin\(d\)\.longitude \} : \{\}\)/);
  // editing the map link by hand must drop a now-stale pin
  assert.match(scheduledSource, /if \(field === "maps_url" && hasLocationPin\(draft\(\)\)\)/);
  assert.match(scheduledSource, /patch\.gps_latitude = null;/);
  // the review step tells the customer the pin is what the technician will use
  assert.match(scheduledSource, /hasLocationPin\(d\) \? `ปักหมุดแล้ว/);
});

test("Issue 316: the scheduled draft and wizard carry the pin fields", () => {
  const state = read("customer-app/modules/state.js");
  const scheduledDraft = state.slice(state.indexOf("function defaultScheduledDraft"), state.indexOf("function defaultUrgentDraft"));
  assert.match(scheduledDraft, /gps_latitude: null/);
  assert.match(scheduledDraft, /gps_longitude: null/);
  assert.match(state, /locationStatus: "idle"/);
  assert.match(state, /locationMessage: ""/);
  // resetting the draft must clear the pin state too
  assert.match(state, /this\.scheduledWizard = \{ step: 1, maxStep: MAX_SCHEDULED_STEP, error: "", locationStatus: "idle", locationMessage: "" \}/);
});

test("Issue 316: the urgent flow is untouched", () => {
  assert.match(urgentSource, /data-urgent-action="use-location"/);
  assert.match(urgentSource, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(urgentSource, /gps_latitude: latitude/);
  assert.match(urgentSource, /root\.state\.setUrgentFlow\(\{ locationStatus: "success"/);
});

// ---------------------------------------------------------------------------
// 3) Cache contract
// ---------------------------------------------------------------------------

test("Issue 316: the customer runtime is cache-busted and admin ids stay put", () => {
  const BUILD = "20260821_issue316_scheduled_location_pin_v1";
  assert.match(read("customer-app/sw.js"), new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(read("customer-app/assets/customer-app.js"), new RegExp(`BUILD_ID = "${BUILD}"`));
  assert.match(read("customer-app/index.html"), new RegExp(`modules/bookingScheduled\\.js\\?v=${BUILD}`));
  assert.match(read("customer-app/index.html"), new RegExp(`assets/customer-app\\.css\\?v=${BUILD}`));
  assert.match(read("customer-app/manifest.webmanifest"), new RegExp(BUILD));
  // admin runtimes did not change in this issue, so their ids must not move
  assert.match(read("admin-add-v2.html"), /admin-add-v2\.js\?v=20260820_issue310_package_minimum_quantity_v1/);
  assert.match(read("admin-store-catalog.html"), /admin-store-catalog\.js\?v=20260820_issue310_package_minimum_quantity_v1/);
});
