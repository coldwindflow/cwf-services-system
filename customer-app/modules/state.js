(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const SCHEDULED_STORAGE_KEY = "cwf_customer_app_v2_scheduled_v5";
  const SCHEDULED_LEGACY_STORAGE_KEYS = [
    "cwf_customer_app_v2_scheduled_v4",
    "cwf_customer_app_v2_scheduled_v3",
    "cwf_customer_app_v2_scheduled_v2",
  ];
  const SCHEDULED_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_SCHEDULED_STEP = 3;

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

  function defaultServiceLine(index) {
    return {
      line_id: `line-${Date.now().toString(36)}-${index || 1}`,
      job_type: "ล้าง",
      ac_type: "ผนัง",
      btu: 12000,
      machine_count: 1,
      wash_variant: "ล้างธรรมดา",
    };
  }

  function normalizeRestoredServices(restored) {
    const raw = Array.isArray(restored.services) && restored.services.length
      ? restored.services
      : [{
          line_id: "line-1",
          job_type: restored.job_type || "ล้าง",
          ac_type: restored.ac_type || "ผนัง",
          btu: restored.btu || 12000,
          machine_count: restored.machine_count || 1,
          wash_variant: restored.wash_variant || "ล้างธรรมดา",
        }];
    return raw.map((line, index) => {
      const acType = String(line.ac_type || "ผนัง").trim();
      const machineCount = Math.max(1, Math.min(10, Number(line.machine_count || 1)));
      return {
        line_id: String(line.line_id || `line-${index + 1}`).trim() || `line-${index + 1}`,
        job_type: "ล้าง",
        ac_type: acType,
        btu: Number(line.btu || 12000),
        machine_count: machineCount,
        wash_variant: acType === "ผนัง" ? String(line.wash_variant || "ล้างธรรมดา").trim() : "",
      };
    });
  }

  function defaultScheduledDraft() {
    const today = bangkokTodayYmd();
    const firstLine = defaultServiceLine(1);
    return {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: firstLine.ac_type,
      wash_variant: firstLine.wash_variant,
      repair_variant: "",
      btu: String(firstLine.btu),
      machine_count: firstLine.machine_count,
      services: [firstLine],
      date: today,
      calendar_month: today.slice(0, 7),
      // Defect 1: all admin-enabled employment types (filtered strictly server-side).
      tech_type: "all",
      selectedSlot: null,
      allow_time_proposal: false,
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

  function removeScheduledStorage() {
    safeSessionRemove();
    for (const key of SCHEDULED_LEGACY_STORAGE_KEYS) {
      try { window.sessionStorage.removeItem(key); }
      catch (_) { /* ignore */ }
    }
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
    homepage: { status: "idle", config: null, fallback: false, error: "" },
    catalog: { status: "idle", items: [], error: "" },
    storeDetail: { status: "idle", itemId: "", data: null, error: "" },
    storeScrollY: 0,
    promotions: { status: "idle", items: [], error: "" },
    zones: { status: "idle", items: [], error: "" },
    homePricing: { status: "idle", items: {}, error: "" },
    homeActiveJob: { status: "idle", data: null, error: "" },
    addressPrefill: { status: "idle", scopes: {}, error: "" },
    profileAddressForm: { editing: false, status: "idle", error: "", success: "" },
    scheduledWizard: {
      step: 1,
      maxStep: MAX_SCHEDULED_STEP,
      error: "",
    },
    scheduledPreview: {
      pricing: { status: "idle", data: null, error: "" },
      availability: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
      calendar: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
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
      this.scheduledWizard = { step: 1, maxStep: MAX_SCHEDULED_STEP, error: "" };
      this.scheduledPreview = {
        pricing: { status: "idle", data: null, error: "" },
        availability: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
        calendar: { status: "idle", data: null, error: "", query_key: "", loaded_at: "" },
      };
      this.scheduledSubmit = { status: "idle", error: "", result: null };
      removeScheduledStorage();
    },
    persistScheduledDraft() {
      const payload = {
        version: 5,
        saved_at: Date.now(),
        step: Math.max(1, Math.min(MAX_SCHEDULED_STEP, Number(this.scheduledWizard?.step || 1))),
        draft: this.draft.scheduled || defaultScheduledDraft(),
      };
      safeSessionSet(JSON.stringify(payload));
    },
    restoreScheduledDraft() {
      let raw = safeSessionGet();
      let fromLegacy = false;
      if (!raw) {
        for (const key of SCHEDULED_LEGACY_STORAGE_KEYS) {
          try {
            raw = window.sessionStorage.getItem(key);
            if (raw) {
              fromLegacy = true;
              break;
            }
          } catch (_) {
            raw = null;
          }
        }
      }
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || ![1, 2, 3, 4, 5].includes(Number(parsed.version)) || !parsed.draft) return false;
        if (!Number.isFinite(parsed.saved_at) || Date.now() - parsed.saved_at > SCHEDULED_STORAGE_TTL_MS) {
          removeScheduledStorage();
          return false;
        }
        const defaults = defaultScheduledDraft();
        const restored = { ...defaults, ...parsed.draft };
        restored.service_kind = "clean";
        restored.job_type = "ล้าง";
        restored.repair_variant = "";
        restored.services = normalizeRestoredServices(restored);
        const first = restored.services[0] || defaultServiceLine(1);
        restored.ac_type = first.ac_type;
        restored.wash_variant = first.wash_variant || "";
        restored.btu = String(first.btu || 12000);
        restored.machine_count = Math.max(1, Math.min(10, Number(first.machine_count || 1)));
        restored.allow_time_proposal = restored.allow_time_proposal === true;
        if (!restored.date || restored.date < bangkokTodayYmd()) {
          restored.date = bangkokTodayYmd();
          restored.selectedSlot = null;
        }
        restored.calendar_month = String(restored.calendar_month || restored.date.slice(0, 7));
        this.draft.scheduled = restored;
        const parsedStep = Number(parsed.step || 1);
        const nextStep = (() => {
          if (parsed.version >= 5 && !fromLegacy) return Math.max(1, Math.min(MAX_SCHEDULED_STEP, parsedStep));
          if (parsedStep <= 2) return 1;
          if (parsedStep <= 4) return 2;
          return 3;
        })();
        this.scheduledWizard = {
          ...this.scheduledWizard,
          step: nextStep,
          maxStep: MAX_SCHEDULED_STEP,
          error: "",
        };
        this.persistScheduledDraft();
        return true;
      } catch (_) {
        removeScheduledStorage();
        return false;
      }
    },
    setCollection(name, patch) {
      this[name] = {
        ...(this[name] || {}),
        ...(patch || {}),
      };
    },
    setHomepage(patch) {
      this.homepage = {
        ...(this.homepage || {}),
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
      this.scheduledWizard.maxStep = MAX_SCHEDULED_STEP;
      this.scheduledWizard.step = Math.max(1, Math.min(MAX_SCHEDULED_STEP, Number(this.scheduledWizard.step || 1)));
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
    setStoreDetail(patch) {
      this.storeDetail = {
        ...(this.storeDetail || {}),
        ...(patch || {}),
      };
    },
    setStoreScrollY(value) {
      this.storeScrollY = Math.max(0, Number(value) || 0);
    },
  };

  root.state = state;
})();
