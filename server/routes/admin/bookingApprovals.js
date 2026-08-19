"use strict";

function registerBookingApprovalRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSession = options.requireAdminSession;
  if (!service || typeof service.approve !== "function" || typeof service.reject !== "function") {
    throw new TypeError("booking approval service is required");
  }
  app.post("/admin/customer-bookings/:job_id/approve", requireAdminSession, service.approve);
  app.post("/admin/customer-bookings/:job_id/reject", requireAdminSession, service.reject);
  if (typeof service.getServices === "function" && typeof service.updateServices === "function") {
    app.get("/admin/customer-bookings/:job_id/services", requireAdminSession, service.getServices);
    app.put("/admin/customer-bookings/:job_id/services", requireAdminSession, service.updateServices);
  }
}

module.exports = { registerBookingApprovalRoutes };
