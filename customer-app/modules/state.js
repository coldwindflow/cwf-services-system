(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const SCHEDULED_STORAGE_KEY = "cwf_customer_app_v2_scheduled_v3";
  const SCHEDULED_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function bangkokTodayYmd() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${value.year}-${value.month}-${value.day}`;
    } catch (_) {
      return new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    }
  }

  function defaultScheduledDraft() {
    const today = bangkokTodayYmd();
    return {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: "ผนัง",
      wash_variant: "ล้างธรรมดา",
      repair_variant: "",
      btu: "12000",
      machine_count: 1,
      date: today,
      calendar_month: today.slice(0, 7),
      tech_type: "company",
      selectedSlot: null,
      customer_name: "",
      customer_phone: "",
      address_text: "",
      maps_url: "",
      customer_note: "",
      job_zone: "",
    };
  }

  function safeSessionGet() {
    try { return window.sessionStorage.getItem(SCHEDULED_STORAGE_KEY); }
    catch (_) { return null; }
  }

  function safeSessionSet(value) {
    try { window.sessionStorage.setItem(SCHEDULED_STORAGE_KEY, value); }
    catch (_) { /* storage may be blocked; in-memory flow still works */ }
  }

  function safeSessionRemove() {
    try { window.sessionStorage.removeItem(SCHEDULED_STORAGE_KEY); }
    catch (_) { /* ignore */ }
  }

  const state = {
    currentRoute: "home",
    bookingMode: null,
    guestMode: true,
    selectedService: null,
    customer: null,
    authStatus: "idle",
    authError: "",
    authConfig: null,
    catalog: { status: "idle", items: [], error: "" },
    promotions: { status: "idle", items: [], error: "" },
    zones: { status: "idle", items: [], error: "" },
    homePricing: { status: "idle", items: {}, error: "" },
    addressPrefill: { status: "idle", scopes: {}, error: "" },
    profileAddressForm: { editing: false, status: "idle", error: "", success: "" },
    scheduledWizard: {
      step: 1,
      maxStep: 6,
      error: "",
    },
    scheduledPreview: {
      pricing: { status: "idle", data: null, error: "" },
      availability: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
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
      scheduled: defaultScheduledDraft(),
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
      this.restoreScheduledDraft();
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
      if (scope === "scheduled") this.persistScheduledDraft();
    },
    resetScheduledDraft() {
      this.draft.scheduled = defaultScheduledDraft();
      this.scheduledWizard = { step: 1, maxStep: 6, error: "" };
      this.scheduledPreview = {
        pricing: { status: "idle", data: null, error: "" },
        availability: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
      };
      this.scheduledSubmit = { status: "idle", error: "", result: null };
      safeSessionRemove();
    },
    persistScheduledDraft() {
      const payload = {
        version: 3,
        saved_at: Date.now(),
        step: Math.max(1, Math.min(6, Number(this.scheduledWizard?.step || 1))),
        draft: this.draft.scheduled || defaultScheduledDraft(),
      };
      safeSessionSet(JSON.stringify(payload));
    },
    restoreScheduledDraft() {
      const raw = safeSessionGet();
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 3 || !parsed.draft) return false;
        if (!Number.isFinite(parsed.saved_at) || Date.now() - parsed.saved_at > SCHEDULED_STORAGE_TTL_MS) {
          safeSessionRemove();
          return false;
        }
        const defaults = defaultScheduledDraft();
        const restored = { ...defaults, ...parsed.draft };
        restored.service_kind = "clean";
        restored.job_type = "ล้าง";
        restored.repair_variant = "";
        restored.machine_count = Math.max(1, Math.min(10, Number(restored.machine_count || 1)));
        if (!restored.date || restored.date < bangkokTodayYmd()) {
          restored.date = bangkokTodayYmd();
          restored.selectedSlot = null;
        }
        restored.calendar_month = String(restored.calendar_month || restored.date.slice(0, 7));
        this.draft.scheduled = restored;
        this.scheduledWizard = {
          ...this.scheduledWizard,
          step: Math.max(1, Math.min(6, Number(parsed.step || 1))),
          maxStep: 6,
          error: "",
        };
        return true;
      } catch (_) {
        safeSessionRemove();
        return false;
      }
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
    setScheduledWizard(patch) {
      this.scheduledWizard = {
        ...(this.scheduledWizard || {}),
        ...(patch || {}),
      };
      this.scheduledWizard.maxStep = 6;
      this.scheduledWizard.step = Math.max(1, Math.min(6, Number(this.scheduledWizard.step || 1)));
      this.persistScheduledDraft();
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
