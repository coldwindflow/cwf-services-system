"use strict";

const {
  loadCustomerScheduledLoadMap,
  rankCustomerScheduledCandidates,
} = require("../public/customerScheduledAssignment");
const { resolveTechnicianCalendarCaps } = require("../../lib/technicianCalendar");
const jobTiming = require("../jobTiming");

const SLOT_STEP_MIN = 30;
const DEFAULT_UI_START = "09:00";
const DEFAULT_UI_END = "18:00";
const CANCELLED_STATUSES = new Set(["à¸¢à¸à¹€à¸¥à¸´à¸", "cancelled", "canceled"]);
const REASON_STATUS = {
  AVAILABLE: "available",
  NO_TECHNICIAN_TYPE: "no_open_slots",
  NO_CUSTOMER_VISIBLE_TECH: "no_open_slots",
  TECH_OFF: "no_open_slots",
  NO_MATCHING_SERVICE_MATRIX: "no_open_slots",
  NO_ADVANCE_CALENDAR_ROW: "no_open_slots",
  ADVANCE_CLOSED: "no_open_slots",
  NO_ADVANCE_TIME_WINDOW: "no_open_slots",
  INVALID_ADVANCE_WINDOW: "error",
  CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED: "error",
  CAPACITY_FULL: "full",
  COLLISION_FULL: "full",
};
const REASON_PRIORITY = [
  "CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED",
  "CAPACITY_FULL",
  "COLLISION_FULL",
  "INVALID_ADVANCE_WINDOW",
  "NO_ADVANCE_TIME_WINDOW",
  "NO_ADVANCE_CALENDAR_ROW",
  "ADVANCE_CLOSED",
  "NO_MATCHING_SERVICE_MATRIX",
  "TECH_OFF",
  "NO_CUSTOMER_VISIBLE_TECH",
  "NO_TECHNICIAN_TYPE",
];

function makeDiagnostic() {
  const codes = new Set();
  return {
    add(code) {
      if (code) codes.add(String(code));
    },
    primary() {
      for (const code of REASON_PRIORITY) {
        if (codes.has(code)) return code;
      }
      return codes.values().next().value || "";
    },
    codes() {
      return Array.from(codes);
    },
  };
}

function publicDiagnostic(code) {
  const reason = code || "NO_ADVANCE_TIME_WINDOW";
  return {
    availability_status: REASON_STATUS[reason] || "no_open_slots",
    reason_code: reason,
  };
}

function normalizeJobKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("à¸•à¸´à¸”à¸•à¸±à¹‰à¸‡") || v.includes("install")) return "install";
  if (v.includes("à¸‹à¹ˆà¸­à¸¡") || v.includes("repair")) return "repair";
  if (v.includes("à¸¥à¹‰à¸²à¸‡") || v.includes("wash") || v.includes("clean")) return "wash";
  return null;
}

function normalizeAcKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("à¸œà¸™à¸±à¸‡") || v.includes("wall")) return "wall";
  if (v.includes("à¸ªà¸µà¹ˆà¸—à¸´à¸¨") || v.includes("4") || v.includes("four")) return "fourway";
  if (v.includes("à¹à¸‚à¸§à¸™")) return "hanging";
  if (v.includes("à¹ƒà¸•à¹‰à¸à¹‰à¸²") || v.includes("à¹€à¸›à¸¥à¸·à¸­à¸¢") || v.includes("à¸à¸±à¸‡")) return "ceiling";
  return null;
}

function normalizeWashKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("à¸˜à¸£à¸£à¸¡à¸”à¸²") || v.includes("à¸›à¸à¸•à¸´") || v.includes("normal")) return "normal";
  if (v.includes("à¸žà¸£à¸µà¹€à¸¡à¸µà¸¢à¸¡") || v.includes("premium")) return "premium";
  if (v.includes("à¹à¸‚à¸§à¸™à¸„à¸­à¸¢") || v.includes("coil")) return "coil";
  if (v.includes("à¸•à¸±à¸”à¸¥à¹‰à¸²à¸‡") || v.includes("overhaul") || v.includes("à¹ƒà¸«à¸à¹ˆ")) return "overhaul";
  return null;
}

function normalizeRepairKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("à¸£à¸±à¹ˆà¸§") || v.includes("leak")) return "leak_check";
  if (v.includes("à¸­à¸°à¹„à¸«à¸¥à¹ˆ") || v.includes("part")) return "parts";
  if (v.includes("à¸•à¸£à¸§à¸ˆ") || v.includes("inspect")) return "inspection";
  if (v.includes("à¸—à¸±à¹ˆà¸§à¹„à¸›") || v.includes("general")) return "general";
  return v.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function parseServices(rawServices) {
  if (Array.isArray(rawServices)) return rawServices;
  if (!rawServices) return null;
  try {
    const parsed = JSON.parse(String(rawServices));
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildCriteriaList(input = {}) {
  const services = parseServices(input.services);
  const fallback = {
    job_type: input.job_type || input.jobType,
    ac_type: input.ac_type || input.acType,
    wash_variant: input.wash_variant || input.washVariant,
    repair_variant: input.repair_variant || input.repairVariant,
  };
  const source = services && services.length ? services : [fallback];
  const list = source.map((service) => ({
    job: normalizeJobKey(service.job_type || fallback.job_type),
    ac: normalizeAcKey(service.ac_type || fallback.ac_type),
    wash: normalizeWashKey(service.wash_variant || fallback.wash_variant),
    repair: normalizeRepairKey(service.repair_variant || fallback.repair_variant),
    repair_variant: String(service.repair_variant || fallback.repair_variant || "").trim() || null,
  }));
  return list;
}

function hasCompleteCriteria(criteria) {
  return Boolean(
    criteria && criteria.job && criteria.ac &&
    !(criteria.job === "wash" && criteria.ac === "wall" && !criteria.wash) &&
    !(criteria.job === "repair" && !criteria.repair_variant)
  );
}

function validateCriteriaList(list) {
  return Array.isArray(list) && list.length > 0 && list.every(hasCompleteCriteria);
}

function techMatchesMatrixStrict(matrix, criteria) {
  if (!matrix || typeof matrix !== "object") return false;
  const mustTrue = (obj, key) => {
    if (!key) return true;
    if (!obj || typeof obj !== "object") return false;
    return Boolean(obj[key]);
  };
  const hasTrue = (obj, keys) => {
    if (!obj || typeof obj !== "object") return false;
    return (keys || []).filter(Boolean).some((key) => Boolean(obj[key]));
  };
  if (!mustTrue(matrix.job_types, criteria.job)) return false;
  if (!mustTrue(matrix.ac_types, criteria.ac)) return false;
  if (criteria.job === "wash" && criteria.ac === "wall") {
    if (!mustTrue(matrix.wash_wall_variants, criteria.wash)) return false;
  }
  if (criteria.job === "repair" && criteria.repair_variant) {
    if (!hasTrue(matrix.repair_variants, [criteria.repair, criteria.repair_variant])) return false;
  }
  return true;
}

function techMatchesAllCriteriaStrict(matrix, criteriaList) {
  if (!validateCriteriaList(criteriaList)) return false;
  return criteriaList.every((criteria) => techMatchesMatrixStrict(matrix, criteria));
}

async function loadServiceMatrixMap(pool, usernames) {
  if (!Array.isArray(usernames) || !usernames.length) return new Map();
  const result = await pool.query(
    "SELECT username, matrix_json FROM public.technician_service_matrix WHERE username = ANY($1::text[])",
    [usernames]
  );
  const map = new Map();
  for (const row of result.rows || []) map.set(String(row.username), row.matrix_json || {});
  return map;
}

async function loadSpecialMap(pool, date) {
  const map = new Map();
  const result = await pool.query(
    `SELECT technician_username, start_time, end_time
     FROM public.technician_special_slots_v2
     WHERE slot_date=$1::date`,
    [date]
  );
  for (const row of result.rows || []) {
    const username = row.technician_username;
    if (!map.has(username)) map.set(username, []);
    map.get(username).push({ start: row.start_time, end: row.end_time });
  }
  return map;
}

function serviceUnitCount(options = {}) {
  const services = parseServices(options.services);
  const source = services && services.length ? services : [options];
  return source.reduce((sum, service) => {
    const n = Number(service && service.machine_count);
    return sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
  }, 0);
}

async function loadAdvanceCalendarMap(db, date, usernames, lockRows = false) {
  const names = (Array.isArray(usernames) ? usernames : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!names.length) return new Map();
  const result = await db.query(
    `SELECT technician_username, work_date::date AS work_date, day_status, can_accept_advance_job,
            start_time, end_time, max_jobs_per_day, max_units_per_day, source
       FROM public.technician_monthly_work_calendar
      WHERE technician_username = ANY($1::text[])
        AND work_date=$2::date
      ${lockRows ? "FOR UPDATE" : ""}`,
    [names, date]
  );
  const map = new Map();
  for (const row of result.rows || []) map.set(String(row.technician_username), row);
  return map;
}

async function loadDailyUsageMap(db, date, usernames, ignoreJobId) {
  const names = (Array.isArray(usernames) ? usernames : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!names.length) return new Map();
  const params = [names, date];
  let ignoreSql = "";
  if (ignoreJobId) {
    params.push(Number(ignoreJobId));
    ignoreSql = `AND j.job_id <> $${params.length}`;
  }
  const result = await db.query(
    `WITH assigned AS (
       SELECT j.job_id, COALESCE(ja.technician_username, j.technician_username) AS technician_username
         FROM public.jobs j
         LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id
        WHERE COALESCE(ja.technician_username, j.technician_username) = ANY($1::text[])
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date=$2::date
          ${ignoreSql}
          AND COALESCE(j.job_status,'') <> ALL($${params.length + 1}::text[])
     ),
     item_units AS (
       SELECT a.technician_username, a.job_id, COALESCE(SUM(NULLIF(ji.qty,0)),0)::int AS units
         FROM assigned a
         LEFT JOIN public.job_items ji ON ji.job_id=a.job_id
        GROUP BY a.technician_username, a.job_id
     )
     SELECT technician_username,
            COUNT(DISTINCT job_id)::int AS jobs_count,
            COALESCE(SUM(GREATEST(units,1)),0)::int AS units_count
       FROM item_units
      GROUP BY technician_username`,
    [...params, Array.from(CANCELLED_STATUSES)]
  );
  const map = new Map();
  for (const row of result.rows || []) {
    map.set(String(row.technician_username), {
      jobs_count: Number(row.jobs_count || 0),
      units_count: Number(row.units_count || 0),
    });
  }
  return map;
}

async function loadUrgentCapacityMap(db, date, usernames, calendarMap, options = {}) {
  const names = (Array.isArray(usernames) ? usernames : [])
    .map((username) => String(username || "").trim())
    .filter(Boolean);
  const usageMap = await loadDailyUsageMap(db, date, names, options.ignore_job_id);
  const requestedUnits = serviceUnitCount(options);
  const result = new Map();
  for (const username of names) {
    const calendar = calendarMap instanceof Map ? calendarMap.get(username) : null;
    if (!calendar) {
      result.set(username, false);
      continue;
    }
    const usage = usageMap.get(username) || { jobs_count: 0, units_count: 0 };
    const caps = resolveTechnicianCalendarCaps(calendar);
    const jobsOk = !(Number.isFinite(caps.effective_max_jobs)
      && caps.effective_max_jobs >= 1
      && usage.jobs_count >= caps.effective_max_jobs);
    const unitsOk = !(Number.isFinite(caps.effective_max_units)
      && caps.effective_max_units >= 1
      && usage.units_count + requestedUnits > caps.effective_max_units);
    result.set(username, jobsOk && unitsOk);
  }
  return result;
}

function bangkokTodayYmd(nowParts) {
  if (nowParts && nowParts.ymd) return String(nowParts.ymd).slice(0, 10);
  if (nowParts && nowParts.dateStr) return String(nowParts.dateStr).slice(0, 10);
  if (nowParts && nowParts.Y && nowParts.M && nowParts.D) return `${nowParts.Y}-${nowParts.M}-${nowParts.D}`;
  return new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function minimumStartForOptions(date, deps, uiStartMin, uiEndMin) {
  let nowParts = null;
  try {
    nowParts = typeof deps.getNowBangkokParts === "function" ? deps.getNowBangkokParts() : jobTiming.getBangkokNow();
  } catch (_) {
    nowParts = jobTiming.getBangkokNow();
  }
  return jobTiming.minimumStartForDate(date, {
    ui_start_min: uiStartMin,
    ui_end_min: uiEndMin,
    slot_step_min: SLOT_STEP_MIN,
    now_parts: nowParts,
  });
}

async function eligibleCustomerTechnicians(deps, options) {
  const {
    pool,
    listTechniciansByType,
  } = deps;
  const date = options.date;
  const techType = options.tech_type || "company";
  const criteriaList = buildCriteriaList(options);
  const diagnostic = options.diagnostic || null;
  if (!validateCriteriaList(criteriaList)) {
    diagnostic?.add("CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED");
    const error = new Error("CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED");
    error.status = 400;
    throw error;
  }

  const allTechs = await listTechniciansByType(techType, { include_paused: true });
  if (!(allTechs || []).length) diagnostic?.add("NO_TECHNICIAN_TYPE");
  const visibleTechs = (allTechs || []).filter((tech) => tech && tech.customer_slot_visible === true);
  if (!visibleTechs.length) diagnostic?.add("NO_CUSTOMER_VISIBLE_TECH");
  // Defect E: technician_monthly_work_calendar is the single source of truth for scheduled
  // customer availability. An explicit monthly opt-in (can_accept_advance_job=true for the date)
  // must NOT be closed by legacy weekly_off_days / technician_workdays_v2. Eligibility for the
  // date is therefore decided solely by the monthly calendar gate below, not by legacy off-days.
  // (Urgent Booking keeps its own legacy off-day handling elsewhere and is untouched.)
  const matrixMap = await loadServiceMatrixMap(pool, visibleTechs.map((tech) => tech.username));
  const matrixMatched = visibleTechs.filter((tech) => {
    const username = String(tech.username || "");
    if (!matrixMap.has(username)) return false;
    return techMatchesAllCriteriaStrict(matrixMap.get(username), criteriaList);
  });
  if (visibleTechs.length && !matrixMatched.length) diagnostic?.add("NO_MATCHING_SERVICE_MATRIX");
  const calendarMap = await loadAdvanceCalendarMap(pool, date, matrixMatched.map((tech) => tech.username), Boolean(options.lock_calendar_rows));
  const requestedUnits = serviceUnitCount(options);
  const usageMap = await loadDailyUsageMap(pool, date, matrixMatched.map((tech) => tech.username), options.ignore_job_id);
  let missingCalendar = 0;
  let closedCalendar = 0;
  let invalidWindow = 0;
  let capacityFull = 0;
  const eligible = matrixMatched.filter((tech) => {
    const username = String(tech.username || "");
    const calendar = calendarMap.get(username);
    if (!calendar) {
      missingCalendar += 1;
      return false;
    }
    if (calendar.can_accept_advance_job !== true) {
      closedCalendar += 1;
      return false;
    }
    const start = String(calendar.start_time || "").slice(0, 5);
    const end = String(calendar.end_time || "").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      invalidWindow += 1;
      retuë¸¶‰žËkºwµçh€€€€€™½È€¡½¹ÍÐÝ¥¹‘½Ü½˜Ý¥¹‘½ÝÌñðmt¤ì4(€€€€€€€½¹ÍÐÍÑ…ÉÐ€ôÑ½5¥¸¡Ý¥¹‘½Ü¹ÍÑ…ÉÐ¤ì4(€€€€€€€½¹ÍÐ•¹€ôÑ½5¥¸¡Ý¥¹‘½Ü¹•¹¤ì4(€€€€€€€¥˜€¡9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÍÑ…ÉÐ¤€˜˜9Õµ‰•È¹¥Í¥¹¥Ñ”¡•¹¤€˜˜•¹€øÍÑ…ÉÐ¤ì4(€€€€€€€€€Õ¥MÑ…ÉÑ5¥¸€ô5…Ñ ¹µ¥¸¡Õ¥MÑ…ÉÑ5¥¸°ÍÑ…ÉÐ¤ì4(€€€€€€€€€Õ¥¹‘5¥¸€ô5…Ñ ¹µ…à¡Õ¥¹‘5¥¸°•¹¤ì4(€€€€€€€ô4(€€€€€ô4(€€€ô4(€ô4(4(€ÑÉäì4(€€€½¹ÍÐ¹½Ü€ô•Ñ9½Ý	…¹­½­A…ÉÑÌ ¤ì4(€€€½¹ÍÐÑ½‘…ä€ô€‘í¹½Ü¹eô´‘í¹½Ü¹5ô´‘í¹½Ü¹õ€ì4(€€€¥˜€¡µ½‘”€ôôô€‰ÍÑ…ÉÐˆ€˜˜‘…Ñ”€ôôôÑ½‘…ä¤ì4(€€€€€½¹ÍÐ¹½Ý5¥¸€ô¹½Ü¹¡ €¨€ØÀ€¬¹½Ü¹µ´ì4(€€€€€½¹ÍÐÉ½Õ¹‘•€ô5…Ñ ¹•¥°¡¹½Ý5¥¸€¼Í±½ÑMÑ•Á5¥¸¤€¨Í±½ÑMÑ•Á5¥¸ì4(€€€€€Õ¥MÑ…ÉÑ5¥¸€ô5…Ñ ¹µ…à¡Õ¥MÑ…ÉÑ5¥¸°5…Ñ ¹µ¥¸¡É½Õ¹‘•°Õ¥¹‘5¥¸¤¤ì4(€€€ô4(€ô…Ñ €¡|¤ì4(€€€€¼¼AÉ•Í•ÉÙ”Ñ¡”±•…ä™…¥°µ½Á•¸‰•¡…Ù¥½È™½ÈÑ¥µ•é½¹”™½Éµ…ÑÑ¥¹œ™…¥±ÕÉ•Ì¸4(€ô4(4(€½¹ÍÐ•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸€ô5…Ñ ¹µ…à Ä°9Õµ‰•È¡‘ÕÉ…Ñ¥½¹5¥¸ñð€À¤¤ì4(€½¹ÍÐ•™™•Ñ¥Ù•	±½­5¥¸€ô•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸€¬ÑÉ…Ù•±	Õ™™•É5¥¸ì4(€½¹ÍÐ•Ù•¹ÑÌ€ô¹•Ü5…À ¤ì4(€½¹ÍÐ…‘‘Ù•¹Ð€ô€¡µ¥¹ÕÑ”°ÑåÁ”°ÕÍ•É¹…µ”¤€ôøì4(€€€½¹ÍÐ­•ä€ô5…Ñ ¹É½Õ¹¡µ¥¹ÕÑ”¤ì4(€€€¥˜€ …•Ù•¹ÑÌ¹¡…Ì¡­•ä¤¤•Ù•¹ÑÌ¹Í•Ð¡­•ä°ì…‘èmt°É•µ½Ù”èmtô¤ì4(€€€•Ù•¹ÑÌ¹•Ð¡­•ä¥mÑåÁ•t¹ÁÕÍ ¡ÕÍ•É¹…µ”¤ì4(€ôì4(4(€™½È€¡½¹ÍÐÑ• ½˜Ñ•¡Ì¤ì4(€€€½¹ÍÐÝ¥¹‘½ÝÌ€ô‰Õ¥±‘Q•¡]¥¹‘½ÝÍ5¥¸¡Ñ• °‘…Ñ”°ÍÁ•¥…±5…À°Õ¥MÑ…ÉÑ5¥¸°Õ¥¹‘5¥¸¤ì4(€€€¥˜€ …Ý¥¹‘½ÝÌ¹±•¹Ñ ¤½¹Ñ¥¹Õ”ì4(€€€½¹ÍÐ‰ÕÍå	±½­Ì€ô…Ý…¥Ð±¥ÍÑ	ÕÍå	±½­Í½ÉQ•¡=¹…Ñ”¡Ñ• ¹ÕÍ•É¹…µ”°‘…Ñ”°¹Õ±°¤ì4(€€€™½È€¡½¹ÍÐÝ¥¹‘½Ü½˜Ý¥¹‘½ÝÌ¤ì4(€€€€€¥˜€¡µ½‘”€ôôô€‰™É•”ˆ¤ì4(€€€€€€€½¹ÍÐ‰ÕÍä€ô‰Õ¥±‘	ÕÍå%¹Ñ•ÉÙ…±Í½¹Í•ÉÙ…Ñ¥Ù”¡‰ÕÍå	±½­Ì¤ì4(€€€€€€€½¹ÍÐ™É•”€ô‰Õ¥±‘É••%¹Ñ•ÉÙ…±Í½É]¥¹‘½Ü¡‰ÕÍä°Ý¥¹‘½Ü¹ÍÑ…ÉÑ5¥¸°Ý¥¹‘½Ü¹•¹‘5¥¸¤ì4(€€€€€€€¥˜€¡‘•‰Õ±…œ¤ì4(€€€€€€€€€‘•‰Õ	ÕÍåmÑ• ¹ÕÍ•É¹…µ•t€ô€¡‘•‰Õ	ÕÍåmÑ• ¹ÕÍ•É¹…µ•tñðmt¤¹½¹…Ð 4(€€€€€€€€€€€‰ÕÍä¹µ…À ¡‰±½¬¤€ôø€¡ìÍÑ…ÉÐè™µÑ!!55É½µ5¥¸¡‰±½¬¹ÍÑ…ÉÑ5¥¸¤°•¹è™µÑ!!55É½µ5¥¸¡‰±½¬¹•¹‘5¥¸¤ô¤¤4(€€€€€€€€€€¤ì4(€€€€€€€€€‘•‰ÕÉ••mÑ• ¹ÕÍ•É¹…µ•t€ô€¡‘•‰ÕÉ••mÑ• ¹ÕÍ•É¹…µ•tñðmt¤¹½¹…Ð 4(€€€€€€€€€€€™É•”¹µ…À ¡‰±½¬¤€ôø€¡ìÍÑ…ÉÐè™µÑ!!55É½µ5¥¸¡‰±½¬¹ÍÑ…ÉÑ5¥¸¤°•¹è™µÑ!!55É½µ5¥¸¡‰±½¬¹•¹‘5¥¸¤ô¤¤4(€€€€€€€€€€¤ì4(€€€€€€€ô4(€€€€€€€™½È€¡½¹ÍÐ¥¹Ñ•ÉÙ…°½˜™É•”¤ì4(€€€€€€€€€…‘‘Ù•¹Ð¡¥¹Ñ•ÉÙ…°¹ÍÑ…ÉÑ5¥¸°€‰…‘ˆ°Ñ• ¹ÕÍ•É¹…µ”¤ì4(€€€€€€€€€…‘‘Ù•¹Ð¡¥¹Ñ•ÉÙ…°¹•¹‘5¥¸°€‰É•µ½Ù”ˆ°Ñ• ¹ÕÍ•É¹…µ”¤ì4(€€€€€€€ô4(€€€€€ô•±Í”ì4(€€€€€€€½¹ÍÐ¥¹Ñ•ÉÙ…±Ì€ô‰Õ¥±‘MÑ…ÉÑ%¹Ñ•ÉÙ…±Í	å½±±¥Í¥½¸ 4(€€€€€€€€€‰ÕÍå	±½­Ì°4(€€€€€€€€€Ý¥¹‘½Ü¹ÍÑ…ÉÑ5¥¸°4(€€€€€€€€€Ý¥¹‘½Ü¹•¹‘5¥¸°4(€€€€€€€€€•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸4(€€€€€€€€¤ì4(€€€€€€€¥˜€¡‘•‰Õ±…œ¤ì4(€€€€€€€€€½¹ÍÐ‰ÕÍä€ô‰Õ¥±‘	ÕÍå%¹Ñ•ÉÙ…±Í½¹Í•ÉÙ…Ñ¥Ù”¡‰ÕÍå	±½­Ì¤ì4(€€€€€€€€€½¹ÍÐ™É•”€ô‰Õ¥±‘É••%¹Ñ•ÉÙ…±Í½É]¥¹‘½Ü¡‰ÕÍä°Ý¥¹‘½Ü¹ÍÑ…ÉÑ5¥¸°Ý¥¹‘½Ü¹•¹‘5¥¸¤ì4(€€€€€€€€€‘•‰Õ	ÕÍåmÑ• ¹ÕÍ•É¹…µ•t€ô€¡‘•‰Õ	ÕÍåmÑ• ¹ÕÍ•É¹…µ•tñðmt¤¹½¹…Ð 4(€€€€€€€€€€€‰ÕÍä¹µ…À ¡‰±½¬¤€ôø€¡ìÍÑ…ÉÐè™µÑ!!55É½µ5¥¸¡‰±½¬¹ÍÑ…ÉÑ5¥¸¤°•¹è™µÑ!!55É½µ5¥¸¡‰±½¬¹•¹‘5¥¸¤ô¤¤4(€€€€€€€€€€¤ì4(€€€€€€€€€‘•‰ÕÉ••mÑ• ¹ÕÍ•É¹…µ•t€ô€¡‘•‰ÕÉ••mÑ• ¹ÕÍ•É¹…µ•tñðmt¤¹½¹…Ð 4(€€€€€€€€€€€™É•”¹µ…À ¡‰±½¬¤€ôø€¡ìÍÑ…ÉÐè™µÑ!!55É½µ5¥¸¡‰±½¬¹ÍÑ…ÉÑ5¥¸¤°•¹è™µÑ!!55É½µ5¥¸¡‰±½¬¹•¹‘5¥¸¤ô¤¤4(€€€€€€€€€€¤ì4(€€€€€€€ô4(€€€€€€€™½È€¡½¹ÍÐ¥¹Ñ•ÉÙ…°½˜¥¹Ñ•ÉÙ…±Ì¤ì4(€€€€€€€€€…‘‘Ù•¹Ð¡¥¹Ñ•ÉÙ…°¹ÍÑ…ÉÑ5¥¸°€‰…‘ˆ°Ñ• ¹ÕÍ•É¹…µ”¤ì4(€€€€€€€€€…‘‘Ù•¹Ð¡¥¹Ñ•ÉÙ…°¹•¹‘5¥¸€¬€Ä°€‰É•µ½Ù”ˆ°Ñ• ¹ÕÍ•É¹…µ”¤ì4(€€€€€€€ô4(€€€€€ô4(€€€ô4(€ô4(4(€¥˜€ …•Ù•¹ÑÌ¹Í¥é”¤ì4(€€€¥˜€¡‘•‰Õ±…œ¤ì4(€€€€€‘•‰ÕI•…Í½¹Ì¹ÁÕÍ ¡ì4(€€€€€€€½‘”è€‰9=}Y9QLˆ°4(€€€€€€€µ•ÍÍ…”è€‹‚æ‚â‡‚æ#‚â‡‚â×‚â+‚æ#‚âŸ‚â‚æ‚âŸ‚â—‚âË‚âŸ‚æ#‚âË‚â¿‚â+‚æ#‚âŸ‚â‚æ‚â‚âÓ‚æ#‚â‡‚â‚âË‚âg‚æ‚âg‚â¯‚âg‚æ'‚âË‚âW‚æ#‚âË‚â‚æ‚âŸ‚â—‚âË‚â_‚â×‚æ#‚æ‚â«‚âS‚â€£‚â·‚âË‚â#‚æ‚â‚âÓ‚âS‚â#‚âË‚â‚âŸ‚âÇ‚âg‚â¯‚â‹‚âã‚âP¿‚æ‚â‡‚æ#‚â‡‚âÔÍÁ•¥…°Í±½Ð¿‚â¯‚â‚âß‚â·‚â[‚âç‚â‰ÕÍä‰±½¬ƒ‚â_‚âÇ‚æ'‚â‚â¯‚â‡‚âP¤ˆ°4(€€€€€ô¤ì4(€€€ô4(€€€½¹Í½±”¹±½œ ‰m…Ù…¥±…‰¥±¥Ñå}ØÉtˆ°ì4(€€€€€‘…Ñ”°4(€€€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€€€™½É•èÑÉÕ”°4(€€€€€‘ÕÉ…Ñ¥½¹}µ¥¸è‘ÕÉ…Ñ¥½¹5¥¸°4(€€€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€€€•™™•Ñ¥Ù•}‘ÕÉ…Ñ¥½¹}µ¥¸è•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸°4(€€€€€Ñ•¡}½Õ¹ÐèÑ•¡½Õ¹Ð°4(€€€€€Í±½ÑÌè€À°4(€€€€€É•…Í½¸è‘•‰ÕI•…Í½¹Ì¹µ…À ¡É•…Í½¸¤€ôøÉ•…Í½¸¹½‘”¤¹©½¥¸ ˆ°ˆ¤°4(€€€ô¤ì4(€€€É•ÑÕÉ¸ì4(€€€€€‘…Ñ”°4(€€€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€€€™½É•èÑÉÕ”°4(€€€€€Ý½É­}ÍÑ…ÉÐèÝ½É­MÑ…ÉÐ°4(€€€€€Ý½É­}•¹èÝ½É­¹°4(€€€€€ÑÉ…Ù•±}‰Õ™™•É}µ¥¸èÑÉ…Ù•±	Õ™™•É5¥¸°4(€€€€€‘ÕÉ…Ñ¥½¹}µ¥¸è•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸°4(€€€€€•™™•Ñ¥Ù•}‰±½­}µ¥¸è•™™•Ñ¥Ù•	±½­5¥¸°4(€€€€€Í±½Ñ}ÍÑ•Á}µ¥¸èÍ±½ÑMÑ•Á5¥¸°4(€€€€€Ñ•¡}½Õ¹ÐèÑ•¡½Õ¹Ð°4(€€€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€€€Í±½ÑÌèmt°4(€€€€€‘•‰Õœè‘•‰Õ±…œ€ü‘•‰Õ%¹™¼€èÕ¹‘•™¥¹•°4(€€€ôì4(€ô4(4(€¥˜€ …•Ù•¹ÑÌ¹¡…Ì¡Õ¥MÑ…ÉÑ5¥¸¤¤•Ù•¹ÑÌ¹Í•Ð¡Õ¥MÑ…ÉÑ5¥¸°ì…‘èmt°É•µ½Ù”èmtô¤ì4(€¥˜€ …•Ù•¹ÑÌ¹¡…Ì¡Õ¥¹‘5¥¸€¬€Ä¤¤•Ù•¹ÑÌ¹Í•Ð¡Õ¥¹‘5¥¸€¬€Ä°ì…‘èmt°É•µ½Ù”èmtô¤ì4(€½¹ÍÐÁ½¥¹ÑÌ€ôÉÉ…ä¹™É½´¡•Ù•¹ÑÌ¹­•åÌ ¤¤¹Í½ÉÐ ¡„°ˆ¤€ôø„€´ˆ¤ì4(€½¹ÍÐ…Ñ¥Ù”€ô¹•ÜM•Ð ¤ì4(€½¹ÍÐÍ±½ÑÌ€ômtì4(€™½È€¡±•Ð¥¹‘•à€ô€Àì¥¹‘•à€ðÁ½¥¹ÑÌ¹±•¹Ñ ì¥¹‘•à€¬ô€Ä¤ì4(€€€½¹ÍÐµ¥¹ÕÑ”€ôÁ½¥¹ÑÍm¥¹‘•átì4(€€€½¹ÍÐ‰Õ­•Ð€ô•Ù•¹ÑÌ¹•Ð¡µ¥¹ÕÑ”¤ñðì…‘èmt°É•µ½Ù”èmtôì4(€€€™½È€¡½¹ÍÐÕÍ•É¹…µ”½˜‰Õ­•Ð¹É•µ½Ù”¤…Ñ¥Ù”¹‘•±•Ñ”¡ÕÍ•É¹…µ”¤ì4(€€€™½È€¡½¹ÍÐÕÍ•É¹…µ”½˜‰Õ­•Ð¹…‘¤…Ñ¥Ù”¹…‘¡ÕÍ•É¹…µ”¤ì4(€€€½¹ÍÐ¹•áÐ€ôÁ½¥¹ÑÍm¥¹‘•à€¬€Åtì4(€€€¥˜€¡¹•áÐ€ôô¹Õ±°¤½¹Ñ¥¹Õ”ì4(€€€½¹ÍÐÍ•µ•¹ÑMÑ…ÉÐ€ô5…Ñ ¹µ…à¡Õ¥MÑ…ÉÑ5¥¸°µ¥¹ÕÑ”¤ì4(€€€½¹ÍÐÍ•µ•¹Ñ¹‘á±ÕÍ¥Ù”€ô5…Ñ ¹µ¥¸¡Õ¥¹‘5¥¸€¬€Ä°¹•áÐ¤ì4(€€€½¹ÍÐÍ•µ•¹Ñ¹€ôµ½‘”€ôôô€‰™É•”ˆ4(€€€€€€ü5…Ñ ¹µ¥¸¡Õ¥¹‘5¥¸°Í•µ•¹Ñ¹‘á±ÕÍ¥Ù”¤4(€€€€€€èÍ•µ•¹Ñ¹‘á±ÕÍ¥Ù”€´€Äì4(€€€¥˜€¡Í•µ•¹Ñ¹€ðÍ•µ•¹ÑMÑ…ÉÐ¤½¹Ñ¥¹Õ”ì4(€€€½¹ÍÐÕÍ•É¹…µ•Ì€ôÉÉ…ä¹™É½´¡…Ñ¥Ù”¤ì4(€€€½¹ÍÐ…Ù…¥±…‰±”€ôÕÍ•É¹…µ•Ì¹±•¹Ñ €øôÉ•ÝM¥é”ì4(€€€¥˜€ ……Ù…¥±…‰±”€˜˜€…¥¹±Õ‘•Õ±°¤½¹Ñ¥¹Õ”ì4(€€€¥˜€¡µ½‘”€ôôô€‰ÍÑ…ÉÐˆ¤ì4(€€€€€½¹ÍÐ±…ÍÑMÑ…ÉÐ€ô5…Ñ ¹µ¥¸¡Í•µ•¹Ñ¹°Õ¥¹‘5¥¸€´Í±½ÑMÑ•Á5¥¸¤ì4(€€€€€™½È€¡±•ÐÍÑ…ÉÐ€ôÍ•µ•¹ÑMÑ…ÉÐìÍÑ…ÉÐ€ðô±…ÍÑMÑ…ÉÐìÍÑ…ÉÐ€¬ôÍ±½ÑMÑ•Á5¥¸¤ì4(€€€€€€€½¹ÍÐ•¹€ô5…Ñ ¹µ¥¸¡Õ¥¹‘5¥¸°ÍÑ…ÉÐ€¬Í±½ÑMÑ•Á5¥¸¤ì4(€€€€€€€Í±½ÑÌ¹ÁÕÍ ¡ì4(€€€€€€€€€ÍÑ…ÉÐèµ¥¹Q½!!54¡ÍÑ…ÉÐ¤°4(€€€€€€€€€•¹èµ¥¹Q½!!54¡•¹¤°4(€€€€€€€€€…Ù…¥±…‰±”°4(€€€€€€€€€…Ù…¥±…‰±•}Ñ•¡}¥‘Ìè…Ù…¥±…‰±”€üÕÍ•É¹…µ•Ì€èmt°4(€€€€€€€€€…Á…¥ÑäèÑ•¡½Õ¹Ð°4(€€€€€€€€€…Ù…¥±…‰±•}½Õ¹ÐèÕÍ•É¹…µ•Ì¹±•¹Ñ °4(€€€€€€€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€€€€€€€Í±½Ñ}­¥¹è€‰ÍÑ…ÉÑ}ÍÑ•Àˆ°4(€€€€€€€ô¤ì4(€€€€€ô4(€€€ô•±Í”ì4(€€€€€Í±½ÑÌ¹ÁÕÍ ¡ì4(€€€€€€€ÍÑ…ÉÐèµ¥¹Q½!!54¡Í•µ•¹ÑMÑ…ÉÐ¤°4(€€€€€€€•¹èµ¥¹Q½!!54¡Í•µ•¹Ñ¹¤°4(€€€€€€€…Ù…¥±…‰±”°4(€€€€€€€…Ù…¥±…‰±•}Ñ•¡}¥‘Ìè…Ù…¥±…‰±”€üÕÍ•É¹…µ•Ì€èmt°4(€€€€€€€…Á…¥ÑäèÑ•¡½Õ¹Ð°4(€€€€€€€…Ù…¥±…‰±•}½Õ¹ÐèÕÍ•É¹…µ•Ì¹±•¹Ñ °4(€€€€€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€€€€€Í±½Ñ}­¥¹è€‰™É••}‰±½¬ˆ°4(€€€€€ô¤ì4(€€€ô4(€ô4(4(€¥˜€¡‘•‰Õ±…œ€˜˜Í±½ÑÌ¹±•¹Ñ €ôôô€À€˜˜Ñ•¡½Õ¹Ð€ø€À¤ì4(€€€‘•‰ÕI•…Í½¹Ì¹ÁÕÍ ¡ì4(€€€€€½‘”è€‰	1=-ˆ°4(€€€€€µ•ÍÍ…”è€‹‚â{‚âk‚â+‚æ#‚âË‚â‚æ‚âW‚æ#‚æ‚â‡‚æ#‚â‡‚â×‚â+‚æ#‚âŸ‚â‚â_‚â×‚æ#‚æ‚â‚âÓ‚æ#‚â‡‚â‚âË‚âg‚æ‚âS‚æ$€£‚â[‚âç‚â‰±½¬ƒ‚â#‚âË‚â‰ÕÍä­‰Õ™™•Èƒ‚â¯‚â‚âß‚â´‘ÕÉ…Ñ¥½¸ƒ‚â‹‚âË‚âŸ‚æ‚â‚âÓ‚âg‚â+‚æ#‚âŸ‚â‚âŸ‚æ#‚âË‚â¤ˆ°4(€€€ô¤ì4(€ô4(€½¹Í½±”¹±½œ ‰m…Ù…¥±…‰¥±¥Ñå}ØÉtˆ°ì4(€€€‘…Ñ”°4(€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€™½É•èÑÉÕ”°4(€€€‘ÕÉ…Ñ¥½¹}µ¥¸è‘ÕÉ…Ñ¥½¹5¥¸°4(€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€•™™•Ñ¥Ù•}‘ÕÉ…Ñ¥½¹}µ¥¸è•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸°4(€€€Ñ•¡}½Õ¹ÐèÑ•¡½Õ¹Ð°4(€€€Í±½ÑÌèÍ±½ÑÌ¹±•¹Ñ °4(€€€É•…Í½¸è‘•‰ÕI•…Í½¹Ì¹±•¹Ñ €ü‘•‰ÕI•…Í½¹Ì¹µ…À ¡É•…Í½¸¤€ôøÉ•…Í½¸¹½‘”¤¹©½¥¸ ˆ°ˆ¤€èÕ¹‘•™¥¹•°4(€ô¤ì4(€É•ÑÕÉ¸ì4(€€€‘…Ñ”°4(€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€™½É•èÑÉÕ”°4(€€€Ý½É­}ÍÑ…ÉÐèÝ½É­MÑ…ÉÐ°4(€€€Ý½É­}•¹èÝ½É­¹°4(€€€ÑÉ…Ù•±}‰Õ™™•É}µ¥¸èÑÉ…Ù•±	Õ™™•É5¥¸°4(€€€‘ÕÉ…Ñ¥½¹}µ¥¸è•™™•Ñ¥Ù•ÕÉ…Ñ¥½¹5¥¸°4(€€€•™™•Ñ¥Ù•}‰±½­}µ¥¸è•™™•Ñ¥Ù•	±½­5¥¸°4(€€€Í±½Ñ}ÍÑ•Á}µ¥¸èÍ±½ÑMÑ•Á5¥¸°4(€€€Ñ•¡}½Õ¹ÐèÑ•¡½Õ¹Ð°4(€€€É•Ý}Í¥é”èÉ•ÝM¥é”°4(€€€µ½‘”èµ½‘”€ôôô€‰™É•”ˆ€ü€‰™É•”ˆ€è€‰ÍÑ…ÉÐˆ°4(€€€Í±½ÑÌ°4(€€€‘•‰Õœè‘•‰Õ±…œ€ü‘•‰Õ%¹™¼€èÕ¹‘•™¥¹•°4(€ôì4)ô4(4)…Íå¹Œ™Õ¹Ñ¥½¸½µÁÕÑ•‘µ¥¹Ù…¥±…‰¥±¥Ñå	åQ• ¡‘•ÁÌ°½ÁÑ¥½¹Ì¤ì4(€½¹ÍÐì4(€€€Á½½°°4(€€€±¥ÍÑQ•¡¹¥¥…¹Í	åQåÁ”°4(€€€‰Õ¥±‘=™™5…Á½É…Ñ”°4(€€€¥ÍQ•¡=™™=¹…Ñ”°4(€€€¥ÍQ•¡É•”°4(€€€Ñ½5¥¸°4(€€€µ¥¹Q½!!54°4(€ô€ô‘•ÁÌì4(€½¹ÍÐÑÉ…Ù•±	Õ™™•É5¥¸€ô9Õµ‰•È¡‘•ÁÌ¹ÑÉ…Ù•±	Õ™™•É5¥¸€üü©½‰Q¥µ¥¹œ¹QUI9I=U9}	UI}5%8¤ì4(€½¹ÍÐ‘…Ñ”€ôMÑÉ¥¹œ¡½ÁÑ¥½¹Ì¹‘…Ñ”ñð€ˆˆ¤ì4(€½¹ÍÐÑ•¡QåÁ”€ôMÑÉ¥¹œ¡½ÁÑ¥½¹Ì¹Ñ•¡}ÑåÁ”ñð€‰½µÁ…¹äˆ¤ì4(€½¹ÍÐ‘ÕÉ…Ñ¥½¹5¥¸€ô9Õµ‰•È¡½ÁÑ¥½¹Ì¹‘ÕÉ…Ñ¥½¹}µ¥¸¤ì4(€½¹ÍÐÍ±½ÑMÑ•Á5¥¸€ô€ÌÀì4(€½¹ÍÐ¥¹±Õ‘•A…ÕÍ•€ô½ÁÑ¥½¹Ì¹¥¹±Õ‘•}Á…ÕÍ•€ôôôÑÉÕ”ì4(€½¹ÍÐÑ•¡Í±°€ô…Ý…¥Ð±¥ÍÑQ•¡¹¥¥…¹Í	åQåÁ”¡Ñ•¡QåÁ”°ì4(€€€¥¹±Õ‘•}Á…ÕÍ•è¥¹±Õ‘•A…ÕÍ•°4(€€€…±±½Ý}ÑåÁ•}™…±±‰…¬èÑÉÕ”°4(€ô¤ì4(€½¹ÍÐ½™™5…À€ô…Ý…¥Ð‰Õ¥±‘=™™5…Á½É…Ñ”¡‘…Ñ”°€¡Ñ•¡Í±°ñðmt¤¹µ…À ¡Ñ• ¤€ôøÑ• ¹ÕÍ•É¹…µ”¤¤ì4(€½¹ÍÐÑ•¡Ì€ô€¡Ñ•¡Í±°ñðmt¤¹™¥±Ñ•È ¡Ñ• ¤€ôø€ 4(€€€€„¡¥¹±Õ‘•A…ÕÍ•€˜˜¥ÍQ•¡=™™=¹…Ñ”¡Ñ• °‘…Ñ”°½™™5…À°ì¥¹½É•]••­±äèÑÉÕ”ô¤¤4(€€¤¤ì4(4(€½¹ÍÐÍÁ•¥…±5…À€ô¹•Ü5…À ¤ì4(€ÑÉäì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä 4(€€€€€M1PÑ•¡¹¥¥…¹}ÕÍ•É¹…µ”°ÍÑ…ÉÑ}Ñ¥µ”°•¹‘}Ñ¥µ”4(€€€€€€€€I=4ÁÕ‰±¥Œ¹Ñ•¡¹¥¥…¹}ÍÁ•¥…±}Í±½ÑÍ}ØÈ4(€€€€€€€]!IÍ±½Ñ}‘…Ñ”ôÄèé‘…Ñ•€°4(€€€€€m‘…Ñ•t4(€€€€¤ì4(€€€™½È€¡½¹ÍÐÉ½Ü½˜É•ÍÕ±Ð¹É½ÝÌñðmt¤ì4(€€€€€½¹ÍÐÕÍ•É¹…µ”€ôÉ½Ü¹Ñ•¡¹¥¥…¹}ÕÍ•É¹…µ”ì4(€€€€€¥˜€ …ÍÁ•¥…±5…À¹¡…Ì¡ÕÍ•É¹…µ”¤¤ÍÁ•¥…±5…À¹Í•Ð¡ÕÍ•É¹…µ”°mt¤ì4(€€€€€ÍÁ•¥…±5…À¹•Ð¡ÕÍ•É¹…µ”¤¹ÁÕÍ ¡ìÍÑ…ÉÐèÉ½Ü¹ÍÑ…ÉÑ}Ñ¥µ”°•¹èÉ½Ü¹•¹‘}Ñ¥µ”ô¤ì4(€€€ô4(€ô…Ñ €¡•ÉÉ½È¤ì4(€€€½¹Í½±”¹Ý…É¸ ‰m…‘µ¥¹}…Ù…¥±…‰¥±¥Ñå}‰å}Ñ•¡}ØÉtÍÁ•¥…°Í±½ÑÌÅÕ•Éä™…¥±•ˆ°•ÉÉ½È¹µ•ÍÍ…”¤ì4(€ô4(4(€±•Ð±½‰…±MÑ…ÉÐ€ôÑ½5¥¸ ˆÀäèÀÀˆ¤ì4(€±•Ð±½‰…±¹€ôÑ½5¥¸ ˆÄàèÀÀˆ¤ì4(€™½È€¡½¹ÍÐÑ• ½˜Ñ•¡Ì¤ì4(€€€½¹ÍÐÍÑ…ÉÐ€ôÑ½5¥¸¡Ñ• ¹Ý½É­}ÍÑ…ÉÐñð€ˆÀäèÀÀˆ¤ì4(€€€½¹ÍÐ•¹€ôÑ½5¥¸¡Ñ• ¹Ý½É­}•¹ñð€ˆÄàèÀÀˆ¤ì4(€€€¥˜€¡9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÍÑ…ÉÐ¤¤±½‰…±MÑ…ÉÐ€ô5…Ñ ¹µ¥¸¡±½‰…±MÑ…ÉÐ°ÍÑ…ÉÐ¤ì4(€€€¥˜€¡9Õµ‰•È¹¥Í¥¹¥Ñ”¡•¹¤¤±½‰…±¹€ô5…Ñ ¹µ…à¡±½‰…±¹°•¹¤ì4(€€€™½È€¡½¹ÍÐÝ¥¹‘½Ü½˜ÍÁ•¥…±5…À¹•Ð¡Ñ• ¹ÕÍ•É¹…µ”¤ñðmt¤ì4(€€€€€±½‰…±MÑ…ÉÐ€ô5…Ñ ¹µ¥¸¡±½‰…±MÑ…ÉÐ°Ñ½5¥¸¡Ý¥¹‘½Ü¹ÍÑ…ÉÐ¤¤ì4(€€€€€±½‰…±¹€ô5…Ñ ¹µ…à¡±½‰…±¹°Ñ½5¥¸¡Ý¥¹‘½Ü¹•¹¤¤ì4(€€€ô4(€ô4(€±½‰…±MÑ…ÉÐ€ô5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÈÐ€¨€ØÀ°±½‰…±MÑ…ÉÐ¤¤ì4(€±½‰…±¹€ô5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÈÐ€¨€ØÀ°±½‰…±¹¤¤ì4(€½¹ÍÐÝ½É­MÑ…ÉÐ€ôµ¥¹Q½!!54¡±½‰…±MÑ…ÉÐ¤ì4(€½¹ÍÐÝ½É­¹€ôµ¥¹Q½!!54¡±½‰…±¹¤ì4(€½¹ÍÐ¹½Éµ…±¥é•‘ÕÉ…Ñ¥½¹5¥¸€ô5…Ñ ¹µ…à ÄÔ°9Õµ‰•È¡‘ÕÉ…Ñ¥½¹5¥¸ñð€ØÀ¤¤ì4(€½¹ÍÐ•™™•Ñ¥Ù•	±½­5¥¸€ô¹½Éµ…±¥é•‘ÕÉ…Ñ¥½¹5¥¸€¬ÑÉ…Ù•±	Õ™™•É5¥¸ì4(€½¹ÍÐ…±±M±½ÑÌ€ômtì4(€™½È€¡±•Ðµ¥¹ÕÑ”€ô±½‰…±MÑ…ÉÐìµ¥¹ÕÑ”€ð±½‰…±¹ìµ¥¹ÕÑ”€¬ôÍ±½ÑMÑ•Á5¥¸¤ì4(€€€±•ÐÍ•ÉÙ¥•5¥¸€ô¹½Éµ…±¥é•‘ÕÉ…Ñ¥½¹5¥¸ì4(€€€±•Ð‰±½­5¥¸€ôÍ•ÉÙ¥•5¥¸€¬ÑÉ…Ù•±	Õ™™•É5¥¸ì4(€€€¥˜€¡µ¥¹ÕÑ”€¬‰±½­5¥¸€ø±½‰…±¹€˜˜µ¥¹ÕÑ”€¬Í•ÉÙ¥•5¥¸€ðô±½‰…±¹¤‰±½­5¥¸€ôÍ•ÉÙ¥•5¥¸ì4(€€€¥˜€¡µ¥¹ÕÑ”€¬Í•ÉÙ¥•5¥¸€ø±½‰…±¹€˜˜µ¥¹ÕÑ”€¬€¡Í•ÉÙ¥•5¥¸€´ÑÉ…Ù•±	Õ™™•É5¥¸¤€ðô±½‰…±¹¤ì4(€€€€€Í•ÉÙ¥•5¥¸€ô5…Ñ ¹µ…à ÄÔ°Í•ÉÙ¥•5¥¸€´ÑÉ…Ù•±	Õ™™•É5¥¸¤ì4(€€€€€‰±½­5¥¸€ôÍ•ÉÙ¥•5¥¸ì4(€€€ô4(€€€¥˜€¡µ¥¹ÕÑ”€¬‰±½­5¥¸€ø±½‰…±¹¤½¹Ñ¥¹Õ”ì4(€€€…±±M±½ÑÌ¹ÁÕÍ ¡ì4(€€€€€ÍÑ…ÉÐèµ¥¹Q½!!54¡µ¥¹ÕÑ”¤°4(€€€€€•¹èµ¥¹Q½!!54¡µ¥¹ÕÑ”€¬‰±½­5¥¸¤°4(€€€€€Í•ÉÙ¥•}µ¥¸èÍ•ÉÙ¥•5¥¸°4(€€€€€‰±½­}µ¥¸è‰±½­5¥¸°4(€€€ô¤ì4(€ô4(4(€½¹ÍÐÑ•¡I½ÝÌ€ômtì4(€™½È€¡½¹ÍÐÑ• ½˜Ñ•¡Ì¤ì4(€€€½¹ÍÐÑ•¡MÑ…ÉÐ€ôÑ½5¥¸¡Ñ• ¹Ý½É­}ÍÑ…ÉÐñðÝ½É­MÑ…ÉÐ¤ì4(€€€½¹ÍÐÑ•¡¹€ôÑ½5¥¸¡Ñ• ¹Ý½É­}•¹ñðÝ½É­¹¤ì4(€€€½¹ÍÐÍÁ•¥…±]¥¹‘½ÝÌ€ôÍÁ•¥…±5…À¹•Ð¡Ñ• ¹ÕÍ•É¹…µ”¤ñðmtì4(€€€½¹ÍÐÍ±½ÑÌ€ômtì4(€€€™½È€¡½¹ÍÐÍ±½Ð½˜…±±M±½ÑÌ¤ì4(€€€€€½¹ÍÐÍ±½ÑMÑ…ÉÐ€ôÑ½5¥¸¡Í±½Ð¹ÍÑ…ÉÐ¤ì4(€€€€€±•ÐÝ¥Ñ¡¥¸€ôÍ±½ÑMÑ…ÉÐ€øôÑ•¡MÑ…ÉÐ€˜˜Í±½ÑMÑ…ÉÐ€¬€¡Í±½Ð¹‰±½­}µ¥¸ñð•™™•Ñ¥Ù•	±½­5¥¸¤€ðôÑ•¡¹ì4(€€€€€¥˜€ …Ý¥Ñ¡¥¸¤ì4(€€€€€€€™½È€¡½¹ÍÐÝ¥¹‘½Ü½˜ÍÁ•¥…±]¥¹‘½ÝÌ¤ì4(€€€€€€€€€½¹ÍÐÍÑ…ÉÐ€ôÑ½5¥¸¡Ý¥¹‘½Ü¹ÍÑ…ÉÐ¤ì4(€€€€€€€€€½¹ÍÐ•¹€ôÑ½5¥¸¡Ý¥¹‘½Ü¹•¹¤ì4(€€€€€€€€€¥˜€¡Í±½ÑMÑ…ÉÐ€øôÍÑ…ÉÐ€˜˜Í±½ÑMÑ…ÉÐ€¬€¡Í±½Ð¹‰±½­}µ¥¸ñð•™™•Ñ¥Ù•	±½­5¥¸¤€ðô•¹¤ì4(€€€€€€€€€€€Ý¥Ñ¡¥¸€ôÑÉÕ”ì4(€€€€€€€€€€€‰É•…¬ì4(€€€€€€€€€ô4(€€€€€€€ô4(€€€€€ô4(€€€€€¥˜€ …Ý¥Ñ¡¥¸¤ì4(€€€€€€€Í±½ÑÌ¹ÁÕÍ ¡ìÍÑ…ÉÐèÍ±½Ð¹ÍÑ…ÉÐ°•¹èÍ±½Ð¹•¹°…Ù…¥±…‰±”è™…±Í”ô¤ì4(€€€€€€€½¹Ñ¥¹Õ”ì4(€€€€€ô4(€€€€€½¹ÍÐ™É•”€ô…Ý…¥Ð¥ÍQ•¡É•” 4(€€€€€€€Ñ• ¹ÕÍ•É¹…µ”°4(€€€€€€€€‘í‘…Ñ•õP‘íÍ±½Ð¹ÍÑ…ÉÑôèÀÁ€°4(€€€€€€€Í±½Ð¹Í•ÉÙ¥•}µ¥¸ñð‘ÕÉ…Ñ¥½¹5¥¸°4(€€€€€€€¹Õ±°4(€€€€€€¤ì4(€€€€€Í±½ÑÌ¹ÁÕÍ ¡ìÍÑ…ÉÐèÍ±½Ð¹ÍÑ…ÉÐ°•¹èÍ±½Ð¹•¹°…Ù…¥±…‰±”è	½½±•…¸¡™É•”¤ô¤ì4(€€€ô4(€€€Ñ•¡I½ÝÌ¹ÁÕÍ ¡ìÕÍ•É¹…µ”èÑ• ¹ÕÍ•É¹…µ”°™Õ±±}¹…µ”èÑ• ¹™Õ±±}¹…µ”ñð¹Õ±°°Í±½ÑÌô¤ì4(€ô4(4(€½¹Í½±”¹±½œ ‰m…‘µ¥¹}…Ù…¥±…‰¥±¥Ñå}‰å}Ñ•¡}ØÉtˆ°ì4(€€€‘…Ñ”°4(€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€‘ÕÉ…Ñ¥½¹}µ¥¸è‘ÕÉ…Ñ¥½¹5¥¸°4(€€€Ñ•¡}½Õ¹ÐèÑ•¡Ì¹±•¹Ñ °4(€€€Í±½ÑÌè…±±M±½ÑÌ¹±•¹Ñ °4(€ô¤ì4(€É•ÑÕÉ¸ì4(€€€‘…Ñ”°4(€€€Ñ•¡}ÑåÁ”èÑ•¡QåÁ”°4(€€€Ý½É­}ÍÑ…ÉÐèÝ½É­MÑ…ÉÐ°4(€€€Ý½É­}•¹èÝ½É­¹°4(€€€‘ÕÉ…Ñ¥½¹}µ¥¸è‘ÕÉ…Ñ¥½¹5¥¸°4(€€€•™™•Ñ¥Ù•}‰±½­}µ¥¸è•™™•Ñ¥Ù•	±½­5¥¸°4(€€€Í±½Ñ}ÍÑ•Á}µ¥¸èÍ±½ÑMÑ•Á5¥¸°4(€€€Ñ•¡}½Õ¹ÐèÑ•¡Ì¹±•¹Ñ °4(€€€…±±}Í±½ÑÌè…±±M±½ÑÌ°4(€€€Ñ•¡ÌèÑ•¡I½ÝÌ°4(€€€Ñ•¡¹¥¥…¹ÌèÑ•¡Ì¹µ…À ¡Ñ• ¤€ôø€¡ì4(€€€€€ÕÍ•É¹…µ”èÑ• ¹ÕÍ•É¹…µ”°4(€€€€€™Õ±±}¹…µ”èÑ• ¹™Õ±±}¹…µ”ñðÑ• ¹ÕÍ•É¹…µ”°4(€€€ô¤¤°4(€€€Í±½ÑÍ}‰å}Ñ• è=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡Ñ•¡I½ÝÌ¹µ…À ¡É½Ü¤€ôømÉ½Ü¹ÕÍ•É¹…µ”°É½Ü¹Í±½ÑÌñðmut¤¤°4(€ôì4)ô4(4)…Íå¹Œ™Õ¹Ñ¥½¸½µÁÕÑ•1•…åAÕ‰±¥Ù…¥±…‰¥±¥Ñä¡‘•ÁÌ°½ÁÑ¥½¹Ì¤ì4(€½¹ÍÐìÁ½½°°¥ÍQ•¡É•”ô€ô‘•ÁÌì4(€½¹ÍÐ‘…Ñ”€ôMÑÉ¥¹œ¡½ÁÑ¥½¹Ì¹‘…Ñ”ñð€ˆˆ¤ì4(€½¹ÍÐÍÑ…ÉÐ€ôMÑÉ¥¹œ¡½ÁÑ¥½¹Ì¹ÍÑ…ÉÐñð€ˆÀàèÀÀˆ¤ì4(€½¹ÍÐ•¹€ôMÑÉ¥¹œ¡½ÁÑ¥½¹Ì¹•¹ñð€ˆÄàèÀÀˆ¤ì4(€½¹ÍÐÍ±½Ñ5¥¸€ô9Õµ‰•È¡½ÁÑ¥½¹Ì¹Í±½Ñ}µ¥¸¤ì4(€½¹ÍÐÑ•¡¹¥¥…¹I•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä¡€4(€€€€€M1PÔ¹ÕÍ•É¹…µ”4(€€€€€I=4ÁÕ‰±¥Œ¹ÕÍ•ÉÌÔ4(€€€€€1P)=%8ÁÕ‰±¥Œ¹Ñ•¡¹¥¥…¹}ÁÉ½™¥±•ÌÀ=8À¹ÕÍ•É¹…µ”õÔ¹ÕÍ•É¹…µ”4(€€€€€]!IÔ¹É½±”ôÑ•¡¹¥¥…¸œ4(€€€€¤ì4(€½¹ÍÐÑ•¡¹¥¥…¹Ì€ô€¡Ñ•¡¹¥¥…¹I•ÍÕ±Ð¹É½ÝÌñðmt¤4(€€€€¹µ…À ¡É½Ü¤€ôøMÑÉ¥¹œ¡É½Ü¹ÕÍ•É¹…µ”ñð€ˆˆ¤¹ÑÉ¥´ ¤¤4(€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì4(€½¹ÍÐÑ½5¥¹ÕÑ•Ì€ô€¡Ù…±Õ”¤€ôøì4(€€€½¹ÍÐm¡½ÕÈ°µ¥¹ÕÑ•t€ôMÑÉ¥¹œ¡Ù…±Õ”¤¹ÍÁ±¥Ð ˆèˆ¤¹µ…À ¡Á…ÉÐ¤€ôø9Õµ‰•È¡Á…ÉÐñð€À¤¤ì4(€€€É•ÑÕÉ¸¡½ÕÈ€¨€ØÀ€¬µ¥¹ÕÑ”ì4(€ôì4(€½¹ÍÐÍÑ…ÉÑ5¥¸€ôÑ½5¥¹ÕÑ•Ì¡ÍÑ…ÉÐ¤ì4(€½¹ÍÐ•¹‘5¥¸€ôÑ½5¥¹ÕÑ•Ì¡•¹¤ì4(€½¹ÍÐÍÑ…ÉÑÌ€ômtì4(€™½È€¡±•Ðµ¥¹ÕÑ”€ôÍÑ…ÉÑ5¥¸ìµ¥¹ÕÑ”€¬Í±½Ñ5¥¸€ðô•¹‘5¥¸ìµ¥¹ÕÑ”€¬ôÍ±½Ñ5¥¸¤ÍÑ…ÉÑÌ¹ÁÕÍ ¡µ¥¹ÕÑ”¤ì4(€½¹ÍÐÍ±½ÑÌ€ômtì4(€™½È€¡½¹ÍÐµ¥¹ÕÑ”½˜ÍÑ…ÉÑÌ¤ì4(€€€½¹ÍÐ¡½ÕÈ€ôMÑÉ¥¹œ¡5…Ñ ¹™±½½È¡µ¥¹ÕÑ”€¼€ØÀ¤¤¹Á…‘MÑ…ÉÐ È°€ˆÀˆ¤ì4(€€€½¹ÍÐµ¥¹ÕÑ•A…ÉÐ€ôMÑÉ¥¹œ¡µ¥¹ÕÑ”€”€ØÀ¤¹Á…‘MÑ…ÉÐ È°€ˆÀˆ¤ì4(€€€½¹ÍÐ¥Í¼€ô€‘í‘…Ñ•õP‘í¡½ÕÉôè‘íµ¥¹ÕÑ•A…ÉÑôèÀÀ¬ÀÜèÀÁ€ì4(€€€±•Ð™É••½Õ¹Ð€ô€Àì4(€€€™½È€¡½¹ÍÐÑ•¡¹¥¥…¸½˜Ñ•¡¹¥¥…¹Ì¤ì4(€€€€€¥˜€¡…Ý…¥Ð¥ÍQ•¡É•”¡Ñ•¡¹¥¥…¸°¥Í¼°Í±½Ñ5¥¸°¹Õ±°¤¤™É••½Õ¹Ð€¬ô€Äì4(€€€ô4(€€€Í±½ÑÌ¹ÁÕÍ ¡ì4(€€€€€Ñ¥µ”è€‘í¡½ÕÉôè‘íµ¥¹ÕÑ•A…ÉÑõ€°4(€€€€€…Ù…¥±…‰±”èÑ•¡¹¥¥…¹Ì¹±•¹Ñ €ôôô€À€ü™…±Í”€è™É••½Õ¹Ð€ø€À°4(€€€€€…Á…¥ÑäèÑ•¡¹¥¥…¹Ì¹±•¹Ñ °4(€€€€€‰ÕÍäè5…Ñ ¹µ…à À°Ñ•¡¹¥¥…¹Ì¹±•¹Ñ €´™É••½Õ¹Ð¤°4(€€€ô¤ì4(€ô4(€É•ÑÕÉ¸ì4(€€€‘…Ñ”°4(€€€ÍÑ…ÉÐ°4(€€€•¹°4(€€€Í±½Ñ}µ¥¸èÍ±½Ñ5¥¸°4(€€€Ñ•¡}½Õ¹ÐèÑ•¡¹¥¥…¹Ì¹±•¹Ñ °4(€€€Í±½ÑÌ°4(€ôì4)ô4(4)µ½‘Õ±”¹•áÁ½ÉÑÌ€ôì4(€‰Õ¥±‘É¥Ñ•É¥…1¥ÍÐ°4(€Ù…±¥‘…Ñ•É¥Ñ•É¥…1¥ÍÐ°4(€‘¥…¹½Í•Q•¡¹¥¥…¹±¥¥‰¥±¥Ñä°4(€Ñ•¡5…Ñ¡•Í5…ÑÉ¥áMÑÉ¥Ð°4(€Ñ•¡5…Ñ¡•Í±±É¥Ñ•É¥…MÑÉ¥Ð°4(€•±¥¥‰±•ÕÍÑ½µ•ÉQ•¡¹¥¥…¹Ì°4(€½µÁÕÑ•AÕ‰±¥ÕÍÑ½µ•ÉM±½ÑÌ°4(€½µÁÕÑ•…±•¹‘…ÉMÕµµ…Éä°4(€½µÁÕÑ•½É•‘Ù…¥±…‰¥±¥Ñä°4(€½µÁÕÑ•‘µ¥¹Ù…¥±…‰¥±¥Ñå	åQ• °4(€½µÁÕÑ•1•…åAÕ‰±¥Ù…¥±…‰¥±¥Ñä°4(€¡…ÍÙ…¥±…‰±•MÑ…ÉÐ°4(€É•Í•ÉÙ•AÕ‰±¥ÕÍÑ½µ•ÉQ•¡¹¥¥…¸°(€±½…‘UÉ•¹Ñ…Á…¥Ñå5…À°(€µ…­•¥…¹½ÍÑ¥Œ°)ôì(