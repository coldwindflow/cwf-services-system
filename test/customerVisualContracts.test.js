const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("visual unification keeps Customer App route contracts", () => {
  const shell = read("customer-app/assets/customer-app.js");
  assert.match(shell, /home: App\.ui\.renderHome/);
  assert.match(shell, /store: App\.store\.render/);
  assert.match(shell, /storeItem: App\.store\.renderDetail/);
  assert.match(shell, /booking: App\.ui\.renderBookingMode/);
  assert.match(shell, /scheduled: App\.bookingScheduled\.render/);
  assert.match(shell, /urgent: App\.bookingUrgent\.render/);
  assert.match(shell, /tracking: App\.tracking\.render/);
  assert.match(shell, /profile: App\.profile\.render/);
});

test("visual unification keeps scheduled booking data hooks and submit API contract", () => {
  const scheduled = read("customer-app/modules/bookingScheduled.js");
  for (const hook of [
    "data-booking-step",
    "data-line-choice",
    "data-line-field",
    "data-scheduled-field",
    "data-calendar-month",
    "data-calendar-date",
    "data-real-slot-key",
    "data-time-proposal",
    "data-action",
    "submit-scheduled",
  ]) {
    assert.match(scheduled, new RegExp(hook));
  }
  assert.match(scheduled, /root\.api\.previewPricing/);
  assert.match(scheduled, /root\.api\.loadAvailabilityCalendar/);
  assert.match(scheduled, /root\.api\.loadAvailability/);
  assert.match(scheduled, /root\.api\.submitScheduledBooking\(buildSubmitPayload\(\)\)/);
});

test("visual unification keeps urgent, tracking, and profile hooks intact", () => {
  const urgent = read("customer-app/modules/bookingUrgent.js");
  const tracking = read("customer-app/modules/tracking.js");
  const profile = read("customer-app/modules/profile.js");

  for (const hook of ["data-urgent-step", "data-urgent-field", "data-urgent-choice", "data-urgent-action", "confirm", "track-created"]) {
    assert.match(urgent, new RegExp(hook));
  }
  assert.match(urgent, /root\.api\.submitUrgentRequest\(buildSubmitPayload\(\)\)/);
  assert.match(urgent, /แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง/);

  for (const hook of ["data-action=\"track-read\"", "data-tracking-result", "data-tracking-view", "data-tracking-panel", "data-review-form"]) {
    assert.match(tracking, new RegExp(hook.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(tracking, /root\.api\.trackBooking\(q\)/);
  assert.match(tracking, /new FormData\(form\)\.entries\(\)/);

  for (const hook of ["data-auth-panel", "data-profile-address", "data-profile-address-form", "data-profile-address-edit", "data-profile-address-cancel"]) {
    assert.match(profile, new RegExp(hook));
  }
  assert.match(profile, /root\.api\.updateProfileAddress/);
});

test("visual unification remains scoped to customer app routes", () => {
  const css = read("customer-app/assets/customer-app.css");
  assert.match(css, /CUSTOMER HOMEPAGE CMS REBASE/);
  assert.match(css, /\.homepage-screen/);
  assert.match(css, /\.homepage-hero/);
  assert.match(css, /\.homepage-service-card/);
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*max-width:\s*480px/);
  // Booking tile is rendered on .nav-item-primary::before's own background, in the same
  // flex flow as the icon/label — never a ::after overlay (which could drift from or
  // cover the label).
  assert.doesNotMatch(css, /\.nav-item-primary::after/);
  assert.match(css, /\.nav-item-primary::before\s*\{[\s\S]*width:\s*52px[\s\S]*height:\s*52px/);
  assert.match(css, /\.nav-item-primary::before\s*\{[\s\S]*background:\s*var\(--ico-book\) center \/ 24px 24px no-repeat, linear-gradient\(145deg, #ffd43b, #ffbd17\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*position:\s*fixed/);
});
