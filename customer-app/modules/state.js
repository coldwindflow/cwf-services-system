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
    scheduledSubmit: {
      status: "idle",
      error: "",
      result: null,
    },
    urgentFlow: {
      step: "form",
      error: "",
    },
    tracking: { status: "idle", data: null, error: "" },
    draft: {
      scheduled: {
        service_kind: "clean",
        job_type: "ล้าง",
        ac_type: "ผนัง",
        wash_variant: "ล้างธรรมดา",
        repair_variant: "",
        btu: "12000",
        machine_count: 1,
        date: new Date().toISOString().slice(0, 10),
        tech_type: "company",
        selectedSlot: null,
        customer_name: "",
        customer_phone: "",
        address_text: "",
        maps_url: "",
        customer_note: "",
        job_zone: "",
      },
      urgent: {
        customer_name: "",
        customer_phone: "",
        address_text: "",
        maps_url: "",
        service_kind: "clean",
        job_type: "ล้าง",
        ac_type: "ผนัง",
        wash_variant: "ล้างธรรมดา",
        repair_variant: "",
        btu: "12000",
        machine_count: 1,
        symptom: "",
        job_zone: "",
      },
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
    setScheduledSubmit(patch) {
      this.scheduledSubmit = {
        ...(this.scheduledSubmit || {}),
        ...(patch || {}),
      };
    },
    setUrgentFlow(patch) {
      this.urgentFlow = {
        ...(this.urgentFlow || {}),
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
