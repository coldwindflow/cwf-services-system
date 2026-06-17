(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;

  function init() {
    App.state.init();
    const params = new URLSearchParams(window.location.search || "");
    const trackingKey = String(params.get("q") || params.get("token") || "").trim();
    if (trackingKey) {
      App.state.updateDraft("tracking", { trackingCode: trackingKey });
      if (!window.location.hash || App.state.readRouteFromHash() === "home") {
        window.location.hash = "#tracking";
      }
    }
    App.router.register({
      home: App.ui.renderHome,
      booking: App.ui.renderBookingMode,
      scheduled: App.bookingScheduled.render,
      urgent: App.bookingUrgent.render,
      tracking: App.tracking.render,
      profile: App.profile.render,
    });
    App.router.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
