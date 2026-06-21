function toIsoDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function normWorkDayPayload(input = {}){
  // Advance calendar v3 intentionally has only 2 statuses:
  // advance_only = รับงานล่วงหน้า, unavailable = ไม่รับงานล่วงหน้า
  // Holiday/leave are treated as unavailable and can be explained in note.
  let raw = String(input.day_status || '').trim();
  if (input.can_accept_advance_job === true) raw = 'advance_only';
  else if (input.can_accept_advance_job === false) raw = 'unavailable';
  else if (['advance_only','available_advance','working','available','accept'].includes(raw)) raw = 'advance_only';
  else raw = 'unavailable';
  const day_status = raw;
  const canAdvance = day_status === 'advance_only';
  const start_time = canAdvance ? (/^\d{2}:\d{2}$/.test(String(input.start_time || '')) ? String(input.start_time) : '09:00') : null;
  const end_time = canAdvance ? (/^\d{2}:\d{2}$/.test(String(input.end_time || '')) ? String(input.end_time) : '18:00') : null;
  const max_jobs_per_day = canAdvance ? normalizeNullableCap(input.max_jobs_per_day, 20) : null;
  const max_units_per_day = canAdvance ? normalizeNullableCap(input.max_units_per_day, 99) : null;
  return {
    day_status,
    can_accept_advance_job: canAdvance,
    // This calendar is NOT for urgent jobs. Urgent jobs continue using accept_status flow only.
    can_accept_urgent_job: false,
    start_time,
    end_time,
    max_jobs_per_day,
    max_units_per_day,
    note: String(input.note || '').slice(0,500)
  };
}

const SYSTEM_DEFAULT_MAX_JOBS_PER_DAY = 4;
const SYSTEM_DEFAULT_MAX_UNITS_PER_DAY = null;
const LEGACY_DEFAULT_MAX_JOBS_PER_DAY = 1;
const LEGACY_DEFAULT_MAX_UNITS_PER_DAY = 5;

function normalizeNullableCap(value, max){
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (!text || ['null','none','unlimited','auto','available'].includes(text)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(Number(max || 99), Math.floor(n)));
}

function nullableNumber(value){
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveTechnicianCalendarCaps(row = {}){
  const source = String(row?.source || '').trim().toLowerCase();
  const rawMaxJobs = nullableNumber(row?.max_jobs_per_day);
  const rawMaxUnits = nullableNumber(row?.max_units_per_day);
  const hasRawCaps = rawMaxJobs !== null || rawMaxUnits !== null;
  const isLegacySystemDefault = (
    source === 'technician' &&
    rawMaxJobs === LEGACY_DEFAULT_MAX_JOBS_PER_DAY &&
    rawMaxUnits === LEGACY_DEFAULT_MAX_UNITS_PER_DAY
  );
  const isCustom = source === 'technician_custom' || (hasRawCaps && !isLegacySystemDefault && source !== 'technician_default');
  const capMode = isCustom ? 'technician_custom' : (isLegacySystemDefault ? 'legacy_system_default' : 'system_default');
  return {
    cap_mode: capMode,
    raw_max_jobs: rawMaxJobs,
    raw_max_units: rawMaxUnits,
    effective_max_jobs: isCustom ? (rawMaxJobs ?? SYSTEM_DEFAULT_MAX_JOBS_PER_DAY) : SYSTEM_DEFAULT_MAX_JOBS_PER_DAY,
    effective_max_units: isCustom ? (rawMaxUnits ?? SYSTEM_DEFAULT_MAX_UNITS_PER_DAY) : SYSTEM_DEFAULT_MAX_UNITS_PER_DAY,
    is_legacy_system_default: isLegacySystemDefault,
  };
}

function sourceForWorkDayPayload(payload = {}){
  if (payload.can_accept_advance_job !== true || payload.day_status !== 'advance_only') return 'technician_default';
  return (payload.max_jobs_per_day != null || payload.max_units_per_day != null)
    ? 'technician_custom'
    : 'technician_default';
}

function hhmmToMin(value){
  const m = String(value || '').slice(0,5).match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minToHHMM(value){
  const n = Math.max(0, Math.min(24 * 60, Math.floor(Number(value || 0))));
  return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
}

async function countLockedAdvanceJobsForDate(clientOrPool, username, workDate){
  const q = await clientOrPool.query(`
    SELECT COUNT(DISTINCT j.job_id)::int AS job_count
    FROM public.jobs j
    LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
    WHERE (j.technician_username=$1 OR ja.technician_username=$1)
      AND j.appointment_datetime IS NOT NULL
      AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $2::date
      AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
  `, [username, workDate]);
  return Number(q.rows?.[0]?.job_count || 0);
}

async function loadLockedAdvanceUsageForDate(clientOrPool, username, workDate){
  const q = await clientOrPool.query(`
    WITH assigned AS (
      SELECT DISTINCT j.job_id,
             j.appointment_datetime,
             GREATEST(1, COALESCE(j.duration_min,60))::int AS duration_min
        FROM public.jobs j
        LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
       WHERE (j.technician_username=$1 OR ja.technician_username=$1)
         AND j.appointment_datetime IS NOT NULL
         AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $2::date
         AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
    ),
    item_units AS (
      SELECT a.job_id, COALESCE(SUM(NULLIF(ji.qty,0)),0)::int AS units
        FROM assigned a
        LEFT JOIN public.job_items ji ON ji.job_id=a.job_id
       GROUP BY a.job_id
    )
    SELECT a.job_id,
           ((EXTRACT(HOUR FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int * 60)
             + EXTRACT(MINUTE FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int) AS start_min,
           (((EXTRACT(HOUR FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int * 60)
             + EXTRACT(MINUTE FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int)
             + a.duration_min) AS end_min,
           GREATEST(COALESCE(i.units,0),1)::int AS units
      FROM assigned a
      LEFT JOIN item_units i ON i.job_id=a.job_id
  `, [username, workDate]);
  const rows = q.rows || [];
  const usage = rows.reduce((acc, row) => {
    const start = Number(row.start_min);
    const end = Number(row.end_min);
    acc.jobs_count += 1;
    acc.units_count += Math.max(1, Number(row.units || 0));
    if (Number.isFinite(start)) acc.earliest_start_min = Math.min(acc.earliest_start_min, start);
    if (Number.isFinite(end)) acc.latest_end_min = Math.max(acc.latest_end_min, end);
    return acc;
  }, { jobs_count: 0, units_count: 0, earliest_start_min: Infinity, latest_end_min: -Infinity });
  if (!rows.length) {
    usage.earliest_start_min = null;
    usage.latest_end_min = null;
  }
  return usage;
}

function validateLockedDaySafeEdit(payload, usage = {}){
  const jobs = Number(usage.jobs_count || 0);
  if (jobs <= 0) return { ok: true };
  if (!payload || payload.can_accept_advance_job !== true || payload.day_status !== 'advance_only') {
    return { ok: false, code: 'LOCKED_DAY_CANNOT_CLOSE' };
  }
  const startMin = hhmmToMin(payload.start_time);
  const endMin = hhmmToMin(payload.end_time);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return { ok: false, code: 'LOCKED_DAY_INVALID_WINDOW' };
  }
  if (usage.earliest_start_min != null && startMin > Number(usage.earliest_start_min)) {
    return { ok: false, code: 'LOCKED_DAY_START_CUTS_JOB' };
  }
  if (usage.latest_end_min != null && endMin < Number(usage.latest_end_min)) {
    return { ok: false, code: 'LOCKED_DAY_END_CUTS_JOB' };
  }
  if (payload.max_jobs_per_day != null && Number(payload.max_jobs_per_day) < jobs) {
    return { ok: false, code: 'LOCKED_DAY_MAX_JOBS_BELOW_USAGE' };
  }
  const units = Number(usage.units_count || 0);
  if (payload.max_units_per_day != null && Number(payload.max_units_per_day) < units) {
    return { ok: false, code: 'LOCKED_DAY_MAX_UNITS_BELOW_USAGE' };
  }
  return {
    ok: true,
    usage: {
      jobs_count: jobs,
      units_count: units,
      earliest_start: usage.earliest_start_min == null ? null : minToHHMM(usage.earliest_start_min),
      latest_end: usage.latest_end_min == null ? null : minToHHMM(usage.latest_end_min),
    },
  };
}

module.exports = {
  toIsoDate,
  normWorkDayPayload,
  normalizeNullableCap,
  resolveTechnicianCalendarCaps,
  sourceForWorkDayPayload,
  SYSTEM_DEFAULT_MAX_JOBS_PER_DAY,
  SYSTEM_DEFAULT_MAX_UNITS_PER_DAY,
  countLockedAdvanceJobsForDate,
  loadLockedAdvanceUsageForDate,
  validateLockedDaySafeEdit,
};
