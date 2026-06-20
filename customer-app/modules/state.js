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
    homePricing: { status: "idle", items: {}, error: "" },
    addressPrefill: { status: "idle", scopes: {}, error: "" },
    profileAddressForm: { editing: false, status: "idle", error: "", success: "" },
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
    setHomePricing(patch) {
      this.homePricing = {
        ...(this.homePricing || {}),
        ...(patch || {}),
      };
    },
    setProfileAddressForm(patch) {
      this.profileAddressForm = {
        ...(this.profileAddressForm || {}),
        ...(patch || {}),
      };
    },
    savedAddress() {
      const profile = this.customer && this.customer.logged_in ? (this.customer.profile || {}) : {};
      return {
        address: String(profile.address || "").trim(),
        maps_url: String(profile.maps_url || "").trim(),
      };
    },
    prefillSavedAddress(scope) {
      const saved = this.savedAddress();
      if (!saved.address && !saved.maps_url) return false;
      const current = this.draft[scope] || {};
      const patch = {};
      if (!String(current.address_text || "").trim() && saved.address) patch.address_text = saved.address;
      if (!String(current.maps_url || "").trim() && saved.maps_url) patch.maps_url = saved.maps_url;
      if (!Object.keys(patch).length) return false;
      this.updateDraft(scope, patch);
      this.addressPrefill.scopes = {
        ...(this.addressPrefill.scopes || {}),
        [scope]: true,
      };
      return true;
    },
    async ensureSavedAddressPrefill(scope, onDone) {
      if (this.prefillSavedAddress(scope)) return true;
      if (this.customer || this.addressPrefill.status === "loading" || !root.api || !root.api.getCurrentCustomer) return false;
      this.addressPrefill = { ...(this.addressPrefill || {}), status: "loading", error: "" };
      try {
        const customer = await root.api.getCurrentCustomer();
        this.customer = customer;
        this.guestMode = !customer || !customer.logged_in;
        this.addressPrefill = { ...(this.addressPrefill || {}), status: "success", error: "" };
        const changed = this.prefillSavedAddress(scope);
        if (changed && typeof onDone === "function") onDone();
        return changed;
      } catch (error) {
        this.addressPrefill = { ...(this.addressPrefill || {}), status: "error", error: error.message || "" };
        return false;
      }
    },
    updateCustomerProfile(patch) {
      if (!this.customer) return;
      this.customer = {
        ...this.customer,
        profile: {
          ...(this.customer.profile || {}),
          ...(patch || {}),
        },
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
