'use strict';

const { createTechnicianDeductionPayoutApplyService } = require('./technicianDeductionPayoutApply');

// Reuse the exact same Bangkok period-boundary math the deduction-adjustment
// flow already uses in production, so rework hold/release and deduction
// adjustments can never disagree about which payout period a date belongs to.
const { payoutTargetForDate, nextPayoutTarget } = createTechnicianDeductionPayoutApplyService();

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function paidStatus(netAmount, paidAmount) {
  const net = money(netAmount);
  const paid = money(paidAmount);
  if (net <= 0) return 'paid';
  if (paid <= 0) return 'unpaid';
  if (paid + 0.0001 >= net) return 'paid';
  return 'partial';
}

function releaseIdempotencyKey(reworkCaseId, technicianUsername) {
  return `rework_release:${reworkCaseId}:${String(technicianUsername || '').trim()}`;
}

async function ensurePeriod(client, target, actor) {
  await client.query(
    `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
     VALUES($1,$2,$3,$4,'draft',$5)
     ON CONFLICT (payout_id) DO NOTHING`,
    [target.payout_id, target.period_type, target.period_start.toISOString(), target.period_end.toISOString(), actor || 'rework_income:auto']
  );
  const q = await client.query(
    `SELECT payout_id, period_type, period_start, period_end, status
       FROM public.technician_payout_periods
      WHERE payout_id=$1
      LIMIT 1`,
    [target.payout_id]
  );
  return q.rows[0] || null;
}

async function findExistingPeriodStatus(client, target) {
  const q = await client.query(
    `SELECT status FROM public.technician_payout_periods WHERE payout_id=$1 LIMIT 1`,
    [target.payout_id]
  );
  return q.rows[0] ? String(q.rows[0].status) : null;
}

// Mirrors technicianDeductionPayoutApply.resolveTargetPeriod: roll forward
// past periods already marked 'paid' so we never insert a new line/adjustment
// into a payout that has already been disbursed.
async function resolveOpenTargetPeriod(client, fromDate, actor) {
  let target = payoutTargetForDate(fromDate);
  for (let i = 0; i < 24; i += 1) {
    const period = await ensurePeriod(client, target, actor);
    if (period && String(period.status || 'draft') !== 'paid') {
      return { target, period, rolled_forward_count: i };
    }
    target = nextPayoutTarget(target);
  }
  const err = new Error('NO_OPEN_PAYOUT_PERIOD_FOR_REWORK_RELEASE');
  err.status = 409;
  throw err;
}

async function recalcPaymentStatus(client, payoutId, technicianUsername) {
  // Mirrors technicianDeductionPayoutApply.recalcPaymentStatus exactly so both
  // adjustment paths agree on net_amount/paid_status for the same payout+tech.
  const q = await client.query(
    `WITH gross AS (
       SELECT COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
         FROM public.technician_payout_lines
        WHERE payout_id=$1 AND technician_username=$2
     ), adj AS (
       SELECT COALESCE(SUM(adj_amount),0)::numeric AS adj_total
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2
     ), dep AS (
       SELECT COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount
         FROM public.technician_deposit_ledger
        WHERE payout_id=$1 AND technician_username=$2 AND transaction_type='collect'
     ), pay AS (
       SELECT payment_id, COALESCE(paid_amount,0)::numeric AS paid_amount
         FROM public.technician_payout_payments
        WHERE payout_id=$1 AND technician_username=$2
        LIMIT 1
     )
     SELECT (gross.gross_amount + adj.adj_total - dep.deposit_deduction_amount)::numeric AS net_amount,
            COALESCE(pay.paid_amount,0)::numeric AS paid_amount,
            pay.payment_id
       FROM gross, adj, dep
       LEFT JOIN pay ON TRUE`,
    [payoutId, technicianUsername]
  );
  const row = q.rows[0] || { net_amount: 0, paid_amount: 0, payment_id: null };
  if (row.payment_id) {
    await client.query(
      `UPDATE public.technician_payout_payments
          SET paid_status=$3, updated_at=NOW()
        WHERE payment_id=$1 AND payout_id=$2`,
      [row.payment_id, payoutId, paidStatus(row.net_amount, row.paid_amount)]
    );
  }
  return { net_amount: money(row.net_amount), paid_amount: money(row.paid_amount), paid_status: paidStatus(row.net_amount, row.paid_amount) };
}

async function getExistingHold(client, reworkCaseId, technicianUsername) {
  const q = await client.query(
    `SELECT * FROM public.technician_rework_income_holds
      WHERE rework_case_id=$1 AND technician_username=$2
      FOR UPDATE`,
    [reworkCaseId, technicianUsername]
  );
  return q.rows[0] || null;
}

/**
 * Pause the original technician's income for a job that is being sent to rework.
 *
 * `resolveOriginalEarnAmount(client)` must be supplied by the caller and return the
 * ledger-grade earned amount for (jobId, technicianUsername) — e.g. an existing
 * public.technician_payout_lines row if one was already cached, otherwise the same
 * deterministic payout engine used to populate that table. Never pass a UI/preview
 * display value here.
 *
 * Idempotent: calling this twice for the same (reworkCaseId, technicianUsername)
 * is a no-op on the second call (invariant: one immutable hold row per case+tech).
 */
async function holdOriginalIncomeForReworkCase(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId || 0);
  const jobId = Number(opts.jobId || 0);
  const technicianUsername = String(opts.technicianUsername || '').trim();
  const originalFinishedAt = opts.originalFinishedAt ? new Date(opts.originalFinishedAt) : null;
  const actor = String(opts.actor || '').trim() || null;

  if (!reworkCaseId || !jobId || !technicianUsername) {
    const err = new Error('INVALID_REWORK_HOLD_INPUT');
    err.status = 400;
    throw err;
  }

  const existing = await getExistingHold(client, reworkCaseId, technicianUsername);
  if (existing) {
    return { already_held: true, row: existing };
  }

  if (!originalFinishedAt || Number.isNaN(originalFinishedAt.getTime())) {
    // Job never had a finished_at (e.g. it was never completed before going to rework) —
    // there is no original income to hold.
    const ins = await client.query(
      `INSERT INTO public.technician_rework_income_holds
       (rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_status, created_by)
       VALUES ($1,$2,$3,0,NULL,'no_prior_finish','already_paid_no_action',$4)
       RETURNING *`,
      [reworkCaseId, technicianUsername, jobId, actor]
    );
    return { already_held: false, held: false, row: ins.rows[0] };
  }

  const amount = money(typeof opts.resolveOriginalEarnAmount === 'function'
    ? await opts.resolveOriginalEarnAmount(client)
    : opts.originalEarnAmount);

  const target = payoutTargetForDate(originalFinishedAt);
  const periodStatus = await findExistingPeriodStatus(client, target);

  if (amount <= 0) {
    const ins = await client.query(
      `INSERT INTO public.technician_rework_income_holds
       (rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_status, created_by)
       VALUES ($1,$2,$3,0,$4,$5,'already_paid_no_action',$6)
       RETURNING *`,
      [reworkCaseId, technicianUsername, jobId, target.payout_id, periodStatus || 'none', actor]
    );
    return { already_held: false, held: false, row: ins.rows[0] };
  }

  if (periodStatus === 'paid') {
    // Already disbursed in a paid period: invariant 6 — do not touch, do not hold.
    const ins = await client.query(
      `INSERT INTO public.technician_rework_income_holds
       (rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_status, created_by)
       VALUES ($1,$2,$3,$4,$5,'paid','already_paid_no_action',$6)
       RETURNING *`,
      [reworkCaseId, technicianUsername, jobId, amount, target.payout_id, actor]
    );
    return { already_held: false, held: false, row: ins.rows[0] };
  }

  let holdAdjustmentId = null;
  if (periodStatus === 'locked') {
    // Locked periods are frozen snapshots that will not be regenerated, so the
    // original gross line will not naturally drop out once finished_at is cleared.
    // Neutralize it now with a negative adjustment.
    const reason = `พักรายได้เดิม งานแก้ไข rework_case_id=${reworkCaseId} job_id=${jobId}`.slice(0, 1500);
    const adj = await client.query(
      `INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING adj_id`,
      [target.payout_id, technicianUsername, String(jobId), -amount, reason, actor]
    );
    holdAdjustmentId = adj.rows[0].adj_id;
    await recalcPaymentStatus(client, target.payout_id, technicianUsername);
  }
  // periodStatus === 'draft' or null (period not generated yet): no adjustment needed —
  // clearing finished_at on the job means the gross line will not be (re)computed for
  // this job until the rework outcome is known, so the income is already effectively paused.

  const ins = await client.query(
    `INSERT INTO public.technician_rework_income_holds
     (rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_adjustment_id, hold_status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'held',$8)
     RETURNING *`,
    [reworkCaseId, technicianUsername, jobId, amount, target.payout_id, periodStatus || 'draft', holdAdjustmentId, actor]
  );
  return { already_held: false, held: true, row: ins.rows[0] };
}

/**
 * Release a previously held amount back into the technician's payout once the
 * rework case closes successfully. `finishedAt` must be the rework job's own
 * finished_at (Asia/Bangkok 1-15 -> payout 25th same month, 16-end -> payout
 * 10th next month). Idempotent: safe to call any number of times for the same
 * (reworkCaseId, technicianUsername) — only the first call that finds
 * hold_status='held' moves money; every call after that is a no-op.
 */
async function releaseHeldIncomeForReworkCase(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId || 0);
  const technicianUsername = String(opts.technicianUsername || '').trim();
  const finishedAt = opts.finishedAt ? new Date(opts.finishedAt) : null;
  const actor = String(opts.actor || '').trim() || null;

  if (!reworkCaseId || !technicianUsername) {
    const err = new Error('INVALID_REWORK_RELEASE_INPUT');
    err.status = 400;
    throw err;
  }

  const hold = await getExistingHold(client, reworkCaseId, technicianUsername);
  if (!hold) {
    return { released: false, reason: 'NO_HOLD' };
  }
  if (hold.hold_status !== 'held') {
    // Already released / already_paid_no_action / voided — idempotent no-op.
    return { released: false, reason: hold.hold_status, row: hold };
  }

  const amount = money(hold.held_amount);
  if (amount <= 0) {
    await client.query(
      `UPDATE public.technician_rework_income_holds SET hold_status='voided', updated_at=NOW() WHERE hold_id=$1`,
      [hold.hold_id]
    );
    return { released: false, reason: 'ZERO_AMOUNT' };
  }
  if (!finishedAt || Number.isNaN(finishedAt.getTime())) {
    const err = new Error('INVALID_FINISHED_AT_FOR_REWORK_RELEASE');
    err.status = 400;
    throw err;
  }

  const idempotencyKey = releaseIdempotencyKey(reworkCaseId, technicianUsername);
  const { target, period } = await resolveOpenTargetPeriod(client, finishedAt, actor);
  const payoutId = period.payout_id;

  const reason = `คืนรายได้เดิม จากงานแก้ไข rework_case_id=${reworkCaseId} job_id=${hold.job_id}`.slice(0, 1500);
  const adj = await client.query(
    `INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by`,
    [payoutId, technicianUsername, String(hold.job_id), amount, reason, actor]
  );
  const adjustment = adj.rows[0];

  const updated = await client.query(
    `UPDATE public.technician_rework_income_holds
        SET hold_status='released',
            released_amount=$2,
            release_payout_id=$3,
            release_adjustment_id=$4,
            release_idempotency_key=$5,
            released_at=NOW(),
            updated_at=NOW()
      WHERE hold_id=$1
      RETURNING *`,
    [hold.hold_id, amount, payoutId, adjustment.adj_id, idempotencyKey]
  );

  const payment = await recalcPaymentStatus(client, payoutId, technicianUsername);
  return {
    released: true,
    amount,
    payout_id: payoutId,
    period: target,
    adjustment,
    payment,
    row: updated.rows[0],
  };
}

/**
 * Mark a held amount as permanently void (rework failed / case voided / company
 * absorbed) — no money moves. If a negative adjustment was already created at
 * hold time (locked-period case), it stays in place, which is the correct
 * outcome since the original work was confirmed not payable.
 */
async function voidHeldIncomeForReworkCase(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId || 0);
  const technicianUsername = String(opts.technicianUsername || '').trim();
  if (!reworkCaseId || !technicianUsername) {
    const err = new Error('INVALID_REWORK_VOID_INPUT');
    err.status = 400;
    throw err;
  }
  const hold = await getExistingHold(client, reworkCaseId, technicianUsername);
  if (!hold || hold.hold_status !== 'held') {
    return { voided: false, row: hold || null };
  }
  const updated = await client.query(
    `UPDATE public.technician_rework_income_holds SET hold_status='voided', updated_at=NOW() WHERE hold_id=$1 RETURNING *`,
    [hold.hold_id]
  );
  return { voided: true, row: updated.rows[0] };
}

async function getHoldForReworkCase(client, reworkCaseId, technicianUsername) {
  const q = await client.query(
    `SELECT * FROM public.technician_rework_income_holds WHERE rework_case_id=$1 AND technician_username=$2 LIMIT 1`,
    [reworkCaseId, technicianUsername]
  );
  return q.rows[0] || null;
}

module.exports = {
  holdOriginalIncomeForReworkCase,
  releaseHeldIncomeForReworkCase,
  voidHeldIncomeForReworkCase,
  getHoldForReworkCase,
  releaseIdempotencyKey,
  money,
};
