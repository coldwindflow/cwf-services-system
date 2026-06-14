(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const state = {
    currentRoute: "home",
    bookingMode: null,
    guestMode: true,
    selectedService: null,
    draft: {
      scheduled: {},
      urgent: {},
      trackingCode: "",
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
  };

  root.state = state;
})();
