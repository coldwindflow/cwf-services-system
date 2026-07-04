"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createCustomerOrdersRoutes, normalizeOrder, generateOrderCode, catalogEffectiveUnitPrice } = require("../server/routes/customerOrders");

function makePool({ schemaReady = true, items = [], rules = [] } = {}) {
  const rows = [];
  const pool = {
    rows,
    async query(sql, params = []) {
      const s = String(sql).replace(/\s+/g, " ");
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [] };
      if (!schemaReady) { const e = new Error("schema missing"); e.code = "42703"; throw e; }
      if (s.includes("FROM public.catalog_items ci")) {
        const ids = new Set((params[0] || []).map((x) => String(x)));
        return {
          rows: items.filter((item) => ids.has(String(item.item_id))).map((item) => {
            const rule = item.price_rule_id ? rules.find((r) => String(r.rule_id) === String(item.price_rule_id)) : null;
            return {
              ...item,
              rule_active_price: rule ? rule.active_price : null,
              rule_is_active: rule ? rule.is_active : null,
              rule_effective_from: rule ? rule.effective_from : null,
              rule_effective_to: rule ? rule.effective_to : null,
            };
          }),
        };
      }
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
      if (s.includes("FROM public.customer_orders WHERE order_code=$1")) {
        const found = rows.find((r) => r.order_code === params[0]);
        return { rows: found ? [found] : [] };
      }
      if (s.includes("ORDER BY created_at DESC")) return { rows: rows.slice() };
      return { rows: [] };
    },
  };
  return pool;
}

function sampleItem(extra = {}) {
  return {
    item_id: 6,
    item_name: "Server AC 12000 BTU",
    base_price: 14900,
    is_active: true,
    is_customer_visible: true,
    booking_mode: "purchase",
    price_rule_id: null,
    ...extra,
  };
}

function validPayload(extra = {}) {
  return {
    customer_name: "Customer A",
    customer_phone: "0812345678",
    delivery_method: "ship",
    install_option: "cwf",
    address: "123 Test Road",
    items: [{ item_id: "6", qty: 2, name: "Fake", unit_price: 1 }],
    ...extra,
  };
}

async function startServer(pool) {
  const app = express();
  app.use(express.json());
  app.use(createCustomerOrdersRoutes({ pool, requireAdminSession: (_q, _s, next) => next() }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function postOrder(server, payload) {
  return fetch(`${baseUrl(server)}/public/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("normalizeOrder rejects malformed quantities instead of coercing to one", () => {
  assert.equal(normalizeOrder(validPayload({ items: [{ item_id: "6", qty: "abc" }] })).ok, false);
  assert.equal(normalizeOrder(validPayload({ items: [{ item_id: "6", qty: 1.5 }] })).ok, false);
  assert.equal(normalizeOrder(validPayload({ items: [{ item_id: "6", qty: 0 }] })).ok, false);
});

test("generateOrderCode produces a CWF-prefixed code", () => {
  assert.match(generateOrderCode(), /^CWF-[0-9A-Z]+$/);
});

test("POST /public/orders ignores client price/name and stores server catalog snapshot", async () => {
  const pool = makePool({ items: [sampleItem()] });
  const server = await startServer(pool);
  try {
    const res = await postOrder(server, validPayload());
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.order.subtotal, 29800);
    assert.equal(body.order.items[0].name, "Server AC 12000 BTU");
    assert.equal(body.order.items[0].unit_price, 14900);
    assert.equal(pool.rows[0].items[0].name, "Server AC 12000 BTU");
  } finally {
    server.close();
  }
});

test("POST /public/orders rejects missing, inactive, hidden, and non-purchase items", async () => {
  for (const [label, items] of [
    ["missing", []],
    ["inactive", [sampleItem({ is_active: false })]],
    ["hidden", [sampleItem({ is_customer_visible: false })]],
    ["non-purchase", [sampleItem({ booking_mode: "contact_admin" })]],
  ]) {
    const server = await startServer(makePool({ items }));
    try {
      const res = await postOrder(server, validPayload());
      assert.equal(res.status, 400, label);
      assert.equal((await res.json()).error, "ORDER_ITEM_VALIDATION_FAILED");
    } finally {
      server.close();
    }
  }
});

test("checkout pricing matches public catalog rule for active/expired/future/inactive promotion", async () => {
  const now = Date.now();
  const cases = [
    [{ is_active: true, effective_from: null, effective_to: null }, 12000],
    [{ is_active: true, effective_from: "2000-01-01T00:00:00Z", effective_to: "2000-02-01T00:00:00Z" }, 14900],
    [{ is_active: true, effective_from: "2999-01-01T00:00:00Z", effective_to: null }, 14900],
    [{ is_active: false, effective_from: null, effective_to: null }, 14900],
  ];
  for (const [ruleFields, expected] of cases) {
    assert.equal(catalogEffectiveUnitPrice({
      ...sampleItem({ price_rule_id: 9 }),
      rule_active_price: 12000,
      rule_is_active: ruleFields.is_active,
      rule_effective_from: ruleFields.effective_from,
      rule_effective_to: ruleFields.effective_to,
    }, now), expected);
  }
});

test("POST /public/orders uses active promotion price and falls back to base when inactive", async () => {
  const active = await startServer(makePool({
    items: [sampleItem({ price_rule_id: 1 })],
    rules: [{ rule_id: 1, active_price: 12000, is_active: true, effective_from: null, effective_to: null }],
  }));
  try {
    const body = await (await postOrder(active, validPayload({ items: [{ item_id: "6", qty: 1, unit_price: 1 }] }))).json();
    assert.equal(body.order.subtotal, 12000);
  } finally {
    active.close();
  }

  const inactive = await startServer(makePool({
    items: [sampleItem({ price_rule_id: 1 })],
    rules: [{ rule_id: 1, active_price: 12000, is_active: false, effective_from: null, effective_to: null }],
  }));
  try {
    const body = await (await postOrder(inactive, validPayload({ items: [{ item_id: "6", qty: 1, unit_price: 1 }] }))).json();
    assert.equal(body.order.subtotal, 14900);
  } finally {
    inactive.close();
  }
});

test("duplicate item lines aggregate before max quantity enforcement", async () => {
  const server = await startServer(makePool({ items: [sampleItem()] }));
  try {
    const res = await postOrder(server, validPayload({
      items: [{ item_id: "6", qty: 60 }, { item_id: "6", qty: 40 }],
    }));
    assert.equal(res.status, 400);
    assert.match(JSON.stringify((await res.json()).details), /exceeds max/);
  } finally {
    server.close();
  }
});

test("purchase/pricing schema not ready fails closed instead of trusting client price", async () => {
  const server = await startServer(makePool({ schemaReady: false, items: [sampleItem()] }));
  try {
    const res = await postOrder(server, validPayload());
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "ORDERS_SCHEMA_NOT_READY");
  } finally {
    server.close();
  }
});
