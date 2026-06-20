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
    const { query, method = "GET", body } = options;
    const response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
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

    async previewPricing(payload) {
      return requestJson("/public/pricing_preview", {
        method: "POST",
        body: payload,
      });
    },

    async loadAvailability(query) {
      return requestJson("/public/availability_v2", { query });
    },

    async trackBooking(q) {
      return requestJson("/public/track", { query: { q } });
    },

    async loadPromotions() {
      return requestJson("/promotions", { query: { customer: 1 } });
    },

    async loadServiceZones() {
      return requestJson("/service_zones");
    },

    async loadCatalogItems() {
      return requestJson("/catalog/items", { query: { customer: 1 } });
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
      };
      return requestJson("/public/book", {
        method: "POST",
        body,
      });
    },
  };

  root.api = api;
})();
