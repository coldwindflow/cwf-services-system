'use strict';

const { createTechnicianDeductionPayoutApplyService } = require('./technicianDeductionPayoutApply');

const { payoutTargetForDate, nextPayoutTarget } = createTechnicianDeductionPayoutApplyService();

const HOLD_REASON_TAG = '[REWORK_HOLD]';
const RELEASE_REASON_TAG = '[REWORK_RELEASE]';

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
  return `rework_release:${Number(reworkCaseId)}:${String(technicianUsername || '').trim()}`;
}

function adjustmentJobKey(kind, reworkCaseId, jobId) {
  return `rework_${kind}:${Number(reworkCaseId)}:${Number(jobId)}`;
}

function uniqueTechnicianRows(rows) {
  const totals = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const tech = String(row?.technician_username || '').trim();
    if (!tech) continue;
    const amount = money(row?.amount ?? row?.earn_amount ?? row?.income_amount ?? 0);
    totals.set(tech, money((totals.get(tech) || 0) + amount));
  }
  return [...totals.entries()].map(([technician_username, amount]) => ({ technician_username, amount }));
}

async function ensurePeriod(client, target, actor) {
  await client.query(
    `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
     VALUES($1,$2,$3,$4,'draft',$5)
     ON CONFLICT (payout_id) DO NOTHING`,
    [
      target.payout_id,
      target.period_type,
      target.period_start.toISOString(),
      target.period_end.toISOString(),
      actor || 'rework_income:auto',
    ]
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
  return q.rows[0] ? String(q.rows[0].status || '').trim() : null;
}

async function resolveOpenTargetPeriodFromTarget(client, firstTarget, actor) {
  let target = firstTarget;
  for (let i = 0; i < 24; i += 1) {
    const period = await ensurePeriod(client, target, actor);
    if (period && String(period.status || 'draft') === 'draft') {
      return { target, period, rolled_forward_count: i };
    }
    target = nextPayoutTarget(target);
  }
  const err = new Error('NO_OPEN_PAYOUT_PERIOD_FOR_REWORK');
  err.status = 409;
  throw err;
}

async function resolveOpenTargetPeriod(client, fromDate, actor) {
  return resolveOpenTargetPeriodFromTarget(client, payoutTargetForDate(fromDate), actor);
}

async function recalcPaymentStatus(client, payoutId, technicianUsername) {
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
  const status = paidStatus(row.net_amount, row.paid_amount);
  if (row.payment_id) {
    await client.query(
      `UPDATE public.technician_payout_payments
          SET paid_status=$3, updated_at=NOW()
        WHERE payment_id=$1 AND payout_id=$2`,
      [row.payment_id, payoutId, status]
    );
  }
  return {
    net_amount: money(row.net_amount),
    paid_amount: money(row.paid_amount),
    paid_status: status,
  };
}

async function getExistingHold(client, reworkCaseId, technicianUsername, forUpdate = true) {
  const q = await client.query(
    `SELECT *
       FROM public.technician_rework_income_holds
      WHERE rework_case_id=$1 AND technician_username=$2
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [reworkCaseId, technicianUsername]
  );
  return q.rows[0] || null;
}

async function getHoldsForReworkCase(client, reworkCaseId, opts = {}) {
  const q = await client.query(
    `SELECT *
       FROM public.technician_rework_income_holds
      WHERE rework_case_id=$1
      ORDER BY hold_id
      ${opts.forUpdate ? 'FOR UPDATE' : ''}`,
    [reworkCaseId]
  );
  return q.rows || [];
}

async function loadOriginalIncomeCandidates(client, opts) {
  const jobId = Number(opts.jobId);
  const originalFinishedAt = opts.originalFinishedAt;
  const preferredTech = String(opts.technicianUsername || '').trim();
  const sourceTarget = payoutTargetForDate(originalFinishedAt);

  let rows = [];

  if (Array.isArray(opts.originalIncomeRows) && opts.originalIncomeRows.length) {
    rows = uniqueTechnicianRows(
      opts.originalIncomeRows.filter((row) => Number(row?.job_id ?? jobId) === jobId)
    );
  }

  if (!rows.length) {
    try {
      const q = await client.query(
        `SELECT technician_username, COALESCE(SUM(earn_amount),0)::numeric AS amount
           FROM public.technician_payout_lines
          WHERE job_id::text=$1::text
            AND payout_id=$2
          GROUP BY technician_username`,
        [String(jobId), sourceTarget.payout_id]
      );
      rows = uniqueTechnicianRows(q.rows);
    } catch (_) {
      rows = [];
    }
  }

  if (preferredTech
    && !rows.some((row) => row.technician_username === preferredTech)
    && Number.isFinite(Number(opts.originalEarnAmount))
    && money(opts.originalEarnAmount) > 0) {
    rows.push({ technician_username: preferredTech, amount: money(opts.originalEarnAmount) });
  }

  return { sourceTarget, rows: uniqueTechnicianRows(rows) };
}

async function insertAdjustment(client, params) {
  const q = await client.query(
    `INSERT INTO public.technician_payout_adjustments
      (payout_id, technician_username, job_id, adj_amount, reason, created_by)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by`,
    [
      params.payoutId,
      params.technicianUsername,
      params.jobKey,
      money(params.amount),
      String(params.reason || '').slice(0, 1500),
      params.actor || null,
    ]
  );
  return q.rows[0];
}

async function createOneHold(client, opts) {
  const existing = await getExistingHold(client, opts.reworkCaseId, opts.technicianUsername, true);
  if (existing) return { already_held: true, held: existing.hold_status === 'held', row: existing };

  const amount = money(opts.amount);
  if (amount <= 0) {
    const q = await client.query(
      `INSERT INTO public.technician_rework_income_holds
        (rework_case_id, technician_username, job_id, held_amount, source_payout_id,
         source_period_status_at_hold, hold_status, created_by)
       VALUES($1,$2,$3,0,$4,$5,'already_paid_no_action',$6)
       RETURNING *`,
      [
        opts.reworkCaseId,
        opts.technicianUsername,
        opts.jobId,
        opts.sourceTarget.payout_id,
        opts.sourcePeriodStatus || 'none',
        opts.actor,
      ]
    );
    return { already_held: false, held: false, row: q.rows[0] };
  }

  let holdAdjustment = null;
  let sourceStatus = opts.sourcePeriodStatus || 'draft';

  if (opts.sourcePeriodStatus === 'locked' || opts.sourcePeriodStatus === 'paid') {
    const carry = await resolveOpenTargetPeriodFromTarget(client, nextPayoutTarget(opts.sourceTarget), opts.actor);
    holdAdjustment = await insertAdjustment(client, {
      payoutId: carry.period.payout_id,
      technicianUsername: opts.technicianUsername,
      jobKey: adjustmentJobKey('hold', opts.reworkCaseId, opts.jobId),
      amount: -amount,
      reason: `${HOLD_REASON_TAG} หักพักรายได้ย้อนหลังจากงวดที่${opts.sourcePeriodStatus === 'locked' ? 'ปิดงวดแล้ว' : 'จ่ายแล้ว'} source_payout=${opts.sourceTarget.payout_id} rework_case_id=${opts.reworkCaseId} job_id=${opts.jobId}`,
      actor: opts.actor,
    });
    sourceStatus = `${opts.sourcePeriodStatus}_carried_forward:${carry.period.payout_id}`;
    await recalcPaymentStatus(client, holdAdjustment.payout_id, opts.technicianUsername);
  }

  const q = await client.query(
    `INSERT INTO public.technician_rework_income_holds
      (rework_case_id, technician_username, job_id, held_amount, source_payout_id,
       source_period_status_at_hold, hold_adjustment_id, hold_status, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,'held',$8)
     RETURNING *`,
    [
      opts.reworkCaseId,
      opts.technicianUsername,
      opts.jobId,
      amount,
      opts.sourceTarget.payout_id,
      sourceStatus,
      holdAdjustment?.adj_id || null,
      opts.actor,
    ]
  );

  return {
    already_held: false,
    held: true,
    hold_adjustment: holdAdjustment,
    row: q.rows[0],
  };
}

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

  const existingRows = await getHoldsForReworkCase(client, reworkCaseId, { forUpdate: true });
  if (!originalFinishedAt || Number.isNaN(originalFinishedAt.getTime())) {
    if (existingRows.length) {
      return { already_held: true, held: false, rows: existingRows, row: existingRows[0] };
    }
    const q = await client.query(
      `INSERT INTO public.technician_rework_income_holds
        (rework_case_id, technician_username, job_id, held_amount, source_payout_id,
         source_period_status_at_hold, hold_status, created_by)
       VALUES($1,$2,$3,0,NULL,'no_prior_finish','already_paid_no_action',$4)
       RETURNING *`,
      [reworkCaseId, technicianUsername, jobId, actor]
    );
    return { already_held: false, held: false, rows: q.rows, row: q.rows[0] };
  }

  const { sourceTarget, rows } = await loadOriginalIncomeCandidates(client, {
    ...opts,
    originalFinishedAt,
    technicianUsername,
  });

  if (!rows.length) {
    const err = new Error('NO_AUTHORITATIVE_ORIGINAL_INCOME');
    err.status = 409;
    throw err;
  }

  const sourcePeriodStatus = await findExistingPeriodStatus(client, sourceTarget);

  const results = [];
  for (const candidate of rows) {
    results.push(await createOneHold(client, {
      reworkCaseId,
      jobId,
      technicianUsername: candidate.technician_username,
      amount: candidate.amount,
      sourceTarget,
      sourcePeriodStatus,
      actor,
    }));
  }

  const persisted = await getHoldsForReworkCase(client, reworkCaseId, { forUpdate: false });
  const preferred = persisted.find((row) => row.technician_username === technicianUsername) || persisted[0] || null;
  return {
    already_held: results.length > 0 && results.every((row) => row.already_held),
    held: persisted.some((row) => row.hold_status === 'held' && money(row.held_amount) > 0),
    rows: persisted,
    row: preferred,
    results,
  };
}

async function loadAuthoritativeFinishedAt(client, holds) {
  const jobIds = [...new Set((holds || []).map((row) => Number(row.job_id)).filter((id) => id > 0))];
  if (!jobIds.length) return null;
  const q = await client.query(
    `SELECT job_id, finished_at
       FROM public.jobs
      WHERE job_id = ANY($1::bigint[])
      FOR UPDATE`,
    [jobIds]
  );
  const valid = (q.rows || []).map((row) => row.finished_at).filter(Boolean);
  if (!valid.length) return null;
  const first = new Date(valid[0]);
  return Number.isNaN(first.getTime()) ? null : first;
}

async function releaseHeldIncomeForReworkCase(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId || 0);
  const requestedTech = String(opts.technicianUsername || '').trim();
  const actor = String(opts.actor || '').trim() || null;

  if (!reworkCaseId || !requestedTech) {
    const err = new Error('INVALID_REWORK_RELEASE_INPUT');
    err.status = 400;
    throw err;
  }

  const holds = await getHoldsForReworkCase(client, reworkCaseId, { forUpdate: true });
  if (!holds.length) return { released: false, reason: 'NO_HOLD', rows: [] };

  const releasable = holds.filter((row) => row.hold_status === 'held' && money(row.held_amount) > 0);
  if (!releasable.length) {
    const requested = holds.find((row) => row.technician_username === requestedTech) || holds[0];
    return { released: false, reason: requested?.hold_status || 'NO_RELEASABLE_HOLD', rows: holds, row: requested || null };
  }

  const finishedAt = await loadAuthoritativeFinishedAt(client, releasable);
  if (!finishedAt) {
    const err = new Error('REWORK_FINISHED_AT_REQUIRED');
    err.status = 409;
    throw err;
  }

  const { target, period, rolled_forward_count } = await resolveOpenTargetPeriod(client, finishedAt, actor);
  const releasedRows = [];
  let total = 0;

  for (const hold of releasable) {
    const amount = money(hold.held_amount);
    const key = releaseIdempotencyKey(reworkCaseId, hold.technician_username);
    const adjustment = await insertAdjustment(client, {
      payoutId: period.payout_id,
      technicianUsername: hold.technician_username,
      jobKey: adjustmentJobKey('release', reworkCaseId, hold.job_id),
      amount,
      reason: `${RELEASE_REASON_TAG} คืนรายได้เดิมหลังแก้งานสำเร็จ rework_case_id=${reworkCaseId} job_id=${hold.job_id}`,
      actor,
    });

    const updated = await client.query(
      `UPDATE public.technician_rework_income_holds
          SET hold_status='released',
              released_amount=$2,
              release_payout_id=$3,
              release_adjustment_id=$4,
              release_idempotency_key=$5,
              released_at=NOW(),
              updated_at=NOW()
        WHERE hold_id=$1 AND hold_status='held'
        RETURNING *`,
      [hold.hold_id, amount, period.payout_id, adjustment.adj_id, key]
    );

    if (!updated.rows[0]) {
      const err = new Error('REWORK_RELEASE_CONCURRENT_STATE_CHANGE');
      err.status = 409;
      throw err;
    }

    await recalcPaymentStatus(client, period.payout_id, hold.technician_username);
    total = money(total + amount);
    releasedRows.push({ row: updated.rows[0], adjustment });
  }

  const requested = releasedRows.find((item) => item.row.technician_username === requestedTech) || releasedRows[0];
  return {
    released: releasedRows.length > 0,
    amount: total,
    payout_id: period.payout_id,
    period: target,
    rolled_forward_count,
    rows: releasedRows.map((item) => item.row),
    adjustments: releasedRows.map((item) => item.adjustment),
    row: requested?.row || null,
    adjustment: requested?.adjustment || null,
  };
}

async function voidHeldIncomeForReworkCase(client, opts = {}) {
  const reworkCaseId = Number(opts.reworkCaseId || 0);
  const requestedTech = String(opts.technicianUsername || '').trim();
  if (!reworkCaseId || !requestedTech) {
    const err = new Error('INVALID_REWORK_VOID_INPUT');
    err.status = 400;
    throw err;
  }

  const holds = await getHoldsForReworkCase(client, reworkCaseId, { forUpdate: true });
  if (!holds.length) return { voided: false, rows: [] };
  const q = await client.query(
    `UPDATE public.technician_rework_income_holds
        SET hold_status='voided', updated_at=NOW()
      WHERE rework_case_id=$1 AND hold_status='held'
      RETURNING *`,
    [reworkCaseId]
  );
  const requested = (q.rows || []).find((row) => row.technician_username === requestedTech) || q.rows?.[0] || null;
  return { voided: (q.rows || []).length > 0, rows: q.rows || [], row: requested };
}

async function getHoldForReworkCase(client, reworkCaseId, technicianUsername) {
  return getExistingHold(client, Number(reworkCaseId), String(technicianUsername || '').trim(), false);
}

async function findActiveReworkCase(client, jobId) {
  const q = await client.query(
    `SELECT * FROM public.technician_rework_cases
      WHERE job_id=$1 AND status IN ('open','in_progress')
      ORDER BY created_at DESC, rework_case_id DESC
      LIMIT 1`,
    [Number(jobId)]
  );
  return q.rows[0] || null;
}

module.exports = {
  HOLD_REASON_TAG,
  RELEASE_REASON_TAG,
  holdOriginalIncomeForReworkCase,
  releaseHeldIncomeForReworkCase,
  voidHeldIncomeForReworkCase,
  getHoldForReworkCase,
  getHoldsForReworkCase,
  findActiveReworkCase,
  releaseIdempotencyKey,
  adjustmentJobKey,
  money,
};
