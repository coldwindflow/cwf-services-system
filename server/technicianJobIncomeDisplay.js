"use strict";

function normalizeDisplayAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

function hasValidDisplayAmount(row) {
  if (!row) return false;
  if (row.display_amount == null) return false;
  const n = Number(row.display_amount);
  return Number.isFinite(n);
}

function contextLabel(context, state) {
  if (state === "cancelled") return "ได้รับ";
  if (String(context || "") === "history") return "ได้รับ";
  return "ที่ช่างจะได้รับ";
}

function cardTypeFromContext(context) {
  const ctx = String(context || "current");
  if (ctx === "offered") return "urgent_offer";
  if (ctx === "history") return "history";
  return "assigned";
}

async function ensureTechnicianJobIncomeDisplaySchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.technician_job_income_display (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL,
      technician_username TEXT NOT NULL,
      technician_profile_id BIGINT NULL,
      card_type TEXT NOT NULL DEFAULT 'current',
      context TEXT NOT NULL DEFAULT 'current',
      display_state TEXT NOT NULL,
      display_label TEXT NOT NULL,
      display_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      display_note TEXT,
      income_source TEXT,
      rate_set_id TEXT,
      rate_set_version TEXT,
      source_table TEXT,
      source_id TEXT,
      is_final BOOLEAN NOT NULL DEFAULT FALSE,
      is_stale BOOLEAN NOT NULL DEFAULT FALSE,
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, technician_username, context)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tjid_tech ON public.technician_job_income_display(technician_username)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tjid_job ON public.technician_job_income_display(job_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tjid_state ON public.technician_job_income_display(display_state)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tjid_stale ON public.technician_job_income_display(is_stale)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tjid_card_context ON public.technician_job_income_display(card_type, context)`);
}

async function upsertTechnicianJobIncomeDisplay(db, row) {
  const jobId = Number(row && row.job_id);
  const username = String(row && row.technician_username || "").trim();
  const context = String(row && row.context || "current").trim() || "current";
  if (!Number.isInteger(jobId) || jobId <= 0 || !username) return null;
  const payload = {
    technician_profile_id: row.technician_profile_id == null ? null : Number(row.technician_profile_id),
    card_type: String(row.card_type || cardTypeFromContext(context)),
    display_state: String(row.display_state || "pending_review"),
    display_label: String(row.display_label || contextLabel(context, row.display_state)),
    display_amount: normalizeDisplayAmount(row.display_amount),
    display_note: row.display_note == null ? null : String(row.display_note),
    income_source: row.income_source == null ? null : String(row.income_source),
    rate_set_id: row.rate_set_id == null ? null : String(row.rate_set_id),
    rate_set_version: row.rate_set_version == null ? null : String(row.rate_set_version),
    source_table: row.source_table == null ? null : String(row.source_table),
    source_id: row.source_id == null ? null : String(row.source_id),
    is_final: Boolean(row.is_final),
    is_stale: Boolean(row.is_stale),
  };
  const r = await db.query(
    `INSERT INTO public.technician_job_income_display
      (job_id, technician_username, technician_profile_id, card_type, context, display_state, display_label,
       display_amount, display_note, income_source, rate_set_id, rate_set_version, source_table, source_id,
       is_final, is_stale, calculated_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW(),NOW())
     ON CONFLICT (job_id, technician_username, context) DO UPDATE SET
       technician_profile_id=COALESCE(EXCLUDED.technician_profile_id, public.technician_job_income_display.technician_profile_id),
       card_type=EXCLUDED.card_type,
       display_state=EXCLUDED.display_state,
       display_label=EXCLUDED.display_label,
       display_amount=EXCLUDED.display_amount,
       display_note=EXCLUDED.display_note,
       income_source=EXCLUDED.income_source,
       rate_set_id=EXCLUDED.rate_set_id,
       rate_set_version=EXCLUDED.rate_set_version,
       source_table=EXCLUDED.source_table,
       source_id=EXCLUDED.source_id,
       is_final=EXCLUDED.is_final,
       is_stale=EXCLUDED.is_stale,
       calculated_at=NOW(),
       updated_at=NOW()
     RETURNING *`,
    [
      jobId, username, payload.technician_profile_id, payload.card_type, context, payload.display_state,
      payload.display_label, payload.display_amount, payload.display_note, payload.income_source,
      payload.rate_set_id, payload.rate_set_version, payload.source_table, payload.source_id,
      payload.is_final, payload.is_stale,
    ]
  );
  return r.rows && r.rows[0] || null;
}

async function getTechnicianJobIncomeDisplay(db, jobId, username, context) {
  const jid = Number(jobId);
  const tech = String(username || "").trim();
  const ctx = String(context || "current").trim() || "current";
  if (!Number.isInteger(jid) || jid <= 0 || !tech) return null;
  const contexts = ctx === "history" ? ["history", "current", "offered"] : [ctx, "current"];
  const r = await db.query(
    `SELECT *
       FROM public.technician_job_income_display
      WHERE job_id=$1
        AND technician_username=$2
        AND context = ANY($3::text[])
        AND COALESCE(is_stale,FALSE)=FALSE
      ORDER BY array_position($3::text[], context), updated_at DESC, id DESC
      LIMIT 1`,
    [jid, tech, contexts]
  );
  return r.rows && r.rows[0] || null;
}

async function getTechnicianJobIncomeDisplayBatch(db, jobIds, username) {
  const ids = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const tech = String(username || "").trim();
  if (!ids.length || !tech) return new Map();
  const r = await db.query(
    `SELECT DISTINCT ON (job_id, context) *
       FROM public.technician_job_income_display
      WHERE job_id = ANY($1::bigint[])
        AND technician_username=$2
        AND COALESCE(is_stale,FALSE)=FALSE
      ORDER BY job_id, context, updated_at DESC, id DESC`,
    [ids, tech]
  );
  const map = new Map();
  for (const row of r.rows || []) {
    const key = `${row.job_id}:${row.context}`;
    map.set(key, row);
    if (!map.has(String(row.job_id))) map.set(String(row.job_id), row);
  }
  return map;
}

function buildDisplayFromPreview(preview, options = {}) {
  const context = String(options.context || "current");
  const state = context === "history" && options.isFinal ? "finalized" : "estimated";
  return {
    job_id: preview.job_id,
    technician_username: preview.technician_username,
    context,
    card_type: options.cardType || cardTypeFromContext(context),
    display_state: state,
    display_label: contextLabel(context, state),
    display_amount: normalizeDisplayAmount(preview.income_amount ?? preview.technician_income_amount),
    display_note: null,
    income_source: preview.income_source || preview.technician_income_source || "preview",
    rate_set_id: preview.rate_set_id || null,
    rate_set_version: preview.rate_set_version || null,
    source_table: "job_technician_income_preview",
    source_id: preview.id || `${preview.job_id}:${preview.technician_username}`,
    is_final: Boolean(options.isFinal),
    is_stale: false,
  };
}

function buildCancelledDisplay(job, username, context = "history") {
  return {
    job_id: job && job.job_id,
    technician_username: username,
    context,
    card_type: context === "history" ? "history" : "current",
    display_state: "cancelled",
    display_label: "ได้รับ",
    display_amount: 0,
    display_note: "งานยกเลิก ไม่มีรายได้",
    income_source: "cancelled_job",
    source_table: "jobs",
    source_id: job && job.job_id,
    is_final: true,
    is_stale: false,
  };
}

function buildPendingReviewDisplay(job, username, context = "current") {
  return {
    job_id: job && job.job_id,
    technician_username: username,
    context,
    card_type: cardTypeFromContext(context),
    display_state: "pending_review",
    display_label: contextLabel(context, "pending_review"),
    display_amount: 0,
    display_note: "รอตรวจสอบรายได้",
    income_source: "pending_review",
    source_table: "technician_job_income_display",
    source_id: null,
    is_final: false,
    is_stale: false,
  };
}

function buildReworkDisplay(job, username, reworkDisplay, context = "history") {
  return {
    job_id: job && job.job_id,
    technician_username: username,
    context,
    card_type: "rework",
    display_state: reworkDisplay.display_state,
    display_label: reworkDisplay.display_label,
    display_amount: normalizeDisplayAmount(reworkDisplay.display_amount),
    display_note: reworkDisplay.display_note,
    income_source: "technician_rework_cases",
    source_table: "technician_rework_cases",
    source_id: reworkDisplay.source_id || reworkDisplay.rework_case_id || null,
    is_final: Boolean(reworkDisplay.is_final),
    is_stale: false,
  };
}

function toTechnicianIncomeFields(row, context) {
  if (!row) return null;
  const state = row.display_state || "pending_review";
  return {
    technician_income_amount: state === "pending_review" ? null : (hasValidDisplayAmount(row) ? normalizeDisplayAmount(row.display_amount) : null),
    technician_income_label: row.display_label || contextLabel(context, row.display_state),
    technician_income_source: row.income_source || "technician_job_income_display",
    technician_income_display_state: state,
    technician_income_display_note: row.display_note || null,
    technician_income_is_final: Boolean(row.is_final),
    technician_income_is_stale: Boolean(row.is_stale),
    technician_income_rate_set_id: row.rate_set_id || null,
    technician_income_rate_set_version: row.rate_set_version || null,
  };
}

module.exports = {
  ensureTechnicianJobIncomeDisplaySchema,
  upsertTechnicianJobIncomeDisplay,
  getTechnicianJobIncomeDisplay,
  getTechnicianJobIncomeDisplayBatch,
  buildDisplayFromPreview,
  buildCancelledDisplay,
  buildPendingReviewDisplay,
  buildReworkDisplay,
  normalizeDisplayAmount,
  hasValidDisplayAmount,
  toTechnicianIncomeFields,
};
