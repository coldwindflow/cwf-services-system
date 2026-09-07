"use strict";

const express = require("express");
const defaultPool = require("../../db/pool");
const { baseProviderConfig, jwtVerify } = require("../../customerAuth");
const {
  PrepaidServiceError,
  createPrepaidOrderService,
} = require("../../services/prepaid/prepaidOrderServiceV2");

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function cookieValue(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    let value = part.slice(index + 1).trim().replace(/^"|"$/g, "");
    try { value = decodeURIComponent(value); } catch (_) {}
    return value;
  }
  return null;
}

function fallbackCustomerJwt(env) {
  return (req, res, next) => {
    const secret = baseProviderConfig(env).jwtSecret;
    const token = cookieValue(req, "cwf_token");
    const payload = secret && token ? jwtVerify(token, secret) : null;
    if (!payload?.sub) return res.status(401).json({ error: "NOT_LOGGED_IN" });
    req.customer = payload;
    return next();
  };
}

function createCustomerPrepaidRoutes(options = {}) {
  const pool = options.pool || defaultPool;
  const env = options.env || process.env;
  const service = options.service || createPrepaidOrderService({ pool });
  const requireCustomerJwt = typeof options.requireCustomerJwt === "function"
    ? options.requireCustomerJwt
    : fallbackCustomerJwt(env);
  const router = express.Router();

  router.use("/public/prepaid-orders", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.use("/public/service-rights", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  const handle = (fn) => async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      if (error instanceof PrepaidServiceError || (error?.code && Number(error?.statusCode || 0) >= 400)) {
        const status = Number(error.statusCode || 400);
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          error: String(error.code || "PREPAID_REQUEST_FAILED"),
          code: String(error.code || "PREPAID_REQUEST_FAILED"),
        });
      }
      console.error("[customer_prepaid] failed", {
        route: req.originalUrl,
        db_code: /^[A-Z0-9_]{2,16}$/.test(String(error?.code || "")) ? String(error.code) : undefined,
      });
      return res.status(500).json({ error: "PREPAID_REQUEST_FAILED", code: "PREPAID_REQUEST_FAILED" });
    }
  };

  // Tiny public policy probe used only to decide whether the Store should follow
  // the existing book-now path or the prepaid purchase path. Never returns price
  // internals or hidden catalog rows.
  router.get("/public/prepaid-policy/:item_id", handle(async (req, res) => {
    const itemId = Number(req.params.item_id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      return res.status(404).json({ error: "NOT_FOUND", code: "NOT_FOUND" });
    }
    let row;
    try {
      const result = await pool.query(
        `SELECT item_id, booking_mode, is_active, is_customer_visible,
                service_package_sell_start_at, service_package_sell_end_at,
                service_package_redeem_until, service_package_payment_mode,
                service_package_warranty_days
           FROM public.catalog_items
          WHERE item_id=$1 LIMIT 1`, [itemId]
      );
      row = result.rows?.[0] || null;
    } catch (error) {
      if (error?.code === "42703") {
        return res.json({ ok: true, prepaid: false, payment_mode: "book_now", prepaid_ready: false });
      }
      throw error;
    }
    const now = Date.now();
    const onSale = row
      && row.booking_mode === "service_package"
      && row.is_active === true
      && row.is_customer_visible === true
      && (!row.service_package_sell_start_at || now >= new Date(row.service_package_sell_start_at).getTime())
      && (!row.service_package_sell_end_at || now <= new Date(row.service_package_sell_end_at).getTime());
    if (!onSale) return res.status(404).json({ error: "NOT_FOUND", code: "NOT_FOUND" });
    const prepaid = String(row.service_package_payment_mode || "book_now") === "prepaid_full";
    return res.json({
      ok: true,
      prepaid,
      payment_mode: prepaid ? "prepaid_full" : "book_now",
      prepaid_ready: prepaid ? await service.schemaReady() : true,
      redeem_until: prepaid ? row.service_package_redeem_until : null,
      warranty_days: prepaid && row.service_package_warranty_days != null ? Number(row.service_package_warranty_days) : null,
    });
  }));

  router.post("/public/prepaid-orders/quote", requireCustomerJwt, handle(async (req, res) => {
    const customerSub = clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN", code: "NOT_LOGGED_IN" });
    const quote = await service.quoteOrder(req.body || {}, { identity: "customer" });
    return res.json({ ok: true, quote });
  }));

  router.post("/public/prepaid-orders", requireCustomerJwt, handle(async (req, res) => {
    const customerSub = clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN", code: "NOT_LOGGED_IN" });
    const created = await service.createOrder(req.body || {}, { customerSub, identity: "customer" });
    return res.status(created.replayed ? 200 : 201).json({
      ok: true,
      replayed: Boolean(created.replayed),
      order: created.order,
      entitlement_code: created.entitlement_code,
      service: created.service,
    });
  }));

  router.get("/public/service-rights", requireCustomerJwt, handle(async (req, res) => {
    const customerSub = clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN", code: "NOT_LOGGED_IN" });
    const items = await service.listRights(customerSub);
    return res.json({ ok: true, items });
  }));

  router.post("/public/service-rights/claim", requireCustomerJwt, handle(async (req, res) => {
    const customerSub = clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN", code: "NOT_LOGGED_IN" });
    const claimed = await service.claimRight({
      entitlementCode: req.body?.entitlement_code,
      claimToken: req.body?.claim_token,
      customerSub,
    });
    return res.json({ ok: true, entitlement: claimed });
  }));

  router.post("/public/service-rights/:code/begin-redemption", requireCustomerJwt, handle(async (req, res) => {
    const customerSub = clean(req.customer?.sub);
    if (!customerSub) return res.status(401).json({ error: "NOT_LOGGED_IN", code: "NOT_LOGGED_IN" });
    const redemption = await service.beginRedemption({
      entitlementCode: req.params.code,
      customerSub,
    });
    return res.json({ ok: true, redemption });
  }));

  return router;
}

module.exports = {
  createCustomerPrepaidRoutes,
  fallbackCustomerJwt,
};
