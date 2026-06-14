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

  root.utils = {
    escapeHtml,
    routeTo,
    formatBaht,
    formatDateTime,
    stepCards,
    timeline,
    stateBox,
    normalizeList,
  };
})();
