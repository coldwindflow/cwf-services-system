"use strict";

const { PublicServicePackageError } = require("../../services/public/servicePackages");

function sendError(res, error) {
  const isPublic = error instanceof PublicServicePackageError;
  const status = isPublic ? error.status : 503;
  const code = isPublic ? error.code : "SERVICE_PACKAGES_UNAVAILABLE";
  return res.status(status).json({ error: code, code });
}

function registerPublicServicePackageRoutes(app, { service } = {}) {
  if (!service || typeof service.list !== "function" || typeof service.preview !== "function") {
    throw new TypeError("public service package service is required");
  }

  app.get("/public/service-packages", async (_req, res) => {
    try {
      return res.json(await service.list());
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/public/service-packages/preview", async (req, res) => {
    try {
      return res.json(await service.preview(req.body || {}));
    } catch (error) {
      return sendError(res, error);
    }
  });
}

module.exports = { registerPublicServicePackageRoutes };
