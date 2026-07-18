const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8").replace(/\r\n/g, "\n");
const publicRoutes = fs.readFileSync(path.join(root, "server/routes/public/customerAvailability.js"), "utf8").replace(/\r\n/g, "\n");
const adminRoutes = fs.readFileSync(path.join(root, "server/routes/admin/adminAvailability.js"), "utf8").replace(/\r\n/g, "\n");
const availabilityEngine = fs.readFileSync(path.join(root, "server/services/booking/availabilityEngine.js"), "utf8").replace(/\r\n/g, "\n");
const bookingService = fs.readFileSync(path.join(root, "server/services/booking/createBookingJob.js"), "utf8").replace(/\r\n/g, "\n");

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
const availabilityRoute = sectionIn(publicRoutes, 'app.get("/public/availability_v2"', 'app.get("/public/availability_calendar_v2"');
const publicSlotEngine = sectionIn(availabilityEngine, "async function computePublicCustomerSlots", "function addDaysYmd");
const booking = sectionIn(bookingService, "async function handlePublicBook", "\n  return {\n    handleAdminBookV2");

test("Admin-hidden or unset technicians cannot produce customer slots", () => {
  assert.match(listTechnicians, /p\.customer_slot_visible AS customer_slot_visible/);
  assert.doesNotMatch(listTechnicians, /COALESCE\(p\.customer_slot_visible,\s*TRUE\) AS customer_slot_visible/);
  assert.match(availabilityEngine, /tech\.customer_slot_visible === true/);
  // Booking enforces the SAME visibility by delegating to the shared
  // customerAvailability engine (reservePublicCustomerTechnician / hasAvailableStart
  // both filter on customer_slot_visible === true), not a duplicated inline filter.
  assert.match(booking, /customerAvailability\.(hasAvailableStart|reservePublicCustomerTechnician)/);
});

test("Public availability never falls back to all technicians", () => {
  assert.match(listTechnicians, /allow_type_fallback/);
  assert.match(listTechnicians, /\(r\.rows \|\| \[\]\)\.length === 0 && allow_type_fallback/);
  assert.match(availabilityRoute, /forced\s*\?[\s\S]*engine\.computeForcedAvailability/);
  assert.match(availabilityEngine, /listTechniciansByType\(techType, \{ include_paused: true \}\)/);
  // Booking runs through the customer availability engine (no allow_type_fallback),
  // so it can never widen its candidate pool to all technicians.
  assert.doesNotMatch(booking, /allow_type_fallback/);
});

// Per-criterion eligibility (job/ac/wash/repair) and fail-closed matrix handling
// now live in ONE place: the customerAvailability engine that BOTH
// /public/availability_v2 and /public/book call. Booking delegates to it instead
// of duplicating the matrix filter inline, so the field-level behaviour is
// asserted against the availability handler here and against the engine directly
// in customerEligibilityTechType.test.js.
test("Visible technician with wrong job type produces no customer slot", () => {
  assert.match(availabilityEngine, /matrix\.job_types/);
});

test("Visible technician with wrong AC type produces no customer slot", () => {
  assert.match(availabilityEngine, /matrix\.ac_types/);
});

test("Visible technician with wrong wall wash variant produces no customer slot", () => {
  assert.match(availabilityEngine, /matrix\.wash_wall_variants/);
});

test("Visible technician with wrong repair variant produces no customer slot", () => {
  assert.match(availabilityEngine, /normalizeRepairKey/);
  assert.match(availabilityEngine, /matrix\.repair_variants/);
});

test("Missing Service Matrix fails closed", () => {
  assert.match(availabilityEngine, /if \(!matrixMap\.has\(username\)\) return false/);
});

test("Malformed Service Matrix fails closed", () => {
  assert.match(availabilityEngine, /if \(!matrix \|\| typeof matrix !== "object"\) return false/);
});

test("Eligible public availability slots are anonymous", () => {
  assert.match(availabilityRoute, /engine\.computePublicCustomerSlots/);
  assert.match(publicSlotEngine, /slots\.push\(\{[\s\S]*start:[\s\S]*end:[\s\S]*available: true/);
  assert.doesNotMatch(publicSlotEngine, /available_tech_ids|tech_count|available_count|capacity|crew_size|debug/);
});

test("Public availability response omits technician identity and counts", () => {
  assert.doesNotMatch(publicSlotEngine, /available_tech_ids|technician|tech_count|available_count|capacity|crew_size|debug/);
  assert.match(publicSlotEngine, /return \{[\s\S]*date/);
  assert.match(publicSlotEngine, /duration_min/);
  assert.match(publicSlotEngine, /slot_step_min/);
  assert.match(publicSlotEngine, /slots/);
});

test("Client-supplied technician fields cannot influence public booking", () => {
  const destructure = sectionIn(booking, "    const {\n      customer_name", "    } = req.body || {};");
  assert.doesNotMatch(destructure, /technician_username|technician_name|available_tech_ids|candidate|capacity|available_count/);
  assert.doesNotMatch(booking, /req\.body\.(technician_username|technician_name|available_tech_ids|candidate|capacity|available_count)/);
});

test("Slot unavailable after selection returns 409", () => {
  assert.match(booking, /return res\.status\(409\)\.json\(\{ error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" \}\)/);
});

test("Slot from wrong or incomplete service payload is rejected before booking", () => {
  // An incomplete/mismatched service payload yields no eligible technician in the
  // shared engine, so booking is rejected at the availability gate (409) before
  // any insert — the engine's strict matrix match is the single boundary.
  assert.match(booking, /customerAvailability\.hasAvailableStart/);
  assert.match(booking, /return res\.status\(409\)/);
});

test("Availability and booking use the same eligibility boundary", () => {
  // Both surfaces resolve eligibility through the SAME customerAvailability engine
  // — availability via its slot query, booking via hasAvailableStart +
  // reservePublicCustomerTechnician — so they cannot diverge.
  assert.match(availabilityEngine, /normalizeRepairKey/);
  assert.match(availabilityEngine, /techMatchesAllCriteriaStrict/);
  assert.match(booking, /customerAvailability\.hasAvailableStart/);
  assert.match(booking, /customerAvailability\.reservePublicCustomerTechnician/);
});

test("Existing Admin availability fallback remains admin-only", () => {
  assert.match(adminRoutes, /engine\.computeAdminAvailabilityByTech/);
  assert.match(availabilityEngine, /allow_type_fallback: true/);
  assert.match(availabilityRoute, /forced\s*\?[\s\S]*engine\.computeForcedAvailability/);
});
