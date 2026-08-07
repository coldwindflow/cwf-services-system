"use strict";

function registerAdminBookingRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSession = options.requireAdminSession;
  const requireInternalApiKeyOnly = options.requireInternalApiKeyOnly;
  if (!service || typeof service.handleAdminBookV2 !== "function" || typeof service.handleInternalBookFromAi !== "function") {
    throw new TypeError("admin booking service is required");
  }

  app.post("/admin/book_v2", requireAdminSession, service.handleAdminBookV2);
  app.get("/admin/service-packages", requireAdminSession, service.handleAdminServicePackageList);
  app.post("/admin/service-packages/preview", requireAdminSession, service.handleAdminServicePackagePreview);
  app.post("/admin/urgent_broadcast_v2", requireAdminSession, (req, res) => {
    req.body = {
      ...(req.body || {}),
      booking_mode: "urgent",
      dispatch_mode: req.body?.dispatch_mode || "offer",
    };
    console.log("[urgent_broadcast_v2 alias] forwarding to /admin/book_v2", {
      booking_mode: req.body?.booking_mode,
      dispatch_mode: req.body?.dispatch_mode,
    });
    return service.handleAdminBookV2(req, res);
  });
  app.post("/internal/book_from_ai", requireInternalApiKeyOnly, service.handleInternalBookFromAi);
}

module.exports = {
  registerAdminBookingRoutes,
};
