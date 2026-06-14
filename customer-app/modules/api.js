(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function getApiBase() {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = String(params.get("api") || "").trim();
    const fromStorage = (() => {
      try { return String(window.localStorage.getItem("cwf_customer_app_api_base") || "").trim(); }
      catch (_) { return ""; }
    })();
    if (fromQuery) return fromQuery.replace(/\/+$/, "");
    if (fromStorage) return fromStorage.replace(/\/+$/, "");
    if (window.location.protocol === "file:") return "";
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

    async submitScheduledBooking() {
      return { disabled: true, message: "ยังไม่เปิดส่งคำขอจองจริงในรอบนี้" };
    },

    async submitUrgentRequest() {
      return { disabled: true, message: "ยังไม่เปิดส่งคำขอคิวด่วนจริงในรอบนี้" };
    },
  };

  root.api = api;
})();
