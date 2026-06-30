(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function routeTo(route) {
    window.location.hash = `#${route || "home"}`;
  }

  // Cryptographically random key for client-side idempotency (e.g. urgent
  // booking request dedup). Falls back gracefully if crypto APIs are absent.
  function randomKey() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID().replace(/-/g, "");
      }
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (_) { /* fall through to non-crypto fallback */ }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  }

  function formatBaht(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return `${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return escapeHtml(value);
    return dt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  }

  function stepCards(items) {
    return `<div class="step-list">${items.map((item, index) => `
      <section class="step-card">
        <div class="step-number">${index + 1}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.copy)}</span>
        </div>
      </section>
    `).join("")}</div>`;
  }

  function timeline(items) {
    return `<div class="timeline-list">${items.map((item) => `
      <div class="timeline-item">
        <div class="dot ${item.kind ? `is-${escapeHtml(item.kind)}` : ""}"></div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.copy)}</p>
        </div>
      </div>
    `).join("")}</div>`;
  }

  function stateBox(status, message) {
    const cls = status ? ` is-${escapeHtml(status)}` : "";
    return `<div class="state-box${cls}">${escapeHtml(message)}</div>`;
  }

  function normalizeList(data, key) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[key])) return data[key];
    return [];
  }

  // Inline SVG icon set (stroke-based, inherits currentColor).
  // Presentation helper only — no behavior/logic.
  const ICON_PATHS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>',
    pin: '<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M4 5c0-1 1-2 2-2h2l2 5-2 1.5a11 11 0 0 0 5 5L17 12l5 2v2c0 1-1 2-2 2A16 16 0 0 1 4 5z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkle: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
    wrench: '<path d="M21 4a5 5 0 0 1-6.5 6.5L6 19l-3-3 8.5-8.5A5 5 0 0 1 18 1l-3 3 2 2 3-3z"/>',
    play: '<path d="M8 5l11 7-11 7V5z" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M14 22v-8h3l1-4h-4V8c0-1.1.6-2 2-2h2V2h-3c-3 0-5 2-5 5v3H7v4h3v8h4z" fill="currentColor" stroke="none"/>',
    line: '<path d="M12 2C6.48 2 2 5.69 2 10.24c0 4.08 3.55 7.5 8.35 8.15.32.07.77.21.88.49.1.25.07.65.03.91l-.14.86c-.04.25-.2 1 .87.55.6-.27.74-.34.74-.34l.16-.09c3.41-1.46 5.31-2.91 6.93-4.78C21.05 13.7 22 11.96 22 10.24 22 5.69 17.52 2 12 2z" fill="currentColor" stroke="none"/><circle cx="8.2" cy="10.2" r="1" fill="#fff" stroke="none"/><circle cx="12" cy="10.2" r="1" fill="#fff" stroke="none"/><circle cx="15.8" cy="10.2" r="1" fill="#fff" stroke="none"/>',
  };

  function icon(name, size) {
    const body = ICON_PATHS[name] || ICON_PATHS.sparkle;
    const s = size || 24;
    return `<span class="cwf-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
  }

  // Circular progress ring (visual only) for the urgent waiting room.
  function progressRing(captionHtml) {
    const r = 65;
    const c = Math.round(2 * Math.PI * r);
    return `
      <div class="progress-ring-wrap">
        <div class="progress-ring">
          <svg viewBox="0 0 150 150" width="150" height="150">
            <circle class="ring-track" cx="75" cy="75" r="${r}" fill="none" stroke-width="9"/>
            <circle class="ring-bar" cx="75" cy="75" r="${r}" fill="none" stroke-width="9"
              stroke-dasharray="${c}" stroke-dashoffset="${Math.round(c * 0.18)}"/>
          </svg>
          <div class="progress-ring-core"><span class="bolt">⚡</span></div>
        </div>
        <p class="ring-caption">${captionHtml || ""}</p>
      </div>
    `;
  }

  root.utils = {
    escapeHtml,
    routeTo,
    randomKey,
    formatBaht,
    formatDateTime,
    stepCards,
    timeline,
    stateBox,
    normalizeList,
    icon,
    progressRing,
  };
})();
