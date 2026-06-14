(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const router = {
    routes: {},
    register(routes) {
      this.routes = routes || {};
    },
    init() {
      window.addEventListener("hashchange", () => this.render());
      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-route]");
        if (!button) return;
        event.preventDefault();
        root.utils.routeTo(button.getAttribute("data-route"));
      });
      this.render();
    },
    render() {
      const route = root.state.readRouteFromHash();
      const handler = this.routes[route] || this.routes.home;
      root.state.setRoute(route);
      this.updateNav(route);
      handler(document.getElementById("app"));
      const app = document.getElementById("app");
      if (app) app.focus({ preventScroll: true });
    },
    updateNav(route) {
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("is-active", item.getAttribute("data-route") === route);
      });
    },
  };

  root.router = router;
})();
