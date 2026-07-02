(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  let homeLoadPromise = null;

  function collectionState(name, emptyText, renderItems) {
    const bucket = root.state[name] || { status: "idle", items: [], error: "" };
    if (bucket.status === "loading" || bucket.status === "idle") {
      return `<div class="content-skeleton" aria-label="กำลังโหลดข้อมูล"><span></span><span></span></div>`;
    }
    if (bucket.status === "error") return root.utils.stateBox("error", bucket.error || "โหลดข้อมูลไม่สำเร็จ");
    if (!bucket.items || !bucket.items.length) return root.utils.stateBox("", emptyText);
    return renderItems(bucket.items);
  }

  function priceFromPreview(data) {
    if (!data) return null;
    if (data.promo && data.promo.total_after_discount != null) return data.promo.total_after_discount;
    return data.active_price || data.standard_price || null;
  }

  function renderQuickPrice(card) {
    if (!card.priceable) return `<span class="price-text is-estimate">ให้แอดมินประเมินราคา</span>`;
    const state = root.state.homePricing || { items: {} };
    const item = (state.items || {})[card.id];
    if (!item || item.status === "loading" || item.status === "idle") {
      return `<span class="price-text is-estimate">กำลังตรวจสอบราคา...</span>`;
    }
    if (item.status === "error" || !item.data) {
      return `<span class="price-text is-estimate">ให้แอดมินประเมินราคา</span>`;
    }
    const price = priceFromPreview(item.data);
    if (!price) return `<span class="price-text is-estimate">ให้แอดมินประเมินราคา</span>`;
    return `
      <span class="price-text">${root.utils.formatBaht(price)}</span>
      ${item.data.promo ? `<span class="promo-chip">มีโปรที่ใช้ได้</span>` : ""}
    `;
  }

  function renderPromotionSummary() {
    return collectionState("promotions", "ยังไม่มีโปรโมชันที่เปิดใช้ในขณะนี้", (items) => `
      <div class="commerce-list">
        ${items.slice(0, 3).map((promo) => `
          <div class="commerce-list-row">
            <strong>${root.utils.escapeHtml(promo.promo_name || "-")}</strong>
            <span>ระบบจะตรวจเงื่อนไขและใช้โปรที่เหมาะสมตอนประเมินราคา</span>
          </div>
        `).join("")}
      </div>
    `);
  }

  function renderCoverageSummary() {
    return collectionState("zones", "กรอกที่อยู่ในหน้าจองเพื่อให้ระบบตรวจสอบพื้นที่", (items) => `
      <div class="tag-row commerce-tags">
        ${items.slice(0, 10).map((zone) => `<span class="tag">${root.utils.escapeHtml(zone.zone_label || zone.zone_name || zone.zone_code || "-")}</span>`).join("")}
      </div>
    `);
  }

  const DEFAULT_HOME_CONFIG = {
    sections: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        sort_order: 10,
        kicker: "Coldwindflow",
        title: "ดูแลแอร์ง่าย จองงานได้ในไม่กี่ขั้นตอน",
        body: "จองล้างแอร์ ติดตามงาน และรับประกาศสำคัญจาก CWF ได้ในหน้าเดียว",
        cta_primary: { label: "จองล้างแอร์", route: "scheduled" },
        cta_secondary: { label: "ติดตามงาน", route: "tracking" },
        focal_position: "center",
        items: [],
      },
      {
        id: "quick",
        type: "quick",
        enabled: true,
        sort_order: 20,
        title: "เมนูด่วน",
        items: [
          { title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" },
          { title: "แจ้งซ่อม", action: "contact", icon: "wrench" },
          { title: "ติดตามงาน", route: "tracking", icon: "pin" },
          { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "chat" },
        ],
      },
      {
        id: "promo_banner",
        type: "promo_banner",
        enabled: true,
        sort_order: 25,
        title: "",
        body: "",
        items: [],
      },
      {
        id: "active_job",
        type: "active_job",
        enabled: true,
        sort_order: 30,
        title: "งานของฉัน",
        body: "",
        items: [],
      },
      {
        id: "announcements",
        type: "announcements",
        enabled: true,
        sort_order: 40,
        title: "ข่าวและประกาศ CWF",
        body: "",
        items: [{ title: "ติดต่อทีม CWF", action: "contact", body: "สอบถามบริการหรือแจ้งข้อมูลเพิ่มเติมกับแอดมิน" }],
      },
      {
        id: "featured_services",
        type: "featured_services",
        enabled: true,
        sort_order: 50,
        title: "บริการแนะนำ",
        body: "ราคาและรายละเอียดดึงจาก Catalog",
        featured_mode: "auto",
        featured_limit: 4,
        show_price: true,
        show_badge: true,
        item_ids: [],
        items: [],
      },
      {
        id: "updates",
        type: "updates",
        enabled: true,
        sort_order: 60,
        title: "ภาพกิจกรรมและโพสต์",
        body: "",
        items: [],
      },
      {
        id: "articles",
        type: "articles",
        enabled: true,
        sort_order: 70,
        title: "บทความแนะนำ",
        body: "",
        items: [],
      },
      {
        id: "social",
        type: "social",
        enabled: true,
        sort_order: 75,
        title: "ติดตามเราบนโซเชียล",
        body: "อัปเดตล่าสุดจาก Facebook และ YouTube ของ Coldwindflow",
        items: [],
      },
      {
        id: "trust",
        type: "trust",
        enabled: true,
        sort_order: 80,
        title: "มาตรฐานที่ลูกค้าวางใจ",
        items: [
          { title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" },
          { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" },
          { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" },
          { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" },
        ],
      },
    ],
  };

  function homepageConfig() {
    return root.state.homepage?.config || DEFAULT_HOME_CONFIG;
  }

  function homepageSections() {
    return (homepageConfig().sections || [])
      .filter((section) => section && section.enabled !== false)
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function sectionByType(type) {
    return homepageSections().find((section) => section.type === type || section.id === type) || null;
  }

  function renderHomepageCta(cta, className) {
    if (!cta || !cta.label) return "";
    const label = root.utils.escapeHtml(cta.label);
    if (cta.url) {
      return `<a class="${className}" href="${root.utils.escapeHtml(cta.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (cta.action === "contact") {
      return `<button class="${className}" type="button" data-home-contact="${label}">${label}</button>`;
    }
    return `<button class="${className}" type="button" data-route="${root.utils.escapeHtml(cta.route || "home")}">${label}</button>`;
  }

  function homepageImage(item, className, fallbackIcon = "sparkle") {
    const imageUrl = String(item?.image_url || "").trim();
    if (imageUrl) {
      return `<div class="${className}"><img src="${root.utils.escapeHtml(imageUrl)}" alt="${root.utils.escapeHtml(item.title || "")}" loading="lazy"></div>`;
    }
    return `<div class="${className}" aria-hidden="true">${root.utils.icon(fallbackIcon, 28)}</div>`;
  }

  function firstCatalogImage(item) {
    const images = Array.isArray(item?.images) ? item.images : [];
    const primary = images.find((image) => image && image.is_primary) || images[0];
    return primary?.image_url || item?.image_url || "";
  }

  function catalogDisplayPrice(item) {
    const value = item?.display_price ?? item?.active_price ?? item?.base_price;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? root.utils.formatBaht(n) : "สอบถามราคา";
  }

  function strictCatalogCommerceDraft(item) {
    if (!item || item.booking_mode !== "bookable") return null;
    if (!item.booking_ac_type || !Number(item.booking_btu)) return null;
    if (item.booking_ac_type === root.services.WALL_AC && !item.booking_wash_variant) return null;
    return root.services.catalogItemToCommerceDraft(item);
  }

  function featuredCatalogItems(section) {
    const rows = root.state.catalog?.items || [];
    const cfg = section || {};
    const limitRaw = Number(cfg.featured_limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.round(limitRaw))) : 4;
    if (cfg.featured_mode === "manual" && Array.isArray(cfg.item_ids) && cfg.item_ids.length) {
      const byId = new Map(rows.map((item) => [String(item.item_id), item]));
      return cfg.item_ids.map((id) => byId.get(String(id))).filter(Boolean).slice(0, limit);
    }
    return rows.filter((item) => item && item.is_featured).slice(0, limit);
  }

  // One compact featured card: image, name, price, book button — nothing else.
  // The old card also carried a two-line description and a promo line, which
  // made the homepage section very tall; customers asked for just the essentials
  // shown as small cards.
  function renderFeaturedMiniCard(item, showPrice, showBadge) {
    const id = root.utils.escapeHtml(item.item_id);
    const imageUrl = firstCatalogImage(item);
    const bookable = item.booking_mode === "bookable";
    const price = catalogDisplayPrice(item);
    return `
      <article class="homepage-service-card">
        <button type="button" class="homepage-card-link" data-home-featured-detail="${id}">
          <div class="homepage-card-image">
            ${imageUrl
              ? `<img src="${root.utils.escapeHtml(imageUrl)}" alt="${root.utils.escapeHtml(item.item_name || "บริการ CWF")}" loading="lazy">`
              : root.utils.icon("sparkle", 28)}
            ${showBadge ? `<span class="homepage-service-badge">${bookable ? "จองได้" : "สอบถาม"}</span>` : ""}
          </div>
          <div class="homepage-card-body">
            <strong>${root.utils.escapeHtml(item.item_name || "-")}</strong>
            ${showPrice ? `<span>${root.utils.escapeHtml(price)}${item.unit_label && price !== "สอบถามราคา" ? ` / ${root.utils.escapeHtml(item.unit_label)}` : ""}</span>` : ""}
          </div>
        </button>
        <button type="button" class="${bookable ? "primary-btn" : "secondary-btn"} homepage-service-action" data-home-featured-action="${id}">
          ${bookable ? "จอง" : "สอบถาม"}
        </button>
      </article>
    `;
  }

  // Featured services render as a compact 2×2 grid of four small cards. When
  // more than four featured items exist they are split into "pages" of four
  // that auto-rotate (cross-fade + staggered rise-in), so customers can read
  // one set before the next slides in — see bindHomepageFeaturedRotator.
  const FEATURED_PAGE_SIZE = 4;

  function renderHomepageFeaturedServices(section) {
    const catalog = root.state.catalog || { status: "idle", items: [] };
    if (catalog.status === "loading" || catalog.status === "idle") {
      return `<div class="content-skeleton" aria-label="กำลังโหลดบริการแนะนำ"><span></span><span></span></div>`;
    }
    if (catalog.status === "error") return root.utils.stateBox("error", catalog.error || "โหลดบริการแนะนำไม่สำเร็จ");
    const cfg = section || sectionByType("featured_services") || {};
    const showPrice = cfg.show_price !== false;
    const showBadge = cfg.show_badge !== false;
    const items = featuredCatalogItems(cfg);
    if (!items.length) return root.utils.stateBox("", "ยังไม่มีบริการแนะนำที่เปิดแสดง");
    const pages = [];
    for (let i = 0; i < items.length; i += FEATURED_PAGE_SIZE) {
      pages.push(items.slice(i, i + FEATURED_PAGE_SIZE));
    }
    const multi = pages.length > 1;
    return `
      <div class="homepage-featured-rotator" data-featured-rotator>
        <div class="homepage-featured-pages">
          ${pages.map((pageItems, p) => `
            <div class="homepage-featured-page${p === 0 ? " is-active" : ""}" data-featured-page aria-hidden="${p === 0 ? "false" : "true"}">
              ${pageItems.map((item) => renderFeaturedMiniCard(item, showPrice, showBadge)).join("")}
            </div>
          `).join("")}
        </div>
        ${multi ? `<div class="homepage-featured-dots" role="tablist" aria-label="ชุดบริการแนะนำ">${pages.map((_, p) => `<button type="button" class="${p === 0 ? "is-active" : ""}" data-featured-dot="${p}" aria-label="ชุดบริการที่ ${p + 1}" aria-selected="${p === 0 ? "true" : "false"}"></button>`).join("")}</div>` : ""}
      </div>
    `;
  }

  function renderHomepageQuick(section) {
    const items = (section?.items || []).slice(0, 4);
    if (!items.length) return "";
    return `
      <div class="homepage-quick-grid">
        ${items.map((item, index) => {
          const attrs = item.url
            ? `href="${root.utils.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"`
            : item.action === "contact"
              ? `href="#" data-home-contact="${root.utils.escapeHtml(item.title || "ติดต่อ CWF")}"`
              : `href="#${root.utils.escapeHtml(item.route || "home")}" data-route="${root.utils.escapeHtml(item.route || "home")}"`;
          const iconName = item.icon || ["sparkle", "wrench", "pin", "line"][index] || "sparkle";
          return `
            <a class="homepage-quick${iconName === "line" ? " is-line" : ""}" ${attrs}>
              <span>${root.utils.icon(iconName, 20)}</span>
              <strong>${root.utils.escapeHtml(item.title || "-")}</strong>
            </a>
          `;
        }).join("")}
      </div>
    `;
  }

  const FOCAL_POSITIONS = new Set(["top", "center", "bottom"]);

  function focalPosition(slide, section) {
    const value = slide?.focal_position || section?.focal_position || "center";
    return FOCAL_POSITIONS.has(value) ? value : "center";
  }

  function renderHomepageHero(section) {
    if (!section) return "";
    const slides = Array.isArray(section.items) && section.items.length ? section.items : [section];
    const hasImage = slides.some((slide) => slide.image_url);
    return `
      <section class="homepage-hero${hasImage ? "" : " is-no-image"}">
        <div class="homepage-hero-slider">
          ${slides.map((slide, index) => `
            <article class="homepage-hero-slide" data-home-hero-slide="${index}">
              ${slide.image_url ? `<div class="homepage-hero-media"><img src="${root.utils.escapeHtml(slide.image_url)}" alt="" loading="lazy" style="object-position:${focalPosition(slide, section)}"></div>` : ""}
              <div class="homepage-hero-inner">
                ${slide.kicker || section.kicker ? `<span class="homepage-kicker">${root.utils.escapeHtml(slide.kicker || section.kicker)}</span>` : ""}
                <h2>${root.utils.escapeHtml(slide.title || section.title || "")}</h2>
                ${slide.body || section.body ? `<p>${root.utils.escapeHtml(slide.body || section.body)}</p>` : ""}
                <div class="homepage-hero-actions">
                  ${renderHomepageCta(slide.cta_primary || section.cta_primary, "hero-main-btn")}
                  ${renderHomepageCta(slide.cta_secondary || section.cta_secondary, "hero-ghost-btn")}
                </div>
              </div>
            </article>
          `).join("")}
        </div>
        ${slides.length > 1 ? `<div class="homepage-hero-dots" aria-label="Homepage slides">${slides.map((_, index) => `<button type="button" class="${index === 0 ? "is-active" : ""}" data-home-hero-dot="${index}" aria-label="ไปยังสไลด์ ${index + 1}" aria-selected="${index === 0 ? "true" : "false"}"></button>`).join("")}</div>` : ""}
      </section>
    `;
  }

  // Per-page header banner (store / booking / tracking). Admin-managed in the
  // CMS, independent of the homepage hero, but reuses the hero markup so it
  // auto-slides and its slides are clickable.
  //
  // pageHeaderHtml() only emits a mount point: the actual banner is filled in by
  // bindPageHeader() once the homepage config is available. This is what makes
  // the header reliable on every entry point — deep links, tab switches, or a
  // slow first load — instead of only when the customer opened Home first.
  function pageHeaderHtml(pageKey) {
    return `<div class="page-header-mount" data-page-header="${root.utils.escapeHtml(pageKey)}"></div>`;
  }

  function renderPageHeaderInner(pageKey) {
    const cfg = (homepageConfig().page_headers || {})[pageKey];
    if (!cfg || cfg.enabled === false) return "";
    const slides = (cfg.items || []).filter((s) => s && s.enabled !== false && s.image_url);
    if (!slides.length) return "";
    return `<div class="page-header-banner">${renderHomepageHero({
      type: "hero",
      kicker: cfg.kicker,
      title: cfg.title,
      body: cfg.body,
      focal_position: cfg.focal_position,
      items: slides,
    })}</div>`;
  }

  function bindPageHeader(container) {
    if (!container) return;
    const mounts = Array.from(container.querySelectorAll("[data-page-header]"));
    if (!mounts.length) return;
    const fill = () => {
      mounts.forEach((mount) => {
        if (!mount.isConnected) return;
        const html = renderPageHeaderInner(mount.getAttribute("data-page-header"));
        if (html) {
          if (mount.dataset.filled !== "1") { mount.innerHTML = html; mount.dataset.filled = "1"; bindHomepageHeroSliders(mount); }
        } else if (mount.innerHTML) {
          mount.innerHTML = "";
          mount.dataset.filled = "";
        }
      });
    };
    fill();
    // Config not ready yet → fetch it, then fill the banner in when it arrives.
    if (root.state.homepage?.status !== "success") {
      loadHomepageData().then(fill).catch(() => {});
    }
  }

  function renderHomepagePromoBanner(section) {
    if (!section) return "";
    const banners = (section.items || []).filter((item) => item && item.image_url);
    if (!banners.length) return "";
    return `
      <section class="homepage-promo-banner" data-home-promo-banner>
        <div class="homepage-promo-banner-track">
          ${banners.map((item, index) => {
            const aspectClass = item.aspect_mode === "cover" ? "is-cover" : "is-contain";
            const altText = root.utils.escapeHtml(item.alt_text || item.title || "");
            const media = `<span class="homepage-promo-banner-media ${aspectClass}"><img src="${root.utils.escapeHtml(item.image_url)}" alt="${altText}" loading="lazy"></span>`;
            if (item.url) {
              return `<a class="homepage-promo-banner-slide" href="${root.utils.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-home-promo-slide="${index}">${media}</a>`;
            }
            if (item.action === "contact") {
              return `<button type="button" class="homepage-promo-banner-slide" data-home-contact="${root.utils.escapeHtml(item.title || "ติดต่อ CWF")}" data-home-promo-slide="${index}">${media}</button>`;
            }
            if (item.route) {
              return `<button type="button" class="homepage-promo-banner-slide" data-route="${root.utils.escapeHtml(item.route)}" data-home-promo-slide="${index}">${media}</button>`;
            }
            return `<div class="homepage-promo-banner-slide" data-home-promo-slide="${index}">${media}</div>`;
          }).join("")}
        </div>
        ${banners.length > 1 ? `<div class="homepage-promo-banner-dots" aria-label="Promo banners">${banners.map((_, index) => `<button type="button" class="${index === 0 ? "is-active" : ""}" data-home-promo-dot="${index}" aria-label="ไปยังแบนเนอร์ ${index + 1}" aria-selected="${index === 0 ? "true" : "false"}"></button>`).join("")}</div>` : ""}
      </section>
    `;
  }

  function renderHomepageActiveJob(section) {
    const bucket = root.state.homeActiveJob || { status: "idle", data: null };
    const job = bucket.data;
    const sid = root.utils.escapeHtml(section.id || "active_job");
    if (!job || bucket.status !== "success") return `<div data-home-active-job data-section-id="${sid}"></div>`;
    const dateLabel = job.appointment_datetime ? root.utils.formatDateTime(job.appointment_datetime) : "";
    return `
      <section class="homepage-section homepage-active-job" data-home-active-job data-section-id="${sid}">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
        </div>
        <button class="homepage-active-job-card" type="button" data-route="tracking">
          <span>${root.utils.escapeHtml(job.job_status || "")}</span>
          <strong>${root.utils.escapeHtml(job.job_type || job.booking_code || "")}</strong>
          ${dateLabel ? `<small>${root.utils.escapeHtml(dateLabel)}</small>` : ""}
          <small>${root.utils.escapeHtml(job.booking_code || "")}</small>
        </button>
      </section>
    `;
  }

  function renderHomepageFeaturedSection(section) {
    const catalog = root.state.catalog || { status: "idle", items: [] };
    if (catalog.status === "success" && !featuredCatalogItems(section).length) {
      // No valid items after resolving against real Catalog data (e.g. every
      // manually-selected item became inactive/hidden) — hide the section
      // entirely rather than show admin-authored copy with an empty body.
      return `<div data-home-featured-section data-section-id="${root.utils.escapeHtml(section.id || "featured_services")}"></div>`;
    }
    return `
      <section class="homepage-section" data-home-featured-section data-section-id="${root.utils.escapeHtml(section.id || "featured_services")}">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
          <button type="button" class="text-link-btn" data-route="${section.view_all_route || "store"}">${root.utils.escapeHtml(section.view_all_label || "ดูทั้งหมด")}</button>
        </div>
        <div data-homepage-featured>${renderHomepageFeaturedServices(section)}</div>
      </section>
    `;
  }

  function renderHomepageManualSection(section) {
    const items = (section.items || []).slice(0, 8);
    if (!items.length) return "";
    const viewAllLabel = section.view_all_label || (section.view_all_route ? "ดูทั้งหมด" : "");
    return `
      <section class="homepage-section">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
          ${viewAllLabel && section.view_all_route ? `<button type="button" class="text-link-btn" data-route="${root.utils.escapeHtml(section.view_all_route)}">${root.utils.escapeHtml(viewAllLabel)}</button>` : ""}
        </div>
        <div class="homepage-carousel">
          ${items.map((item) => {
            const attrs = item.action === "contact"
              ? `href="#" data-home-contact="${root.utils.escapeHtml(item.title || "ติดต่อ CWF")}"`
              : item.url
                ? `href="${root.utils.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"`
                : `href="#${root.utils.escapeHtml(item.route || "home")}" data-route="${root.utils.escapeHtml(item.route || "home")}"`;
            return `
              <a class="homepage-${section.type === "articles" ? "article" : section.type === "updates" ? "update" : "announcement"}-card" ${attrs}>
                ${homepageImage(item, "homepage-card-image", "sparkle")}
                <div class="homepage-card-body">
                  <strong>${root.utils.escapeHtml(item.title || "")}</strong>
                  ${item.body ? `<small>${root.utils.escapeHtml(item.body)}</small>` : ""}
                  ${item.tag || item.date_label ? `<span>${root.utils.escapeHtml(item.tag || item.date_label)}</span>` : ""}
                </div>
              </a>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  // Admin pastes a public post/video URL (no Graph/YouTube Data API calls);
  // we only need the video ID client-side to build a thumbnail + nocookie
  // Returns true if the Facebook URL is a Page/profile (not a specific post/video/photo).
  // Page URLs → embed Facebook Page Plugin timeline. Post URLs → open in new tab.
  function facebookIsPage(url) {
    const postIndicators = ["/posts/", "/videos/", "/photo", "/reel/", "/watch/", "story_fbid", "fbid=", "/permalink/"];
    return !postIndicators.some((p) => url.includes(p));
  }

  // embed URL. Matches watch/shorts/youtu.be/embed link shapes.
  function youtubeVideoId(url) {
    const text = String(url || "");
    const patterns = [
      /youtu\.be\/([\w-]{6,})/,
      /[?&]v=([\w-]{6,})/,
      /youtube\.com\/embed\/([\w-]{6,})/,
      /youtube\.com\/shorts\/([\w-]{6,})/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  }

  // Facebook Page URL → full-width embedded Page Plugin timeline, rendered as
  // its own block (never a narrow carousel card). The iframe src is set in JS
  // (bindHomepageFbTimelines) with the plugin `width` matched to the real
  // container width — the iframe embed ignores adapt_container_width, so a
  // hard-coded width would render wider than the frame and clip the cover, page
  // name and posts. The "เปิดเพจ Facebook" link is the graceful no-JS fallback.
  function renderHomepageFbTimeline(item) {
    const url = String(item.url || "").trim();
    return `
      <article class="homepage-fb-timeline">
        ${item.title || item.body ? `
          <div class="homepage-fb-timeline-head">
            <span class="homepage-fb-badge">${root.utils.icon("facebook", 14)} Facebook</span>
            ${item.title ? `<strong>${root.utils.escapeHtml(item.title)}</strong>` : ""}
            ${item.body ? `<small>${root.utils.escapeHtml(item.body)}</small>` : ""}
          </div>` : ""}
        <div class="homepage-fb-timeline-frame" data-fb-timeline-frame>
          <iframe title="Facebook" data-fb-href="${root.utils.escapeHtml(url)}" loading="lazy" scrolling="no" frameborder="0" allowfullscreen="true"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
        </div>
        <a class="homepage-fb-timeline-cta" href="${root.utils.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">เปิดเพจ Facebook</a>
      </article>
    `;
  }

  function renderHomepageSocialCard(item, index) {
    const platform = item.platform === "facebook" ? "facebook" : "youtube";
    const url = String(item.url || "").trim();
    const videoId = platform === "youtube" ? youtubeVideoId(url) : "";
    const thumb = String(item.image_url || "").trim() || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
    return `
      <article class="homepage-social-card is-${platform}" data-home-social="${index}" data-platform="${platform}" data-video-id="${root.utils.escapeHtml(videoId)}" data-post-url="${root.utils.escapeHtml(url)}">
        <button type="button" class="homepage-social-media" data-home-social-trigger aria-label="${platform === "youtube" ? "เล่นวิดีโอ" : "ดูโพสต์ Facebook"}">
          ${thumb
            ? `<img src="${root.utils.escapeHtml(thumb)}" alt="" loading="lazy">`
            : `<span class="homepage-social-fallback">${root.utils.icon(platform === "facebook" ? "facebook" : "play", 30)}</span>`}
          <span class="homepage-social-play">${root.utils.icon("play", 22)}</span>
          <span class="homepage-social-badge">${platform === "youtube" ? "YouTube" : "Facebook"}</span>
        </button>
        <div class="homepage-card-body">
          ${item.title ? `<strong>${root.utils.escapeHtml(item.title)}</strong>` : ""}
          ${item.body ? `<small>${root.utils.escapeHtml(item.body)}</small>` : ""}
        </div>
      </article>
    `;
  }

  function renderHomepageSocial(section) {
    if (!section) return "";
    const items = (section.items || []).slice(0, 8);
    if (!items.length) return "";
    // Facebook Page timelines are full-width blocks; YouTube videos and single
    // Facebook posts stay as thumbnails in the horizontal carousel.
    const isPageItem = (it) => it && it.platform === "facebook" && it.url && facebookIsPage(String(it.url).trim());
    const pageItems = items.filter(isPageItem);
    const cardItems = items.filter((it) => !isPageItem(it));
    const viewAllLabelSocial = section.view_all_label || (section.view_all_route ? "ดูทั้งหมด" : "");
    const carousel = cardItems.length
      ? `<div class="homepage-carousel homepage-social-grid">${cardItems.map((item, index) => renderHomepageSocialCard(item, index)).join("")}</div>`
      : "";
    const timelines = pageItems.length
      ? `<div class="homepage-fb-timeline-stack">${pageItems.map((item) => renderHomepageFbTimeline(item)).join("")}</div>`
      : "";
    return `
      <section class="homepage-section">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
          ${viewAllLabelSocial && section.view_all_route ? `<button type="button" class="text-link-btn" data-route="${root.utils.escapeHtml(section.view_all_route)}">${root.utils.escapeHtml(viewAllLabelSocial)}</button>` : ""}
        </div>
        ${carousel}
        ${timelines}
      </section>
    `;
  }

  function renderHomepageTrust(section) {
    if (!section) return "";
    return `
      <section class="homepage-section">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
        </div>
        <div class="homepage-trust-grid">
          ${(section.items || []).slice(0, 6).map((item) => `
            <div class="homepage-trust-item">
              <strong>${root.utils.escapeHtml(item.title || "")}</strong>
              ${item.body ? `<span>${root.utils.escapeHtml(item.body)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderStars(rating) {
    const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return `<span class="homepage-stars" role="img" aria-label="ให้คะแนน ${r} จาก 5 ดาว">${"★".repeat(r)}${"☆".repeat(5 - r)}</span>`;
  }

  // Customer testimonials — reviewer name (title), review text (body), optional
  // role/place (tag) and avatar (image_url), plus a 1–5 star rating.
  function renderHomepageTestimonials(section) {
    if (!section) return "";
    const items = (section.items || []).filter((item) => item && item.enabled !== false && item.title);
    if (!items.length) return "";
    return `
      <section class="homepage-section">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
        </div>
        <div class="homepage-carousel homepage-testimonials">
          ${items.map((item) => `
            <article class="homepage-testimonial-card">
              ${renderStars(item.rating)}
              ${item.body ? `<p class="homepage-testimonial-text">${root.utils.escapeHtml(item.body)}</p>` : ""}
              <div class="homepage-testimonial-author">
                ${item.image_url
                  ? `<img class="homepage-testimonial-avatar" src="${root.utils.escapeHtml(item.image_url)}" alt="" loading="lazy">`
                  : `<span class="homepage-testimonial-avatar is-initial" aria-hidden="true">${root.utils.escapeHtml((item.title || "?").trim().charAt(0) || "?")}</span>`}
                <div class="homepage-testimonial-meta">
                  <strong>${root.utils.escapeHtml(item.title || "")}</strong>
                  ${item.tag ? `<small>${root.utils.escapeHtml(item.tag)}</small>` : ""}
                </div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  // FAQ accordion — native <details>/<summary> so it expands with no JS and
  // stays keyboard-accessible. title = question, body = answer.
  function renderHomepageFaq(section) {
    if (!section) return "";
    const items = (section.items || []).filter((item) => item && item.enabled !== false && item.title);
    if (!items.length) return "";
    return `
      <section class="homepage-section">
        <div class="homepage-section-head">
          <div>
            <h2>${root.utils.escapeHtml(section.title || "")}</h2>
            ${section.body ? `<p>${root.utils.escapeHtml(section.body)}</p>` : ""}
          </div>
        </div>
        <div class="homepage-faq">
          ${items.map((item) => `
            <details class="homepage-faq-item">
              <summary><span>${root.utils.escapeHtml(item.title || "")}</span><span class="homepage-faq-chevron" aria-hidden="true"></span></summary>
              ${item.body ? `<div class="homepage-faq-answer">${root.utils.escapeHtml(item.body)}</div>` : ""}
            </details>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderHomepageSection(section) {
    if (!section) return "";
    if (section.type === "hero") return renderHomepageHero(section);
    if (section.type === "quick") return renderHomepageQuick(section);
    if (section.type === "promo_banner") return renderHomepagePromoBanner(section);
    if (section.type === "active_job") return renderHomepageActiveJob(section);
    if (section.type === "featured_services") return renderHomepageFeaturedSection(section);
    if (["updates", "articles", "announcements"].includes(section.type)) return renderHomepageManualSection(section);
    if (section.type === "social") return renderHomepageSocial(section);
    if (section.type === "trust") return renderHomepageTrust(section);
    if (section.type === "testimonials") return renderHomepageTestimonials(section);
    if (section.type === "faq") return renderHomepageFaq(section);
    return "";
  }

  function renderAccountShortcut() {
    const customer = root.state.customer;
    if (root.state.authStatus === "loading" && !customer) {
      return `
        <section class="card account-shortcut">
          <div class="account-skeleton"><span></span><span></span></div>
        </section>
      `;
    }

    if (!customer?.logged_in) {
      return `
        <section class="card account-shortcut">
          <h2>จองแบบ Guest ได้ทันที</h2>
          <p class="muted">เข้าสู่ระบบเมื่อต้องการบันทึกที่อยู่และกลับมาติดตามงานได้สะดวกขึ้น</p>
          <button class="secondary-btn" type="button" data-route="profile">เข้าสู่ระบบ</button>
        </section>
      `;
    }

    const profile = customer.profile || {};
    const displayName = root.auth.displayName(customer);
    const hasAddress = String(profile.address || "").trim();
    return `
      <section class="card account-shortcut is-logged-in">
        <div class="account-shortcut-head">
          ${root.auth.avatarHtml(customer, "account-avatar")}
          <div>
            <h2>${root.utils.escapeHtml(displayName)}</h2>
            <p>บัญชีพร้อมใช้งาน</p>
          </div>
        </div>
        <p class="muted">${hasAddress ? "มีที่อยู่สำหรับรับบริการบันทึกไว้แล้ว" : "เพิ่มที่อยู่สำหรับรับบริการ เพื่อจองครั้งถัดไปได้เร็วขึ้น"}</p>
        <button class="secondary-btn" type="button" data-route="profile">${hasAddress ? "ดูบัญชีของฉัน" : "เพิ่มที่อยู่"}</button>
      </section>
    `;
  }

  async function loadCollection(name, fn, key) {
    if (root.state[name]?.status !== "idle") return;
    root.state.setCollection(name, { status: "loading", items: [], error: "" });
    try {
      const data = await fn();
      root.state.setCollection(name, {
        status: "success",
        items: root.utils.normalizeList(data, key),
        error: "",
      });
    } catch (error) {
      root.state.setCollection(name, { status: "error", items: [], error: error?.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
  }

  async function loadHomepageData() {
    if (root.state.homepage?.status !== "idle") return;
    root.state.setHomepage({ status: "loading", error: "" });
    try {
      const data = await root.api.loadHomepage();
      root.state.setHomepage({
        status: "success",
        config: data?.config || DEFAULT_HOME_CONFIG,
        fallback: Boolean(data?.fallback),
        error: "",
      });
    } catch (error) {
      root.state.setHomepage({
        status: "error",
        config: DEFAULT_HOME_CONFIG,
        fallback: true,
        error: error?.message || "โหลดหน้าแรกไม่สำเร็จ",
      });
    }
  }

  async function loadHomePricingData() {
    if (root.state.homePricing.status !== "idle") return;
    const cards = root.services.quickServices.filter((card) => card.priceable);
    const loadingItems = Object.fromEntries(cards.map((card) => [card.id, { status: "loading", data: null, error: "" }]));
    root.state.setHomePricing({ status: "loading", items: loadingItems, error: "" });

    const entries = await Promise.all(cards.map(async (card) => {
      const payload = root.services.payloadFromServiceDraft(card.draft);
      if (!payload) return [card.id, { status: "error", data: null, error: "ADMIN_ESTIMATE" }];
      try {
        const data = await root.api.previewPricing(payload);
        return [card.id, { status: "success", data, error: "" }];
      } catch (error) {
        return [card.id, { status: "error", data: null, error: error?.message || "PRICE_UNAVAILABLE" }];
      }
    }));

    root.state.setHomePricing({ status: "success", items: Object.fromEntries(entries), error: "" });
  }

  async function loadHomeActiveJobData() {
    if (root.state.homeActiveJob?.status !== "idle") return;
    root.state.setCollection("homeActiveJob", { status: "loading", data: null, error: "" });
    try {
      const data = await root.api.loadHomeActiveJob();
      root.state.setCollection("homeActiveJob", {
        status: "success",
        data: data?.active_job || null,
        error: "",
      });
    } catch (error) {
      root.state.setCollection("homeActiveJob", {
        status: "error",
        data: null,
        error: error?.message || "ACTIVE_JOB_UNAVAILABLE",
      });
    }
  }

  async function loadHomeData() {
    if (homeLoadPromise) return homeLoadPromise;
    const needsAuth = root.state.authStatus === "idle" && !root.state.customer;
    const needsHomepage = root.state.homepage?.status === "idle";
    const needsCatalog = root.state.catalog?.status === "idle";
    const needsPromotions = root.state.promotions?.status === "idle";
    const needsZones = root.state.zones?.status === "idle";
    const needsPricing = root.state.homePricing?.status === "idle";
    const needsActiveJob = root.state.homeActiveJob?.status === "idle";
    if (!needsAuth && !needsHomepage && !needsCatalog && !needsPromotions && !needsZones && !needsPricing && !needsActiveJob) return Promise.resolve([]);
    const tasks = [];
    if (needsAuth) tasks.push(root.auth.loadCustomer(null));
    if (needsHomepage) tasks.push(loadHomepageData());
    if (needsCatalog) tasks.push(loadCollection("catalog", () => root.api.loadCatalogItems(), "items"));
    if (needsPromotions) tasks.push(loadCollection("promotions", root.api.loadPromotions, "promotions"));
    if (needsZones) tasks.push(loadCollection("zones", root.api.loadServiceZones, "zones"));
    if (needsPricing) tasks.push(loadHomePricingData());
    if (needsActiveJob) tasks.push(loadHomeActiveJobData());
    homeLoadPromise = Promise.allSettled(tasks).finally(() => {
      homeLoadPromise = null;
      patchHomeData();
    });
    return homeLoadPromise;
  }

  function contactMessage(serviceTitle) {
    const title = String(serviceTitle || "บริการแอร์").trim();
    return `สวัสดีค่ะ สนใจ${title} ต้องการให้แอดมินช่วยประเมินรายละเอียดค่ะ`;
  }

  function renderContactSheet(item) {
    const title = item?.title || "บริการนี้";
    const message = contactMessage(title);
    return `
      <div class="contact-sheet-backdrop" data-contact-close></div>
      <section class="contact-sheet" role="dialog" aria-modal="true" aria-labelledby="contact-sheet-title">
        <button class="contact-sheet-close" type="button" data-contact-close aria-label="ปิด">×</button>
        <span class="section-kicker">ติดต่อแอดมิน</span>
        <h2 id="contact-sheet-title">${root.utils.escapeHtml(title)}</h2>
        <p>บริการนี้ยังไม่เปิดจองอัตโนมัติในแอป กรุณาติดต่อแอดมินเพื่อสอบถามอาการ ประเมินราคา และนัดหมายให้เหมาะกับหน้างาน</p>
        <div class="contact-sheet-actions">
          <a class="primary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แชท LINE @cwfair</a>
          <a class="secondary-btn" href="tel:0988777321">โทร 098-877-7321</a>
        </div>
      </section>
    `;
  }

  function openContactSheet(container, item) {
    let mount = container.querySelector("[data-contact-sheet-mount]");
    if (!mount) {
      mount = document.createElement("div");
      mount.setAttribute("data-contact-sheet-mount", "");
      container.appendChild(mount);
    }
    mount.innerHTML = renderContactSheet(item);
    document.body.classList.add("has-contact-sheet");
    const close = () => {
      mount.innerHTML = "";
      document.body.classList.remove("has-contact-sheet");
    };
    mount.querySelectorAll("[data-contact-close]").forEach((button) => button.addEventListener("click", close, { once: true }));
    requestAnimationFrame(() => mount.querySelector(".contact-sheet-close")?.focus());
  }

  function bindCommerceHome(container) {
    container.querySelectorAll("[data-commerce-service]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = root.services.commerceItem(button.getAttribute("data-commerce-service"));
        if (!item) return;
        if (item.action === "contact") {
          openContactSheet(container, item);
          return;
        }
        if (item.action === "urgent") {
          root.utils.routeTo("urgent");
          return;
        }
        if (!root.services.applyCommerceDraft("scheduled", item)) return;
        root.utils.routeTo("scheduled");
      });
    });

    container.querySelectorAll("[data-contact-service]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = root.services.commerceItem(button.getAttribute("data-contact-service"));
        if (item) openContactSheet(container, item);
      });
    });

    container.querySelectorAll("[data-commerce-method]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = root.services.commerceItem(button.getAttribute("data-commerce-method"));
        if (!item || !root.services.applyCommerceDraft("scheduled", item)) return;
        root.utils.routeTo("scheduled");
      });
    });
  }

  function bindHomepage(container) {
    bindCommerceHome(container);
    bindHomepageReveal(container);
    bindHomepageHeroSliders(container);
    bindHomepagePromoBannerSlider(container);
    container.querySelectorAll("[data-home-contact]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        openContactSheet(container, { title: button.getAttribute("data-home-contact") || "ติดต่อ CWF" });
      });
    });
    container.querySelectorAll("[data-home-featured-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-home-featured-detail");
        if (id) root.utils.routeTo(`storeItem-${id}`);
      });
    });
    container.querySelectorAll("[data-home-featured-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        const id = button.getAttribute("data-home-featured-action");
        const item = (root.state.catalog?.items || []).find((row) => String(row.item_id) === String(id));
        if (!item) return;
        if (item.booking_mode === "bookable") {
          const draftItem = strictCatalogCommerceDraft(item);
          if (draftItem && root.services.applyCommerceDraft("scheduled", draftItem)) {
            root.utils.routeTo("scheduled");
            return;
          }
        }
        openContactSheet(container, { title: item.item_name || "บริการนี้" });
      });
    });
    bindHomepageSocialCards(container);
    bindHomepageFbTimelines(container);
    bindHomepageFeaturedRotator(container);
  }

  // Auto-rotate the pages of four featured cards. All pages stay in the DOM
  // (so their book/detail buttons keep the handlers bound above) — only the
  // active page is opaque and interactive; the rest fade out and turn off
  // pointer events. Advances on a slow, readable interval, pauses while the
  // customer is touching the section, and lets the dots jump directly.
  function bindHomepageFeaturedRotator(container) {
    container.querySelectorAll("[data-featured-rotator]").forEach((rotator) => {
      if (rotator.dataset.bound === "1") return;
      rotator.dataset.bound = "1";
      const pages = Array.from(rotator.querySelectorAll("[data-featured-page]"));
      const dots = Array.from(rotator.querySelectorAll("[data-featured-dot]"));
      if (pages.length <= 1) return;
      let index = 0;
      let timer = 0;
      let paused = false;
      const setActive = (next) => {
        index = (next % pages.length + pages.length) % pages.length;
        pages.forEach((page, i) => {
          const active = i === index;
          page.classList.toggle("is-active", active);
          page.setAttribute("aria-hidden", active ? "false" : "true");
        });
        dots.forEach((dot, i) => {
          const active = i === index;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active ? "true" : "false");
        });
      };
      const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
      const start = () => { stop(); timer = setInterval(() => { if (!paused) setActive(index + 1); }, 4200); };
      dots.forEach((dot, i) => {
        dot.addEventListener("click", () => { setActive(i); start(); });
      });
      ["touchstart", "pointerdown"].forEach((ev) =>
        rotator.addEventListener(ev, () => { paused = true; }, { passive: true }));
      ["touchend", "pointerup", "mouseleave"].forEach((ev) =>
        rotator.addEventListener(ev, () => { paused = false; }, { passive: true }));
      setActive(0);
      start();
    });
  }

  // Size each Facebook Page Plugin to its real container width so its cover,
  // page name and posts are never clipped. The iframe embed renders at exactly
  // the plugin `width` param (it ignores adapt_container_width), so we measure
  // the frame and build the src to match, clamped to Facebook's 180–500 range.
  // Re-fits on viewport resize/rotation (debounced) and only reloads on change.
  function bindHomepageFbTimelines(container) {
    const frames = Array.from(container.querySelectorAll("[data-fb-timeline-frame]"));
    if (!frames.length) return;
    const HEIGHT = 640;
    const fit = (frame) => {
      const iframe = frame.querySelector("iframe");
      if (!iframe) return;
      const href = iframe.getAttribute("data-fb-href");
      if (!href) return;
      const width = Math.max(180, Math.min(500, Math.round(frame.clientWidth || 340)));
      if (iframe.getAttribute("data-fb-width") === String(width)) return;
      iframe.setAttribute("data-fb-width", String(width));
      iframe.style.width = width + "px";
      iframe.style.height = HEIGHT + "px";
      iframe.src = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(href)}` +
        `&tabs=timeline&width=${width}&height=${HEIGHT}&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`;
    };
    frames.forEach(fit);
    if (container.dataset.fbResizeBound !== "1") {
      container.dataset.fbResizeBound = "1";
      let raf = 0;
      window.addEventListener("resize", () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; frames.forEach(fit); });
      }, { passive: true });
    }
  }

  // Lazy click-to-embed: cards load a static thumbnail first (real YouTube
  // thumbnail, or a branded fallback chip for Facebook) and only fetch the
  // YouTube/Facebook iframe once tapped, keeping the homepage's initial load
  // light while still rendering the actual post/video inline on demand.
  // Scroll-reveal choreography: top-level blocks (and inner carousels) fade/rise
  // into view once. Hero reveals instantly; the rest reveal as they scroll in.
  // Degrades gracefully to "everything visible" if IntersectionObserver is absent.
  function bindHomepageReveal(container) {
    const screen = container.querySelector(".homepage-screen");
    if (!screen) return;
    const blocks = Array.from(screen.children).filter((el) =>
      el.classList &&
      (el.classList.contains("homepage-hero") ||
        el.classList.contains("homepage-quick-grid") ||
        el.classList.contains("homepage-promo-banner") ||
        el.classList.contains("homepage-section")));
    const carousels = Array.from(container.querySelectorAll(".homepage-quick-grid, .homepage-carousel"));
    const targets = Array.from(new Set([...blocks, ...carousels]));
    if (!targets.length) return;

    const reveal = (el) => el.classList.add("is-revealed");
    // Hero first-paint: reveal immediately so the top of the page isn't blank.
    blocks.filter((el) => el.classList.contains("homepage-hero")).forEach(reveal);

    if (typeof IntersectionObserver !== "function") {
      targets.forEach(reveal);
      return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          reveal(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    targets.forEach((el) => {
      if (el.classList.contains("is-revealed")) return;
      observer.observe(el);
    });
    // Safety net: if anything is still hidden shortly after paint (e.g. tall
    // viewport where lower sections never trigger), reveal them.
    setTimeout(() => targets.forEach(reveal), 1400);
  }

  // Gentle auto-advance for a slider: steps to the next slide on an interval and
  // pauses while the user is touching/scrolling it. Loops back to the start.
  function autoAdvanceSlider(sliderEl, slideCount, intervalMs) {
    if (!sliderEl || slideCount <= 1) return;
    let timer = 0;
    let paused = false;
    const step = () => {
      if (paused) return;
      const width = sliderEl.clientWidth || 1;
      const index = Math.round((sliderEl.scrollLeft || 0) / width);
      const next = (index + 1) % slideCount;
      if (typeof sliderEl.scrollTo === "function") {
        sliderEl.scrollTo({ left: next * width, behavior: "smooth" });
      }
    };
    const start = () => { stop(); timer = setInterval(step, intervalMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    ["touchstart", "pointerdown"].forEach((ev) =>
      sliderEl.addEventListener(ev, () => { paused = true; stop(); }, { passive: true }));
    ["touchend", "pointerup", "mouseleave"].forEach((ev) =>
      sliderEl.addEventListener(ev, () => { paused = false; start(); }, { passive: true }));
    start();
  }

  function bindHomepageSocialCards(container) {
    container.querySelectorAll("[data-home-social-trigger]").forEach((trigger) => {
      if (trigger.dataset.bound === "1") return;
      trigger.dataset.bound = "1";
      trigger.addEventListener("click", () => {
        const card = trigger.closest("[data-home-social]");
        if (!card) return;
        const platform = card.getAttribute("data-platform");
        const videoId = card.getAttribute("data-video-id") || "";
        const postUrl = card.getAttribute("data-post-url") || "";
        let embedSrc = "";
        if (platform === "youtube" && videoId) {
          embedSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
        } else if (platform === "facebook" && postUrl) {
          // Facebook iframe embeds are blocked by most mobile browsers — open directly
          window.open(postUrl, "_blank", "noopener,noreferrer");
          return;
        }
        if (!embedSrc) {
          if (postUrl) window.open(postUrl, "_blank", "noopener,noreferrer");
          return;
        }
        trigger.outerHTML = `<div class="homepage-social-media is-embed"><iframe src="${root.utils.escapeHtml(embedSrc)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen frameborder="0" scrolling="no"></iframe></div>`;
      });
    });
  }

  function bindHomepageHeroSliders(container) {
    container.querySelectorAll(".homepage-hero").forEach((hero) => {
      const slider = hero.querySelector(".homepage-hero-slider");
      const slides = Array.from(hero.querySelectorAll("[data-home-hero-slide]"));
      const dots = Array.from(hero.querySelectorAll("[data-home-hero-dot]"));
      if (!slider || slides.length <= 1 || !dots.length || slider.dataset.bound === "1") return;
      slider.dataset.bound = "1";
      let raf = 0;
      const setActive = (index) => {
        dots.forEach((dot, dotIndex) => {
          const active = dotIndex === index;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active ? "true" : "false");
        });
      };
      const update = () => {
        raf = 0;
        const width = slider.clientWidth || 1;
        const index = Math.max(0, Math.min(slides.length - 1, Math.round((slider.scrollLeft || 0) / width)));
        setActive(index);
      };
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(update);
      };
      slider.addEventListener("scroll", onScroll, { passive: true });
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          const slide = slides[index];
          if (!slide) return;
          if (typeof slider.scrollTo === "function") {
            slider.scrollTo({ left: slide.offsetLeft || index * (slider.clientWidth || 0), behavior: "smooth" });
          } else if (typeof slide.scrollIntoView === "function") {
            slide.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
          }
          setActive(index);
        });
        dot.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault?.();
            dot.click();
          }
          if (event.key === "ArrowRight" && dots[index + 1]) dots[index + 1].focus();
          if (event.key === "ArrowLeft" && dots[index - 1]) dots[index - 1].focus();
        });
      });
      update();
      autoAdvanceSlider(slider, slides.length, 5200);
    });
  }

  function bindHomepagePromoBannerSlider(container) {
    container.querySelectorAll(".homepage-promo-banner").forEach((banner) => {
      const track = banner.querySelector(".homepage-promo-banner-track");
      const slides = Array.from(banner.querySelectorAll("[data-home-promo-slide]"));
      const dots = Array.from(banner.querySelectorAll("[data-home-promo-dot]"));
      if (!track || slides.length <= 1 || !dots.length || track.dataset.bound === "1") return;
      track.dataset.bound = "1";
      let raf = 0;
      const setActive = (index) => {
        dots.forEach((dot, dotIndex) => {
          const active = dotIndex === index;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active ? "true" : "false");
        });
      };
      const update = () => {
        raf = 0;
        const width = track.clientWidth || 1;
        const index = Math.max(0, Math.min(slides.length - 1, Math.round((track.scrollLeft || 0) / width)));
        setActive(index);
      };
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(update);
      };
      track.addEventListener("scroll", onScroll, { passive: true });
      dots.forEach((dot, index) => {
        dot.addEventListener("click", () => {
          const slide = slides[index];
          if (!slide) return;
          if (typeof track.scrollTo === "function") {
            track.scrollTo({ left: slide.offsetLeft || index * (track.clientWidth || 0), behavior: "smooth" });
          } else if (typeof slide.scrollIntoView === "function") {
            slide.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
          }
          setActive(index);
        });
        dot.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault?.();
            dot.click();
          }
          if (event.key === "ArrowRight" && dots[index + 1]) dots[index + 1].focus();
          if (event.key === "ArrowLeft" && dots[index - 1]) dots[index - 1].focus();
        });
      });
      update();
      autoAdvanceSlider(track, slides.length, 5600);
    });
  }

  function patchHomeData() {
    if (root.state.currentRoute !== "home") return;
    const container = document.getElementById("app");
    if (!container) return;
    const promotions = container.querySelector("[data-promotions]");
    if (promotions) promotions.innerHTML = renderPromotionSummary();
    const zones = container.querySelector("[data-zones]");
    if (zones) zones.innerHTML = renderCoverageSummary();
    const account = container.querySelector("[data-home-account]");
    if (account) {
      account.innerHTML = renderAccountShortcut();
      root.auth?.bindAvatarFallbacks?.(account);
    }
    // Re-render each featured/active-job mount from its own section config (by
    // id), so duplicated sections of these types all refresh — not just the
    // first one — once catalog/active-job data arrives.
    const sectionById = (id, type) =>
      homepageSections().find((section) => section.id === id) || sectionByType(type);
    container.querySelectorAll("[data-home-featured-section]").forEach((mount) => {
      const cfg = sectionById(mount.getAttribute("data-section-id"), "featured_services");
      if (cfg) mount.outerHTML = renderHomepageFeaturedSection(cfg);
    });
    container.querySelectorAll("[data-home-active-job]").forEach((mount) => {
      const cfg = sectionById(mount.getAttribute("data-section-id"), "active_job");
      if (cfg) mount.outerHTML = renderHomepageActiveJob(cfg);
    });
    container.querySelectorAll("[data-quick-price]").forEach((mount) => {
      const card = root.services.quickServices.find((item) => item.id === mount.getAttribute("data-quick-price"));
      if (card) mount.innerHTML = renderQuickPrice(card);
    });
    bindHomepage(container);
  }

  function updateAccountChrome() {
    const button = document.querySelector("[data-account-chip]");
    if (!button) return;
    const label = button.querySelector("[data-account-chip-label]");
    const avatar = button.querySelector("[data-account-chip-avatar]");
    const customer = root.state.customer;
    if (customer?.logged_in) {
      const name = root.auth?.displayName?.(customer) || "บัญชีของฉัน";
      if (label) label.textContent = name.length > 12 ? `${name.slice(0, 12)}…` : name;
      if (avatar) {
        const picture = root.auth?.pictureUrl?.(customer) || "";
        const initial = root.utils.escapeHtml(name.slice(0, 1));
        avatar.innerHTML = picture
          ? `<img src="${root.utils.escapeHtml(picture)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-avatar-initial="${initial}">`
          : initial;
        root.auth?.bindAvatarFallbacks?.(avatar);
      }
      button.classList.add("is-logged-in");
      button.setAttribute("aria-label", `บัญชีของ ${name}`);
    } else {
      if (label) label.textContent = "เข้าสู่ระบบ";
      if (avatar) avatar.textContent = "";
      button.classList.remove("is-logged-in");
      button.setAttribute("aria-label", "เข้าสู่ระบบหรือดูบัญชี");
    }
  }

  const ui = {
    prefetchHome: loadHomeData,
    patchHomeData,
    updateAccountChrome,
    openContactSheet,
    pageHeaderHtml,
    bindPageHeader,

    renderHome(container) {
      const sectionsHtml = homepageSections().map(renderHomepageSection).filter(Boolean).join("");
      container.innerHTML = `
        <section class="screen commerce-home homepage-screen">
          ${sectionsHtml}
          <div data-contact-sheet-mount></div>
        </section>
      `;
      bindHomepage(container);
      root.auth?.bindAvatarFallbacks?.(container);
      loadHomeData();
    },

    renderBookingMode(container) {
      container.innerHTML = `
        <section class="screen">
          ${pageHeaderHtml("booking")}
          <div class="hero booking-hero">
            <div class="hero-badge">จองบริการ</div>
            <h2>จองล้างแอร์ล่วงหน้า</h2>
            <p>เลือกประเภทการล้าง ดูราคา และเลือกวันเวลาจากคิวช่างที่ว่างจริง</p>
          </div>
          <div class="card-grid">
            <button class="mode-card is-scheduled" type="button" data-route="scheduled">
              <span class="mode-kicker">เปิดจองในแอป</span>
              <strong>จองล้างแอร์</strong>
              <span>รองรับแอร์ผนัง แอร์สี่ทิศทาง แอร์แขวน และแอร์เปลือยใต้ฝ้า</span>
              <span class="mode-foot">ดูราคาและคิวว่าง</span>
            </button>
            <button class="mode-card is-urgent" type="button" data-route="urgent">
              <span class="mode-kicker">คำขอด่วน</span>
              <strong>คิวด่วน</strong>
              <span>ส่งรายละเอียดให้พาร์ทเนอร์ช่างกดรับ และติดตามผลด้วย Booking Code</span>
              <span class="mode-foot">ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับ</span>
            </button>
          </div>
          <section class="card support-card">
            <h2>งานซ่อม ติดตั้ง ย้ายแอร์ หรือตรวจอาการ</h2>
            <p class="muted">ยังไม่เปิดจองอัตโนมัติ กรุณาติดต่อแอดมินเพื่อประเมินอาการ ราคา และเวลาที่เหมาะสม</p>
            <div class="support-strip">
              <a class="primary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แชท LINE @cwfair</a>
              <a class="secondary-btn" href="tel:0988777321">โทร 098-877-7321</a>
            </div>
          </section>
        </section>
      `;
      bindPageHeader(container);
    },

    supportButtons() {
      return `
        <section class="card support-card">
          <h2>ติดต่อ CWF</h2>
          <div class="support-strip">
            <a class="secondary-btn" href="tel:0988777321">โทร 098-877-7321</a>
            <a class="secondary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แชท LINE @cwfair</a>
          </div>
        </section>
      `;
    },
  };

  root.ui = ui;
})();
