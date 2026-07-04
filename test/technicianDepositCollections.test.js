const test = require("node:test");
const assert = require("node:assert/strict");
const svc = require("../server/services/technicianDepositCollections");
const { ensurePayoutPeriodAndSnapshotForPayment } = require("../server/services/technicianPayoutPrepay");
const repairScript = require("../scripts/repair-technician-deposit-collect");

function normSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

class FakeClient {
  constructor() {
    this.indexReady = true;
    this.accounts = new Map();
    this.profiles = new Map();
    this.ledger = [];
    this.payments = [];
    this.periods = new Map();
    this.audit = [];
    this.snapshots = [];
    this.queries = [];
    this.failAudit = false;
  }

  snapshot() {
    return {
      ledger: this.ledger.map((r) => ({ ...r })),
      payments: this.payments.map((r) => ({ ...r })),
      periods: new Map([...this.periods.entries()].map(([k, v]) => [k, { ...v }])),
      audit: this.audit.map((r) => ({ ...r })),
    };
  }

  restore(snapshot) {
    this.ledger = snapshot.ledger.map((r) => ({ ...r }));
    this.payments = snapshot.payments.map((r) => ({ ...r }));
    this.periods = new Map([...snapshot.periods.entries()].map(([k, v]) => [k, { ...v }]));
    this.audit = snapshot.audit.map((r) => ({ ...r }));
  }

  async query(sql, params = []) {
    const s = normSql(sql);
    this.queries.push({ sql: s, params });
    if (s === "BEGIN") {
      this.snapshots.push(this.snapshot());
      return { rows: [] };
    }
    if (s === "COMMIT") {
      this.snapshots.pop();
      return { rows: [] };
    }
    if (s === "ROLLBACK") {
      const snapshot = this.snapshots.pop();
      if (snapshot) this.restore(snapshot);
      return { rows: [] };
    }
    if (s.includes("pg_get_indexdef")) {
      return {
        rows: this.indexReady ? [{
          is_unique: true,
          indexdef: "CREATE UNIQUE INDEX idx_deposit_collect_once_per_payout_tech ON public.technician_deposit_ledger USING btree (technician_username, payout_id, transaction_type) WHERE (transaction_type = 'collect'::text)",
          predicate: "(transaction_type = 'collect'::text)",
        }] : [],
      };
    }
    if (s.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
    if (s.startsWith("SELECT technician_username, COALESCE(target_amount,5000)::numeric AS target_amount")) {
      const row = this.accounts.get(String(params[0]));
      return { rows: row ? [{ ...row }] : [] };
    }
    if (s.startsWith("SELECT username, COALESCE(employment_type,'company') AS employment_type")) {
      const employment_type = this.profiles.get(String(params[0]));
      return { rows: employment_type ? [{ username: String(params[0]), employment_type }] : [] };
    }
    if (s.startsWith("SELECT COALESCE(SUM( CASE transaction_type")) {
      const tech = String(params[0]);
      let total = 0;
      for (const r of this.ledger.filter((x) => x.technician_username === tech)) {
        if (r.transaction_type === "collect" || r.transaction_type === "manual_adjust") total += Number(r.amount || 0);
        if (r.transaction_type === "refund" || r.transaction_type === "claim_deduct") total -= Number(r.amount || 0);
      }
      return { rows: [{ collected: total }] };
    }
    if (s.startsWith("SELECT ledger_id, amount, created_at, created_by, meta_json FROM public.technician_deposit_ledger")) {
      const [payout_id, technician_username] = params.map(String);
      const rows = this.ledger
        .filter((r) => r.payout_id === payout_id && r.technician_username === technician_username && r.transaction_type === "collect")
        .map((r) => ({ ...r }));
      return { rows };
    }
    if (s.startsWith("SELECT paid_amount, paid_status, paid_at FROM public.technician_payout_payments")) {
      const [payout_id, technician_username] = params.map(String);
      const row = this.payments.find((r) => r.payout_id === payout_id && r.technician_username === technician_username);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (s.startsWith("INSERT INTO public.technician_deposit_ledger")) {
      const [technician_username, payout_id, amount, note, created_by, meta_json] = params;
      const existing = this.ledger.find((r) =>
        r.technician_username === technician_username
        && r.payout_id === payout_id
        && r.transaction_type === "collect"
      );
      if (existing) return { rows: [], rowCount: 0 };
      const row = {
        ledger_id: this.ledger.length + 1,
        technician_username,
        payout_id,
        transaction_type: "collect",
        amount: Number(amount),
        note,
        created_by,
        meta_json,
      };
      this.ledger.push(row);
      return { rows: [{ ledger_id: row.ledger_id }], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO public.technician_payout_payments")) {
      const [payout_id, technician_username, paid_amount, paid_status] = params;
      const row = this.payments.find((r) => r.payout_id === payout_id && r.technician_username === technician_username);
      if (row) {
        row.paid_amount = Number(paid_amount);
        row.paid_status = paid_status;
        row.paid_at = "2026-07-04T00:00:00.000Z";
      } else {
        this.payments.push({ payout_id, technician_username, paid_amount: Number(paid_amount), paid_status, paid_at: "2026-07-04T00:00:00.000Z" });
      }
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("UPDATE public.technician_payout_periods SET status='locked'")) {
      const row = this.periods.get(String(params[0]));
      if (row) row.status = "locked";
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (s.startsWith("UPDATE public.technician_payout_periods SET status='paid'")) {
      const row = this.periods.get(String(params[0]));
      if (row) row.status = "paid";
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (s.startsWith("INSERT INTO public.accounting_audit_log")) {
      if (this.failAudit) throw new Error("AUDIT_WRITE_FAILED");
      this.audit.push({ params });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unhandled SQL: ${s}`);
  }
}

function partnerDb(target = 5000) {
  const db = new FakeClient();
  db.profiles.set("TECH", "partner");
  db.accounts.set("TECH", { technician_username: "TECH", target_amount: target, is_required: true });
  return db;
}

test("period 25 deducts 500 and following period 10 deducts another 500", async () => {
  const db = partnerDb();
  const r25 = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-06_25",
    technician_username: "TECH",
    gross_amount: 1000,
    adj_total: 0,
    actor: "test",
  });
  const r10 = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 19625,
    adj_total: 0,
    actor: "test",
  });
  assert.equal(r25.deposit_deduction_amount, 500);
  assert.equal(r10.deposit_deduction_amount, 500);
  assert.equal(db.ledger.length, 2);
});

test("GET projection does not insert ledger rows", async () => {
  const db = partnerDb();
  const projected = await svc.getProjectedDepositDeductionForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 19625,
    adj_total: 0,
    period_status: "locked",
  });
  assert.equal(projected.deposit_deduction_amount, 500);
  assert.equal(projected.deposit_projected, true);
  assert.equal(db.ledger.length, 0);
});

test("duplicate same payout preserves the one existing collect row", async () => {
  const db = partnerDb();
  await svc.materializeDepositCollectForPayout(db, { payout_id: "payout_2026-07_10", technician_username: "TECH", gross_amount: 1000 });
  const replay = await svc.materializeDepositCollectForPayout(db, { payout_id: "payout_2026-07_10", technician_username: "TECH", gross_amount: 1000 });
  assert.equal(replay.deposit_deduction_amount, 500);
  assert.equal(replay.inserted, false);
  assert.equal(db.ledger.length, 1);
});

test("different payouts for the same technician do not exceed target", async () => {
  const db = partnerDb(800);
  const first = await svc.materializeDepositCollectForPayout(db, { payout_id: "payout_2026-06_25", technician_username: "TECH", gross_amount: 1000 });
  const second = await svc.materializeDepositCollectForPayout(db, { payout_id: "payout_2026-07_10", technician_username: "TECH", gross_amount: 1000 });
  const third = await svc.materializeDepositCollectForPayout(db, { payout_id: "payout_2026-07_25", technician_username: "TECH", gross_amount: 1000 });
  assert.equal(first.deposit_deduction_amount, 500);
  assert.equal(second.deposit_deduction_amount, 300);
  assert.equal(third.deposit_deduction_amount, 0);
});

test("existing collect amount is never rewritten", async () => {
  const db = partnerDb();
  db.ledger.push({ ledger_id: 1, technician_username: "TECH", payout_id: "payout_2026-07_10", transaction_type: "collect", amount: 125 });
  const result = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 19625,
  });
  assert.equal(result.deposit_deduction_amount, 125);
  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].amount, 125);
});

test("paid historical payout without an existing collect is not projected or changed", async () => {
  const db = partnerDb();
  const projected = await svc.getProjectedDepositDeductionForPayout(db, {
    payout_id: "payout_2026-06_25",
    technician_username: "TECH",
    gross_amount: 1000,
    period_status: "paid",
  });
  assert.equal(projected.deposit_deduction_amount, 0);
  assert.equal(projected.deposit_projected, false);
  assert.equal(db.ledger.length, 0);
});

test("caller rollback removes materialized collect when later payment write fails", async () => {
  const db = partnerDb();
  await assert.rejects(async () => {
    await db.query("BEGIN");
    try {
      await svc.materializeDepositCollectForPayout(db, {
        payout_id: "payout_2026-07_10",
        technician_username: "TECH",
        gross_amount: 1000,
      });
      throw new Error("PAYMENT_WRITE_FAILED");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  }, /PAYMENT_WRITE_FAILED/);
  assert.equal(db.ledger.length, 0);
});

test("missing or incompatible unique collect index fails closed", async () => {
  const db = partnerDb();
  db.indexReady = false;
  await assert.rejects(() => svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 1000,
  }), /DEPOSIT_COLLECT_INDEX_REQUIRED/);
});

test("paid technician in locked period is not projected or materialized, while unpaid technician is", async () => {
  const db = new FakeClient();
  for (const tech of ["TECH_A", "TECH_B"]) {
    db.profiles.set(tech, "partner");
    db.accounts.set(tech, { technician_username: tech, target_amount: 5000, is_required: true });
  }
  db.periods.set("payout_2026-07_10", { payout_id: "payout_2026-07_10", status: "locked" });
  db.payments.push({
    payout_id: "payout_2026-07_10",
    technician_username: "TECH_A",
    paid_amount: 1000,
    paid_status: "paid",
    paid_at: "2026-07-04T00:00:00.000Z",
  });

  const detailProjection = await svc.getProjectedDepositDeductionForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH_A",
    gross_amount: 1000,
    period_status: "locked",
  });
  const lockOrBulkAttemptA = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH_A",
    gross_amount: 1000,
  });
  const lockOrBulkAttemptB = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH_B",
    gross_amount: 1000,
  });

  assert.equal(detailProjection.deposit_deduction_amount, 0);
  assert.equal(detailProjection.deposit_projection_reason, "payment_already_recorded");
  assert.equal(lockOrBulkAttemptA.reason, "payment_already_recorded");
  assert.equal(lockOrBulkAttemptA.inserted, false);
  assert.equal(lockOrBulkAttemptB.deposit_deduction_amount, 500);
  assert.equal(lockOrBulkAttemptB.inserted, true);
  assert.deepEqual(db.ledger.map((r) => r.technician_username), ["TECH_B"]);
});

test("existing collect is preserved even when technician payment history exists", async () => {
  const db = partnerDb();
  db.payments.push({
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    paid_amount: 875,
    paid_status: "paid",
    paid_at: "2026-07-04T00:00:00.000Z",
  });
  db.ledger.push({ ledger_id: 1, technician_username: "TECH", payout_id: "payout_2026-07_10", transaction_type: "collect", amount: 125 });
  const projected = await svc.getProjectedDepositDeductionForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 1000,
    period_status: "locked",
  });
  const materialized = await svc.materializeDepositCollectForPayout(db, {
    payout_id: "payout_2026-07_10",
    technician_username: "TECH",
    gross_amount: 1000,
  });
  assert.equal(projected.deposit_deduction_amount, 125);
  assert.equal(projected.deposit_projection_reason, "existing_collect_preserved");
  assert.equal(materialized.deposit_deduction_amount, 125);
  assert.equal(db.ledger.length, 1);
});

async function simulateAccountingSinglePay(db, { paidNow, failAudit = false } = {}) {
  await db.query("BEGIN");
  try {
    const deposit = await svc.materializeDepositCollectForPayout(db, {
      payout_id: "payout_2026-07_10",
      technician_username: "TECH",
      gross_amount: 1000,
    });
    const net = 1000 - Number(deposit.deposit_deduction_amount || 0);
    if (Number(paidNow || 0) - net > 0.01) {
      await db.query("ROLLBACK");
      return { statusCode: 409, body: { error: "PAYOUT_PAYABLE_CHANGED", current_payable_amount: net } };
    }
    await db.query(
      `INSERT INTO public.technician_payout_payments(payout_id, technician_username, paid_amount, paid_status)
       VALUES($1,$2,$3,$4)`,
      ["payout_2026-07_10", "TECH", paidNow, "paid"]
    );
    await db.query(`UPDATE public.technician_payout_periods SET status='paid' WHERE payout_id=$1`, ["payout_2026-07_10"]);
    db.failAudit = failAudit;
    await db.query(`INSERT INTO public.accounting_audit_log(action) VALUES($1)`, ["MARK_PAYOUT_PAID"]);
    await db.query("COMMIT");
    return { statusCode: 200, body: { ok: true } };
  } catch (err) {
    await db.query("ROLLBACK");
    return { statusCode: err.code === "DEPOSIT_COLLECT_INDEX_REQUIRED" ? 503 : 500, body: { error: err.code || err.message } };
  }
}

test("stale paid amount returns HTTP-style 409 and commits no payment, collect, status, or audit", async () => {
  const db = partnerDb();
  db.periods.set("payout_2026-07_10", { payout_id: "payout_2026-07_10", status: "locked" });
  const res = await simulateAccountingSinglePay(db, { paidNow: 1000 });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "PAYOUT_PAYABLE_CHANGED");
  assert.equal(res.body.current_payable_amount, 500);
  assert.equal(db.ledger.length, 0);
  assert.equal(db.payments.length, 0);
  assert.equal(db.audit.length, 0);
  assert.equal(db.periods.get("payout_2026-07_10").status, "locked");
});

test("collect, payment, period status, and audit roll back together on transaction failure", async () => {
  const db = partnerDb();
  db.periods.set("payout_2026-07_10", { payout_id: "payout_2026-07_10", status: "locked" });
  const res = await simulateAccountingSinglePay(db, { paidNow: 500, failAudit: true });
  assert.equal(res.statusCode, 500);
  assert.equal(db.ledger.length, 0);
  assert.equal(db.payments.length, 0);
  assert.equal(db.audit.length, 0);
  assert.equal(db.periods.get("payout_2026-07_10").status, "locked");
});

test("missing collect index maps to HTTP-style 503 and rolls back automatic collect", async () => {
  const db = partnerDb();
  db.indexReady = false;
  const res = await simulateAccountingSinglePay(db, { paidNow: 500 });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "DEPOSIT_COLLECT_INDEX_REQUIRED");
  assert.equal(db.ledger.length, 0);
  assert.equal(db.payments.length, 0);
});

test("injected prepay client path never reads through the global pool", async () => {
  const client = new FakeClient();
  client.periods.set("payout_2026-06_25", {
    payout_id: "payout_2026-06_25",
    period_type: "25",
    period_start: "2026-06-10T17:00:00.000Z",
    period_end: "2026-06-25T17:00:00.000Z",
    status: "draft",
  });
  const poisonedPool = {
    async query() { throw new Error("GLOBAL_POOL_USED"); },
    async connect() { throw new Error("GLOBAL_POOL_CONNECT_USED"); },
  };
  const readCalls = [];
  const result = await ensurePayoutPeriodAndSnapshotForPayment({
    pool: poisonedPool,
    client,
    payout_id: "payout_2026-06_25",
    actor_username: "test",
    getPayoutPeriod: async (payoutId, db, opts = {}) => {
      assert.equal(db, client);
      readCalls.push({ payoutId, forUpdate: !!opts.forUpdate });
      return client.periods.get(payoutId) || null;
    },
    regenerateDraftPayoutContractLines: async ({ client: regenClient }) => {
      assert.equal(regenClient, client);
      return { ok: true };
    },
  });
  assert.equal(result.regenerated, true);
  assert.deepEqual(readCalls.map((r) => r.forUpdate), [true, true]);
});

test("repair confirmation token is bound to payout, technician, and expected amount", () => {
  assert.equal(
    repairScript.buildConfirmationToken("payout_2026-07_10", "0661479791", 500),
    "payout_2026-07_10:0661479791:500"
  );
  assert.notEqual(
    repairScript.buildConfirmationToken("payout_2026-07_10", "0661479791", 0),
    "payout_2026-07_10:0661479791:500"
  );
});
