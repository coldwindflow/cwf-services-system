"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");

function fixture(overrides = {}) {
  const order = {
    order_id: 42, order_code: "CWF-CANCEL-42", order_kind: "service_prepaid",
    customer_sub: "owner-sub", status: "pending_payment", payment_status: null,
    paid_at: null, payment_charge_id: null, manual_payment_reference: null, subtotal: 499,
    prepaid_cancelled_at: null, ...overrides,
  };
  let hasEntitlement = false;
  let writes = 0;
  const query = async (sql, args = []) => {
    if (sql.includes("to_regclass('public.customer_service_entitlements')")) {
      return { rows: [{ has_entitlements: true, has_orders: true, has_order_columns: true, has_job_columns: true }] };
    }
    if (sql.includes("prepaid_purchase_request_key=$1")) return { rows: [order] };
    if (sql.includes("FROM public.customer_orders") && sql.includes("FOR UPDATE")) {
      return { rows: args[0] === order.order_code && (!args[1] || args[1] === order.customer_sub) ? [order] : [] };
    }
    if (sql.includes("FROM public.customer_service_entitlements")) {
      return { rows: hasEntitlement ? [{ entitlement_id: 99 }] : [] };
    }
    if (sql.includes("SET status='cancelled'")) {
      writes += 1;
      order.status = "cancelled";
      order.prepaid_cancelled_by = args[1];
      order.prepaid_cancel_reason = args[2];
      order.prepaid_cancelled_at = "2026-10-03T00:00:00.000Z";
      return { rows: [{ order_code: order.order_code, status: order.status, prepaid_cancelled_at: order.prepaid_cancelled_at }] };
    }
    return { rows: [] };
  };
  const pool = { query, async connect() { return { query, release() {} }; } };
  return { service: createPrepaidOrderService({ pool }), order, get writes() { return writes; }, setEntitlement(value) { hasEntitlement = value; } };
}

test("customer cancels only their unpaid prepaid order, with auditable status and idempotent replay", async () => {
  const flow = fixture();
  const first = await flow.service.cancelOrder("CWF-CANCEL-42", { customerSub: "owner-sub", reason: "ไม่ต้องการแล้ว" });
  assert.equal(first.status, "cancelled");
  assert.equal(first.replayed, false);
  assert.equal(flow.order.prepaid_cancelled_by, "customer:owner-sub");
  assert.equal(flow.order.prepaid_cancel_reason, "ไม่ต้องการแล้ว");
  assert.equal(flow.writes, 1);
  const second = await flow.service.cancelOrder("CWF-CANCEL-42", { customerSub: "owner-sub" });
  assert.equal(second.replayed, true);
  assert.equal(flow.writes, 1);
});

test("another customer cannot see or cancel the order", async () => {
  const flow = fixture();
  await assert.rejects(flow.service.cancelOrder("CWF-CANCEL-42", { customerSub: "other-sub" }), { code: "ORDER_NOT_FOUND" });
  assert.equal(flow.writes, 0);
});

test("paid, processing, linked-charge, and entitlement orders reject cancellation", async () => {
  for (const overrides of [
    { status: "paid", paid_at: "2026-10-03T00:00:00Z" },
    { status: "payment_processing" },
    { status: "pending_payment", payment_status: "processing:abc" },
    { status: "payment_failed", payment_charge_id: "chrg_real" },
  ]) {
    const flow = fixture(overrides);
    await assert.rejects(flow.service.cancelOrder("CWF-CANCEL-42", { cancelledBy: "operator", reason: "customer declined" }),
      { code: "ORDER_CANCELLATION_REQUIRES_ADMIN_REVIEW" });
    assert.equal(flow.writes, 0);
  }
  const flow = fixture();
  flow.setEntitlement(true);
  await assert.rejects(flow.service.cancelOrder("CWF-CANCEL-42", { cancelledBy: "operator", reason: "customer declined" }),
    { code: "ORDER_HAS_ENTITLEMENT" });
});

test("admin cancellation records actor and removes the order from payable status", async () => {
  const flow = fixture({ customer_sub: null });
  await assert.rejects(flow.service.cancelOrder("CWF-CANCEL-42", { cancelledBy: "operator" }),
    { code: "CANCEL_REASON_REQUIRED" });
  const result = await flow.service.cancelOrder("CWF-CANCEL-42", { cancelledBy: "operator", reason: "ลูกค้าไม่รับแพ็กเกจ" });
  assert.equal(result.status, "cancelled");
  assert.equal(flow.order.prepaid_cancelled_by, "admin:operator");
  assert.equal(flow.order.prepaid_cancel_reason, "ลูกค้าไม่รับแพ็กเกจ");
});

test("payment verification cannot revive a cancelled Order", async () => {
  const flow = fixture();
  await flow.service.cancelOrder("CWF-CANCEL-42", { cancelledBy: "operator", reason: "ลูกค้ายกเลิก" });
  await assert.rejects(flow.service.confirmManualPayment("CWF-CANCEL-42", {
    reference: "bank-slip-123", confirmed_amount: 499,
  }), { code: "ORDER_NOT_PAYABLE" });
  assert.equal(flow.order.status, "cancelled");
});

test("active Admin queue excludes cancelled Orders while audit list retains them", () => {
  const queue = fs.readFileSync("admin-prepaid-queue.js", "utf8");
  const service = fs.readFileSync("server/services/prepaid/prepaidOrderServiceV2.js", "utf8");
  assert.match(queue, /order\.payment_order_status === "cancelled"\) return false/);
  assert.match(queue, /data-prepaid-cancel/);
  assert.match(service, /WHERE order_kind='service_prepaid' AND customer_sub=\$1/);
  assert.doesNotMatch(service.match(/async function listOrders[\s\S]*?async function listRights/)?.[0] || "", /status\s*<>\s*'cancelled'/i);
});

test("routes, customer hub, admin queue and migration include safe cancellation wiring", () => {
  const customerRoute = fs.readFileSync("server/routes/public/customerPrepaid.js", "utf8");
  const adminRoute = fs.readFileSync("server/routes/admin/storeServicePackageCatalog.js", "utf8");
  const ui = fs.readFileSync("customer-app/modules/prepaid.js", "utf8");
  const queue = fs.readFileSync("admin-prepaid-queue.js", "utf8");
  const sql = fs.readFileSync("scripts/sql/20260906_prepaid_service_entitlements.sql", "utf8");
  assert.match(customerRoute, /\/public\/prepaid-orders\/:code\/cancel", requireCustomerJwt/);
  assert.match(adminRoute, /\/admin\/prepaid-orders\/:code\/cancel", requireAdminSession/);
  assert.match(adminRoute, /req\.actor\?\.username/);
  assert.match(ui, /data-cancel-order/);
  assert.match(queue, /data-prepaid-cancel/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS prepaid_cancelled_at TIMESTAMPTZ/);
  assert.doesNotMatch(sql, /DELETE FROM public\.customer_orders/i);
});
