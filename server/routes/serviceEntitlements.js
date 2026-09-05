"use strict";

const express = require("express");
const { SESSION_COOKIE, baseProviderConfig, jwtVerify } = require("../customerAuth");
const {
  ServiceEntitlementError,
  createServiceEntitlementService,
} = require("../services/packages/serviceEntitlementService");

function cookieValue(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim().replace(/^"|"$/g, "");
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }
  return null;
}

function customerFromRequest(req, env = process.env) {
  const secret = baseProviderConfig(env).jwtSecret;
  const token = cookieValue(req, SESSION_COOKIE);
  if (!secret || !token) return null;
  const payload = jwtVerify(token, secret);
  return payload?.sub ? payload : null;
}

function requireCustomer(env) {
  return (req, res, next) => {
    const customer = customerFromRequest(req, env);
    if (!customer) return res.status(401).json({ error: "CUSTOMER_LOGIN_REQUIRED", code: "CUSTOMER_LOGIN_REQUIRED" });
    req.customer = customer;
    return next();
  };
}

function adminActor(req) {
  return String(
    req.actor?.username || req.auth?.username || req.session?.username || req.user?.username || req.username || "admin"
  ).trim().slice(0, 120) || "admin";
}

function sendError(res, error, logger, context) {
  if (error instanceof ServiceEntitlementError || error?.status) {
    const status = Number(error.status || error.statusCode || 409);
    return res.status(status >= 400 && status < 600 ? status : 409).json({
      error: error.code || "SERVICE_ENTITLEMENT_ERROR",
      code: error.code || "SERVICE_ENTITLEMENT_ERROR",
    });
  }
  if (error?.code === "42P01" || error?.code === "42703") {
    return res.status(503).json({ error: "SERVICE_ENTITLEMENT_SCHEMA_NOT_READY", code: "SERVICE_ENTITLEMENT_SCHEMA_NOT_READY" });
  }
  (logger || console).error(`[${context}]`, { message: error?.message, code: error?.code });
  return res.status(500).json({ error: "SERVICE_ENTITLEMENT_UNAVAILABLE", code: "SERVICE_ENTITLEMENT_UNAVAILABLE" });
}

function createServiceEntitlementRoutes(deps = {}) {
  const pool = deps.pool;
  if (!pool || typeof pool.query !== "function") throw new TypeError("createServiceEntitlementRoutes requires pool");
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const service = deps.service || createServiceEntitlementService({ pool });
  const router = express.Router();
  const customerGuard = deps.requireCustomer || requireCustomer(env);
  const adminGuard = typeof deps.requireAdminSession === "function"
    ? deps.requireAdminSession
    : (_req, _res, next) => next();

  router.post("/public/service-entitlements/quote", async (req, res) => {
    try {
      const quote = await service.quotePurchase(req.body || {});
      return res.json({
        ok: true,
        quote: {
          catalog_item_id: quote.bundleId,
          bundle_key: quote.bundleKey,
          fixed_total_price: quote.fixedTotal,
          machine_count: Number(quote.payload?.machine_count || 0),
          minimum_total_quantity: quote.minimumTotalQuantity ?? null,
          maximum_total_quantity: quote.maximumTotalQuantity ?? null,
          payment_mode: quote.paymentMode,
          pricing_strategy: quote.pricingStrategy,
          selection_mode: quote.selectionMode,
          warranty_days: quote.warrantyDays ?? null,
          redeem_until: quote.redeemUntil || null,
          groups: quote.payload?.service_package_groups || [],
          components: quote.items.map((item) => ({
            package_key: item.snapshot?.package?.key || null,
            service_level: item.snapshot?.service_level || null,
            selected_btu: item.snapshot?.taxonomy?.selected_btu ?? null,
            quantity: Number(item.qty || 0),
            line_total: item.line_total,
          })),
        },
      });
    } catch (error) {
      return sendError(res, error, logger, "service-entitlements/quote");
    }
  });

  router.post("/public/service-entitlement-orders", customerGuard, async (req, res) => {
    try {
      const body = req.body || {};
      const order = await service.createPendingOrder({
        customerSub: req.customer.sub,
        customerName: body.customer_name || req.customer.name,
        customerPhone: body.customer_phone,
        input: body,
      });
      return res.status(201).json({ ok: true, order });
    } catch (error) {
      return sendError(res, error, logger, "service-entitlement-orders/create");
    }
  });

  router.get("/public/service-entitlement-orders/:code", customerGuard, async (req, res) => {
    try {
      const order = await service.getPendingOrder(req.customer.sub, req.params.code);
      return res.json({ ok: true, order });
    } catch (error) {
      return sendError(res, error, logger, "service-entitlement-orders/get");
    }
  });

  router.get("/public/service-entitlements", customerGuard, async (req, res) => {
    try {
      const entitlements = await service.listRights(req.customer.sub);
      return res.json({ ok: true, entitlements });
    } catch (error) {
      return sendError(res, error, logger, "service-entitlements/list");
    }
  });

  router.get("/admin/service-entitlement-orders", adminGuard, async (req, res) => {
    try {
      const orders = await service.listOrdersForAdmin(req.query?.status || "");
      return res.json({ ok: true, orders });
    } catch (error) {
      return sendError(res, error, logger, "admin/service-entitlement-orders/list");
    }
  });

  router.post("/admin/service-entitlement-orders/:code/confirm-payment", adminGuard, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await service.confirmManualPayment({
        orderCode: req.params.code,
        method: body.payment_method,
        reference: body.payment_reference,
        amount: body.amount,
        actor: adminActor(req),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error, logger, "admin/service-entitlement-orders/confirm-payment");
    }
  });

  return router;
}

module.exports = {
  createServiceEntitlementRoutes,
  customerFromRequest,
  requireCustomer,
  adminActor,
};
