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
        root.utils?.applyPublishedIconConfig?.(resp, true);
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
  // Design decision (locked-maintenance model): menus and CTAs are NEVER hidden
  // or disabled. The full app structure stays intact — the Bottom Navigation
  // keeps all its items (no reflow / no gaps) and every control remains
  // clickable. When a control points at a disabled route, the click is caught by
  // the central router guard, which renders a static "maintenance" screen
  // instead of running the route handler or its API.
  //
  // applyToDom is kept as an intentional no-op purely for API compatibility with
  // existing callers (router after-render, ui booking refresh, boot).
  function applyToDom(_scope) { /* no-op: controls are never hidden */ }

  // Kept for API compatibility with the boot sequence. Nothing is hidden, so
  // there is nothing to reapply on DOM mutation — the observer is not started.
  function startObserver() { /* no-op: nothing to re-hide */ }

  // ---- maintenance screen (static blurred skeleton + readable overlay) ------
  // A generic, STATIC skeleton (no real customer data, no route handler, no API)
  // sits blurred behind a readable "under maintenance" overlay, so a disabled
  // page keeps the shape/feel of a real screen without exposing anything live.
  function maintenanceHtml(route) {
    const esc = root.utils.escapeHtml;
    const key = availabilityKey(route);
    const label = PAGE_LABELS[key] || PAGE_LABELS[String(route || "")] || "หน้านี้";
    const backRoute = firstEnabledRoute();
    const backLabel = PAGE_LABELS[backRoute] || "หน้าที่ใช้งานได้";
    return `
      <section class="screen maintenance-screen" aria-label="หน้ากำลังปรับปรุง">
        <div class="maintenance-skeleton" aria-hidden="true">
          <div class="sk-block sk-hero"></div>
          <div class="sk-chips"><span class="sk-block sk-chip"></span><span class="sk-block sk-chip"></span><span class="sk-block sk-chip"></span></div>
          <div class="sk-block sk-card"></div>
          <div class="sk-block sk-card"></div>
          <div class="sk-block sk-card sk-card-short"></div>
        </div>
        <div class="maintenance-overlay" role="status" aria-live="polite">
          <div class="maintenance-card">
            <div class="maintenance-lock" aria-hidden="true">🔒</div>
            <h2>หน้านี้กำลังปรับปรุง</h2>
            <p class="maintenance-page">หน้า: <strong>${esc(label)}</strong></p>
            <p class="muted">ฟีเจอร์นี้ปิดปรับปรุงชั่วคราว เมนูอื่นยังใช้งานได้ตามปกติ</p>
            <div class="maintenance-actions">
              <button class="primary-btn" type="button" data-route="${esc(backRoute)}" data-maintenance-back>ไปหน้าที่ใช้งานได้ (${esc(backLabel)})</button>
              <a class="secondary-btn" href="${LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>
              <a class="secondary-btn" href="tel:${PHONE_TEL}">โทร ${PHONE_DISPLAY}</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderMaintenance(container, route) {
    if (!container) return;
    // Pure static markup — no route handler, no API, no live customer data. The
    // back button carries data-route so it routes through the central guard.
    container.innerHTML = maintenanceHtml(route);
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
