(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const router = {
    routes: {},
    initialized: false,
    lastRoute: "",
    register(routes) {
      this.routes = routes || {};
    },
    canonicalRoute(route) {
      const requested = String(route || "home").trim();
      return this.routes[requested] ? requested : "home";
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
      const route = this.canonicalRoute(requestedRoute);
      const handler = this.routes[route] || this.routes.home;
      const app = document.getElementById("app");
      if (!app || typeof handler !== "function") return;
      if (requestedRoute !== route) {
        history.replaceState(null, "", `#${route}`);
      }
      const routeChanged = this.lastRoute !== route;
      root.ui?.closeContactSheet?.({ restoreFocus: false });
      this.lastRoute = route;
      root.state.setRoute(route);
      this.updateNav(route);
      handler(app);
      app.dataset.currentRoute = route;
      document.body.dataset.currentRoute = route;
      if (options.focus === true && routeChanged) {
        requestAnimationFrame(() => app.focus({ preventScroll: true }));
      }
    },
    updateNav(route) {
      document.querySelectorAll(".nav-item[data-route]").forEach((item) => {
        const active = item.getAttribute("data-route") === route;
        item.classList.toggle("is-active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
    },
  };

  root.router = router;
})();
