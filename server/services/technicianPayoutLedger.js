"use strict";

function money(v) {
  const n = Number(v || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function parsePayoutId(payoutId) {
  const m = /^payout_(\d{4})-(\d{2})_(10|25)$/.exec(String(payoutId || "").trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), type: m[3], label_ym: `${m[1]}-${m[2]}` };
}

function canUseSnapshot(status) {
  return ["locked", "paid"].includes(String(status || "").trim().toLowerCase());
}

function createTechnicianPayoutLedger(deps = {}) {
  const {
    pool,
    computePayoutTechSummaryLive,
    periodBoundsForYm,
    getPayoutPeriod,
    getDepositDeductionForPayout,
    getDepositSummary,
    paidStatus,
    recentPeriods,
    accountingPayoutDueDate,
    accountingThaiDate,
    accountingPayoutCutoffLabel,
  } = deps;

  if (!pool) throw new Error("technicianPayoutLedger requires pool");

  async function periodFor(payoutId) {
    const stored = getPayoutPeriod ? await getPayoutPeriod(payoutId) : null;
    const parsed = parsePayoutId(payoutId);
    if (stored) {
      const label = parsed?.label_ym || String(stored.payout_id || payoutId).match(/^payout_(\d{4}-\d{2})_/)?.[1] || "";
      return { ...stored, label_ym: label };
    }
    if (!parsed || !periodBoundsForYm) return null;
    const b = periodBoundsForYm(parsed.type, parsed.y, parsed.m);
    return {
      payout_id: payoutId,
      period_type: b.period_type,
      period_start: b.start.toISOString(),
      period_end: b.endEx.toISOString(),
      status: "draft",
      label_ym: parsed.label_ym,
    };
  }

  async function paymentRows(payoutId) {
    const q = await pool.query(
      `SELECT technician_username, COALESCE(paid_amount,0)::numeric AS paid_amount, paid_status,
              paid_at, paid_by, slip_url, note, payment_method, payment_reference
         FROM public.technician_payout_payments
        WHERE payout_id=$1`,
      [payoutId]
    );
    return q.rows || [];
  }

  async function adjustmentRows(payoutId) {
    const q = await pool.query(
      `SELECT technician_username,
              COALESCE(SUM(adj_amount),0)::numeric AS adj_total,
              COALESCE(SUM(adj_amount) FILTER (WHERE adj_amount < 0),0)::numeric AS deduction_adjustment_amount,
              COUNT(*)::int AS adjustment_count
         FROM public.technician_payout_adjustments
        WHERE payout_id=$1
        GROUP BY technician_username`,
      [payoutId]
    );
    return q.rows || [];
  }

  async function depositRows(payoutId) {
    const q = await pool.query(
      `SELECT technician_username, COALESCE(SUM(amount),0)::numeric AS deposit_deduction_amount
         FROM public.technician_deposit_ledger
        WHERE payout_id=$1 AND transaction_type='collect'
        GROUP BY technician_username`,
      [payoutId]
    );
    return q.rows || [];
  }

  async function snapshotGrossRows(payoutId) {
    const q = await pool.query(
      `SELECT technician_username,
              COUNT(DISTINCT job_id)::int AS job_count,
              COUNT(*)::int AS line_count,
              COALESCE(SUM(earn_amount),0)::numeric AS gross_amount
         FROM public.technician_payout_lines
        WHERE payout_id=$1
        GROUP BY technician_username`,
      [payoutId]
    );
    return q.rows || [];
  }

  async function liveGrossRows(payoutId, period) {
    if (!computePayoutTechSummaryLive) return [];
    const parsed = parsePayoutId(payoutId);
    const start = new Date(period.period_start);
    const endEx = new Date(period.period_end);
    const live = await computePayoutTechSummaryLive({
      payout_id: payoutId,
      start,
      endEx,
      period_type: period.period_type || parsed?.type,
      label_ym: parsed?.label_ym || period.label_ym,
    });
    return (live.rows || []).map(r => ({
      technician_username: r.technician_username,
      gross_amount: r.gross_amount,
      job_count: r.jobs_count || r.job_count || 0,
      line_count: r.line_count || r.jobs_count || r.job_count || 0,
    }));
  }

  async function buildTechnicianRows(payoutId) {
    const period = await periodFor(payoutId);
    if (!period) return { period: null, source: "invalid", rows: [] };
    const status = String(period.status || "draft").toLowerCase();
    const source = canUseSnapshot(status) ? "stored_locked_or_paid" : "live_contract_recompute_draft";
    const [grossRows, adjRows, depRows, payRows] = await Promise.all([
      canUseSnapshot(status) ? snapshotGrossRows(payoutId) : liveGrossRows(payoutId, period),
      adjustmentRows(payoutId),
      depositRows(payoutId),
      paymentRows(payoutId),
    ]);

    const byTech = new Map();
    const ensure = (tech) => {
      const k = String(tech || "").trim();
      if (!k) return null;
      if (!byTech.has(k)) byTech.set(k, {
        technician_username: k,
        job_count: 0,
        line_count: 0,
        gross_amount: 0,
        adj_total: 0,
        deduction_adjustment_amount: 0,
        deposit_deduction_amount: 0,
        paid_amount: 0,
      });
      return byTech.get(k);
    };

    for (const r of grossRows) Object.assign(ensure(r.technician_username) || {}, {
      gross_amount: money(r.gross_amount),
      job_count: Number(r.job_count || 0),
      line_count: Number(r.line_count || r.job_count || 0),
    });
    for (const r of adjRows) Object.assign(ensure(r.technician_username) || {}, {
      adj_total: money(r.adj_total),
      deduction_adjustment_amount: money(r.deduction_adjustment_amount),
      adjustment_count: Number(r.adjustment_count || 0),
    });
    for (const r of depRows) Object.assign(ensure(r.technician_username) || {}, {
      deposit_deduction_amount: money(r.deposit_deduction_amount),
    });
    for (const r of payRows) Object.assign(ensure(r.technician_username) || {}, {
      paid_amount: money(r.paid_amount),
      paid_status: r.paid_status || null,
      paid_at: r.paid_at || null,
      paid_by: r.paid_by || null,
      slip_url: r.slip_url || null,
      note: r.note || null,
      payment_method: r.payment_method || null,
      payment_reference: r.payment_reference || null,
    });

    const rows = [];
    for (const row of byTech.values()) {
      const deposit = getDepositDeductionForPayout
        ? money(await getDepositDeductionForPayout(payoutId, row.technician_username))
        : money(row.deposit_deduction_amount);
      const depositSummary = getDepositSummary ? await getDepositSummary(row.technician_username) : {};
      const net = money(Number(row.gross_amount || 0) + Number(row.adj_total || 0) - deposit);
      const paid = money(row.paid_amount);
      rows.push({
        ...row,
        deposit_deduction_amount: deposit,
        net_amount: net,
        net_payable: net,
        paid_amount: paid,
        remaining_amount: money(Math.max(0, net - paid)),
        outstanding_amount: money(Math.max(0, -net)),
        paid_status: paidStatus ? paidStatus(net, paid) : (paid >= Math.max(0, net) && paid > 0 ? "paid" : (paid > 0 ? "partial" : "unpaid")),
        ...depositSummary,
        latest_deposit_deduction: deposit,
        source,
      });
    }
    rows.sort((a, b) => Number(b.net_amount || 0) - Number(a.net_amount || 0) || String(a.technician_username).localeCompare(String(b.technician_username)));
    return { period, source, rows };
  }

  async function listPeriods(limit = 80) {
    let periods = [];
    const q = await pool.query(
      `SELECT payout_id, period_type, period_start, period_end, status
         FROM public.technician_payout_periods
        ORDER BY CASE WHEN COALESCE(status,'draft') <> 'paid' THEN 0 ELSE 1 END, period_start DESC, payout_id DESC
        LIMIT $1`,
      [Math.max(1, Math.min(500, Number(limit || 80)))]
    );
    periods = q.rows || [];
    if (!periods.length && recentPeriods) {
      periods = recentPeriods(6).map(p => ({
        payout_id: p.payout_id,
        period_type: p.period_type,
        period_start: p.start.toISOString(),
        period_end: p.endEx.toISOString(),
        status: "draft",
      }));
    }
    const rows = [];
    const now = Date.now();
    for (const p of periods) {
      const ledger = await buildTechnicianRows(p.payout_id);
      const totals = ledger.rows.reduce((a, r) => {
        a.technician_count += 1;
        a.line_count += Number(r.line_count || r.job_count || 0);
        a.gross_amount += Number(r.gross_amount || 0);
        a.deposit_deduction_amount += Number(r.deposit_deduction_amount || 0);
        a.adj_total += Number(r.adj_total || 0);
        a.net_payable += Number(r.net_amount || 0);
        a.paid_amount += Number(r.paid_amount || 0);
        a.remaining_amount += Number(r.remaining_amount || 0);
        a.outstanding_amount += Number(r.outstanding_amount || 0);
        return a;
      }, { technician_count: 0, line_count: 0, gross_amount: 0, deposit_deduction_amount: 0, adj_total: 0, net_payable: 0, paid_amount: 0, remaining_amount: 0, outstanding_amount: 0 });
      const due = accountingPayoutDueDate ? accountingPayoutDueDate(p) : null;
      rows.push({
        ...p,
        ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, k.endsWith("_count") ? v : money(v)])),
        due_date: due ? due.toISOString() : null,
        due_label: accountingThaiDate ? accountingThaiDate(due ? due.toISOString() : null) : null,
        cutoff_label: accountingPayoutCutoffLabel ? accountingPayoutCutoffLabel(p) : null,
        is_due: due ? due.getTime() <= now : false,
        source: ledger.source,
      });
    }
    return rows;
  }

  async function reportSummary() {
    const rows = await listPeriods(500);
    return rows.reduce((a, r) => {
      a.count += 1;
      a.net_payable += Number(r.net_payable || 0);
      a.paid_amount += Number(r.paid_amount || 0);
      a.remaining_amount += Number(r.remaining_amount || 0);
      return a;
    }, { count: 0, net_payable: 0, paid_amount: 0, remaining_amount: 0 });
  }

  return { parsePayoutId, canUseSnapshot, periodFor, buildTechnicianRows, listPeriods, reportSummary };
}

module.exports = { createTechnicianPayoutLedger, parsePayoutId, canUseSnapshot };
