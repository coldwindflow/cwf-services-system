const test = require("node:test");
const assert = require("node:assert/strict");

const payoutIntegrity = require("../server/services/technicianPayoutIntegrity");
const depositCollections = require("../server/services/technicianDepositCollections");
const auditScript = require("../scripts/audit-orphan-payout-lines");
const closeoutAudit = require("../scripts/issue-149-closeout-audit");
const remediationPlan = require("../scripts/issue-149-remediation-plan");

function normSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

class FakePayoutDb {
  constructor() {
    this.periods = new Map();
    this.jobs = new Map();
    this.lines = [];
    this.adjustments = [];
    this.payments = [];
    this.previews = [];
    this.displays = [];
    this.relatedRows = [];
    this._snapshots = [];
  }

  snapshot() {
    return {
      periods: new Map([...this.periods.entries()].map(([key, value]) => [key, { ...value }])),
      jobs: new Map([...this.jobs.entries()].map(([key, value]) => [key, { ...value }])),
      lines: cloneRows(this.lines),
      adjustments: cloneRows(this.adjustments),
      payments: cloneRows(this.payments),
      previews: cloneRows(this.previews),
      displays: cloneRows(this.displays),
      relatedRows: cloneRows(this.relatedRows),
    };
  }

  restore(snapshot) {
    this.periods = new Map([...snapshot.periods.entries()].map(([key, value]) => [key, { ...value }]));
    this.jobs = new Map([...snapshot.jobs.entries()].map(([key, value]) => [key, { ...value }]));
    this.lines = cloneRows(snapshot.lines);
    this.adjustments = cloneRows(snapshot.adjustments);
    this.payments = cloneRows(snapshot.payments);
    this.previews = cloneRows(snapshot.previews);
    this.displays = cloneRows(snapshot.displays);
    this.relatedRows = cloneRows(snapshot.relatedRows);
  }

  async query(sql, params = []) {
    const s = normSql(sql);
    if (s === "BEGIN") {
      this._snapshots.push(this.snapshot());
      return { rows: [], rowCount: 0 };
    }
    if (s === "COMMIT") {
      this._snapshots.pop();
      return { rows: [], rowCount: 0 };
    }
    if (s === "ROLLBACK") {
      const snapshot = this._snapshots.pop();
      if (snapshot) this.restore(snapshot);
      return { rows: [], rowCount: 0 };
    }
    if (s.startsWith("SELECT job_id, booking_code FROM public.jobs WHERE job_id=$1 FOR UPDATE")) {
      const row = this.jobs.get(Number(params[0]));
      return { rows: row ? [{ ...row }] : [] };
    }
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
        if (!grouped.has(mapKey)) {
          grouped.set(mapKey, {
            payout_id: row.payout_id,
            technician_username: row.technician_username,
            line_refs: 0,
            adjustment_refs: 0,
          });
        }
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
    if (s.startsWith("DELETE FROM public.job_photos")) {
      const jobId = Number(params[0]);
      const before = this.relatedRows.length;
      this.relatedRows = this.relatedRows.filter((r) => Number(r.job_id) !== jobId || r.table !== "job_photos");
      return { rows: [], rowCount: before - this.relatedRows.length };
    }
    if (s.startsWith("DELETE FROM public.jobs WHERE job_id=$1")) {
      const jobId = Number(params[0]);
      const existed = this.jobs.delete(jobId);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }
    throw new Error(`Unhandled SQL: ${s}`);
  }
}

const workMonthPeriods = [
  {
    payout_id: "payout_2026-06_25",
    period_type: "25",
    label_ym: "2026-06",
    work_month: "2026-06",
    start: new Date("2026-06-01T00:00:00.000Z"),
    endEx: new Date("2026-06-16T00:00:00.000Z"),
    period_end_display: "2026-06-15T23:59:59.999Z",
  },
  {
    payout_id: "payout_2026-07_10",
    period_type: "10",
    label_ym: "2026-07",
    work_month: "2026-06",
    start: new Date("2026-06-16T00:00:00.000Z"),
    endEx: new Date("2026-07-01T00:00:00.000Z"),
    period_end_display: "2026-06-30T23:59:59.999Z",
  },
];

function seedJuneFlowDb() {
  const db = new FakePayoutDb();
  db.jobs.set(501, { job_id: 501, booking_code: "CWF501" });
  db.jobs.set(502, { job_id: 502, booking_code: "CWF502" });
  for (const period of workMonthPeriods) {
    db.periods.set(period.payout_id, {
      payout_id: period.payout_id,
      status: "draft",
      period_start: period.start.toISOString(),
      period_end: period.endEx.toISOString(),
    });
  }
  db.lines.push(
    { payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "501", earn_amount: 1000 },
    { payout_id: "payout_2026-07_10", technician_username: "TECH", job_id: "502", earn_amount: 2000 },
  );
  db.adjustments.push({ adj_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH", job_id: "501", adj_amount: 100, reason: "bonus" });
  db.previews.push({ job_id: 501 }, { job_id: 502 });
  db.displays.push({ job_id: 501 }, { job_id: 502 });
  db.relatedRows.push({ table: "job_photos", job_id: 501 });
  return db;
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
    getProjectedDepositDeductionForPayout: async (_db, { payout_id, gross_amount, adj_total }) => {
      const hasIncome = Number(gross_amount || 0) + Number(adj_total || 0) > 0;
      const amount = hasIncome ? Number(deposits[payout_id] || 0) : 0;
      return {
        deposit_deduction_amount: amount,
        deposit_existing_collect_amount: amount,
        deposit_existing_collect_exists: amount > 0,
        deposit_projected: amount > 0,
        deposit_projection_reason: amount > 0 ? "test_projection" : "no_income",
        deposit_target_amount: 5000,
        deposit_collected_total: 0,
        deposit_collected_total_projected: amount,
        deposit_remaining_amount: 5000,
        deposit_remaining_amount_projected: 5000 - amount,
        deposit_is_required: true,
      };
    },
    paidStatus,
  };
}

function buildPeriodSummary(db, deposits = {}) {
  return (period, technicianUsername) => payoutIntegrity.buildTechnicianPayoutPeriodSummary({
    ...summaryDeps(db, deposits),
    period,
    technicianUsername,
  });
}

async function buildHistoryAndMonthly(db, deposits = {}) {
  const buildPeriod = buildPeriodSummary(db, deposits);
  const history = await payoutIntegrity.buildTechnicianPayoutRows({
    periods: workMonthPeriods,
    technicianUsername: "TECH",
    buildPeriodSummary: buildPeriod,
  });
  const monthly = await payoutIntegrity.buildTechnicianPayoutMonthTotal({
    periods: workMonthPeriods,
    technicianUsername: "TECH",
    payoutMonth: "2026-06",
    buildPeriodSummary: buildPeriod,
    monthlyIncomePeriodStart: workMonthPeriods[0].start.toISOString(),
    monthlyIncomePeriodEnd: workMonthPeriods[1].endEx.toISOString(),
    monthlyIncomePeriodEndDisplay: workMonthPeriods[1].period_end_display,
  });
  return { history, monthly };
}

function moneyFields(row) {
  return {
    gross_amount: row.gross_amount,
    adj_total: row.adj_total,
    deposit_deduction_amount: row.deposit_deduction_amount,
    net_amount: row.net_amount,
    paid_amount: row.paid_amount,
    paid_status: row.paid_status,
    remaining_amount: row.remaining_amount,
  };
}

class FakeCloseoutAuditClient {
  constructor({ periods = [], jobs = [], lines = [], adjustments = [], payments = [], deposits = [], previews = [], displays = [] } = {}) {
    this.periods = periods;
    this.jobs = new Set(jobs.map((id) => String(id)));
    this.lines = lines;
    this.adjustments = adjustments;
    this.payments = payments;
    this.deposits = deposits;
    this.previews = previews;
    this.displays = displays;
  }

  async query(sql, params = []) {
    const s = normSql(sql);
    const rowsForPayouts = (rows, technician, payoutIds) => rows
      .filter((row) => String(row.technician_username) === String(technician) && payoutIds.includes(String(row.payout_id)));
    if (s.includes("FROM public.technician_payout_periods")) {
      const payoutIds = params[0].map(String);
      return { rows: this.periods.filter((row) => payoutIds.includes(String(row.payout_id))).map((row) => ({ ...row })) };
    }
    if (s.includes("FROM public.technician_payout_lines l")) {
      const [technician, payoutIds] = params;
      return {
        rows: rowsForPayouts(this.lines, technician, payoutIds.map(String))
          .filter((row) => !this.jobs.has(String(row.job_id)))
          .map((row) => ({ ...row, job_id: String(row.job_id), earn_amount: Number(row.earn_amount || 0) })),
      };
    }
    if (s.includes("FROM public.technician_payout_lines")) {
      const [technician, payoutIds] = params;
      return {
        rows: rowsForPayouts(this.lines, technician, payoutIds.map(String))
          .map((row) => ({ ...row, job_id: String(row.job_id), earn_amount: Number(row.earn_amount || 0) })),
      };
    }
    if (s.includes("FROM public.technician_payout_adjustments a")) {
      const [technician, payoutIds] = params;
      return {
        rows: rowsForPayouts(this.adjustments, technician, payoutIds.map(String))
          .filter((row) => row.job_id != null && !this.jobs.has(String(row.job_id)))
          .map((row) => ({ ...row, job_id: String(row.job_id), adj_amount: Number(row.adj_amount || 0) })),
      };
    }
    if (s.includes("FROM public.technician_payout_adjustments")) {
      const [technician, payoutIds] = params;
      return {
        rows: rowsForPayouts(this.adjustments, technician, payoutIds.map(String))
          .map((row) => ({ ...row, job_id: row.job_id == null ? null : String(row.job_id), adj_amount: Number(row.adj_amount || 0) })),
      };
    }
    if (s.includes("FROM public.technician_payout_payments")) {
      const [technician, payoutIds] = params;
      return { rows: rowsForPayouts(this.payments, technician, payoutIds.map(String)).map((row) => ({ ...row })) };
    }
    if (s.includes("FROM public.technician_deposit_ledger")) {
      const [technician, payoutIds] = params;
      return { rows: rowsForPayouts(this.deposits, technician, payoutIds.map(String)).map((row) => ({ ...row })) };
    }
    if (s.includes("FROM public.job_technician_income_preview")) {
      const [technician] = params;
      return {
        rows: this.previews
          .filter((row) => String(row.technician_username) === String(technician) && !this.jobs.has(String(row.job_id)))
          .map((row) => ({ ...row, job_id: String(row.job_id), income_amount: Number(row.income_amount || 0) })),
      };
    }
    if (s.includes("FROM public.technician_job_income_display")) {
      const [technician] = params;
      return {
        rows: this.displays
          .filter((row) => String(row.technician_username) === String(technician) && !this.jobs.has(String(row.job_id)))
          .map((row) => ({ ...row, job_id: String(row.job_id), display_amount: Number(row.display_amount || 0) })),
      };
    }
    throw new Error(`Unhandled closeout audit SQL: ${s}`);
  }
}

async function summarizeCloseoutWithFakeClient(data) {
  const original = depositCollections.getProjectedDepositDeductionForPayout;
  depositCollections.getProjectedDepositDeductionForPayout = async (_client, { gross_amount, adj_total }) => ({
    deposit_deduction_amount: 0,
    deposit_projection_reason: Number(gross_amount || 0) + Number(adj_total || 0) > 0 ? "test_no_deduction" : "no_income",
  });
  try {
    return await closeoutAudit.summarizeAudit(new FakeCloseoutAuditClient(data), {
      technician: "0661479791",
      workMonth: "2026-06",
    });
  } finally {
    depositCollections.getProjectedDepositDeductionForPayout = original;
  }
}

async function assertMutableForPayout(db, jobId, context, calls) {
  calls.push({ jobId, context });
  const impact = await payoutIntegrity.inspectJobPayoutDeleteImpact(db, jobId);
  if (impact.blockers.length) {
    const err = new Error("PAYOUT_DELETE_BLOCKED");
    err.statusCode = 409;
    err.code = "PAYOUT_DELETE_BLOCKED";
    err.details = impact.blockers;
    throw err;
  }
}

async function deleteJobLikeRoute(db, { jobId, context, legacy = false, calls = [] } = {}) {
  await db.query("BEGIN");
  try {
    const job = await db.query(
      `SELECT job_id, booking_code FROM public.jobs WHERE job_id=$1 FOR UPDATE`,
      [jobId],
    );
    if (!job.rows.length) {
      const err = new Error("job not found");
      err.statusCode = 404;
      throw err;
    }
    const hardDelete = await payoutIntegrity.runJobHardDeletePayoutFlow({
      db,
      jobId,
      context,
      assertJobMutableForPayout: (guardDb, guardJobId, guardContext) => assertMutableForPayout(guardDb, guardJobId, guardContext, calls),
      deleteRelatedRows: async (deleteDb, hardDeleteJobId) => {
        await deleteDb.query(`DELETE FROM public.job_photos WHERE job_id=$1`, [hardDeleteJobId]);
      },
    });
    await db.query("COMMIT");
    return {
      status: 200,
      body: legacy
        ? { success: true, deleted: hardDelete.deleted, payout_cleanup: hardDelete.payout_cleanup }
        : { ok: true, deleted: hardDelete.deleted, payout_cleanup: hardDelete.payout_cleanup },
    };
  } catch (err) {
    await db.query("ROLLBACK");
    return {
      status: Number(err.statusCode || err.status || 400),
      body: { error: err.message, code: err.code, details: err.details },
    };
  }
}

test("period summary uses gross + one adjustment - one deposit and exposes matching detail net", async () => {
  const db = seedJuneFlowDb();
  const detail = await buildPeriodSummary(db, { "payout_2026-06_25": 50 })(workMonthPeriods[0], "TECH");

  assert.equal(detail.gross_amount, 1000);
  assert.equal(detail.adj_total, 100);
  assert.equal(detail.deposit_deduction_amount, 50);
  assert.equal(detail.net_amount, 1050);
  assert.equal(detail.payout_month_net_amount, 1050);
  assert.equal(detail.lines_count, 1);
});

test("monthly income display equals the sum of both /tech/payouts period net amounts", async () => {
  const db = seedJuneFlowDb();
  const deposits = { "payout_2026-06_25": 50, "payout_2026-07_10": 100 };
  const { history, monthly } = await buildHistoryAndMonthly(db, deposits);
  const detail25 = await buildPeriodSummary(db, deposits)(workMonthPeriods[0], "TECH");
  const historyNet = history.reduce((sum, row) => sum + Number(row.net_amount || 0), 0);

  assert.equal(monthly.monthly_income_display_amount, historyNet);
  assert.equal(monthly.payout_month_net_total, historyNet);
  assert.equal(historyNet, 2950);
  assert.equal(monthly.periods[0].period_start, "2026-06-01T00:00:00.000Z");
  assert.equal(monthly.periods[0].period_end, "2026-06-16T00:00:00.000Z");
  assert.equal(monthly.periods[1].period_start, "2026-06-16T00:00:00.000Z");
  assert.equal(monthly.periods[1].period_end, "2026-07-01T00:00:00.000Z");

  const history25 = history.find((row) => row.payout_id === "payout_2026-06_25");
  const month25 = monthly.periods.find((row) => row.payout_id === "payout_2026-06_25");
  assert.deepEqual(moneyFields(history25), moneyFields(detail25));
  assert.deepEqual(moneyFields(month25), moneyFields(detail25));
});

test("active admin hard delete removes draft job payout lines adjustments and income displays in one transaction", async () => {
  const db = seedJuneFlowDb();
  const deposits = { "payout_2026-06_25": 50, "payout_2026-07_10": 100 };
  const before = await buildHistoryAndMonthly(db, deposits);
  const calls = [];

  const result = await deleteJobLikeRoute(db, {
    jobId: 501,
    context: "admin_delete_job_primary",
    calls,
  });
  const after = await buildHistoryAndMonthly(db, deposits);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.deleted, 1);
  assert.equal(result.body.payout_cleanup.deleted_payout_lines, 1);
  assert.equal(result.body.payout_cleanup.deleted_payout_adjustments, 1);
  assert.equal(result.body.payout_cleanup.deleted_income_previews, 1);
  assert.equal(result.body.payout_cleanup.deleted_income_display_rows, 1);
  assert.deepEqual(calls, [{ jobId: 501, context: "admin_delete_job_primary" }]);
  assert.equal(db.jobs.has(501), false);
  assert.equal(db.lines.some((row) => String(row.job_id) === "501"), false);
  assert.equal(db.adjustments.some((row) => String(row.job_id) === "501"), false);
  assert.equal(db.previews.some((row) => Number(row.job_id) === 501), false);
  assert.equal(db.displays.some((row) => Number(row.job_id) === 501), false);
  assert.equal(db.relatedRows.some((row) => Number(row.job_id) === 501), false);
  assert.equal(db.jobs.has(502), true);
  assert.equal(before.monthly.monthly_income_display_amount, 2950);
  assert.equal(after.monthly.monthly_income_display_amount, 1900);
  assert.equal(after.history.reduce((sum, row) => sum + Number(row.net_amount || 0), 0), 1900);
});

test("locked payout hard delete returns 409 before delete and leaves all rows intact", async () => {
  const db = seedJuneFlowDb();
  db.periods.set("payout_2026-06_25", {
    ...db.periods.get("payout_2026-06_25"),
    status: "locked",
  });
  const before = db.snapshot();

  const result = await deleteJobLikeRoute(db, {
    jobId: 501,
    context: "admin_delete_job_primary",
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, "PAYOUT_DELETE_BLOCKED");
  assert.equal(db.jobs.has(501), true);
  assert.deepEqual(db.snapshot(), before);
});

test("payment-linked payout hard delete returns 409 before delete and leaves all rows intact", async () => {
  const db = seedJuneFlowDb();
  db.payments.push({
    payment_id: 7,
    payout_id: "payout_2026-06_25",
    technician_username: "TECH",
    paid_amount: 0,
    paid_status: "unpaid",
  });
  const before = db.snapshot();

  const result = await deleteJobLikeRoute(db, {
    jobId: 501,
    context: "admin_delete_job_primary",
  });

  assert.equal(result.status, 409);
  assert.equal(result.body.code, "PAYOUT_DELETE_BLOCKED");
  assert.equal(db.jobs.has(501), true);
  assert.deepEqual(db.snapshot(), before);
});

test("legacy admin-delete route uses the same hard-delete payout flow behavior", async () => {
  const db = seedJuneFlowDb();
  const deposits = { "payout_2026-06_25": 50, "payout_2026-07_10": 100 };
  const calls = [];

  const result = await deleteJobLikeRoute(db, {
    jobId: 501,
    context: "legacy_admin_delete_job",
    legacy: true,
    calls,
  });
  const after = await buildHistoryAndMonthly(db, deposits);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.deleted, 1);
  assert.deepEqual(calls, [{ jobId: 501, context: "legacy_admin_delete_job" }]);
  assert.equal(db.jobs.has(501), false);
  assert.equal(after.monthly.monthly_income_display_amount, 1900);
});

test("orphan payout audit is read-only, classifies rows, and normalizes limit", () => {
  const sql = payoutIntegrity.orphanPayoutLinesAuditSql({ limit: "50.5" });
  assert.match(sql, /SELECT l\.payout_id/);
  assert.match(sql, /classification/);
  assert.match(sql, /draft\/unpaid-safe-to-clean/);
  assert.match(sql, /locked\/paid\/payment-linked-reconciliation-required/);
  assert.match(sql, /LIMIT 50\b/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bALTER\b|\bDROP\b/i);
  assert.equal(payoutIntegrity.positiveInteger("0"), 1);
  assert.equal(payoutIntegrity.positiveInteger("10001", 200, 10000), 10000);
  assert.deepEqual(auditScript.parseArgs(["--limit=50.5", "--allow-production-read"]), {
    run: false,
    json: false,
    apply: false,
    limit: 50,
  });
  assert.equal(auditScript.shouldRefuseProductionExecution({ NODE_ENV: "production" }), true);
  assert.equal(auditScript.shouldRefuseProductionExecution({ NODE_ENV: "test" }), false);
});

test("issue 149 closeout audit targets the June work-month payout ids and production read flag", () => {
  assert.deepEqual(closeoutAudit.payoutIdsForWorkMonth("2026-06"), ["payout_2026-06_25", "payout_2026-07_10"]);
  assert.equal(closeoutAudit.classify({
    period: { status: "draft" },
    payment: null,
  }), "draft/unpaid-safe-to-clean");
  assert.equal(closeoutAudit.classify({
    period: { status: "locked" },
    payment: null,
  }), "locked/paid/payment-linked-reconciliation-required");
  assert.equal(closeoutAudit.classify({
    period: { status: "draft" },
    payment: { payment_id: 12, paid_amount: 0, paid_status: "unpaid" },
  }), "locked/paid/payment-linked-reconciliation-required");
  assert.match(closeoutAudit.dryRunText({ technician: "0661479791", workMonth: "2026-06" }), /--allow-production-read/);
});

test("issue 149 closeout summarizeAudit runs with no orphan rows", async () => {
  const result = await summarizeCloseoutWithFakeClient({
    periods: [
      { payout_id: "payout_2026-06_25", status: "draft" },
      { payout_id: "payout_2026-07_10", status: "draft" },
    ],
    jobs: ["501"],
    lines: [
      { line_id: 1, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "501", earn_amount: 700 },
    ],
    previews: [
      { id: 1, job_id: "999", technician_username: "0661479791", income_amount: 999 },
    ],
    displays: [
      { id: 2, job_id: "999", technician_username: "0661479791", display_amount: 999 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.orphan_rows.length, 0);
  assert.equal(result.totals.orphan_rows, 0);
  assert.deepEqual(result.cache_orphan_rows.job_technician_income_preview, []);
  assert.deepEqual(result.cache_orphan_rows.technician_job_income_display, []);
  assert.equal(result.current_by_payout["payout_2026-06_25"].net_amount, 700);
});

test("issue 149 closeout summarizeAudit reports draft orphan rows and scoped cache impact", async () => {
  const result = await summarizeCloseoutWithFakeClient({
    periods: [
      { payout_id: "payout_2026-06_25", status: "draft" },
      { payout_id: "payout_2026-07_10", status: "draft" },
    ],
    jobs: [],
    lines: [
      { line_id: 11, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "501", earn_amount: 1000 },
    ],
    adjustments: [
      { adj_id: 20, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "501", adj_amount: 100 },
    ],
    previews: [
      { id: 1, job_id: "501", technician_username: "0661479791", income_amount: 1100 },
      { id: 2, job_id: "999", technician_username: "0661479791", income_amount: 999 },
    ],
    displays: [
      { id: 3, job_id: "501", technician_username: "0661479791", display_amount: 1100 },
      { id: 4, job_id: "999", technician_username: "0661479791", display_amount: 999 },
    ],
  });

  assert.equal(result.orphan_rows.length, 1);
  assert.equal(result.orphan_rows[0].classification, "draft/unpaid-safe-to-clean");
  assert.deepEqual(result.orphan_rows[0].line_ids, [11]);
  assert.equal(result.orphan_rows[0].orphan_payout_line_amount, 1000);
  assert.equal(result.orphan_rows[0].linked_adjustment_amount, 100);
  assert.deepEqual(result.orphan_rows[0].adjustment_ids, [20]);
  assert.deepEqual(result.cache_orphan_rows.job_technician_income_preview.map((row) => row.job_id), ["501"]);
  assert.deepEqual(result.cache_orphan_rows.technician_job_income_display.map((row) => row.job_id), ["501"]);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-06_25"].expected_gross_amount_after_safe_cleanup, 0);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-06_25"].expected_adj_total_after_safe_cleanup, 0);
});

test("issue 149 closeout summarizeAudit classifies locked and payment-linked orphans as reconciliation-required", async () => {
  const result = await summarizeCloseoutWithFakeClient({
    periods: [
      { payout_id: "payout_2026-06_25", status: "locked" },
      { payout_id: "payout_2026-07_10", status: "draft" },
    ],
    jobs: [],
    lines: [
      { line_id: 21, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "601", earn_amount: 800 },
      { line_id: 22, payout_id: "payout_2026-07_10", technician_username: "0661479791", job_id: "602", earn_amount: 900 },
    ],
    payments: [
      { payment_id: 30, payout_id: "payout_2026-07_10", technician_username: "0661479791", paid_amount: 0, paid_status: "unpaid", paid_at: null },
    ],
  });

  assert.equal(result.orphan_rows.length, 2);
  assert.deepEqual(result.orphan_rows.map((row) => row.classification), [
    "locked/paid/payment-linked-reconciliation-required",
    "locked/paid/payment-linked-reconciliation-required",
  ]);
  assert.equal(result.totals.by_classification["locked/paid/payment-linked-reconciliation-required"].rows, 2);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-06_25"].expected_gross_amount_after_safe_cleanup, 800);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-07_10"].expected_gross_amount_after_safe_cleanup, 900);
});

test("issue 149 closeout summarizeAudit dedupes one linked adjustment across multiple orphan payout lines", async () => {
  const result = await summarizeCloseoutWithFakeClient({
    periods: [
      { payout_id: "payout_2026-06_25", status: "draft" },
      { payout_id: "payout_2026-07_10", status: "draft" },
    ],
    jobs: [],
    lines: [
      { line_id: 41, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "701", earn_amount: 600 },
      { line_id: 42, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "701", earn_amount: 400 },
    ],
    adjustments: [
      { adj_id: 50, payout_id: "payout_2026-06_25", technician_username: "0661479791", job_id: "701", adj_amount: 100 },
    ],
  });

  assert.equal(result.orphan_rows.length, 1);
  assert.equal(result.orphan_rows[0].line_id, null);
  assert.deepEqual(result.orphan_rows[0].line_ids, [41, 42]);
  assert.deepEqual(result.orphan_rows[0].adjustment_ids, [50]);
  assert.equal(result.orphan_rows[0].orphan_payout_line_amount, 1000);
  assert.equal(result.orphan_rows[0].linked_adjustment_amount, 100);
  assert.equal(result.totals.linked_adjustment_amount, 100);
  assert.equal(result.totals.net_impact, 1100);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-06_25"].expected_gross_amount_after_safe_cleanup, 0);
  assert.equal(result.expected_after_safe_cleanup_by_payout["payout_2026-06_25"].expected_adj_total_after_safe_cleanup, 0);
});

test("issue 149 remediation plan emits only targeted cleanup SQL and keeps B rows as reconciliation comments", () => {
  const plan = remediationPlan.buildPlan({
    ok: true,
    technician_username: "0661479791",
    work_month: "2026-06",
    payout_ids: ["payout_2026-06_25", "payout_2026-07_10"],
    current_by_payout: {
      "payout_2026-06_25": {
        gross_amount: 1000,
        adj_total: 100,
        deposit_deduction_amount: 500,
        net_amount: 600,
        paid_amount: 0,
        period_status: "draft",
        payment_id: null,
      },
    },
    expected_after_safe_cleanup_by_payout: {
      "payout_2026-06_25": {
        expected_gross_amount_after_safe_cleanup: 0,
        expected_adj_total_after_safe_cleanup: 0,
        expected_deposit_deduction_amount_after_safe_cleanup: 0,
        expected_net_amount_after_safe_cleanup: 0,
      },
    },
    orphan_rows: [
      {
        classification: "draft/unpaid-safe-to-clean",
        payout_id: "payout_2026-06_25",
        technician_username: "0661479791",
        job_id: "501",
        line_id: null,
        line_ids: [10, 11],
        adjustment_ids: [20],
        orphan_payout_line_amount: 1000,
        linked_adjustment_amount: 100,
        deposit_impact: 500,
        net_impact: 600,
      },
      {
        classification: "locked/paid/payment-linked-reconciliation-required",
        payout_id: "payout_2026-07_10",
        technician_username: "0661479791",
        job_id: "502",
        payment_id: 30,
        paid_status: "paid",
        paid_amount: 900,
        orphan_payout_line_amount: 900,
        linked_adjustment_amount: 0,
        deposit_impact: 0,
        net_impact: 900,
      },
    ],
  });

  assert.match(plan, /WHERE payout_id='payout_2026-06_25'\s+AND technician_username='0661479791'\s+AND job_id::text='501'/);
  assert.match(plan, /NOT EXISTS \(SELECT 1 FROM public\.jobs/);
  assert.match(plan, /pg_advisory_xact_lock\(hashtext\('issue-149-remediation:payout_2026-06_25:0661479791'\)\)/);
  assert.match(plan, /FOR UPDATE/);
  assert.match(plan, /lower\(COALESCE\(v_period_status,'draft'\)\) <> 'draft'/);
  assert.match(plan, /pay\.payment_id IS NOT NULL/);
  assert.match(plan, /COALESCE\(pay\.paid_amount,0\) <> 0/);
  assert.match(plan, /COALESCE\(pay\.paid_status,''\) <> ''/);
  assert.match(plan, /pay\.paid_at IS NOT NULL/);
  assert.match(plan, /IF v_line_count <> 2 OR v_line_total <> 1000::numeric THEN/);
  assert.match(plan, /IF v_adjustment_count <> 1 OR v_adjustment_total <> 100::numeric THEN/);
  assert.match(plan, /RAISE EXCEPTION 'Issue 149 cleanup blocked: payout line mismatch/);
  assert.match(plan, /RAISE EXCEPTION 'Issue 149 cleanup blocked: adjustment mismatch/);
  assert.match(plan, /before_total payout=payout_2026-06_25 gross=1000 adj=100 deposit=500 net=600/);
  assert.match(plan, /expected_after_safe_cleanup payout=payout_2026-06_25 gross=0 adj=0 deposit=0 net=0/);
  assert.match(plan, /expected_after lines=0 total=0, adjustments=0 total=0/);
  assert.match(plan, /ROLLBACK; -- default safety/);
  assert.match(plan, /B reconciliation required/);
  assert.doesNotMatch(plan, /DELETE FROM public\.technician_payout_lines\s*;/);
  assert.doesNotMatch(plan, /DELETE FROM public\.technician_payout_adjustments\s*;/);
});
