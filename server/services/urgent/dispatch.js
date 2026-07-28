"use strict";

const { loadCanonicalServiceCriteria } = require("../booking/bookingJobUnits");

function bangkokDateAndMinute(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: (Number(parts.hour) * 60) + Number(parts.minute),
  };
}

function parseMinute(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return NaN;
  return (Number(match[1]) * 60) + Number(match[2]);
}

const URGENT_TECH_TYPES = new Set(["partner", "company", "all"]);

function normalizeUrgentTechType(value, fallback = "partner") {
  const raw = value === undefined || value === null ? fallback : value;
  const techType = String(raw).trim().toLowerCase();
  if (!URGENT_TECH_TYPES.has(techType)) {
    const error = new Error("tech_type ต้องเป็น partner|company|all");
    error.statusCode = 400;
    error.code = "INVALID_URGENT_TECH_TYPE";
    throw error;
  }
  return techType;
}

function isUrgentEmploymentEligible(employmentType, techType) {
  const scope = normalizeUrgentTechType(techType);
  const employment = String(employmentType || "company").trim().toLowerCase() || "company";
  if (scope === "all") return ["partner", "company", "custom", "special_only"].includes(employment);
  if (scope === "company") return ["company", "custom", "special_only"].includes(employment);
  return employment === "partner";
}

function bangkokWeekday(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return NaN;
  return date.getUTCDay();
}

function weeklyOff(weeklyOffDays, dateText) {
  const day = bangkokWeekday(dateText);
  if (!Number.isInteger(day)) return false;
  return String(weeklyOffDays || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-6]$/.test(value))
    .map(Number)
    .some((value) => value === day);
}

function shiftBangkokAppointment(value, minutes) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + (Number(minutes) * 60 * 1000));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(shifted).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00+07:00`;
}

function publicReasonForDiagnostics(diagnostics) {
  if (Number(diagnostics?.counts?.eligible || 0) > 0) return null;
  const failures = (diagnostics?.technicians || [])
    .flatMap((row) => Array.isArray(row.failed_gates) ? row.failed_gates : [row.gate])
    .filter(Boolean);
  const timeGates = new Set([
    "calendar_missing",
    "calendar_not_working",
    "urgent_disabled_for_day",
    "capacity_full",
    "explicit_day_off",
    "weekly_off",
    "outside_work_window",
    "collision_or_travel",
  ]);
  return failures.length > 0 && failures.every((gate) => timeGates.has(gate))
    ? "time_unavailable"
    : "no_technician_available";
}

function createUrgentDispatchService(dependencies = {}) {
  const {
    pool,
    availabilityEngine,
    detectServiceZoneFromText,
    rankTechniciansForServiceZone,
    isTechFree,
  } = dependencies;

  async function findEligibleTechnicians(job, options = {}) {
    const db = options.db || pool;
    const techType = normalizeUrgentTechType(options.techType, "partner");
    const appointment = bangkokDateAndMinute(job.appointment_datetime);
    const diagnostics = {
      dispatch_policy: techType,
      appointment_datetime: job.appointment_datetime || null,
      duration_min: Number(job.duration_min || 60),
      effective_block_min: Math.max(
        Number(job.duration_min || 60),
        Number(job.effective_block_min || job.duration_min || 60),
      ),
      zone: null,
      counts: {},
      technicians: [],
    };
    const reject = (row, failedGates, checks) => {
      for (const reason of failedGates) {
        diagnostics.counts[reason] = Number(diagnostics.counts[reason] || 0) + 1;
      }
      diagnostics.technicians.push({
        username: row.username,
        gate: failedGates[0],
        failed_gates: failedGates,
        checks,
      });
    };
    if (!appointment) {
      diagnostics.counts.outside_work_window = 1;
      return { available: [], zoneCode: null, totalCandidates: 0, techType, diagnostics };
    }

    const detected = await detectServiceZoneFromText({
      address_text: job.address_text,
      job_zone: job.job_zone,
      service_zone_code: job.service_zone_code,
      service_zone_source: job.service_zone_source,
      maps_url: job.maps_url,
      gps_latitude: job.gps_latitude,
      gps_longitude: job.gps_longitude,
    }, { trustedPersistedZone: Boolean(job.service_zone_code) });
    const zoneCode = detected?.service_zone_code || job.service_zone_code || null;
    diagnostics.zone = {
      service_zone_code: zoneCode,
      service_zone_source: detected?.service_zone_source || null,
      coordinate_matches: detected?.coordinate_matches || [],
      resolution_rule: detected?.resolution_rule || null,
    };
    if (dependencies.isServiceZoneFilterEnabled() && !zoneCode) {
      diagnostics.counts.zone_mismatch = 1;
      return { available: [], zoneCode: null, totalCandidates: 0, techType, diagnostics };
    }

    let criteriaList;
    if (Array.isArray(options.criteriaList) && options.criteriaList.length) {
      criteriaList = options.criteriaList;
    } else if (job.job_id) {
      const persistedServices = await loadCanonicalServiceCriteria(db, job.job_id);
      criteriaList = availabilityEngine.buildCriteriaList({ services: persistedServices });
    } else {
      criteriaList = availabilityEngine.buildCriteriaList(job);
    }
    if (!availabilityEngine.validateCriteriaList(criteriaList)) {
      diagnostics.counts.matrix_mismatch = 1;
      return { available: [], zoneCode, totalCandidates: 0, techType, diagnostics };
    }

    const candidates = await db.query(
      `SELECT u.username,
              u.role AS account_role,
              p.username AS profile_username,
              COALESCE(p.employment_type,'company') AS employment_type,
              p.home_service_zone_code,
              p.secondary_service_zone_code,
              COALESCE(p.allow_out_of_zone,FALSE) AS allow_out_of_zone,
              COALESCE(p.work_start,'09:00') AS work_start,
              COALESCE(p.work_end,'18:00') AS work_end,
              COALESCE(p.weekly_off_days,'') AS weekly_off_days,
              COALESCE(p.accept_status,'paused') AS accept_status,
              p.accept_status_expires_at,
              m.matrix_json
         FROM public.users u
         JOIN public.technician_profiles p ON p.username=u.username
         LEFT JOIN public.technician_service_matrix m ON m.username=u.username
        WHERE u.role='technician'
          AND (
                $1::text = 'all'
             OR ($1::text = 'company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
             OR ($1::text = 'partner' AND COALESCE(p.employment_type,'company') = 'partner')
          )
        ORDER BY u.username`,
      [techType]
    );

    const candidateRows = (candidates.rows || [])
      .filter((row) => isUrgentEmploymentEligible(row.employment_type, techType));
    diagnostics.counts.input_employment = candidateRows.length;
    const usernames = candidateRows.map((row) => row.username);
    const [calendars, overrides, specialSlots] = await Promise.all([
      usernames.length
        ? db.query(
          `SELECT technician_username, day_status, can_accept_urgent_job,
                  start_time, end_time, max_jobs_per_day, max_units_per_day, source
             FROM public.technician_monthly_work_calendar
            WHERE work_date=$1::date
              AND technician_username=ANY($2::text[])`,
          [appointment.date, usernames]
        )
        : { rows: [] },
      usernames.length
        ? db.query(
          `SELECT technician_username, is_off
             FROM public.technician_workdays_v2
            WHERE work_date=$1::date
              AND technician_username=ANY($2::text[])`,
          [appointment.date, usernames]
        )
        : { rows: [] },
      usernames.length
        ? db.query(
          `SELECT technician_username, start_time, end_time
             FROM public.technician_special_slots_v2
            WHERE slot_date=$1::date
              AND technician_username=ANY($2::text[])`,
          [appointment.date, usernames]
        )
        : { rows: [] },
    ]);
    const calendarMap = new Map((calendars.rows || []).map((row) => [row.technician_username, row]));
    const capacityMap = await availabilityEngine.loadUrgentCapacityMap(
      db,
      appointment.date,
      usernames,
      calendarMap,
      { ...job, ignore_job_id: job.job_id || null },
    );
    const offMap = new Map((overrides.rows || []).map((row) => [row.technician_username, row.is_off === true]));
    const specialMap = new Map();
    for (const row of specialSlots.rows || []) {
      if (!specialMap.has(row.technician_username)) specialMap.set(row.technician_username, []);
      specialMap.get(row.technician_username).push({
        start: parseMinute(row.start_time),
        end: parseMinute(row.end_time),
      });
    }

    const zone = String(zoneCode || "").toUpperCase();
    const filtered = [];
    for (const row of candidateRows) {
      const calendar = calendarMap.get(row.username);
      const explicitOff = offMap.get(row.username);
      const normalStart = parseMinute(calendar?.start_time || row.work_start);
      const normalEnd = parseMinute(calendar?.end_time || row.work_end);
      const duration = Math.max(1, Number(job.duration_min || 60));
      const windowBlockDuration = Math.max(duration, Number(job.effective_block_min || duration));
      const specialWindows = specialMap.get(row.username) || [];
      const windows = [
        { start: normalStart, end: normalEnd },
        ...specialWindows,
      ];
      const insideWindow = windows.some((window) =>
        Number.isFinite(window.start)
        && Number.isFinite(window.end)
        && appointment.minute >= window.start
        && appointment.minute + windowBlockDuration <= window.end
      );
      const home = String(row.home_service_zone_code || "").toUpperCase();
      const secondary = String(row.secondary_service_zone_code || "").toUpperCase();
      const zonePass = !dependencies.isServiceZoneFilterEnabled()
        || home === zone
        || secondary === zone
        || row.allow_out_of_zone === true;
      const collisionPass = await isTechFree(
        row.username,
        job.appointment_datetime,
        duration,
        job.job_id || null,
        db,
      );
      const checks = {
        account_profile_active: String(row.account_role || "technician") === "technician"
          && Boolean(row.profile_username || row.username),
        ready: String(row.accept_status || "").trim().toLowerCase() === "ready",
        ready_expiry: Boolean(row.accept_status_expires_at)
          && new Date(row.accept_status_expires_at).getTime() > Date.now(),
        service_matrix: Boolean(row.matrix_json)
          && availabilityEngine.techMatchesAllCriteriaStrict(row.matrix_json, criteriaList),
        calendar_exists: Boolean(calendar),
        calendar_working: String(calendar?.day_status || "").trim().toLowerCase() === "working",
        urgent_enabled_for_day: calendar?.can_accept_urgent_job === true,
        capacity: capacityMap.get(row.username) === true,
        zone: zonePass,
        day_override: explicitOff !== true,
        weekly_off: explicitOff !== undefined || !weeklyOff(row.weekly_off_days, appointment.date),
        work_window: insideWindow,
        special_slot: specialWindows.some((window) =>
          Number.isFinite(window.start)
          && Number.isFinite(window.end)
          && appointment.minute >= window.start
          && appointment.minute + windowBlockDuration <= window.end
        ),
        collision_travel: collisionPass,
      };
      const failedGates = [];
      if (!checks.account_profile_active) failedGates.push("account_profile_inactive");
      if (!checks.ready || !checks.ready_expiry) failedGates.push("ready_expired");
      if (!checks.service_matrix) failedGates.push("matrix_mismatch");
      if (!checks.calendar_exists) failedGates.push("calendar_missing");
      else if (!checks.calendar_working) failedGates.push("calendar_not_working");
      if (checks.calendar_exists && !checks.urgent_enabled_for_day) failedGates.push("urgent_disabled_for_day");
      if (!checks.capacity) failedGates.push("capacity_full");
      if (!checks.zone) failedGates.push("zone_mismatch");
      if (!checks.day_override) failedGates.push("explicit_day_off");
      if (!checks.weekly_off) failedGates.push("weekly_off");
      if (!checks.work_window) failedGates.push("outside_work_window");
      if (!checks.collision_travel) failedGates.push("collision_or_travel");
      if (failedGates.length) {
        reject(row, failedGates, checks);
        continue;
      }
      filtered.push(row);
      diagnostics.counts.eligible = Number(diagnostics.counts.eligible || 0) + 1;
      diagnostics.technicians.push({ username: row.username, gate: "eligible", failed_gates: [], checks });
    }

    const ranked = rankTechniciansForServiceZone(filtered, zoneCode)
      .map((row) => row.username)
      .slice(0, 30);
    return { available: ranked, zoneCode, totalCandidates: filtered.length, techType, diagnostics };
  }

  async function preflightUrgentDispatch(job, options = {}) {
    const result = await findEligibleTechnicians(job, options);
    const response = {
      can_dispatch: result.available.length > 0,
      reason: publicReasonForDiagnostics(result.diagnostics),
      zoneCode: result.zoneCode,
      nearby_times: [],
      internal: result,
    };
    if (response.can_dispatch || options.includeNearbyTimes !== true) return response;

    const appointment = bangkokDateAndMinute(job.appointment_datetime);
    if (!appointment) return response;
    const remainder = appointment.minute % 15;
    const firstShift = remainder === 0 ? 15 : 15 - remainder;
    for (let offset = firstShift; offset <= 360 && response.nearby_times.length < 3; offset += 15) {
      const candidateAppointment = shiftBangkokAppointment(job.appointment_datetime, offset);
      if (!candidateAppointment || candidateAppointment.slice(0, 10) !== appointment.date) break;
      const nearby = await findEligibleTechnicians(
        { ...job, appointment_datetime: candidateAppointment },
        { ...options, includeNearbyTimes: false },
      );
      if (nearby.available.length > 0) {
        response.nearby_times.push(candidateAppointment);
      }
    }
    if (response.nearby_times.length > 0) response.reason = "time_unavailable";
    return response;
  }

  return { findEligibleTechnicians, preflightUrgentDispatch };
}

module.exports = {
  bangkokDateAndMinute,
  bangkokWeekday,
  weeklyOff,
  publicReasonForDiagnostics,
  normalizeUrgentTechType,
  isUrgentEmploymentEligible,
  createUrgentDispatchService,
};
