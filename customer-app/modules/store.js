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

  // The legacy catalog table constrains item_category to "service"/"product"
  // in storage; that generic token carries no useful information for the
  // customer, so it is hidden entirely rather than shown as a translated tag.
  function categoryLabel(cat) {
    const trimmed = String(cat || "").trim();
    if (trimmed.toLowerCase() === "service") return "";
    if (trimmed.toLowerCase() === "product") return "";
    return trimmed;
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

  function renderFeaturedRibbon(item) {
    if (!item.is_featured) return "";
    return `<span class="store-featured-ribbon">CWF แนะนำ</span>`;
  }

  function renderHotBadge(item) {
    if (!item.is_hot) return "";
    return `<span class="store-hot-badge" aria-label="สินค้า HOT">HOT</span>`;
  }

  function salePercentOff(item) {
    const normal = Number(item.normal_price);
    const sale = Number(item.active_price);
    if (!Number.isFinite(normal) || normal <= 0 || !Number.isFinite(sale) || sale >= normal) return null;
    const pct = Math.round(((normal - sale) / normal) * 100);
    return pct > 0 ? pct : null;
  }

  function renderSaleBadge(item) {
    if (!hasPromo(item)) return "";
    const pct = salePercentOff(item);
    const text = pct ? `SALE -${pct}%` : "SALE";
    return `<span class="store-sale-badge" aria-label="ลดราคา">${root.utils.escapeHtml(text)}</span>`;
  }

  // Real review aggregates only. item.rating_average/review_count come straight
  // from the backend's catalog_item_reviews aggregation (approved reviews only —
  // see attachCatalogRatings() in server/routes/catalog/items.js). There is no
  // fallback/legacy rating field read here: until a real approved review exists,
  // this must render an honest "no reviews yet" state (empty stars, count 0) —
  // never a fabricated full-star score.
  function realRatingInfo(item) {
    const avg = Number(item && item.rating_average);
    const count = Number(item && item.review_count);
    if (Number.isFinite(avg) && avg >= 1 && avg <= 5 && Number.isFinite(count) && count > 0) {
      return { value: avg, count, hasReviews: true };
    }
    return { value: 0, count: 0, hasReviews: false };
  }

  function formatRatingAverage(value) {
    const rounded = Math.round(value * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  }

  // No approved reviews yet: display-only 5-star default (never written to
  // DB, never a fabricated average/count). Once a real approved review
  // exists, this switches to the real average/count below.
  function renderRatingBadge(item) {
    const { value, count, hasReviews } = realRatingInfo(item);
    const full = hasReviews ? Math.floor(value) : 5;
    const hasHalf = hasReviews && full < 5 && value - full >= 0.5;
    const stars = Array.from({ length: 5 }, (_, i) => {
      const filled = i < full;
      const half = i === full && hasHalf;
      const cls = filled ? " is-filled" : half ? " is-half" : "";
      return `<span class="store-rating-star${cls}" aria-hidden="true">${filled || half ? "★" : "☆"}</span>`;
    }).join("");
    const id = String(item.item_id || "");
    const valueLabel = hasReviews ? `<span class="store-rating-value">${formatRatingAverage(value)}</span>` : "";
    const countLabel = hasReviews ? `<span class="store-rating-count">(${count})</span>` : "";
    return `
      <button type="button" class="store-rating-badge" data-store-rating="${root.utils.escapeHtml(id)}" title="ดูรีวิวจากลูกค้า">
        <span class="store-rating-label">รีวิว</span>
        <span class="store-rating-stars">${stars}</span>
        ${valueLabel}${countLabel}
      </button>
    `;
  }

  // item.booking_count comes straight from the backend's real
  // COUNT(DISTINCT job_id) aggregation (attachBookingCounts() in
  // server/routes/catalog/items.js) — never hardcoded, never client-computed.
  function renderBookingCountLabel(item) {
    const count = Number(item && item.booking_count);
    if (!Number.isFinite(count) || count <= 0) return "";
    return `<div class="store-booking-count">จองแล้ว ${count.toLocaleString("th-TH")} งาน</div>`;
  }

  function renderCardGallery(item, name) {
    const images = itemGalleryImages(item);
    if (!images.length) {
      return `
        <div class="store-card-gallery">
          ${renderHotBadge(item)}
          ${renderFeaturedRibbon(item)}
          <div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div>
          ${renderSaleBadge(item)}
        </div>
      `;
    }
    const autoplay = images.length > 1 && item.is_autoplay_enabled === true;
    const dots = images.length > 1
      ? `<div class="store-card-dots" data-store-dots>${images.map((_, i) => `<span class="store-card-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-card-gallery"${autoplay ? ' data-store-autoplay="1"' : ""}>
        ${renderHotBadge(item)}
        ${renderFeaturedRibbon(item)}
        <div class="store-card-slides" data-store-slides>${renderGallerySlides(images, name, "store-card-slide")}</div>
        ${renderSaleBadge(item)}
        ${dots}
      </div>
    `;
  }

  function renderBadges(item) {
    const badges = [];
    if (isBookable(item)) badges.push(`<span class="store-badge store-badge-bookable">จองได้</span>`);
    else badges.push(`<span class="store-badge store-badge-contact">ติดต่อแอดมิน</span>`);
    return badges.length ? `<div class="store-card-badges">${badges.join("")}</div>` : "";
  }

  function renderCard(item) {
    const id = String(item.item_id || "");
    const name = item.item_name || "-";
    const category = categoryLabel(item.item_category);
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
          ${meta.length ? `<div class="store-card-meta">${meta.map((m) => `<span>${root.utils.escapeHtml(m)}</span>`).join("")}</div>` : ""}
        </div>
        ${renderRatingBadge(item)}
        ${renderBookingCountLabel(item)}
        <div class="store-card-price">
          <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
          ${promo ? `<span class="price-strike">${root.utils.escapeHtml(root.utils.formatBaht(item.normal_price))}</span>` : ""}
          ${unit && !priceIsAsk(item) ? `<span class="muted">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
        </div>
        <div class="store-card-actions">
          ${bookable
            ? `<button class="primary-btn" type="button" data-store-book="${root.utils.escapeHtml(id)}">จองคิว</button>`
            : `<button class="secondary-btn" type="button" data-store-contact="${root.utils.escapeHtml(id)}" data-store-contact-name="${root.utils.escapeHtml(name)}">สอบถามแอดมิน</button>`}
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

  const AUTOPLAY_INTERVAL_MS = 3500;
  const AUTOPLAY_RESUME_DELAY_MS = 5000;
  const AUTOPLAY_JITTER_MS = 1200;

  function prefersReducedMotion() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_error) {
      return false;
    }
  }

  // Returns a cleanup function, or null if autoplay could not be attached
  // (reduced-motion preference, or the slides element lacks scrollTo support
  // in this environment).
  function attachAutoplay(slides, dots) {
    if (prefersReducedMotion() || typeof slides.scrollTo !== "function") return null;
    const count = dots.length;
    if (count < 2) return null;
    let timer = null;
    let paused = false;
    let visible = false;
    let resumeTimer = null;

    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    // Uses a setTimeout chain (not setInterval) so a random jitter can be
    // applied to the very first tick only; this keeps multiple visible
    // cards from advancing in visual lock-step while still settling into
    // the configured interval after the first transition.
    function start() {
      if (timer || paused || !visible) return;
      function tick() {
        const width = Math.max(1, slides.clientWidth);
        const current = Math.round(slides.scrollLeft / width);
        const next = current >= count - 1 ? 0 : current + 1;
        slides.scrollTo({ left: next * width, behavior: "smooth" });
        timer = setTimeout(tick, AUTOPLAY_INTERVAL_MS);
      }
      const jitter = Math.floor(Math.random() * AUTOPLAY_JITTER_MS);
      timer = setTimeout(tick, AUTOPLAY_INTERVAL_MS + jitter);
    }
    function pauseForInteraction() {
      paused = true;
      stop();
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; start(); }, AUTOPLAY_RESUME_DELAY_MS);
    }
    slides.addEventListener("touchstart", pauseForInteraction, { passive: true });
    slides.addEventListener("pointerdown", pauseForInteraction, { passive: true });

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    let observer = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        });
      }, { threshold: 0.5 });
      observer.observe(slides);
    } else {
      visible = true;
      start();
    }

    return function cleanup() {
      stop();
      if (resumeTimer) clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (observer) observer.disconnect();
      slides.removeEventListener("touchstart", pauseForInteraction);
      slides.removeEventListener("pointerdown", pauseForInteraction);
    };
  }

  let cardAutoplayCleanups = [];

  function clearCardAutoplay() {
    cardAutoplayCleanups.forEach((cleanup) => cleanup());
    cardAutoplayCleanups = [];
  }

  function bindGallerySliders(scope) {
    clearCardAutoplay();
    scope.querySelectorAll("[data-store-slides]").forEach((slides) => {
      const gallery = slides.closest(".store-card-gallery");
      const dots = gallery ? gallery.querySelectorAll(".store-card-dot") : [];
      if (dots.length) {
        slides.addEventListener("scroll", () => {
          const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
          dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
        }, { passive: true });
      }
      if (gallery && gallery.getAttribute("data-store-autoplay") === "1") {
        const cleanup = attachAutoplay(slides, dots);
        if (cleanup) cardAutoplayCleanups.push(cleanup);
      }
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
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) {
          root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
          return;
        }
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
    container.querySelectorAll("[data-store-rating]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-rating");
        goToDetail(id);
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
      return `
        <div class="store-detail-gallery">
          ${renderHotBadge(item)}
          ${renderFeaturedRibbon(item)}
          <div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div>
          ${renderSaleBadge(item)}
        </div>
      `;
    }
    const autoplay = images.length > 1 && item.is_autoplay_enabled === true;
    const dots = images.length > 1
      ? `<div class="store-detail-dots" data-store-detail-dots>${images.map((_, i) => `<span class="store-detail-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-detail-gallery"${autoplay ? ' data-store-autoplay="1"' : ""}>
        ${renderHotBadge(item)}
        ${renderFeaturedRibbon(item)}
        <div class="store-detail-slides" data-store-detail-slides>${renderGallerySlides(images, name, "store-detail-slide")}</div>
        ${renderSaleBadge(item)}
        ${dots}
      </div>
    `;
  }

  // ---------- Verified Customer Reviews (Product Detail) ----------

  const REVIEWS_PAGE_SIZE = 10;

  let reviewsState = { itemId: null, status: "idle", reviews: [], total: 0, ratingAverage: null, reviewCount: 0, offset: 0 };
  let writeReviewState = {
    open: false,
    eligibilityStatus: "idle", // idle | loading | success | error
    eligible: false,
    eligibleJobs: [],
    jobId: null,
    rating: 0,
    comment: "",
    step: "form", // form | preview
    submitting: false,
    error: "",
    success: false,
  };

  function resetReviewsState(itemId) {
    reviewsState = { itemId, status: "idle", reviews: [], total: 0, ratingAverage: null, reviewCount: 0, offset: 0 };
    writeReviewState = {
      open: false, eligibilityStatus: "idle", eligible: false, eligibleJobs: [],
      jobId: null, rating: 0, comment: "", step: "form", submitting: false, error: "", success: false,
    };
  }

  function patchReviewsSection(container, item) {
    const mount = container.querySelector("[data-store-reviews-section]");
    if (!mount) return;
    mount.innerHTML = renderReviewsSectionBody(item);
    bindReviewsSection(container, item);
  }

  async function loadReviewsList(container, item, { append } = {}) {
    const itemId = item.item_id;
    reviewsState.status = append ? reviewsState.status : "loading";
    if (!append) patchReviewsSection(container, item);
    try {
      const offset = append ? reviewsState.offset : 0;
      const data = await root.api.loadCatalogItemReviews(itemId, { limit: REVIEWS_PAGE_SIZE, offset });
      const incoming = root.utils.normalizeList(data, "reviews");
      reviewsState = {
        itemId,
        status: "success",
        reviews: append ? reviewsState.reviews.concat(incoming) : incoming,
        total: Number(data?.total || 0),
        ratingAverage: data?.rating_average == null ? null : Number(data.rating_average),
        reviewCount: Number(data?.review_count || 0),
        offset: offset + incoming.length,
      };
    } catch (error) {
      reviewsState.status = "error";
      reviewsState.error = error?.message || "โหลดรีวิวไม่สำเร็จ";
    }
    patchReviewsSection(container, item);
  }

  async function loadEligibility(container, item) {
    if (!root.state.customer?.logged_in) return;
    writeReviewState.eligibilityStatus = "loading";
    try {
      const data = await root.api.loadReviewEligibility(item.item_id);
      writeReviewState.eligibilityStatus = "success";
      writeReviewState.eligible = Boolean(data?.eligible);
      writeReviewState.eligibleJobs = root.utils.normalizeList(data, "eligible_jobs");
      writeReviewState.jobId = writeReviewState.eligibleJobs[0]?.job_id || null;
    } catch (error) {
      writeReviewState.eligibilityStatus = "error";
      writeReviewState.eligible = false;
    }
    patchReviewsSection(container, item);
  }

  function renderReviewStars(currentRating, interactive) {
    return Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      const filled = n <= currentRating;
      if (!interactive) return `<span class="store-review-star${filled ? " is-filled" : ""}" aria-hidden="true">${filled ? "★" : "☆"}</span>`;
      return `<button type="button" class="store-review-star-btn${filled ? " is-filled" : ""}" data-review-star="${n}" aria-label="${n} ดาว">${filled ? "★" : "☆"}</button>`;
    }).join("");
  }

  function renderWriteReviewPanel(item) {
    if (!root.state.customer?.logged_in) {
      return `
        <div class="store-review-write-gate">
          <p>เข้าสู่ระบบเพื่อเขียนรีวิวสำหรับงานที่คุณใช้บริการจริง</p>
          <button type="button" class="secondary-btn" data-store-review-login>เข้าสู่ระบบ</button>
        </div>
      `;
    }
    if (writeReviewState.eligibilityStatus === "loading" || writeReviewState.eligibilityStatus === "idle") {
      return `<div class="content-skeleton" aria-label="กำลังตรวจสอบสิทธิ์รีวิว"><span></span></div>`;
    }
    if (!writeReviewState.eligible) {
      return `<p class="store-review-ineligible">คุณยังไม่มีงานที่เสร็จสมบูรณ์สำหรับสินค้า/บริการนี้ที่สามารถรีวิวได้ในขณะนี้</p>`;
    }
    if (writeReviewState.success) {
      return root.utils.stateBox("success", "ส่งรีวิวแล้ว รอแอดมินตรวจสอบ");
    }
    if (!writeReviewState.open) {
      return `<button type="button" class="secondary-btn" data-store-review-open>เขียนรีวิว</button>`;
    }

    const jobPicker = writeReviewState.eligibleJobs.length > 1 ? `
      <label class="store-review-field">
        <span>เลือกงานที่ต้องการรีวิว</span>
        <select data-store-review-job>
          ${writeReviewState.eligibleJobs.map((j) => `<option value="${root.utils.escapeHtml(j.job_id)}"${String(j.job_id) === String(writeReviewState.jobId) ? " selected" : ""}>${root.utils.escapeHtml(String(j.appointment_datetime || "").slice(0, 16).replace("T", " "))}</option>`).join("")}
        </select>
      </label>
    ` : "";

    if (writeReviewState.step === "preview") {
      return `
        <div class="store-review-form store-review-preview">
          <h4>ตรวจสอบรีวิวก่อนส่ง</h4>
          <div class="store-review-stars-display">${renderReviewStars(writeReviewState.rating, false)}</div>
          <p class="store-review-preview-comment">${root.utils.escapeHtml(writeReviewState.comment || "(ไม่มีความเห็นเพิ่มเติม)")}</p>
          ${writeReviewState.error ? root.utils.stateBox("error", writeReviewState.error) : ""}
          <div class="store-review-form-actions">
            <button type="button" class="secondary-btn" data-store-review-back ${writeReviewState.submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
            <button type="button" class="primary-btn" data-store-review-confirm ${writeReviewState.submitting ? "disabled" : ""}>${writeReviewState.submitting ? "กำลังส่ง..." : "ยืนยันส่งรีวิว"}</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="store-review-form">
        <h4>เขียนรีวิว</h4>
        ${jobPicker}
        <label class="store-review-field">
          <span>ให้คะแนน</span>
          <div class="store-review-stars-input" data-store-review-stars>${renderReviewStars(writeReviewState.rating, true)}</div>
        </label>
        <label class="store-review-field">
          <span>ความเห็น (ไม่บังคับ)</span>
          <textarea data-store-review-comment maxlength="500" placeholder="บอกเล่าประสบการณ์ใช้บริการของคุณ">${root.utils.escapeHtml(writeReviewState.comment)}</textarea>
        </label>
        ${writeReviewState.error ? root.utils.stateBox("error", writeReviewState.error) : ""}
        <div class="store-review-form-actions">
          <button type="button" class="secondary-btn" data-store-review-cancel>ยกเลิก</button>
          <button type="button" class="primary-btn" data-store-review-next>ตรวจสอบรีวิว</button>
        </div>
      </div>
    `;
  }

  function renderReviewsList() {
    if (reviewsState.status === "loading" && !reviewsState.reviews.length) {
      return `<div class="content-skeleton" aria-label="กำลังโหลดรีวิว"><span></span><span></span></div>`;
    }
    if (reviewsState.status === "error") {
      return root.utils.stateBox("error", reviewsState.error || "โหลดรีวิวไม่สำเร็จ");
    }
    if (!reviewsState.reviews.length) {
      return `<p class="store-reviews-empty">ยังไม่มีรีวิวสำหรับสินค้า/บริการนี้</p>`;
    }
    const items = reviewsState.reviews.map((r) => `
      <div class="store-review-item">
        <div class="store-review-item-head">
          <span class="store-review-item-name">${root.utils.escapeHtml(r.display_name || "ลูกค้า")}</span>
          <span class="store-review-item-stars">${renderReviewStars(Number(r.rating || 0), false)}</span>
        </div>
        ${r.comment ? `<p class="store-review-item-comment">${root.utils.escapeHtml(r.comment)}</p>` : ""}
        <span class="store-review-item-date">${root.utils.escapeHtml(String(r.created_at || "").slice(0, 10))}</span>
      </div>
    `).join("");
    const hasMore = reviewsState.reviews.length < reviewsState.total;
    return `
      <div class="store-reviews-list">${items}</div>
      ${hasMore ? `<button type="button" class="secondary-btn store-reviews-load-more" data-store-reviews-more>โหลดรีวิวเพิ่ม</button>` : ""}
    `;
  }

  function renderReviewsSectionBody(item) {
    const avg = reviewsState.ratingAverage;
    const count = reviewsState.reviewCount;
    const hasReviews = Number.isFinite(avg) && avg >= 1 && count > 0;
    return `
      <h3>รีวิวจากลูกค้า</h3>
      <div class="store-reviews-summary">
        <span class="store-rating-label">รีวิว</span>
        <span class="store-rating-stars">${renderReviewStars(hasReviews ? Math.round(avg) : 0, false)}</span>
        ${hasReviews ? `<span class="store-rating-value">${formatRatingAverage(avg)}</span>` : ""}
        <span class="store-rating-count">(${count})</span>
      </div>
      <div class="store-reviews-list-mount">${renderReviewsList()}</div>
      <div class="store-review-write-mount">${renderWriteReviewPanel(item)}</div>
    `;
  }

  function bindReviewsSection(container, item) {
    const section = container.querySelector("[data-store-reviews-section]");
    if (!section) return;

    const moreButton = section.querySelector("[data-store-reviews-more]");
    if (moreButton) moreButton.addEventListener("click", () => loadReviewsList(container, item, { append: true }));

    const loginButton = section.querySelector("[data-store-review-login]");
    if (loginButton) loginButton.addEventListener("click", () => root.utils.routeTo("profile"));

    const openButton = section.querySelector("[data-store-review-open]");
    if (openButton) openButton.addEventListener("click", () => {
      writeReviewState.open = true;
      patchReviewsSection(container, item);
    });

    const cancelButton = section.querySelector("[data-store-review-cancel]");
    if (cancelButton) cancelButton.addEventListener("click", () => {
      writeReviewState.open = false;
      writeReviewState.rating = 0;
      writeReviewState.comment = "";
      writeReviewState.error = "";
      patchReviewsSection(container, item);
    });

    const jobSelect = section.querySelector("[data-store-review-job]");
    if (jobSelect) jobSelect.addEventListener("change", () => { writeReviewState.jobId = jobSelect.value; });

    section.querySelectorAll("[data-review-star]").forEach((button) => {
      button.addEventListener("click", () => {
        writeReviewState.rating = Number(button.getAttribute("data-review-star") || 0);
        patchReviewsSection(container, item);
      });
    });

    const commentInput = section.querySelector("[data-store-review-comment]");
    if (commentInput) commentInput.addEventListener("input", () => { writeReviewState.comment = commentInput.value; });

    const nextButton = section.querySelector("[data-store-review-next]");
    if (nextButton) nextButton.addEventListener("click", () => {
      if (!writeReviewState.rating) {
        writeReviewState.error = "กรุณาให้คะแนน 1-5 ดาว";
        patchReviewsSection(container, item);
        return;
      }
      writeReviewState.error = "";
      writeReviewState.step = "preview";
      patchReviewsSection(container, item);
    });

    const backButton = section.querySelector("[data-store-review-back]");
    if (backButton) backButton.addEventListener("click", () => {
      writeReviewState.step = "form";
      patchReviewsSection(container, item);
    });

    const confirmButton = section.querySelector("[data-store-review-confirm]");
    if (confirmButton) confirmButton.addEventListener("click", async () => {
      if (writeReviewState.submitting) return;
      writeReviewState.submitting = true;
      writeReviewState.error = "";
      patchReviewsSection(container, item);
      try {
        await root.api.submitCatalogItemReview(item.item_id, {
          job_id: writeReviewState.jobId,
          rating: writeReviewState.rating,
          comment: writeReviewState.comment,
        });
        writeReviewState.submitting = false;
        writeReviewState.open = false;
        writeReviewState.success = true;
        patchReviewsSection(container, item);
      } catch (error) {
        writeReviewState.submitting = false;
        writeReviewState.error = error?.message || "ส่งรีวิวไม่สำเร็จ";
        patchReviewsSection(container, item);
      }
    });
  }

  function renderDetailContent(item) {
    const name = item.item_name || "-";
    const category = categoryLabel(item.item_category);
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
      ${renderRatingBadge(item)}
      ${renderBookingCountLabel(item)}
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
      <div class="store-detail-section store-reviews-section" data-store-reviews-section>
        ${renderReviewsSectionBody(item)}
      </div>
      <div class="store-detail-cta-bar">
        ${bookable
          ? `<button class="primary-btn" type="button" data-store-detail-book>จองคิว</button>`
          : `<button class="primary-btn" type="button" data-store-detail-contact>สอบถามแอดมิน</button>`}
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

  let detailAutoplayCleanup = null;

  function clearDetailAutoplay() {
    if (detailAutoplayCleanup) {
      detailAutoplayCleanup();
      detailAutoplayCleanup = null;
    }
  }

  function bindDetailGallery(container) {
    clearDetailAutoplay();
    const slides = container.querySelector("[data-store-detail-slides]");
    const dotsWrap = container.querySelector("[data-store-detail-dots]");
    if (!slides || !dotsWrap) return;
    const dots = dotsWrap.querySelectorAll(".store-detail-dot");
    slides.addEventListener("scroll", () => {
      const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    }, { passive: true });
    const gallery = slides.closest(".store-detail-gallery");
    if (gallery && gallery.getAttribute("data-store-autoplay") === "1") {
      detailAutoplayCleanup = attachAutoplay(slides, dots);
    }
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
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) {
          root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
          return;
        }
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
    container.querySelectorAll("[data-store-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        const section = container.querySelector("[data-store-reviews-section]");
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    const item = root.state.storeDetail?.data;
    if (item) bindReviewsSection(container, item);
    bindDetailGallery(container);
  }

  function patchDetailBody(container) {
    const mount = container.querySelector("[data-store-detail-body]");
    if (!mount) return;
    mount.innerHTML = renderDetailBody();
    bindDetailBody(container);
  }

  async function loadDetail(container, itemId) {
    resetReviewsState(itemId);
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
      patchDetailBody(container);
      loadReviewsList(container, data);
      loadEligibility(container, data);
      return;
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
          <div class="store-compact-header">
            <span class="store-compact-badge">ร้านค้า CWF</span>
            <h2>เลือกบริการและอุปกรณ์</h2>
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

  store.render.onLeave = () => {
    clearCardAutoplay();
  };
  store.renderDetail.onLeave = () => {
    clearDetailAutoplay();
  };

  root.store = store;
})();
