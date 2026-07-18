"use strict";

function registerPublicCustomerBookingRoutes(app, options = {}) {
  const service = options.service;
  if (!service || typeof service.handlePublicBook !== "function") {
    throw new TypeError("customer booking service is required");
  }

  app.post("/public/book", service.handlePublicBook);
}

module.exports = {
  registerPublicCustomerBookingRoutes,
};
