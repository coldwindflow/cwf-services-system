(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const DYNAMIC_ROUTE_PATTERN = /^storeItem-(\d+)$/;

  const router = {
    routes: {},
    initialized: false,
    lastRoute: "",
    register(routes) {
      this.routes = routes || {};
    },
    canonicalRoute(route) {
      const requested = String(route || "home").trim();
      if (this.routes[requested]) return requested;
      if (DYNAMIC_ROUTE_PATTERN.test(requested) && typeof this.routes.storeItem === "function") {
        return requested;
      }
      return "home";
    },
    resolveHandler(route) {
      if (typeof this.routes[route] === "function") return this.routes[route];
      if (DYNAMIC_ROUTE_PATTERN.test(route)) return this.routes.storeItem;
      return this.routes.home;
    },
    routeParam(route) {
      const match = DYNAMIC_ROUTE_PATTERN.exec(String(route || ""));
      return match ? match[1] : "";
    },
    init() {
      if (this.initialized) return;
      this.initialized = true;
      window.addEventListener("hashchange", () => this.render({ focus: true }));
      document.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("button[data-route], a[data-route]") : null;
        if (!target || target.hasAttribute("disabled")) return;
        const route = target.getAttribute("data-route");
        if (!route) return;
        event.preventDefault();
        root.utils.routeTo(this.canonicalRoute(route));
      });
      this.render({ focus: false });
    },
    refresh() {
      if (!this.initialized) return;
      this.render({ focus: false, refresh: true });
    },
    render(options = {}) {
      const requestedRoute = root.state.readRouteFromHash();
      const pa = root.pageAvailability;
      const paReady = !!pa && typeof pa.isReady === "function" && pa.isReady();

      // Central availability guard. Runs before canonicalisation and before any
      // route handler, so a disabled page can never call its handler or fire its
      // page-specific API — regardless of whether the route was reached via a
      // menu, a direct URL/hash, or a JS routeTo() call.
      if (paReady) {
        // Truly unknown route → redirect to the first enabled page instead of
        // silently falling back to (a possibly disabled) home.
        if (!pa.availabilityKey(requestedRoute)) {
          const fallback = pa.firstEnabledRoute();
          if (String(requestedRoute || "").trim() !== fallback) {
            root.utils.routeTo(fallback);
            return;
          }
        }
      }

      const route = this.canonicalRoute(requestedRoute);
      const handler = this.resolveHandler(route);
      const app = document.getElementById("app");
      if (!app || typeof handler !== "function") return;
      document.body.classList.remove("has-contact-sheet");
      if (requestedRoute !== route) {
        history.replaceState(null, "", `#${route}`);
      }

      // Disabled page → maintenance screen. We intentionally do NOT call the
      // route handler (so its page-specific network lookup never fires) and do
      // NOT reveal the page content.
      if (paReady && !pa.isEnabled(route)) {
        const routeChangedOff = this.lastRoute !== route;
        if (routeChangedOff) {
          const prevHandler = this.resolveHandler(this.lastRoute);
          if (typeof prevHandler?.onLeave === "function") prevHandler.onLeave();
        }
        this.lastRoute = route;
        root.state.setRoute(route);
        this.updateNav(route);
        pa.renderMaintenance(app, route);
        app.dataset.currentRoute = route;
        if (options.focus === true && routeChangedOff) {
          requestAnimationFrame(() => app.focus({ preventScroll: true }));
        }
        return;
      }

      const routeChanged = this.lastRoute !== route;
      if (routeChanged) {
        const prevHandler = this.resolveHandler(this.lastRoute);
        if (typeof prevHandler?.onLeave === "function") prevHandler.onLeave();
      }
      this.lastRoute = route;
      root.state.setRoute(route);
      this.updateNav(route);
      handler(app);
      // Re-hide any control that points at a disabled route (CTAs rendered by
      // the handler just now).
      if (paReady && typeof pa.applyToDom === "function") pa.applyToDom(app);
      app.dataset.currentRoute = route;
      if (options.focus === true && routeChanged) {
        requestAnimationFrame(() => app.focus({ preventScroll: true }));
      }
    },
    updateNav(route) {
      const navRoute = DYNAMIC_ROUTE_PATTERN.test(route) ? "store" : route;
      document.querySelectorAll(".nav-item[data-route]").forEach((item) => {
        const active = item.getAttribute("data-route") === navRoute;
        item.classList.toggle("is-active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
    },
  };

  root.router = router;
})();
