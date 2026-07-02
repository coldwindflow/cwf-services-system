"use strict";

// Customer product orders (buy flow — Phase 2).
//
// Self-contained router: a customer places an order from the app's purchase
// sheet (POST /public/orders), can look it up by code (GET /public/orders/:code),
// and admins can list orders (GET /admin/orders). Payment is a later phase —
// an order starts as "pending_payment". This module deliberately does NOT touch
// booking, pricing, payout, or accounting logic.

const express = require("express");
const { createOmiseClient, chargeToOrderStatus, promptPayQrUri } = require("../services/omise");

const DELIVERY_METHODS = new Set(["pickup", "ship"]);
const INSTALL_OPTIONS = new Set(["none", "cwf"]);
const PAYMENT_METHODS = new Set(["card", "promptpay"]);
// An order can only START a payment from one of these states (a fresh order, or
// one whose previous attempt failed). This blocks paying twice for one order.
const PAYABLE_STATUSES = new Set(["pending_payment", "payment_failed"]);
const MAX_ITEMS = 20;
const MAX_QTY = 99;

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

// A short human-friendly order code, e.g. "CWF-LM= K3F9" without spaces:
// CWF + base36(time) + 3 random chars. Uppercased, easy to read back to staff.
function generateOrderCode() {
  const t = Date.now().toString(36).toUpperCase();
  let rand = "";
  for (let i = 0; i < 3; i += 1) rand += "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)];
  return `CWF-${t}${rand}`;
}

// Validate + normalize an incoming order payload. Prices/subtotal are computed
// server-side from the submitted line items (never trust a client total).
function normalizeOrder(input) {
  const errors = [];
  const body = input && typeof input === "object" ? input : {};

  const name = cleanText(body.customer_name, 120);
  const phone = cleanText(body.customer_phone, 40);
  if (!name) errors.push("customer_name required");
  if (!phone) errors.push("customer_phone required");

  const delivery = cleanText(body.delivery_method, 20) || "pickup";
  if (!DELIVERY_METHODS.has(delivery)) errors.push("delivery_method invalid");
  const install = cleanText(body.install_option, 20) || "none";
  if (!INSTALL_OPTIONS.has(install)) errors.push("install_option invalid");

  const address = cleanText(body.address, 500);
  if (delivery === "ship" && !address) errors.push("address required for shipping");

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) errors.push("items required");
  if (rawItems.length > MAX_ITEMS) errors.push("too many items");

  let subtotal = 0;
  const items = rawItems.slice(0, MAX_ITEMS).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const itemId = cleanText(item.item_id, 80);
    const itemName = cleanText(item.name || item.item_name, 200);
    const qty = Math.max(1, Math.min(MAX_QTY, Math.round(Number(item.qty) || 0)));
    const unitPrice = Number(item.unit_price);
    if (!itemId) errors.push(`items.${index}.item_id required`);
    if (!itemName) errors.push(`items.${index}.name required`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.push(`items.${index}.unit_price invalid`);
    const safePrice = Number.isFinite(unitPrice) && unitPrice >= 0 ? Math.round(unitPrice * 100) / 100 : 0;
    subtotal += safePrice * qty;
    return { item_id: itemId, name: itemName, qty, unit_price: safePrice };
  });

  return {
    ok: errors.length === 0,
    errors,
    value: {
      customer_name: name,
      customer_phone: phone,
      delivery_method: delivery,
      install_option: install,
      address,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      note: cleanText(body.note, 500),
    },
  };
}

// Only fields safe to return to the customer for an order.
function publicOrder(row) {
  if (!row) return null;
  return {
    order_code: row.order_code,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    delivery_method: row.delivery_method,
    install_option: row.install_option,
    address: row.address || "",
    items: Array.isArray(row.items) ? row.items : (row.items || []),
    subtotal: Number(row.subtotal) || 0,
    status: row.status,
    created_at: row.created_at,
  };
}

// Admin view: everything in publicOrder plus payment details (for the orders
// dashboard). note is admin-only too.
function adminOrder(row) {
  const base = publicOrder(row);
  if (!base) return null;
  return {
    ...base,
    note: row.note || "",
    payment_method: row.payment_method || "",
    payment_status: row.payment_status || "",
    payment_charge_id: row.payment_charge_id || "",
    paid_at: row.paid_at || null,
  };
}

function isUndefinedColumn(error) {
  return error && error.code === "42703";
}

function isSchemaError(error) {
  const code = error && error.code;
  return code === "42P01" || code === "42703"; // undefined_table / undefined_column
}

function createCustomerOrdersRoutes(deps = {}) {
  const { pool, requireAdminSession } = deps;
  // Injectable so tests can drive a fake Omise; defaults to an env-keyed client.
  const omise = deps.omiseClient || createOmiseClient({ env: deps.env || process.env });
  const router = express.Router();
  const adminGuard = typeof requireAdminSession === "function" ? requireAdminSession : (_req, _res, next) => next();

  // Create an order (public — customer may be a guest).
  router.post("/public/orders", async (req, res) => {
    const result = normalizeOrder(req.body);
    if (!result.ok) return res.status(400).json({ error: "VALIDATION_FAILED", details: result.errors });
    const o = result.value;
    // A few attempts in the unlikely event of an order_code collision.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateOrderCode();
      try {
        const inserted = await pool.query(
          `INSERT INTO public.customer_orders
             (order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pending_payment',$9)
           RETURNING order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at`,
          [code, o.customer_name, o.customer_phone, o.delivery_method, o.install_option, o.address || null,
            JSON.stringify(o.items), o.subtotal, o.note || null]
        );
        return res.status(201).json({ ok: true, order: publicOrder(inserted.rows[0]) });
      } catch (error) {
        if (error && error.code === "23505") continue; // unique_violation on order_code → retry
        if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
        console.error("[orders/create] failed", error);
        return res.status(500).json({ error: "สร้างคำสั่งซื้อไม่สำเร็จ" });
      }
    }
    return res.status(500).json({ error: "สร้างคำสั่งซื้อไม่สำเร็จ" });
  });

  // Look up one order by its code (public — the code is the access token).
  router.get("/public/orders/:code", async (req, res) => {
    const code = cleanText(req.params.code, 40);
    if (!code) return res.status(400).json({ error: "order code required" });
    try {
      const found = await pool.query(
        `SELECT order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at
           FROM public.customer_orders WHERE order_code=$1 LIMIT 1`,
        [code]
      );
      if (!found.rows.length) return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
      return res.json({ ok: true, order: publicOrder(found.rows[0]) });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/get] failed", error);
      return res.status(500).json({ error: "โหลดคำสั่งซื้อไม่สำเร็จ" });
    }
  });

  // Public: what the customer app needs to render the payment step. Exposes the
  // PUBLIC key only (safe to ship to the browser) — never the secret key.
  router.get("/public/payment-config", (_req, res) => {
    const enabled = omise.isConfigured();
    return res.json({
      enabled,
      provider: "omise",
      public_key: enabled ? omise.getPublicKey() : "",
      test_mode: enabled ? omise.isTestMode() : false,
      methods: ["promptpay", "card"],
    });
  });

  // Pay for an order. The amount is ALWAYS the server-stored subtotal — the
  // client cannot influence how much is charged. Card: pass a one-time token
  // from Omise.js (card data never reaches us). PromptPay: we return a QR to
  // scan; the actual payment is confirmed later by the Omise webhook.
  router.post("/public/orders/:code/pay", async (req, res) => {
    if (!omise.isConfigured()) return res.status(503).json({ error: "PAYMENT_NOT_CONFIGURED" });
    const code = cleanText(req.params.code, 40);
    if (!code) return res.status(400).json({ error: "order code required" });
    const method = cleanText(req.body && req.body.method, 20);
    if (!PAYMENT_METHODS.has(method)) return res.status(400).json({ error: "payment method invalid" });
    const token = cleanText(req.body && req.body.token, 200);
    if (method === "card" && !token) return res.status(400).json({ error: "card token required" });

    let order;
    try {
      const found = await pool.query(
        `SELECT order_code, subtotal, status FROM public.customer_orders WHERE order_code=$1 LIMIT 1`,
        [code]
      );
      if (!found.rows.length) return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
      order = found.rows[0];
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/pay:lookup] failed", error);
      return res.status(500).json({ error: "เริ่มการชำระเงินไม่สำเร็จ" });
    }

    if (!PAYABLE_STATUSES.has(order.status)) {
      // Already paid or a payment is already in progress — tell the client so it
      // can just poll the order status instead of charging again.
      return res.status(409).json({ error: "ORDER_NOT_PAYABLE", status: order.status });
    }
    const amount = Number(order.subtotal) || 0;
    if (amount <= 0) return res.status(400).json({ error: "ยอดชำระไม่ถูกต้อง" });

    let charge;
    try {
      const metadata = { order_code: code };
      charge = method === "card"
        ? await omise.createCardCharge({ amount, token, metadata })
        : await omise.createPromptPayCharge({ amount, metadata });
    } catch (error) {
      console.error("[orders/pay:charge] failed", error && error.code);
      return res.status(502).json({ error: "ชำระเงินไม่สำเร็จ กรุณาลองใหม่", code: error && error.code });
    }

    const mapped = chargeToOrderStatus(charge);
    try {
      const updated = await pool.query(
        `UPDATE public.customer_orders
            SET payment_provider='omise', payment_method=$2, payment_charge_id=$3,
                payment_status=$4, status=$5,
                paid_at = CASE WHEN $5='paid' THEN now() ELSE paid_at END,
                updated_at = now()
          WHERE order_code=$1
          RETURNING order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at`,
        [code, method, charge.id || null, (charge && charge.status) || null, mapped]
      );
      return res.json({
        ok: true,
        order: publicOrder(updated.rows[0]),
        payment: {
          method,
          status: mapped,
          charge_id: charge.id || null,
          // PromptPay only: the QR the customer scans in their banking app.
          qr_uri: method === "promptpay" ? promptPayQrUri(charge) : null,
          // The client should poll GET /public/orders/:code until status leaves
          // 'payment_processing' (PromptPay) — card resolves synchronously.
          requires_polling: mapped === "payment_processing",
        },
      });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/pay:update] failed", error);
      return res.status(500).json({ error: "บันทึกผลการชำระเงินไม่สำเร็จ" });
    }
  });

  // Omise webhook. Omise webhooks are NOT signed, so we never trust the payload:
  // we take the charge id from it, re-fetch the charge from Omise (source of
  // truth), then update the matching order. Idempotent — replays are no-ops.
  // Always answer 200 so Omise stops retrying a delivered event.
  router.post("/webhooks/omise", async (req, res) => {
    try {
      const event = req.body && typeof req.body === "object" ? req.body : {};
      const data = event.data && typeof event.data === "object" ? event.data : {};
      // The event data object may be the charge, or (for source events) carry it.
      const chargeId = cleanText(data.object === "charge" ? data.id : (data.charge || ""), 80);
      if (!chargeId || !omise.isConfigured()) return res.json({ ok: true, ignored: true });

      const charge = await omise.retrieveCharge(chargeId).catch(() => null);
      if (!charge || !charge.id) return res.json({ ok: true, ignored: true });
      const mapped = chargeToOrderStatus(charge);

      await pool.query(
        `UPDATE public.customer_orders
            SET payment_status=$2, status=$3,
                paid_at = CASE WHEN $3='paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
                updated_at = now()
          WHERE payment_charge_id=$1`,
        [charge.id, charge.status || null, mapped]
      );
      return res.json({ ok: true });
    } catch (error) {
      if (isSchemaError(error)) return res.json({ ok: true, ignored: true });
      console.error("[orders/webhook] failed", error);
      // Still 200: a 500 makes Omise retry a payload we can't process anyway.
      return res.json({ ok: false });
    }
  });

  // Admin: list recent orders (read-only). Includes payment details when the
  // payment columns exist; on a DB that has orders but not yet the payment
  // migration, it falls back to the base columns so the list still loads.
  const ADMIN_BASE_COLUMNS = "order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, note, created_at";
  const ADMIN_PAYMENT_COLUMNS = "payment_method, payment_status, payment_charge_id, paid_at";
  router.get("/admin/orders", adminGuard, async (_req, res) => {
    try {
      let rows;
      try {
        rows = await pool.query(
          `SELECT ${ADMIN_BASE_COLUMNS}, ${ADMIN_PAYMENT_COLUMNS}
             FROM public.customer_orders ORDER BY created_at DESC LIMIT 200`
        );
      } catch (inner) {
        if (!isUndefinedColumn(inner)) throw inner; // real error → outer catch
        rows = await pool.query(
          `SELECT ${ADMIN_BASE_COLUMNS}
             FROM public.customer_orders ORDER BY created_at DESC LIMIT 200`
        );
      }
      return res.json({ ok: true, orders: rows.rows.map(adminOrder) });
    } catch (error) {
      if (isSchemaError(error)) return res.json({ ok: true, orders: [], schema_ready: false });
      console.error("[orders/admin-list] failed", error);
      return res.status(500).json({ error: "โหลดรายการคำสั่งซื้อไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = { createCustomerOrdersRoutes, normalizeOrder, generateOrderCode, publicOrder, adminOrder };
