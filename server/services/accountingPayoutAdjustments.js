"use strict";

const {
  parsePayoutId,
  periodBoundsForYm,
  isPeriodCutoffClosed,
} = require("./technicianPayoutPeriods");

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function paidStatus(netAmount, paidAmount) {
  const net = money(netAmount);
  const paid = money(paidAmount);
  if (net <= 0 && paid <= 0) return "paid";
  if (paid >= net - 0.0001) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

function appError(message, statusCode = 400, code = message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function normalizePayload(payoutId, body = {}) {
  const payout_id = String(payoutId || "").trim();
  const technician_username = String(body.technician_username || "").trim();
  const adj_amount = money(body.adj_amount);
  const reason = String(body.reason || "").trim();
  const job_id = body.job_id == null || String(body.job_id).trim() === "" ? null : String(body.job_id).trim();
  const idempotency_key = String(body.idempotency_key || body.idempotencyKey || "").trim();
  const confirm_adjustment = body.confirm_adjustment === true || String(body.confirm_adjustment || "").toLowerCase() === "true";

  if (!payout_id) throw appError("MISSING_PAYOUT_ID", 400);
  if (!technician_username) throw appError("MISSING_TECHNICIAN_USERNAME", 400);
  if (!Number.isFinite(adj_amount) || adj_amount <= 0) throw appError("INVALID_ADJUSTMENT_AMOUNT", 400);
  if (!reason) throw appError("MISSING_REASON", 400);
  if (!idempotency_key) throw appError("IDEMPOTENCY_KEY_REQUIRED", 400);
  if (!confirm_adjustment) throw appError("CONFIRM_ADJUSTMENT_REQUIRED", 400);

  return { payout_id, technician_username, adj_amount, reason, job_id, idempotency_key };
}

function payloadMatches(row, payload) {
  if (!row) return false;
  return String(row.payout_id || "") === payload.payout_id
    && String(row.technician_username || "") === payload.technician_username
    && money(row.adj_amount) === money(payload.adj_amount)
    && String(row.reason || "") === payload.reason
    && (row.job_id == null || String(row.job_id).trim() === "" ? null : String(row.job_id).trim()) === payload.job_id;
}

async function assertAdjustmentMigrationReady(client) {
  const col = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='technician_payout_adjustments'
        AND column_name='idempotency_key'
      LIMIT 1`
  );
  if (!col.rows.length) {
    throw appError("PAYOUT_ADJUSTMENT_MIGRATION_REQUIRED", 503);
  }
  const idx = await client.query(
    `SELECT 1
       FROM pg_indexes
      WHERE schemaname='public'
        AND tablename='technician_payout_adjustments'
        AND indexname='uq_tpa_idempotency_key'
      LIMIT 1`
  );
  if (!idx.rows.length) {
    throw appError("PAYOUT_ADJUSTMENT_MIGRATION_REQUIRED", 503);
  }
}

async function getPayoutPeriodForUpdate(client, payoutId) {
  const q = await client.query(
    `SELECT payout_id, status, period_type, period_start, period_end, created_at, created_by
       FROM public.technician_payout_periods
      WHERE payout_id=$1
      FOR UPDATE`,
    [payoutId]
  );
  return q.rows[0] || null;
}

async function ensureClosedDraftPeriodSnapshot({
  client,
  payout_id,
  actor_username,
  regenerateDraftPayoutContractLines,
  req,
}) {
  let period = await getPayoutPeriodForUpdate(client, payout_id);
  const parsed = parsePayoutId(payout_id);
  if (!period) {
    if (!parsed) throw appError("PAYOUT_NOT_FOUND", 404);
    const bounds = periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    const virtual = {
      payout_id,
      period_type: bounds.period_type,
      period_start: bounds.start.toISOString(),
      period_end: bounds.endEx.toISOString(),
      status: "draft",
    };
    if (!isPeriodCutoffClosed(virtual)) {
      throw appError("PAYOUT_PERIOD_NOT_CLOSED", 409, "PAYOUT_PERIOD_NOT_CLOSED", { period_end: virtual.period_end });
    }
    await client.query(
      `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
       VALUES($1,$2,$3,$4,'draft',$5)
       ON CONFLICT (payout_id) DO NOTHING`,
      [payout_id, bounds.period_type, bounds.start.toISOString(), bounds.endEx.toISOString(), actor_username || null]
    );
    period = await getPayoutPeriodForUpdate(client, payout_id);
  }
  if (!period) throw appError("PAYOUT_NOT_FOUND", 404);

  const status = String(period.status || "draft");
  if (status === "draft") {
    if (!isPeriodCutoffClosed(period)) {
      throw appError("PAYOUT_PERIOD_NOT_CLOSED", 409, "PAYOUT_PERIOD_NOT_CLOSED", { period_end: period.period_end });
    }
    if (typeof regenerateDraftPayoutContractLines !== "function") {
      throw appError("PAYOUT_SNAPSHOT_UNAVAILABLE", 500);
    }
    const regen = await regenerateDraftPayoutContractLines({
      client,
      payout_id,
      actor_username: actor_username || null,
      req,
      skipAudit: true,
    });
    await client.query(
      `UPDATE public.technician_payout_periods
          SET status='locked'
        WHERE payout_id=$1 AND status='draft'`,
      [payout_id]
    );
    period = await getPayoutPeriodForUpdate(client, payout_id);
    return { period, regenerated: true, regen };
  }

  if (status !== "locked" && status !== "paid") {
    throw appError("UNSUPPORTED_PAYOUT_STATUS", 409);
  }
  return { period, regenerated: false, regen: null };
}

async function getPayoutTechSettlementRows(client, payoutId) {
  const q = await client.query(
    `WITH techs AS (
       SELECT technician_username FROM public.technician_payout_lines WHERE payout_id=$1
       UNION
       SELECT technician_username FROM public.technician_payout_adjustments WHERE payout_id=$1
       UNION
       SELECT technician_username FROM public.technician_payout_payments WHERE payout_id=$1
       UNION
       SELECT technician_username FROM public.technician_deposit_ledger WHERE payout_id=$1 AND transaction_type='collect'
     ),
     gross AS (
       SELECT technician_username, COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
         FROM public.technician_payout_lines
        WHERE payout_id=$1
        GROUP BY technician_username
     ),
     adj AS (
       SELECT technician_username, COALESCE(SUM(adj_amount),0)::numeric AS adj_total
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1
        GROUP BY technician_username
     ),
     dep AS (
       SELECT technician_username, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount
         FROM public.technician_deposit_ledger
        WHERE payout_id=$1 AND transaction_type='collect'
        GROUP BY technician_username
     ),
     pay AS (
       SELECT technician_username, COALESCE(paid_amount,0)::numeric AS paid_amount
         FROM public.technician_payout_payments
        WHERE payout_id=$1
     )
     SELECT t.technician_username,
            COALESCE(g.gross_amount,0)::numeric AS gross_amount,
            COALESCE(a.adj_total,0)::numeric AS adj_total,
            COALESCE(d.deposit_deduction_amount,0)::numeric AS deposit_deduction_amount,
            (COALESCE(g.gross_amount,0) + COALESCE(a.adj_total,0) - COALESCE(d.deposit_deduction_amount,0))::numeric AS net_amount,
            COALESCE(p.paid_amount,0)::numeric AS paid_amount
       FROM techs t
       LEFT JOIN gross g ON g.technician_username=t.technician_username
       LEFT JOIN adj a ON a.technician_username=t.technician_username
       LEFT JOIN dep d ON d.technician_username=t.technician_username
       LEFT JOIN pay p ON p.technician_username=t.technician_username
      ORDER BY t.technician_username ASC`,
    [payoutId]
  );
  return (q.rows || []).map((r) => ({
    technician_username: r.technician_username,
    gross_amount: money(r.gross_amount),
    adj_total: money(r.adj_total),
    deposit_deduction_amount: money(r.deposit_deduction_amount),
    net_amount: money(r.net_amount),
    paid_amount: money(r.paid_amount),
    remaining_amount: money(Math.max(0, Number(r.net_amount || 0) - Number(r.paid_amount || 0))),
    paid_status: paidStatus(r.net_amount, r.paid_amount),
  }));
}

async function getPayoutTechTotals(client, payoutId, tech) {
  const rows = await getPayoutTechSettlementRows(client, payoutId);
  return rows.find((r) => String(r.technician_username || "") === String(tech || "")) || {
    technician_username: tech,
    gross_amount: 0,
    adj_total: 0,
    deposit_deduction_amount: 0,
    net_amount: 0,
    paid_amount: 0,
    remaining_amount: 0,
    paid_status: "paid",
  };
}

function isPayoutFullyPaidFromRows(rows = []) {
  return rows.length > 0 && rows.every((r) => paidStatus(r.net_amount, r.paid_amount) === "paid");
}

async function lockPaymentRow(client, payoutId, tech) {
  const q = await client.query(
    `SELECT payment_id, payout_id, technician_username, paid_amount, paid_status, paid_at, paid_by, slip_url, note,
            payment_method, payment_reference
       FROM public.technician_payout_payments
      WHERE payout_id=$1 AND technician_username=$2
      FOR UPDATE`,
    [payoutId, tech]
  );
  return q.rows[0] || null;
}

async function validateJobIdIfPresent(client, jobId) {
  if (!jobId) return;
  if (!/^\d+$/.test(String(jobId))) throw appError("INVALID_JOB_ID", 400);
  const q = await client.query(
    `SELECT 1 FROM public.jobs WHERE job_id=$1 LIMIT 1`,
    [jobId]
  );
  if (!q.rows.length) throw appError("JOB_NOT_FOUND", 404);
}

async function findAdjustmentByIdempotencyKey(client, key) {
  const q = await client.query(
    `SELECT adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by, idempotency_key
       FROM public.technician_payout_adjustments
      WHERE idempotency_key=$1
      FOR UPDATE`,
    [key]
  );
  return q.rows[0] || null;
}

async function insertAccountingAudit(client, req, payload = {}) {
  const actor = req?.actor || req?.auth || req?.effective || {};
  await client.query(
    `INSERT INTO public.accounting_audit_log
      (actor_user_id, actor_username, actor_role, action, entity_type, entity_id,
       before_json, after_json, ip_address, user_agent, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
    [
      actor.username || null,
      actor.username || null,
      actor.role || null,
      payload.action || "PAYOUT_ADJUSTMENT_CREATE",
      payload.entity_type || "technician_payout_adjustment",
      payload.entity_id || null,
      JSON.stringify(payload.before_json || null),
      JSON.stringify(payload.after_json || null),
      req?.ip || req?.headers?.["x-forwarded-for"] || null,
      req?.headers?.["user-agent"] || null,
      payload.note || null,
    ]
  );
}

async function applyAccountingPositivePayoutAdjustment({
  client,
  payout_id,
  body,
  actor,
  req,
  regenerateDraftPayoutContractLines,
}) {
  const payload = normalizePayload(payout_id, body);
  await assertAdjustmentMigrationReady(client);

  const snapshot = await ensureClosedDraftPeriodSnapshot({
    client,
    payout_id: payload.payout_id,
    actor_username: actor?.username || null,
    regenerateDraftPayoutContractLines,
    req,
  });
  const periodBefore = { ...(snapshot.period || {}) };
  const paymentBefore = await lockPaymentRow(client, payload.payout_id, payload.technician_username);
  await validateJobIdIfPresent(client, payload.job_id);

  const existing = await findAdjustmentByIdempotencyKey(client, payload.idempotency_key);
  if (existing) {
    if (!payloadMatches(existing, payload)) {
      throw appError("IDEMPOTENCY_KEY_REUSED", 409);
    }
    const totals = await getPayoutTechTotals(client, payload.payout_id, payload.technician_username);
    return {
      replayed: true,
      adjustment: existing,
      payment: paymentBefore,
      totals,
      period_status_before: periodBefore.status,
      period_status_after: snapshot.period?.status || periodBefore.status,
      regenerated: snapshot.regenerated,
    };
  }

  const totalsBefore = await getPayoutTechTotals(client, payload.payout_id, payload.technician_username);
  const ins = await client.query(
    `INSERT INTO public.technician_payout_adjustments
       (payout_id, technician_username, job_id, adj_amount, reason, created_by, idempotency_key)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by, idempotency_key`,
    [
      payload.payout_id,
      payload.technician_username,
      payload.job_id,
      payload.adj_amount,
      payload.reason,
      actor?.username || null,
      payload.idempotency_key,
    ]
  );
  if (!ins.rows.length) {
    const conflicted = await findAdjustmentByIdempotencyKey(client, payload.idempotency_key);
    if (payloadMatches(conflicted, payload)) {
      const totals = await getPayoutTechTotals(client, payload.payout_id, payload.technician_username);
      return {
        replayed: true,
        adjustment: conflicted,
        payment: paymentBefore,
        totals,
        period_status_before: periodBefore.status,
        period_status_after: snapshot.period?.status || periodBefore.status,
        regenerated: snapshot.regenerated,
      };
    }
    throw appError("IDEMPOTENCY_KEY_REUSED", 409);
  }
  const adjustment = ins.rows[0];
  const totalsAfter = await getPayoutTechTotals(client, payload.payout_id, payload.technician_username);
  const nextPaidStatus = paidStatus(totalsAfter.net_amount, totalsAfter.paid_amount);

  if (paymentBefore) {
    await client.query(
      `UPDATE public.technician_payout_payments
          SET paid_status=$3, updated_at=NOW()
        WHERE payout_id=$1 AND technician_username=$2`,
      [payload.payout_id, payload.technician_username, nextPaidStatus]
    );
  }

  const allRows = await getPayoutTechSettlementRows(client, payload.payout_id);
  const allPaid = isPayoutFullyPaidFromRows(allRows);
  let nextPeriodStatus = snapshot.period?.status || periodBefore.status || "locked";
  if (allPaid) {
    nextPeriodStatus = "paid";
  } else if (String(nextPeriodStatus) === "paid") {
    nextPeriodStatus = "locked";
  }
  if (nextPeriodStatus !== String(snapshot.period?.status || "")) {
    await client.query(
      `UPDATE public.technician_payout_periods
          SET status=$2
        WHERE payout_id=$1`,
      [payload.payout_id, nextPeriodStatus]
    );
  }

  const paymentAfter = await lockPaymentRow(client, payload.payout_id, payload.technician_username);
  await insertAccountingAudit(client, req, {
    action: "PAYOUT_ADJUSTMENT_CREATE",
    entity_id: `${payload.payout_id}:${payload.technician_username}:${adjustment.adj_id}`,
    before_json: { period: periodBefore, payment: paymentBefore, totals: totalsBefore },
    after_json: {
      adjustment,
      period_status: nextPeriodStatus,
      payment: paymentAfter,
      totals: { ...totalsAfter, paid_status: nextPaidStatus },
      regenerated: snapshot.regenerated,
      regen: snapshot.regen,
    },
    note: payload.reason,
  });

  return {
    replayed: false,
    adjustment,
    payment: paymentAfter,
    totals: { ...totalsAfter, paid_status: nextPaidStatus },
    period_status_before: periodBefore.status,
    period_status_after: nextPeriodStatus,
    regenerated: snapshot.regenerated,
  };
}

module.exports = {
  money,
  paidStatus,
  normalizePayload,
  assertAdjustmentMigrationReady,
  getPayoutTechSettlementRows,
  getPayoutTechTotals,
  isPayoutFullyPaidFromRows,
  applyAccountingPositivePayoutAdjustment,
};
