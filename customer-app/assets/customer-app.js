(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;

  function init() {
    App.state.init();
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
