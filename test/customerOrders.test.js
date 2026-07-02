const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createCustomerOrdersRoutes, normalizeOrder, generateOrderCode } = require("../server/routes/customerOrders");

// In-memory pool that emulates the customer_orders table for INSERT/SELECT.
function makePool({ schemaReady = true } = {}) {
  const rows = [];
  return {
    rows,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, " ");
      if (!schemaReady) { const e = new Error("relation does not exist"); e.code = "42P01"; throw e; }
      if (s.includes("INSERT INTO public.customer_orders")) {
        const row = {
          order_code: params[0], customer_name: params[1], customer_phone: params[2],
          delivery_method: params[3], install_option: params[4], address: params[5],
          items: JSON.parse(params[6]), subtotal: params[7], status: "pending_payment",
          created_at: new Date().toISOString(),
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (s.includes("WHERE order_code=$1")) {
        const found = rows.find((r) => r.order_code === params[0]);
        return { rows: found ? [found] : [] };
      }
      if (s.includes("ORDER BY created_at DESC")) return { rows: rows.slice() };
      return { rows: [] };
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
function baseUrl(server) { return `http://127.0.0.1:${server.address().port}`; }

const validPayload = {
  customer_name: "คุณเอ",
  customer_phone: "0812345678",
  delivery_method: "ship",
  install_option: "cwf",
  address: "123 ถนนทดสอบ",
  items: [{ item_id: "6", name: "แอร์ Daikin 12000 BTU", qty: 2, unit_price: 14900 }],
};

test("normalizeOrder computes subtotal server-side and ignores any client-sent total", () => {
  const r = normalizeOrder({ ...validPayload, subtotal: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.subtotal, 29800); // 14900 * 2, not the client's 1
  assert.equal(r.value.items[0].qty, 2);
});

test("normalizeOrder requires name, phone, items, and address when shipping", () => {
  assert.equal(normalizeOrder({ items: validPayload.items }).ok, false);
  assert.equal(normalizeOrder({ customer_name: "x", customer_phone: "y", items: [] }).ok, false);
  const noAddr = normalizeOrder({ ...validPayload, address: "" });
  assert.equal(noAddr.ok, false);
  assert.ok(noAddr.errors.some((e) => e.includes("address")));
  // Pickup needs no address.
  assert.equal(normalizeOrder({ ...validPayload, delivery_method: "pickup", address: "" }).ok, true);
});

test("normalizeOrder clamps quantity and rejects invalid delivery/install/price", () => {
  const clamped = normalizeOrder({ ...validPayload, items: [{ item_id: "1", name: "x", qty: 999, unit_price: 100 }] });
  assert.equal(clamped.value.items[0].qty, 99);
  assert.equal(normalizeOrder({ ...validPayload, delivery_method: "teleport" }).ok, false);
  assert.equal(normalizeOrder({ ...validPayload, install_option: "magic" }).ok, false);
  assert.equal(normalizeOrder({ ...validPayload, items: [{ item_id: "1", name: "x", qty: 1, unit_price: -5 }] }).ok, false);
});

test("generateOrderCode produces a unique-ish CWF-prefixed code", () => {
  const a = generateOrderCode();
  assert.match(a, /^CWF-[0-9A-Z]+$/);
  assert.notEqual(a, generateOrderCode());
});

test("POST /public/orders creates an order and GET returns it; admin lists it", async () => {
  const pool = makePool();
  const server = await startServer(pool);
  try {
    const url = baseUrl(server);
    const created = await fetch(`${url}/public/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.ok, true);
    assert.match(body.order.order_code, /^CWF-/);
    assert.equal(body.order.subtotal, 29800);
    assert.equal(body.order.status, "pending_payment");

    const code = body.order.order_code;
    const got = await fetch(`${url}/public/orders/${encodeURIComponent(code)}`);
    assert.equal(got.status, 200);
    assert.equal((await got.json()).order.order_code, code);

    const missing = await fetch(`${url}/public/orders/CWF-DOESNOTEXIST`);
    assert.equal(missing.status, 404);

    const admin = await fetch(`${url}/admin/orders`);
    const adminBody = await admin.json();
    assert.equal(adminBody.orders.length, 1);
    assert.equal(adminBody.orders[0].order_code, code);
  } finally {
    server.close();
  }
});

test("POST /public/orders rejects an invalid payload with 400 and details", async () => {
  const server = await startServer(makePool());
  try {
    const res = await fetch(`${baseUrl(server)}/public/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "VALIDATION_FAILED");
    assert.ok(Array.isArray(body.details) && body.details.length);
  } finally {
    server.close();
  }
});

test("routes report 503 (not 500) before the orders table migration is applied", async () => {
  const server = await startServer(makePool({ schemaReady: false }));
  try {
    const res = await fetch(`${baseUrl(server)}/public/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "ORDERS_SCHEMA_NOT_READY");
  } finally {
    server.close();
  }
});
