"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createCustomerOrdersRoutes } = require("../server/routes/customerOrders");

function baseRow(o) {
  return {
    order_code: o.order_code, customer_name: o.customer_name, customer_phone: o.customer_phone,
    delivery_method: o.delivery_method, install_option: o.install_option, address: o.address,
    items: o.items, subtotal: o.subtotal, status: o.status, note: o.note, created_at: o.created_at,
    payment_method: o.payment_method, payment_status: o.payment_status, payment_charge_id: o.payment_charge_id,
    paid_at: o.paid_at, fulfillment_status: o.fulfillment_status, admin_note: o.admin_note,
  };
}

// Pool that supports the fulfilment UPDATE and the public GET (with fulfilment
// columns). hasFulfilmentColumns=false makes the "rich" selects throw 42703 so
// the defensive fallback is exercised.
function makePool(seed, { hasFulfilmentColumns = true } = {}) {
  const orders = new Map();
  if (seed) orders.set(seed.order_code, { note: "", admin_note: "", fulfillment_status: "", ...seed });
  return {
    orders,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, " ");
      const wantsFulfil = s.includes("fulfillment_status");
      if (wantsFulfil && !hasFulfilmentColumns && s.startsWith("SELECT")) {
        const e = new Error("no column"); e.code = "42703"; throw e;
      }
      if (s.startsWith("UPDATE public.customer_orders") && s.includes("fulfillment_status = COALESCE")) {
        const o = orders.get(params[0]);
        if (!o) return { rows: [] };
        if (params[1] != null) o.fulfillment_status = params[1];
        if (params[2]) o.admin_note = params[3];
        return { rows: [baseRow(o)] };
      }
      if (s.includes("FROM public.customer_orders WHERE order_code=$1")) {
        const o = orders.get(params[0]);
        if (!o) return { rows: [] };
        const row = baseRow(o);
        if (!wantsFulfil) { delete row.fulfillment_status; delete row.admin_note; }
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
}

function seedOrder(extra = {}) {
  return {
    order_code: "CWF-F1", customer_name: "คุณเอ", customer_phone: "0812345678",
    delivery_method: "ship", install_option: "cwf", address: "123",
    items: [{ item_id: "6", name: "แอร์", qty: 1, unit_price: 14900 }],
    subtotal: 14900, status: "paid", note: "", created_at: new Date().toISOString(),
    payment_method: "promptpay", payment_status: "successful", payment_charge_id: "chrg_1", paid_at: new Date().toISOString(),
    fulfillment_status: "", admin_note: "", ...extra,
  };
}

function startServer(pool, { admin = true } = {}) {
  const app = express();
  app.use(express.json());
  const guard = admin ? (_q, _s, next) => next() : (_q, res) => res.status(401).json({ error: "unauthorized" });
  app.use(createCustomerOrdersRoutes({ pool, requireAdminSession: guard }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const url = (s) => `http://127.0.0.1:${s.address().port}`;
const postJson = (u, body) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

test("admin can advance fulfilment status and leave a customer-visible note", async () => {
  const pool = makePool(seedOrder());
  const server = await startServer(pool);
  try {
    const res = await postJson(`${url(server)}/admin/orders/CWF-F1/status`, { fulfillment_status: "shipped", admin_note: "เลขพัสดุ TH123" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.fulfillment_status, "shipped");
    assert.equal(body.order.admin_note, "เลขพัสดุ TH123");
    assert.equal(pool.orders.get("CWF-F1").fulfillment_status, "shipped");
  } finally { server.close(); }
});

test("an invalid fulfilment status is rejected and an unknown order 404s", async () => {
  const server = await startServer(makePool(seedOrder()));
  try {
    assert.equal((await postJson(`${url(server)}/admin/orders/CWF-F1/status`, { fulfillment_status: "teleported" })).status, 400);
    assert.equal((await postJson(`${url(server)}/admin/orders/CWF-F1/status`, {})).status, 400); // no changes
    assert.equal((await postJson(`${url(server)}/admin/orders/CWF-NOPE/status`, { fulfillment_status: "confirmed" })).status, 404);
  } finally { server.close(); }
});

test("the status endpoint is behind the admin guard", async () => {
  const server = await startServer(makePool(seedOrder()), { admin: false });
  try {
    assert.equal((await postJson(`${url(server)}/admin/orders/CWF-F1/status`, { fulfillment_status: "confirmed" })).status, 401);
  } finally { server.close(); }
});

test("note can be updated without changing the fulfilment status", async () => {
  const pool = makePool(seedOrder({ fulfillment_status: "confirmed" }));
  const server = await startServer(pool);
  try {
    const body = await (await postJson(`${url(server)}/admin/orders/CWF-F1/status`, { admin_note: "ค่าส่ง 300 บาท" })).json();
    assert.equal(body.order.fulfillment_status, "confirmed"); // unchanged
    assert.equal(body.order.admin_note, "ค่าส่ง 300 บาท");
  } finally { server.close(); }
});

test("public GET returns fulfilment status + admin note so the customer can track", async () => {
  const server = await startServer(makePool(seedOrder({ fulfillment_status: "installing", admin_note: "ช่างถึง 14:00" })));
  try {
    const body = await (await fetch(`${url(server)}/public/orders/CWF-F1`)).json();
    assert.equal(body.order.fulfillment_status, "installing");
    assert.equal(body.order.admin_note, "ช่างถึง 14:00");
  } finally { server.close(); }
});

test("public GET still works before the fulfilment migration (defensive column fallback)", async () => {
  const server = await startServer(makePool(seedOrder(), { hasFulfilmentColumns: false }));
  try {
    const res = await fetch(`${url(server)}/public/orders/CWF-F1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.order_code, "CWF-F1");
    assert.equal(body.order.fulfillment_status, ""); // absent, degrades to empty
  } finally { server.close(); }
});
