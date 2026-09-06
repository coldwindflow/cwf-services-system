"use strict";

const { createCustomerPrepaidRoutes } = require("./customerPrepaid");

function registerPublicCustomerBookingRoutes(app, options = {}) {
  const service = options.service;
  if (!service || typeof service.handlePublicBook !== "function") {
    throw new TypeError("customer booking service is required");
  }

  // PREPAID is mounted next to the existing customer booking surface so it uses
  // the same app/process without creating a second booking engine. The prepaid
  // router defaults to the canonical pool/JWT config when the caller does not
  // explicitly inject them (legacy index wiring stays compatible).
  app.use(createCustomerPrepaidRoutes({
    pool: options.pool,
    env: options.env,
    requireCustomerJwt: options.requireCustomerJwt,
    service: options.prepaidService,
  }));

  app.post("/public/urgent-dispatch-preflight", service.handlePublicUrgentPreflight);
  if (options.quoteService && typeof options.quoteService.handle === "function") {
    app.post("/public/catalog-booking-quote", options.quoteService.handle);
  }
  app.post("/public/book", service.handlePublicBook);
}

module.exports = {
  registerPublicCustomerBookingRoutes,
};
