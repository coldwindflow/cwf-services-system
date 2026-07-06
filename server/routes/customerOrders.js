"use strict";

// Customer product orders (buy flow).
//
// Security invariants:
// - Checkout snapshots product name/price from catalog tables only.
// - Payment claims a unique attempt before any Omise call.
// - Webhooks are verified, then reconciled against the real Omise charge.

const express = require("express");
const crypto = require("crypto");
const {
  createOmiseClient,
  chargeToOrderStatus,
  promptPayQrUri,
  bahtToSatang,
  isAmbiguousOmiseError,
  isRetryableOmiseRejection,
} = require("../services/omise");

const DELIVERY_METHODS = new Set(["pickup", "ship"]);
const INSTALL_OPTIONS = new Set(["none", "cwf"]);
const PAYMENT_METHODS = new Set(["card", "promptpay"]);
const FULFILLMENT_STATUSES = new Set(["confirmed", "preparing", "shipped", "installing", "completed", "cancelled"]);
const PAYABLE_STATUSES = new Set(["pending_payment", "payment_failed"]);
const PROCESSING_STATUS = "payment_processing";
const PAYMENT_ATTEMPT_PREFIX = "processing:";
const MAX_ITEMS = 20;
const MAX_QTY = 99;

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function generateOrderCode() {
  const t = Date.now().toString(36).toUpperCase();
  let rand = "";
  for (let i = 0; i < 3; i += 1) rand += "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)];
  return `CWF-${t}${rand}`;
}

function newAttemptId() {
  return crypto.randomBytes(16).toString("hex");
}

function currentAttemptId(value) {
  const s = cleanText(value, 200);
  return s.startsWith(PAYMENT_ATTEMPT_PREFIX) ? s.slice(PAYMENT_ATTEMPT_PREFIX.length) : "";
}

function paymentStatusForOutput(value) {
  const s = cleanText(value, 200);
  return s.startsWith(PAYMENT_ATTEMPT_PREFIX) ? "processing" : s;
}

function isPaymentInFlight(row) {
  return row && (row.status === PROCESSING_STATUS || Boolean(currentAttemptId(row.payment_status)));
}

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

  const aggregate = new Map();
  rawItems.forEach((raw, index) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const itemId = cleanText(item.item_id, 80);
    if (!itemId) errors.push(`items.${index}.item_id required`);
    if (itemId && !/^\d+$/.test(itemId)) errors.push(`items.${index}.item_id invalid`);

    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      errors.push(`items.${index}.qty invalid`);
      return;
    }
    if (!itemId || !/^\d+$/.test(itemId)) return;
    aggregate.set(itemId, (aggregate.get(itemId) || 0) + qty);
  });

  const items = Array.from(aggregate.entries()).map(([item_id, qty]) => ({ item_id, qty }));
  if (items.length > MAX_ITEMS) errors.push("too many items");
  items.forEach((item) => {
    if (item.qty > MAX_QTY) errors.push(`items.${item.item_id}.qty exceeds max`);
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
      note: cleanText(body.note, 500),
    },
  };
}

function catalogRuleCurrentlyActive(row, nowMs = Date.now()) {
  if (row.price_rule_id == null || !row.rule_is_active) return false;
  const from = row.rule_effective_from ? new Date(row.rule_effective_from).getTime() : null;
  const to = row.rule_effective_to ? new Date(row.rule_effective_to).getTime() : null;
  const afterStart = from === null || Number.isNaN(from) || nowMs >= from;
  const beforeEnd = to === null || Number.isNaN(to) || nowMs <= to;
  return afterStart && beforeEnd;
}

function catalogEffectiveUnitPrice(row, nowMs = Date.now()) {
  return money(catalogRuleCurrentlyActive(row, nowMs) ? row.rule_active_price : row.base_price);
}

async function withDbClient(pool, fn) {
  if (pool && typeof pool.connect === "function") {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      if (client && typeof client.release === "function") client.release();
    }
  }
  return fn(pool);
}

async function inTransaction(pool, fn) {
  return withDbClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    }
  });
}

async function buildServerOrderSnapshot(client, normalized) {
  const itemIds = normalized.items.map((item) => Number(item.item_id));
  const result = await client.query(
    `SELECT ci.item_id, ci.item_name, ci.base_price, ci.is_active, ci.is_customer_visible,
            ci.booking_mode, ci.price_rule_id,
            pr.active_price AS rule_active_price, pr.is_active AS rule_is_active,
            pr.effective_from AS rule_effective_from, pr.effective_to AS rule_effective_to
       FROM public.catalog_items ci
       LEFT JOIN public.customer_service_price_rules pr ON pr.rule_id = ci.price_rule_id
      WHERE ci.item_id = ANY($1::bigint[])`,
    [itemIds]
  );
  const byId = new Map((result.rows || []).map((row) => [String(row.item_id), row]));
  const errors = [];
  let subtotal = 0;
  const items = [];
  for (const requested of normalized.items) {
    const row = byId.get(String(requested.item_id));
    if (!row) { errors.push(`items.${requested.item_id} not found`); continue; }
    if (row.is_active !== true) errors.push(`items.${requested.item_id} inactive`);
    if (row.is_customer_visible !== true) errors.push(`items.${requested.item_id} hidden`);
    if (row.booking_mode !== "purchase") errors.push(`items.${requested.item_id} not purchase`);
    const unitPrice = catalogEffectiveUnitPrice(row);
    if (!(unitPrice > 0)) errors.push(`items.${requested.item_id} price invalid`);
    const lineTotal = money(unitPrice * requested.qty);
    subtotal = money(subtotal + lineTotal);
    items.push({
      item_id: String(row.item_id),
      name: row.item_name,
      item_name: row.item_name,
      qty: requested.qty,
      unit_price: unitPrice,
      line_total: lineTotal,
    });
  }
  if (errors.length) {
    const err = new Error("ORDER_ITEM_VALIDATION_FAILED");
    err.code = "ORDER_ITEM_VALIDATION_FAILED";
    err.details = errors;
    throw err;
  }
  return { items, subtotal };
}

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
    fulfillment_status: row.fulfillment_status || "",
    admin_note: row.admin_note || "",
    created_at: row.created_at,
  };
}

function adminOrder(row) {
  const base = publicOrder(row);
  if (!base) return null;
  return {
    ...base,
    note: row.note || "",
    payment_method: row.payment_method || "",
    payment_status: paymentStatusForOutput(row.payment_status),
    payment_charge_id: row.payment_charge_id || "",
    paid_at: row.paid_at || null,
  };
}

function isUndefinedColumn(error) {
  return error && error.code === "42703";
}

function isSchemaError(error) {
  const code = error && error.code;
  return code === "42P01" || code === "42703";
}

function decodeOmiseWebhookSecret(secret) {
  const raw = cleanText(secret, 1000);
  if (!raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const decoded = Buffer.from(raw, "base64");
  if (!decoded.length) return null;
  const normalizedInput = raw.replace(/=+$/, "");
  const normalizedOutput = decoded.toString("base64").replace(/=+$/, "");
  return normalizedInput === normalizedOutput ? decoded : null;
}

function getWebhookSecret(env) {
  return decodeOmiseWebhookSecret(env && env.OMISE_WEBHOOK_SECRET);
}

function paymentReadiness(omise, env) {
  const webhookReady = Boolean(getWebhookSecret(env));
  const secretReady = omise.isConfigured();
  const publicKey = cleanText(omise.getPublicKey && omise.getPublicKey(), 200);
  const enabled = secretReady && webhookReady;
  return {
    enabled,
    secretReady,
    webhookReady,
    publicKey,
    methods: enabled ? ["promptpay", ...(publicKey ? ["card"] : [])] : [],
  };
}

function safeHeader(req, name) {
  return (typeof req.get === "function" ? req.get(name) : (req.headers && req.headers[name.toLowerCase()])) || "";
}

function signatureCandidates(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.includes("=") ? part.split("=").pop().trim() : part)
    .filter(Boolean);
}

function verifyOmiseWebhookSignature(req, secretKey) {
  const timestamp = cleanText(safeHeader(req, "Omise-Signature-Timestamp"), 80);
  const header = safeHeader(req, "Omise-Signature");
  const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody || "");
  if (!Buffer.isBuffer(secretKey) || !secretKey.length || !timestamp || !header || !raw.length) return { ok: false };
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]);
  const expected = crypto.createHmac("sha256", secretKey).update(signed).digest();
  for (const candidate of signatureCandidates(header)) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    const actual = Buffer.from(candidate, "hex");
    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return { ok: true };
  }
  return { ok: false };
}

function chargeMetadata(charge) {
  return charge && charge.metadata && typeof charge.metadata === "object" ? charge.metadata : {};
}

function chargeAmountMatchesOrder(charge, order) {
  return Number(charge && charge.amount) === bahtToSatang(order && order.subtotal);
}

function chargeCurrencyIsThb(charge) {
  return String(charge && charge.currency || "").toLowerCase() === "thb";
}

async function applyVerifiedCharge(pool, charge) {
  return inTransaction(pool, async (client) => {
    const metadata = chargeMetadata(charge);
    const metaOrderCode = cleanText(metadata.order_code, 40);
    const metaAttemptId = cleanText(metadata.attempt_id, 120);
    let found = await client.query(
      `SELECT order_code, subtotal, status, payment_status, payment_charge_id, paid_at
         FROM public.customer_orders
        WHERE payment_charge_id=$1
        FOR UPDATE`,
      [charge.id]
    );
    let order = found.rows[0] || null;
    let matchedBy = order ? "charge_id" : "";

    if (!order && metaOrderCode && metaAttemptId) {
      found = await client.query(
        `SELECT order_code, subtotal, status, payment_status, payment_charge_id, paid_at
           FROM public.customer_orders
          WHERE order_code=$1
          FOR UPDATE`,
        [metaOrderCode]
      );
      const candidate = found.rows[0] || null;
      if (candidate && candidate.status === PROCESSING_STATUS && currentAttemptId(candidate.payment_status) === metaAttemptId) {
        order = candidate;
        matchedBy = "metadata";
      }
    }

    if (!order) return { status: 200, body: { ok: true, ignored: true } };
    if (metaOrderCode && metaOrderCode !== order.order_code) return { status: 200, body: { ok: true, ignored: true } };
    if (matchedBy === "metadata" && currentAttemptId(order.payment_status) !== metaAttemptId) {
      return { status: 200, body: { ok: true, ignored: true } };
    }
    if (!chargeAmountMatchesOrder(charge, order) || !chargeCurrencyIsThb(charge)) {
      return { status: 200, body: { ok: true, ignored: true } };
    }
    if (order.status === "paid") return { status: 200, body: { ok: true, replayed: true } };

    const mapped = chargeToOrderStatus(charge);
    await client.query(
      `UPDATE public.customer_orders
          SET payment_charge_id=COALESCE(payment_charge_id, $2),
              payment_status=$3,
              status=$4,
              paid_at = CASE WHEN $4='paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
              updated_at=now()
        WHERE order_code=$1`,
      [order.order_code, charge.id, charge.status || null, mapped]
    );
    return { status: 200, body: { ok: true } };
  });
}

function createCustomerOrdersRoutes(deps = {}) {
  const { pool, requireAdminSession } = deps;
  const env = deps.env || process.env;
  const omise = deps.omiseClient || createOmiseClient({ env });
  const router = express.Router();
  const adminGuard = typeof requireAdminSession === "function" ? requireAdminSession : (_req, _res, next) => next();

  router.post("/public/orders", async (req, res) => {
    const result = normalizeOrder(req.body);
    if (!result.ok) return res.status(400).json({ error: "VALIDATION_FAILED", details: result.errors });
    const o = result.value;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateOrderCode();
      try {
        const inserted = await inTransaction(pool, async (client) => {
          const snapshot = await buildServerOrderSnapshot(client, o);
          return client.query(
            `INSERT INTO public.customer_orders
               (order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pending_payment',$9)
             RETURNING order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at`,
            [code, o.customer_name, o.customer_phone, o.delivery_method, o.install_option, o.address || null,
              JSON.stringify(snapshot.items), snapshot.subtotal, o.note || null]
          );
        });
        return res.status(201).json({ ok: true, order: publicOrder(inserted.rows[0]) });
      } catch (error) {
        if (error && error.code === "23505") continue;
        if (error && error.code === "ORDER_ITEM_VALIDATION_FAILED") {
          return res.status(400).json({ error: "ORDER_ITEM_VALIDATION_FAILED", details: error.details || [] });
        }
        if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
        console.error("[orders/create] failed", error);
        return res.status(500).json({ error: "สร้างคำสั่งซื้อไม่สำเร็จ" });
      }
    }
    return res.status(500).json({ error: "สร้างคำสั่งซื้อไม่สำเร็จ" });
  });

  router.get("/public/orders/:code", async (req, res) => {
    const code = cleanText(req.params.code, 40);
    if (!code) return res.status(400).json({ error: "order code required" });
    const base = "order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at";
    try {
      let found;
      try {
        found = await pool.query(
          `SELECT ${base}, fulfillment_status, admin_note FROM public.customer_orders WHERE order_code=$1 LIMIT 1`,
          [code]
        );
      } catch (inner) {
        if (!isUndefinedColumn(inner)) throw inner;
        found = await pool.query(`SELECT ${base} FROM public.customer_orders WHERE order_code=$1 LIMIT 1`, [code]);
      }
      if (!found.rows.length) return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
      return res.json({ ok: true, order: publicOrder(found.rows[0]) });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/get] failed", error);
      return res.status(500).json({ error: "โหลดคำสั่งซื้อไม่สำเร็จ" });
    }
  });

  router.get("/public/payment-config", (_req, res) => {
    const ready = paymentReadiness(omise, env);
    return res.json({
      enabled: ready.enabled,
      provider: "omise",
      public_key: ready.enabled && ready.publicKey ? ready.publicKey : "",
      test_mode: ready.enabled ? omise.isTestMode() : false,
      methods: ready.methods,
    });
  });

  router.post("/public/orders/:code/pay", async (req, res) => {
    const ready = paymentReadiness(omise, env);
    if (!ready.enabled) return res.status(503).json({ error: "PAYMENT_NOT_CONFIGURED" });
    const code = cleanText(req.params.code, 40);
    if (!code) return res.status(400).json({ error: "order code required" });
    const method = cleanText(req.body && req.body.method, 20);
    if (!PAYMENT_METHODS.has(method)) return res.status(400).json({ error: "payment method invalid" });
    if (method === "card" && !ready.publicKey) return res.status(503).json({ error: "CARD_PAYMENT_NOT_CONFIGURED" });
    const token = cleanText(req.body && req.body.token, 200);
    if (method === "card" && !token) return res.status(400).json({ error: "card token required" });

    let claim;
    try {
      claim = await inTransaction(pool, async (client) => {
        const found = await client.query(
          `SELECT order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal,
                  status, payment_status, payment_charge_id, paid_at
             FROM public.customer_orders
            WHERE order_code=$1
            FOR UPDATE`,
          [code]
        );
        if (!found.rows.length) return { type: "missing" };
        const order = found.rows[0];
        if (order.status === "paid") return { type: "already_paid", order };
        if (isPaymentInFlight(order)) return { type: "processing", order };
        if (!PAYABLE_STATUSES.has(order.status)) return { type: "not_payable", order };
        const amount = money(order.subtotal);
        if (amount <= 0) return { type: "invalid_amount", order };
        const attemptId = newAttemptId();
        const updated = await client.query(
          `UPDATE public.customer_orders
              SET payment_provider='omise', payment_method=$2, payment_charge_id=NULL,
                  payment_status=$3, status='payment_processing',
                  updated_at=now()
            WHERE order_code=$1
            RETURNING order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal,
                      status, payment_status, payment_charge_id, paid_at`,
          [code, method, `${PAYMENT_ATTEMPT_PREFIX}${attemptId}`]
        );
        return { type: "claimed", order: updated.rows[0], amount, attemptId };
      });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/pay:claim] failed", error);
      return res.status(500).json({ error: "เริ่มการชำระเงินไม่สำเร็จ" });
    }

    if (claim.type === "missing") return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
    if (claim.type === "already_paid") return res.status(409).json({ error: "ORDER_ALREADY_PAID", status: "paid", order: publicOrder(claim.order) });
    if (claim.type === "processing") {
      return res.status(202).json({
        ok: false,
        error: "PAYMENT_PROCESSING",
        message: "กำลังตรวจสอบการชำระเงิน",
        order: publicOrder(claim.order),
        payment: { status: PROCESSING_STATUS, requires_polling: true },
      });
    }
    if (claim.type === "not_payable") return res.status(409).json({ error: "ORDER_NOT_PAYABLE", status: claim.order.status });
    if (claim.type === "invalid_amount") return res.status(400).json({ error: "ยอดชำระไม่ถูกต้อง" });

    let charge;
    try {
      const metadata = { order_code: code, attempt_id: claim.attemptId };
      charge = method === "card"
        ? await omise.createCardCharge({ amount: claim.amount, token, metadata })
        : await omise.createPromptPayCharge({ amount: claim.amount, metadata });
    } catch (error) {
      console.error("[orders/pay:charge] failed", error && error.code);
      if (isRetryableOmiseRejection(error)) {
        let markedFailed = false;
        try {
          await inTransaction(pool, async (client) => {
            const failed = await client.query(
              `UPDATE public.customer_orders
                  SET payment_status=$3, status='payment_failed', updated_at=now()
                WHERE order_code=$1 AND payment_status=$2
                RETURNING order_code`,
              [code, `${PAYMENT_ATTEMPT_PREFIX}${claim.attemptId}`, error.code || "omise_rejected"]
            );
            markedFailed = Boolean((failed.rowCount || (failed.rows && failed.rows.length) || 0) > 0);
          });
        } catch (updateError) {
          console.error("[orders/pay:failure-update] failed", updateError);
        }
        if (!markedFailed) {
          return res.status(202).json({
            ok: false,
            error: "PAYMENT_RESULT_UNKNOWN",
            message: "กำลังตรวจสอบการชำระเงิน",
            order: publicOrder(claim.order),
            payment: { status: PROCESSING_STATUS, requires_polling: true },
          });
        }
        return res.status(502).json({ error: "ชำระเงินไม่สำเร็จ กรุณาลองใหม่", code: error && error.code });
      }
      if (isAmbiguousOmiseError(error)) {
        return res.status(202).json({
          ok: false,
          error: "PAYMENT_RESULT_UNKNOWN",
          message: "กำลังตรวจสอบการชำระเงิน",
          order: publicOrder(claim.order),
          payment: { status: PROCESSING_STATUS, requires_polling: true },
        });
      }
      return res.status(502).json({ error: "ชำระเงินไม่สำเร็จ", code: error && error.code });
    }

    const mapped = chargeToOrderStatus(charge);
    try {
      const updated = await inTransaction(pool, async (client) => client.query(
        `UPDATE public.customer_orders
            SET payment_provider='omise', payment_method=$2, payment_charge_id=$3,
                payment_status=$4, status=$5,
                paid_at = CASE WHEN $5='paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
                updated_at = now()
          WHERE order_code=$1 AND payment_status=$6
          RETURNING order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, created_at`,
        [code, method, charge.id || null, (charge && charge.status) || null, mapped, `${PAYMENT_ATTEMPT_PREFIX}${claim.attemptId}`]
      ));
      if (!updated.rows.length) {
        return res.status(202).json({
          ok: false,
          error: "PAYMENT_PROCESSING",
          message: "กำลังตรวจสอบการชำระเงิน",
          order: publicOrder(claim.order),
          payment: { status: PROCESSING_STATUS, requires_polling: true },
        });
      }
      return res.json({
        ok: true,
        order: publicOrder(updated.rows[0]),
        payment: {
          method,
          status: mapped,
          charge_id: charge.id || null,
          qr_uri: method === "promptpay" ? promptPayQrUri(charge) : null,
          requires_polling: mapped === PROCESSING_STATUS,
        },
      });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/pay:update] failed", error);
      return res.status(202).json({
        ok: false,
        error: "PAYMENT_RESULT_UNKNOWN",
        message: "กำลังตรวจสอบการชำระเงิน",
        order: publicOrder(claim.order),
        payment: { status: PROCESSING_STATUS, requires_polling: true },
      });
    }
  });

  router.post("/webhooks/omise", async (req, res) => {
    try {
      const webhookSecret = getWebhookSecret(env);
      if (!webhookSecret) return res.status(503).json({ error: "OMISE_WEBHOOK_NOT_CONFIGURED" });
      const signature = verifyOmiseWebhookSignature(req, webhookSecret);
      if (!signature.ok) return res.status(401).json({ error: "OMISE_WEBHOOK_SIGNATURE_INVALID" });

      const event = req.body && typeof req.body === "object" ? req.body : {};
      const data = event.data && typeof event.data === "object" ? event.data : {};
      const chargeId = cleanText(data.object === "charge" ? data.id : (data.charge || ""), 80);
      if (!chargeId || !omise.isConfigured()) return res.json({ ok: true, ignored: true });

      const charge = await omise.retrieveCharge(chargeId);
      if (!charge || !charge.id) return res.json({ ok: true, ignored: true });
      const result = await applyVerifiedCharge(pool, charge);
      return res.status(result.status || 200).json(result.body || { ok: true });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ ok: false, error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/webhook] failed", error && error.code);
      return res.status(502).json({ ok: false, error: "OMISE_WEBHOOK_PROCESSING_FAILED" });
    }
  });

  const ADMIN_BASE_COLUMNS = "order_code, customer_name, customer_phone, delivery_method, install_option, address, items, subtotal, status, note, created_at";
  const ADMIN_EXTRA_COLUMNS = "payment_method, payment_status, payment_charge_id, paid_at, fulfillment_status, admin_note";
  router.get("/admin/orders", adminGuard, async (_req, res) => {
    try {
      let rows;
      try {
        rows = await pool.query(
          `SELECT ${ADMIN_BASE_COLUMNS}, ${ADMIN_EXTRA_COLUMNS}
             FROM public.customer_orders ORDER BY created_at DESC LIMIT 200`
        );
      } catch (inner) {
        if (!isUndefinedColumn(inner)) throw inner;
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

  router.post("/admin/orders/:code/status", adminGuard, async (req, res) => {
    const code = cleanText(req.params.code, 40);
    if (!code) return res.status(400).json({ error: "order code required" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const fulfillment = cleanText(body.fulfillment_status, 20);
    const hasNote = Object.prototype.hasOwnProperty.call(body, "admin_note");
    const adminNote = hasNote ? cleanText(body.admin_note, 500) : null;
    if (!fulfillment && !hasNote) return res.status(400).json({ error: "no changes" });
    if (fulfillment && !FULFILLMENT_STATUSES.has(fulfillment)) {
      return res.status(400).json({ error: "fulfillment_status invalid" });
    }
    try {
      const updated = await pool.query(
        `UPDATE public.customer_orders
            SET fulfillment_status = COALESCE($2, fulfillment_status),
                admin_note = CASE WHEN $3 THEN $4 ELSE admin_note END,
                updated_at = now()
          WHERE order_code=$1
          RETURNING ${ADMIN_BASE_COLUMNS}, ${ADMIN_EXTRA_COLUMNS}`,
        [code, fulfillment || null, hasNote, adminNote]
      );
      if (!updated.rows.length) return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้" });
      return res.json({ ok: true, order: adminOrder(updated.rows[0]) });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "ORDERS_SCHEMA_NOT_READY" });
      console.error("[orders/admin-status] failed", error);
      return res.status(500).json({ error: "อัปเดตสถานะไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = {
  createCustomerOrdersRoutes,
  normalizeOrder,
  generateOrderCode,
  publicOrder,
  adminOrder,
  catalogRuleCurrentlyActive,
  catalogEffectiveUnitPrice,
  verifyOmiseWebhookSignature,
  applyVerifiedCharge,
};
