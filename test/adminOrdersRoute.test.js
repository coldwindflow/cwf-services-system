"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createCustomerOrdersRoutes, adminOrder } = require("../server/routes/customerOrders");

const SAMPLE = {
  order_code: "CWF-A1", customer_name: "คุณเอ", customer_phone: "0812345678",
  delivery_method: "ship", install_option: "cwf", address: "123 ถนนทดสอบ",
  items: [{ item_id: "6", name: "แอร์ Daikin", qty: 1, unit_price: 14900 }],
  subtotal: 14900, status: "paid", note: "ด่วน", created_at: new Date().toISOString(),
  payment_method: "promptpay", payment_status: "successful", payment_charge_id: "chrg_1", paid_at: new Date().toISOString(),
};

// Pool whose admin SELECT behaviour is configurable: with payment columns, or
// throwing undefined_column (42703) on the rich query to exercise the fallback.
function makePool({ hasPaymentColumns = true, tableMissing = false } = {}) {
  return {
    calls: [],
    async query(sql) {
      const s = String(sql).replace(/\s+/g, " ");
      this.calls.push(s);
      if (tableMissing) { const e = new Error("no table"); e.code = "42P01"; throw e; }
      const isRich = s.includes("payment_method, payment_status");
      if (isRich && !hasPaymentColumns) { const e = new Error("no column"); e.code = "42703"; throw e; }
      const row = { ...SAMPLE };
      if (!isRich) { delete row.payment_method; delete row.payment_status; delete row.payment_charge_id; delete row.paid_at; }
      return { rows: [row] };
    },
  };
}

function startServer(pool) {
  const app = express();
  app.use(express.json());
  app.use(createCustomerOrdersRoutes({ pool, requireAdminSession: (_q, _s, next) => next() }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const url = (s) => `http://127.0.0.1:${s.address().port}`;

test("adminOrder serializer includes payment + note fields on top of the public fields", () => {
  const a = adminOrder(SAMPLE);
  assert.equal(a.order_code, "CWF-A1");
  assert.equal(a.payment_method, "promptpay");
  assert.equal(a.payment_status, "successful");
  assert.equal(a.payment_charge_id, "chrg_1");
  assert.equal(a.note, "ด่วน");
  assert.ok(a.paid_at);
  // Missing payment fields degrade to empty strings, never undefined.
  const bare = adminOrder({ order_code: "CWF-B", items: [], subtotal: 0, status: "pending_payment" });
  assert.equal(bare.payment_method, "");
  assert.equal(bare.paid_at, null);
});

test("GET /admin/orders returns payment details when the columns exist", async () => {
  const server = await startServer(makePool({ hasPaymentColumns: true }));
  try {
    const body = await (await fetch(`${url(server)}/admin/orders`)).json();
    assert.equal(body.ok, true);
    assert.equal(body.orders.length, 1);
    assert.equal(body.orders[0].payment_method, "promptpay");
    assert.equal(body.orders[0].status, "paid");
  } finally { server.close(); }
});

test("GET /admin/orders falls back to base columns when the payment migration has not run", async () => {
  const pool = makePool({ hasPaymentColumns: false });
  const server = await startServer(pool);
  try {
    const res = await fetch(`${url(server)}/admin/orders`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.orders.length, 1); // list still loads
    assert.equal(body.orders[0].payment_method, ""); // gracefully absent
    // It retried without the payment columns.
    assert.ok(pool.calls.some((s) => s.includes("payment_method, payment_status")));
    assert.ok(pool.calls.some((s) => !s.includes("payment_method") && s.includes("FROM public.customer_orders")));
  } finally { server.close(); }
});

test("GET /admin/orders reports schema_ready:false (200, empty) when the table itself is missing", async () => {
  const server = await startServer(makePool({ tableMissing: true }));
  try {
    const body = await (await fetch(`${url(server)}/admin/orders`)).json();
    assert.equal(body.ok, true);
    assert.equal(body.schema_ready, false);
    assert.deepEqual(body.orders, []);
  } finally { server.close(); }
});
