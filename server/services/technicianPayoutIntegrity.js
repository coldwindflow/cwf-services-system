"use strict";

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function asDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusIsBlocked(status) {
  return ["locked", "paid"].includes(String(status || "").trim().toLowerCase());
}

function hasPaymentRecord(row) {
  if (!row) return false;
  if (row.payment_id != null) return true;
  if (Number(row.paid_amount || 0) > 0) return true;
  const st = String(row.paid_status || "").trim().toLowerCase();
  return st === "partial" || st === "paid" || row.paid_at != null;
}

function createPayoutDeleteBlockedError(blockers) {
  const err = new Error("PAYOUT_DELETE_BLOCKED");
  err.statusCode = 409;
  err.code = "PAYOUT_DELETE_BLOCKED";
  err.details = blockers;
  return err;
}

async function buildTechnicianPayoutPeriodSummary({
  db,
  period,
  technicianUsername,
  loadPayoutLinesForTech,
  getProjectedDepositDeductionForPayout,
  paidStatus,
  normalizeMoney = money,
} = {}) {
  if (!db || typeof db.query !== "function") throw new Error("PAYOUT_SUMMARY_DB_REQUIRED");
  if (!period || !period.payout_id) throw new Error("PAYOUT_PERIOD_REQUIRED");
  const tech = String(technicianUsername || "").trim();
  if (!tech) throw new Error("TECHNICIAN_USERNAME_REQUIRED");
  if (typeof loadPayoutLinesForTech !== "function") throw new Error("PAYOUT_LINE_LOADER_REQUIRED");
  if (typeof getProjectedDepositDeductionForPayout !== "function") throw new Error("DEPOSIT_PROJECTOR_REQUIRED");
  const moneyFn = typeof normalizeMoney === "function" ? normalizeMoney : money;
  const paidStatusFn = typeof paidStatus === "function" ? paidStatus : (() => "unpaid");

  const payoutId = String(period.payout_id || "").trim();
  const metaQ = await db.query(
    `SELECT payout_id, status, period_start, period_end
       FROM public.technician_payout_periods
      WHERE payout_id=$1
      LIMIT 1`,
    [payoutId]
  );
  const meta = metaQ.rows?.[0] || null;
  const status = String(meta?.status || period.status || "draft").trim() || "draft";
  const periodStartRaw = meta?.period_start || period.period_start || period.start;
  const periodEndRaw = meta?.period_end || period.period_end || period.endEx;
  const start = asDate(periodStartRaw);
  const endEx = asDate(periodEndRaw);

  const loaded = await loadPayoutLinesForTech({
    payout_id: payoutId,
    tech,
    status,
    start,
    endEx,
    period_type: period.period_type,
    label_ym: period.label_ym,
  });
  const lines = Array.isArray(loaded?.lines) ? loaded.lines : [];

  const adjQ = await db.query(
    `SELECT adj_id, payout_id, technician_username, job_id::text AS job_id, adj_amount, reason, created_at, created_by
       FROM public.technician_payout_adjustments
      WHERE payout_id=$1 AND technician_username=$2
      ORDER BY created_at ASC, adj_id ASC`,
    [payoutId, tech]
  );
  const adjustments = adjQ.rows || [];

  const payQ = await db.query(
    `SELECT payment_id, paid_amount, paid_status, paid_at, slip_url, note
       FROM public.technician_payout_payments
      WHERE payout_id=$1 AND technician_username=$2
      LIMIT 1`,
    [payoutId, tech]
  );
  const payment = payQ.rows?.[0] || null;

  const gross = moneyFn(lines.reduce((sum, line) => sum + Number(line.earn_amount || 0), 0));
  const adj = moneyFn(adjustments.reduce((sum, row) => sum + Number(row.adj_amount || 0), 0));
  const deposit = await getProjectedDepositDeductionForPayout(db, {
    payout_id: payoutId,
    technician_username: tech,
    gross_amount: gross,
    adj_total: adj,
    period_status: status,
  });
  const depositAmount = moneyFn(deposit?.deposit_deduction_amount || 0);
  const net = moneyFn(gross + adj - depositAmount);
  const paid = moneyFn(payment?.paid_amount || 0);
  const paidStatusValue = paidStatusFn(net, paid);

  return {
    payout_id: payoutId,
    period_type: period.period_type,
    label_ym: period.label_ym || "",
    work_month: period.work_month || "",
    period_start: toIso(periodStartRaw),
    period_end: toIso(periodEndRaw),
    period_end_display: period.period_end_display || null,
    status,
    source: loaded?.source || "",
    gross_amount: gross,
    adj_total: adj,
    deposit_deduction_amount: depositAmount,
    net_amount: net,
    payout_month_amount: gross,
    payout_month_net_amount: net,
    paid_amount: paid,
    paid_status: paidStatusValue,
    remaining_amount: moneyFn(net - paid),
    ...deposit,
    latest_deposit_deduction: depositAmount,
    lines_count: lines.length,
    lines,
    adjustments,
    payment,
    paid_at: payment?.paid_at || null,
    slip_url: payment?.slip_url || null,
  };
}

async function inspectJobPayoutDeleteImpact(db, jobId) {
  if (!db || typeof db.query !== "function") throw new Error("PAYOUT_DELETE_DB_REQUIRED");
  const jid = String(Number(jobId));
  if (!/^\d+$/.test(jid) || Number(jid) <= 0) {
    const err = new Error("INVALID_JOB_ID");
    err.statusCode = 400;
    err.code = "INVALID_JOB_ID";
    throw err;
  }
  const q = await db.query(
    `WITH refs AS (
       SELECT payout_id, technician_username, 'line'::text AS ref_type
         FROM public.technician_payout_lines
        WHERE job_id::text=$1
       UNION ALL
       SELECT payout_id, technician_username, 'adjustment'::text AS ref_type
         FROM public.technician_payout_adjustments
        WHERE job_id::text=$1
     ),
     grouped AS (
       SELECT payout_id, technician_username,
              COUNT(*) FILTER (WHERE ref_type='line')::int AS line_refs,
              COUNT(*) FILTER (WHERE ref_type='adjustment')::int AS adjustment_refs
         FROM refs
        GROUP BY payout_id, technician_username
     )
     SELECT g.payout_id,
            g.technician_username,
            COALESCE(p.status,'draft') AS period_status,
            g.line_refs,
            g.adjustment_refs,
            pay.payment_id,
            COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
            COALESCE(pay.paid_status,'') AS paid_status,
            pay.paid_at
       FROM grouped g
       LEFT JOIN public.technician_payout_periods p ON p.payout_id=g.payout_id
       LEFT JOIN public.technician_payout_payments pay
         ON pay.payout_id=g.payout_id
        AND pay.technician_username=g.technician_username
      ORDER BY g.payout_id ASC, g.technician_username ASC`,
    [jid]
  );
  const rows = q.rows || [];
  const blockers = rows.filter((row) => statusIsBlocked(row.period_status) || hasPaymentRecord(row));
  return {
    job_id: jid,
    rows,
    blockers,
    can_delete_payout_refs: blockers.length === 0,
  };
}

async function cleanupDraftJobPayoutRows(db, jobId, impact = null) {
  const checked = impact || await inspectJobPayoutDeleteImpact(db, jobId);
  if (checked.blockers?.length) throw createPayoutDeleteBlockedError(checked.blockers);
  const jid = String(Number(jobId));
  const adj = await db.query(
    `DELETE FROM public.technician_payout_adjustments
      WHERE job_id::text=$1`,
    [jid]
  );
  const lines = await db.query(
    `DELETE FROM public.technician_payout_lines
      WHERE job_id::text=$1`,
    [jid]
  );
  const preview = await db.query(
    `DELETE FROM public.job_technician_income_preview
      WHERE job_id=$1`,
    [Number(jid)]
  );
  const display = await db.query(
    `DELETE FROM public.technician_job_income_display
      WHERE job_id=$1`,
    [Number(jid)]
  );
  return {
    ok: true,
    job_id: jid,
    deleted_payout_adjustments: adj.rowCount || 0,
    deleted_payout_lines: lines.rowCount || 0,
    deleted_income_previews: preview.rowCount || 0,
    deleted_income_display_rows: display.rowCount || 0,
    inspected_refs: checked.rows || [],
  };
}

function orphanPayoutLinesAuditSql({ limit = 200 } = {}) {
  const n = Math.min(Math.max(Number(limit || 200), 1), 10000);
  return `
SELECT l.payout_id,
       p.status AS period_status,
       l.technician_username,
       l.job_id,
       COUNT(*)::int AS orphan_lines,
       COALESCE(SUM(l.earn_amount),0)::numeric AS orphan_gross_amount,
       COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
       COALESCE(pay.paid_status,'') AS paid_status
  FROM public.technician_payout_lines l
  LEFT JOIN public.jobs j ON j.job_id::text = l.job_id::text
  LEFT JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
  LEFT JOIN public.technician_payout_payments pay
    ON pay.payout_id = l.payout_id
   AND pay.technician_username = l.technician_username
 WHERE j.job_id IS NULL
 GROUP BY l.payout_id, p.status, l.technician_username, l.job_id, pay.paid_amount, pay.paid_status
 ORDER BY l.payout_id ASC, l.technician_username ASC, l.job_id ASC
 LIMIT ${n}`;
}

module.exports = {
  buildTechnicianPayoutPeriodSummary,
  inspectJobPayoutDeleteImpact,
  cleanupDraftJobPayoutRows,
  orphanPayoutLinesAuditSql,
};
