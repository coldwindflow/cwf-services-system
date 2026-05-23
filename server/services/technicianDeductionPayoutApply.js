'use strict';

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

function bangkokParts(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

function bangkokMidnightUTC(y, m, d) {
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0) - (7 * 60 * 60 * 1000));
}

function addMonth(y, m, delta) {
  let yy = Number(y);
  let mm = Number(m) + Number(delta || 0);
  while (mm > 12) { mm -= 12; yy += 1; }
  while (mm < 1) { mm += 12; yy -= 1; }
  return { y: yy, m: mm };
}

function periodBoundsForYm(type, y, m) {
  const t = String(type || '').trim();
  const yy = Number(y);
  const mm = Number(m);
  if (t === '10') {
    const prev = addMonth(yy, mm, -1);
    return {
      payout_id: `payout_${yy}-${String(mm).padStart(2, '0')}_10`,
      period_type: '10',
      period_start: bangkokMidnightUTC(prev.y, prev.m, 16),
      period_end: bangkokMidnightUTC(yy, mm, 1),
    };
  }
  if (t === '25') {
    return {
      payout_id: `payout_${yy}-${String(mm).padStart(2, '0')}_25`,
      period_type: '25',
      period_start: bangkokMidnightUTC(yy, mm, 1),
      period_end: bangkokMidnightUTC(yy, mm, 16),
    };
  }
  const err = new Error('INVALID_PERIOD_TYPE');
  err.status = 400;
  throw err;
}

function payoutTargetForDate(dateInput) {
  const p = bangkokParts(dateInput || new Date());
  if (p.d <= 15) return periodBoundsForYm('25', p.y, p.m);
  const next = addMonth(p.y, p.m, 1);
  return periodBoundsForYm('10', next.y, next.m);
}

function nextPayoutTarget(target) {
  const t = String(target?.period_type || '').trim();
  const m = /^payout_(\d{4})-(\d{2})_(10|25)$/.exec(String(target?.payout_id || ''));
  if (!m) return payoutTargetForDate(new Date());
  const y = Number(m[1]);
  const mon = Number(m[2]);
  if (t === '10') return periodBoundsForYm('25', y, mon);
  const next = addMonth(y, mon, 1);
  return periodBoundsForYm('10', next.y, next.m);
}

async function ensurePeriod(client, target, actor) {
  await client.query(
    `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
     VALUES($1,$2,$3,$4,'draft',$5)
     ON CONFLICT (payout_id) DO NOTHING`,
    [target.payout_id, target.period_type, target.period_start.toISOString(), target.period_end.toISOString(), actor || 'deduction:auto_apply']
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

async function resolveTargetPeriod(client, row, actor) {
  let target = null;
  if (row?.job_id) {
    const jr = await client.query(
      `SELECT job_id, finished_at, appointment_datetime, job_status
         FROM public.jobs
        WHERE job_id=$1
        LIMIT 1`,
      [row.job_id]
    );
    const job = jr.rows[0] || null;
    if (job?.finished_at) target = payoutTargetForDate(job.finished_at);
  }
  if (!target) target = payoutTargetForDate(new Date());

  for (let i = 0; i < 14; i += 1) {
    const period = await ensurePeriod(client, target, actor);
    if (period && String(period.status || 'draft') !== 'paid') {
      return { target, period, rolled_forward_count: i };
    }
    target = nextPayoutTarget(target);
  }

  const err = new Error('NO_OPEN_PAYOUT_PERIOD_FOR_DEDUCTION');
  err.status = 409;
  throw err;
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

function createTechnicianDeductionPayoutApplyService() {
  async function applyDeductionCaseToPayout(client, row, opts = {}) {
    const caseRow = row || {};
    const caseId = Number(caseRow.case_id || 0);
    const tech = String(caseRow.technician_username || '').trim();
    const amount = money(caseRow.amount || 0);
    const actor = String(opts.actor || '').trim() || null;
    if (!caseId || !tech) {
      const err = new Error('INVALID_DEDUCTION_CASE');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error('INVALID_DEDUCTION_AMOUNT');
      err.status = 400;
      throw err;
    }

    if (caseRow.applied_adjustment_id) {
      const existing = await client.query(
        `SELECT adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by
           FROM public.technician_payout_adjustments
          WHERE adj_id=$1
          LIMIT 1`,
        [caseRow.applied_adjustment_id]
      );
      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE public.technician_deduction_cases
              SET status='applied',
                  applied_by=COALESCE(applied_by,$2),
                  applied_at=COALESCE(applied_at,NOW()),
                  applied_payout_id=COALESCE(applied_payout_id,$3),
                  updated_at=NOW()
            WHERE case_id=$1
            RETURNING *`,
          [caseId, actor, existing.rows[0].payout_id]
        );
        return { already_applied: true, adjustment: existing.rows[0], payout_id: existing.rows[0].payout_id, row: updated.rows[0] || caseRow };
      }
    }

    const target = await resolveTargetPeriod(client, caseRow, actor);
    const payoutId = target.period.payout_id;
    const reason = [
      `หักเงินช่างจากเคส ${caseRow.case_code || caseId}`,
      caseRow.deduction_type ? `ประเภท ${caseRow.deduction_type}` : '',
      caseRow.reason || '',
    ].filter(Boolean).join(' | ').slice(0, 1500);

    const inserted = await client.query(
      `INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING adj_id, payout_id, technician_username, job_id, adj_amount, reason, created_at, created_by`,
      [payoutId, tech, caseRow.job_id == null ? null : String(caseRow.job_id), -amount, reason, actor]
    );
    const adjustment = inserted.rows[0];

    const updated = await client.query(
      `UPDATE public.technician_deduction_cases
          SET status='applied',
              applied_by=$2,
              applied_at=NOW(),
              applied_payout_id=$3,
              applied_adjustment_id=$4,
              updated_at=NOW()
        WHERE case_id=$1
        RETURNING *`,
      [caseId, actor, payoutId, adjustment.adj_id]
    );

    const payment = await recalcPaymentStatus(client, payoutId, tech);
    return {
      already_applied: false,
      payout_id: payoutId,
      period: target.period,
      rolled_forward_count: target.rolled_forward_count,
      adjustment,
      payment,
      row: updated.rows[0],
    };
  }

  return { applyDeductionCaseToPayout, payoutTargetForDate, nextPayoutTarget };
}

module.exports = { createTechnicianDeductionPayoutApplyService };
