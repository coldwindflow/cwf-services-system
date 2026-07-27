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
      zone: null,
      counts: {},
      technicians: [],
    };
    const reject = (row, reason) => {
      diagnostics.counts[reason] = Number(diagnostics.counts[reason] || 0) + 1;
      diagnostics.technicians.push({ username: row.username, gate: reason });
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
      if (String(row.accept_status || "").trim().toLowerCase() !== "ready"
        || !row.accept_status_expires_at
        || new Date(row.accept_status_expires_at).getTime() <= Date.now()) {
        reject(row, "ready_expired");
        continue;
      }
      if (!row.matrix_json || !availabilityEngine.techMatchesAllCriteriaStrict(row.matrix_json, criteriaList)) {
        reject(row, "matrix_mismatch");
        continue;
      }
      const calendar = calendarMap.get(row.username);
      if (!calendar) {
        reject(row, "calendar_missing");
        continue;
      }
      if (String(calendar.day_status || "").trim().toLowerCase() !== "working") {
        reject(row, "calendar_not_working");
        continue;
      }
      if (calendar.can_accept_urgent_job !== true) {
        reject(row, "urgent_disabled_for_day");
        continue;
      }
      if (capacityMap.get(row.username) !== true) {
        reject(row, "capacity_full");
        continue;
      }
      if (dependencies.isServiceZoneFilterEnabled()) {
        const home = String(row.home_service_zone_code || "").toUpperCase();
        const secondary = String(row.secondary_service_zone_code || "").toUpperCase();
        if (home !== zone && secondary !== zone && row.allow_out_of_zone !== true) {
          reject(row, "zone_mismatch");
          continue;
        }
      }
      const explicitOff = offMap.get(row.username);
      if (explicitOff === true) {
        reject(row, "explicit_day_off");
        continue;
      }
      if (explicitOff === undefined && weeklyOff(row.weekly_off_days, appointment.date)) {
        reject(row, "weekly_off");
        continue;
      }
      const normalStart = parseMinute(calendar.start_time || row.work_start);
      const normalEnd = parseMinute(calendar.end_time || row.work_end);
      const duration = Math.max(1, Number(job.duration_min || 60));
      const windows = [
        { start: normalStart, end: normalEnd },
        ...(specialMap.get(row.username) || []),
      ];
      const insideWindow = windows.some((window) =>
        Number.isFinite(window.start)
        && Number.isFinite(window.end)
        && appointment.minute >= window.start
        && appointment.minute + duration <= window.end
      );
      if (!insideWindow) {
        reject(row, "outside_work_window");
        continue;
      }
      if (!await isTechFree(row.username, job.appointment_datetime, duration, job.job_id || null, db)) {
        reject(row, "collision_or_travel");
        continue;
      }
      filtered.push(row);
      diagnostics.counts.eligible = Number(diagnostics.counts.eligible || 0) + 1;
      diagnostics.technicians.push({ username: row.username, gate: "eligible" });
    }

    const ranked = rankTechniciansForServiceZone(filtered, zoneCode)
      .map((row) => row.username)
      .slice(0, 30);
    return { available: ranked, zoneCode, totalCandidates: filtered.length, techType, diagnostics };
  }

  return { findEligibleTechnicians };
}

module.exports = {
  bangkokDateAndMinute,
  bangkokWeekday,
  weeklyOff,
  normalizeUrgentTechType,
  isUrgentEmploymentEligible,
  createUrgentDispatchService,
};
