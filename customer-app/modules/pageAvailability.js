(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  // Customer App page-availability (admin rollout control, NOT a server kill
  // switch). Source of truth is the published Homepage CMS config, read via the
  // lightweight /public/customer-app-config endpoint. This module never becomes
  // the source of truth; localStorage is only a last-known-good cache.
  const PAGE_KEYS = ["home", "store", "booking", "scheduled", "urgent", "tracking", "profile"];
  const DEFAULT_ALL_ENABLED = Object.freeze({
    home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true,
  });
  // Fail-safe: keep the landing page and Tracking reachable, close the
  // transactional/unfinished flows when we truly have nothing to trust.
  const DEGRADED = Object.freeze({
    home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false,
  });
  const CACHE_KEY = "cwf_customer_app_page_availability_v1";
  const CACHE_VERSION = 1;
  const LOAD_TIMEOUT_MS = 3000;
  // First-enabled priority for the initial route and the maintenance "back"
  // action. Validation guarantees at least one page is enabled.
  const ROUTE_PRIORITY = ["home", "tracking", "store", "booking", "profile", "scheduled", "urgent"];
  const DYNAMIC_STORE_PATTERN = /^storeItem-(\d+)$/;
  const LINE_URL = "https://lin.ee/fG1Oq7y";
  const PHONE_DISPLAY = "098-877-7321";
  const PHONE_TEL = "0988777321";
  const PAGE_LABELS = {
    home: "หน้าแรก", store: "ร้านค้า", booking: "เลือกประเภทการจอง", scheduled: "จองล่วงหน้า",
    urgent: "คิวด่วน", tracking: "ติดตามงาน", profile: "บัญชีลูกค้า",
  };

  // Start from the degraded fail-safe so that, even if something calls isEnabled()
  // before load() resolves, we never accidentally treat a page as enabled.
  let flags = { ...DEGRADED };
  let ready = false;
  let observer = null;

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // A valid page_availability map: exactly the 7 boolean keys, no unknown/missing
  // keys, and at least one page enabled.
  function isValidFlags(pa) {
    if (!isPlainObject(pa)) return false;
    const keys = Object.keys(pa);
    if (keys.length !== PAGE_KEYS.length) return false;
    for (const key of keys) if (!PAGE_KEYS.includes(key)) return false;
    let anyEnabled = false;
    for (const key of PAGE_KEYS) {
      if (typeof pa[key] !== "boolean") return false;
      if (pa[key]) anyEnabled = true;
    }
    return anyEnabled;
  }

  function cloneFlags(pa) {
    const out = {};
    for (const key of PAGE_KEYS) out[key] = pa[key] === true;
    return out;
  }

  // ---- last-known-good cache -----------------------------------------------
  function readCache() {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== CACHE_VERSION) return null;
      if (!isValidFlags(parsed.page_availability)) return null;
      return cloneFlags(parsed.page_availability);
    } catch (_) {
      return null;
    }
  }

  function writeCache(pa) {
    try {
      if (!isValidFlags(pa)) return;
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        version: CACHE_VERSION,
        saved_at: Date.now(),
        page_availability: cloneFlags(pa),
      }));
    } catch (_) {
      /* storage unavailable — cache is optional */
    }
  }

  // ---- route mapping --------------------------------------------------------
  // Map any router route to its availability key. Unknown routes return null and
  // must NEVER be treated as enabled.
  function availabilityKey(route) {
    const requested = String(route == null ? "" : route).trim();
    if (DYNAMIC_STORE_PATTERN.test(requested)) return "store";
    if (PAGE_KEYS.includes(requested)) return requested;
    return null;
  }

  function isEnabled(route) {
    const key = availabilityKey(route);
    if (!key) return false;
    return flags[key] === true;
  }

  function firstEnabledRoute() {
    for (const key of ROUTE_PRIORITY) if (flags[key] === true) return key;
    return "home";
  }

  function isReady() { return ready; }
  function getFlags() { return cloneFlags(flags); }

  // ---- config load ----------------------------------------------------------
  function withTimeout(promise, ms) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }

  // Priority: valid non-degraded server config → last-known-good cache → server
  // degraded fallback → built-in degraded. Always resolves to a ready state.
  async function load() {
    let serverFlags = null;
    try {
      const resp = await withTimeout(root.api.loadCustomerAppConfig(), LOAD_TIMEOUT_MS);
      const degraded = resp && resp.degraded === true;
      if (resp && resp.ok === true && !degraded && isValidFlags(resp.page_availability)) {
        serverFlags = cloneFlags(resp.page_availability);
      }
    } catch (_) {
      /* fail / hang / invalid JSON / invalid flags → fall through */
    }

    if (serverFlags) {
      flags = serverFlags;
      writeCache(serverFlags); // cache only a valid, non-degraded server response
    } else {
      const cached = readCache();
      flags = cached || { ...DEGRADED };
    }
    ready = true;
    applyToDom(document);
    return getFlags();
  }

  // ---- disabled-route controls ---------------------------------------------
  // Hide every control that points at a disabled (or unknown) route. Only ever
  // touch attributes THIS module set, and restore the element's prior
  // disabled/hidden state so a control disabled by other business logic is never
  // silently re-enabled.
  function markHidden(el) {
    if (el.getAttribute("data-cwf-avail") === "off") return;
    el.setAttribute("data-cwf-avail", "off");
    el.setAttribute("data-cwf-prev-hidden", el.hasAttribute("hidden") ? "1" : "0");
    el.setAttribute("data-cwf-prev-aria", el.getAttribute("aria-hidden") || "");
    el.setAttribute("data-cwf-prev-tabindex", el.hasAttribute("tabindex") ? String(el.getAttribute("tabindex")) : "");
    el.setAttribute("hidden", "hidden");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("tabindex", "-1");
    if ("disabled" in el) {
      el.setAttribute("data-cwf-prev-disabled", el.disabled ? "1" : "0");
      el.disabled = true;
    }
  }

  function restoreShown(el) {
    if (el.getAttribute("data-cwf-avail") !== "off") return; // not ours
    if (el.getAttribute("data-cwf-prev-hidden") === "1") el.setAttribute("hidden", "hidden");
    else el.removeAttribute("hidden");
    const prevAria = el.getAttribute("data-cwf-prev-aria");
    if (prevAria) el.setAttribute("aria-hidden", prevAria); else el.removeAttribute("aria-hidden");
    const prevTab = el.getAttribute("data-cwf-prev-tabindex");
    if (prevTab !== null && prevTab !== "") el.setAttribute("tabindex", prevTab); else el.removeAttribute("tabindex");
    if ("disabled" in el) el.disabled = el.getAttribute("data-cwf-prev-disabled") === "1";
    el.removeAttribute("data-cwf-avail");
    el.removeAttribute("data-cwf-prev-hidden");
    el.removeAttribute("data-cwf-prev-aria");
    el.removeAttribute("data-cwf-prev-tabindex");
    el.removeAttribute("data-cwf-prev-disabled");
  }

  function applyToDom(scope) {
    if (!ready) return;
    const target = scope && typeof scope.querySelectorAll === "function" ? scope : document;
    let nodes;
    try { nodes = target.querySelectorAll("[data-route]"); } catch (_) { return; }
    nodes.forEach((el) => {
      const key = availabilityKey(el.getAttribute("data-route"));
      const disabled = !key || flags[key] !== true;
      if (disabled) markHidden(el); else restoreShown(el);
    });
  }

  // A single, debounced MutationObserver reapplies the filter to asynchronously
  // rendered CTAs. It watches childList/subtree only (never attributes), so this
  // module's own attribute writes cannot retrigger it → no loop, one observer.
  function startObserver() {
    if (observer || typeof MutationObserver !== "function") return;
    const appEl = document.getElementById("app");
    if (!appEl) return;
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      const run = () => { scheduled = false; applyToDom(document); };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 16);
    });
    observer.observe(appEl, { childList: true, subtree: true });
  }

  // ---- maintenance screen ---------------------------------------------------
  function maintenanceHtml(route) {
    const esc = root.utils.escapeHtml;
    const key = availabilityKey(route);
    const label = PAGE_LABELS[key] || PAGE_LABELS[String(route || "")] || "หน้านี้";
    const backRoute = firstEnabledRoute();
    const backLabel = PAGE_LABELS[backRoute] || "หน้าที่ใช้งานได้";
    return `
      <section class="screen maintenance-screen" role="status" aria-live="polite">
        <div class="maintenance-card">
          <div class="maintenance-emoji" aria-hidden="true">🛠️</div>
          <h2>หน้านี้กำลังปรับปรุง</h2>
          <p class="maintenance-page">หน้า: <strong>${esc(label)}</strong></p>
          <p class="muted">ระบบกำลังเตรียมฟีเจอร์นี้ กรุณาใช้เมนูอื่นหรือติดต่อแอดมิน</p>
          <div class="maintenance-actions">
            <button class="primary-btn" type="button" data-route="${esc(backRoute)}" data-maintenance-back>กลับไปหน้าที่ใช้งานได้ (${esc(backLabel)})</button>
            <a class="secondary-btn" href="${LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>
            <a class="secondary-btn" href="tel:${PHONE_TEL}">โทร ${PHONE_DISPLAY}</a>
          </div>
        </div>
      </section>
    `;
  }

  function renderMaintenance(container, route) {
    if (!container) return;
    container.innerHTML = maintenanceHtml(route);
    // The back button carries data-route, so the normal router click handler
    // navigates through the central guard — no direct handler call, no loop.
    // Ensure our own maintenance markup is filtered too (defensive).
    applyToDom(container);
  }

  root.pageAvailability = {
    PAGE_KEYS,
    DEFAULT_ALL_ENABLED,
    DEGRADED,
    load,
    isReady,
    isEnabled,
    availabilityKey,
    firstEnabledRoute,
    getFlags,
    applyToDom,
    startObserver,
    renderMaintenance,
    maintenanceHtml,
    // Exposed for tests: pure validators (no DOM/network).
    _isValidFlags: isValidFlags,
    _readCache: readCache,
    _writeCache: writeCache,
  };
})();
