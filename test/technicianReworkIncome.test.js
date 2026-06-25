const test = require('node:test');
const assert = require('node:assert/strict');

const {
  holdOriginalIncomeForReworkCase,
  releaseHeldIncomeForReworkCase,
  voidHeldIncomeForReworkCase,
  getHoldsForReworkCase,
  findActiveReworkCase,
} = require('../server/services/technicianReworkIncome');

class FakeClient {
  constructor() {
    this.periods = new Map();
    this.holds = [];
    this.adjustments = [];
    this.payoutLines = [];
    this.previews = [];
    this.jobs = new Map();
    this.reworkCases = [];
    this.nextHoldId = 1;
    this.nextAdjId = 1;
    this.nextCaseId = 1;
    this.failNextAdjustmentInserts = 0;
  }

  cloneRow(row) {
    return row ? { ...row } : row;
  }

  async query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, ' ').trim();

    if (s.startsWith('INSERT INTO public.technician_payout_periods')) {
      const [payout_id, period_type, period_start, period_end, created_by] = params;
      if (!this.periods.has(payout_id)) {
        this.periods.set(payout_id, { payout_id, period_type, period_start, period_end, status: 'draft', created_by });
      }
      return { rows: [] };
    }

    if (s.includes('SELECT payout_id, period_type, period_start, period_end, status') && s.includes('FROM public.technician_payout_periods')) {
      const row = this.periods.get(params[0]);
      return { rows: row ? [this.cloneRow(row)] : [] };
    }

    if (s.startsWith('SELECT status FROM public.technician_payout_periods')) {
      const row = this.periods.get(params[0]);
      return { rows: row ? [{ status: row.status }] : [] };
    }

    if (s.startsWith('WITH gross AS')) {
      const [payoutId, tech] = params;
      const gross = this.payoutLines.filter((r) => r.payout_id === payoutId && r.technician_username === tech)
        .reduce((sum, r) => sum + Number(r.earn_amount || 0), 0);
      const adj = this.adjustments.filter((r) => r.payout_id === payoutId && r.technician_username === tech)
        .reduce((sum, r) => sum + Number(r.adj_amount || 0), 0);
      return { rows: [{ net_amount: gross + adj, paid_amount: 0, payment_id: null }] };
    }

    if (s.startsWith('UPDATE public.technician_payout_payments')) return { rows: [] };

    if (s.includes('FROM public.technician_rework_income_holds') && s.includes('rework_case_id=$1 AND technician_username=$2')) {
      const row = this.holds.find((r) => Number(r.rework_case_id) === Number(params[0]) && r.technician_username === params[1]);
      return { rows: row ? [this.cloneRow(row)] : [] };
    }

    if (s.includes('FROM public.technician_rework_income_holds') && s.includes('WHERE rework_case_id=$1') && !s.includes('technician_username=$2')) {
      const rows = this.holds.filter((r) => Number(r.rework_case_id) === Number(params[0])).map((r) => this.cloneRow(r));
      return { rows };
    }

    if (s.includes('FROM public.technician_rework_income_holds') && s.includes("hold_status='released'") && s.includes('rework_case_id<>$2')) {
      const [jobId, excludeCaseId] = params;
      const rows = this.holds
        .filter((r) => Number(r.job_id) === Number(jobId) && r.hold_status === 'released' && Number(r.rework_case_id) !== Number(excludeCaseId))
        .sort((a, b) => (b.rework_case_id - a.rework_case_id) || (b.hold_id - a.hold_id))
        .map((r) => this.cloneRow(r));
      return { rows };
    }

    if (s.includes('FROM public.technician_payout_lines') && s.includes('GROUP BY technician_username')) {
      const [jobId, payoutId] = params;
      const totals = new Map();
      for (const row of this.payoutLines.filter((r) => String(r.job_id) === String(jobId) && r.payout_id === payoutId)) {
        totals.set(row.technician_username, (totals.get(row.technician_username) || 0) + Number(row.earn_amount || 0));
      }
      return { rows: [...totals].map(([technician_username, amount]) => ({ technician_username, amount })) };
    }

    if (s.includes('FROM public.job_technician_income_preview')) {
      const rows = this.previews.filter((r) => Number(r.job_id) === Number(params[0]) && !r.is_stale && Number(r.income_amount) > 0);
      return { rows: rows.map((r) => ({ technician_username: r.technician_username, amount: r.income_amount })) };
    }

    if (s.startsWith('INSERT INTO public.technician_payout_adjustments')) {
      if (this.failNextAdjustmentInserts > 0) {
        this.failNextAdjustmentInserts -= 1;
        throw new Error('SIMULATED_ADJUSTMENT_INSERT_FAILURE');
      }
      const [payout_id, technician_username, job_id, adj_amount, reason, created_by] = params;
      const row = {
        adj_id: this.nextAdjId++, payout_id, technician_username, job_id,
        adj_amount: Number(adj_amount), reason, created_by, created_at: new Date().toISOString(),
      };
      this.adjustments.push(row);
      return { rows: [this.cloneRow(row)] };
    }

    if (s.startsWith('INSERT INTO public.technician_rework_income_holds')) {
      let row;
      if (params.length === 9) {
        const [rework_case_id, technician_username, job_id, source_payout_id, source_period_status_at_hold, source_kind, previous_rework_case_id, previous_release_adjustment_id, created_by] = params;
        row = { rework_case_id, technician_username, job_id, held_amount: 0, source_payout_id, source_period_status_at_hold, hold_status: 'already_paid_no_action', source_kind, previous_rework_case_id, previous_release_adjustment_id, created_by };
      } else if (params.length === 11) {
        const [rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_adjustment_id, source_kind, previous_rework_case_id, previous_release_adjustment_id, created_by] = params;
        row = { rework_case_id, technician_username, job_id, held_amount: Number(held_amount), source_payout_id, source_period_status_at_hold, hold_adjustment_id, hold_status: 'held', source_kind, previous_rework_case_id, previous_release_adjustment_id, created_by };
      } else if (params.length === 6) {
        const [rework_case_id, technician_username, job_id, source_payout_id, source_period_status_at_hold, created_by] = params;
        row = { rework_case_id, technician_username, job_id, held_amount: 0, source_payout_id, source_period_status_at_hold, hold_status: 'already_paid_no_action', created_by };
      } else if (params.length === 4) {
        const [rework_case_id, technician_username, job_id, created_by] = params;
        row = { rework_case_id, technician_username, job_id, held_amount: 0, source_payout_id: null, source_period_status_at_hold: 'no_prior_finish', hold_status: 'already_paid_no_action', created_by };
      } else {
        const [rework_case_id, technician_username, job_id, held_amount, source_payout_id, source_period_status_at_hold, hold_adjustment_id, created_by] = params;
        row = { rework_case_id, technician_username, job_id, held_amount: Number(held_amount), source_payout_id, source_period_status_at_hold, hold_adjustment_id, hold_status: 'held', created_by };
      }
      row.hold_id = this.nextHoldId++;
      row.released_amount = null;
      row.release_payout_id = null;
      row.release_adjustment_id = null;
      row.release_idempotency_key = null;
      this.holds.push(row);
      return { rows: [this.cloneRow(row)] };
    }

    if (s.includes('FROM public.jobs') && s.includes('job_id = ANY')) {
      const ids = params[0].map(Number);
      return { rows: ids.filter((id) => this.jobs.has(id)).map((id) => ({ job_id: id, finished_at: this.jobs.get(id).finished_at })) };
    }

    if (s.startsWith('UPDATE public.technician_rework_income_holds') && s.includes("SET hold_status='released'")) {
      const [holdId, amount, payoutId, adjId, key] = params;
      const row = this.holds.find((r) => Number(r.hold_id) === Number(holdId) && r.hold_status === 'held');
      if (!row) return { rows: [] };
      Object.assign(row, {
        hold_status: 'released', released_amount: Number(amount), release_payout_id: payoutId,
        release_adjustment_id: adjId, release_idempotency_key: key, released_at: new Date().toISOString(),
      });
      return { rows: [this.cloneRow(row)] };
    }

    if (s.startsWith('UPDATE public.technician_rework_income_holds') && s.includes("SET hold_status='voided'")) {
      const caseId = Number(params[0]);
      const rows = [];
      for (const row of this.holds) {
        if (Number(row.rework_case_id) === caseId && row.hold_status === 'held') {
          row.hold_status = 'voided';
          rows.push(this.cloneRow(row));
        }
      }
      return { rows };
    }

    if (s.includes('FROM public.technician_rework_cases') && s.includes("status IN ('open','in_progress')")) {
      const jobId = Number(params[0]);
      const rows = this.reworkCases
        .filter((r) => Number(r.job_id) === jobId && (r.status === 'open' || r.status === 'in_progress'))
        .sort((a, b) => b.rework_case_id - a.rework_case_id);
      return { rows: rows.length ? [this.cloneRow(rows[0])] : [] };
    }

    throw new Error(`Unhandled SQL in FakeClient: ${s}`);
  }

  openCase(jobId, status = 'open') {
    const row = { rework_case_id: this.nextCaseId++, job_id: jobId, status, created_at: new Date().toISOString() };
    this.reworkCases.push(row);
    return row;
  }
}

async function hold(client, opts = {}) {
  return holdOriginalIncomeForReworkCase(client, {
    reworkCaseId: opts.caseId || 1,
    jobId: opts.jobId || 10,
    technicianUsername: opts.tech || 'A2MKUNG',
    originalFinishedAt: opts.originalFinishedAt || '2026-06-10T10:00:00+07:00',
    originalEarnAmount: opts.amount ?? 325,
    actor: 'test',
  });
}

async function release(client, opts = {}) {
  return releaseHeldIncomeForReworkCase(client, {
    reworkCaseId: opts.caseId || 1,
    technicianUsername: opts.tech || 'A2MKUNG',
    actor: 'test',
  });
}

// Net = every adjustment (hold negatives + release positives) ever posted for
// this technician, across every period. After a chain of N rework rounds on
// the same job ends in a successful close, this must equal the technician's
// original one-time income for the job — never a multiple of it.
function netForTechnician(db, tech) {
  return db.adjustments
    .filter((r) => r.technician_username === tech)
    .reduce((sum, r) => sum + Number(r.adj_amount || 0), 0);
}

test('paid source is carried forward, then returned after successful rework', async () => {
  const db = new FakeClient();
  db.periods.set('payout_2026-06_25', { payout_id: 'payout_2026-06_25', status: 'paid', period_type: '25' });
  await hold(db);
  assert.equal(db.adjustments.length, 1);
  assert.equal(db.adjustments[0].adj_amount, -325);
  assert.match(db.adjustments[0].reason, /\[REWORK_HOLD\]/);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const result = await release(db);
  assert.equal(result.released, true);
  assert.equal(result.amount, 325);
  assert.equal(result.payout_id, 'payout_2026-07_10');
  assert.equal(db.adjustments.filter((r) => r.adj_amount > 0).length, 1);
});

test('release uses DB finished_at and rejects a missing completion timestamp', async () => {
  const db = new FakeClient();
  await hold(db);
  await assert.rejects(() => release(db), (error) => error.status === 409 && error.message === 'REWORK_FINISHED_AT_REQUIRED');
});

test('Bangkok day 15 and day 16 target the correct payout periods', async () => {
  const day15 = new FakeClient();
  await hold(day15);
  day15.jobs.set(10, { finished_at: '2026-06-15T23:59:59+07:00' });
  assert.equal((await release(day15)).payout_id, 'payout_2026-06_25');

  const day16 = new FakeClient();
  await hold(day16);
  day16.jobs.set(10, { finished_at: '2026-06-16T00:00:00+07:00' });
  assert.equal((await release(day16)).payout_id, 'payout_2026-07_10');
});

test('team payout lines create and release one hold per original technician', async () => {
  const db = new FakeClient();
  db.periods.set('payout_2026-06_25', { payout_id: 'payout_2026-06_25', status: 'draft', period_type: '25' });
  db.payoutLines.push(
    { payout_id: 'payout_2026-06_25', technician_username: 'TECH_A', job_id: '10', earn_amount: 200 },
    { payout_id: 'payout_2026-06_25', technician_username: 'TECH_B', job_id: '10', earn_amount: 125 },
  );
  const held = await hold(db, { tech: 'TECH_A', amount: 999 });
  assert.equal(held.rows.length, 2);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const result = await release(db, { tech: 'TECH_A' });
  assert.equal(result.amount, 325);
  assert.equal(result.rows.length, 2);
});

test('release adjustment uses a synthetic job key so gross lookup cannot double count it', async () => {
  const db = new FakeClient();
  await hold(db);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db);
  const positive = db.adjustments.find((r) => r.adj_amount > 0);
  assert.ok(positive);
  assert.match(positive.job_id, /^rework_release:/);
  assert.notEqual(positive.job_id, '10');
  assert.match(positive.reason, /\[REWORK_RELEASE\]/);
});

test('repeated release is idempotent', async () => {
  const db = new FakeClient();
  await hold(db);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  assert.equal((await release(db)).released, true);
  assert.equal((await release(db)).released, false);
  assert.equal(db.adjustments.filter((r) => r.adj_amount > 0).length, 1);
});

test('failed rework voids held income and does not release it', async () => {
  const db = new FakeClient();
  await hold(db);
  const result = await voidHeldIncomeForReworkCase(db, { reworkCaseId: 1, technicianUsername: 'A2MKUNG' });
  assert.equal(result.voided, true);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  assert.equal((await release(db)).released, false);
  assert.equal(db.adjustments.filter((r) => r.adj_amount > 0).length, 0);
});

test('duplicate hold call preserves the first immutable amount', async () => {
  const db = new FakeClient();
  await hold(db, { amount: 325 });
  await hold(db, { amount: 999 });
  const rows = await getHoldsForReworkCase(db, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].held_amount, 325);
});

test('locked source period rolls the hold forward into the next draft period', async () => {
  const db = new FakeClient();
  db.periods.set('payout_2026-06_25', { payout_id: 'payout_2026-06_25', status: 'locked', period_type: '25' });
  await hold(db);
  assert.equal(db.adjustments.length, 1);
  assert.equal(db.adjustments[0].adj_amount, -325);
  assert.equal(db.adjustments[0].payout_id, 'payout_2026-07_10');
  const rows = await getHoldsForReworkCase(db, 1);
  assert.match(rows[0].source_period_status_at_hold, /^locked_carried_forward:/);
});

test('release never lands in a locked or paid period, it rolls forward to the next draft', async () => {
  const db = new FakeClient();
  await hold(db);
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  db.periods.set('payout_2026-07_10', { payout_id: 'payout_2026-07_10', status: 'locked', period_type: '10' });
  const result = await release(db);
  assert.equal(result.released, true);
  assert.equal(result.payout_id, 'payout_2026-07_25');
});

test('team job with no persisted payout_lines but with build rows holds every team member', async () => {
  const db = new FakeClient();
  const originalIncomeRows = [
    { technician_username: 'TECH_A', amount: 200, job_id: 10 },
    { technician_username: 'TECH_B', amount: 125, job_id: 10 },
  ];
  const held = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 1,
    jobId: 10,
    technicianUsername: 'TECH_A',
    originalFinishedAt: '2026-06-10T10:00:00+07:00',
    originalEarnAmount: 200,
    originalIncomeRows,
    actor: 'test',
  });
  assert.equal(held.rows.length, 2);
  const amounts = held.rows.map((r) => Number(r.held_amount)).sort();
  assert.deepEqual(amounts, [125, 200]);
});

test('no authoritative original income rows results in a 409, no zero hold is created', async () => {
  const db = new FakeClient();
  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 1,
      jobId: 10,
      technicianUsername: 'TECH_A',
      originalFinishedAt: '2026-06-10T10:00:00+07:00',
      actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'NO_AUTHORITATIVE_ORIGINAL_INCOME'
  );
  const rows = await getHoldsForReworkCase(db, 1);
  assert.equal(rows.length, 0);
});

test('duplicate rework open does not create a second negative hold', async () => {
  const db = new FakeClient();
  db.periods.set('payout_2026-06_25', { payout_id: 'payout_2026-06_25', status: 'paid', period_type: '25' });

  // First "open rework" attempt: no active case yet, so it proceeds and holds.
  assert.equal(await findActiveReworkCase(db, 10), null);
  db.openCase(10, 'open');
  await hold(db, { caseId: 1, amount: 325 });

  // Second "open rework" attempt on the same job: the guard must see the
  // still-open case and refuse to create a second case/hold, mirroring the
  // index.js route which throws a 409 at this exact point instead of
  // proceeding to INSERT INTO technician_rework_cases.
  const active = await findActiveReworkCase(db, 10);
  assert.ok(active, 'second open attempt must observe the existing active case');
  assert.equal(active.job_id, 10);

  const negativeAdjustments = db.adjustments.filter((r) => r.adj_amount < 0);
  assert.equal(negativeAdjustments.length, 1);
});

test('originalIncomeRows with every technician at amount 0 results in 409 and no hold row', async () => {
  const db = new FakeClient();
  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 1,
      jobId: 10,
      technicianUsername: 'TECH_A',
      originalFinishedAt: '2026-06-10T10:00:00+07:00',
      originalIncomeRows: [
        { technician_username: 'TECH_A', amount: 0, job_id: 10 },
        { technician_username: 'TECH_B', amount: 0, job_id: 10 },
      ],
      actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'NO_AUTHORITATIVE_ORIGINAL_INCOME'
  );
  const rows = await getHoldsForReworkCase(db, 1);
  assert.equal(rows.length, 0);
});

test('first rework round on a job holds and releases 325 end to end', async () => {
  const db = new FakeClient();
  const held = await hold(db, { caseId: 1, amount: 325 });
  assert.equal(held.rows.length, 1);
  assert.equal(held.rows[0].held_amount, 325);

  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const released = await release(db, { caseId: 1 });
  assert.equal(released.released, true);
  assert.equal(released.amount, 325);
});

test('a second rework round on the same job reuses the prior released hold ledger, not the build rows', async () => {
  const db = new FakeClient();

  // Round 1: held and released for 325.
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round1Release = await release(db, { caseId: 1 });
  assert.equal(round1Release.released, true);
  assert.equal(round1Release.amount, 325);

  // Round 2 on the same job: even though a (wrong) build amount and no
  // payout_lines row are supplied, the previously-released ledger entry for
  // this job must win — 325 from round 1, never 999 from originalEarnAmount
  // and never job_technician_income_preview.
  const round2Held = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    originalEarnAmount: 999,
    actor: 'test',
  });
  assert.equal(round2Held.rows.length, 1);
  assert.equal(round2Held.rows[0].held_amount, 325);
});

test('closing the second rework round releases 325 exactly once', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });

  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });
  const round2Release = await release(db, { caseId: 2 });
  assert.equal(round2Release.released, true);
  assert.equal(round2Release.amount, 325);

  const positiveAdjustments = db.adjustments.filter((r) => r.adj_amount > 0);
  assert.equal(positiveAdjustments.length, 2); // one per round, never more
});

test('retrying the second rework round release does not pay twice', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });

  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });

  assert.equal((await release(db, { caseId: 2 })).released, true);
  assert.equal((await release(db, { caseId: 2 })).released, false);

  const positiveForRound2 = db.adjustments.filter((r) => r.adj_amount > 0 && r.technician_username === 'A2MKUNG');
  assert.equal(positiveForRound2.length, 2); // round1 release + round2 release, not 3
});

test('round 1 net is exactly 325 (hold then release end to end)', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);
});

test('previous release still in a draft period: opening round 2 posts -325 into that same payout, net is 0 before close, +325 after, final net 325 (never 650)', async () => {
  const db = new FakeClient();

  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round1 = await release(db, { caseId: 1 });
  assert.equal(round1.amount, 325);
  assert.equal(db.periods.get(round1.payout_id).status, 'draft');
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);

  const round2 = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  assert.equal(round2.rows[0].held_amount, 325);
  const negativeAdj = db.adjustments.find((r) => r.adj_amount === -325);
  assert.ok(negativeAdj, 'opening round 2 must post a real -325 adjustment');
  assert.equal(negativeAdj.payout_id, round1.payout_id, 'must offset in the exact payout the prior release landed in, since it is still draft');
  assert.equal(netForTechnician(db, 'A2MKUNG'), 0, 'net must be 0 between the round-2 hold and its close');

  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });
  const round2Release = await release(db, { caseId: 2 });
  assert.equal(round2Release.amount, 325);
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325, 'final net must be 325, never 650');
});

test('previous release period was since locked: round 2 offset carries forward to the next draft period, never touching the locked period', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round1 = await release(db, { caseId: 1 });
  const lockedPayoutId = round1.payout_id;

  // The payroll period the round-1 release landed in has since been closed.
  db.periods.get(lockedPayoutId).status = 'locked';

  const round2 = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  assert.equal(round2.rows[0].held_amount, 325);
  assert.match(round2.rows[0].source_period_status_at_hold, /^locked_carried_forward:/);

  const negativeAdj = db.adjustments.find((r) => r.adj_amount === -325);
  assert.ok(negativeAdj);
  assert.notEqual(negativeAdj.payout_id, lockedPayoutId, 'must never write into the locked period');
  assert.equal(db.periods.get(lockedPayoutId).status, 'locked', 'the locked period itself must be untouched');

  db.jobs.set(10, { finished_at: '2026-07-20T10:00:00+07:00' });
  const round2Release = await release(db, { caseId: 2 });
  assert.equal(round2Release.amount, 325);
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);
});

test('previous release period was since paid: round 2 offset carries forward to the next draft period, never touching the paid period', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round1 = await release(db, { caseId: 1 });
  const paidPayoutId = round1.payout_id;

  db.periods.get(paidPayoutId).status = 'paid';

  const round2 = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  assert.equal(round2.rows[0].held_amount, 325);
  assert.match(round2.rows[0].source_period_status_at_hold, /^paid_carried_forward:/);

  const negativeAdj = db.adjustments.find((r) => r.adj_amount === -325);
  assert.ok(negativeAdj);
  assert.notEqual(negativeAdj.payout_id, paidPayoutId, 'must never write into the paid period');
  assert.equal(db.periods.get(paidPayoutId).status, 'paid', 'the paid period itself must be untouched');

  db.jobs.set(10, { finished_at: '2026-07-20T10:00:00+07:00' });
  const round2Release = await release(db, { caseId: 2 });
  assert.equal(round2Release.amount, 325);
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);
});

test('round 2 closes into the same draft payout that holds its own negative offset: both rows present, net for the whole job still correct', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round1 = await release(db, { caseId: 1 });

  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2,
    jobId: 10,
    technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00',
    actor: 'test',
  });
  // Same finished_at as round 1's release date, so round 2's own release
  // lands in that exact same payout as its own negative offset.
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  const round2Release = await release(db, { caseId: 2 });

  assert.equal(round2Release.payout_id, round1.payout_id);
  const rowsInPayout = db.adjustments.filter((r) => r.payout_id === round1.payout_id && r.technician_username === 'A2MKUNG');
  assert.equal(rowsInPayout.length, 3); // round1 +325, round2 -325, round2 +325
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);
});

test('round 3 on the same job: the chain of hold/release/hold/release still nets to 325 exactly once', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });

  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
  });
  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });
  await release(db, { caseId: 2 });
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325);

  const round3 = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 3, jobId: 10, technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-10T10:00:00+07:00', actor: 'test',
  });
  assert.equal(round3.rows[0].held_amount, 325);
  assert.equal(netForTechnician(db, 'A2MKUNG'), 0);

  db.jobs.set(10, { finished_at: '2026-07-20T10:00:00+07:00' });
  const round3Release = await release(db, { caseId: 3 });
  assert.equal(round3Release.amount, 325);
  assert.equal(netForTechnician(db, 'A2MKUNG'), 325, 'three full rework rounds must still net to 325, not 975');
});

test('team job (200 + 125): round 2 holds -200/-125 for the right technicians, closes +200/+125, total net stays 325', async () => {
  const db = new FakeClient();
  const originalIncomeRows = [
    { technician_username: 'TECH_A', amount: 200, job_id: 10 },
    { technician_username: 'TECH_B', amount: 125, job_id: 10 },
  ];
  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 1, jobId: 10, technicianUsername: 'TECH_A',
    originalFinishedAt: '2026-06-10T10:00:00+07:00', originalIncomeRows, actor: 'test',
  });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await releaseHeldIncomeForReworkCase(db, { reworkCaseId: 1, technicianUsername: 'TECH_A', actor: 'test' });
  assert.equal(netForTechnician(db, 'TECH_A'), 200);
  assert.equal(netForTechnician(db, 'TECH_B'), 125);

  const round2 = await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2, jobId: 10, technicianUsername: 'TECH_A',
    originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
  });
  const byTech = Object.fromEntries(round2.rows.map((r) => [r.technician_username, Number(r.held_amount)]));
  assert.equal(byTech.TECH_A, 200);
  assert.equal(byTech.TECH_B, 125);
  const negA = db.adjustments.find((r) => r.technician_username === 'TECH_A' && r.adj_amount === -200);
  const negB = db.adjustments.find((r) => r.technician_username === 'TECH_B' && r.adj_amount === -125);
  assert.ok(negA);
  assert.ok(negB);
  assert.equal(netForTechnician(db, 'TECH_A'), 0);
  assert.equal(netForTechnician(db, 'TECH_B'), 0);

  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });
  const round2Release = await releaseHeldIncomeForReworkCase(db, { reworkCaseId: 2, technicianUsername: 'TECH_A', actor: 'test' });
  assert.equal(round2Release.rows.length, 2);
  assert.equal(netForTechnician(db, 'TECH_A'), 200);
  assert.equal(netForTechnician(db, 'TECH_B'), 125);
  assert.equal(netForTechnician(db, 'TECH_A') + netForTechnician(db, 'TECH_B'), 325);
});

test('retrying round-2 open 10 times posts exactly one negative adjustment per technician', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });

  for (let i = 0; i < 10; i += 1) {
    await holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    });
  }
  const negatives = db.adjustments.filter((r) => r.adj_amount < 0 && r.technician_username === 'A2MKUNG');
  assert.equal(negatives.length, 1);
});

test('retrying round-2 close 10 times posts exactly one positive adjustment per technician', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });
  await holdOriginalIncomeForReworkCase(db, {
    reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
    originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
  });
  db.jobs.set(10, { finished_at: '2026-07-05T10:00:00+07:00' });

  for (let i = 0; i < 10; i += 1) {
    await release(db, { caseId: 2 });
  }
  const positives = db.adjustments.filter((r) => r.adj_amount > 0 && r.technician_username === 'A2MKUNG');
  assert.equal(positives.length, 2); // round1 release + round2 release, never more
});

test('a previously released hold missing release_payout_id (corrupt ledger) refuses to guess: 409 and no money movement', async () => {
  const db = new FakeClient();
  // Simulate legacy/corrupt data: a released hold with no recorded payout.
  db.holds.push({
    hold_id: db.nextHoldId++, rework_case_id: 1, technician_username: 'A2MKUNG', job_id: 10,
    held_amount: 325, hold_status: 'released', released_amount: 325, release_payout_id: null,
    release_adjustment_id: null,
  });

  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'PREVIOUS_RELEASE_PAYOUT_MISSING'
  );
  assert.equal((await getHoldsForReworkCase(db, 2)).length, 0);
  assert.equal(db.adjustments.length, 0);
});

test('a previously released hold pointing at a payout period that no longer exists refuses to guess: 409 and rollback', async () => {
  const db = new FakeClient();
  db.holds.push({
    hold_id: db.nextHoldId++, rework_case_id: 1, technician_username: 'A2MKUNG', job_id: 10,
    held_amount: 325, hold_status: 'released', released_amount: 325,
    release_payout_id: 'payout_does_not_exist', release_adjustment_id: 9999,
  });

  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'PREVIOUS_RELEASE_PERIOD_NOT_FOUND'
  );
  assert.equal((await getHoldsForReworkCase(db, 2)).length, 0);
  assert.equal(db.adjustments.length, 0);
});

test('a previously released hold whose released_amount exceeds held_amount (corrupt ledger) is rejected, never trusted', async () => {
  const db = new FakeClient();
  db.holds.push({
    hold_id: db.nextHoldId++, rework_case_id: 1, technician_username: 'A2MKUNG', job_id: 10,
    held_amount: 100, hold_status: 'released', released_amount: 9999,
    release_payout_id: 'payout_2026-07_10', release_adjustment_id: 1,
  });

  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'PREVIOUS_HOLD_RELEASED_EXCEEDS_HELD'
  );
  assert.equal((await getHoldsForReworkCase(db, 2)).length, 0);
});

test('if the round-2 offset adjustment insert fails, no hold row is left behind for that technician', async () => {
  const db = new FakeClient();
  await hold(db, { caseId: 1, amount: 325 });
  db.jobs.set(10, { finished_at: '2026-06-20T10:00:00+07:00' });
  await release(db, { caseId: 1 });

  db.failNextAdjustmentInserts = 1;
  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    }),
    (error) => error.message === 'SIMULATED_ADJUSTMENT_INSERT_FAILURE'
  );
  assert.equal((await getHoldsForReworkCase(db, 2)).length, 0, 'no hold row may exist when its offset adjustment never committed');
});

test('a previous released hold with a zero released_amount is ignored as a source, falling through to other authoritative sources', async () => {
  const db = new FakeClient();
  db.holds.push({
    hold_id: db.nextHoldId++, rework_case_id: 1, technician_username: 'A2MKUNG', job_id: 10,
    held_amount: 0, hold_status: 'released', released_amount: 0,
    release_payout_id: 'payout_2026-07_10', release_adjustment_id: 1,
  });

  await assert.rejects(
    () => holdOriginalIncomeForReworkCase(db, {
      reworkCaseId: 2, jobId: 10, technicianUsername: 'A2MKUNG',
      originalFinishedAt: '2026-07-01T10:00:00+07:00', actor: 'test',
    }),
    (error) => error.status === 409 && error.message === 'NO_AUTHORITATIVE_ORIGINAL_INCOME'
  );
  assert.equal((await getHoldsForReworkCase(db, 2)).length, 0);
});
