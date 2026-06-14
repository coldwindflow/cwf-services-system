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

  root.utils = {
    escapeHtml,
    routeTo,
    stepCards,
    timeline,
  };
})();
