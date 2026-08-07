"use strict";

const express = require("express");
const { ServicePackageCatalogError } = require("../../services/packages/servicePackageCatalogService");

function createServicePackageCatalogRoutes({ service, requireAdminSession }) {
  if (!service || typeof service.list !== "function") throw new TypeError("Service package catalog service is required");
  if (typeof requireAdminSession !== "function") throw new TypeError("Admin session middleware is required");
  const router = express.Router();
  const handle = (action) => async (req, res) => {
    try { return res.json(await action(req)); }
    catch (error) {
      if (error instanceof ServicePackageCatalogError) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error("Service package catalog request failed", { name: error?.name, code: error?.code });
      return res.status(500).json({ error: "Unable to save service package", code: "SERVICE_PACKAGE_CATALOG_ERROR" });
    }
  };
  router.get("/admin/service-packages/catalog", requireAdminSession, handle(() => service.list()));
  router.post("/admin/service-packages/catalog", requireAdminSession, handle((req) => service.create(req.body)));
  router.patch("/admin/service-packages/catalog/:packageKey", requireAdminSession, handle((req) => service.update(req.params.packageKey, req.body)));
  return router;
}

module.exports = { createServicePackageCatalogRoutes };
