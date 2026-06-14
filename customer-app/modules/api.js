(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const disabledMessage = "ขั้นตอนนี้จะเชื่อมต่อกับระบบจริงในรอบถัดไป";

  const api = {
    // Phase 2 integration point:
    // GET /public/me
    async getCurrentCustomer() {
      return { logged_in: false, phase: "skeleton" };
    },

    // Phase 2 integration point:
    // POST /public/pricing_preview
    async previewPricing() {
      return { disabled: true, message: disabledMessage };
    },

    // Phase 2 integration point:
    // GET /public/availability_v2
    async loadAvailability() {
      return { disabled: true, message: disabledMessage };
    },

    // Phase 2 integration point only. Do not call /public/book in Phase 1.1.
    async submitScheduledBooking() {
      return { disabled: true, message: disabledMessage };
    },

    // Phase 2/4 integration point only. Do not start urgent dispatch in Phase 1.1.
    async submitUrgentRequest() {
      return { disabled: true, message: disabledMessage };
    },

    // Phase 2 integration point:
    // GET /public/track?q=...
    async trackBooking() {
      return { disabled: true, message: disabledMessage };
    },
  };

  root.api = api;
})();
