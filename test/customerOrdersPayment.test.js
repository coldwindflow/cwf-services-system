"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { createCustomerOrdersRoutes } = require("../server/routes/customerOrders");

const WEBHOOK_SECRET_BYTES = Buffer.from("omise webhook secret fixture", "utf8");
const WEBHOOK_SECRET = WEBHOOK_SECRET_BYTES.toString("base64");

function baseRow(o) {
  return {
    order_code: o.order_code, customer_name: o.customer_name, customer_phone: o.customer_phone,
    delivery_method: o.delivery_method, install_option: o.install_option, address: o.address,
    items: o.items, subtotal: o.subtotal, status: o.status, payment_status: o.payment_status,
    payment_charge_id: o.payment_charge_id, paid_at: o.paid_at, created_at: o.created_at,
  };
}

function seedOrder(extra = {}) {
  return {
    order_code: "CWF-PAY1",
    customer_name: "Customer A",
    customer_phone: "0812345678",
    delivery_method: "pickup",
    install_option: "none",
    address: "",
    items: [{ item_id: "6", name: "AC", qty: 1, unit_price: 14900 }],
    subtotal: 14900,
    status: "pending_payment",
    payment_status: null,
    payment_charge_id: null,
    paid_at: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

function makePool(seed, options = {}) {
  const orders = new Map();
  if (seed) orders.set(seed.order_code, { ...seed });
  const calls = [];
  const pool = {
    orders,
    calls,
    failWebhookUpdate: false,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, " ").trim();
      calls.push(s);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };
      if (options.schemaReady === false) { const e = new Error("schema missing"); e.code = "42P01"; throw e; }
      if (s.includes("WHERE order_code=$1") && s.includes("FOR UPDATE")) {
        const o = orders.get(params[0]);
        return { rows: o ? [baseRow(o)] : [], rowCount: o ? 1 : 0 };
      }
      if (s.includes("SET payment_provider='omise'") && s.includes("payment_status=$3") && s.includes("payment_charge_id=NULL")) {
        const o = orders.get(params[0]);
        o.payment_method = params[1];
        o.payment_charge_id = null;
        o.payment_status = params[2];
        o.status = "payment_processing";
        return { rows: [baseRow(o)], rowCount: 1 };
      }
      if (s.includes("SET payment_status=$3, status='payment_failed'")) {
        if (options.failureUpdateNoMatch) return { rows: [], rowCount: 0 };
        const o = orders.get(params[0]);
        if (o && o.payment_status === params[1]) {
          o.payment_status = params[2];
          o.status = "payment_failed";
          return { rows: [baseRow(o)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (s.includes("WHERE order_code=$1 AND payment_status=$6")) {
        if (options.failFinalPaymentUpdate || options.failFinalPaymentUpdateCode) {
          const e = new Error("simulated final payment update failure");
          if (options.failFinalPaymentUpdateCode) e.code = options.failFinalPaymentUpdateCode;
          throw e;
        }
        if (options.finalPaymentUpdateNoRows) return { rows: [], rowCount: 0 };
        const o = orders.get(params[0]);
        if (!o || o.payment_status !== params[5]) return { rows: [], rowCount: 0 };
        o.payment_method = params[1];
        o.payment_charge_id = params[2];
        o.payment_status = params[3];
        o.status = params[4];
        if (o.status === "paid" && !o.paid_at) o.paid_at = new Date().toISOString();
        return { rows: [baseRow(o)], rowCount: 1 };
      }
      if (s.includes("WHERE payment_charge_id=$1") && s.includes("FOR UPDATE")) {
        const row = Array.from(orders.values()).find((o) => o.payment_charge_id === params[0]);
        return { rows: row ? [baseRow(row)] : [], rowCount: row ? 1 : 0 };
      }
      if (s.includes("SET payment_charge_id=COALESCE")) {
        if (pool.failWebhookUpdate) throw new Error("simulated db failure");
        const o = orders.get(params[0]);
        if (o) {
          o.payment_charge_id = o.payment_charge_id || params[1];
          o.payment_status = params[2];
          o.status = params[3];
          if (o.status === "paid" && !o.paid_at) o.paid_at = new Date().toISOString();
        }
        return { rows: [], rowCount: o ? 1 : 0 };
      }
      if (s.includes("FROM public.customer_orders WHERE order_code=$1")) {
        const o = orders.get(params[0]);
        return { rows: o ? [baseRow(o)] : [], rowCount: o ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return pool;
}

function fakeOmise(overrides = {}) {
  const spy = { charges: [], retrieve: [] };
  return {
    spy,
    isConfigured: () => overrides.configured !== false,
    isTestMode: () => true,
    getPublicKey: () => overrides.publicKey === undefined ? "pkey_test_123" : overrides.publicKey,
    createCardCharge: overrides.createCardCharge || (async ({ amount, token, metadata }) => {
      spy.charges.push({ method: "card", amount, token, metadata });
      return { id: `chrg_${spy.charges.length}`, status: "successful", paid: true, amount: amount * 100, currency: "thb", metadata };
    }),
    createPromptPayCharge: overrides.createPromptPayCharge || (async ({ amount, metadata }) => {
      spy.charges.push({ method: "promptpay", amount, metadata });
      return {
        id: `chrg_${spy.charges.length}`,
        status: "pending",
        paid: false,
        amount: amount * 100,
        currency: "thb",
        metadata,
        source: { scannable_code: { image: { download_uri: "https://cdn.omise.co/qr.png" } } },
      };
    }),
    retrieveCharge: overrides.retrieveCharge || (async (id) => {
      spy.retrieve.push(id);
      return { id, status: "successful", paid: true, amount: 1490000, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "attempt" } };
    }),
  };
}

async function startServer(pool, omiseClient, env = {}) {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      if (String(req.originalUrl || "").split("?")[0] === "/webhooks/omise") req.rawBody = Buffer.from(buf);
    },
  }));
  app.use(createCustomerOrdersRoutes({
    pool,
    omiseClient,
    env: { OMISE_WEBHOOK_SECRET: WEBHOOK_SECRET, ...env },
    requireAdminSession: (_q, _s, next) => next(),
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function url(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function postJson(u, body) {
  return fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
}

function signedHeaders(raw, secretBytes = WEBHOOK_SECRET_BYTES, extraSignature = "") {
  const timestamp = "1770000000";
  const sig = crypto.createHmac("sha256", secretBytes).update(`${timestamp}.${raw}`).digest("hex");
  return {
    "content-type": "application/json",
    "Omise-Signature-Timestamp": timestamp,
    "Omise-Signature": extraSignature ? `${extraSignature},${sig}` : sig,
  };
}

async function postWebhook(server, payload, headers) {
  const raw = JSON.stringify(payload);
  return fetch(`${url(server)}/webhooks/omise`, {
    method: "POST",
    headers: headers || signedHeaders(raw),
    body: raw,
  });
}

test("GET /public/payment-config fails closed without webhook secret and omits card without public key", async () => {
  const noWebhook = await startServer(makePool(seedOrder()), fakeOmise(), { OMISE_WEBHOOK_SECRET: "" });
  try {
    const body = await (await fetch(`${url(noWebhook)}/public/payment-config`)).json();
    assert.equal(body.enabled, false);
    assert.deepEqual(body.methods, []);
  } finally { noWebhook.close(); }

  const noPublic = await startServer(makePool(seedOrder()), fakeOmise({ publicKey: "" }));
  try {
    const body = await (await fetch(`${url(noPublic)}/public/payment-config`)).json();
    assert.equal(body.enabled, true);
    assert.deepEqual(body.methods, ["promptpay"]);
    assert.equal(body.public_key, "");
  } finally { noPublic.close(); }
});

test("invalid Base64 webhook secret disables payment and rejects webhooks", async () => {
  const server = await startServer(makePool(seedOrder()), fakeOmise(), { OMISE_WEBHOOK_SECRET: "not-base64%%%" });
  try {
    const config = await (await fetch(`${url(server)}/public/payment-config`)).json();
    assert.equal(config.enabled, false);
    assert.deepEqual(config.methods, []);
    const raw = JSON.stringify({ data: { object: "charge", id: "chrg_invalid_secret" } });
    const res = await fetch(`${url(server)}/webhooks/omise`, {
      method: "POST",
      headers: signedHeaders(raw),
      body: raw,
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "OMISE_WEBHOOK_NOT_CONFIGURED");
  } finally { server.close(); }
});

test("card payment claims an attempt before charging and uses stored amount with metadata", async () => {
  const pool = makePool(seedOrder());
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  try {
    const res = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x", amount: 1 });
    assert.equal(res.status, 200);
    assert.equal(omise.spy.charges.length, 1);
    assert.equal(omise.spy.charges[0].amount, 14900);
    assert.equal(omise.spy.charges[0].metadata.order_code, "CWF-PAY1");
    assert.match(omise.spy.charges[0].metadata.attempt_id, /^[0-9a-f]{32}$/);
    assert.equal(pool.orders.get("CWF-PAY1").status, "paid");
  } finally { server.close(); }
});

test("paid order is non-payable and does not create an Omise charge", async () => {
  const pool = makePool(seedOrder({ status: "paid", payment_status: "successful", payment_charge_id: "chrg_paid", paid_at: new Date().toISOString() }));
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  try {
    const res = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "ORDER_ALREADY_PAID");
    assert.equal(omise.spy.charges.length, 0);
  } finally { server.close(); }
});

test("concurrent duplicate pay requests create at most one charge", async () => {
  const pool = makePool(seedOrder());
  const omise = fakeOmise({ createPromptPayCharge: async ({ amount, metadata }) => {
    omise.spy.charges.push({ method: "promptpay", amount, metadata });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { id: "chrg_pp", status: "pending", paid: false, amount: amount * 100, currency: "thb", metadata, source: { scannable_code: { image: { download_uri: "qr" } } } };
  } });
  const server = await startServer(pool, omise);
  try {
    const [a, b] = await Promise.all([
      postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" }),
      postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" }),
    ]);
    assert.equal(omise.spy.charges.length, 1);
    assert.ok([200, 202].includes(a.status));
    assert.ok([200, 202].includes(b.status));
  } finally { server.close(); }
});

test("provider success with final DB update failure returns unknown and blocks duplicate charge", async () => {
  const pool = makePool(seedOrder(), { failFinalPaymentUpdate: true });
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  try {
    const first = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    const firstBody = await first.json();
    assert.equal(first.status, 202);
    assert.equal(firstBody.error, "PAYMENT_RESULT_UNKNOWN");
    assert.equal(firstBody.payment.status, "payment_processing");
    assert.equal(firstBody.payment.requires_polling, true);
    assert.equal(firstBody.order.order_code, "CWF-PAY1");
    assert.equal(pool.orders.get("CWF-PAY1").status, "payment_processing");
    assert.equal(omise.spy.charges.length, 1);

    const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    assert.equal(second.status, 202);
    assert.equal((await second.json()).error, "PAYMENT_PROCESSING");
    assert.equal(omise.spy.charges.length, 1);
  } finally { server.close(); }
});

test("schema-classified final DB update failure after charge returns unknown and blocks duplicate charge", async () => {
  const pool = makePool(seedOrder(), { failFinalPaymentUpdateCode: "42703" });
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  try {
    const first = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    const firstBody = await first.json();
    assert.equal(first.status, 202);
    assert.equal(firstBody.error, "PAYMENT_RESULT_UNKNOWN");
    assert.equal(firstBody.payment.status, "payment_processing");
    assert.equal(firstBody.payment.requires_polling, true);
    assert.equal(firstBody.order.order_code, "CWF-PAY1");
    assert.equal(pool.orders.get("CWF-PAY1").status, "payment_processing");
    assert.equal(omise.spy.charges.length, 1);

    const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    assert.equal(second.status, 202);
    assert.ok(["PAYMENT_PROCESSING", "PAYMENT_RESULT_UNKNOWN"].includes((await second.json()).error));
    assert.equal(omise.spy.charges.length, 1);
  } finally { server.close(); }
});

test("final DB update zero rows after charge returns unknown and blocks duplicate charge", async () => {
  const pool = makePool(seedOrder(), { finalPaymentUpdateNoRows: true });
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  try {
    const first = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    const firstBody = await first.json();
    assert.equal(first.status, 202);
    assert.equal(firstBody.error, "PAYMENT_RESULT_UNKNOWN");
    assert.equal(firstBody.payment.status, "payment_processing");
    assert.equal(firstBody.payment.requires_polling, true);
    assert.equal(pool.orders.get("CWF-PAY1").status, "payment_processing");
    assert.equal(omise.spy.charges.length, 1);

    const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "tokn_x" });
    assert.equal(second.status, 202);
    assert.ok(["PAYMENT_PROCESSING", "PAYMENT_RESULT_UNKNOWN"].includes((await second.json()).error));
    assert.equal(omise.spy.charges.length, 1);
  } finally { server.close(); }
});

test("deterministic failure becomes retryable and creates a new attempt B", async () => {
  const pool = makePool(seedOrder());
  let calls = 0;
  const omise = fakeOmise({ createCardCharge: async ({ metadata }) => {
    calls += 1;
    omise.spy.charges.push({ metadata });
    if (calls === 1) {
      const e = new Error("bad token"); e.status = 400; e.code = "bad_request"; throw e;
    }
    return { id: "chrg_ok", status: "successful", paid: true, amount: 1490000, currency: "thb", metadata };
  } });
  const server = await startServer(pool, omise);
  try {
    assert.equal((await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "bad" })).status, 502);
    assert.equal(pool.orders.get("CWF-PAY1").status, "payment_failed");
    const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "ok" });
    assert.equal(second.status, 200);
    assert.notEqual(omise.spy.charges[0].metadata.attempt_id, omise.spy.charges[1].metadata.attempt_id);
  } finally { server.close(); }
});

test("deterministic failure update no-match returns unknown without opening retry", async () => {
  const pool = makePool(seedOrder(), { failureUpdateNoMatch: true });
  const omise = fakeOmise({ createCardCharge: async ({ metadata }) => {
    omise.spy.charges.push({ metadata });
    const e = new Error("bad token"); e.status = 400; e.code = "bad_request"; throw e;
  } });
  const server = await startServer(pool, omise);
  try {
    const first = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "bad" });
    const body = await first.json();
    assert.equal(first.status, 202);
    assert.equal(body.error, "PAYMENT_RESULT_UNKNOWN");
    assert.equal(pool.orders.get("CWF-PAY1").status, "payment_processing");

    const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "card", token: "bad" });
    assert.equal(second.status, 202);
    assert.equal((await second.json()).error, "PAYMENT_PROCESSING");
    assert.equal(omise.spy.charges.length, 1);
  } finally { server.close(); }
});

test("timeout, HTTP 429, and HTTP 5xx remain non-retryable in payment_processing", async () => {
  for (const err of [
    Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
    Object.assign(new Error("rate limited"), { status: 429, code: "rate_limit" }),
    Object.assign(new Error("server error"), { status: 500, code: "server_error" }),
  ]) {
    const pool = makePool(seedOrder());
    const omise = fakeOmise({ createPromptPayCharge: async () => { throw err; } });
    const server = await startServer(pool, omise);
    try {
      const first = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" });
      assert.equal(first.status, 202);
      assert.equal(pool.orders.get("CWF-PAY1").status, "payment_processing");
      const second = await postJson(`${url(server)}/public/orders/CWF-PAY1/pay`, { method: "promptpay" });
      assert.equal(second.status, 202);
      assert.equal(omise.spy.charges.length, 0);
    } finally { server.close(); }
  }
});

test("webhook validates missing, invalid, valid, dual signatures and raw tampering", async () => {
  const pool = makePool(seedOrder({ status: "payment_processing", payment_status: "processing:attempt" }));
  const omise = fakeOmise();
  const server = await startServer(pool, omise);
  const payload = { data: { object: "charge", id: "chrg_sig" } };
  const raw = JSON.stringify(payload);
  try {
    assert.equal((await fetch(`${url(server)}/webhooks/omise`, { method: "POST", headers: { "content-type": "application/json" }, body: raw })).status, 401);
    assert.equal((await postWebhook(server, payload, signedHeaders(raw, Buffer.from("wrong")))).status, 401);
    assert.equal((await postWebhook(server, payload, signedHeaders(raw))).status, 200);

    pool.orders.set("CWF-PAY1", seedOrder({ status: "payment_processing", payment_status: "processing:attempt" }));
    const dual = signedHeaders(raw, WEBHOOK_SECRET_BYTES, "0".repeat(64));
    assert.equal((await postWebhook(server, payload, dual)).status, 200);

    const tamperedHeaders = signedHeaders(raw);
    assert.equal((await postWebhook(server, { data: { object: "charge", id: "different" } }, tamperedHeaders)).status, 401);
  } finally { server.close(); }
});

test("backend pay route accepts only token and Customer App tokenizes card before backend pay", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "..", "server", "routes", "customerOrders.js"), "utf8");
  assert.match(routeSource, /const token = cleanText\(req\.body && req\.body\.token, 200\)/);
  assert.doesNotMatch(routeSource, /card_number|cardNumber|expiration_month|expiration_year|security_code|cvc/i);
  assert.doesNotMatch(routeSource, /console\.(log|warn|error)\([^;\n]*(token|req\.body)/i);

  const storeSource = fs.readFileSync(path.join(__dirname, "..", "customer-app", "modules", "store.js"), "utf8");
  assert.match(storeSource, /Omise\.createToken\("card"/);
  assert.match(storeSource, /payOrder\(o\.order\.order_code, \{ method: "card", token \}\)/);
});

test("webhook recovery requires matching order, attempt, amount and THB currency", async () => {
  const pool = makePool(seedOrder({ status: "payment_processing", payment_status: "processing:attemptA" }));
  const omise = fakeOmise({ retrieveCharge: async (id) => ({ id, status: "successful", paid: true, amount: 1490000, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "attemptA" } }) });
  const server = await startServer(pool, omise);
  try {
    const res = await postWebhook(server, { data: { object: "charge", id: "chrg_recover" } });
    assert.equal(res.status, 200);
    const order = pool.orders.get("CWF-PAY1");
    assert.equal(order.status, "paid");
    assert.equal(order.payment_charge_id, "chrg_recover");
  } finally { server.close(); }
});

test("webhook amount or currency mismatch is ignored without mutating the order", async () => {
  for (const charge of [
    { id: "chrg_bad_amount", status: "successful", paid: true, amount: 100, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "attemptA" } },
    { id: "chrg_bad_currency", status: "successful", paid: true, amount: 1490000, currency: "usd", metadata: { order_code: "CWF-PAY1", attempt_id: "attemptA" } },
  ]) {
    const pool = makePool(seedOrder({ status: "payment_processing", payment_status: "processing:attemptA" }));
    const omise = fakeOmise({ retrieveCharge: async () => charge });
    const server = await startServer(pool, omise);
    try {
      const res = await postWebhook(server, { data: { object: "charge", id: charge.id } });
      assert.equal(res.status, 200);
      const order = pool.orders.get("CWF-PAY1");
      assert.equal(order.status, "payment_processing");
      assert.equal(order.payment_charge_id, null);
    } finally { server.close(); }
  }
});

test("webhook attempt mismatch and old attempt A cannot mutate newer attempt B", async () => {
  const pool = makePool(seedOrder({ status: "payment_processing", payment_status: "processing:attemptB" }));
  const omise = fakeOmise({ retrieveCharge: async (id) => ({ id, status: "failed", paid: false, amount: 1490000, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "attemptA" } }) });
  const server = await startServer(pool, omise);
  try {
    const res = await postWebhook(server, { data: { object: "charge", id: "chrg_old" } });
    assert.equal(res.status, 200);
    const order = pool.orders.get("CWF-PAY1");
    assert.equal(order.status, "payment_processing");
    assert.equal(order.payment_status, "processing:attemptB");
    assert.equal(order.payment_charge_id, null);
  } finally { server.close(); }
});

test("webhook replay is idempotent and paid order is not downgraded", async () => {
  const paidAt = "2026-07-05T00:00:00.000Z";
  const pool = makePool(seedOrder({ status: "paid", payment_status: "successful", payment_charge_id: "chrg_paid", paid_at: paidAt }));
  const omise = fakeOmise({ retrieveCharge: async (id) => ({ id, status: "failed", paid: false, amount: 1490000, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "old" } }) });
  const server = await startServer(pool, omise);
  try {
    const first = await postWebhook(server, { data: { object: "charge", id: "chrg_paid" } });
    const second = await postWebhook(server, { data: { object: "charge", id: "chrg_paid" } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const order = pool.orders.get("CWF-PAY1");
    assert.equal(order.status, "paid");
    assert.equal(order.paid_at, paidAt);
  } finally { server.close(); }
});

test("webhook transient DB failure is not acknowledged as successful", async () => {
  const pool = makePool(seedOrder({ status: "payment_processing", payment_status: "processing:attempt" }));
  pool.failWebhookUpdate = true;
  const omise = fakeOmise({ retrieveCharge: async (id) => ({ id, status: "successful", paid: true, amount: 1490000, currency: "thb", metadata: { order_code: "CWF-PAY1", attempt_id: "attempt" } }) });
  const server = await startServer(pool, omise);
  try {
    const res = await postWebhook(server, { data: { object: "charge", id: "chrg_fail" } });
    assert.equal(res.status, 502);
  } finally { server.close(); }
});
