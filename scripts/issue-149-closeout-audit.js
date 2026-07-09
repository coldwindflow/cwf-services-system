"use strict";

try { require("dotenv").config(); } catch (_) {}

const { Pool } = require("pg");
const depositCollections = require("../server/services/technicianDepositCollections");

const DEFAULT_TECHNICIAN = "0661479791";
const DEFAULT_WORK_MONTH = "2026-06";

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    technician: DEFAULT_TECHNICIAN,
    workMonth: DEFAULT_WORK_MONTH,
    run: false,
    json: false,
    allowProductionRead: false,
  };
  for (const arg of argv) {
    if (arg === "--run") opts.run = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--allow-production-read") opts.allowProductionRead = true;
    else if (arg.startsWith("--technician=")) opts.technician = arg.split("=").slice(1).join("=").trim();
    else if (arg.startsWith("--month=")) opts.workMonth = arg.split("=").slice(1).join("=").trim();
  }
  if (!/^\d{4}-\d{2}$/.test(opts.workMonth)) throw new Error("INVALID_WORK_MONTH");
  if (!opts.technician) throw new Error("MISSING_TECHNICIAN");
  return opts;
}

function nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function payoutIdsForWorkMonth(workMonth) {
  return [`payout_${workMonth}_25`, `payout_${nextMonth(workMonth)}_10`];
}

function classify({ period, payment }) {
  const status = String(period?.status || "draft").trim().toLowerCase();
  const paidStatus = String(payment?.paid_status || "").trim().toLowerCase();
  const paymentLinked = Boolean(
    payment?.payment_id != null ||
    Number(payment?.paid_amount || 0) > 0 ||
    paidStatus === "partial" ||
    paidStatus === "paid" ||
    payment?.paid_at != null
  );
  if (status === "locked" || status === "paid" || paymentLinked) {
    return "locked/paid/payment-linked-reconciliation-required";
  }
  return "draft/unpaid-safe-to-clean";
}

function databaseConfigFromEnv(env = process.env) {
  const connectionString = String(env.PRODUCTION_DATABASE_URL || env.DATABASE_URL || "").trim();
  if (connectionString) return { connectionString, ssl: { rejectUnauthorized: false } };
  if (env.DB_HOST && env.DB_USER && env.DB_NAME) {
    return {
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 5432),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      ssl: { rejectUnauthorized: false },
    };
  }
  return null;
}

function redactConfig(config) {
  if (!config) return null;
  if (config.connectionString) return { connectionString: "[REDACTED_DATABASE_URL]" };
  return {
    host: config.host || "",
    port: config.port || "",
    user: config.user ? "[REDACTED_DB_USER]" : "",
    database: config.database || "",
  };
}

async function loadRows(client, technician, payoutIds) {
  const params = [technician, payoutIds];
  const [periods, lines, orphanLines, allAdjustments, orphanAdjustments, payments, deposits, previewCache, displayCache] = await Promise.all([
    client.query(
      `SELECT payout_id, status, period_start, period_end
         FROM public.technician_payout_periods
        WHERE payout_id = ANY($1::text[])
        ORDER BY payout_id ASC`,
      [payoutIds]
    ),
    client.query(
      `SELECT line_id, payout_id, technician_username, job_id::text AS job_id,
              finished_at, COALESCE(earn_amount,0)::numeric AS earn_amount
         FROM public.technician_payout_lines
        WHERE technician_username=$1
          AND payout_id = ANY($2::text[])
        ORDER BY payout_id ASC, job_id ASC, line_id ASC`,
      params
    ),
    client.query(
      `SELECT l.line_id, l.payout_id, l.technician_username, l.job_id::text AS job_id,
              l.finished_at, COALESCE(l.earn_amount,0)::numeric AS earn_amount
         FROM public.technician_payout_lines l
         LEFT JOIN public.jobs j ON j.job_id::text = l.job_id::text
        WHERE l.technician_username=$1
          AND l.payout_id = ANY($2::text[])
          AND j.job_id IS NULL
        ORDER BY l.payout_id ASC, l.job_id ASC, l.line_id ASC`,
      params
    ),
    client.query(
      `SELECT adj_id, payout_id, technician_username, job_id::text AS job_id,
              COALESCE(adj_amount,0)::numeric AS adj_amount, reason, created_at, created_by
         FROM public.technician_payout_adjustments
        WHERE technician_username=$1
          AND payout_id = ANY($2::text[])
        ORDER BY payout_id ASC, job_id ASC NULLS LAST, adj_id ASC`,
      params
    ),
    client.query(
      `SELECT a.adj_id, a.payout_id, a.technician_username, a.job_id::text AS job_id,
              COALESCE(a.adj_amount,0)::numeric AS adj_amount, a.reason, a.created_at, a.created_by
         FROM public.technician_payout_adjustments a
         LEFT JOIN public.jobs j ON j.job_id::text = a.job_id::text
        WHERE a.technician_username=$1
          AND a.payout_id = ANY($2::text[])
          AND a.job_id IS NOT NULL
          AND j.job_id IS NULL
        ORDER BY a.payout_id ASC, a.job_id ASC, a.adj_id ASC`,
      params
    ),
    client.query(
      `SELECT payment_id, payout_id, technician_username,
              COALESCE(paid_amount,0)::numeric AS paid_amount,
              COALESCE(paid_status,'') AS paid_status,
              paid_at, paid_by, slip_url, note
         FROM public.technician_payout_payments
        WHERE technician_username=$1
          AND payout_id = ANY($2::text[])
        ORDER BY payout_id ASC, payment_id ASC`,
      params
    ),
    client.query(
      `SELECT ledger_id, payout_id, technician_username, transaction_type,
              COALESCE(amount,0)::numeric AS amount, created_at, created_by
         FROM public.technician_deposit_ledger
        WHERE technician_username=$1
          AND payout_id = ANY($2::text[])
          AND transaction_type='collect'
        ORDER BY payout_id ASC, ledger_id ASC`,
      params
    ),
    client.query(
      `SELECT p.id, p.job_id::text AS job_id, p.technician_username,
              COALESCE(p.income_amount,0)::numeric AS income_amount,
              p.income_source, p.is_stale, p.updated_at
         FROM public.job_technician_income_preview p
         LEFT JOIN public.jobs j ON j.job_id::text = p.job_id::text
        WHERE p.technician_username=$1
          AND j.job_id IS NULL
        ORDER BY p.job_id ASC, p.id ASC`,
      [technician]
    ),
    client.query(
      `SELECT d.id, d.job_id::text AS job_id, d.technician_username,
              COALESCE(d.display_amount,0)::numeric AS display_amount,
              d.display_state, d.context, d.is_stale, d.updated_at
         FROM public.technician_job_income_display d
         LEFT JOIN public.jobs j ON j.job_id::text = d.job_id::text
        WHERE d.technician_username=$1
          AND j.job_id IS NULL
        ORDER BY d.job_id ASC, d.id ASC`,
      [technician]
    ),
  ]);

  return {
    periods: periods.rows || [],
    lines: lines.rows || [],
    orphanLines: orphanLines.rows || [],
    allAdjustments: allAdjustments.rows || [],
    orphanAdjustments: orphanAdjustments.rows || [],
    payments: payments.rows || [],
    deposits: deposits.rows || [],
    previewCache: previewCache.rows || [],
    displayCache: displayCache.rows || [],
  };
}

function sumRows(rows, field) {
  return money((rows || []).reduce((sum, row) => sum + Number(row[field] || 0), 0));
}

function groupKey(payoutId, technician) {
  return `${payoutId}::${technician}`;
}

function orphanJobKey(row) {
  return `${row.payout_id}::${row.technician_username}::${row.job_id}`;
}

async function summarizeAudit(client, { technician, workMonth }) {
  const payoutIds = payoutIdsForWorkMonth(workMonth);
  const data = await loadRows(client, technician, payoutIds);
  const periods = new Map(data.periods.map((row) => [row.payout_id, row]));
  const payments = new Map(data.payments.map((row) => [groupKey(row.payout_id, row.technician_username), row]));

  const orphanAdjustmentsByJob = new Map();
  for (const adj of data.orphanAdjustments) {
    const key = orphanJobKey(adj);
    if (!orphanAdjustmentsByJob.has(key)) orphanAdjustmentsByJob.set(key, []);
    orphanAdjustmentsByJob.get(key).push(adj);
  }

  const allLinesByPayout = new Map();
  for (const line of data.lines) {
    if (!allLinesByPayout.has(line.payout_id)) allLinesByPayout.set(line.payout_id, []);
    allLinesByPayout.get(line.payout_id).push(line);
  }
  const allAdjustmentsByPayout = new Map();
  for (const adj of data.allAdjustments) {
    if (!allAdjustmentsByPayout.has(adj.payout_id)) allAdjustmentsByPayout.set(adj.payout_id, []);
    allAdjustmentsByPayout.get(adj.payout_id).push(adj);
  }

  const baseByPayout = new Map();
  for (const payoutId of payoutIds) {
    const period = periods.get(payoutId) || { payout_id: payoutId, status: "draft" };
    const payment = payments.get(groupKey(payoutId, technician)) || null;
    const gross = sumRows(allLinesByPayout.get(payoutId) || [], "earn_amount");
    const adj = sumRows(allAdjustmentsByPayout.get(payoutId) || [], "adj_amount");
    const currentDeposit = await depositCollections.getProjectedDepositDeductionForPayout(client, {
      payout_id: payoutId,
      technician_username: technician,
      gross_amount: gross,
      adj_total: adj,
      period_status: period.status || "draft",
    });
    baseByPayout.set(payoutId, {
      payout_id: payoutId,
      period_status: period.status || "draft",
      gross_amount: gross,
      adj_total: adj,
      deposit_deduction_amount: money(currentDeposit.deposit_deduction_amount || 0),
      net_amount: money(gross + adj - Number(currentDeposit.deposit_deduction_amount || 0)),
      paid_amount: money(payment?.paid_amount || 0),
      paid_status: payment?.paid_status || "",
      payment_id: payment?.payment_id || null,
      payment,
      currentDeposit,
    });
  }

  const orphanRows = [];
  const orphanLineGroups = new Map();
  for (const line of data.orphanLines) {
    const key = orphanJobKey(line);
    if (!orphanLineGroups.has(key)) {
      orphanLineGroups.set(key, {
        row_type: "payout_line_group",
        technician_username: line.technician_username,
        job_id: line.job_id,
        payout_id: line.payout_id,
        line_ids: [],
        orphan_payout_line_amount: 0,
      });
    }
    const group = orphanLineGroups.get(key);
    if (line.line_id != null && !group.line_ids.includes(line.line_id)) group.line_ids.push(line.line_id);
    group.orphan_payout_line_amount = money(group.orphan_payout_line_amount + Number(line.earn_amount || 0));
  }
  for (const group of orphanLineGroups.values()) {
    const period = periods.get(group.payout_id) || { payout_id: group.payout_id, status: "draft" };
    const payment = payments.get(groupKey(group.payout_id, group.technician_username)) || null;
    const linkedAdjustments = orphanAdjustmentsByJob.get(orphanJobKey(group)) || [];
    const adjustmentIds = [...new Set(linkedAdjustments.map((row) => row.adj_id).filter((id) => id != null))];
    const linkedAdjustmentAmount = sumRows(linkedAdjustments.filter((row, index, arr) =>
      row.adj_id == null || arr.findIndex((other) => other.adj_id === row.adj_id) === index
    ), "adj_amount");
    orphanRows.push({
      ...group,
      line_id: group.line_ids.length === 1 ? group.line_ids[0] : null,
      adjustment_ids: adjustmentIds,
      period_status: period.status || "draft",
      payment_id: payment?.payment_id || null,
      paid_status: payment?.paid_status || "",
      paid_amount: money(payment?.paid_amount || 0),
      linked_adjustment_amount: linkedAdjustmentAmount,
      classification: classify({ period, payment }),
    });
  }

  const lineJobKeys = new Set(data.orphanLines.map(orphanJobKey));
  for (const adj of data.orphanAdjustments) {
    const key = orphanJobKey(adj);
    if (lineJobKeys.has(key)) continue;
    const period = periods.get(adj.payout_id) || { payout_id: adj.payout_id, status: "draft" };
    const payment = payments.get(groupKey(adj.payout_id, adj.technician_username)) || null;
    orphanRows.push({
      row_type: "adjustment_only",
      technician_username: adj.technician_username,
      job_id: adj.job_id,
      payout_id: adj.payout_id,
      line_id: null,
      adjustment_ids: [adj.adj_id],
      period_status: period.status || "draft",
      payment_id: payment?.payment_id || null,
      paid_status: payment?.paid_status || "",
      paid_amount: money(payment?.paid_amount || 0),
      orphan_payout_line_amount: 0,
      linked_adjustment_amount: money(adj.adj_amount),
      classification: classify({ period, payment }),
    });
  }

  const targetOrphanJobIds = new Set(orphanRows.map((row) => String(row.job_id)));
  const targetPreviewCache = data.previewCache.filter((row) => targetOrphanJobIds.has(String(row.job_id)));
  const targetDisplayCache = data.displayCache.filter((row) => targetOrphanJobIds.has(String(row.job_id)));

  const safeByPayout = new Map();
  for (const row of orphanRows.filter((r) => r.classification === "draft/unpaid-safe-to-clean")) {
    if (!safeByPayout.has(row.payout_id)) safeByPayout.set(row.payout_id, []);
    safeByPayout.get(row.payout_id).push(row);
  }

  const expectedByPayout = new Map();
  for (const payoutId of payoutIds) {
    const base = baseByPayout.get(payoutId);
    const safeRows = safeByPayout.get(payoutId) || [];
    const safeLineAmount = sumRows(safeRows, "orphan_payout_line_amount");
    const safeAdjustmentAmount = sumRows(safeRows, "linked_adjustment_amount");
    const expectedGross = money(base.gross_amount - safeLineAmount);
    const expectedAdj = money(base.adj_total - safeAdjustmentAmount);
    const expectedDeposit = await depositCollections.getProjectedDepositDeductionForPayout(client, {
      payout_id: payoutId,
      technician_username: technician,
      gross_amount: expectedGross,
      adj_total: expectedAdj,
      period_status: base.period_status,
    });
    expectedByPayout.set(payoutId, {
      payout_id: payoutId,
      expected_gross_amount_after_safe_cleanup: expectedGross,
      expected_adj_total_after_safe_cleanup: expectedAdj,
      expected_deposit_deduction_amount_after_safe_cleanup: money(expectedDeposit.deposit_deduction_amount || 0),
      expected_net_amount_after_safe_cleanup: money(expectedGross + expectedAdj - Number(expectedDeposit.deposit_deduction_amount || 0)),
      safe_cleanup_line_amount: safeLineAmount,
      safe_cleanup_adjustment_amount: safeAdjustmentAmount,
      safe_cleanup_deposit_impact: money(base.deposit_deduction_amount - Number(expectedDeposit.deposit_deduction_amount || 0)),
    });
  }

  for (const row of orphanRows) {
    const base = baseByPayout.get(row.payout_id);
    const expected = expectedByPayout.get(row.payout_id);
    const groupRows = safeByPayout.get(row.payout_id) || [];
    const groupPositiveImpact = groupRows.reduce((sum, r) => sum + Math.max(0, Number(r.orphan_payout_line_amount || 0) + Number(r.linked_adjustment_amount || 0)), 0);
    const rowPositiveImpact = Math.max(0, Number(row.orphan_payout_line_amount || 0) + Number(row.linked_adjustment_amount || 0));
    const allocatedDepositImpact = row.classification === "draft/unpaid-safe-to-clean" && groupPositiveImpact > 0
      ? money(Number(expected.safe_cleanup_deposit_impact || 0) * rowPositiveImpact / groupPositiveImpact)
      : 0;
    row.current_period_deposit_deduction_amount = base.deposit_deduction_amount;
    row.deposit_impact = allocatedDepositImpact;
    row.net_impact = money(Number(row.orphan_payout_line_amount || 0) + Number(row.linked_adjustment_amount || 0) - allocatedDepositImpact);
  }

  const totals = {
    orphan_rows: orphanRows.length,
    orphan_payout_line_amount: sumRows(orphanRows, "orphan_payout_line_amount"),
    linked_adjustment_amount: sumRows(orphanRows, "linked_adjustment_amount"),
    deposit_impact: sumRows(orphanRows, "deposit_impact"),
    net_impact: sumRows(orphanRows, "net_impact"),
    by_classification: {},
  };
  for (const row of orphanRows) {
    if (!totals.by_classification[row.classification]) {
      totals.by_classification[row.classification] = {
        rows: 0,
        orphan_payout_line_amount: 0,
        linked_adjustment_amount: 0,
        deposit_impact: 0,
        net_impact: 0,
      };
    }
    const t = totals.by_classification[row.classification];
    t.rows += 1;
    t.orphan_payout_line_amount = money(t.orphan_payout_line_amount + Number(row.orphan_payout_line_amount || 0));
    t.linked_adjustment_amount = money(t.linked_adjustment_amount + Number(row.linked_adjustment_amount || 0));
    t.deposit_impact = money(t.deposit_impact + Number(row.deposit_impact || 0));
    t.net_impact = money(t.net_impact + Number(row.net_impact || 0));
  }

  return {
    ok: true,
    read_only: true,
    technician_username: technician,
    work_month: workMonth,
    payout_ids: payoutIds,
    current_by_payout: Object.fromEntries([...baseByPayout.entries()]),
    expected_after_safe_cleanup_by_payout: Object.fromEntries([...expectedByPayout.entries()]),
    orphan_rows: orphanRows,
    cache_orphan_rows: {
      job_technician_income_preview: targetPreviewCache,
      technician_job_income_display: targetDisplayCache,
    },
    totals,
  };
}

function dryRunText(opts) {
  const payoutIds = payoutIdsForWorkMonth(opts.workMonth);
  return [
    "Read-only audit. No writes are executed.",
    `Technician: ${opts.technician}`,
    `Work month: ${opts.workMonth}`,
    `Payout IDs: ${payoutIds.join(", ")}`,
    "",
    "Run command:",
    `NODE_ENV=production node scripts/issue-149-closeout-audit.js --run --json --allow-production-read --technician=${opts.technician} --month=${opts.workMonth}`,
    "",
    "Required env: PRODUCTION_DATABASE_URL or DATABASE_URL, or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.",
  ].join("\n");
}

async function main() {
  const opts = parseArgs();
  if (!opts.run) {
    console.log(dryRunText(opts));
    return;
  }
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && !opts.allowProductionRead) {
    throw new Error("PRODUCTION_READ_REQUIRES_--allow-production-read");
  }
  const config = databaseConfigFromEnv();
  if (!config) {
    throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL or DB_* env is required");
  }
  const pool = new Pool(config);
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '45s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await summarizeAudit(client, opts);
    await client.query("COMMIT");
    if (opts.json) {
      console.log(JSON.stringify({ ...result, database: redactConfig(config) }, null, 2));
    } else {
      console.table(result.orphan_rows);
      console.log(JSON.stringify(result.totals, null, 2));
    }
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
    console.error(err && err.stack || err);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  payoutIdsForWorkMonth,
  classify,
  databaseConfigFromEnv,
  summarizeAudit,
  dryRunText,
};
