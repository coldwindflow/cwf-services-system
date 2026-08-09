"use strict";

function registerPublicCustomerBookingRoutes(app, options = {}) {
  const service = options.service;
  if (!service || typeof service.handlePublicBook !== "function") {
    throw new TypeError("customer booking service is required");
  }

  app.post("/public/urgent-dispatch-preflight", service.handlePublicUrgentPreflight);
  if (options.quoteService && typeof options.quoteService.handle === "function") {
    app.post("/public/catalog-booking-quote", options.quoteService.handle);
  }
  app.post("/public/book", service.handlePublicBook);
}

module.exports = {
  registerPublicCustomerBookingRoutes,
};
