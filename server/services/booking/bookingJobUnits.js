"use strict";

const {
  normalizeServiceType,
  normalizeAcType,
  normalizeWashVariantLabel,
  normalizeWashKey,
} = require("../../normalizers");

const ALLOWED_JOB_TYPES = new Set(["ล้าง", "ซ่อม", "ติดตั้ง"]);
const ALLOWED_AC_TYPES = new Set(["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"]);
const INACTIVE_UNIT_STATUSES = new Set(["cancelled", "removed", "deleted", "void", "inactive"]);

function httpError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function generateUnitCode(jobId, unitNo) {
  const jid = Math.abs(Number(jobId || 0) || 0);
  const no = Math.max(1, Math.min(99, Math.floor(Number(unitNo || 1) || 1)));
  return `${String(jid).padStart(5, "0").slice(-5)}${String(no).padStart(2, "0")}`;
}

function unitDisplayItemName(value) {
  let text = String(value || "").trim();
  if (!text) return "เครื่องปรับอากาศ";
  text = text.replace(/\s*(?:x|×)\s*\d+\s*$/i, "");
  text = text.replace(/\s*\d+\s*เครื่อง\s*$/i, "");
  text = text.replace(/\s{2,}/g, " ").trim();
  return text || "เครื่องปรับอากาศ";
}

function strictJobType(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  const categories = new Set();
  if (/ล้าง/.test(text) || /\b(?:wash|clean|cleaning)\b/.test(lower)) categories.add("ล้าง");
  if (/ซ่อม|ตรวจอาการ|ตรวจเช็ค/.test(text) || /\b(?:repair|inspect|inspection)\b/.test(lower)) categories.add("ซ่อม");
  if (/ติดตั้ง/.test(text) || /\b(?:install|installation)\b/.test(lower)) categories.add("ติดตั้ง");
  if (categories.size !== 1) return "";
  const normalized = normalizeServiceType(text);
  return ALLOWED_JOB_TYPES.has(normalized) && categories.has(normalized) ? normalized : "";
}

function parseCanonicalServiceItem(row = {}) {
  const itemName = String(row.item_name || "").trim();
  const parts = itemName.split("•").map((part) => part.trim()).filter(Boolean);
  const jobType = strictJobType(parts[0] || "");
  const acType = normalizeAcType(parts[0] || "");
  const machineCount = Number(row.qty);
  if (!jobType || !ALLOWED_AC_TYPES.has(acType) || !Number.isInteger(machineCount) || machineCount < 1 || machineCount > 99) {
    throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  }

  const btuParts = parts.filter((part) => /^\d[\d,]*\s*BTU$/i.test(part));
  if (btuParts.length !== 1) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  const btu = Number(btuParts[0].replace(/[^\d]/g, ""));
  if (!Number.isFinite(btu) || btu <= 0) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");

  const countParts = parts.filter((part) => /^\d+\s*เครื่อง$/.test(part));
  if (countParts.length !== 1 || Number(countParts[0].replace(/[^\d]/g, "")) !== machineCount) {
    throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  }

  const detailParts = parts.slice(1).filter((part) => !/^\d[\d,]*\s*BTU$/i.test(part) && !/^\d+\s*เครื่อง$/.test(part));
  let washVariant = "";
  let repairVariant = "";
  if (jobType === "ล้าง" && acType === "ผนัง") {
    if (detailParts.length !== 1 || !normalizeWashKey(detailParts[0])) {
      throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
    }
    washVariant = normalizeWashVariantLabel(detailParts[0]);
  } else if (jobType === "ซ่อม") {
    if (detailParts.length !== 1) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
    repairVariant = detailParts[0];
  } else if (detailParts.length !== 0) {
    throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  }

  return {
    job_type: jobType,
    ac_type: acType,
    wash_variant: washVariant,
    repair_variant: repairVariant,
    btu,
    machine_count: machineCount,
  };
}

async function loadJobItems(db, jobId) {
  const result = await db.query(
    `SELECT job_item_id, item_name, qty, assigned_technician_username, COALESCE(is_service,FALSE) AS is_service
       FROM public.job_items
      WHERE job_id=$1
      ORDER BY job_item_id ASC`,
    [jobId]
  );
  return result.rows || [];
}

function expandItemTargets(items, fallbackTechnician) {
  const targets = [];
  for (const item of items) {
    const rawQty = Number(item.qty);
    if (!Number.isFinite(rawQty) || rawQty <= 0) continue;
    if (item.is_service && !Number.isInteger(rawQty)) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
    const quantity = Math.min(99, Math.floor(rawQty));
    if (quantity < 1) continue;
    const criteria = item.is_service ? parseCanonicalServiceItem(item) : null;
    for (let index = 0; index < quantity; index += 1) {
      targets.push({
        item_name: unitDisplayItemName(item.item_name),
        assigned_technician: String(item.assigned_technician_username || fallbackTechnician || "").trim() || null,
        criteria,
      });
    }
  }
  return targets;
}

async function ensureBookingJobUnits(jobId, db) {
  const realId = Number(jobId);
  if (!Number.isInteger(realId) || realId <= 0 || !db || typeof db.query !== "function") {
    throw httpError(500, "BOOKING_JOB_UNITS_UNAVAILABLE");
  }
  const jobResult = await db.query(`SELECT technician_username, job_source, job_type FROM public.jobs WHERE job_id=$1 LIMIT 1`, [realId]);
  const job = jobResult.rows[0];
  if (!job) throw httpError(404, "BOOKING_NOT_FOUND");
  const items = await loadJobItems(db, realId);
  const targets = expandItemTargets(items, job.technician_username);
  if (!targets.length && job.job_source !== "customer") {
    targets.push({ item_name: unitDisplayItemName(job.job_type), assigned_technician: job.technician_username || null, criteria: null });
  }
  if (!targets.length) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");

  for (let index = 0; index < targets.length; index += 1) {
    const unitNo = index + 1;
    const target = targets[index];
    const criteria = target.criteria;
    const variant = criteria ? (criteria.wash_variant || criteria.repair_variant || null) : null;
    await db.query(
      `INSERT INTO public.job_units
         (job_id, unit_code, unit_no, item_name, ac_type, wash_type, btu, assigned_technician, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       ON CONFLICT (job_id, unit_no) DO UPDATE
         SET unit_code=EXCLUDED.unit_code,
             item_name=EXCLUDED.item_name,
             ac_type=EXCLUDED.ac_type,
             wash_type=EXCLUDED.wash_type,
             btu=EXCLUDED.btu,
             assigned_technician=EXCLUDED.assigned_technician,
             status=CASE
               WHEN LOWER(COALESCE(NULLIF(public.job_units.status,''),'pending')) IN ('cancelled','removed','deleted','void','inactive') THEN 'pending'
               ELSE COALESCE(NULLIF(public.job_units.status,''),'pending')
             END,
             updated_at=NOW()`,
      [
        realId,
        generateUnitCode(realId, unitNo),
        unitNo,
        target.item_name,
        criteria?.ac_type || null,
        variant,
        criteria ? String(criteria.btu) : null,
        target.assigned_technician,
      ]
    );
  }
  return (await db.query(`SELECT * FROM public.job_units WHERE job_id=$1 ORDER BY unit_no ASC, unit_id ASC`, [realId])).rows || [];
}

async function loadCanonicalServiceCriteria(db, jobId) {
  const items = await loadJobItems(db, jobId);
  const serviceItems = items.filter((item) => item.is_service);
  if (!serviceItems.length) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  const criteria = serviceItems.map(parseCanonicalServiceItem);

  const unitsResult = await db.query(
    `SELECT unit_no, ac_type, wash_type, btu, status
       FROM public.job_units
      WHERE job_id=$1
      ORDER BY unit_no ASC, unit_id ASC`,
    [jobId]
  );
  const activeUnits = (unitsResult.rows || []).filter((unit) => !INACTIVE_UNIT_STATUSES.has(String(unit.status || "pending").trim().toLowerCase()));
  const allTargets = expandItemTargets(items, null);
  if (activeUnits.length !== allTargets.length) throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
  for (let index = 0; index < allTargets.length; index += 1) {
    const expected = allTargets[index].criteria;
    if (!expected) continue;
    const unit = activeUnits[index];
    const expectedVariant = expected.wash_variant || expected.repair_variant || "";
    if (
      Number(unit.unit_no) !== index + 1
      || String(unit.ac_type || "") !== expected.ac_type
      || String(unit.wash_type || "") !== expectedVariant
      || Number(unit.btu || 0) !== expected.btu
    ) {
      throw httpError(409, "PENDING_SERVICE_CRITERIA_DRIFT");
    }
  }
  return criteria;
}

module.exports = {
  ensureBookingJobUnits,
  loadCanonicalServiceCriteria,
  parseCanonicalServiceItem,
};
