"use strict";

// Customer product orders (buy flow — Phase 2).
//
// Self-contained router: a customer places an order from the app's purchase
// sheet (POST /public/orders), can look it up by code (GET /public/orders/:code),
// and admins can list orders (GET /admin/orders). Payment is a later phase —
// an order starts as "pending_payment". This module deliberately does NOT touch
// booking, pricing, payout, or accounting logic.

const express = require("express");

const DELIVERY_METHODS = new Set(["pickup", "ship"]);
const INSTALL_OPTIONS = new Set(["none", "cwf"]);
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

function isSchemaError(error) {
  const code = error && error.code;
  return code === "42P01" || code === "42703"; // undefined_table / undefined_column
}

function createCustomerOrdersRoutes(deps = {}) {
  const { pool, requireAdminSession } = deps;
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

  // Admin: list recent orders (read-only).
  router.get("/admin/orders", adminGuard, async (_req, res) => {
    try {
      const rows = await pool.query(
        `SELECT order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at
           FROM public.customer_orders ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({ ok: true, orders: rows.rows.map(publicOrder) });
    } catch (error) {
      if (isSchemaError(error)) return res.json({ ok: true, orders: [], schema_ready: false });
      console.error("[orders/admin-list] failed", error);
      return res.status(500).json({ error: "โหลดรายการคำสั่งซื้อไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = { createCustomerOrdersRoutes, normalizeOrder, generateOrderCode, publicOrder };
