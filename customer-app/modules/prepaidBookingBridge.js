(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  let inFlight = false;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function request(path, options = {}) {
    const response = await fetch(`${root.api.getApiBase()}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code || data?.error || "REQUEST_FAILED";
      error.data = data;
      throw error;
    }
    return data;
  }

  function showPreparing() {
    const body = document.querySelector(".cwf-prepaid-backdrop [data-prepaid-body]");
    if (body) body.innerHTML = '<div class="cwf-prepaid-card">กำลังเปิดปฏิทินและตรวจคิวช่างที่ว่าง...</div>';
  }

  function showError(error) {
    const body = document.querySelector(".cwf-prepaid-backdrop [data-prepaid-body]");
    const code = error?.code || error?.message || "REQUEST_FAILED";
    if (body) {
      body.innerHTML = `<div class="cwf-prepaid-error">ไม่สามารถเปิดคิวได้ (${esc(code)}) กรุณาลองอีกครั้ง</div>`;
      return;
    }
    root.state?.setScheduledWizard?.({ error: `ไม่สามารถเปิดคิวได้ (${String(code)})` });
  }

  function closePrepaidModal() {
    document.querySelector(".cwf-prepaid-backdrop")?.remove();
  }

  function prepareScheduledDraft(redemption) {
    const r = redemption || {};
    const today = root.availability.bangkokTodayYmd();
    const groups = Array.isArray(r.service_package_groups) ? r.service_package_groups : [];
    const services = Array.isArray(r.services) ? r.services : [];
    if (!Number(r.catalog_item_id) || !groups.length || !Number(r.duration_min) || !String(r.prepaid_redemption_token || "").trim()) {
      const error = new Error("PREPAID_REDEMPTION_INCOMPLETE");
      error.code = "PREPAID_REDEMPTION_INCOMPLETE";
      throw error;
    }

    const preview = {
      package_name: "สิทธิ์ PREPAID",
      groups,
      fixed_total_price: Number(r.fixed_total_price || 0),
      duration_min: Number(r.duration_min),
      redeem_until: r.redeem_until,
      payload: { services },
      server_verified: true,
      prepaid: true,
    };

    root.state.updateDraft("scheduled", {
      catalog_item_id: Number(r.catalog_item_id),
      catalog_booking_quote: null,
      catalog_booking_pricing: null,
      service_package_key: "",
      service_package_tier_key: "",
      service_package_btu: "",
      service_package_groups: groups,
      service_package_bundle_preview: preview,
      services,
      prepaid_redemption_token: String(r.prepaid_redemption_token),
      scheduled_request_key: String(r.scheduled_request_key || ""),
      selectedSlot: null,
      date: today,
      calendar_month: today.slice(0, 7),
    });

    root.state.setScheduledPreview("package", {
      status: "success",
      data: preview,
      error: "",
      verified: true,
    });
    root.state.setScheduledPreview("pricing", {
      status: "success",
      data: {
        duration_min: Number(r.duration_min),
        fixed_total_price: Number(r.fixed_total_price || 0),
      },
      error: "",
      verified: true,
    });
    root.state.setScheduledPreview("calendar", {
      status: "idle",
      data: null,
      error: "",
      query_key: "",
      loaded_at: "",
    });
    root.state.setScheduledPreview("availability", {
      status: "idle",
      data: null,
      error: "",
      query_key: "",
      loaded_at: "",
    });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
    root.state.setScheduledWizard({ step: 2, error: "" });
  }

  function openScheduledRoute() {
    const currentRoute = typeof root.state?.readRouteFromHash === "function"
      ? root.state.readRouteFromHash()
      : "";
    if (currentRoute === "scheduled" && typeof root.router?.refresh === "function") {
      root.router.refresh();
      return;
    }
    root.utils.routeTo("scheduled");
  }

  async function useRight(entitlementCode) {
    if (inFlight) return;
    const code = String(entitlementCode || "").trim();
    if (!code) return;
    inFlight = true;
    showPreparing();
    try {
      const data = await request(`/public/service-rights/${encodeURIComponent(code)}/begin-redemption`, {
        method: "POST",
        body: {},
      });
      prepareScheduledDraft(data.redemption);
      closePrepaidModal();
      openScheduledRoute();
    } catch (error) {
      showError(error);
    } finally {
      inFlight = false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-use-right]") : null;
    if (!button || button.disabled) return;
    const entitlementCode = String(button.getAttribute("data-use-right") || "").trim();
    if (!entitlementCode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    useRight(entitlementCode);
  }, true);

  root.prepaidBookingBridge = {
    useRight,
    _test: { prepareScheduledDraft, openScheduledRoute },
  };
})();