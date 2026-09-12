"use strict";

const crypto = require("crypto");
const defaultPool = require("../../db/pool");
const {
  AdminPrepaidRedemptionError,
  createAdminPrepaidRedemptionService,
} = require("../../services/prepaid/adminPrepaidRedemptionService");

function generateAdminRequestKey() {
  return `adminprepaid_${crypto.randomBytes(18).toString("base64url")}`;
}

function registerAdminBookingRoutes(app, options = {}) {
  const service = options.service;
  const requireAdminSession = options.requireAdminSession;
  const requireInternalApiKeyOnly = options.requireInternalApiKeyOnly;
  const prepaidService = options.adminPrepaidRedemptionService
    || createAdminPrepaidRedemptionService({ pool: options.pool || defaultPool });
  if (!service || typeof service.handleAdminBookV2 !== "function" || typeof service.handleInternalBookFromAi !== "function"
      || typeof service.handleAdminCatalogBookingPreview !== "function") {
    throw new TypeError("admin booking service is required");
  }

  app.post("/admin/book_v2", requireAdminSession, service.handleAdminBookV2);
  app.get("/admin/service-packages", requireAdminSession, service.handleAdminServicePackageList);
  app.post("/admin/service-packages/preview", requireAdminSession, service.handleAdminServicePackagePreview);
  app.post("/admin/catalog-booking-preview", requireAdminSession, service.handleAdminCatalogBookingPreview);

  app.get("/admin/prepaid-entitlements/:code", requireAdminSession, async (req, res) => {
    try {
      const entitlement = await prepaidService.getForAdmin(req.params.code);
      return res.json({ ok: true, entitlement });
    } catch (error) {
      if (error instanceof AdminPrepaidRedemptionError) {
        return res.status(error.statusCode || 400).json({ ok: false, error: error.code, code: error.code });
      }
      console.error("ADMIN_PREPAID_ENTITLEMENT_LOOKUP_ERROR", error);
      return res.status(500).json({ ok: false, error: "ADMIN_PREPAID_ENTITLEMENT_UNAVAILABLE", code: "ADMIN_PREPAID_ENTITLEMENT_UNAVAILABLE" });
    }
  });

  // Admin booking-on-behalf deliberately reuses /admin/book_v2 after resolving
  // the immutable paid entitlement. This keeps technician availability,
  // assignment, pricing snapshots, job creation and accounting on one canonical
  // path instead of creating a second booking engine.
  app.post("/admin/prepaid-entitlements/:code/book", requireAdminSession, async (req, res) => {
    let preparation = null;
    const releaseIfNeeded = async () => {
      if (!preparation) return;
      try { await prepaidService.releaseAdminPreparation(preparation); }
      catch (releaseError) { console.error("ADMIN_PREPAID_PREPARATION_RELEASE_ERROR", releaseError); }
    };
    try {
      const incoming = { ...(req.body || {}) };
      const requestedMode = String(incoming.booking_mode || "scheduled").trim().toLowerCase();
      const requestedDispatch = String(incoming.dispatch_mode || "normal").trim().toLowerCase();
      if (requestedMode === "urgent" || requestedDispatch === "offer") {
        return res.status(409).json({ ok: false, error: "PREPAID_SCHEDULED_ONLY", code: "PREPAID_SCHEDULED_ONLY" });
      }

      preparation = await prepaidService.prepareForAdminBooking(req.params.code);
      const body = {
        ...incoming,
        customer_name: String(incoming.customer_name || preparation.customer_name || "").trim(),
        customer_phone: String(incoming.customer_phone || preparation.customer_phone || "").trim(),
        booking_mode: "scheduled",
        service_package_groups: preparation.service_package_groups,
        prepaid_redemption_token: preparation.prepaid_redemption_token,
        scheduled_request_key: preparation.scheduled_request_key,
        admin_request_key: String(incoming.admin_request_key || "").trim() || generateAdminRequestKey(),
      };

      // A redeemed PREPAID snapshot is the sole pricing/service authority.
      // Remove mutable campaign/cart overrides so Admin cannot accidentally stack
      // another promotion or alter the already-paid contract.
      delete body.catalog_item_id;
      delete body.service_package_key;
      delete body.service_package_tier_key;
      delete body.service_package_id;
      delete body.service_package_tier_id;
      delete body.promotion_id;
      delete body.override_price;
      delete body.override_duration_min;
      delete body.items;
      delete body.services;
      delete body.service_lines;

      req.body = body;
      req.cwfBookSource = "admin";
      const result = await service.handleAdminBookV2(req, res);
      if (Number(res.statusCode || 200) >= 400) await releaseIfNeeded();
      return result;
    } catch (error) {
      await releaseIfNeeded();
      if (error instanceof AdminPrepaidRedemptionError) {
        return res.status(error.statusCode || 400).json({ ok: false, error: error.code, code: error.code });
      }
      console.error("ADMIN_PREPAID_BOOKING_ERROR", error);
      return res.status(500).json({ ok: false, error: "ADMIN_PREPAID_BOOKING_UNAVAILABLE", code: "ADMIN_PREPAID_BOOKING_UNAVAILABLE" });
    }
  });

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
