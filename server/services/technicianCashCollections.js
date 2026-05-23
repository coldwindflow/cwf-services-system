'use strict';

function createTechnicianCashCollectionService(deps = {}) {
  const pool = deps.pool;
  const periodBoundsForYm = deps.periodBoundsForYm;
  const money = typeof deps.money === 'function'
    ? deps.money
    : (n) => {
        const x = Number(n || 0);
        return Number.isFinite(x) ? Number(x.toFixed(2)) : 0;
      };

  if (!pool || typeof pool.query !== 'function') {
    throw new Error('technicianCashCollections requires pool');
  }
  if (typeof periodBoundsForYm !== 'function') {
    throw new Error('technicianCashCollections requires periodBoundsForYm');
  }

  function isTechnicianCashMethod(v) {
    const s = String(v || '').trim().toLowerCase();
    return s === 'cash_to_technician'
      || s === 'cash-held-by-technician'
      || s === 'cash_held_by_technician'
      || s === 'technician_cash'
      || s === 'เงินสดช่าง'
      || s === 'ช่างรับเงินสด';
  }

  function addMonths(y, m, delta) {
    let yy = Number(y);
    let mm = Number(m) + Number(delta || 0);
    while (mm > 12) { mm -= 12; yy += 1; }
    while (mm <= 0) { mm += 12; yy -= 1; }
    return { y: yy, m: mm };
  }

  function payoutPeriodForCollectedAt(value) {
    const dt = value ? new Date(value) : new Date();
    const safe = Number.isFinite(dt.getTime()) ? dt : new Date();
    // Convert UTC instant to Bangkok calendar date. Thailand has no DST.
    const bkk = new Date(safe.getTime() + (7 * 60 * 60 * 1000));
    const y = bkk.getUTCFullYear();
    const m = bkk.getUTCMonth() + 1;
    const d = bkk.getUTCDate();
    if (d <= 15) {
      const bounds = periodBoundsForYm('25', y, m);
      return { ...bounds, payout_id: `payout_${bounds.label_ym}_${bounds.period_type}` };
    }
    const next = addMonths(y, m, 1);
    const bounds = periodBoundsForYm('10', next.y, next.m);
    return { ...bounds, payout_id: `payout_${bounds.label_ym}_${bounds.period_type}` };
  }

  async function ensureSchema(clientOrPool = pool) {
    const db = clientOrPool || pool;
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.technician_cash_collections (
        collection_id BIGSERIAL PRIMARY KEY,
        job_id BIGINT NOT NULL UNIQUE REFERENCES public.jobs(job_id) ON DELETE CASCADE,
        technician_username TEXT NOT NULL,
        payout_id TEXT REFERENCES public.technician_payout_periods(payout_id) ON DELETE SET NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','offset','voided')),
        payment_method TEXT NOT NULL DEFAULT 'cash_to_technician',
        collected_at TIMESTAMPTZ DEFAULT NOW(),
        offset_adj_id BIGINT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT,
        meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tech_cash_collections_tech_created ON public.technician_cash_collections(technician_username, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tech_cash_collections_payout ON public.technician_cash_collections(payout_id)`);
    await db.query(`ALTER TABLE public.technician_cash_collections ADD COLUMN IF NOT EXISTS offset_adj_id BIGINT`);
    await db.query(`ALTER TABLE public.technician_cash_collections ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  }

  async function ensurePayoutPeriod(db, period, actorUsername) {
    await db.query(
      `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
       VALUES($1,$2,$3,$4,'draft',$5)
       ON CONFLICT (payout_id) DO NOTHING`,
      [period.payout_id, period.period_type, period.start.toISOString(), period.endEx.toISOString(), actorUsername || 'system:tech_cash']
    );
    const q = await db.query(
      `SELECT payout_id, period_type, period_start, period_end, status
         FROM public.technician_payout_periods
        WHERE payout_id=$1
        LIMIT 1`,
      [period.payout_id]
    );
    return q.rows[0] || null;
  }

  async function ensureOffsetForJob(input = {}) {
    const db = input.client || input.clientOrPool || pool;
    const jobId = Number(input.job_id || input.jobId || 0);
    const actor = String(input.actor_username || input.actorUsername || '').trim() || null;
    const source = String(input.source || 'unknown').trim() || 'unknown';
    if (!Number.isFinite(jobId) || jobId <= 0) {
      const err = new Error('INVALID_JOB_ID');
      err.code = 'INVALID_JOB_ID';
      throw err;
    }

    const jobQ = await db.query(
      `SELECT job_id, booking_code, technician_username, close_cash_confirmed_by, close_signature_by,
              finished_at, close_payment_method, close_payment_status, close_cash_amount,
              close_cash_confirmed, payment_status, payment_method, payment_reference
         FROM public.jobs
        WHERE job_id=$1
        LIMIT 1`,
      [jobId]
    );
    const job = jobQ.rows[0];
    if (!job) {
      const err = new Error('JOB_NOT_FOUND');
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }

    const method = String(job.close_payment_method || job.payment_method || '').trim();
    const amount = money(job.close_cash_amount || 0);
    if (!isTechnicianCashMethod(method)) {
      return { ok: true, skipped: true, reason: 'NOT_TECHNICIAN_CASH', job_id: jobId };
    }
    if (job.close_cash_confirmed !== true) {
      return { ok: true, skipped: true, reason: 'CASH_NOT_CONFIRMED', job_id: jobId };
    }
    if (amount <= 0) {
      return { ok: true, skipped: true, reason: 'NO_CASH_AMOUNT', job_id: jobId };
    }

    const tech = String(job.close_cash_confirmed_by || job.close_signature_by || job.technician_username || '').trim();
    if (!tech) {
      const err = new Error('MISSING_TECHNICIAN_USERNAME');
      err.code = 'MISSING_TECHNICIAN_USERNAME';
      throw err;
    }

    const periodDef = payoutPeriodForCollectedAt(job.finished_at || new Date());
    const period = await ensurePayoutPeriod(db, periodDef, actor);
    if (!period) {
      const err = new Error('PAYOUT_PERIOD_CREATE_FAILED');
      err.code = 'PAYOUT_PERIOD_CREATE_FAILED';
      throw err;
    }

    const periodStatus = String(period.status || 'draft');
    const upsertCollectionSql = `
      INSERT INTO public.technician_cash_collections(
        job_id, technician_username, payout_id, amount, status, payment_method,
        collected_at, note, created_by, meta_json, updated_at
      ) VALUES($1,$2,$3,$4,'held','cash_to_technician',COALESCE($5::timestamptz,NOW()),$6,$7,$8::jsonb,NOW())
      ON CONFLICT (job_id) DO UPDATE SET
        technician_username=EXCLUDED.technician_username,
        payout_id=EXCLUDED.payout_id,
        amount=EXCLUDED.amount,
        payment_method='cash_to_technician',
        collected_at=EXCLUDED.collected_at,
        note=EXCLUDED.note,
        updated_at=NOW(),
        meta_json=public.technician_cash_collections.meta_json || EXCLUDED.meta_json
      RETURNING *`;
    const note = `ลูกค้าจ่ายเงินสดให้ช่างและให้ช่างถือไว้ เพื่อหักจากงวดจ่าย • งาน #${jobId}`;
    const collectionQ = await db.query(upsertCollectionSql, [
      jobId,
      tech,
      period.payout_id,
      amount,
      job.finished_at || null,
      note,
      actor,
      JSON.stringify({ source, booking_code: job.booking_code || null, close_payment_status: job.close_payment_status || null })
    ]);
    const collection = collectionQ.rows[0] || null;

    if (periodStatus === 'paid') {
      return {
        ok: true,
        skipped: true,
        reason: 'PAYOUT_ALREADY_PAID_NEEDS_MANUAL_REVIEW',
        job_id: jobId,
        collection,
        payout_id: period.payout_id,
        amount,
        technician_username: tech,
      };
    }

    const reasonPrefix = `AUTO_CASH_HELD_JOB_${jobId}:`;
    const reason = `${reasonPrefix} ลูกค้าจ่ายเงินสด ${amount.toLocaleString('th-TH')} บาทให้ช่างถือไว้ จึงหักออกจากยอดจ่ายช่างในงวดนี้`;
    const existingAdjQ = await db.query(
      `SELECT adj_id
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1 AND technician_username=$2 AND job_id=$3 AND reason LIKE $4
        ORDER BY adj_id ASC
        LIMIT 1`,
      [period.payout_id, tech, String(jobId), `${reasonPrefix}%`]
    );

    let adjId = existingAdjQ.rows[0]?.adj_id || null;
    if (adjId) {
      await db.query(
        `UPDATE public.technician_payout_adjustments
            SET adj_amount=$4, reason=$5
          WHERE adj_id=$1 AND payout_id=$2 AND technician_username=$3`,
        [adjId, period.payout_id, tech, -amount, reason]
      );
    } else {
      const adjQ = await db.query(
        `INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING adj_id`,
        [period.payout_id, tech, String(jobId), -amount, reason, actor]
      );
      adjId = adjQ.rows[0]?.adj_id || null;
    }

    const finalQ = await db.query(
      `UPDATE public.technician_cash_collections
          SET status='offset', offset_adj_id=$2, updated_at=NOW(),
              meta_json=meta_json || $3::jsonb
        WHERE job_id=$1
        RETURNING *`,
      [jobId, adjId, JSON.stringify({ offset_source: source, offset_at: new Date().toISOString(), adjustment_reason_prefix: reasonPrefix })]
    );

    return {
      ok: true,
      skipped: false,
      job_id: jobId,
      technician_username: tech,
      payout_id: period.payout_id,
      amount,
      adjustment_amount: -amount,
      adj_id: adjId,
      collection: finalQ.rows[0] || collection,
      period_status: periodStatus,
    };
  }

  return {
    ensureSchema,
    ensureOffsetForJob,
    isTechnicianCashMethod,
    payoutPeriodForCollectedAt,
  };
}

module.exports = { createTechnicianCashCollectionService };
