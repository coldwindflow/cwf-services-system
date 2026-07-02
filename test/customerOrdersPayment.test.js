"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createCustomerOrdersRoutes } = require("../server/routes/customerOrders");

// The base order columns publicOrder() serializes.
function baseRow(o) {
  return {
    order_code: o.order_code, customer_name: o.customer_name, customer_phone: o.customer_phone,
    delivery_method: o.delivery_method, install_option: o.install_option, address: o.address,
    items: o.items, subtotal: o.subtotal, status: o.status, created_at: o.created_at,
  };
}

// In-memory pool handling the pay-lookup, pay-update, webhook-update and public
// GET queries used by the payment routes.
function makePool(seed, { schemaReady = true } = {}) {
  const orders = new Map();
  if (seed) orders.set(seed.order_code, { address: "", ...seed });
  return {
    orders,
    async query(sql, params = []) {
      if (!schemaReady) { const e = new Error("no table"); e.code = "42P01"; throw e; }
      const s = String(sql).replace(/\s+/g, " ");
      if (s.includes("SELECT order_code, subtotal, status FROM public.customer_orders WHERE order_code=$1")) {
        const o = orders.get(params[0]);
        return { rows: o ? [{ order_code: o.order_code, subtotal: o.subtotal, status: o.status }] : [] };
      }
      if (s.startsWith("UPDATE public.customer_orders") && s.includes("WHERE order_code=$1")) {
        const o = orders.get(params[0]);
        if (!o) return { rows: [] };
        o.payment_method = params[1]; o.payment_charge_id = params[2]; o.payment_status = params[3]; o.status = params[4];
        return { rows: [baseRow(o)] };
      }
      if (s.includes("WHERE payment_charge_id=$1")) {
        for (const o of orders.values()) {
          if (o.payment_charge_id === params[0]) { o.payment_status = params[1]; o.status = params[2]; }
        }
        return { rows: [] };
      }
      if (s.includes("FROM public.customer_orders WHERE order_code=$1")) {
        const o = orders.get(params[0]);
        return { rows: o ? [baseRow(o)] : [] };
      }
      return { rows: [] };
    },
  };
}

function fakeOmise(overrides = {}) {
  const spy = { charges: [] };
  return {
    spy,
    isConfigured: () => overrides.configured !== false,
    isTestMode: () => true,
    getPublicKey: () => overrides.publicKey || "pkey_test_123",
    createCardCharge: overrides.createCardCharge || (async ({ amount, token }) => {
      spy.charges.push({ method: "card", amount, token });
      return { id: "chrg_card_1", status: "successful", paid: true };
    }),
    createPromptPayCharge: overrides.createPromptPayCharge || (async ({ amount }) => {
      spy.charges.push({ method: "promptpay", amount });
      return { id: "chrg_pp_1", status: "pending", paid: false, source: { scannable_code: { image: { download_uri: "https://cdn.omise.co/qr.png" } } } };
    }),
    retrieveCharge: overrides.retrieveCharge || (async (id) => ({ id, status: "successful", paid: true })),
  };
}

function seedOrder(extra = {}) {
  return {
    order_code: "CWF-PAY1", customer_name: "คุณเอ", customer_phone: "0812345678",
    delivery_method: "pickup", install_option: "none", address: "",
    items: [{ item_id: "6", name: "แอร์ Daikin 12000 BTU", qty: 1, unit_price: 14900 }],
    subtotal: 14900, status: "pending_payment", created_at: new Date().toISOString(), ...extra,
  };
}

function startServer(pool, omiseClient) {
  const app = express();
  app.use(express.json());
  app.use(createCustomerOrdersRoutes({ pool, omiseClient, requireAdminSession: (_q, _s, next) => next() }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const url = (s) => `http://127.0.0.1:${s.address().port}`;
const postJson = (u, body) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

test("GET /public/payment-config exposes the public key but never a secret", async () => {
  const server = await startServer(makePool(seedOrder()), fakeOmise());
  try {
    const body = await (await fetch(`${url(server)}/public/payment-config`)).json();
    assert.equal(body.enabled, true);
    assert.equal(body.provider, "omise");
    assert.equal(body.public_key, "pkey_test_123");
    assert.deepEqual(body.methods, ["promptpay", "card"]);
    assert.ok(!("secret_key" in body) && !JSON.stringify(body).includes("skey_"));
  } finally { server.close(); }
});

test("payment-config reports disabled when Omise is not configured", async () => {
  const server = await startServer(makePool(seedOrder()), fakeOmise({ configured: false }));
  try {
    const body = await (await fetch(`${url(server)}/public/payment-config`)).json();
    assert.equal(body.enabled, false);
    assert.equal(body.public_key, "");
  } finally { server.close(); }
});

test("card payment charges the SERVER-stored amount, marks the order paid", async () => {
  const omise = fakeOmise();
  const pool = makePool(seedOrder());
  const server = await startServer(pool, omise);
  try {
    // The client sends amount:1 — it must be ignored; the charge uses 14900.
    const res = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x", amount: 1 });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.status, "paid");
    assert.equal(body.payment.status, "paid");
    assert.equal(body.payment.charge_id, "chrg_card_1");
    assert.equal(omise.spy.charges[0].amount, 14900);
    assert.equal(pool.orders.get("CWF-PAY1").status, "paid");
  } finally { server.close(); }
});

test("PromptPay payment returns a QR and leaves the order awaiting the webhook", async () => {
  const server = await startServer(makePool(seedOrder()), fakeOmise());
  try {
    const body = await (await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" })).json();
    assert.equal(body.order.status, "payment_processing");
    assert.equal(body.payment.qr_uri, "https://cdn.omise.co/qr.png");
    assert.equal(body.payment.requires_polling, true);
  } finally { server.close(); }
});

test("pay rejects an invalid method, a missing card token, and a non-payable order", async () => {
  const server = await startServer(makePool(seedOrder({ status: "paid" })), fakeOmise());
  try {
    assert.equal((await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "bitcoin" })).status, 400);
    assert.equal((await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card" })).status, 400);
    const paidRes = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" });
    assert.equal(paidRes.status, 409);
    assert.equal((await paidRes.json()).status, "paid");
  } finally { server.close(); }
});

test("pay returns 503 when Omise is not configured, and 404 for an unknown order", async () => {
  const notConfigured = await startServer(makePool(seedOrder()), fakeOmise({ configured: false }));
  try {
    assert.equal((await postJson(`${url(notConfigured)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" })).status, 503);
  } finally { notConfigured.close(); }

  const server = await startServer(makePool(seedOrder()), fakeOmise());
  try {
    assert.equal((await postJson(`${url(server)}/public/orders/CWF-NOPE/pay`, { method: "promptpay" })).status, 404);
  } finally { server.close(); }
});

test("webhook verifies by re-fetching the charge and flips the matching order to paid, idempotently", async () => {
  let retrieveCalls = 0;
  const omise = fakeOmise({ retrieveCharge: async (id) => { retrieveCalls += 1; return { id, status: "successful", paid: true }; } });
  const pool = makePool(seedOrder({ status: "payment_processing", payment_charge_id: "chrg_pp_1", payment_status: "pending" }));
  const server = await startServer(pool, omise);
  try {
    const event = { key: "charge.complete", data: { object: "charge", id: "chrg_pp_1", status: "successful" } };
    const first = await postJson(`${url(server)}/webhooks/omise`, event);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).ok, true);
    assert.equal(pool.orders.get("CWF-PAY1").status, "paid");
    assert.equal(retrieveCalls, 1); // verified against Omise, not trusting the payload

    // Replays are safe no-ops.
    const second = await postJson(`${url(server)}/webhooks/omise`, event);
    assert.equal(second.status, 200);
    assert.equal(pool.orders.get("CWF-PAY1").status, "paid");
  } finally { server.close(); }
});

test("webhook ignores an event with no charge id and always answers 200", async () => {
  const server = await startServer(makePool(seedOrder()), fakeOmise());
  try {
    const res = await postJson(`${url(server)}/webhooks/omise`, { key: "ping", data: {} });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, true);
  } finally { server.close(); }
});
