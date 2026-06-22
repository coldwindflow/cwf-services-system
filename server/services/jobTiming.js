"use strict";

const {
  normalizeWashKey,
  normalizeServiceType,
  normalizeAcType,
} = require("../normalizers");

const TURNAROUND_BUFFER_MIN = Math.max(0, Number(process.env.TRAVEL_BUFFER_MIN || 30));
const TIMEZONE = "Asia/Bangkok";
const SLOT_STEP_MIN = 30;

const JOB_WASH = normalizeServiceType("wash");
const JOB_REPAIR = normalizeServiceType("repair");
const JOB_INSTALL = normalizeServiceType("install");
const AC_WALL = normalizeAcType("wall");

function coerceMachineCount(value) {
  const n = Number(value || 1);
  return Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1);
}

function steppedDuration(firstMin, additionalMin, machineCount) {
  const count = coerceMachineCount(machineCount);
  return count <= 1 ? firstMin : firstMin + ((count - 1) * additionalMin);
}

function normalizeServiceLine(raw = {}, fallback = {}) {
  const job_type = normalizeServiceType(raw.job_type || raw.jobType || fallback.job_type || fallback.jobType || "");
  const ac_type = normalizeAcType(raw.ac_type || raw.acType || fallback.ac_type || fallback.acType || "");
  return {
    job_type,
    ac_type,
    btu: Number(raw.btu || 0),
    machine_count: coerceMachineCount(raw.machine_count || raw.machineCount || fallback.machine_count || fallback.machineCount || 1),
    wash_variant: String(raw.wash_variant || raw.washVariant || fallback.wash_variant || fallback.washVariant || "").trim(),
    repair_variant: String(raw.repair_variant || raw.repairVariant || fallback.repair_variant || fallback.repairVariant || "").trim(),
    admin_override_duration_min: Number(raw.admin_override_duration_min || raw.adminOverrideDurationMin || fallback.admin_override_duration_min || fallback.adminOverrideDurationMin || 0),
    assigned_to: (raw.assigned_to || raw.assigned_technician_username || null) ? String(raw.assigned_to || raw.assigned_technician_username).trim() : null,
    assigned_technician_username: (raw.assigned_technician_username || raw.assigned_to || null) ? String(raw.assigned_technician_username || raw.assigned_to).trim() : null,
    allocations: (() => {
      const value = raw && (raw.allocations || raw.allocation || null);
      return value && typeof value === "object" ? value : null;
    })(),
  };
}

function normalizeServicesFromPayload(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : null;
  if (!services || !services.length) return null;
  return services
    .map((service) => normalizeServiceLine(service, payload))
    .filter((service) => (
      service.job_type
      && service.ac_type
      && Number.isFinite(service.btu)
      && service.btu > 0
      && Number.isFinite(service.machine_count)
      && service.machine_count > 0
    ));
}

function isPartsRepair(value) {
  const text = String(value || "").toLowerCase();
  return text.includes("part") || text.includes("อะไหล่") || text.includes("à¸­à¸°à¹„à¸«à¸¥à¹ˆ");
}

function computeServiceDurationMin(payload = {}, opts = {}) {
  const src = opts.source || "unknown";
  const line = normalizeServiceLine(payload);
  const washKey = normalizeWashKey(line.wash_variant || "normal");
  const repairVariant = line.repair_variant;
  const count = coerceMachineCount(line.machine_count);
  const adminOverride = Number(line.admin_override_duration_min || 0);

  let duration = 0;
  let policy = "fallback_60";

  if (line.job_type === JOB_WASH) {
    if (line.ac_type === AC_WALL || !line.ac_type) {
      if (washKey === "premium") {
        duration = steppedDuration(80, 50, count);
        policy = "wash_wall_premium_first_80_add_50";
      } else if (washKey === "coil") {
        duration = steppedDuration(120, 90, count);
        policy = "wash_wall_coil_first_120_add_90";
      } else if (washKey === "overhaul") {
        duration = steppedDuration(180, 120, count);
        policy = "wash_wall_overhaul_first_180_add_120";
      } else {
        duration = steppedDuration(60, 30, count);
        policy = "wash_wall_normal_first_60_add_30";
      }
    } else {
      duration = steppedDuration(120, 90, count);
      policy = "wash_non_wall_first_120_add_90";
    }
  } else if (line.job_type === JOB_REPAIR) {
    if (isPartsRepair(repairVariant)) {
      duration = adminOverride > 0 ? adminOverride : 0;
      policy = "repair_parts_admin_override";
    } else {
      duration = 60;
      policy = "repair_standard_60";
    }
  } else if (line.job_type === JOB_INSTALL) {
    duration = adminOverride > 0 ? adminOverride : 0;
    policy = "install_admin_override";
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    if (line.job_type === JOB_REPAIR && isPartsRepair(repairVariant)) return { service_duration_min: 0, policy, source: src };
    if (line.job_type === JOB_INSTALL) return { service_duration_min: 0, policy, source: src };
    duration = 60;
  }

  return {
    service_duration_min: Math.round(duration),
    policy,
    source: src,
    machine_count: count,
  };
}

function computeServiceDurationMinMulti(payload = {}, opts = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeServiceDurationMin(payload, opts).service_duration_min;

  const conservative = opts && opts.conservative === true;
  const parallel = !conservative && payload && (
    payload.parallel_by_tech === true
    || payload.parallel_by_tech === "true"
    || payload.parallel_by_tech === 1
    || payload.parallel_by_tech === "1"
  );
  const byTech = new Map();
  let total = 0;

  for (const service of services) {
    const result = computeServiceDurationMin(service, opts);
    const duration = Number(result.service_duration_min || 0);
    if (duration <= 0) return 0;
    total += duration;

    const count = coerceMachineCount(service.machine_count || 1);
    const allocations = service && (service.allocations || service.allocation || null);
    if (allocations && typeof allocations === "object") {
      const perMachine = duration / count;
      for (const [tech, qty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(qty || 0));
        if (!tech || q <= 0) continue;
        byTech.set(tech, (byTech.get(tech) || 0) + (perMachine * q));
      }
    } else {
      const tech = (service.assigned_to || service.assigned_technician_username || "").toString().trim();
      if (tech) byTech.set(tech, (byTech.get(tech) || 0) + duration);
    }
  }

  if (parallel && byTech.size >= 2) {
    let max = 0;
    for (const value of byTech.values()) max = Math.max(max, Number(value || 0));
    return Math.round(max);
  }
  return Math.round(total);
}

function computeJobTiming(payload = {}, opts = {}) {
  const serviceDuration = computeServiceDurationMinMulti(payload, opts);
  const services = normalizeServicesFromPayload(payload) || [normalizeServiceLine(payload)];
  const safeServices = services.map((service) => ({
    job_type: service.job_type,
    ac_type: service.ac_type,
    btu: service.btu,
    machine_count: service.machine_count,
    wash_variant: service.wash_variant,
    repair_variant: service.repair_variant,
    admin_override_duration_min: service.admin_override_duration_min,
  }));
  return {
    service_duration_min: serviceDuration,
    turnaround_buffer_min: TURNAROUND_BUFFER_MIN,
    occupied_duration_min: serviceDuration > 0 ? serviceDuration + TURNAROUND_BUFFER_MIN : 0,
    breakdown: {
      source: opts.source || "unknown",
      buffer_policy: "once_per_job_after_service",
      services: safeServices,
    },
  };
}

function getBangkokNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const ymd = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  return {
    ymd,
    dateStr: ymd,
    Y: map.year,
    M: map.month,
    D: map.day,
    hour,
    minute,
    hh: hour,
    mm: minute,
    iso: `${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`,
  };
}

function coerceBangkokNowParts(parts) {
  if (!parts || typeof parts !== "object") return getBangkokNow();
  const ymd = parts.ymd || parts.dateStr || (parts.Y && parts.M && parts.D ? `${parts.Y}-${parts.M}-${parts.D}` : null);
  const hour = Number(parts.hour ?? parts.hh ?? 0);
  const minute = Number(parts.minute ?? parts.mm ?? 0);
  return {
    ...parts,
    ymd: ymd || getBangkokNow().ymd,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function ceilMinuteToStep(minute, stepMin = SLOT_STEP_MIN) {
  const value = Number(minute || 0);
  const step = Math.max(1, Number(stepMin || SLOT_STEP_MIN));
  return Math.ceil(value / step) * step;
}

function minimumStartForDate(date, opts = {}) {
  const uiStartMin = Number.isFinite(Number(opts.ui_start_min)) ? Number(opts.ui_start_min) : 0;
  const uiEndMin = Number.isFinite(Number(opts.ui_end_min)) ? Number(opts.ui_end_min) : (24 * 60);
  const stepMin = Number(opts.slot_step_min || SLOT_STEP_MIN);
  const now = coerceBangkokNowParts(opts.now_parts || opts.nowParts || getBangkokNow());
  const nowMin = (Number(now.hour || 0) * 60) + Number(now.minute || 0);
  const isToday = String(date || "").slice(0, 10) === String(now.ymd || "").slice(0, 10);
  const minimum = isToday ? Math.min(ceilMinuteToStep(nowMin, stepMin), uiEndMin) : uiStartMin;
  return {
    minimum_start_min: Math.max(uiStartMin, minimum),
    minimum_start: minutesToHHMM(Math.max(uiStartMin, minimum)),
    server_now: now.iso || `${now.ymd}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}:00+07:00`,
    timezone: TIMEZONE,
    is_today: isToday,
  };
}

function minutesToHHMM(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

module.exports = {
  TIMEZONE,
  SLOT_STEP_MIN,
  TURNAROUND_BUFFER_MIN,
  coerceMachineCount,
  normalizeServiceLine,
  normalizeServicesFromPayload,
  computeServiceDurationMin,
  computeServiceDurationMinMulti,
  computeJobTiming,
  getBangkokNow,
  coerceBangkokNowParts,
  ceilMinuteToStep,
  minimumStartForDate,
};
