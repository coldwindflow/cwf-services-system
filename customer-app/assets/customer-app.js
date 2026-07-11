(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;
  const BOOT_TIMEOUT_MS = 3500;
  const BUILD_ID = "20260711_tracking_gps_recovery_v1";

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    let reloadedForBuild = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForBuild) return;
      reloadedForBuild = true;
      const key = `cwf-customer-app-v2-reloaded-${BUILD_ID}`;
      try {
        if (window.sessionStorage.getItem(key) === "1") return;
        window.sessionStorage.setItem(key, "1");
      } catch (_) {
        /* continue with the guarded reload */
      }
      window.location.reload();
    });
    navigator.serviceWorker.register(`./sw.js?v=${BUILD_ID}`, { scope: "./", updateViaCache: "none" }).catch(() => {});
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
      store: App.store.render,
      storeItem: App.store.renderDetail,
      booking: App.ui.renderBookingMode,
      scheduled: App.bookingScheduled.render,
      urgent: App.bookingUrgent.render,
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
      App.ui.patchHomeData?.();
    });

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
