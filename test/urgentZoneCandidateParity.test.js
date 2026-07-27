"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectServiceZoneFromLatLng,
  detectServiceZoneFromText,
  publicServiceZoneView,
} = require("../server/services/serviceZoneResolver");
const { createUrgentDispatchService } = require("../server/services/urgent/dispatch");

const ZONE_FIXTURES = [
  ["On Nut", 13.705, 100.601, "A"],
  ["Bang Chak", 13.696, 100.605, "A"],
  ["Punnawithi", 13.689, 100.609, "A"],
  ["Udom Suk", 13.680, 100.609, "A"],
  ["Bang Na", 13.668, 100.604, "A"],
  ["Bearing", 13.661, 100.601, "F"],
  ["Samrong", 13.646, 100.596, "F"],
  ["Thepharak", 13.633, 100.617, "F"],
  ["Mueang Samut Prakan", 13.599, 100.596, "F"],
  ["Bang Phli", 13.606, 100.704, "F"],
];

test("Zone A/F fixtures resolve deterministically and overlapping envelopes are explicit", () => {
  for (const [name, lat, lng, expected] of ZONE_FIXTURES) {
    const first = detectServiceZoneFromLatLng(lat, lng);
    const second = detectServiceZoneFromLatLng(lat, lng);
    assert.equal(first.service_zone_code, expected, name);
    assert.deepEqual(second, first, `${name} changed between calls`);
    assert.ok(Array.isArray(first.coordinate_matches) && first.coordinate_matches.length >= 1, name);
    if (first.coordinate_matches.length > 1) {
      assert.notEqual(first.resolution_rule, "single_envelope", `${name} silently accepted an overlap`);
    }
  }
});

test("job #521 production signature reproduces the legacy F-first zone_mismatch for Zone-A A2MKUNG", () => {
  const lat = 13.668;
  const lng = 100.604;
  const legacyF = lat >= 13.50 && lat <= 13.77 && lng >= 100.58 && lng <= 100.92;
  const legacyA = lat >= 13.62 && lat <= 13.86 && lng >= 100.58 && lng <= 100.86;
  assert.equal(legacyF && legacyA, true, "fixture must reproduce the A/F overlap");
  const legacyFirstMatch = legacyF ? "F" : (legacyA ? "A" : null);
  assert.equal(legacyFirstMatch, "F");
  assert.notEqual(legacyFirstMatch, "A", "legacy candidate gate rejected A2MKUNG as zone_mismatch");
  assert.equal(detectServiceZoneFromLatLng(lat, lng).service_zone_code, "A");
});

test("public zone input cannot override the derived zone but authenticated admin can", async () => {
  const publicResult = await detectServiceZoneFromText({
    address_text: "บางนา",
    service_zone_code: "F",
  });
  assert.equal(publicResult.service_zone_code, "A");

  const adminResult = await detectServiceZoneFromText({
    address_text: "บางนา",
    service_zone_code: "F",
  }, { allowAdminOverride: true });
  assert.equal(adminResult.service_zone_code, "F");
  assert.equal(adminResult.service_zone_source, "admin_override");
});

test("public zone view strips overlap diagnostics", () => {
  const detected = detectServiceZoneFromLatLng(13.668, 100.604);
  const view = publicServiceZoneView(detected);
  assert.equal(view.service_zone_code, "A");
  assert.equal(Object.hasOwn(view, "coordinate_matches"), false);
  assert.equal(Object.hasOwn(view, "resolution_rule"), false);
});

function diagnosticFixture(overrides = {}) {
  const rows = [{
    username: "A2MKUNG",
    employment_type: "company",
    home_service_zone_code: overrides.homeZone || "A",
    secondary_service_zone_code: null,
    allow_out_of_zone: false,
    work_start: "09:00",
    work_end: "18:00",
    weekly_off_days: overrides.weeklyOff || "",
    accept_status: overrides.acceptStatus || "ready",
    accept_status_expires_at: overrides.acceptExpiry || "2099-01-01T00:00:00.000Z",
    matrix_json: overrides.matrix === false ? {} : { all: true },
  }];
  const db = {
    async query(sql) {
      if (/FROM public\.users/.test(sql)) return { rows };
      if (/technician_monthly_work_calendar/.test(sql)) {
        return { rows: overrides.calendarMissing ? [] : [{
          technician_username: "A2MKUNG",
          day_status: "working",
          can_accept_urgent_job: overrides.urgentDisabled !== true,
          start_time: overrides.outsideWindow ? "14:00" : "09:00",
          end_time: "18:00",
        }] };
      }
      if (/technician_workdays_v2/.test(sql)) return { rows: [] };
      if (/technician_special_slots_v2/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const service = createUrgentDispatchService({
    pool: db,
    availabilityEngine: {
      buildCriteriaList: () => [{ job: "ล้าง", ac: "ผนัง", btu: 12000, wash: "ล้างธรรมดา" }],
      validateCriteriaList: () => true,
      techMatchesAllCriteriaStrict: (matrix) => matrix?.all === true,
      loadUrgentCapacityMap: async () => new Map([["A2MKUNG", overrides.capacityFull !== true]]),
    },
    detectServiceZoneFromText,
    rankTechniciansForServiceZone: (values) => values,
    isTechFree: async () => overrides.collision !== true,
    isServiceZoneFilterEnabled: () => true,
  });
  return { service, db };
}

async function runDiagnostic(overrides = {}) {
  const fixture = diagnosticFixture(overrides);
  return fixture.service.findEligibleTechnicians({
    appointment_datetime: "2026-07-27T10:00:00+07:00",
    duration_min: 60,
    address_text: "บางนา",
  }, {
    db: fixture.db,
    techType: "all",
    criteriaList: [{ job: "ล้าง", ac: "ผนัง", btu: 12000, wash: "ล้างธรรมดา" }],
  });
}

test("A2MKUNG production-like fixture passes canonical all-policy candidate gates", async () => {
  const result = await runDiagnostic();
  assert.deepEqual(result.available, ["A2MKUNG"]);
  assert.equal(result.zoneCode, "A");
  assert.equal(result.techType, "all");
  assert.equal(result.diagnostics.counts.eligible, 1);
});

test("canonical diagnostics identify every operational rejection gate", async () => {
  const cases = [
    ["ready_expired", { acceptExpiry: "2020-01-01T00:00:00.000Z" }],
    ["matrix_mismatch", { matrix: false }],
    ["calendar_missing", { calendarMissing: true }],
    ["urgent_disabled_for_day", { urgentDisabled: true }],
    ["capacity_full", { capacityFull: true }],
    ["zone_mismatch", { homeZone: "F" }],
    ["weekly_off", { weeklyOff: "1" }],
    ["outside_work_window", { outsideWindow: true }],
    ["collision_or_travel", { collision: true }],
  ];
  for (const [gate, overrides] of cases) {
    const result = await runDiagnostic(overrides);
    assert.deepEqual(result.available, [], gate);
    assert.equal(result.diagnostics.technicians[0]?.gate, gate, gate);
  }
});
