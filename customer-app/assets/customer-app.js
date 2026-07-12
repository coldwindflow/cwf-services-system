(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;
  const BOOT_TIMEOUT_MS = 3500;
  const BUILD_ID = "20260712_page_controls_tracking_link_v2";

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
    let requestedTracking = false;
    if (trackingKey) {
      // The deep-link value may be the private booking_token. Hand it to the
      // tracking module as a PRIVATE credential — never write it into the
      // visible tracking draft/input (it would be rendered before/while the
      // lookup runs). The tracking module consumes it on its first render.
      App.tracking?.setInitialCredential?.(trackingKey);
      requestedTracking = true;
      if (!window.location.hash || App.state.readRouteFromHash() === "home") {
        window.location.hash = "#tracking";
      }
    }

    // Load the page-availability config and WAIT for it to be ready before the
    // router initialises, so the very first render already knows which pages
    // are open. load() always resolves to a ready state (server → cache →
    // degraded fail-safe) and never rejects.
    const pa = App.pageAvailability;
    if (pa && typeof pa.load === "function") {
      await pa.load();
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

    // If nothing sent us to an explicit route and the landing page is disabled,
    // start on the first enabled route instead of bouncing through a disabled
    // home render.
    if (pa && typeof pa.isReady === "function" && pa.isReady()) {
      const hasExplicitHash = !!window.location.hash && App.state.readRouteFromHash() !== "home";
      if (!requestedTracking && !hasExplicitHash && !pa.isEnabled("home")) {
        window.location.hash = `#${pa.firstEnabledRoute()}`;
      }
    }

    // Only prefetch Home when Home is actually enabled AND is (still) the
    // initial route — avoids a wasted/hidden home fetch for a disabled page.
    const homeEnabled = !pa || typeof pa.isEnabled !== "function" || pa.isEnabled("home");
    const initialRouteHome = App.state.readRouteFromHash() === "home";
    const bootWork = Promise.allSettled([
      App.auth.bootstrap(),
      homeEnabled && initialRouteHome ? App.ui.prefetchHome() : Promise.resolve(),
    ]);

    await withTimeout(bootWork, BOOT_TIMEOUT_MS);
    App.ui.updateAccountChrome();
    if (pa && typeof pa.startObserver === "function") pa.startObserver();
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
