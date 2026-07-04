"use strict";

const DEFAULT_TARGET_AMOUNT = 5000;
const DEFAULT_INSTALLMENT_AMOUNT = 500;

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function appError(message, statusCode = 400, code = message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function isPartnerEmploymentType(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "partner" || s === "พาร์ทเนอร์";
}

function normalizeIndexPredicate(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/::text/g, "")
    .replace(/[()"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function assertDepositCollectUniqueIndexReady(client) {
  const q = await client.query(
    `SELECT ix.indisunique AS is_unique,
            pg_get_indexdef(i.oid) AS indexdef,
            pg_get_expr(ix.indpred, ix.indrelid) AS predicate
       FROM pg_class t
       JOIN pg_index ix ON ix.indrelid = t.oid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname='public'
        AND t.relname='technician_deposit_ledger'
        AND i.relname='idx_deposit_collect_once_per_payout_tech'
      LIMIT 1`
  );
  const row = q.rows?.[0];
  const indexdef = String(row?.indexdef || "");
  const predicate = normalizeIndexPredicate(row?.predicate || "");
  const valid = Boolean(
    row
      && row.is_unique === true
      && /technician_username/i.test(indexdef)
      && /payout_id/i.test(indexdef)
      && /transaction_type/i.test(indexdef)
      && predicate === "transaction_type = 'collect'"
  );
  if (!valid) {
    throw appError("DEPOSIT_COLLECT_INDEX_REQUIRED", 503);
  }
  return {
    ok: true,
    index_name: "idx_deposit_collect_once_per_payout_tech",
    indexdef,
    predicate: row.predicate,
  };
}

async function getDepositAccount(client, username) {
  const tech = String(username || "").trim();
  if (!tech) return { technician_username: "", target_amount: DEFAULT_TARGET_AMOUNT, is_required: true };
  const q = await client.query(
    `SELECT technician_username, COALESCE(target_amount,5000)::numeric AS target_amount,
            COALESCE(is_required,TRUE) AS is_required
       FROM public.technician_deposit_accounts
      WHERE technician_username=$1
      LIMIT 1`,
    [tech]
  );
  if (q.rows?.[0]) {
    return {
      technician_username: tech,
      target_amount: money(q.rows[0].target_amount || DEFAULT_TARGET_AMOUNT),
      is_required: q.rows[0].is_required !== false,
    };
  }
  return { technician_username: tech, target_amount: DEFAULT_TARGET_AMOUNT, is_required: true };
}

async function getTechnicianProfile(client, username) {
  const tech = String(username || "").trim();
  if (!tech) return null;
  const q = await client.query(
    `SELECT username, COALESCE(employment_type,'company') AS employment_type
       FROM public.technician_profiles
      WHERE username=$1
      LIMIT 1`,
    [tech]
  );
  return q.rows?.[0] || null;
}

async function getDepositCollected(client, username) {
  const tech = String(username || "").trim();
  if (!tech) return 0;
  const q = await client.query(
    `SELECT COALESCE(SUM(
        CASE transaction_type
          WHEN 'collect' THEN amount
          WHEN 'manual_adjust' THEN amount
          WHEN 'refund' THEN -amount
          WHEN 'claim_deduct' THEN -amount
          ELSE 0
        END
      ),0)::numeric AS collected
       FROM public.technician_deposit_ledger
      WHERE technician_username=$1`,
    [tech]
  );
  return money(q.rows?.[0]?.collected || 0);
}

async function getExistingCollectForPayout(client, payoutId, username, { forUpdate = false } = {}) {
  const pid = String(payoutId || "").trim();
  const tech = String(username || "").trim();
  if (!pid || !tech) return { exists: false, amount: 0, rows: [] };
  const q = await client.query(
    `SELECT ledger_id, amount, created_at, created_by, meta_json
       FROM public.technician_deposit_ledger
      WHERE payout_id=$1
        AND technician_username=$2
        AND transaction_type='collect'
      ORDER BY ledger_id ASC
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [pid, tech]
  );
  const rows = q.rows || [];
  return {
    exists: rows.length > 0,
    amount: money(rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)),
    rows,
  };
}

async function getTechnicianPayoutPaymentState(client, payoutId, username, { forUpdate = false } = {}) {
  const pid = String(payoutId || "").trim();
  const tech = String(username || "").trim();
  if (!pid || !tech) {
    return { exists: false, paid_amount: 0, paid_status: "", paid_at: null, paymentAlreadyRecorded: false };
  }
  const q = await client.query(
    `SELECT paid_amount, paid_status, paid_at
       FROM public.technician_payout_payments
      WHERE payout_id=$1 AND technician_username=$2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [pid, tech]
  );
  const row = q.rows?.[0] || null;
  const paidAmount = money(row?.paid_amount || 0);
  const paidStatus = String(row?.paid_status || "").trim().toLowerCase();
  return {
    exists: !!row,
    paid_amount: paidAmount,
    paid_status: paidStatus,
    paid_at: row?.paid_at || null,
    paymentAlreadyRecorded: paidAmount > 0 || paidStatus === "partial" || paidStatus === "paid" || row?.paid_at != null,
  };
}

function calculateDepositDeduction({
  existingCollectExists = false,
  existingCollectAmount = 0,
  isRequired = true,
  isPartner = true,
  targetAmount = DEFAULT_TARGET_AMOUNT,
  collectedTotal = 0,
  grossAmount = 0,
  adjustmentTotal = 0,
} = {}) {
  if (existingCollectExists) {
    return {
      amount: money(existingCollectAmount),
      reason: "existing_collect_preserved",
      deposit_remaining_before: money(Math.max(0, Number(targetAmount || 0) - Number(collectedTotal || 0))),
      positive_payable_before_deposit: money(Math.max(0, Number(grossAmount || 0) + Number(adjustmentTotal || 0))),
    };
  }
  const remaining = money(Math.max(0, Number(targetAmount || 0) - Number(collectedTotal || 0)));
  const payable = money(Math.max(0, Number(grossAmount || 0) + Number(adjustmentTotal || 0)));
  if (!isRequired) return { amount: 0, reason: "deposit_not_required", deposit_remaining_before: remaining, positive_payable_before_deposit: payable };
  if (!isPartner) return { amount: 0, reason: "not_partner", deposit_remaining_before: remaining, positive_payable_before_deposit: payable };
  if (remaining <= 0) return { amount: 0, reason: "target_completed", deposit_remaining_before: remaining, positive_payable_before_deposit: payable };
  if (payable <= 0) return { amount: 0, reason: "no_positive_payable", deposit_remaining_before: remaining, positive_payable_before_deposit: payable };
  return {
    amount: money(Math.min(DEFAULT_INSTALLMENT_AMOUNT, remaining, payable)),
    reason: "per_payout_installment",
    deposit_remaining_before: remaining,
    positive_payable_before_deposit: payable,
  };
}

async function getProjectedDepositDeductionForPayout(client, {
  payout_id,
  technician_username,
  gross_amount = 0,
  adj_total = 0,
  period_status = "draft",
} = {}) {
  const pid = String(payout_id || "").trim();
  const tech = String(technician_username || "").trim();
  const existing = await getExistingCollectForPayout(client, pid, tech);
  const payment = await getTechnicianPayoutPaymentState(client, pid, tech);
  const account = await getDepositAccount(client, tech);
  const collected = await getDepositCollected(client, tech);
  const profile = await getTechnicianProfile(client, tech);
  const paidHistory = String(period_status || "").trim() === "paid" || (!existing.exists && payment.paymentAlreadyRecorded);
  const calc = paidHistory
    ? calculateDepositDeduction({
        existingCollectExists: existing.exists,
        existingCollectAmount: existing.amount,
        isRequired: account.is_required,
        isPartner: false,
        targetAmount: account.target_amount,
        collectedTotal: collected,
        grossAmount: gross_amount,
        adjustmentTotal: adj_total,
      })
    : calculateDepositDeduction({
        existingCollectExists: existing.exists,
        existingCollectAmount: existing.amount,
        isRequired: account.is_required,
        isPartner: isPartnerEmploymentType(profile?.employment_type || ""),
        targetAmount: account.target_amount,
        collectedTotal: collected,
        grossAmount: gross_amount,
        adjustmentTotal: adj_total,
      });
  const reason = !existing.exists && payment.paymentAlreadyRecorded
    ? "payment_already_recorded"
    : calc.reason;
  return {
    deposit_deduction_amount: calc.amount,
    deposit_existing_collect_amount: existing.amount,
    deposit_existing_collect_exists: existing.exists,
    deposit_projected: !existing.exists && calc.amount > 0,
    deposit_projection_reason: reason,
    deposit_target_amount: account.target_amount,
    deposit_collected_total: collected,
    deposit_collected_total_projected: money(collected + (!existing.exists ? calc.amount : 0)),
    deposit_remaining_amount: money(Math.max(0, Number(account.target_amount || 0) - Number(collected || 0))),
    deposit_remaining_amount_projected: money(Math.max(0, Number(account.target_amount || 0) - Number(collected || 0) - (!existing.exists ? calc.amount : 0))),
    deposit_is_required: account.is_required !== false,
    deposit_payment_paid_amount: payment.paid_amount,
    deposit_payment_paid_status: payment.paid_status,
    deposit_payment_paid_at: payment.paid_at,
    latest_deposit_deduction: calc.amount,
  };
}

async function materializeDepositCollectForPayout(client, {
  payout_id,
  technician_username,
  gross_amount = 0,
  adj_total = 0,
  actor = null,
} = {}) {
  await assertDepositCollectUniqueIndexReady(client);
  const pid = String(payout_id || "").trim();
  const tech = String(technician_username || "").trim();
  if (!pid || !tech) return { deposit_deduction_amount: 0, inserted: false, reason: "missing_context" };

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`technician_deposit_collect:${tech}`]);

  const existing = await getExistingCollectForPayout(client, pid, tech, { forUpdate: true });
  const payment = await getTechnicianPayoutPaymentState(client, pid, tech, { forUpdate: true });
  if (!existing.exists && payment.paymentAlreadyRecorded) {
    return {
      deposit_deduction_amount: 0,
      inserted: false,
      existing: false,
      reason: "payment_already_recorded",
      paid_amount: payment.paid_amount,
      paid_status: payment.paid_status,
      paid_at: payment.paid_at,
    };
  }
  const account = await getDepositAccount(client, tech);
  const collected = await getDepositCollected(client, tech);
  const profile = await getTechnicianProfile(client, tech);
  const calc = calculateDepositDeduction({
    existingCollectExists: existing.exists,
    existingCollectAmount: existing.amount,
    isRequired: account.is_required,
    isPartner: isPartnerEmploymentType(profile?.employment_type || ""),
    targetAmount: account.target_amount,
    collectedTotal: collected,
    grossAmount: gross_amount,
    adjustmentTotal: adj_total,
  });

  if (existing.exists || calc.amount <= 0) {
    return {
      deposit_deduction_amount: calc.amount,
      inserted: false,
      existing: existing.exists,
      reason: calc.reason,
    };
  }

  const ins = await client.query(
    `INSERT INTO public.technician_deposit_ledger(
       technician_username, payout_id, transaction_type, amount, note, created_by, meta_json
     ) VALUES($1,$2,'collect',$3,$4,$5,$6::jsonb)
     ON CONFLICT (technician_username, payout_id, transaction_type)
     WHERE transaction_type='collect'
     DO NOTHING
     RETURNING ledger_id`,
    [
      tech,
      pid,
      calc.amount,
      "Automatic technician deposit deduction",
      actor || null,
      JSON.stringify({
        gross_amount: money(gross_amount),
        adjustment_total: money(adj_total),
        formula: "per_payout_deposit_v1",
        policy: "min(500, deposit_remaining, positive_payable_before_deposit)",
      }),
    ]
  );
  const after = await getExistingCollectForPayout(client, pid, tech, { forUpdate: true });
  return {
    deposit_deduction_amount: after.amount,
    inserted: (ins.rowCount || 0) > 0,
    existing: (ins.rowCount || 0) <= 0,
    reason: "per_payout_installment",
  };
}

module.exports = {
  DEFAULT_INSTALLMENT_AMOUNT,
  DEFAULT_TARGET_AMOUNT,
  money,
  assertDepositCollectUniqueIndexReady,
  calculateDepositDeduction,
  getDepositAccount,
  getDepositCollected,
  getExistingCollectForPayout,
  getTechnicianPayoutPaymentState,
  getProjectedDepositDeductionForPayout,
  materializeDepositCollectForPayout,
};
