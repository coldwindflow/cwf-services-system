"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { notifyPrepaidOrder, orderMessage } = require("../server/services/prepaid/prepaidLineNotification");

const lineUserId = `U${"a".repeat(32)}`;
const enabled = { LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "test-token", PREPAID_LINE_MESSAGING_PROVIDER_CONFIRMED: "true" };

function fakeDb() {
  const order = {
    order_id: 1, order_code: "CWF-123", customer_sub: "customer-1", status: "pending_payment",
    items: [{ item_name: "COLDWINDFLOW AIR CARE — PREMIUM" }],
    service_entitlement_snapshot: { service_package_groups: [{ btu: 12000, quantity: 1 }, { btu: 18000, quantity: 2 }] },
    subtotal: "2498.00", prepaid_line_notification_status: null,
    prepaid_line_notification_attempted_at: null, prepaid_line_notification_retry_key: null,
  };
  const query = async (sql, args = []) => {
    if (sql.includes("FROM public.customer_identities")) return { rows: [{ provider_subject: lineUserId }] };
    if (sql.includes("FROM public.customer_orders")) return { rows: [order] };
    if (sql.includes("prepaid_line_notification_status='sending'")) {
      order.prepaid_line_notification_status = "sending";
      order.prepaid_line_notification_attempted_at = new Date(0);
      order.prepaid_line_notification_retry_key = args[1];
    }
    if (sql.includes("prepaid_line_notification_status=$3")) order.prepaid_line_notification_status = args[2];
    return { rows: [] };
  };
  return { order, pool: { query, async connect() { return { query, release() {} }; } } };
}

test("prepaid LINE message contains the server order snapshot and amount", () => {
  const message = orderMessage(fakeDb().order);
  assert.match(message, /CWF-123/);
  assert.match(message, /PREMIUM/);
  assert.match(message, /จำนวน: 3 เครื่อง/);
  assert.match(message, /2,498 บาท/);
  assert.match(message, /รอชำระเงิน/);
});

test("confirmed LINE provider sends once with a stable retry key on repeated order requests", async () => {
  const { pool, order } = fakeDb();
  const pushes = [];
  const fetchImpl = async (url, options) => {
    pushes.push({ url, options });
    return { ok: true, status: 200, headers: { get() { return null; } } };
  };
  const first = await notifyPrepaidOrder({ pool, env: enabled, fetchImpl, orderCode: "CWF-123", customerSub: "customer-1", now: 100000 });
  const replay = await notifyPrepaidOrder({ pool, env: enabled, fetchImpl, orderCode: "CWF-123", customerSub: "customer-1", now: 200000 });
  assert.equal(first.status, "sent");
  assert.equal(replay.status, "already_handled");
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].options.headers["X-Line-Retry-Key"], /^[0-9a-f-]{36}$/);
  assert.equal(pushes[0].options.body.includes(lineUserId), true);
  assert.equal(order.prepaid_line_notification_status, "sent");
});

test("without a confirmed provider match, order creation uses LINE handoff fallback and never sends", async () => {
  const { pool } = fakeDb();
  const result = await notifyPrepaidOrder({ pool, env: { LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: "test-token" },
    fetchImpl: () => { throw new Error("must not send"); }, orderCode: "CWF-123", customerSub: "customer-1" });
  assert.equal(result.status, "fallback");
});
