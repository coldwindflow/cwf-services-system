(function attachAdminReviewServiceEditor(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CWFAdminReviewServiceEditor = api;
})(typeof window !== "undefined" ? window : globalThis, function buildModule() {
  "use strict";

  const JOB_TYPES = ["ล้าง", "ซ่อม", "ติดตั้ง"];
  const AC_TYPES = ["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"];
  const WASH_VARIANTS = ["ล้างธรรมดา", "ล้างพรีเมียม", "แขวนคอยล์", "ตัดล้างใหญ่"];
  const REPAIR_VARIANTS = ["ตรวจเช็ครั่ว", "ซ่อมเปลี่ยนอะไหล่"];

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function money(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function optionList(values, selected) {
    return values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function normalizeItem(item = {}) {
    return {
      job_item_id: item.job_item_id ? Number(item.job_item_id) : null,
      job_type: JOB_TYPES.includes(item.job_type) ? item.job_type : "ล้าง",
      ac_type: AC_TYPES.includes(item.ac_type) ? item.ac_type : "ผนัง",
      wash_variant: WASH_VARIANTS.includes(item.wash_variant) ? item.wash_variant : "ล้างธรรมดา",
      repair_variant: REPAIR_VARIANTS.includes(item.repair_variant) ? item.repair_variant : "ตรวจเช็ครั่ว",
      btu: Math.max(5000, Math.round(Number(item.btu || 9000))),
      machine_count: Math.max(1, Math.round(Number(item.machine_count || item.qty || 1))),
      unit_price: money(item.unit_price),
      is_package: item.is_package === true,
      package_label: String(item.package_label || ""),
      parse_error: item.parse_error === true,
    };
  }

  function lineTotal(item) {
    return money(item.unit_price) * Math.max(1, Number(item.machine_count || 1));
  }

  function summarize(items, pricing = {}) {
    const serviceSubtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
    const otherSubtotal = money(pricing.other_subtotal);
    const discount = money(pricing.discount);
    const subtotal = serviceSubtotal + otherSubtotal;
    return {
      rows: items.length,
      machines: items.reduce((sum, item) => sum + Math.max(1, Number(item.machine_count || 1)), 0),
      service_subtotal: serviceSubtotal,
      other_subtotal: otherSubtotal,
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
    };
  }

  function create(options = {}) {
    const container = options.container;
    const summary = options.summary;
    const addButton = options.addButton;
    if (!container || !summary || !addButton) throw new Error("service editor elements are required");

    const state = {
      items: [],
      revision: "",
      pricing: {},
      readOnly: false,
      dirty: false,
      durationMin: 0,
    };

    function markDirty() {
      state.dirty = true;
      // The backend recalculates duration from the structured rows on save.
      // Hide the previously persisted duration while values are being edited.
      state.durationMin = 0;
    }

    function renderSummary() {
      const totals = summarize(state.items, state.pricing);
      const discount = totals.discount > 0 ? `<span>ส่วนลด ${totals.discount.toLocaleString("th-TH")} บาท</span>` : "";
      const other = totals.other_subtotal > 0 ? `<span>รายการอื่น ${totals.other_subtotal.toLocaleString("th-TH")} บาท</span>` : "";
      summary.innerHTML = `
        <div class="service-summary-main"><b>${totals.machines}</b> เครื่อง <span>•</span> <b>${totals.total.toLocaleString("th-TH")}</b> บาท</div>
        <div class="service-summary-meta">${state.durationMin ? `<span>เวลางานประมาณ ${state.durationMin} นาที</span>` : ""}${other}${discount}</div>`;
    }

    function variantField(item, index) {
      if (item.job_type === "ล้าง" && item.ac_type === "ผนัง") {
        return `<label><span>วิธีล้าง</span><select data-index="${index}" data-field="wash_variant">${optionList(WASH_VARIANTS, item.wash_variant)}</select></label>`;
      }
      if (item.job_type === "ซ่อม") {
        return `<label><span>ประเภทงานซ่อม</span><select data-index="${index}" data-field="repair_variant">${optionList(REPAIR_VARIANTS, item.repair_variant)}</select></label>`;
      }
      return `<div class="service-field-note">${item.job_type === "ติดตั้ง" ? "งานติดตั้ง" : "แอร์ประเภทนี้ใช้มาตรฐานล้างเฉพาะประเภท"}</div>`;
    }

    function render() {
      container.innerHTML = state.items.map((item, index) => {
        const packageBadge = item.is_package
          ? `<div class="service-package-badge">🔒 ${escapeHtml(item.package_label || "แพ็กเกจเดิมของลูกค้า")}</div>`
          : "";
        const parseWarning = item.parse_error
          ? `<div class="service-parse-warning">ข้อมูลเดิมไม่ครบรูปแบบ กรุณาตรวจทุกช่องก่อนบันทึก</div>`
          : "";
        return `<article class="service-line-card" data-service-row="${index}">
          <div class="service-line-head">
            <b>รายการที่ ${index + 1}</b>
            <button type="button" class="service-remove" data-action="remove" data-index="${index}"${item.is_package || state.readOnly ? " disabled" : ""}>ลบ</button>
          </div>
          ${packageBadge}${parseWarning}
          <div class="service-fields-grid">
            <label><span>บริการ</span><select data-index="${index}" data-field="job_type">${optionList(JOB_TYPES, item.job_type)}</select></label>
            <label><span>ประเภทแอร์</span><select data-index="${index}" data-field="ac_type">${optionList(AC_TYPES, item.ac_type)}</select></label>
            ${variantField(item, index)}
            <label><span>ขนาด BTU</span><input type="number" inputmode="numeric" min="5000" max="100000" step="1000" value="${item.btu}" data-index="${index}" data-field="btu"></label>
            <label class="service-qty-label"><span>จำนวนเครื่อง</span><div class="service-stepper">
              <button type="button" data-action="step" data-step="-1" data-index="${index}">−</button>
              <input type="number" inputmode="numeric" min="1" max="99" step="1" value="${item.machine_count}" data-index="${index}" data-field="machine_count">
              <button type="button" data-action="step" data-step="1" data-index="${index}">+</button>
            </div></label>
            <label><span>ราคาต่อเครื่อง</span><input type="number" inputmode="decimal" min="0" step="1" value="${item.unit_price}" data-index="${index}" data-field="unit_price"></label>
          </div>
          <div class="service-line-total">รวมรายการนี้ <b data-line-total="${index}">${lineTotal(item).toLocaleString("th-TH")}</b> บาท</div>
        </article>`;
      }).join("") || `<div class="service-empty">ยังไม่มีรายการบริการ</div>`;
      container.querySelectorAll("input,select,button").forEach((element) => { element.disabled = state.readOnly || element.disabled; });
      addButton.disabled = state.readOnly;
      renderSummary();
    }

    function updateNumber(index, field, value) {
      const item = state.items[index];
      if (!item) return;
      if (field === "machine_count") item[field] = Math.min(99, Math.max(1, Math.round(Number(value || 1))));
      else if (field === "btu") item[field] = Math.min(100000, Math.max(5000, Math.round(Number(value || 5000))));
      else item[field] = money(value);
      markDirty();
      const total = container.querySelector(`[data-line-total="${index}"]`);
      if (total) total.textContent = lineTotal(item).toLocaleString("th-TH");
      renderSummary();
    }

    container.addEventListener("input", (event) => {
      const field = event.target?.dataset?.field;
      const index = Number(event.target?.dataset?.index);
      if (!["btu", "machine_count", "unit_price"].includes(field) || !Number.isInteger(index)) return;
      updateNumber(index, field, event.target.value);
    });

    container.addEventListener("change", (event) => {
      const field = event.target?.dataset?.field;
      const index = Number(event.target?.dataset?.index);
      const item = state.items[index];
      if (!item || !["job_type", "ac_type", "wash_variant", "repair_variant"].includes(field)) return;
      item[field] = event.target.value;
      markDirty();
      render();
    });

    container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || state.readOnly) return;
      const index = Number(button.dataset.index);
      if (button.dataset.action === "remove") {
        if (state.items[index]?.is_package) return;
        state.items.splice(index, 1);
        markDirty();
        render();
      }
      if (button.dataset.action === "step") {
        const item = state.items[index];
        if (!item) return;
        item.machine_count = Math.min(99, Math.max(1, item.machine_count + Number(button.dataset.step || 0)));
        markDirty();
        render();
      }
    });

    addButton.addEventListener("click", () => {
      if (state.readOnly || state.items.length >= 20) return;
      state.items.push(normalizeItem({}));
      markDirty();
      render();
    });

    return {
      setData(data = {}) {
        state.items = (Array.isArray(data.items) ? data.items : []).map(normalizeItem);
        state.revision = String(data.revision || "");
        state.pricing = data.pricing || {};
        state.durationMin = Number(data.job?.duration_min || 0);
        state.readOnly = data.editable === false;
        state.dirty = false;
        render();
      },
      setReadOnly(value) { state.readOnly = !!value; render(); },
      isDirty() { return state.dirty; },
      revision() { return state.revision; },
      items() {
        return state.items.map((item) => ({
          job_item_id: item.job_item_id,
          job_type: item.job_type,
          ac_type: item.ac_type,
          wash_variant: item.wash_variant,
          repair_variant: item.repair_variant,
          btu: Number(item.btu),
          machine_count: Number(item.machine_count),
          unit_price: money(item.unit_price),
        }));
      },
      totals() { return summarize(state.items, state.pricing); },
    };
  }

  return { create, normalizeItem, summarize, lineTotal, escapeHtml };
});
