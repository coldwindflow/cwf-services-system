(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const state = {
    currentRoute: "home",
    bookingMode: null,
    guestMode: true,
    selectedService: null,
    customer: null,
    catalog: { status: "idle", items: [], error: "" },
    promotions: { status: "idle", items: [], error: "" },
    zones: { status: "idle", items: [], error: "" },
    scheduledPreview: {
      pricing: { status: "idle", data: null, error: "" },
      availability: { status: "idle", data: null, error: "" },
    },
    tracking: { status: "idle", data: null, error: "" },
    draft: {
      scheduled: {
        job_type: "ล้าง",
        ac_type: "ผนัง",
        wash_variant: "ล้างธรรมดา",
        btu: 12000,
        machine_count: 1,
        date: new Date().toISOString().slice(0, 10),
        tech_type: "company",
      },
      urgent: {},
      tracking: {
        trackingCode: "",
      },
    },
    init() {
      this.currentRoute = this.readRouteFromHash();
    },
    readRouteFromHash() {
      const route = String(window.location.hash || "").replace(/^#\/?/, "").trim();
      return route || "home";
    },
    setRoute(route) {
      this.currentRoute = route || "home";
    },
    setBookingMode(mode) {
      this.bookingMode = mode;
    },
    updateDraft(scope, patch) {
      this.draft[scope] = {
        ...(this.draft[scope] || {}),
        ...(patch || {}),
      };
    },
    setCollection(name, patch) {
      this[name] = {
        ...(this[name] || {}),
        ...(patch || {}),
      };
    },
    setScheduledPreview(name, patch) {
      this.scheduledPreview[name] = {
        ...(this.scheduledPreview[name] || {}),
        ...(patch || {}),
      };
    },
    setTracking(patch) {
      this.tracking = {
        ...(this.tracking || {}),
        ...(patch || {}),
      };
    },
  };

  root.state = state;
})();
