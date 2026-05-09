"use strict";

function text(v) {
  return String(v || "").trim();
}

function lower(v) {
  return text(v).toLowerCase();
}

function isCancelledJob(job) {
  const status = lower(job && job.job_status);
  return Boolean(
    job && (
      job.canceled_at ||
      job.cancel_reason ||
      status.includes("cancel") ||
      status.includes("ยกเลิก")
    )
  );
}

function detectReworkJob(job, reworkCase) {
  const fields = [
    job && job.job_status,
    job && job.job_type,
    job && job.return_reason,
    job && job.revisit_reason,
    job && job.revisit_result,
    reworkCase && reworkCase.reason_type,
    reworkCase && reworkCase.status,
    reworkCase && reworkCase.resolution,
  ].map(lower).join(" ");

  return Boolean(
    reworkCase ||
    (job && (job.returned_at || job.return_reason || job.source_job_id || job.original_job_id || job.parent_job_id || job.is_revisit || job.is_warranty)) ||
    fields.includes("rework") ||
    fields.includes("revisit") ||
    fields.includes("warranty") ||
    fields.includes("claim") ||
    fields.includes("return_for_fix") ||
    fields.includes("งานแก้ไข") ||
    fields.includes("กลับไปแก้") ||
    fields.includes("ในประกัน") ||
    fields.includes("เคลม")
  );
}

function classifyReworkState(job, reworkCase) {
  const status = lower((reworkCase && reworkCase.status) || (job && job.job_status));
  const resolution = lower((reworkCase && reworkCase.resolution) || (reworkCase && reworkCase.revisit_result) || (job && job.revisit_result));

  if (resolution.includes("deduction") || resolution.includes("failed") || resolution.includes("unsuccess") || resolution.includes("ไม่สำเร็จ") || resolution.includes("หัก")) {
    return "failed";
  }
  if (resolution.includes("fixed") || resolution.includes("success") || resolution.includes("สำเร็จ") || resolution.includes("แก้แล้ว")) {
    return "fixed";
  }
  if (status.includes("resolved") && !resolution) return "fixed";
  if (status.includes("failed") || status.includes("unsuccess") || status.includes("deduction")) return "failed";
  return "open";
}

async function getLatestReworkCasesForJobs(db, jobIds) {
  const ids = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return new Map();
  try {
    const r = await db.query(
      `SELECT DISTINCT ON (job_id) *
         FROM public.technician_rework_cases
        WHERE job_id = ANY($1::bigint[])
        ORDER BY job_id, created_at DESC NULLS LAST, rework_case_id DESC`,
      [ids]
    );
    return new Map((r.rows || []).map((row) => [Number(row.job_id), row]));
  } catch (_) {
    return new Map();
  }
}

function buildReworkDisplay(job, reworkCase, heldAmount) {
  const amount = Number.isFinite(Number(heldAmount)) ? Number(heldAmount) : 0;
  const state = classifyReworkState(job, reworkCase);
  if (state === "fixed") {
    return {
      display_state: "rework_released",
      display_label: "คืนรายได้เดิม",
      display_amount: amount,
      display_note: "แก้ไขสำเร็จ คืนรายได้เดิม",
      is_final: true,
    };
  }
  if (state === "failed") {
    return {
      display_state: "rework_failed",
      display_label: "ยังไม่คืนรายได้",
      display_amount: amount,
      display_note: "งานแก้ไขยังไม่สำเร็จ หรือรอหักตามที่แอดมินอนุมัติ",
      is_final: true,
    };
  }
  return {
    display_state: "rework_held",
    display_label: "ยอดที่พักไว้",
    display_amount: amount,
    display_note: "งานมีปัญหา รายได้เดิมถูกพักไว้",
    is_final: false,
  };
}

module.exports = {
  isCancelledJob,
  detectReworkJob,
  classifyReworkState,
  getLatestReworkCasesForJobs,
  buildReworkDisplay,
};
