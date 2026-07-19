"use strict";

function registerBookingApprovalRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSession = options.requireAdminSession;
  if (!service || typeof service.approve !== "function" || typeof service.reject !== "function") {
    throw new TypeError("booking approval service is required");
  }
  app.post("/admin/customer-bookings/:job_id/approve", requireAdminSession, service.approve);
  app.post("/admin/customer-bookings/:job_id/reject", requireAdminSession, service.reject);
}

module.exports = { registerBookingApprovalRoutes };
