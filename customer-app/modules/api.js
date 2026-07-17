(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function getApiBase() {
    if (window.location.protocol === "file:") return "";
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    if (isLocal) {
      const params = new URLSearchParams(window.location.search || "");
      const override = String(params.get("api") || "").trim();
      if (override && /^https?:\/\//i.test(override)) return override.replace(/\/+$/, "");
    }
    return window.location.origin;
  }

  function buildUrl(path, query) {
    const base = getApiBase();
    const url = `${base}${path}`;
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  async function requestJson(path, options = {}) {
    const { query, method = "GET", body, cache } = options;
    const response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      cache: cache || "default",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch (_) { data = { raw: text }; }
    if (!response.ok) {
      const message = data && data.error ? data.error : `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const api = {
    getApiBase,

    async getCurrentCustomer() {
      return requestJson("/public/me");
    },

    async getAuthConfig(returnTo) {
      return requestJson("/public/auth/config", { query: { returnTo } });
    },

    async logoutCustomer() {
      return requestJson("/public/logout", { method: "POST" });
    },

    async updateProfileAddress(payload) {
      return requestJson("/public/profile/address", {
        method: "PATCH",
        body: {
          address: String((payload && payload.address) || "").trim(),
          maps_url: String((payload && payload.maps_url) || "").trim(),
        },
      });
    },

    async searchCustomerHistory(identifier) {
      return requestJson("/public/customer-history/search", {
        method: "POST",
        body: { identifier: String(identifier || "").trim() },
      });
    },

    async claimCustomerHistory(identifier) {
      return requestJson("/public/customer-history/claim", {
        method: "POST",
        body: { identifier: String(identifier || "").trim() },
      });
    },

    async loadCustomerHistory() {
      return requestJson("/public/customer-history", { cache: "no-store" });
    },

    async loadCustomerHistoryDetail(jobRef) {
      return requestJson(`/public/customer-history/${encodeURIComponent(String(jobRef || ""))}`, { cache: "no-store" });
    },

    async loadCustomerHistoryLocations() {
      return requestJson("/public/customer-history/locations", { cache: "no-store" });
    },

    async previewPricing(payload) {
      return requestJson("/public/pricing_preview", {
        method: "POST",
        body: payload,
      });
    },

    async loadAvailability(query) {
      return requestJson("/public/availability_v2", { query, cache: "no-store" });
    },

    async loadAvailabilityCalendar(query) {
      return requestJson("/public/availability_calendar_v2", { query, cache: "no-store" });
    },

    async trackBooking(q) {
      return requestJson("/public/track", { query: { q }, cache: "no-store" });
    },

    async loadUrgentStatus(q) {
      return requestJson("/public/urgent-status", { query: { q }, cache: "no-store" });
    },

    async loadPromotions() {
      return requestJson("/promotions", { query: { customer: 1 } });
    },

    async loadServiceZones() {
      return requestJson("/service_zones");
    },

    async loadHomepage() {
      return requestJson("/public/homepage", { cache: "no-store" });
    },

    async loadHomeActiveJob() {
      return requestJson("/public/homepage/active-job", { cache: "no-store" });
    },

    // Page-availability rollout control (admin toggle) — always fetched fresh so
    // a page turned off in the CMS takes effect without a cache round-trip.
    async loadCustomerAppConfig() {
      return requestJson("/public/customer-app-config", { cache: "no-store" });
    },

    async createOrder(payload) {
      return requestJson("/public/orders", { method: "POST", body: payload || {} });
    },

    async getOrder(code) {
      return requestJson(`/public/orders/${encodeURIComponent(code)}`, { cache: "no-store" });
    },

    async getPaymentConfig() {
      return requestJson("/public/payment-config", { cache: "no-store" });
    },

    async payOrder(code, payload) {
      return requestJson(`/public/orders/${encodeURIComponent(code)}/pay`, { method: "POST", body: payload || {} });
    },

    async loadCatalogItems(query) {
      return requestJson("/catalog/items", { query: { customer: 1, ...(query || {}) }, cache: "no-store" });
    },

    async loadCatalogItem(itemId) {
      return requestJson(`/catalog/items/${encodeURIComponent(itemId)}`, { query: { customer: 1 }, cache: "no-store" });
    },

    async submitScheduledBooking(payload) {
      const body = {
        ...(payload || {}),
        booking_mode: "scheduled",
      };
      return requestJson("/public/book", {
        method: "POST",
        body,
      });
    },

    async submitUrgentRequest(payload) {
      const body = {
        ...(payload || {}),
        booking_mode: "urgent",
        dispatch_mode: "offer",
        allow_time_proposal: true,
      };
      return requestJson("/public/book", {
        method: "POST",
        body,
      });
    },

    async loadCatalogItemReviews(itemId, { limit, offset } = {}) {
      return requestJson(`/catalog/items/${encodeURIComponent(itemId)}/reviews`, {
        query: { limit, offset },
        cache: "no-store",
      });
    },

    async loadReviewEligibility(itemId) {
      return requestJson(`/catalog/items/${encodeURIComponent(itemId)}/reviews/eligibility`, {
        cache: "no-store",
      });
    },

    async submitCatalogItemReview(itemId, payload) {
      return requestJson(`/catalog/items/${encodeURIComponent(itemId)}/reviews`, {
        method: "POST",
        body: payload,
      });
    },

    // Tracking-page review: authorized by the job's own tracking/booking
    // token (no Customer App login). Token only ever travels in this
    // request -- never logged client-side either.
    async loadTrackingReviewStatus(token) {
      return requestJson("/public/catalog-reviews/status", {
        query: { token },
        cache: "no-store",
      });
    },

    async submitTrackingReview(token, payload) {
      return requestJson("/public/catalog-reviews", {
        method: "POST",
        body: { token, ...(payload || {}) },
      });
    },
  };

  root.api = api;
})();
