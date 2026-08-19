"use strict";

function registerPendingBookingServiceEditorRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSession = options.requireAdminSession;
  if (!service || typeof service.get !== "function" || typeof service.update !== "function") {
    throw new TypeError("pending booking service editor is required");
  }
  app.get("/admin/customer-bookings/:job_id/services", requireAdminSession, service.get);
  app.put("/admin/customer-bookings/:job_id/services", requireAdminSession, service.update);
}

module.exports = { registerPendingBookingServiceEditorRoutes };
