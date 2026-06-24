#!/usr/bin/env node
'use strict';

const { Client } = require('pg');
const {
  releaseHeldIncomeForReworkCase,
  money,
} = require('../server/services/technicianReworkIncome');

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function fail(message, code = 1) {
  const err = new Error(message);
  err.exitCode = code;
  throw err;
}

function clientConfig() {
  const connectionString = String(process.env.DATABASE_URL || process.env.PRODUCTION_DATABASE_URL || '').trim();
  if (!connectionString) fail('DATABASE_URL or PRODUCTION_DATABASE_URL is required');
  return {
    connectionString,
    options: '-c timezone=Asia/Bangkok',
    ssl: { rejectUnauthorized: false },
  };
}

async function loadReport(client, bookingCode, technician) {
  const jobQ = await client.query(
    `SELECT job_id, booking_code, job_status, technician_username, finished_at,
            returned_at, return_reason
       FROM public.jobs
      WHERE booking_code=$1
      LIMIT 1`,
    [bookingCode]
  );
  const job = jobQ.rows[0] || null;
  if (!job) fail(`JOB_NOT_FOUND booking_code=${bookingCode}`);

  const caseQ = await client.query(
    `SELECT *
       FROM public.technician_rework_cases
      WHERE job_id=$1
      ORDER BY created_at DESC NULLS LAST, rework_case_id DESC
      LIMIT 1`,
    [job.job_id]
  );
  const reworkCase = caseQ.rows[0] || null;
  if (!reworkCase) fail(`REWORK_CASE_NOT_FOUND job_id=${job.job_id}`);

  const holdsQ = await client.query(
    `SELECT *
       FROM public.technician_rework_income_holds
      WHERE rework_case_id=$1 AND technician_username=$2
      ORDER BY hold_id`,
    [reworkCase.rework_case_id, technician]
  );

  const linesQ = await client.query(
    `SELECT l.line_id, l.payout_id, l.technician_username, l.job_id, l.earn_amount,
            p.status AS period_status, p.period_start, p.period_end
       FROM public.technician_payout_lines l
       JOIN public.technician_payout_periods p ON p.payout_id=l.payout_id
      WHERE l.job_id::text=$1::text
        AND l.technician_username=$2
      ORDER BY p.period_start, l.line_id`,
    [String(job.job_id), technician]
  );

  const previewQ = await client.query(
    `SELECT job_id, technician_username, income_amount, income_source, is_stale,
            calculated_at, updated_at
       FROM public.job_technician_income_preview
      WHERE job_id=$1 AND technician_username=$2
      LIMIT 1`,
    [job.job_id, technician]
  ).catch(() => ({ rows: [] }));

  const adjustmentsQ = await client.query(
    `SELECT a.adj_id, a.payout_id, a.technician_username, a.job_id,
            a.adj_amount, a.reason, a.created_at, a.created_by,
            p.status AS period_status
       FROM public.technician_payout_adjustments a
       JOIN public.technician_payout_periods p ON p.payout_id=a.payout_id
      WHERE a.technician_username=$2
        AND (
          a.job_id::text=$1::text
          OR a.job_id::text LIKE 'rework_hold:%:' || $1::text
          OR a.job_id::text LIKE 'rework_release:%:' || $1::text
          OR a.reason LIKE '%job_id=' || $1::text || '%'
        )
      ORDER BY a.created_at, a.adj_id`,
    [String(job.job_id), technician]
  );

  const positiveLineTotals = new Map();
  for (const row of linesQ.rows || []) {
    const amount = money(row.earn_amount);
    if (amount <= 0) continue;
    positiveLineTotals.set(row.payout_id, money((positiveLineTotals.get(row.payout_id) || 0) + amount));
  }

  const candidates = [...positiveLineTotals.entries()].map(([payout_id, amount]) => ({ payout_id, amount }));
  let proposedAmount = null;
  let sourcePayoutId = null;
  let sourcePeriodStatus = null;
  if (candidates.length === 1) {
    proposedAmount = candidates[0].amount;
    sourcePayoutId = candidates[0].payout_id;
    sourcePeriodStatus = (linesQ.rows || []).find((row) => row.payout_id === sourcePayoutId)?.period_status || null;
  } else if (!candidates.length) {
    const preview = previewQ.rows[0] || null;
    if (preview && !preview.is_stale && money(preview.income_amount) > 0) {
      proposedAmount = money(preview.income_amount);
      sourcePeriodStatus = 'preview_only';
    }
  }

  return {
    job,
    reworkCase,
    holds: holdsQ.rows || [],
    payoutLines: linesQ.rows || [],
    preview: previewQ.rows[0] || null,
    adjustments: adjustmentsQ.rows || [],
    proposedAmount,
    sourcePayoutId,
    sourcePeriodStatus,
  };
}

function printReport(report, args) {
  const payload = {
    mode: args.apply ? 'APPLY_REQUESTED' : 'DRY_RUN',
    booking_code: report.job.booking_code,
    job_id: report.job.job_id,
    job_status: report.job.job_status,
    finished_at: report.job.finished_at,
    rework_case_id: report.reworkCase.rework_case_id,
    rework_case_code: report.reworkCase.case_code,
    rework_status: report.reworkCase.status,
    resolution: report.reworkCase.resolution,
    revisit_result: report.reworkCase.revisit_result,
    technician: args.technician,
    existing_holds: report.holds,
    payout_lines: report.payoutLines,
    preview: report.preview,
    related_adjustments: report.adjustments,
    proposed_amount: report.proposedAmount,
    source_payout_id: report.sourcePayoutId,
    source_period_status: report.sourcePeriodStatus,
  };
  console.log(JSON.stringify(payload, null, 2));
}

function validateApply(report, args) {
  if (String(args.confirm || '') !== 'APPLY_LEGACY_REWORK_RECOVERY') {
    fail('CONFIRMATION_REQUIRED: --confirm APPLY_LEGACY_REWORK_RECOVERY');
  }
  const expectedAmount = money(args.expectedAmount);
  if (expectedAmount <= 0) fail('POSITIVE_EXPECTED_AMOUNT_REQUIRED');
  if (report.holds.length) fail('HOLD_ALREADY_EXISTS: recovery is idempotent and will not overwrite it');
  if (!report.job.finished_at) fail('JOB_FINISHED_AT_REQUIRED');
  const successful = report.reworkCase.resolution === 'fixed'
    || report.reworkCase.revisit_result === 'successful';
  if (!successful) fail('REWORK_NOT_CONFIRMED_SUCCESSFUL');
  const duplicateRelease = report.adjustments.some((row) =>
    money(row.adj_amount) > 0
    && (String(row.job_id || '').startsWith('rework_release:') || String(row.reason || '').includes('[REWORK_RELEASE]'))
  );
  if (duplicateRelease) fail('RELEASE_ADJUSTMENT_ALREADY_EXISTS');
  if (report.proposedAmount == null) fail('SOURCE_AMOUNT_AMBIGUOUS: review dry-run and provide a single ledger source');
  if (money(report.proposedAmount) !== expectedAmount) {
    fail(`EXPECTED_AMOUNT_MISMATCH expected=${expectedAmount} ledger=${money(report.proposedAmount)}`);
  }
  if (String(report.sourcePeriodStatus || '') === 'paid' && String(args.allowPaidSource || '') !== 'YES') {
    fail('SOURCE_PERIOD_ALREADY_PAID: rerun only after explicit accounting approval with --allow-paid-source YES');
  }
  return expectedAmount;
}

async function applyRecovery(client, report, args) {
  const amount = validateApply(report, args);
  await client.query('BEGIN');
  try {
    const lockJob = await client.query(
      `SELECT job_id, finished_at FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [report.job.job_id]
    );
    if (!lockJob.rows[0]?.finished_at) fail('JOB_FINISHED_AT_REQUIRED');

    const lockCase = await client.query(
      `SELECT * FROM public.technician_rework_cases WHERE rework_case_id=$1 FOR UPDATE`,
      [report.reworkCase.rework_case_id]
    );
    if (!lockCase.rows[0]) fail('REWORK_CASE_NOT_FOUND_DURING_APPLY');

    const existing = await client.query(
      `SELECT * FROM public.technician_rework_income_holds
        WHERE rework_case_id=$1 AND technician_username=$2
        FOR UPDATE`,
      [report.reworkCase.rework_case_id, args.technician]
    );
    if (existing.rows.length) fail('HOLD_ALREADY_EXISTS_DURING_APPLY');

    const inserted = await client.query(
      `INSERT INTO public.technician_rework_income_holds
        (rework_case_id, technician_username, job_id, held_amount,
         source_payout_id, source_period_status_at_hold, hold_status, created_by)
       VALUES($1,$2,$3,$4,$5,$6,'held',$7)
       RETURNING *`,
      [
        report.reworkCase.rework_case_id,
        args.technician,
        report.job.job_id,
        amount,
        report.sourcePayoutId,
        `legacy_recovery:${report.sourcePeriodStatus || 'unknown'}`,
        String(args.actor || 'legacy_rework_recovery'),
      ]
    );

    const release = await releaseHeldIncomeForReworkCase(client, {
      reworkCaseId: report.reworkCase.rework_case_id,
      technicianUsername: args.technician,
      actor: String(args.actor || 'legacy_rework_recovery'),
    });

    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, hold: inserted.rows[0], release }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  args.bookingCode = String(args.bookingCode || '').trim();
  args.technician = String(args.technician || '').trim();
  if (!args.bookingCode) fail('--booking-code is required');
  if (!args.technician) fail('--technician is required');

  const client = new Client(clientConfig());
  await client.connect();
  try {
    if (!args.apply) await client.query('BEGIN TRANSACTION READ ONLY');
    const report = await loadReport(client, args.bookingCode, args.technician);
    printReport(report, args);
    if (!args.apply) {
      await client.query('COMMIT');
      return;
    }
    await applyRecovery(client, report, args);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`RECOVERY_FAILED: ${error.message}`);
    process.exitCode = error.exitCode || 1;
  });
}

module.exports = { parseArgs, loadReport, validateApply };
