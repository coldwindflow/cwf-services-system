"use strict";

const express = require("express");
const { StoreServicePackageCatalogError } = require("../../services/packages/storeServicePackageCatalogService");

function createStoreServicePackageCatalogRoutes({ service, requireAdminSession }) {
  if (!service) throw new TypeError("store service-package catalog service is required");
  const router = express.Router();
  const handle = (fn) => async (req, res) => {
    try { return await fn(req, res); }
    catch (error) {
      if (error instanceof StoreServicePackageCatalogError) return res.status(error.status).json({ error: error.code, code: error.code });
      console.error("STORE_SERVICE_PACKAGE_CATALOG_ERROR", error);
      return res.status(500).json({ error: "STORE_SERVICE_PACKAGE_CATALOG_UNAVAILABLE", code: "STORE_SERVICE_PACKAGE_CATALOG_UNAVAILABLE" });
    }
  };
  router.get("/admin/catalog/service-package-bundles", requireAdminSession, handle(async (_req, res) => res.json({ bundles: await service.list() })));
  router.post("/admin/catalog/service-package-bundles", requireAdminSession, handle(async (req, res) => res.status(201).json(await service.create(req.body || {}))));
  router.patch("/admin/catalog/service-package-bundles/:bundleKey", requireAdminSession, handle(async (req, res) => res.json(await service.update(req.params.bundleKey, req.body || {}))));
  return router;
}

module.exports = { createStoreServicePackageCatalogRoutes };
