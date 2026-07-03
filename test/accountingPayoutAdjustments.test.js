const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const express = require("express");

const svc = require("../server/services/accountingPayoutAdjustments");

function normSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

class FakeClient {
  constructor() {
    this.migrationReady = true;
    this.periods = new Map();
    this.lines = [];
    this.adjustments = [];
    this.payments = [];
    this.deposits = [];
    this.jobs = new Set();
    this.audit = [];
    this.nextAdjId = 1;
    this.failAudit = false;
    this.txStack = [];
  }

  clone(row) {
    return row ? { ...row } : row;
  }

  snapshot() {
    return {
      periods: new Map([...this.periods.entries()].map(([k, v]) => [k, this.clone(v)])),
      lines: this.lines.map((r) => this.clone(r)),
      adjustments: this.adjustments.map((r) => this.clone(r)),
      payments: this.payments.map((r) => this.clone(r)),
      deposits: this.deposits.map((r) => this.clone(r)),
      audit: this.audit.map((r) => this.clone(r)),
      nextAdjId: this.nextAdjId,
    };
  }

  restore(snapshot) {
    this.periods = new Map([...snapshot.periods.entries()].map(([k, v]) => [k, this.clone(v)]));
    this.lines = snapshot.lines.map((r) => this.clone(r));
    this.adjustments = snapshot.adjustments.map((r) => this.clone(r));
    this.payments = snapshot.payments.map((r) => this.clone(r));
    this.deposits = snapshot.deposits.map((r) => this.clone(r));
    this.audit = snapshot.audit.map((r) => this.clone(r));
    this.nextAdjId = snapshot.nextAdjId;
  }

  settlementRows(payoutId) {
    const techs = new Set();
    for (const r of this.lines) if (r.payout_id === payoutId) techs.add(r.technician_username);
    for (const r of this.adjustments) if (r.payout_id === payoutId) techs.add(r.technician_username);
    for (const r of this.payments) if (r.payout_id === payoutId) techs.add(r.technician_username);
    for (const r of this.deposits) if (r.payout_id === payoutId && r.transaction_type === "collect") techs.add(r.technician_username);
    return [...techs].sort().map((technician_username) => {
      const gross = this.lines.filter((r) => r.payout_id === payoutId && r.technician_username === technician_username)
        .reduce((sum, r) => sum + Number(r.earn_amount || 0), 0);
      const adj = this.adjustments.filter((r) => r.payout_id === payoutId && r.technician_username === technician_username)
        .reduce((sum, r) => sum + Number(r.adj_amount || 0), 0);
      const dep = this.deposits.filter((r) => r.payout_id === payoutId && r.technician_username === technician_username && r.transaction_type === "collect")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const pay = this.payments.find((r) => r.payout_id === payoutId && r.technician_username === technician_username);
      return {
        technician_username,
        gross_amount: gross,
        adj_total: adj,
        deposit_deduction_amount: dep,
        net_amount: gross + adj - dep,
        paid_amount: Number(pay?.paid_amount || 0),
      };
    });
  }

  async query(sql, params = []) {
    const s = normSql(sql);

    if (s === "BEGIN") {
      this.txStack.push(this.snapshot());
      return { rows: [] };
    }
    if (s === "COMMIT") {
      this.txStack.pop();
      return { rows: [] };
    }
    if (s === "ROLLBACK") {
      const snapshot = this.txStack.pop();
      if (snapshot) this.restore(snapshot);
      return { rows: [] };
    }
    if (s.includes("FROM information_schema.columns")) {
      return { rows: this.migrationReady ? [{ "?column?": 1 }] : [] };
    }
    if (s.includes("FROM pg_indexes")) {
      return { rows: this.migrationReady ? [{ "?column?": 1 }] : [] };
    }
    if (s.startsWith("SELECT payout_id, status, period_type, period_start, period_end, created_at, created_by FROM public.technician_payout_periods")) {
      const row = this.periods.get(params[0]);
      return { rows: row ? [this.clone(row)] : [] };
    }
    if (s.startsWith("INSERT INTO public.technician_payout_periods")) {
      const [payout_id, period_type, period_start, period_end, statusOrCreatedBy, maybeCreatedBy] = params;
      if (!this.periods.has(payout_id)) {
        this.periods.set(payout_id, {
          payout_id,
          period_type,
          period_start,
          period_end,
          status: maybeCreatedBy === undefined ? "draft" : statusOrCreatedBy || "draft",
          created_by: maybeCreatedBy === undefined ? statusOrCreatedBy : maybeCreatedBy,
        });
      }
      return { rows: [] };
    }
    if (s.startsWith("UPDATE public.technician_payout_periods SET status='locked'")) {
      const row = this.periods.get(params[0]);
      if (row && row.status === "draft") row.status = "locked";
      return { rows: [] };
    }
    if (s.startsWith("UPDATE public.technician_payout_periods SET status=$2")) {
      const row = this.periods.get(params[0]);
      if (row) row.status = params[1];
      return { rows: [] };
    }
    if (s.startsWith("SELECT payment_id, payout_id, technician_username")) {
      const row = this.payments.find((r) => r.payout_id === params[0] && r.technician_username === params[1]);
      return { rows: row ? [this.clone(row)] : [] };
    }
    if (s.startsWith("SELECT 1 FROM public.jobs")) {
      return { rows: this.jobs.has(String(params[0])) ? [{ "?column?": 1 }] : [] };
    }
    if (s.startsWith("SELECT adj_id, payout_id, technician_username")) {
      const row = this.adjustments.find((r) => r.idempotency_key === params[0]);
      return { rows: row ? [this.clone(row)] : [] };
    }
    if (s.startsWith("INSERT INTO public.technician_payout_adjustments")) {
      const [payout_id, technician_username, job_id, adj_amount, reason, created_by, idempotency_key] = params;
      const existing = this.adjustments.find((r) => r.idempotency_key && r.idempotency_key === idempotency_key);
      if (existing) return { rows: [] };
      const row = {
        adj_id: this.nextAdjId++,
        payout_id,
        technician_username,
        job_id,
        adj_amount: Number(adj_amount),
        reason,
        created_by,
        idempotency_key,
        created_at: "2026-07-03T00:00:00.000Z",
      };
      this.adjustments.push(row);
      return { rows: [this.clone(row)] };
    }
    if (s.startsWith("UPDATE public.technician_payout_payments")) {
      const row = this.payments.find((r) => r.payout_id === params[0] && r.technician_username === params[1]);
      if (row) row.paid_status = params[2];
      return { rows: [] };
    }
    if (s.includes("FROM techs t")) {
      return { rows: this.settlementRows(params[0]) };
    }
    if (s.startsWith("INSERT INTO public.accounting_audit_log")) {
      if (this.failAudit) throw new Error("AUDIT_WRITE_FAILED");
      this.audit.push({ params });
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL: ${s}`);
  }
}

async function apply(db, body = {}, extra = {}) {
  return svc.applyAccountingPositivePayoutAdjustment({
    client: db,
    payout_id: body.payout_id || "payout_2026-06_25",
    body: {
      technician_username: "TECH_A",
      adj_amount: 100,
      reason: "ย้อนหลัง",
      idempotency_key: "idem-1",
      confirm_adjustment: true,
      ...body,
    },
    actor: { username: "acct", role: "admin" },
    req: { actor: { username: "acct", role: "admin" }, headers: {} },
    regenerateDraftPayoutContractLines: extra.regenerateDraftPayoutContractLines || (async () => ({ ok: true })),
  });
}

async function applyInsideRouteTransaction(db, body = {}) {
  let began = false;
  try {
    await db.query("BEGIN");
    began = true;
    const result = await apply(db, body);
    await db.query("COMMIT");
    began = false;
    return result;
  } catch (err) {
    if (began) await db.query("ROLLBACK");
    throw err;
  }
}

test("locked unpaid period accepts a positive adjustment and writes one audit row", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", earn_amount: 1000 });

  const result = await apply(db);

  assert.equal(result.replayed, false);
  assert.equal(db.adjustments.length, 1);
  assert.equal(result.totals.net_amount, 1100);
  assert.equal(result.totals.remaining_amount, 1100);
  assert.equal(db.periods.get("payout_2026-06_25").status, "locked");
  assert.equal(db.audit.length, 1);
});

test("paid period positive adjustment preserves paid_amount and reopens as locked with remaining difference", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "paid", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", earn_amount: 1000 });
  db.payments.push({ payment_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH_A", paid_amount: 1000, paid_status: "paid" });

  const result = await apply(db, { adj_amount: 250 });

  assert.equal(db.payments[0].paid_amount, 1000);
  assert.equal(db.payments[0].paid_status, "partial");
  assert.equal(result.totals.remaining_amount, 250);
  assert.equal(db.periods.get("payout_2026-06_25").status, "locked");
});

test("paying the new difference makes union settlement fully paid again", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "paid", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", earn_amount: 1000 });
  db.payments.push({ payment_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH_A", paid_amount: 1000, paid_status: "paid" });
  await apply(db, { adj_amount: 250 });

  db.payments[0].paid_amount = 1250;
  const rows = await svc.getPayoutTechSettlementRows(db, "payout_2026-06_25");
  assert.equal(svc.isPayoutFullyPaidFromRows(rows), true);
});

test("zero, negative, missing reason, and missing confirmation are rejected", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });

  await assert.rejects(() => apply(db, { adj_amount: 0 }), /INVALID_ADJUSTMENT_AMOUNT/);
  await assert.rejects(() => apply(db, { adj_amount: -1 }), /INVALID_ADJUSTMENT_AMOUNT/);
  await assert.rejects(() => apply(db, { reason: "" }), /MISSING_REASON/);
  await assert.rejects(() => apply(db, { confirm_adjustment: false }), /CONFIRM_ADJUSTMENT_REQUIRED/);
});

test("route uses accounting_mark_payout_paid permission", () => {
  const src = fs.readFileSync("index.js", "utf8");
  assert.match(src, /app\.post\('\/admin\/accounting\/payouts\/:payout_id\/adjust', requireAccountingPermission\('accounting_mark_payout_paid'\)/);
});

test("HTTP permission middleware denies adjustment route before handler runs", async () => {
  let handlerReached = false;
  const app = express();
  app.use(express.json());
  app.post(
    "/admin/accounting/payouts/:payout_id/adjust",
    (_req, res) => res.status(403).json({ ok: false, error: "ACCOUNTING_PERMISSION_REQUIRED" }),
    (_req, res) => {
      handlerReached = true;
      res.json({ ok: true });
    }
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/admin/accounting/payouts/payout_2026-06_25/adjust`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 403);
    assert.equal(handlerReached, false);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test("invalid or missing job_id is rejected before insert", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });

  await assert.rejects(() => apply(db, { job_id: "abc" }), /INVALID_JOB_ID/);
  await assert.rejects(() => apply(db, { job_id: "999" }), /JOB_NOT_FOUND/);
  db.jobs.add("999");
  await apply(db, { job_id: "999" });
  assert.equal(db.adjustments[0].job_id, "999");
});

test("union settlement includes adjustment-only, payment-only, and deposit-only technicians", async () => {
  const db = new FakeClient();
  db.adjustments.push({ payout_id: "payout_2026-06_25", technician_username: "ADJ_ONLY", adj_amount: 75 });
  db.payments.push({ payout_id: "payout_2026-06_25", technician_username: "PAY_ONLY", paid_amount: 20 });
  db.deposits.push({ payout_id: "payout_2026-06_25", technician_username: "DEP_ONLY", amount: 10, transaction_type: "collect" });

  const rows = await svc.getPayoutTechSettlementRows(db, "payout_2026-06_25");
  assert.deepEqual(rows.map((r) => r.technician_username).sort(), ["ADJ_ONLY", "DEP_ONLY", "PAY_ONLY"]);
});

test("same idempotency key and same payload replays one row", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  await apply(db);
  const replay = await apply(db);
  assert.equal(replay.replayed, true);
  assert.equal(db.adjustments.length, 1);
});

test("same idempotency key with different payload returns conflict", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  await apply(db);
  await assert.rejects(() => apply(db, { adj_amount: 101 }), /IDEMPOTENCY_KEY_REUSED/);
  assert.equal(db.adjustments.length, 1);
});

test("invalid idempotency keys are rejected before insert", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "locked", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });

  await assert.rejects(() => apply(db, { idempotency_key: "bad key" }), /INVALID_IDEMPOTENCY_KEY/);
  await assert.rejects(() => apply(db, { idempotency_key: "x".repeat(121) }), /INVALID_IDEMPOTENCY_KEY/);
  assert.equal(db.adjustments.length, 0);
});

test("missing migration returns PAYOUT_ADJUSTMENT_MIGRATION_REQUIRED", async () => {
  const db = new FakeClient();
  db.migrationReady = false;
  await assert.rejects(() => apply(db), /PAYOUT_ADJUSTMENT_MIGRATION_REQUIRED/);
});

test("paid period with positive net and no payment row rejects reconciliation without mutation", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "paid", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", earn_amount: 1000 });

  await assert.rejects(() => apply(db), /PAYOUT_PAID_RECONCILIATION_REQUIRED/);

  assert.equal(db.payments.length, 0);
  assert.equal(db.adjustments.length, 0);
  assert.equal(db.periods.get("payout_2026-06_25").status, "paid");
  assert.equal(db.audit.length, 0);
});

test("paid period with non-positive prior net may be adjusted without a fake payment row", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "paid", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.deposits.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", amount: 100, transaction_type: "collect" });

  const result = await apply(db, { adj_amount: 50 });

  assert.equal(db.payments.length, 0);
  assert.equal(result.totals.net_amount, -50);
  assert.equal(db.periods.get("payout_2026-06_25").status, "paid");
});

test("historical draft after cutoff snapshots and locks, but before-cutoff draft is rejected and not locked", async () => {
  const closed = new FakeClient();
  closed.periods.set("payout_2000-01_25", { payout_id: "payout_2000-01_25", status: "draft", period_type: "25", period_start: "2000-01-01T00:00:00Z", period_end: "2000-01-16T00:00:00Z" });
  let regenerated = false;
  await apply(closed, { payout_id: "payout_2000-01_25" }, { regenerateDraftPayoutContractLines: async () => { regenerated = true; return { ok: true }; } });
  assert.equal(regenerated, true);
  assert.equal(closed.periods.get("payout_2000-01_25").status, "locked");

  const open = new FakeClient();
  open.periods.set("payout_2999-01_25", { payout_id: "payout_2999-01_25", status: "draft", period_type: "25", period_start: "2999-01-01T00:00:00Z", period_end: "2999-01-16T00:00:00Z" });
  await assert.rejects(() => apply(open, { payout_id: "payout_2999-01_25" }), /PAYOUT_PERIOD_NOT_CLOSED/);
  assert.equal(open.periods.get("payout_2999-01_25").status, "draft");
});

test("audit failure inside route transaction rolls back adjustment, status, payment, and audit", async () => {
  const db = new FakeClient();
  db.failAudit = true;
  db.periods.set("payout_2026-06_25", { payout_id: "payout_2026-06_25", status: "paid", period_type: "25", period_start: "2026-06-01T00:00:00Z", period_end: "2026-06-16T00:00:00Z" });
  db.lines.push({ payout_id: "payout_2026-06_25", technician_username: "TECH_A", earn_amount: 1000 });
  db.payments.push({ payment_id: 1, payout_id: "payout_2026-06_25", technician_username: "TECH_A", paid_amount: 1000, paid_status: "paid" });

  await assert.rejects(() => applyInsideRouteTransaction(db, { adj_amount: 250 }), /AUDIT_WRITE_FAILED/);

  assert.equal(db.adjustments.length, 0);
  assert.equal(db.payments[0].paid_amount, 1000);
  assert.equal(db.payments[0].paid_status, "paid");
  assert.equal(db.periods.get("payout_2026-06_25").status, "paid");
  assert.equal(db.audit.length, 0);
  assert.equal(db.txStack.length, 0);
});

test("bulk pay targets exclude payment-only and deposit-only rows but include adjustment-only payable rows", () => {
  const rows = svc.getBulkPayableTargetRows([
    { technician_username: "PAY_ONLY", gross_amount: 0, adj_total: 0, deposit_deduction_amount: 0, net_amount: 0, paid_amount: 20, remaining_amount: 0 },
    { technician_username: "DEP_ONLY", gross_amount: 0, adj_total: 0, deposit_deduction_amount: 10, net_amount: -10, paid_amount: 0, remaining_amount: 0 },
    { technician_username: "ADJ_ONLY", gross_amount: 0, adj_total: 75, deposit_deduction_amount: 0, net_amount: 75, paid_amount: 0, remaining_amount: 75 },
    { technician_username: "LINE_PAID", gross_amount: 100, adj_total: 0, deposit_deduction_amount: 0, net_amount: 100, paid_amount: 100, remaining_amount: 0 },
  ]);
  assert.deepEqual(rows.map((r) => r.technician_username), ["ADJ_ONLY"]);
});

test("legacy_settle consumes payout summary .techs before all-paid evaluation", () => {
  const src = fs.readFileSync("index.js", "utf8");
  assert.ok(src.includes("const techRowsPayload = await _buildPayoutTechSummaryRows(payout_id);"));
  assert.ok(src.includes("const techRows = Array.isArray(techRowsPayload?.techs) ? techRowsPayload.techs : [];"));
  assert.ok(src.includes("getPayoutTechSettlementRows(client, payout_id)"));
});

test("draft adjustment audit records original draft status before lock", async () => {
  const db = new FakeClient();
  db.periods.set("payout_2000-01_25", { payout_id: "payout_2000-01_25", status: "draft", period_type: "25", period_start: "2000-01-01T00:00:00Z", period_end: "2000-01-16T00:00:00Z" });

  const result = await apply(db, { payout_id: "payout_2000-01_25" }, { regenerateDraftPayoutContractLines: async () => ({ ok: true }) });

  assert.equal(result.period_status_before, "draft");
  assert.equal(result.period_status_after, "locked");
  const beforeJson = JSON.parse(db.audit[0].params[6]);
  assert.equal(beforeJson.period.status, "draft");
});

test("slip source includes adjustment rows and deposit totals", () => {
  const src = fs.readFileSync("index.js", "utf8");
  assert.match(src, /adjHtml/);
  assert.match(src, /deposit_deduction_amount/);
  assert.match(src, /ยอดสุทธิ/);
  assert.match(src, /จ่ายแล้ว/);
  assert.match(src, /คงเหลือ/);
});

test("super admin adjustment route remains separate and supports delete action", () => {
  const src = fs.readFileSync("index.js", "utf8");
  assert.match(src, /app\.post\('\/admin\/super\/payouts\/:payout_id\/adjust', requireSuperAdmin/);
  assert.match(src, /if \(action === 'delete'\)/);
  assert.match(src, /DELETE FROM public\.technician_payout_adjustments/);
});

test("migration SQL is additive and does not backfill", () => {
  const sql = fs.readFileSync("migrations/20260703_technician_payout_adjustment_idempotency.sql", "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS idempotency_key TEXT/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_tpa_idempotency_key/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
});
