(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const api = {
    // Phase 2 integration point:
    // GET /public/me
    async getCurrentCustomer() {
      return { logged_in: false, phase: "skeleton" };
    },

    // Phase 2 integration point:
    // POST /public/pricing_preview
    async previewPricing() {
      return { disabled: true, message: "Phase 2 จะเชื่อมต่อ API ประเมินราคาจริง" };
    },

    // Phase 2 integration point:
    // GET /public/availability_v2
    async loadAvailability() {
      return { disabled: true, message: "Phase 2 จะเชื่อมต่อ API เวลาว่างจริง" };
    },

    // Phase 2 integration point only. Do not call /public/book in Phase 1.
    async submitScheduledBooking() {
      return { disabled: true, message: "Phase 2 จะเชื่อมต่อ API จองจริง" };
    },

    // Phase 2/4 integration point only. Do not start urgent dispatch in Phase 1.
    async submitUrgentRequest() {
      return { disabled: true, message: "Phase 2 จะเชื่อมต่อ API คำขอคิวด่วน" };
    },

    // Phase 2 integration point:
    // GET /public/track?q=...
    async trackBooking() {
      return { disabled: true, message: "Phase 2 จะเชื่อมต่อ API ติดตามงานจริง" };
    },
  };

  root.api = api;
})();
