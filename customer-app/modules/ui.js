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
          <span class="account-avatar">${root.utils.escapeHtml(displayName.slice(0, 1))}</span>
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

  async function loadHomeData() {
    if (homeLoadPromise) return homeLoadPromise;
    const tasks = [
      root.auth.loadCustomer(null),
      loadCollection("promotions", root.api.loadPromotions, "promotions"),
      loadCollection("zones", root.api.loadServiceZones, "zones"),
      loadHomePricingData(),
    ];
    homeLoadPromise = Promise.allSettled(tasks).finally(() => {
      if (root.router?.initialized && root.state.currentRoute === "home") root.router.refresh();
    });
    return homeLoadPromise;
  }

  function bindCommerceHome(container) {
    container.querySelectorAll("[data-commerce-service]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = root.services.commerceItem(button.getAttribute("data-commerce-service"));
        if (!item) return;
        root.services.applyCommerceDraft(item.route, item);
        root.utils.routeTo(item.route);
      });
    });

    container.querySelectorAll("[data-commerce-method]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = root.services.commerceItem(button.getAttribute("data-commerce-method"));
        if (!item) return;
        root.services.applyCommerceDraft("scheduled", item);
        root.utils.routeTo("scheduled");
      });
    });
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
      if (avatar) avatar.textContent = name.slice(0, 1);
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
    updateAccountChrome,

    renderHome(container) {
      container.innerHTML = `
        <section class="screen commerce-home">
          <div class="hero home-hero">
            <div class="hero-badge">CWF Premium Air Service</div>
            <h2>เลือกบริการแอร์ที่เหมาะกับคุณ</h2>
            <p>ดูราคาเมื่อระบบคำนวณได้ เลือกคิว และติดตามสถานะงานได้ในแอปเดียว</p>
            <div class="hero-proof-row" aria-label="จุดเด่น CWF">
              <span>แจ้งราคาก่อนเริ่ม</span>
              <span>ช่างผ่านมาตรฐาน</span>
              <span>รับประกันงานล้าง 30 วัน</span>
            </div>
          </div>

          <section class="commerce-primary-cta">
            <button class="primary-btn" type="button" data-commerce-service="wall-normal">จองล้างแอร์</button>
            <button class="secondary-btn" type="button" data-route="tracking">ติดตามงาน</button>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>เลือกบริการ</h2></div>
            <div class="commerce-category-grid">
              ${root.services.commerceCategories.map((item) => `
                <button class="commerce-category-card" type="button" data-commerce-service="${root.utils.escapeHtml(item.id)}">
                  <span class="trust-ico">${root.utils.icon(item.glyph || "sparkle", 20)}</span>
                  <strong>${root.utils.escapeHtml(item.title)}</strong>
                  <span>${root.utils.escapeHtml(item.copy)}</span>
                </button>
              `).join("")}
            </div>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>บริการที่เลือกบ่อย</h2></div>
            <div class="quick-service-grid">
              ${root.services.quickServices.map((card) => `
                <button class="quick-service-card ${card.route === "urgent" ? "is-urgent" : ""}" type="button" data-commerce-service="${root.utils.escapeHtml(card.id)}">
                  <span class="quick-kicker">${root.utils.escapeHtml(card.kicker || "")}</span>
                  <strong>${root.utils.escapeHtml(card.title)}</strong>
                  <span>${root.utils.escapeHtml(card.copy)}</span>
                  <span class="quick-price">${renderQuickPrice(card)}</span>
                </button>
              `).join("")}
            </div>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>คิวด่วนสำหรับแอร์มีอาการ</h2></div>
            <div class="urgent-commerce-card">
              <p>ระบบจะส่งคำขอให้ช่างที่พร้อมรับงานพิจารณา งานจะยืนยันเมื่อมีช่างรับหรือแอดมินยืนยันแล้วเท่านั้น</p>
              <button class="secondary-btn" type="button" data-commerce-service="urgent-inspect">ส่งคำขอคิวด่วน</button>
            </div>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>โปรโมชันปัจจุบัน</h2></div>
            <div data-promotions>${renderPromotionSummary()}</div>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>เลือกระดับการล้าง</h2></div>
            <div class="method-grid">
              ${root.services.cleaningMethods.map((item) => `
                <button class="method-row" type="button" data-commerce-method="${root.utils.escapeHtml(item.title)}">
                  <strong>${root.utils.escapeHtml(item.title)}</strong>
                  <span>${root.utils.escapeHtml(item.copy)}</span>
                </button>
              `).join("")}
            </div>
          </section>

          <section class="card trust-card commerce-section">
            <div class="section-head"><h2>มาตรฐานบริการ CWF</h2></div>
            <div class="trust-grid">
              ${root.services.trustItems.map((item) => `
                <div class="trust-item">
                  <span class="trust-ico">${root.utils.icon(item.glyph || "shield", 20)}</span>
                  <strong>${root.utils.escapeHtml(item.title)}</strong>
                  <span>${root.utils.escapeHtml(item.copy)}</span>
                </div>
              `).join("")}
            </div>
          </section>

          <section class="card commerce-section">
            <div class="section-head"><h2>พื้นที่ให้บริการ</h2></div>
            <div data-zones>${renderCoverageSummary()}</div>
          </section>

          ${renderAccountShortcut()}
        </section>
      `;
      bindCommerceHome(container);
      loadHomeData();
    },

    renderBookingMode(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero booking-hero">
            <div class="hero-badge">จองบริการ</div>
            <h2>เลือกวิธีจอง</h2>
            <p>จองล่วงหน้าเพื่อเลือกเวลา หรือส่งคำขอคิวด่วนให้ช่างที่พร้อมรับงาน</p>
          </div>
          <div class="card-grid">
            <button class="mode-card is-scheduled" type="button" data-route="scheduled">
              <span class="mode-kicker">เลือกวันและเวลาได้</span>
              <strong>จองล่วงหน้า</strong>
              <span>เหมาะกับงานล้าง ติดตั้ง งานคอนโด และงานหลายเครื่อง</span>
              <span class="mode-foot">ดูคิวว่าง</span>
            </button>
            <button class="mode-card is-urgent" type="button" data-route="urgent">
              <span class="mode-kicker">ส่งคำขอให้ช่างที่พร้อม</span>
              <strong>คิวด่วน</strong>
              <span>ช่างอาจรับหรือปฏิเสธได้ตามความพร้อม งานยืนยันเมื่อมีผู้รับงานแล้ว</span>
              <span class="mode-foot">ส่งคำขอคิวด่วน</span>
            </button>
          </div>
          <div class="notice is-urgent">คิวด่วนยังไม่ถือว่ายืนยันงาน จนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
        </section>
      `;
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