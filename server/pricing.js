"use strict";

const {
  normalizeWashVariantLabel,
  normalizeServiceType,
  normalizeAcType,
} = require("./normalizers");

function coerceMachineCount(value) {
  const n = Number(value || 1);
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

function normalizeServiceLine(raw = {}, fallback = {}) {
  const job_type = normalizeServiceType(raw.job_type || raw.jobType || fallback.job_type || fallback.jobType || "");
  const ac_type = normalizeAcType(raw.ac_type || raw.acType || fallback.ac_type || fallback.acType || "");
  const wash_variant = normalizeWashVariantLabel(raw.wash_variant || raw.washVariant || "");
  return {
    job_type,
    ac_type,
    btu: Number(raw.btu || 0),
    machine_count: coerceMachineCount(raw.machine_count || raw.machineCount || 1),
    wash_variant,
    repair_variant: String(raw.repair_variant || raw.repairVariant || "").trim(),
    admin_override_duration_min: Number(raw.admin_override_duration_min || raw.adminOverrideDurationMin || fallback.admin_override_duration_min || fallback.adminOverrideDurationMin || 0),
    assigned_to: (raw.assigned_to || raw.assigned_technician_username || null) ? String(raw.assigned_to || raw.assigned_technician_username).trim() : null,
    assigned_technician_username: (raw.assigned_technician_username || raw.assigned_to || null) ? String(raw.assigned_technician_username || raw.assigned_to).trim() : null,
    allocations: (() => {
      const a = raw && (raw.allocations || raw.allocation || null);
      return (a && typeof a === "object") ? a : null;
    })(),
  };
}

function computeDurationMin(payload = {}, opts = {}) {
  const src = opts.source || "unknown";
  const job_type = normalizeServiceType(payload.job_type || payload.jobType || "");
  const ac_type = normalizeAcType(payload.ac_type || payload.acType || "");
  const wash_variant = normalizeWashVariantLabel(payload.wash_variant || payload.washVariant || "");
  const repair_variant = String(payload.repair_variant || payload.repairVariant || "").trim();
  const machine_count = coerceMachineCount(payload.machine_count || payload.machineCount || 1);
  const admin_override = Number(payload.admin_override_duration_min || payload.adminOverrideDurationMin || 0);

  let duration = 0;
  const step = (first, next) => {
    const n = machine_count;
    if (n <= 1) return first;
    return first + (n - 1) * next;
  };

  if (job_type === "ล้าง") {
    if (ac_type === "ผนัง" || !ac_type) {
      if (wash_variant === "ล้างพรีเมียม") duration = step(80, 50);
      else if (wash_variant === "ล้างแขวนคอยล์") duration = step(120, 90);
      else if (wash_variant === "ล้างแบบตัดล้าง") duration = step(180, 120);
      else duration = step(60, 40);
    } else {
      duration = step(120, 90);
    }
  } else if (job_type === "ซ่อม") {
    if (repair_variant === "ซ่อมเปลี่ยนอะไหล่") duration = admin_override > 0 ? admin_override : 0;
    else duration = 60;
  } else if (job_type === "ติดตั้ง") {
    duration = admin_override > 0 ? admin_override : 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    if (job_type === "ซ่อม" && repair_variant === "ซ่อมเปลี่ยนอะไหล่") return 0;
    if (job_type === "ติดตั้ง") return 0;
    duration = 60;
  }

  console.log("[computeDurationMin]", { src, job_type, ac_type, wash_variant, repair_variant, machine_count, duration });
  return Math.round(duration);
}

function computeStandardPrice(payload = {}) {
  const job_type = normalizeServiceType(payload.job_type || "");
  const ac_type = normalizeAcType(payload.ac_type || "");
  const wash_variant = normalizeWashVariantLabel(payload.wash_variant || "");
  const repair_variant = String(payload.repair_variant || "").trim();
  const machine_count = coerceMachineCount(payload.machine_count || 1);
  const btu = Number(payload.btu || 0);

  if (job_type === "ติดตั้ง") return 0;

  if (job_type === "ซ่อม") {
    if (repair_variant === "ตรวจเช็ครั่ว") return 1000;
    return 700;
  }

  if (job_type !== "ล้าง") return 0;

  const qty = machine_count;
  if (ac_type === "ผนัง" || !ac_type) {
    const tier18000 = Number.isFinite(btu) && btu >= 18000;
    if (!tier18000) {
      if (wash_variant === "ล้างพรีเมียม") return 900 * qty;
      if (wash_variant === "ล้างแขวนคอยล์") return 1400 * qty;
      if (wash_variant === "ล้างแบบตัดล้าง") return 2000 * qty;
      return 600 * qty;
    }
    if (wash_variant === "ล้างพรีเมียม") return 1100 * qty;
    if (wash_variant === "ล้างแขวนคอยล์") return 1700 * qty;
    if (wash_variant === "ล้างแบบตัดล้าง") return 2300 * qty;
    return 750 * qty;
  }

  if (ac_type === "สี่ทิศทาง") return 1500 * qty;
  if (ac_type === "แขวน") return 1200 * qty;
  if (ac_type === "เปลือยใต้ฝ้า") return 1200 * qty;

  return 0;
}

function normalizeServicesFromPayload(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : null;
  if (!services || !services.length) return null;
  return services
    .map((s) => normalizeServiceLine(s, payload))
    .filter((s) => s.job_type && s.ac_type && Number.isFinite(s.btu) && s.btu > 0 && Number.isFinite(s.machine_count) && s.machine_count > 0);
}

function computeDurationMinMulti(payload = {}, opts = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeDurationMin(payload, opts);

  const conservative = opts && opts.conservative === true;
  const parallel = !conservative && payload && (payload.parallel_by_tech === true || payload.parallel_by_tech === "true" || payload.parallel_by_tech === 1 || payload.parallel_by_tech === "1");
  const byTech = new Map();
  let total = 0;

  for (const s of services) {
    if (s.job_type === "ล้าง" && (s.ac_type === "ผนัง" || !s.ac_type) && !s.wash_variant) s.wash_variant = "ล้างธรรมดา";
    const d = computeDurationMin(s, opts);
    if (d <= 0) return 0;
    total += d;

    const mc = coerceMachineCount(s.machine_count || 1);
    const allocations = s && (s.allocations || s.allocation || null);
    if (allocations && typeof allocations === "object") {
      const perMachine = d / mc;
      for (const [tech, qty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(qty || 0));
        if (!tech || q <= 0) continue;
        byTech.set(tech, (byTech.get(tech) || 0) + perMachine * q);
      }
    } else {
      const tech = (s.assigned_to || s.assigned_technician_username || "").toString().trim();
      if (tech) byTech.set(tech, (byTech.get(tech) || 0) + d);
    }
  }

  const distinctTech = byTech.size;
  if (parallel && distinctTech >= 2) {
    let mx = 0;
    for (const v of byTech.values()) mx = Math.max(mx, Number(v || 0));
    console.log("[computeDurationMinMulti]", { src: opts.source || "unknown", lines: services.length, parallel: true, distinctTech, max: mx, sum: total });
    return Math.round(mx);
  }

  console.log("[computeDurationMinMulti]", { src: opts.source || "unknown", lines: services.length, parallel: false, conservative, total });
  return Math.round(total);
}

function computeStandardPriceMulti(payload = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return computeStandardPrice(payload);
  let total = 0;
  for (const s of services) {
    if (s.job_type === "ล้าง" && (s.ac_type === "ผนัง" || !s.ac_type) && !s.wash_variant) s.wash_variant = "ล้างธรรมดา";
    total += Number(computeStandardPrice(s) || 0);
  }
  return Number(total || 0);
}

function buildServiceLineItemsFromPayload(payload = {}) {
  const services = normalizeServicesFromPayload(payload);
  if (!services) return [];
  const items = [];
  for (const s of services) {
    const linePrice = Number(computeStandardPrice(s) || 0);
    const mc = coerceMachineCount(s.machine_count || 1);
    const labelParts = [];
    if (s.job_type === "ซ่อม") {
      labelParts.push(`ซ่อมแอร์${s.ac_type || ""}`.trim());
      if (s.repair_variant) labelParts.push(s.repair_variant);
    } else if (s.job_type === "ติดตั้ง") {
      labelParts.push(`ติดตั้งแอร์${s.ac_type || ""}`.trim());
    } else {
      labelParts.push(`ล้างแอร์${s.ac_type || ""}`.trim());
      if (s.ac_type === "ผนัง") labelParts.push(normalizeWashVariantLabel(s.wash_variant) || "ล้างธรรมดา");
    }
    labelParts.push(`${Number(s.btu || 0)} BTU`);
    labelParts.push(`${mc} เครื่อง`);
    const item_name = labelParts.join(" • ");
    const allocations = s && (s.allocations || s.allocation || null);
    if (allocations && typeof allocations === "object") {
      const perMachine = (mc > 0) ? (linePrice / mc) : linePrice;
      for (const [tech, qty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(qty || 0));
        if (!tech || q <= 0) continue;
        const unit = Number((Number(perMachine) || 0).toFixed(2));
        items.push({
          item_id: null,
          item_name,
          qty: q,
          unit_price: unit,
          line_total: unit * q,
          is_service: true,
          assigned_technician_username: tech,
        });
      }
    } else {
      const perMachine = (mc > 0) ? (linePrice / mc) : linePrice;
      const unit = Number((Number(perMachine) || 0).toFixed(2));
      items.push({
        item_id: null,
        item_name,
        qty: mc,
        unit_price: unit,
        line_total: unit * mc,
        is_service: true,
        assigned_technician_username: (s.assigned_to || s.assigned_technician_username || null),
      });
    }
  }
  return items;
}

module.exports = {
  computeStandardPrice,
  computeStandardPriceMulti,
  computeDurationMin,
  computeDurationMinMulti,
  normalizeServicesFromPayload,
  buildServiceLineItemsFromPayload,
};
