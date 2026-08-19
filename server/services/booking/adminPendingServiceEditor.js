"use strict";

const crypto = require("crypto");
const {
  normalizeServiceType,
  normalizeAcType,
  normalizeWashVariantLabel,
  normalizeWashKey,
} = require("../../normalizers");
const { ensureBookingJobUnits, parseCanonicalServiceItem } = require("./bookingJobUnits");
const jobTiming = require("../jobTiming");

const ALLOWED_JOB_TYPES = new Set(["ล้าง", "ซ่อม", "ติดตั้ง"]);
const ALLOWED_AC_TYPES = new Set(["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"]);
const EDITABLE_STATUSES = new Set(["รอตรวจสอบ", "ตีกลับ", "ไม่พบช่างรับงาน", "รอพิจารณาเวลาใหม่"]);
const MAX_SERVICE_ROWS = 20;
const MAX_TOTAL_UNITS = 99;

function httpError(status, code, message = code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function exactMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(Math.max(0, number).toFixed(2)) : 0;
}

function looseCriteria(row = {}) {
  const itemName = String(row.item_name || "").trim();
  const btuMatch = itemName.match(/(\d[\d,]*)\s*BTU/i);
  const parts = itemName.split("•").map((part) => part.trim()).filter(Boolean);
  const jobType = normalizeServiceType(parts[0] || itemName);
  const acType = normalizeAcType(parts[0] || itemName);
  const detail = parts.slice(1).find((part) => !/BTU/i.test(part) && !/\d+\s*เครื่อง/.test(part)) || "";
  return {
    job_type: ALLOWED_JOB_TYPES.has(jobType) ? jobType : "ล้าง",
    ac_type: ALLOWED_AC_TYPES.has(acType) ? acType : "ผนัง",
    wash_variant: jobType === "ล้าง" ? (normalizeWashVariantLabel(detail) || "ล้างธรรมดา") : "",
    repair_variant: jobType === "ซ่อม" ? (detail || "ตรวจเช็ครั่ว") : "",
    btu: btuMatch ? Number(btuMatch[1].replace(/,/g, "")) : 9000,
    machine_count: Math.max(1, Math.round(Number(row.qty || 1))),
  };
}

function criteriaFromRow(row = {}) {
  try {
    return { ...parseCanonicalServiceItem(row), parse_error: false };
  } catch (_) {
    return { ...looseCriteria(row), parse_error: true };
  }
}

function normalizeRepairVariant(value) {
  const text = String(value || "").trim();
  if (/อะไหล่|ตามจริง/.test(text)) return "ซ่อมเปลี่ยนอะไหล่";
  if (/รั่ว|ตรวจ/.test(text)) return "ตรวจเช็ครั่ว";
  return "";
}

function normalizeServiceInput(input = {}) {
  const rawJobItemId = input.job_item_id;
  const jobItemId = rawJobItemId == null || rawJobItemId === "" ? null : Number(rawJobItemId);
  const jobType = normalizeServiceType(input.job_type || "");
  const acType = normalizeAcType(input.ac_type || "");
  const qty = Number(input.machine_count ?? input.qty);
  const btu = Number(input.btu);
  const unitPrice = Number(input.unit_price);

  if (!ALLOWED_JOB_TYPES.has(jobType)) throw httpError(400, "INVALID_SERVICE_TYPE", "ประเภทบริการไม่ถูกต้อง");
  if (!ALLOWED_AC_TYPES.has(acType)) throw httpError(400, "INVALID_AC_TYPE", "ประเภทแอร์ไม่ถูกต้อง");
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_TOTAL_UNITS) {
    throw httpError(400, "INVALID_MACHINE_COUNT", "จำนวนเครื่องต้องเป็นเลขเต็ม 1-99");
  }
  if (!Number.isInteger(btu) || btu < 5000 || btu > 100000) {
    throw httpError(400, "INVALID_BTU", "BTU ต้องเป็นเลขเต็ม 5,000-100,000");
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) {
    throw httpError(400, "INVALID_UNIT_PRICE", "ราคาต่อเครื่องไม่ถูกต้อง");
  }
  if (jobItemId != null && (!Number.isInteger(jobItemId) || jobItemId <= 0)) {
    throw httpError(400, "INVALID_JOB_ITEM", "รายการบริการไม่ตรงกับใบงาน");
  }

  let washVariant = "";
  let repairVariant = "";
  if (jobType === "ล้าง" && acType === "ผนัง") {
    const washKey = normalizeWashKey(input.wash_variant || "");
    if (!washKey) throw httpError(400, "INVALID_WASH_VARIANT", "กรุณาเลือกวิธีล้าง");
    washVariant = normalizeWashVariantLabel(input.wash_variant);
  }
  if (jobType === "ซ่อม") {
    repairVariant = normalizeRepairVariant(input.repair_variant);
    if (!repairVariant) throw httpError(400, "INVALID_REPAIR_VARIANT", "กรุณาเลือกประเภทงานซ่อม");
  }

  return {
    job_item_id: jobItemId,
    job_type: jobType,
    ac_type: acType,
    wash_variant: washVariant,
    repair_variant: repairVariant,
    btu,
    machine_count: qty,
    unit_price: exactMoney(unitPrice),
  };
}

function canonicalItemName(service = {}) {
  const parts = [];
  if (service.job_type === "ซ่อม") {
    parts.push(`ซ่อมแอร์${service.ac_type}`);
    parts.push(service.repair_variant);
  } else if (service.job_type === "ติดตั้ง") {
    parts.push(`ติดตั้งแอร์${service.ac_type}`);
  } else {
    parts.push(`ล้างแอร์${service.ac_type}`);
    if (service.ac_type === "ผนัง") parts.push(service.wash_variant);
  }
  parts.push(`${service.btu.toLocaleString("en-US")} BTU`);
  parts.push(`${service.machine_count} เครื่อง`);
  return parts.filter(Boolean).join(" • ");
}

function revisionRows(rows = []) {
  return rows.map((row) => ({
    job_item_id: Number(row.job_item_id),
    item_name: String(row.item_name || ""),
    qty: Number(row.qty || 0),
    unit_price: exactMoney(row.unit_price),
    line_total: exactMoney(row.line_total),
    service_package_id: row.service_package_id == null ? null : String(row.service_package_id),
    service_package_tier_id: row.service_package_tier_id == null ? null : String(row.service_package_tier_id),
  }));
}

function revisionForRows(rows = []) {
  return crypto.createHash("sha256").update(JSON.stringify(revisionRows(rows))).digest("hex");
}

function packageLabel(snapshot) {
  const value = snapshot && typeof snapshot === "object" ? snapshot : {};
  const packageName = String(value.package?.name || value.package_name || "").trim();
  const tierName = String(value.tier?.name || value.tier_name || "").trim();
  return [packageName, tierName].filter(Boolean).join(" • ") || "แพ็กเกจเดิมของลูกค้า";
}

function responseItem(row) {
  const criteria = criteriaFromRow(row);
  const isPackage = row.service_package_id != null;
  return {
    job_item_id: Number(row.job_item_id),
    item_id: row.item_id == null ? null : Number(row.item_id),
    item_name: String(row.item_name || ""),
    qty: Number(row.qty || 0),
    unit_price: exactMoney(row.unit_price),
    line_total: exactMoney(row.line_total),
    assigned_technician_username: String(row.assigned_technician_username || "") || null,
    is_package: isPackage,
    package_label: isPackage ? packageLabel(row.service_package_snapshot) : "",
    service_package_id: row.service_package_id == null ? null : String(row.service_package_id),
    service_package_tier_id: row.service_package_tier_id == null ? null : String(row.service_package_tier_id),
    ...criteria,
  };
}

function createAdminPendingServiceEditor(dependencies = {}) {
  const {
    pool,
    logJobUpdate,
  } = dependencies;
  const ensureCanonicalBookingJobUnits = dependencies.ensureBookingJobUnits || ensureBookingJobUnits;
  const timingEngine = dependencies.jobTiming || jobTiming;

  async function syncCanonicalJobUnits(client, jobId) {
    const expected = await client.query(
      `SELECT COALESCE(SUM(FLOOR(qty)),0)::int AS count
         FROM public.job_items
        WHERE job_id=$1 AND qty > 0`,
      [jobId]
    );
    const expectedCount = Math.max(0, Number(expected.rows?.[0]?.count || 0));
    await client.query(
      `UPDATE public.job_units
          SET status='cancelled', updated_at=NOW()
        WHERE job_id=$1
          AND unit_no > $2
          AND LOWER(COALESCE(NULLIF(status,''),'pending')) NOT IN ('cancelled','removed','deleted','void','inactive')`,
      [jobId, expectedCount]
    );
    await ensureCanonicalBookingJobUnits(jobId, client);
  }

  async function loadJob(client, jobId, forUpdate = false) {
    const result = await client.query(
      `SELECT job_id, booking_code, job_source, booking_mode, job_status, job_type,
              COALESCE(duration_min,60)::int AS duration_min, COALESCE(job_price,0)::numeric AS job_price
         FROM public.jobs
        WHERE job_id=$1${forUpdate ? " FOR UPDATE" : ""}`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  async function loadServiceRows(client, jobId, forUpdate = false) {
    const result = await client.query(
      `SELECT job_item_id, item_id, item_name, qty, unit_price, line_total,
              assigned_technician_username, COALESCE(is_service,FALSE) AS is_service,
              service_package_id, service_package_tier_id, service_package_snapshot
         FROM public.job_items
        WHERE job_id=$1 AND COALESCE(is_service,FALSE)=TRUE
        ORDER BY job_item_id ASC${forUpdate ? " FOR UPDATE" : ""}`,
      [jobId]
    );
    return result.rows || [];
  }

  async function pricingSummary(client, jobId) {
    const result = await client.query(
      `SELECT COALESCE(SUM(line_total),0)::numeric AS subtotal,
              COALESCE(SUM(line_total) FILTER (WHERE COALESCE(is_service,FALSE)=TRUE),0)::numeric AS service_subtotal,
              COALESCE(SUM(line_total) FILTER (WHERE COALESCE(is_service,FALSE)=FALSE),0)::numeric AS other_subtotal,
              COALESCE((SELECT applied_discount FROM public.job_promotions WHERE job_id=$1 LIMIT 1),0)::numeric AS discount
         FROM public.job_items WHERE job_id=$1`,
      [jobId]
    );
    const subtotal = exactMoney(result.rows?.[0]?.subtotal);
    const serviceSubtotal = exactMoney(result.rows?.[0]?.service_subtotal);
    const otherSubtotal = exactMoney(result.rows?.[0]?.other_subtotal);
    const discount = exactMoney(result.rows?.[0]?.discount);
    return {
      subtotal,
      service_subtotal: serviceSubtotal,
      other_subtotal: otherSubtotal,
      discount,
      total: exactMoney(Math.max(0, subtotal - discount)),
    };
  }

  function assertCustomerJob(job) {
    if (!job) throw httpError(404, "BOOKING_NOT_FOUND", "ไม่พบงาน");
    if (String(job.job_source || "") !== "customer") {
      throw httpError(409, "CUSTOMER_BOOKING_REQUIRED", "ตัวแก้รายการนี้ใช้ได้เฉพาะงานที่ลูกค้าจองเข้ามา");
    }
  }

  async function buildResponse(client, job) {
    const rows = await loadServiceRows(client, job.job_id, false);
    const pricing = await pricingSummary(client, job.job_id);
    return {
      success: true,
      editable: EDITABLE_STATUSES.has(String(job.job_status || "")),
      revision: revisionForRows(rows),
      job: {
        job_id: Number(job.job_id),
        booking_code: job.booking_code,
        job_type: job.job_type,
        job_status: job.job_status,
        duration_min: Number(job.duration_min || 60),
      },
      items: rows.map(responseItem),
      pricing,
    };
  }

  async function get(req, res) {
    const jobId = Number(req.params?.job_id || 0);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "INVALID_JOB_ID" });
    const client = await pool.connect();
    try {
      const job = await loadJob(client, jobId, false);
      assertCustomerJob(job);
      return res.json(await buildResponse(client, job));
    } catch (error) {
      const status = Number(error.status || 500);
      return res.status(status).json({ error: error.message || "โหลดรายละเอียดบริการไม่สำเร็จ", code: error.code });
    } finally {
      client.release();
    }
  }

  async function update(req, res) {
    const jobId = Number(req.params?.job_id || 0);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "INVALID_JOB_ID" });
    const requested = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requested.length || requested.length > MAX_SERVICE_ROWS) {
      return res.status(400).json({ error: "ต้องมีรายการบริการ 1-20 รายการ", code: "INVALID_SERVICE_ROWS" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = await loadJob(client, jobId, true);
      assertCustomerJob(job);
      if (!EDITABLE_STATUSES.has(String(job.job_status || ""))) {
        throw httpError(409, "BOOKING_NOT_EDITABLE", "งานนี้ถูกส่งให้ช่างแล้ว จึงแก้รายการจากคิวอนุมัติไม่ได้");
      }

      const existing = await loadServiceRows(client, jobId, true);
      const currentRevision = revisionForRows(existing);
      if (String(req.body?.revision || "") !== currentRevision) {
        throw httpError(409, "STALE_SERVICE_ITEMS", "มีคนแก้รายการนี้ก่อนแล้ว กรุณาปิดและเปิดใบงานใหม่");
      }

      const services = requested.map(normalizeServiceInput);
      const totalUnits = services.reduce((sum, service) => sum + service.machine_count, 0);
      if (totalUnits > MAX_TOTAL_UNITS) {
        throw httpError(400, "TOO_MANY_SERVICE_UNITS", "จำนวนเครื่องรวมต้องไม่เกิน 99 เครื่อง");
      }

      const existingById = new Map(existing.map((row) => [Number(row.job_item_id), row]));
      const requestedIds = new Set();
      for (const service of services) {
        if (service.job_item_id) {
          if (!existingById.has(service.job_item_id) || requestedIds.has(service.job_item_id)) {
            throw httpError(400, "INVALID_JOB_ITEM", "รายการบริการไม่ตรงกับใบงาน");
          }
          requestedIds.add(service.job_item_id);
        }
      }

      for (const row of existing) {
        if (requestedIds.has(Number(row.job_item_id))) continue;
        if (row.service_package_id != null) {
          throw httpError(409, "PACKAGE_ITEM_REQUIRED", "รายการแพ็กเกจเดิมลบไม่ได้ แต่แก้ประเภทแอร์ BTU จำนวน และราคาได้");
        }
        await client.query(`DELETE FROM public.job_items WHERE job_id=$1 AND job_item_id=$2`, [jobId, row.job_item_id]);
      }

      for (const service of services) {
        const itemName = canonicalItemName(service);
        const lineTotal = exactMoney(service.machine_count * service.unit_price);
        if (service.job_item_id) {
          await client.query(
            `UPDATE public.job_items
                SET item_name=$3, qty=$4, unit_price=$5, line_total=$6, is_service=TRUE
              WHERE job_id=$1 AND job_item_id=$2`,
            [jobId, service.job_item_id, itemName, service.machine_count, service.unit_price, lineTotal]
          );
        } else {
          const inserted = await client.query(
            `INSERT INTO public.job_items (job_id, item_name, qty, unit_price, line_total, is_service)
             VALUES ($1,$2,$3,$4,$5,TRUE)
             RETURNING job_item_id`,
            [jobId, itemName, service.machine_count, service.unit_price, lineTotal]
          );
          service.job_item_id = Number(inserted.rows[0].job_item_id);
        }
      }

      const duration = Number(timingEngine.computeServiceDurationMinMulti({ services }, { source: "admin_pending_service_editor", conservative: true }) || 0);
      const jobTypes = [...new Set(services.map((service) => service.job_type))];
      const jobType = jobTypes.join(" + ");
      const pricing = await pricingSummary(client, jobId);
      await client.query(
        `UPDATE public.jobs
            SET job_type=$2, duration_min=$3, job_price=$4
          WHERE job_id=$1`,
        [jobId, jobType, duration > 0 ? duration : Number(job.duration_min || 60), pricing.total]
      );

      await syncCanonicalJobUnits(client, jobId);

      if (typeof logJobUpdate === "function") {
        await logJobUpdate(jobId, {
          actor_username: String(req?.auth?.username || req?.actor?.username || "admin"),
          actor_role: "admin",
          action: "pending_booking_services_edited",
          message: "Admin corrected structured service details before technician dispatch",
          payload: {
            before: existing.map((row) => ({ item_name: row.item_name, qty: Number(row.qty), unit_price: exactMoney(row.unit_price) })),
            after: services.map((service) => ({ item_name: canonicalItemName(service), qty: service.machine_count, unit_price: service.unit_price })),
          },
        }, client);
      }

      await client.query("COMMIT");
      const refreshedJob = await loadJob(client, jobId, false);
      return res.json(await buildResponse(client, refreshedJob));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      const status = Number(error.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error.message || "บันทึกรายละเอียดบริการไม่สำเร็จ",
        code: error.code || "PENDING_SERVICE_EDIT_FAILED",
      });
    } finally {
      client.release();
    }
  }

  return { get, update };
}

module.exports = {
  createAdminPendingServiceEditor,
  normalizeServiceInput,
  canonicalItemName,
  revisionForRows,
  criteriaFromRow,
};
