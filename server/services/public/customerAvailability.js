"use strict";

const SLOT_STEP_MIN = 30;
const DEFAULT_UI_START = "09:00";
const DEFAULT_UI_END = "18:00";

function normalizeJobKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("ติดตั้ง") || v.includes("install")) return "install";
  if (v.includes("ซ่อม") || v.includes("repair")) return "repair";
  if (v.includes("ล้าง") || v.includes("wash") || v.includes("clean")) return "wash";
  return null;
}

function normalizeAcKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("ผนัง") || v.includes("wall")) return "wall";
  if (v.includes("สี่ทิศ") || v.includes("4") || v.includes("four")) return "fourway";
  if (v.includes("แขวน")) return "hanging";
  if (v.includes("ใต้ฝ้า") || v.includes("เปลือย") || v.includes("ฝัง")) return "ceiling";
  return null;
}

function normalizeWashKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("ธรรมดา") || v.includes("ปกติ") || v.includes("normal")) return "normal";
  if (v.includes("พรีเมียม") || v.includes("premium")) return "premium";
  if (v.includes("แขวนคอย") || v.includes("coil")) return "coil";
  if (v.includes("ตัดล้าง") || v.includes("overhaul") || v.includes("ใหญ่")) return "overhaul";
  return null;
}

function normalizeRepairKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("รั่ว") || v.includes("leak")) return "leak_check";
  if (v.includes("อะไหล่") || v.includes("part")) return "parts";
  if (v.includes("ตรวจ") || v.includes("inspect")) return "inspection";
  if (v.includes("ทั่วไป") || v.includes("general")) return "general";
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

function bangkokTodayYmd(nowParts) {
  if (nowParts && nowParts.Y && nowParts.M && nowParts.D) return `${nowParts.Y}-${nowParts.M}-${nowParts.D}`;
  return new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

async function eligibleCustomerTechnicians(deps, options) {
  const {
    pool,
    listTechniciansByType,
    buildOffMapForDate,
    isTechOffOnDate,
  } = deps;
  const date = options.date;
  const techType = options.tech_type || "company";
  const criteriaList = buildCriteriaList(options);
  if (!validateCriteriaList(criteriaList)) {
    const error = new Error("CUSTOMER_SLOT_SERVICE_CRITERIA_REQUIRED");
    error.status = 400;
    throw error;
  }

  const allTechs = await listTechniciansByType(techType, { include_paused: true });
  const visibleTechs = (allTechs || []).filter((tech) => tech && tech.customer_slot_visible === true);
  const offMap = await buildOffMapForDate(date, visibleTechs.map((tech) => tech.username));
  const notOff = visibleTechs.filter((tech) => !isTechOffOnDate(tech, date, offMap));
  const matrixMap = await loadServiceMatrixMap(pool, notOff.map((tech) => tech.username));
  return notOff.filter((tech) => {
    const username = String(tech.username || "");
    if (!matrixMap.has(username)) return false;
    return techMatchesAllCriteriaStrict(matrixMap.get(username), criteriaList);
  });
}

async function computePublicCustomerSlots(deps, options) {
  const {
    pool,
    buildTechWindowsMin,
    listBusyBlocksForTechOnDate,
    buildStartIntervalsByCollision,
    toMin,
    minToHHMM,
    getNowBangkokParts,
  } = deps;
  const date = String(options.date || "").slice(0, 10);
  const durationMin = Math.max(15, Number(options.duration_min || 60));
  const uiStartMin = toMin(DEFAULT_UI_START);
  const uiEndMin = toMin(DEFAULT_UI_END);
  const specialMap = await loadSpecialMap(pool, date);
  const techs = await eligibleCustomerTechnicians(deps, { ...options, date });
  const events = new Map();
  const addEvent = (minute, type, username) => {
    const key = Math.round(minute);
    if (!events.has(key)) events.set(key, { add: [], remove: [] });
    events.get(key)[type].push(username);
  };

  let startFloor = uiStartMin;
  try {
    const nowBkk = getNowBangkokParts();
    if (date === bangkokTodayYmd(nowBkk)) {
      const nowMin = (Number(nowBkk.hh || 0) * 60) + Number(nowBkk.mm || 0);
      startFloor = Math.max(startFloor, Math.min(Math.ceil(nowMin / SLOT_STEP_MIN) * SLOT_STEP_MIN, uiEndMin));
    }
  } catch (_) {
    startFloor = uiStartMin;
  }

  for (const tech of techs) {
    const windows = buildTechWindowsMin(tech, date, specialMap, startFloor, uiEndMin);
    if (!windows.length) continue;
    const busyBlocks = await listBusyBlocksForTechOnDate(tech.username, date, null);
    for (const window of windows) {
      const intervals = buildStartIntervalsByCollision(busyBlocks, window.startMin, window.endMin, durationMin);
      for (const interval of intervals) {
        addEvent(interval.startMin, "add", tech.username);
        addEvent(interval.endMin + 1, "remove", tech.username);
      }
    }
  }

  if (!events.has(startFloor)) events.set(startFloor, { add: [], remove: [] });
  if (!events.has(uiEndMin + 1)) events.set(uiEndMin + 1, { add: [], remove: [] });

  const points = Array.from(events.keys()).sort((a, b) => a - b);
  const active = new Set();
  const slots = [];

  for (let i = 0; i < points.length; i += 1) {
    const minute = points[i];
    const bucket = events.get(minute) || { add: [], remove: [] };
    for (const username of bucket.remove) active.delete(username);
    for (const username of bucket.add) active.add(username);
    const next = points[i + 1];
    if (next == null) continue;
    const segmentStart = Math.max(startFloor, minute);
    const segmentEnd = Math.min(uiEndMin + 1, next) - 1;
    if (segmentEnd < segmentStart || !active.size) continue;
    const lastStart = Math.min(segmentEnd, uiEndMin - SLOT_STEP_MIN);
    for (let start = segmentStart; start <= lastStart; start += SLOT_STEP_MIN) {
      slots.push({
        start: minToHHMM(start),
        end: minToHHMM(Math.min(uiEndMin, start + SLOT_STEP_MIN)),
        available: true,
      });
    }
  }

  return {
    date,
    duration_min: durationMin,
    slot_step_min: SLOT_STEP_MIN,
    slots,
  };
}

function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthDays(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const first = `${match[1]}-${match[2]}-01`;
  return Array.from({ length: count }, (_, index) => addDaysYmd(first, index));
}

async function computeCalendarSummary(deps, options) {
  const month = String(options.month || "").slice(0, 7);
  const days = [];
  for (const date of monthDays(month)) {
    const result = await computePublicCustomerSlots(deps, { ...options, date });
    const first = (result.slots || []).find((slot) => slot.available);
    days.push({
      date,
      available: Boolean(first),
      first_available: first ? first.start : null,
    });
  }
  return { month, days };
}

async function hasAvailableStart(deps, options) {
  const result = await computePublicCustomerSlots(deps, options);
  const start = String(options.start || "").slice(0, 5);
  return (result.slots || []).some((slot) => slot.available && slot.start === start);
}

module.exports = {
  buildCriteriaList,
  validateCriteriaList,
  techMatchesMatrixStrict,
  techMatchesAllCriteriaStrict,
  eligibleCustomerTechnicians,
  computePublicCustomerSlots,
  computeCalendarSummary,
  hasAvailableStart,
};
