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
        _lineIdSet: new Set(),
        _adjustmentIdSet: new Set(),
        orphan_payout_line_amount: 0,
        linked_adjustment_amount: 0,
        deposit_impact: 0,
        net_impact: 0,
      });
    }
    const g = groups.get(key);
    const rowLineIds = Array.isArray(row.line_ids) ? row.line_ids : [row.line_id];
    for (const id of rowLineIds) {
      if (id != null && !g._lineIdSet.has(id)) {
        g._lineIdSet.add(id);
        g.line_ids.push(id);
      }
    }
    let hasNewAdjustment = false;
    for (const id of row.adjustment_ids || []) {
      if (id != null && !g._adjustmentIdSet.has(id)) {
        g._adjustmentIdSet.add(id);
        g.adjustment_ids.push(id);
        hasNewAdjustment = true;
      }
    }
    g.orphan_payout_line_amount = money(g.orphan_payout_line_amount + Number(row.orphan_payout_line_amount || 0));
    if (!Array.isArray(row.adjustment_ids) || row.adjustment_ids.length === 0 || hasNewAdjustment) {
      g.linked_adjustment_amount = money(g.linked_adjustment_amount + Number(row.linked_adjustment_amount || 0));
    }
    g.deposit_impact = money(g.deposit_impact + Number(row.deposit_impact || 0));
    g.net_impact = money(g.net_impact + Number(row.net_impact || 0));
  }
  return [...groups.values()].map((group) => {
    const { _lineIdSet, _adjustmentIdSet, ...clean } = group;
    return clean;
  });
}

function cleanupSqlForGroup(group) {
  const pid = sqlString(group.payout_id);
  const tech = sqlString(group.technician_username);
  const job = sqlString(group.job_id);
  const expectedLineCount = Number(group.line_ids.length || 0);
  const expectedAdjustmentCount = Number(group.adjustment_ids.length || 0);
  const expectedLineTotal = money(group.orphan_payout_line_amount);
  const expectedAdjustmentTotal = money(group.linked_adjustment_amount);
  return `
-- A cleanup candidate: payout_id=${group.payout_id}, technician=${group.technician_username}, job_id=${group.job_id}
-- before_count expected lines=${group.line_ids.length}, adjustments=${group.adjustment_ids.length}
-- before_total line=${expectedLineTotal}, adjustment=${expectedAdjustmentTotal}, deposit_impact=${money(group.deposit_impact)}, net_impact=${money(group.net_impact)}
-- expected_after lines=0 total=0, adjustments=0 total=0 for this orphan job
DO $$
DECLARE
  v_period_status text;
  v_payment_count integer;
  v_line_count integer;
  v_line_total numeric;
  v_adjustment_count integer;
  v_adjustment_total numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('issue-149-remediation:${group.payout_id}:${group.technician_username}'));

  SELECT p.status
    INTO v_period_status
    FROM public.technician_payout_periods p
   WHERE p.payout_id=${pid}
   FOR UPDATE;

  IF v_period_status IS NOT NULL AND lower(COALESCE(v_period_status,'draft')) <> 'draft' THEN
    RAISE EXCEPTION 'Issue 149 cleanup blocked: payout % status changed to %', ${pid}, v_period_status;
  END IF;

  PERFORM 1
    FROM public.technician_payout_payments pay
   WHERE pay.payout_id=${pid}
     AND pay.technician_username=${tech}
     AND (
       pay.payment_id IS NOT NULL
       OR COALESCE(pay.paid_amount,0) <> 0
       OR COALESCE(pay.paid_status,'') <> ''
       OR pay.paid_at IS NOT NULL
     )
   FOR UPDATE;

  GET DIAGNOSTICS v_payment_count = ROW_COUNT;
  IF v_payment_count > 0 THEN
    RAISE EXCEPTION 'Issue 149 cleanup blocked: payment row now exists for payout %, technician %', ${pid}, ${tech};
  END IF;

  IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job}) THEN
    RAISE EXCEPTION 'Issue 149 cleanup blocked: job % exists again', ${job};
  END IF;

  PERFORM 1
    FROM public.technician_payout_lines l
   WHERE l.payout_id=${pid}
     AND l.technician_username=${tech}
     AND l.job_id::text=${job}
   FOR UPDATE;

  SELECT COUNT(*)::integer, COALESCE(SUM(earn_amount),0)::numeric
    INTO v_line_count, v_line_total
    FROM public.technician_payout_lines l
   WHERE l.payout_id=${pid}
     AND l.technician_username=${tech}
     AND l.job_id::text=${job}
     AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job});

  IF v_line_count <> ${expectedLineCount} OR v_line_total <> ${expectedLineTotal}::numeric THEN
    RAISE EXCEPTION 'Issue 149 cleanup blocked: payout line mismatch for payout %, job %; expected count %, total %, got count %, total %',
      ${pid}, ${job}, ${expectedLineCount}, ${expectedLineTotal}::numeric, v_line_count, v_line_total;
  END IF;

  PERFORM 1
    FROM public.technician_payout_adjustments a
   WHERE a.payout_id=${pid}
     AND a.technician_username=${tech}
     AND a.job_id::text=${job}
   FOR UPDATE;

  SELECT COUNT(*)::integer, COALESCE(SUM(adj_amount),0)::numeric
    INTO v_adjustment_count, v_adjustment_total
    FROM public.technician_payout_adjustments a
   WHERE a.payout_id=${pid}
     AND a.technician_username=${tech}
     AND a.job_id::text=${job}
     AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job});

  IF v_adjustment_count <> ${expectedAdjustmentCount} OR v_adjustment_total <> ${expectedAdjustmentTotal}::numeric THEN
    RAISE EXCEPTION 'Issue 149 cleanup blocked: adjustment mismatch for payout %, job %; expected count %, total %, got count %, total %',
      ${pid}, ${job}, ${expectedAdjustmentCount}, ${expectedAdjustmentTotal}::numeric, v_adjustment_count, v_adjustment_total;
  END IF;
END $$;

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
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_periods p
      WHERE p.payout_id=${pid}
        AND lower(COALESCE(p.status,'draft')) <> 'draft'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_payments pay
      WHERE pay.payout_id=${pid}
        AND pay.technician_username=${tech}
        AND (
          pay.payment_id IS NOT NULL
          OR COALESCE(pay.paid_amount,0) <> 0
          OR COALESCE(pay.paid_status,'') <> ''
          OR pay.paid_at IS NOT NULL
        )
   )
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING adj_id, payout_id, technician_username, job_id, adj_amount;

DELETE FROM public.technician_payout_lines
 WHERE payout_id=${pid}
   AND technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_periods p
      WHERE p.payout_id=${pid}
        AND lower(COALESCE(p.status,'draft')) <> 'draft'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_payments pay
      WHERE pay.payout_id=${pid}
        AND pay.technician_username=${tech}
        AND (
          pay.payment_id IS NOT NULL
          OR COALESCE(pay.paid_amount,0) <> 0
          OR COALESCE(pay.paid_status,'') <> ''
          OR pay.paid_at IS NOT NULL
        )
   )
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING line_id, payout_id, technician_username, job_id, earn_amount;

DELETE FROM public.job_technician_income_preview
 WHERE technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_periods p
      WHERE p.payout_id=${pid}
        AND lower(COALESCE(p.status,'draft')) <> 'draft'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_payments pay
      WHERE pay.payout_id=${pid}
        AND pay.technician_username=${tech}
        AND (
          pay.payment_id IS NOT NULL
          OR COALESCE(pay.paid_amount,0) <> 0
          OR COALESCE(pay.paid_status,'') <> ''
          OR pay.paid_at IS NOT NULL
        )
   )
   AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id::text=${job})
 RETURNING id, job_id, technician_username, income_amount;

DELETE FROM public.technician_job_income_display
 WHERE technician_username=${tech}
   AND job_id::text=${job}
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_periods p
      WHERE p.payout_id=${pid}
        AND lower(COALESCE(p.status,'draft')) <> 'draft'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.technician_payout_payments pay
      WHERE pay.payout_id=${pid}
        AND pay.technician_username=${tech}
        AND (
          pay.payment_id IS NOT NULL
          OR COALESCE(pay.paid_amount,0) <> 0
          OR COALESCE(pay.paid_status,'') <> ''
          OR pay.paid_at IS NOT NULL
        )
   )
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
