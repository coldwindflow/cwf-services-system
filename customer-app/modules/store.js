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

  function effectiveSalePrice(item) {
    const display = Number(item.display_price);
    if (Number.isFinite(display) && display > 0) return display;
    const base = Number(item.base_price);
    if (Number.isFinite(base) && base > 0) return base;
    return null;
  }

  function priceIsAsk(item) {
    return effectiveSalePrice(item) === null;
  }

  function priceLabel(item) {
    const sale = effectiveSalePrice(item);
    if (sale === null) return "สอบถามราคา";
    return root.utils.formatBaht(sale);
  }

  function hasPromo(item) {
    if (!item.has_active_promotion) return false;
    const normal = Number(item.normal_price);
    const sale = Number(item.active_price);
    return Number.isFinite(normal) && Number.isFinite(sale) && sale < normal;
  }

  function promoBadgeText(item) {
    return item.campaign_name || item.price_label || "โปรโมชัน";
  }

  function isBookable(item) {
    return item.booking_mode === "bookable";
  }

  function btuRangeLabel(item) {
    const min = Number(item.btu_min);
    const max = Number(item.btu_max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasMin && hasMax && min !== max) return `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} BTU`;
    if (hasMin && hasMax) return `${min.toLocaleString("th-TH")} BTU`;
    if (hasMin) return `ตั้งแต่ ${min.toLocaleString("th-TH")} BTU`;
    if (hasMax) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
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

  function itemGalleryImages(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images;
    if (item.image_url) return [{ image_id: null, image_url: item.image_url, alt_text: null }];
    return [];
  }

  function renderGallerySlides(images, name, slideClass) {
    const altText = root.utils.escapeHtml(name);
    return images.map((img) => `
      <img class="${slideClass}" src="${root.utils.escapeHtml(img.image_url)}" alt="${root.utils.escapeHtml(img.alt_text || name)}" loading="lazy" onerror="this.style.visibility='hidden';">
    `).join("");
  }

  function renderCardGallery(item, name) {
    const images = itemGalleryImages(item);
    if (!images.length) {
      return `<div class="store-card-gallery"><div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div></div>`;
    }
    const dots = images.length > 1
      ? `<div class="store-card-dots" data-store-dots>${images.map((_, i) => `<span class="store-card-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-card-gallery">
        <div class="store-card-slides" data-store-slides>${renderGallerySlides(images, name, "store-card-slide")}</div>
        ${dots}
      </div>
    `;
  }

  function renderBadges(item) {
    const badges = [];
    if (hasPromo(item)) badges.push(`<span class="store-badge store-badge-promo">${root.utils.escapeHtml(promoBadgeText(item))}</span>`);
    if (item.is_featured) badges.push(`<span class="store-badge store-badge-featured">แนะนำ</span>`);
    if (isBookable(item)) badges.push(`<span class="store-badge store-badge-bookable">จองได้ทันที</span>`);
    else badges.push(`<span class="store-badge store-badge-contact">ติดต่อแอดมิน</span>`);
    return badges.length ? `<div class="store-card-badges">${badges.join("")}</div>` : "";
  }

  function renderCard(item) {
    const id = String(item.item_id || "");
    const name = item.item_name || "-";
    const category = item.item_category || "";
    const unit = item.unit_label || "";
    const btu = btuRangeLabel(item);
    const meta = [item.job_category, item.ac_type, btu].filter(Boolean);
    const promo = hasPromo(item);
    const bookable = isBookable(item);
    return `
      <article class="store-card" data-store-item="${root.utils.escapeHtml(id)}" tabindex="0" role="button" aria-label="ดูรายละเอียด ${root.utils.escapeHtml(name)}">
        ${renderCardGallery(item, name)}
        ${renderBadges(item)}
        <div class="store-card-head">
          ${category ? `<span class="tag">${root.utils.escapeHtml(category)}</span>` : ""}
          <strong>${root.utils.escapeHtml(name)}</strong>
        </div>
        ${meta.length ? `<div class="store-card-meta">${meta.map((m) => `<span>${root.utils.escapeHtml(m)}</span>`).join("")}</div>` : ""}
        <div class="store-card-price">
          <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
          ${promo ? `<span class="price-strike">${root.utils.escapeHtml(root.utils.formatBaht(item.normal_price))}</span>` : ""}
          ${unit && !priceIsAsk(item) ? `<span class="muted">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
        </div>
        <div class="store-card-actions">
          ${bookable
            ? `<button class="primary-btn" type="button" data-store-book="${root.utils.escapeHtml(id)}">จองบริการนี้</button>`
            : `<button class="secondary-btn" type="button" data-store-contact="${root.utils.escapeHtml(id)}" data-store-contact-name="${root.utils.escapeHtml(name)}">สอบถามรายการนี้</button>`}
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

  function bindGallerySliders(scope) {
    scope.querySelectorAll("[data-store-slides]").forEach((slides) => {
      const gallery = slides.closest(".store-card-gallery");
      const dots = gallery ? gallery.querySelectorAll(".store-card-dot") : [];
      if (!dots.length) return;
      slides.addEventListener("scroll", () => {
        const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
        dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
      }, { passive: true });
    });
  }

  function goToDetail(itemId) {
    root.state.setStoreScrollY(window.scrollY || window.pageYOffset || 0);
    root.utils.routeTo(`storeItem-${itemId}`);
  }

  function bindGridActions(container) {
    container.querySelectorAll("[data-store-item]").forEach((card) => {
      const id = card.getAttribute("data-store-item");
      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-store-book], [data-store-contact]")) return;
        goToDetail(id);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("[data-store-book], [data-store-contact]")) return;
        event.preventDefault();
        goToDetail(id);
      });
    });
    container.querySelectorAll("[data-store-book]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-book");
        const item = (root.state.catalog.items || []).find((it) => String(it.item_id) === String(id));
        const draftItem = root.services.catalogItemToCommerceDraft(item);
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) return;
        root.utils.routeTo("scheduled");
      });
    });
    container.querySelectorAll("[data-store-contact]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const name = button.getAttribute("data-store-contact-name") || "รายการนี้";
        root.ui.openContactSheet(container, { title: name });
      });
    });
    bindGallerySliders(container);
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
    restoreScrollIfNeeded();
  }

  function restoreScrollIfNeeded() {
    const y = root.state.storeScrollY || 0;
    if (y <= 0) return;
    requestAnimationFrame(() => window.scrollTo(0, y));
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
    if (root.state.catalog.status !== "idle") {
      restoreScrollIfNeeded();
      return;
    }
    loadCatalog(container);
  }

  // ---------- Product Detail ----------

  function detailItemId() {
    return root.router && typeof root.router.routeParam === "function"
      ? root.router.routeParam(root.state.currentRoute)
      : "";
  }

  function renderDetailGallery(item, name) {
    const images = itemGalleryImages(item);
    if (!images.length) {
      return `<div class="store-detail-gallery"><div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div></div>`;
    }
    const dots = images.length > 1
      ? `<div class="store-detail-dots" data-store-detail-dots>${images.map((_, i) => `<span class="store-detail-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-detail-gallery">
        <div class="store-detail-slides" data-store-detail-slides>${renderGallerySlides(images, name, "store-detail-slide")}</div>
        ${dots}
      </div>
    `;
  }

  function renderDetailContent(item) {
    const name = item.item_name || "-";
    const category = item.item_category || "";
    const unit = item.unit_label || "";
    const promo = hasPromo(item);
    const bookable = isBookable(item);
    const highlights = Array.isArray(item.highlights) ? item.highlights : [];
    return `
      <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
      ${renderDetailGallery(item, name)}
      ${renderBadges(item)}
      <div class="store-detail-head">
        ${category ? `<span class="tag">${root.utils.escapeHtml(category)}</span>` : ""}
        <h2>${root.utils.escapeHtml(name)}</h2>
      </div>
      <div class="store-detail-price">
        <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
        ${promo ? `<span class="price-strike">${root.utils.escapeHtml(root.utils.formatBaht(item.normal_price))}</span>` : ""}
        ${unit && !priceIsAsk(item) ? `<span class="muted">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
      </div>
      ${item.short_description ? `<div class="store-detail-section"><p>${root.utils.escapeHtml(item.short_description)}</p></div>` : ""}
      ${highlights.length ? `
        <div class="store-detail-section">
          <h3>จุดเด่นของบริการ</h3>
          <ul class="store-detail-highlights">
            ${highlights.map((h) => `<li>${root.utils.icon("sparkle", 16)}<span>${root.utils.escapeHtml(h)}</span></li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${item.long_description ? `
        <div class="store-detail-section">
          <h3>รายละเอียดบริการ</h3>
          <p>${root.utils.escapeHtml(item.long_description)}</p>
        </div>
      ` : ""}
      ${item.service_conditions ? `
        <div class="store-detail-section">
          <h3>เงื่อนไขบริการ</h3>
          <p>${root.utils.escapeHtml(item.service_conditions)}</p>
        </div>
      ` : ""}
      <div class="store-detail-cta-bar">
        ${bookable
          ? `<button class="primary-btn" type="button" data-store-detail-book>จองบริการนี้</button>`
          : `<button class="primary-btn" type="button" data-store-detail-contact>สอบถามรายการนี้</button>`}
      </div>
    `;
  }

  function renderDetailBody() {
    const bucket = root.state.storeDetail || { status: "idle", data: null, error: "" };
    if (bucket.status === "idle" || bucket.status === "loading") {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        <div class="content-skeleton" aria-label="กำลังโหลดรายละเอียด"><span></span><span></span></div>
      `;
    }
    if (bucket.status === "error") {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        ${root.utils.stateBox("error", bucket.error || "ไม่พบรายการนี้")}
        <button class="secondary-btn" type="button" data-store-detail-retry>ลองใหม่</button>
      `;
    }
    if (!bucket.data) {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        ${root.utils.stateBox("", "ไม่พบรายการนี้")}
      `;
    }
    return renderDetailContent(bucket.data);
  }

  function bindDetailGallery(container) {
    const slides = container.querySelector("[data-store-detail-slides]");
    const dotsWrap = container.querySelector("[data-store-detail-dots]");
    if (!slides || !dotsWrap) return;
    const dots = dotsWrap.querySelectorAll(".store-detail-dot");
    slides.addEventListener("scroll", () => {
      const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    }, { passive: true });
  }

  function bindDetailBody(container) {
    container.querySelectorAll("[data-store-detail-back]").forEach((button) => {
      button.addEventListener("click", () => root.utils.routeTo("store"));
    });
    const retry = container.querySelector("[data-store-detail-retry]");
    if (retry) retry.addEventListener("click", () => loadDetail(container, detailItemId()));
    const bookButton = container.querySelector("[data-store-detail-book]");
    if (bookButton) {
      bookButton.addEventListener("click", () => {
        const item = root.state.storeDetail?.data;
        const draftItem = root.services.catalogItemToCommerceDraft(item);
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) return;
        root.utils.routeTo("scheduled");
      });
    }
    const contactButton = container.querySelector("[data-store-detail-contact]");
    if (contactButton) {
      contactButton.addEventListener("click", () => {
        const item = root.state.storeDetail?.data;
        root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
      });
    }
    bindDetailGallery(container);
  }

  function patchDetailBody(container) {
    const mount = container.querySelector("[data-store-detail-body]");
    if (!mount) return;
    mount.innerHTML = renderDetailBody();
    bindDetailBody(container);
  }

  async function loadDetail(container, itemId) {
    if (!itemId) {
      root.state.setStoreDetail({ status: "error", itemId: "", data: null, error: "ไม่พบรายการนี้" });
      patchDetailBody(container);
      return;
    }
    root.state.setStoreDetail({ status: "loading", itemId, data: null, error: "" });
    patchDetailBody(container);
    try {
      const data = await root.api.loadCatalogItem(itemId);
      root.state.setStoreDetail({ status: "success", itemId, data, error: "" });
    } catch (error) {
      const message = error?.status === 404 ? "ไม่พบรายการนี้" : (error?.message || "โหลดข้อมูลไม่สำเร็จ");
      root.state.setStoreDetail({ status: "error", itemId, data: null, error: message });
    }
    patchDetailBody(container);
  }

  const store = {
    render(container) {
      filterState = { search: "", category: "" };
      container.innerHTML = `
        <section class="screen store-screen">
          <div class="hero store-hero">
            <div class="hero-badge">ร้านค้า CWF</div>
            <h2>เลือกบริการและอุปกรณ์</h2>
            <p>รายการที่แสดงมาจากระบบจริงของ CWF ราคาบนการ์ดเป็นราคาฐานหรือราคาเริ่มต้น สำหรับบริการที่รองรับสามารถไปยังหน้าจองได้ ส่วนรายการอื่นกรุณาติดต่อแอดมินเพื่อยืนยันรายละเอียดและราคา</p>
          </div>
          <div data-store-body>${renderBody()}</div>
          <div data-contact-sheet-mount></div>
        </section>
      `;
      bindBody(container);
      ensureLoaded(container);
    },
    renderDetail(container) {
      const itemId = detailItemId();
      container.innerHTML = `
        <section class="screen store-detail-screen" data-store-detail-body>${renderDetailBody()}</section>
        <div data-contact-sheet-mount></div>
      `;
      bindDetailBody(container);
      const bucket = root.state.storeDetail;
      if (bucket.status === "idle" || String(bucket.itemId) !== String(itemId)) {
        loadDetail(container, itemId);
      }
    },
  };

  root.store = store;
})();
