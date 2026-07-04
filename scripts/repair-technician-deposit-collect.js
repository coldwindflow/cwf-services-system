"use strict";

require("dotenv").config();

const { Pool } = require("pg");
const deposits = require("../server/services/technicianDepositCollections");

function arg(name, fallback = "") {
  const ix = process.argv.indexOf(`--${name}`);
  if (ix >= 0 && process.argv[ix + 1]) return String(process.argv[ix + 1]).trim();
  const prefix = `--${name}=`;
  const found = process.argv.find((v) => String(v || "").startsWith(prefix));
  return found ? String(found).slice(prefix.length).trim() : fallback;
}

function buildConfirmationToken(payoutId, technician, expectedCollect) {
  return `${String(payoutId || "").trim()}:${String(technician || "").trim()}:${Number(expectedCollect || 0)}`;
}

async function main() {
  const payoutId = arg("payout");
  const technician = arg("technician");
  const execute = process.argv.includes("--execute");
  const confirm = arg("confirm");
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!/^payout_\d{4}-\d{2}_(10|25)$/.test(payoutId)) throw new Error("Invalid --payout");
  if (!technician) throw new Error("Missing --technician");

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await deposits.assertDepositCollectUniqueIndexReady(client);

    async function readPeriodAndTotals(db, { lock = false } = {}) {
      const periodQ = await db.query(
        `SELECT payout_id, status
           FROM public.technician_payout_periods
          WHERE payout_id=$1
          LIMIT 1
          ${lock ? "FOR UPDATE" : ""}`,
        [payoutId]
      );
      const period = periodQ.rows[0] || null;
      if (!period) throw new Error("PAYOUT_NOT_FOUND");
      if (String(period.status || "") === "paid") throw new Error("REFUSE_PAID_PAYOUT");

      const totalsQ = await db.query(
      `WITH gross AS (
         SELECT COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
           FROM public.technician_payout_lines
          WHERE payout_id=$1 AND technician_username=$2
       ),
       adj AS (
         SELECT COALESCE(SUM(adj_amount),0)::numeric AS adj_total
           FROM public.technician_payout_adjustments
          WHERE payout_id=$1 AND technician_username=$2
       )
       SELECT gross.gross_amount, adj.adj_total
         FROM gross CROSS JOIN adj`,
        [payoutId, technician]
      );
      return {
        period,
        totals: totalsQ.rows[0] || { gross_amount: 0, adj_total: 0 },
      };
    }

    async function readPaymentAndCollect(db, { lockPayment = false, lockCollect = false } = {}) {
      const payment = await deposits.getTechnicianPayoutPaymentState(db, payoutId, technician, { forUpdate: lockPayment });
      const existingCollect = await deposits.getExistingCollectForPayout(db, payoutId, technician, { forUpdate: lockCollect });
      return { payment, existingCollect };
    }

    const { period, totals } = await readPeriodAndTotals(client);
    const precheck = await readPaymentAndCollect(client);
    const projected = await deposits.getProjectedDepositDeductionForPayout(client, {
      payout_id: payoutId,
      technician_username: technician,
      gross_amount: totals.gross_amount,
      adj_total: totals.adj_total,
      period_status: period.status,
    });
    const expectedCollect = Number(projected.deposit_deduction_amount || 0);
    const confirmationToken = buildConfirmationToken(payoutId, technician, expectedCollect);

    const report = {
      dry_run: !execute,
      payout_id: payoutId,
      technician_username: technician,
      period_status: period.status,
      gross_amount: Number(totals.gross_amount || 0),
      adj_total: Number(totals.adj_total || 0),
      paid_amount: precheck.payment.paid_amount,
      paid_status: precheck.payment.paid_status || null,
      paid_at: precheck.payment.paid_at || null,
      existing_collect: precheck.existingCollect.amount,
      existing_collect_exists: precheck.existingCollect.exists,
      expected_collect: expectedCollect,
      confirmation_token: confirmationToken,
      projected,
    };

    if (!execute) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await client.query("BEGIN");
    const locked = await readPeriodAndTotals(client, { lock: true });
    const lockedPrecheck = await readPaymentAndCollect(client, { lockPayment: true, lockCollect: true });
    const lockedProjected = await deposits.getProjectedDepositDeductionForPayout(client, {
      payout_id: payoutId,
      technician_username: technician,
      gross_amount: locked.totals.gross_amount,
      adj_total: locked.totals.adj_total,
      period_status: locked.period.status,
    });
    const lockedExpectedCollect = Number(lockedProjected.deposit_deduction_amount || 0);
    const lockedConfirmationToken = buildConfirmationToken(payoutId, technician, lockedExpectedCollect);
    if (confirm !== lockedConfirmationToken) {
      const err = new Error(`CONFIRMATION_TOKEN_REQUIRED:${lockedConfirmationToken}`);
      err.code = "CONFIRMATION_TOKEN_REQUIRED";
      throw err;
    }
    if (!lockedPrecheck.existingCollect.exists && lockedPrecheck.payment.paymentAlreadyRecorded) {
      const err = new Error("PAYMENT_ALREADY_RECORDED");
      err.code = "PAYMENT_ALREADY_RECORDED";
      throw err;
    }
    const materialized = await deposits.materializeDepositCollectForPayout(client, {
      payout_id: payoutId,
      technician_username: technician,
      gross_amount: locked.totals.gross_amount,
      adj_total: locked.totals.adj_total,
      actor: "script:repair-technician-deposit-collect",
    });
    await client.query("COMMIT");
    console.log(JSON.stringify({
      ...report,
      dry_run: false,
      executed_with: {
        period_status: locked.period.status,
        gross_amount: Number(locked.totals.gross_amount || 0),
        adj_total: Number(locked.totals.adj_total || 0),
        paid_amount: lockedPrecheck.payment.paid_amount,
        paid_status: lockedPrecheck.payment.paid_status || null,
        paid_at: lockedPrecheck.payment.paid_at || null,
        existing_collect: lockedPrecheck.existingCollect.amount,
        expected_collect: lockedExpectedCollect,
        confirmation_token: lockedConfirmationToken,
      },
      materialized,
    }, null, 2));
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  buildConfirmationToken,
};
