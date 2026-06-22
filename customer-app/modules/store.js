(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  let filterState = { search: "", category: "" };

  function categoriesFromItems(items) {
    const set = new Set();
    items.forEach((item) => {
      const cat = String(item.item_category || "").trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }

  function priceIsAsk(item) {
    const price = Number(item.base_price);
    return !Number.isFinite(price) || price <= 0;
  }

  function priceLabel(item) {
    if (priceIsAsk(item)) return "สอบถามราคา";
    return `ราคาเริ่มต้น ${root.utils.formatBaht(item.base_price)}`;
  }

  function btuRangeLabel(item) {
    const min = Number(item.btu_min);
    const max = Number(item.btu_max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasMin && hasMax && min !== max) return `${min.toLocaleString("th-TH")}-${max.toLocaleString("th-TH")} BTU`;
    if (hasMin) return `${min.toLocaleString("th-TH")} BTU`;
    if (hasMax) return `${max.toLocaleString("th-TH")} BTU`;
    return "";
  }

  function applyFilters(items) {
    const search = filterState.search.trim().toLowerCase();
    const category = filterState.category;
    return (items || []).filter((item) => {
      if (category && String(item.item_category || "") !== category) return false;
      if (search && !String(item.item_name || "").toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderCard(item) {
    const id = String(item.item_id || "");
    const name = item.item_name || "-";
    const category = item.item_category || "";
    const unit = item.unit_label || "";
    const btu = btuRangeLabel(item);
    const meta = [item.job_category, item.ac_type, btu].filter(Boolean);
    return `
      <article class="store-card" data-store-item="${root.utils.escapeHtml(id)}">
        <div class="store-card-head">
          ${category ? `<span class="tag">${root.utils.escapeHtml(category)}</span>` : ""}
          <strong>${root.utils.escapeHtml(name)}</strong>
        </div>
        ${meta.length ? `<div class="store-card-meta">${meta.map((m) => `<span>${root.utils.escapeHtml(m)}</span>`).join("")}</div>` : ""}
        <div class="store-card-price">
          <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
          ${unit ? `<span class="muted">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
        </div>
        <div class="store-card-actions">
          <button class="primary-btn" type="button" data-store-book="${root.utils.escapeHtml(id)}">จองบริการ</button>
          <button class="secondary-btn" type="button" data-store-contact="${root.utils.escapeHtml(id)}" data-store-contact-name="${root.utils.escapeHtml(name)}">สอบถามรายการนี้</button>
        </div>
      </article>
    `;
  }

  function renderGrid(items) {
    const filtered = applyFilters(items);
    if (!filtered.length) return root.utils.stateBox("", "ไม่พบรายการที่ตรงกับการค้นหา");
    return `<div class="store-grid" data-store-grid>${filtered.map(renderCard).join("")}</div>`;
  }

  function renderBody() {
    const bucket = root.state.catalog || { status: "idle", items: [], error: "" };
    if (bucket.status === "idle" || bucket.status === "loading") {
      return `<div class="content-skeleton" aria-label="กำลังโหลดรายการ"><span></span><span></span></div>`;
    }
    if (bucket.status === "error") {
      return `
        ${root.utils.stateBox("error", bucket.error || "โหลดข้อมูลไม่สำเร็จ")}
        <button class="secondary-btn" type="button" data-store-retry>ลองใหม่</button>
      `;
    }
    const items = bucket.items || [];
    if (!items.length) {
      return root.utils.stateBox("", "ยังไม่มีรายการที่เปิดให้ลูกค้าดูในขณะนี้ กรุณาติดต่อแอดมินเพื่อสอบถามบริการ");
    }
    const categories = categoriesFromItems(items);
    return `
      <div class="store-filters">
        <input type="search" class="store-search-input" data-store-search placeholder="ค้นหาชื่อสินค้า/บริการ" aria-label="ค้นหาสินค้า" value="${root.utils.escapeHtml(filterState.search)}">
        <select class="store-category-select" data-store-category aria-label="หมวดหมู่">
          <option value="">ทั้งหมด</option>
          ${categories.map((cat) => `<option value="${root.utils.escapeHtml(cat)}"${filterState.category === cat ? " selected" : ""}>${root.utils.escapeHtml(cat)}</option>`).join("")}
        </select>
      </div>
      <div data-store-grid-mount>${renderGrid(items)}</div>
    `;
  }

  function bindGridActions(container) {
    container.querySelectorAll("[data-store-book]").forEach((button) => {
      button.addEventListener("click", () => root.utils.routeTo("booking"));
    });
    container.querySelectorAll("[data-store-contact]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.getAttribute("data-store-contact-name") || "รายการนี้";
        root.ui.openContactSheet(container, { title: name });
      });
    });
  }

  function patchGrid(container) {
    const mount = container.querySelector("[data-store-grid-mount]");
    if (!mount) return;
    mount.innerHTML = renderGrid(root.state.catalog.items || []);
    bindGridActions(container);
  }

  function bindBody(container) {
    const search = container.querySelector("[data-store-search]");
    if (search) {
      search.addEventListener("input", () => {
        filterState.search = search.value || "";
        patchGrid(container);
      });
    }
    const category = container.querySelector("[data-store-category]");
    if (category) {
      category.addEventListener("change", () => {
        filterState.category = category.value || "";
        patchGrid(container);
      });
    }
    const retry = container.querySelector("[data-store-retry]");
    if (retry) {
      retry.addEventListener("click", () => loadCatalog(container));
    }
    bindGridActions(container);
  }

  function patchBody(container) {
    const mount = container.querySelector("[data-store-body]");
    if (!mount) return;
    mount.innerHTML = renderBody();
    bindBody(container);
  }

  async function loadCatalog(container) {
    root.state.setCollection("catalog", { status: "loading", items: [], error: "" });
    patchBody(container);
    try {
      const data = await root.api.loadCatalogItems();
      const items = root.utils.normalizeList(data, "items");
      root.state.setCollection("catalog", { status: "success", items, error: "" });
    } catch (error) {
      root.state.setCollection("catalog", { status: "error", items: [], error: error?.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
    patchBody(container);
  }

  function ensureLoaded(container) {
    if (root.state.catalog.status !== "idle") return;
    loadCatalog(container);
  }

  const store = {
    render(container) {
      filterState = { search: "", category: "" };
      container.innerHTML = `
        <section class="screen store-screen">
          <div class="hero store-hero">
            <div class="hero-badge">ร้านค้า CWF</div>
            <h2>เลือกบริการและอุปกรณ์</h2>
            <p>รายการที่แสดงมาจากระบบจริงของ CWF ราคาที่เห็นเป็นราคาเริ่มต้น ระบบจะคำนวณราคาที่แน่นอนตอนจอง หรือติดต่อแอดมินเพื่อสอบถามรายการที่ยังไม่เปิดจองอัตโนมัติ</p>
          </div>
          <div data-store-body>${renderBody()}</div>
          <div data-contact-sheet-mount></div>
        </section>
      `;
      bindBody(container);
      ensureLoaded(container);
    },
  };

  root.store = store;
})();
