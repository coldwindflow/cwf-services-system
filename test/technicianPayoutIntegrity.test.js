const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const payoutIntegrity = require("../server/services/technicianPayoutIntegrity");
const auditScript = require("../scripts/audit-orphan-payout-lines");

function normSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

class FakePayoutDb {
  constructor() {
    this.periods = new Map();
    this.lines = [];
    this.adjustments = [];
    this.payments = [];
    this.previews = [];
    this.displays = [];
  }

  async query(sql, params = []) {
    const s = normSql(sql);
    if (s.startsWith("SELECT payout_id, status, period_start, period_end FROM public.technician_payout_periods")) {
      const row = this.periods.get(String(params[0]));
      return { rows: row ? [{ ...row }] : [] };
    }
    if (s.startsWith("SELECT adj_id, payout_id, technician_username")) {
      const [payoutId, tech] = params.map(String);
      return {
        rows: this.adjustments
          .filter((r) => r.payout_id === payoutId && r.technician_username === tech)
          .sort((a, b) => Number(a.adj_id || 0) - Number(b.adj_id || 0))
          .map((r) => ({ ...r })),
      };
    }
    if (s.startsWith("SELECT payment_id, paid_amount, paid_status")) {
      const [payoutId, tech] = params.map(String);
      const row = this.payments.find((r) => r.payout_id === payoutId && r.technician_username === tech);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (s.startsWith("WITH refs AS")) {
      const jobId = String(params[0]);
      const grouped = new Map();
      const add = (row, key) => {
        const mapKey = `${row.payout_id}:${row.technician_username}`;
        if (!grouped.has(mapKey)) grouped.set(mapKey, {
          payout_id: row.payout_id,
          technician_username: row.technician_username,
          line_refs: 0,
          adjustment_refs: 0,
        });
        grouped.get(mapKey)[key] += 1;
      };
      for (const row of this.lines.filter((r) => String(r.job_id) === jobId)) add(row, "line_refs");
      for (const row of this.adjustments.filter((r) => String(r.job_id) === jobId)) add(row, "adjustment_refs");
      return {
        rows: [...grouped.values()].map((row) => {
          const period = this.periods.get(row.payout_id) || {};
          const payment = this.payments.find((p) => p.payout_id === row.payout_id && p.technician_username === row.technician_username) || {};
          return {
            ...row,
            period_status: period.status || "draft",
            payment_id: payment.payment_id || null,
            paid_amount: Number(payment.paid_amount || 0),
            paid_status: payment.paid_status || "",
            paid_at: payment.paid_at || null,
          };
        }),
      };
    }
    if (s.startsWith("DELETE FROM public.technician_payout_adjustments")) {
      const jobId = String(params[0]);
      const before = this.adjustments.length;
      this.adjustments = this.adjustments.filter((r) => String(r.job_id) !== jobId);
      return { rows: [], rowCount: before - this.adjustments.length };
    }
    if (s.startsWith("DELETE FROM public.technician_payout_lines")) {
      const jobId = String(params[0]);
      const before = this.lines.length;
      this.lines = this.lines.filter((r) => String(r.job_id) !== jobId);
      return { rows: [], rowCount: before - this.lines.length };
    }
    if (s.startsWith("DELETE FROM public.job_technician_income_preview")) {
      const jobId = Number(params[0]);
      const before = this.previews.length;
      this.previews = this.previews.filter((r) => Number(r.job_id) !== jobId);
      return { rows: [], rowCount: before - this.previews.length };
    }
    if (s.startsWith("DELETE FROM public.technician_job_income_display")) {
      const jobId = Number(params[0]);
      const before = this.displays.length;
      this.displays = this.displays.filter((r) => Number(r.job_id) !== jobId);
      return { rows: [], rowCount: before - this.displays.length };
    }
    throw new Error(`Unhandled SQL: ${s}`);
  }
}

function paidStatus(net, paid) {
  if (Number(paid || 0) >= Number(net || 0) - 0.0001) return "paid";
  if (Number(paid || 0) > 0) return "partial";
  return "unpaid";
}

function summaryDeps(db, deposits = {}) {
  return {
    db,
    loadPayoutLinesForTech: async ({ payout_id, tech, status }) => ({
      source: ["locked", "paid"].includes(String(status)) ? "stored_locked_or_paid" : "live_contract_recompute_draft",
      lines: db.lines.filter((r) => r.payout_id === payout_id && r.technician_username === tech),
    }),
    getProjectedDepositDeductionForPayout: async (_db, { payout_id }) => {
      const amount = Number(deposits[payout_id] || 0);
      return {
        deposit_deduction_amount: amount,
        deposit_target_amount: 5000,
        deposit_collected_total: 0,
        deposit_remaining_amount: 5000,
        deposit_is_required: true,
      };
    },
    paidStatus,
  };
}

test("period summary uses gross + adjustments - deposit and exposes the same net source for history", async () => {
  const db = new FakePayoutDb();
  db.periods.set("payout_2026-06_25", {
    payout_id: "payout_2026-06_25",
    status: "locked",
    period_start: "2026-06-01T00:00:00.000Z",
    period_end: "2026-06-16T00:00:00.000Z",
  });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "101", earn_amount: 1000 });
  db.adjustments.push({ adj_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "101", adj_amount: 100, reason: "bonus" });

  const summary = await payoutIntegrity.buildTechnicianPayoutPeriodSummary({
    ...summaryDeps(db, { "payout_2026-06_25": 50 }),
    period: { payout_id: "payout_2026-06_25", period_type: "25", label_ym: "2026-06", start: new Date("2026-06-01T00:00:00.000Z"), endEx: new Date("2026-06-16T00:00:00.000Z") },
    technicianUsername: "TECH",
  });

  assert.equal(summary.gross_amount, 1000);
  assert.equal(summary.adj_total, 100);
  assert.equal(summary.deposit_deduction_amount, 50);
  assert.equal(summary.net_amount, 1050);
  assert.equal(summary.payout_month_net_amount, 1050);
});

test("monthly summary total can be the exact sum of two history period net amounts", async () => {
  const db = new FakePayoutDb();
  for (const payoutId of ["payout_2026-06_25", "payout_2026-07_10"]) {
    db.periods.set(payoutId, {
      payout_id: payoutId,
      status: "locked",
      period_start: "2026-06-01T00:00:00.000Z",
      period_end: "2026-07-01T00:00:00.000Z",
    });
  }
  db.lines.push(
    { payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "201", earn_amount: 16750 },
    { payout_id: "payout_2026-07_10", technician_username: "TECH", job_id: "202", earn_amount: 19625 },
  );
  db.adjustments.push({ adj_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "201", adj_amount: 500, reason: "adjust" });

  const period25 = await payoutIntegrity.buildTechnicianPayoutPeriodSummary({
    ...summaryDeps(db, { "payout_2026-06_25": 500, "payout_2026-07_10": 500 }),
    period: { payout_id: "payout_2026-06_25", period_type: "25", label_ym: "2026-06", start: new Date(), endEx: new Date() },
    technicianUsername: "TECH",
  });
  const period10 = await payoutIntegrity.buildTechnicianPayoutPeriodSummary({
    ...summaryDeps(db, { "payout_2026-06_25": 500, "payout_2026-07_10": 500 }),
    period: { payout_id: "payout_2026-07_10", period_type: "10", label_ym: "2026-07", start: new Date(), endEx: new Date() },
    technicianUsername: "TECH",
  });

  const historyNet = period25.net_amount + period10.net_amount;
  const monthlyCardNet = [period25, period10].reduce((sum, p) => sum + Number(p.payout_month_net_amount || 0), 0);
  assert.equal(historyNet, 35875);
  assert.equal(monthlyCardNet, historyNet);
});

test("draft job delete cleanup removes only draft payout derived rows and income caches", async () => {
  const db = new FakePayoutDb();
  db.periods.set("payout_2026-07_10", { payout_id: "payout_2026-07_10", status: "draft" });
  db.lines.push({ payout_id: "payout_2026-07_10", technician_username: "TECH", job_id: "301", earn_amount: 900 });
  db.adjustments.push({ adj_id: 1, payout_id: "payout_2026-07_10", technician_username: "TECH", job_id: "301", adj_amount: 50 });
  db.previews.push({ job_id: 301 });
  db.displays.push({ job_id: 301 });

  const result = await payoutIntegrity.cleanupDraftJobPayoutRows(db, 301);

  assert.equal(result.deleted_payout_lines, 1);
  assert.equal(result.deleted_payout_adjustments, 1);
  assert.equal(result.deleted_income_previews, 1);
  assert.equal(result.deleted_income_display_rows, 1);
  assert.equal(db.lines.length, 0);
  assert.equal(db.adjustments.length, 0);
});

test("locked or paid/payment payout refs reject hard delete before cleanup", async () => {
  const locked = new FakePayoutDb();
  locked.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked" });
  locked.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "401", earn_amount: 1000 });
  await assert.rejects(() => payoutIntegrity.cleanupDraftJobPayoutRows(locked, 401), /PAYOUT_DELETE_BLOCKED/);
  assert.equal(locked.lines.length, 1);

  const paidRecord = new FakePayoutDb();
  paidRecord.periods.set("payout_2026-07_10", { payout_id: "payout_2026-07_10", status: "draft" });
  paidRecord.lines.push({ payout_id: "payout_2026-07_10", technician_username: "TECH", job_id: "402", earn_amount: 1000 });
  paidRecord.payments.push({ payment_id: 9, payout_id: "payout_2026-07_10", technician_username: "TECH", paid_amount: 0, paid_status: "unpaid" });
  await assert.rejects(() => payoutIntegrity.cleanupDraftJobPayoutRows(paidRecord, 402), /PAYOUT_DELETE_BLOCKED/);
  assert.equal(paidRecord.lines.length, 1);
});

test("hard delete routes call the shared payout guard and cleanup paths", () => {
  const src = fs.readFileSync("index.js", "utf8");
  assert.match(src, /admin_delete_job_primary/);
  assert.match(src, /legacy_admin_delete_job/);
  const cleanupCalls = src.match(/technicianPayoutIntegrity\.cleanupDraftJobPayoutRows/g) || [];
  assert.ok(cleanupCalls.length >= 3, "both admin delete handlers and legacy admin-delete must use cleanup");
});

test("orphan payout audit is read-only SQL and script defaults to dry-run", () => {
  const sql = payoutIntegrity.orphanPayoutLinesAuditSql({ limit: 50 });
  assert.match(sql, /SELECT l\.payout_id/);
  assert.match(sql, /LEFT JOIN public\.jobs/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bALTER\b|\bDROP\b/i);
  assert.deepEqual(auditScript.parseArgs([]), {
    run: false,
    json: false,
    allowProductionRead: false,
    apply: false,
    limit: 200,
  });
});
