(function () {
  "use strict";

  const App = window.CWFCustomerAppV2;
  const BOOT_TIMEOUT_MS = 3500;
  const BUILD_ID = "20260714_home_six_card_rotation_v1";

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // Parse the (private) tracking credential out of the boot URL and return a
  // scrubbed URL that no longer contains it. Pure + side-effect free so it can
  // be unit-tested directly.
  //
  //  - Official format (credential in the FRAGMENT, never sent to the server):
  //      /customer-app/index.html#tracking?q=<credential>
  //      /customer-app/index.html#tracking?token=<credential>
  //  - Legacy format (credential in the query — still supported, still scrubbed):
  //      /customer-app/index.html?q=<credential>#tracking
  //      /customer-app/index.html?token=<credential>#tracking
  //
  // Unrelated query params (e.g. ?utm_source=line) are preserved. When a
  // credential is captured the route is normalised to a clean "#tracking".
  function parseTrackingBoot(href) {
    const result = { credential: "", isTracking: false, cleanUrl: href, changed: false };
    let url;
    try { url = new URL(href); } catch (_) { return result; }

    // ---- fragment first (the official, server-invisible location) ----------
    const rawHash = url.hash.charAt(0) === "#" ? url.hash.slice(1) : url.hash;
    const qIndex = rawHash.indexOf("?");
    const hashRoute = qIndex >= 0 ? rawHash.slice(0, qIndex) : rawHash;
    let fragHadCred = false;
    if (qIndex >= 0) {
      const fp = new URLSearchParams(rawHash.slice(qIndex + 1));
      const fragCred = String(fp.get("q") || fp.get("token") || "").trim();
      if (fp.has("q") || fp.has("token")) fragHadCred = true;
      if (fragCred) result.credential = fragCred;
      fp.delete("q"); fp.delete("token");
      const rest = fp.toString();
      url.hash = rest ? `${hashRoute}?${rest}` : hashRoute;
    }
    if (hashRoute === "tracking") result.isTracking = true;

    // ---- legacy query fallback --------------------------------------------
    const sp = url.searchParams;
    const queryHadCred = sp.has("q") || sp.has("token");
    if (!result.credential) {
      const queryCred = String(sp.get("q") || sp.get("token") || "").trim();
      if (queryCred) result.credential = queryCred;
    }
    sp.delete("q"); sp.delete("token");

    // A captured credential always lands on a clean #tracking route.
    if (result.credential) {
      url.hash = "tracking";
      result.isTracking = true;
    }

    result.cleanUrl = url.toString();
    result.changed = fragHadCred || queryHadCred;
    return result;
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
    // Capture + SCRUB the private tracking credential BEFORE state.init() so the
    // router never sees a route like "tracking?q=..." and the credential never
    // lingers in the address bar / history. Fragment form is preferred (never
    // sent to the server); legacy query form is still honoured and scrubbed.
    const boot = parseTrackingBoot(window.location.href);
    if (boot.changed) {
      // replaceState (not a new history entry) drops ?q=/#tracking?q= from the
      // URL bar while preserving unrelated query params (e.g. utm_source).
      try { window.history.replaceState(null, "", boot.cleanUrl); } catch (_) { /* non-fatal */ }
    }

    App.state.init();

    let requestedTracking = false;
    if (boot.credential) {
      // The deep-link value may be the private booking_token. Hand it to the
      // tracking module as a PRIVATE credential — never write it into the
      // visible tracking draft/input, never persist it. The tracking module
      // consumes it on its first render. It is NOT kept anywhere serialisable.
      App.tracking?.setInitialCredential?.(boot.credential);
      requestedTracking = true;
      // cleanUrl already ends in #tracking; ensure the route resolves to it even
      // if replaceState was unavailable.
      if (App.state.readRouteFromHash() !== "tracking") {
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
