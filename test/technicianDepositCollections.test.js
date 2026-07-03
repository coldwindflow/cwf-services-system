const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const svc = require("../server/services/technicianDepositCollections");

function normSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

class FakeClient {
  constructor() {
    this.indexReady = true;
    this.accounts = new Map();
    this.profiles = new Map();
    this.ledger = [];
    this.snapshots = [];
  }

  snapshot() {
    return {
      ledger: this.ledger.map((r) => ({ ...r })),
    };
  }

  restore(snapshot) {
    this.ledger = snapshot.ledger.map((r) => ({ ...r }));
  }

  async query(sql, params = []) {
    const s = normSql(sql);
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

test("accounting pay rejects stale pre-deposit paid amount with current payable response", () => {
  const src = fs.readFileSync("index.js", "utf8");
  const route = src.slice(src.indexOf("app.post('/admin/accounting/payouts/:payout_id/pay'"));
  assert.match(route, /_ensureDepositCollectionForPayout\(/);
  assert.match(route, /const currentTotals = await _getTechGrossAdjNet/);
  assert.match(route, /PAYOUT_PAYABLE_CHANGED/);
  assert.match(route, /current_payable_amount/);
});

test("bulk pay materializes deposit before settlement target rows are selected", () => {
  const src = fs.readFileSync("index.js", "utf8");
  const route = src.slice(src.indexOf("app.post('/admin/super/payouts/:payout_id/pay_bulk'"), src.indexOf("// ---- Super Admin: legacy payout settlement"));
  assert.ok(route.indexOf("_ensureDepositCollectionsForPayout(payout_id, actor, client)") < route.indexOf("getPayoutTechSettlementRows(client, payout_id)"));
  assert.ok(route.indexOf("getPayoutTechSettlementRows(client, payout_id)") < route.indexOf("getBulkPayableTargetRows(settlementRows)"));
});
