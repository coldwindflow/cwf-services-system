"use strict";

function money(v) {
  const n = Number(v || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function currentPayoutId(periodBoundsForYm, bkkNow, bkkYmd) {
  const now = bkkNow ? bkkNow() : new Date(Date.now() + 7 * 60 * 60 * 1000);
  const ymd = bkkYmd ? bkkYmd(now) : { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
  if (Number(ymd.d) <= 15) {
    const b = periodBoundsForYm("25", ymd.y, ymd.m);
    return { payout_id: `payout_${b.label_ym}_25`, bounds: b };
  }
  let y = ymd.y;
  let m = ymd.m + 1;
  if (m > 12) { m = 1; y += 1; }
  const b = periodBoundsForYm("10", y, m);
  return { payout_id: `payout_${b.label_ym}_10`, bounds: b };
}

function createTechnicianDeductionPayoutApply(deps = {}) {
  const {
    pool,
    periodBoundsForYm,
    bkkNow,
    bkkYmd,
    getActorUsername,
    ledger,
    logDeductionAudit,
  } = deps;
  if (!pool) throw new Error("technicianDeductionPayoutApply requires pool");

  async function ensurePayoutPeriod(client, payoutId, bounds, actor) {
    await client.query(
      `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
       VALUES($1,$2,$3,$4,'draft',$5)
       ON CONFLICT (payout_id) DO NOTHING`,
      [payoutId, bounds.period_type, bounds.start.toISOString(), bounds.endEx.toISOString(), actor || null]
    );
  }

  async function applyApprovedCase(req, caseId) {
    const id = Number(caseId || 0);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error("INVALID_CASE_ID");
      err.status = 400;
      throw err;
    }
    const actor = getActorUsername ? getActorUsername(req) : null;
    const client = await pool.connect();
    let result = null;
    try {
      await client.query("BEGIN");
      const cur = await client.query(`SELECT * FROM public.technician_deduction_cases WHERE case_id=$1 FOR UPDATE`, [id]);
      if (!cur.rows.length) {
        const err = new Error("DEDUCTION_CASE_NOT_FOUND");
        err.status = 404;
        throw err;
      }
      const before = cur.rows[0];
      if (!["pending_approval", "approved", "applied"].includes(String(before.status || ""))) {
        const err = new Error(`INVALID_DEDUCTION_STATUS_${before.status}`);
        err.status = 409;
        throw err;
      }

      let payoutId = before.applied_payout_id;
      let adjustmentId = before.applied_adjustment_id;
      const amount = money(before.amount);
      if (!payoutId) {
        const picked = currentPayoutId(periodBoundsForYm, bkkNow, bkkYmd);
        payoutId = picked.payout_id;
        await ensurePayoutPeriod(client, payoutId, picked.bounds, actor);
      }

      if (!adjustmentId) {
        const existing = await client.query(
          `SELECT adj_id
             FROM public.technician_payout_adjustments
            WHERE source_type='deduction_case' AND source_id=$1
            ORDER BY adj_id ASC LIMIT 1`,
          [String(id)]
        );
        if (existing.rows[0]) {
          adjustmentId = existing.rows[0].adj_id;
        } else {
          const ins = await client.query(
            `INSERT INTO public.technician_payout_adjustments
             (payout_id, technician_username, job_id, adj_amount, reason, created_by, source_type, source_id)
             VALUES($1,$2,$3,$4,$5,$6,'deduction_case',$7)
             RETURNING adj_id`,
            [
              payoutId,
              before.technician_username,
              before.job_id == null ? null : String(before.job_id),
              -Math.abs(amount),
              `Deduction case ${before.case_code || id}: ${before.reason || before.deduction_type || ""}`.slice(0, 500),
              actor || before.approved_by || before.created_by || null,
              String(id),
            ]
          );
          adjustmentId = ins.rows[0].adj_id;
        }
      }

      const up = await client.query(
        `UPDATE public.technician_deduction_cases
            SET status='applied',
                approved_by=COALESCE(approved_by,$2),
                approved_at=COALESCE(approved_at,NOW()),
                applied_by=COALESCE(applied_by,$2),
                applied_at=COALESCE(applied_at,NOW()),
                applied_payout_id=$3,
                applied_adjustment_id=$4,
                updated_at=NOW()
          WHERE case_id=$1
          RETURNING *`,
        [id, actor || null, payoutId, adjustmentId]
      );
      if (logDeductionAudit) {
        await logDeductionAudit(client, req, {
          action: "DEDUCTION_CASE_APPLY_TO_PAYOUT",
          entity_type: "deduction_case",
          entity_id: id,
          before,
          after: up.rows[0],
          note: `applied adjustment ${adjustmentId} to ${payoutId}`,
        });
      }
      await client.query("COMMIT");
      result = up.rows[0];
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }

    const ledgerData = ledger ? await ledger.buildTechnicianRows(result.applied_payout_id) : { rows: [] };
    const row = (ledgerData.rows || []).find(r => String(r.technician_username) === String(result.technician_username)) || {};
    const deductionTotal = Math.abs(Number(row.deduction_adjustment_amount || 0));
    const payableBeforeDeduction = Number(row.gross_amount || 0) + Number(row.adj_total || 0) - Number(row.deduction_adjustment_amount || 0) - Number(row.deposit_deduction_amount || 0);
    const recovered = money(Math.min(Math.abs(Number(result.amount || 0)), Math.max(0, payableBeforeDeduction)));
    const outstanding = money(Math.max(0, Math.abs(Number(result.amount || 0)) - recovered));

    const recoveryStatus = outstanding <= 0 ? "recovered" : (recovered > 0 ? "partial" : "applied");
    try {
      await pool.query(
        `UPDATE public.technician_deduction_cases
            SET recovery_status=$2, recovered_amount=$3, outstanding_amount=$4, updated_at=NOW()
          WHERE case_id=$1`,
        [result.case_id, recoveryStatus, recovered, outstanding]
      );
      result.recovery_status = recoveryStatus;
      result.recovered_amount = recovered;
      result.outstanding_amount = outstanding;
    } catch (_) {}

    return {
      ok: true,
      row: result,
      payout_id: result.applied_payout_id,
      adjustment_id: result.applied_adjustment_id,
      applied_amount: money(Math.abs(Number(result.amount || 0))),
      recovered_amount: recovered,
      outstanding_amount: outstanding,
      ledger_adjustment_total: money(row.adj_total || 0),
      ledger_deduction_total: money(deductionTotal),
    };
  }

  return { applyApprovedCase };
}

module.exports = { createTechnicianDeductionPayoutApply };
