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
    init() {
      if (this.initialized) return;
      this.initialized = true;
      window.addEventListener("hashchange", () => this.render({ focus: true }));
      document.addEventListener("click", (event) => {
        const serviceButton = event.target.closest("[data-commerce-service]");
        if (serviceButton) {
          event.preventDefault();
          const item = root.services?.commerceItem?.(serviceButton.getAttribute("data-commerce-service"));
          if (!item) return;
          root.services.applyCommerceDraft(item.route, item);
          root.utils.routeTo(item.route);
          return;
        }
        const methodButton = event.target.closest("[data-commerce-method]");
        if (methodButton) {
          event.preventDefault();
          const item = root.services?.commerceItem?.(methodButton.getAttribute("data-commerce-method"));
          if (!item) return;
          root.services.applyCommerceDraft("scheduled", item);
          root.utils.routeTo("scheduled");
          return;
        }
        const button = event.target.closest("[data-route]");
        if (!button) return;
        event.preventDefault();
        root.utils.routeTo(button.getAttribute("data-route"));
      });
      this.render({ focus: false });
    },
    refresh() {
      if (!this.initialized) return;
      this.render({ focus: false, refresh: true });
    },
    render(options = {}) {
      const route = root.state.readRouteFromHash();
      const handler = this.routes[route] || this.routes.home;
      const app = document.getElementById("app");
      if (!app) return;
      const routeChanged = this.lastRoute !== route;
      this.lastRoute = route;
      root.state.setRoute(route);
      this.updateNav(route);
      handler(app);
      app.dataset.route = route;
      if (options.focus === true && routeChanged) {
        requestAnimationFrame(() => app.focus({ preventScroll: true }));
      }
    },
    updateNav(route) {
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("is-active", item.getAttribute("data-route") === route);
      });
    },
  };

  root.router = router;
})();