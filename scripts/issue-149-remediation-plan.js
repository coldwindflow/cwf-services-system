"use strict";

const fs = require("node:fs");

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function sqlString(value) {
  return `'${String(value == null ? "" : value).replace(/'/g, "''")}'`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = { audit: "", finalize: "rollback" };
  for (const arg of argv) {
    if (arg.startsWith("--audit=")) opts.audit = arg.split("=").slice(1).join("=");
    else if (arg === "--finalize=commit") opts.finalize = "commit";
    else if (arg === "--finalize=rollback") opts.finalize = "rollback";
  }
  if (!opts.audit) throw new Error("--audit=issue-149-audit.json is required");
  return opts;
}

function loadAudit(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || parsed.ok !== true || !Array.isArray(parsed.orphan_rows)) {
    throw new Error("INVALID_AUDIT_JSON");
  }
  return parsed;
}

function groupSafeRows(rows) {
  const groups = new Map();
  for (const row of rows.filter((r) => r.classification === "draft/unpaid-safe-to-clean")) {
    const key = `${row.payout_id}::${row.technician_username}::${row.job_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        payout_id: row.payout_id,
        technician_username: row.technician_username,
        job_id: row.job_id,
        line_ids: [],
        adjustment_ids: [],
        orphan_payout_line_amount: 0,
        linked_adjustment_amount: 0,
        deposit_impact: 0,
        net_impact: 0,
      });
    }
    const g = groups.get(key);
    if (row.line_id != null) g.line_ids.push(row.line_id);
    for (const id of row.adjustment_ids || []) {
      if (id != null && !g.adjustment_ids.includes(id)) g.adjustment_ids.push(id);
    }
    g.orphan_payout_line_amount = money(g.orphan_payout_line_amount + Number(row.orphan_payout_line_amount || 0));
    g.linked_adjustment_amount = money(g.linked_adjustment_amount + Number(row.linked_adjustment_amount || 0));
    g.deposit_impact = money(g.deposit_impact + Number(row.deposit_impact || 0));
    g.net_impact = money(g.net_impact + Number(row.net_impact || 0));
  }
  return [...groups.values()];
}

function cleanupSqlForGroup(group) {
  const pid = sqlString(group.payout_id);
  const tech = sqlString(group.technician_username);
  const job = sqlString(group.job_id);
  return `
-- A cleanup candidate: payout_id=${group.payout_id}, technician=${group.technician_username}, job_id=${group.job_id}
-- before_count expected lines=${group.line_ids.length}, adjustments=${group.adjustment_ids.length}
-- before_total line=${money(group.orphan_payout_line_amount)}, adjustment=${money(group.linked_adjustment_amount)}, deposit_impact=${money(group.deposit_impact)}, net_impact=${money(group.net_impact)}
-- expected_after lines=0 total=0, adjustments=0 total=0 for this orphan job
SELECT 'before_lines' AS check_name, COUNT(*)::int AS count, COALESCE(SUM(earn_amount),0)::numeric AS total
  FROM public.technician_payout_lines
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job});

SELECT 'before_adjustments' AS check_name, COUNT(*)::int AS count, COALESCE(SUM(adj_amount),0)::numeric AS total
  FROM public.technician_payout_adjustments
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job});

DELETE FROM public.technician_payout_adjustments
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING adj_id, payout_id, technician_username, job_id, adj_amount;

DELETE FROM public.technician_payout_lines
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING line_id, payout_id, technician_username, job_id, earn_amount;

DELETE FROM public.job_technician_income_preview
 WHERE technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING id, job_id, technician_username, income_amount;

DELETE FROM public.technician_job_income_display
 WHERE technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING id, job_id, technician_username, display_amount;

SELECT 'after_lines' AS check_name, COUNT(*)::int AS count, COALESCE(SUM(earn_amount),0)::numeric AS total
  FROM public.technician_payout_lines
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job};

SELECT 'after_adjustments' AS check_name, COUNT(*)::int AS count, COALESCE(SUM(adj_amount),0)::numeric AS total
  FROM public.technician_payout_adjustments
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job};
`;
}

function payoutTotalsComments(audit) {
  const current = audit.current_by_payout || {};
  const expected = audit.expected_after_safe_cleanup_by_payout || {};
  const payoutIds = audit.payout_ids || Object.keys(current);
  const lines = [];
  for (const payoutId of payoutIds) {
    const before = current[payoutId] || {};
    const after = expected[payoutId] || {};
    lines.push(`-- before_total payout=${payoutId} gross=${money(before.gross_amount)} adj=${money(before.adj_total)} deposit=${money(before.deposit_deduction_amount)} net=${money(before.net_amount)} paid=${money(before.paid_amount)} status=${before.period_status || ""} payment_id=${before.payment_id || ""}`);
    lines.push(`-- expected_after_safe_cleanup payout=${payoutId} gross=${money(after.expected_gross_amount_after_safe_cleanup)} adj=${money(after.expected_adj_total_after_safe_cleanup)} deposit=${money(after.expected_deposit_deduction_amount_after_safe_cleanup)} net=${money(after.expected_net_amount_after_safe_cleanup)}`);
  }
  return lines;
}

function reconciliationSqlForRow(row) {
  const correction = money(-Number(row.net_impact || 0));
  return `
-- B reconciliation required: payout_id=${row.payout_id}, technician=${row.technician_username}, job_id=${row.job_id}
-- Do not delete payout history. Preserve payment_id=${row.payment_id || ""}, paid_status=${row.paid_status || ""}, paid_amount=${money(row.paid_amount || 0)}.
-- original_orphan_impact line=${money(row.orphan_payout_line_amount)}, adjustment=${money(row.linked_adjustment_amount)}, deposit=${money(row.deposit_impact)}, net=${money(row.net_impact)}
-- Proposed accounting correction after finance approval:
-- INSERT INTO public.technician_payout_adjustments(payout_id, technician_username, job_id, adj_amount, reason, created_by)
-- VALUES(${sqlString(row.payout_id)}, ${sqlString(row.technician_username)}, ${sqlString(row.job_id)}, ${correction},
--        'Issue #149 reconciliation for deleted job preserved in locked/paid payout history', 'issue-149-approved-remediation');
-- Then re-open/reconcile paid status through the accounting payout adjustment flow so payment history remains explicit.
`;
}

function buildPlan(audit, { finalize = "rollback" } = {}) {
  const safeGroups = groupSafeRows(audit.orphan_rows);
  const blockedRows = audit.orphan_rows.filter((r) => r.classification === "locked/paid/payment-linked-reconciliation-required");
  const lines = [];
  lines.push("-- Issue #149 remediation plan generated from read-only audit JSON.");
  lines.push("-- Do not run on production until owner approves the exact audit result and this plan.");
  lines.push(`-- technician=${audit.technician_username}, work_month=${audit.work_month}, payout_ids=${(audit.payout_ids || []).join(",")}`);
  lines.push(...payoutTotalsComments(audit));
  lines.push("BEGIN;");
  lines.push("SET LOCAL statement_timeout = '45s';");
  lines.push("SET LOCAL lock_timeout = '5s';");
  lines.push("");
  lines.push("-- Phase C/A: draft/unpaid-safe-to-clean targeted cleanup");
  if (!safeGroups.length) lines.push("-- No A cleanup rows in audit.");
  for (const group of safeGroups) lines.push(cleanupSqlForGroup(group));
  lines.push("");
  lines.push("-- Phase C/B: locked/paid/payment-linked reconciliation proposals");
  if (!blockedRows.length) lines.push("-- No B reconciliation rows in audit.");
  for (const row of blockedRows) lines.push(reconciliationSqlForRow(row));
  lines.push("");
  lines.push(finalize === "commit" ? "COMMIT;" : "ROLLBACK; -- default safety: review returned rows before changing to COMMIT after approval");
  return lines.join("\n");
}

function main() {
  const opts = parseArgs();
  const audit = loadAudit(opts.audit);
  process.stdout.write(buildPlan(audit, opts));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err && err.stack || err);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  loadAudit,
  groupSafeRows,
  buildPlan,
};
