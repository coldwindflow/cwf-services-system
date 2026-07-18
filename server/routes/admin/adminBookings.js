"use strict";

function registerAdminBookingRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSoft = options.requireAdminSoft;
  const requireInternalApiKeyOnly = options.requireInternalApiKeyOnly;
  if (!service || typeof service.handleAdminBookV2 !== "function" || typeof service.handleInternalBookFromAi !== "function") {
    throw new TypeError("admin booking service is required");
  }

  app.post("/admin/book_v2", requireAdminSoft, service.handleAdminBookV2);
  app.post("/admin/urgent_broadcast_v2", requireAdminSoft, (req, res) => {
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
