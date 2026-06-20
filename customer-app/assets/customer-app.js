(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;
  const BOOT_TIMEOUT_MS = 3500;

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async function init() {
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
      tracking: App.tracking.render,
      profile: App.profile.render,
    });

    const bootWork = Promise.allSettled([
      App.auth.bootstrap(),
      App.ui.prefetchHome(),
    ]);

    await withTimeout(bootWork, BOOT_TIMEOUT_MS);
    App.ui.updateAccountChrome();
    App.router.init();

    requestAnimationFrame(() => {
      document.body.classList.remove("is-app-booting");
      document.body.classList.add("is-app-ready");
    });

    bootWork.then(() => {
      App.ui.updateAccountChrome();
      App.router.refresh();
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js?v=20260620_cleaning_calendar_v1", { scope: "./" }).catch(() => {});
      }, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();