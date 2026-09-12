"use strict";

const express = require("express");
const defaultPool = require("../../db/pool");
const { StoreServicePackageCatalogError } = require("../../services/packages/storeServicePackageCatalogService");
const {
  PromotionPolicyAdminError,
  createPromotionPolicyAdminService,
} = require("../../services/packages/promotionPolicyAdminService");
const {
  PrepaidServiceError,
  createPrepaidOrderService,
} = require("../../services/prepaid/prepaidOrderServiceV2");

function createStoreServicePackageCatalogRoutes({ service, requireAdminSession, promotionPolicyService, prepaidOrderService, pool = defaultPool }) {
  if (!service) throw new TypeError("store service-package catalog service is required");
  const policyService = promotionPolicyService || createPromotionPolicyAdminService({ pool });
  const prepaidService = prepaidOrderService || createPrepaidOrderService({ pool });
  const router = express.Router();
  const handle = (fn) => async (req, res) => {
    try { return await fn(req, res); }
    catch (error) {
      if (error instanceof StoreServicePackageCatalogError
          || error instanceof PromotionPolicyAdminError
          || error instanceof PrepaidServiceError) {
        return res.status(error.status || error.statusCode || 400).json({ error: error.code, code: error.code });
      }
      if (error?.code && Number(error?.statusCode || 0) >= 400 && Number(error.statusCode) < 500) {
        return res.status(Number(error.statusCode)).json({ error: String(error.code), code: String(error.code) });
      }
      console.error("STORE_SERVICE_PACKAGE_CATALOG_ERROR", error);
      return res.status(500).json({ error: "STORE_SERVICE_PACKAGE_CATALOG_UNAVAILABLE", code: "STORE_SERVICE_PACKAGE_CATALOG_UNAVAILABLE" });
    }
  };
  router.get("/admin/catalog/service-package-bundles/taxonomy", requireAdminSession,
    handle(async (_req, res) => res.json(await service.taxonomy())));
  router.get("/admin/catalog/service-package-bundles", requireAdminSession, handle(async (_req, res) => res.json({ bundles: await service.list() })));
  router.post("/admin/catalog/service-package-bundles/quote", requireAdminSession, handle(async (req, res) => res.json(await service.quote(req.body || {}))));
  router.post("/admin/catalog/service-package-bundles", requireAdminSession, handle(async (req, res) => res.status(201).json(await service.create(req.body || {}))));
  router.patch("/admin/catalog/service-package-bundles/:bundleKey", requireAdminSession, handle(async (req, res) => res.json(await service.update(req.params.bundleKey, req.body || {}))));

  router.get("/admin/catalog/service-package-bundles/:bundleKey/promotion-policy", requireAdminSession,
    handle(async (req, res) => res.json(await policyService.get(req.params.bundleKey))));
  router.patch("/admin/catalog/service-package-bundles/:bundleKey/promotion-policy", requireAdminSession,
    handle(async (req, res) => res.json(await policyService.update(req.params.bundleKey, req.body || {}))));

  // Server-authoritative PREPAID quote for Admin sale-on-behalf. This uses the
  // same immutable package resolver as customer checkout and never trusts a
  // client-supplied total.
  router.post("/admin/prepaid-orders/quote", requireAdminSession, handle(async (req, res) => {
    const quote = await prepaidService.quoteOrder(req.body || {}, { identity: "admin" });
    return res.json({ ok: true, quote });
  }));

  router.post("/admin/prepaid-orders", requireAdminSession, handle(async (req, res) => {
    const customerSub = String(req.body?.customer_sub || "").trim() || null;
    const created = await prepaidService.createOrder(req.body || {}, { customerSub, identity: "admin" });
    return res.status(created.replayed ? 200 : 201).json({ ok: true, ...created });
  }));

  router.post("/admin/prepaid-orders/:code/confirm-payment", requireAdminSession, handle(async (req, res) => {
    const verifiedBy = String(
      req.admin?.username || req.admin?.email || req.session?.username || req.user?.username || "admin"
    ).trim().slice(0, 120);
    const result = await prepaidService.confirmManualPayment(req.params.code, req.body || {}, { verifiedBy });
    return res.json({ ok: true, ...result });
  }));

  router.get("/admin/prepaid-orders", requireAdminSession, handle(async (_req, res) => {
    if (!(await prepaidService.schemaReady())) {
      throw new PrepaidServiceError("PREPAID_SCHEMA_NOT_READY", 503);
    }
    const result = await pool.query(
      `SELECT o.order_code, o.customer_name, o.customer_phone, o.customer_sub,
              o.subtotal, o.status AS payment_order_status, o.payment_provider,
              o.payment_method, o.payment_status, o.paid_at, o.created_at,
              e.entitlement_code, e.status AS entitlement_status, e.redeem_until,
              e.warranty_days, e.redeemed_job_id, e.redeemed_at
         FROM public.customer_orders o
         LEFT JOIN public.customer_service_entitlements e ON e.order_id=o.order_id
        WHERE o.order_kind='service_prepaid'
        ORDER BY o.created_at DESC
        LIMIT 300`
    );
    return res.json({ ok: true, orders: result.rows || [] });
  }));

  return router;
}

module.exports = { createStoreServicePackageCatalogRoutes };
