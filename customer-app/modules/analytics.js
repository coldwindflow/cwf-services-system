(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  // Store funnel analytics events. Dependency-free: safely no-ops when
  // neither window.dataLayer nor window.gtag exists (e.g. ad blockers,
  // consent not yet granted, or this test/server-side context).
  // Allowed fields ONLY -- never PII, review comment text, auth token, or
  // booking code. Unknown keys passed in `fields` are dropped silently so a
  // future caller can never accidentally leak something sensitive.
  const ALLOWED_EVENTS = new Set([
    "cwf_store_view",
    "cwf_store_product_view",
    "cwf_store_variant_select",
    "cwf_store_filter",
    "cwf_store_detail_expand",
    "cwf_store_related_click",
    "cwf_store_begin_booking",
    "cwf_store_contact_admin",
  ]);

  const ALLOWED_FIELDS = [
    "item_id",
    "category",
    "ac_type",
    "wash_variant",
    "btu",
    "price",
    "source",
    "position",
    "filter_name",
    "filter_value",
    "sort",
  ];

  function sanitizeFields(fields) {
    const input = fields || {};
    const safe = {};
    ALLOWED_FIELDS.forEach((key) => {
      if (input[key] === undefined || input[key] === null) return;
      const value = input[key];
      safe[key] = typeof value === "object" ? String(value) : value;
    });
    return safe;
  }

  function track(eventName, fields) {
    if (!ALLOWED_EVENTS.has(eventName)) return;
    const payload = Object.assign({ event: eventName }, sanitizeFields(fields));
    try {
      if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
      if (typeof window.gtag === "function") window.gtag("event", eventName, sanitizeFields(fields));
    } catch (_error) {
      // Analytics must never break the customer experience.
    }
  }

  root.analytics = { track };
})();
