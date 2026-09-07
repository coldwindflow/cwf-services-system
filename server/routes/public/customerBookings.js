"use strict";

const { createCustomerPrepaidRoutes } = require("./customerPrepaid");

function registerPublicCustomerBookingRoutes(app, options = {}) {
  const service = options.service;
  if (!service || typeof service.handlePublicBook !== "function") {
    throw new TypeError("customer booking service is required");
  }

  // PREPAID is mounted next to the existing customer booking surface so it uses
  // the same app/process without creating a second booking engine. Real Express
  // applications expose app.use(); route-adapter tests and compatible thin
  // adapters may expose only app.post(), so keep the legacy registration contract
  // intact without weakening the real production mount.
  if (typeof app.use === "function") {
    app.use(createCustomerPrepaidRoutes({
      pool: options.pool,
      env: options.env,
      requireCustomerJwt: options.requireCustomerJwt,
      service: options.prepaidService,
    }));
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
