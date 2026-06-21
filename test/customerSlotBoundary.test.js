const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8").replace(/\r\n/g, "\n");

function section(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

function sectionIn(haystack, start, end) {
  const from = haystack.indexOf(start);
  assert.notEqual(from, -1, `missing nested section start: ${start}`);
  const to = haystack.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing nested section end: ${end}`);
  return haystack.slice(from, to);
}

const listTechnicians = section("async function listTechniciansByType", "function parseWeeklyOffDays");
const availability = section('app.get("/public/availability_v2"', "// Admin: availability by technician");
const booking = section('app.post("/public/book"', 'app.get("/public/track"');

test("Admin-hidden or unset technicians cannot produce customer slots", () => {
  assert.match(listTechnicians, /p\.customer_slot_visible AS customer_slot_visible/);
  assert.doesNotMatch(listTechnicians, /COALESCE\(p\.customer_slot_visible,\s*TRUE\) AS customer_slot_visible/);
  assert.match(availability, /t\.customer_slot_visible === true/);
  assert.match(booking, /t\.customer_slot_visible === true/);
});

test("Public availability never falls back to all technicians", () => {
  assert.match(listTechnicians, /allow_type_fallback/);
  assert.match(listTechnicians, /\(r\.rows \|\| \[\]\)\.length === 0 && allow_type_fallback/);
  assert.match(availability, /listTechniciansByType\(tech_type,\s*\{ include_paused: true,\s*allow_type_fallback: forced \}\)/);
  assert.match(booking, /listTechniciansByType\(requestedTechType,\s*\{ include_paused: bm === "scheduled" \}\)/);
});

test("Visible technician with wrong job type produces no customer slot", () => {
  assert.match(availability, /matrix\.job_types/);
  assert.match(booking, /mx\.job_types/);
});

test("Visible technician with wrong AC type produces no customer slot", () => {
  assert.match(availability, /matrix\.ac_types/);
  assert.match(booking, /mx\.ac_types/);
});

test("Visible technician with wrong wall wash variant produces no customer slot", () => {
  assert.match(availability, /matrix\.wash_wall_variants/);
  assert.match(booking, /mx\.wash_wall_variants/);
});

test("Visible technician with wrong repair variant produces no customer slot", () => {
  assert.match(availability, /normalizeRepairKey/);
  assert.match(availability, /matrix\.repair_variants/);
  assert.match(booking, /normalizeRepairKey/);
  assert.match(booking, /mx\.repair_variants/);
});

test("Missing Service Matrix fails closed", () => {
  assert.match(availability, /if \(!matrixMap\.has\(u\)\) return false/);
  assert.match(booking, /if \(!matrixMap\.has\(u\)\) return false/);
});

test("Malformed Service Matrix fails closed", () => {
  assert.match(availability, /if \(!matrix \|\| typeof matrix !== 'object'\) return false/);
  assert.match(booking, /if \(!mx \|\| typeof mx !== 'object'\) return false/);
});

test("Eligible public availability slots are anonymous", () => {
  assert.match(availability, /slots:\s*outSlots/);
  assert.match(availability, /map\(s => \(\{ start: s\.start,\s*end: s\.end,\s*available: !!s\.available \}\)\)/);
  assert.match(availability, /const isPublicCustomer = !forced/);
});

test("Public availability response omits technician identity and counts", () => {
  const publicReturn = sectionIn(availability, "if (isPublicCustomer) {\n        return res.json({", "      return res.json({");
  const finalPublicReturn = sectionIn(availability, "if (isPublicCustomer) {\n      return res.json({", "    res.json({");
  assert.doesNotMatch(publicReturn, /available_tech_ids|technician|tech_count|available_count|capacity|crew_size|debug/);
  assert.doesNotMatch(finalPublicReturn, /available_tech_ids|technician|tech_count|available_count|capacity|crew_size|debug/);
  assert.match(publicReturn, /date/);
  assert.match(publicReturn, /duration_min/);
  assert.match(publicReturn, /slot_step_min/);
  assert.match(publicReturn, /slots/);
  assert.match(finalPublicReturn, /date/);
  assert.match(finalPublicReturn, /duration_min/);
  assert.match(finalPublicReturn, /slot_step_min/);
  assert.match(finalPublicReturn, /slots/);
});

test("Client-supplied technician fields cannot influence public booking", () => {
  const destructure = sectionIn(booking, "  const {\n    customer_name", "  } = req.body || {};");
  assert.doesNotMatch(destructure, /technician_username|technician_name|available_tech_ids|candidate|capacity|available_count/);
  assert.doesNotMatch(booking, /req\.body\.(technician_username|technician_name|available_tech_ids|candidate|capacity|available_count)/);
});

test("Slot unavailable after selection returns 409", () => {
  assert.match(booking, /return res\.status\(409\)\.json\(\{ error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" \}\)/);
});

test("Slot from wrong or incomplete service payload is rejected before booking", () => {
  assert.match(booking, /CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED/);
  assert.match(booking, /rawCriteria\.some\(c => !hasCompleteCriteria\(c\)\)/);
});

test("Availability and booking use the same eligibility boundary", () => {
  for (const token of ["normalizeJobKey", "normalizeAcKey", "normalizeWashKey", "normalizeRepairKey"]) {
    assert.match(availability, new RegExp(token));
    assert.match(booking, new RegExp(token));
  }
  assert.match(availability, /techMatchesAllCriteriaStrict/);
  assert.match(booking, /listCriteria\.every\(c => techMatches\(mx, c\)\)/);
});

test("Existing Admin availability fallback remains admin-only", () => {
  const adminAvailability = section('app.get("/admin/availability_by_tech_v2"', 'app.get("/public/availability"');
  assert.match(adminAvailability, /listTechniciansByType\(tech_type,\s*\{ include_paused,\s*allow_type_fallback: true \}\)/);
  assert.match(availability, /allow_type_fallback: forced/);
});
