(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function collectionState(name, emptyText, renderItems) {
    const bucket = root.state[name] || { status: "idle", items: [], error: "" };
    if (bucket.status === "loading") return root.utils.stateBox("loading", "กำลังโหลดข้อมูล...");
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
    if (state.status === "loading" && (!item || item.status === "loading")) return `<span class="price-text">กำลังประเมินราคา...</span>`;
    if (!item || item.status === "idle") return `<span class="price-text is-estimate">แตะเพื่อเลือกบริการ</span>`;
    if (item.status === "error" || !item.data) return `<span class="price-text is-estimate">ให้แอดมินประเมินราคา</span>`;
    const price = priceFromPreview(item.data);
    if (!price) return `<span class="price-text is-estimate">ให้แอดมินประเมินราคา</span>`;
    return `
      <span class="price-text">${root.utils.formatBaht(price)}</span>
      ${item.data.promo ? `<span class="promo-chip">มีโปรที่ใช้ได้</span>` : ""}
    `;
  }

  function renderCatalogSummary() {
    return collectionState("catalog", "ยังไม่มีรายการบริการที่เปิดให้แสดง", (items) => `
      <div class="tag-row commerce-tags">
        ${items.slice(0, 8).map((item) => `<span class="tag">${root.utils.escapeHtml(item.item_name || item.name || "-")}</span>`).join("")}
      </div>
    `);
  }

  function renderPromotionSummary() {
    return collectionState("promotions", "ยังไม่มีโปรโมชันสำหรับลูกค้าในตอนนี้ ระบบจะคำนวณโปรที่ใช้ได้ให้อัตโนมัติเมื่อประเมินราคา", (items) => `
      <div class="commerce-list">
        ${items.slice(0, 3).map((promo) => `
          <div class="commerce-list-row">
            <strong>${root.utils.escapeHtml(promo.promo_name || "-")}</strong>
            <span>ระบบจะเลือกโปรที่ตรงเงื่อนไขในหน้าประเมินราคา</span>
          </div>
        `).join("")}
      </div>
    `);
  }

  function renderCoverageSummary() {
    return collectionState("zones", "ยังไม่พบข้อมูลพื้นที่ให้บริการ", (items) => `
      <div class="tag-row commerce-tags">
        ${items.slice(0, 10).map((zone) => `<span class="tag">${root.utils.escapeHtml(zone.zone_label || zone.zone_name || zone.zone_code || "-")}</span>`).join("")}
      </div>
    `);
  }

  function renderAccountShortcut() {
    const customer = root.state.customer;
    if (!customer) {
      return `
        <section class="card account-shortcut">
          <span class="section-kicker">Account</span>
          <h2>กำลังตรวจสอบบัญชี...</h2>
          <p class="muted">ยังเลือกบริการและจองแบบ Guest ได้ทันที</p>
        </section>
      `;
    }
    if (!customer.logged_in) {
      return `
        <section class="card account-shortcut">
          <span class="section-kicker">Account</span>
          <h2>จองแบบ Guest ได้เลย</h2>
          <p class="muted">ล็อกอินเมื่อต้องการบันทึกที่อยู่ ดูประวัติ และจองซ้ำได้สะดวกขึ้น</p>
          <button class="secondary-btn" type="button" data-route="profile">เข้าสู่ระบบ / ดูบัญชี</button>
        </section>
      `;
    }
    const profile = customer.profile || {};
    const displayName = customer.display_name || profile.display_name || "ลูกค้า CWF";
    const hasAddress = String(profile.address || "").trim();
    return `
      <section class="card account-shortcut">
        <span class="section-kicker">Account</span>
        <h2>สวัสดี ${root.utils.escapeHtml(displayName)}</h2>
        <p class="muted">${hasAddress ? "มีที่อยู่บันทึกไว้ พร้อมเติมให้อัตโนมัติเมื่อเริ่มจอง" : "ยังไม่มีที่อยู่บันทึกไว้ เพิ่มครั้งเดียวแล้วใช้จองครั้งถัดไปได้เร็วขึ้น"}</p>
        <button class="secondary-btn" type="button" data-route="profile">${hasAddress ? "จัดการที่อยู่" : "เพิ่มที่อยู่"}</button>
      </section>
    `;
  }

  async function loadHomePricing() {
    if (root.state.homePricing.status !== "idle") return;
    const items = {};
    root.services.quickServices.forEach((card) => {
      if (card.priceable) items[card.id] = { status: "loading", data: null, error: "" };
    });
    root.state.setHomePricing({ status: "loading", items, error: "" });
    if (root.state.currentRoute === "home") root.router.render();
    const entries = await Promise.all(root.services.quickServices.filter((card) => card.priceable).map(async (card) => {
      const payload = root.services.payloadFromServiceDraft(card.draft);
      if (!payload) return [card.id, { status: "error", data: null, error: "ADMIN_ESTIMATE" }];
      try {
        const data = await root.api.previewPricing(payload);
        return [card.id, { status: "success", data, error: "" }];
      } catch (error) {
        return [card.id, { status: "error", data: null, error: error.message || "PRICE_UNAVAILABLE" }];
      }
    }));
    root.state.setHomePricing({ status: "success", items: Object.fromEntries(entries), error: "" });
    if (root.state.currentRoute === "home") root.router.render();
  }

  async function loadHomeData(container) {
    const hadCustomer = !!root.state.customer;
    root.auth.loadCustomer(container).then(() => {
      if (!hadCustomer && root.state.currentRoute === "home") root.router.render();
    });
    const load = async (name, fn, key) => {
      root.state.setCollection(name, { status: "loading", items: [], error: "" });
      if (root.state.currentRoute === "home") root.router.render();
      try {
        const data = await fn();
        root.state.setCollection(name, {
          status: "success",
          items: root.utils.normalizeList(data, key),
          error: "",
        });
      } catch (error) {
        root.state.setCollection(name, { status: "error", items: [], error: error.message });
      }
      if (root.state.currentRoute === "home") root.router.render();
    };

    if (root.state.catalog.status === "idle") load("catalog", root.api.loadCatalogItems, "items");
    if (root.state.promotions.status === "idle") load("promotions", root.api.loadPromotions, "promotions");
    if (root.state.zones.status === "idle") load("zones", root.api.loadServiceZones, "zones");
    loadHomePricing();
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

  const ui = {
    renderHome(container) {
      container.innerHTML = `
        <section class="screen commerce-home">
          <div class="hero home-hero">
            <div class="hero-badge">CWF Premium Air Service</div>
            <h2>เลือกบริการแอร์ จองง่าย และติดตามงานได้ในที่เดียว</h2>
            <p>เริ่มจากบริการที่ต้องการ ดูราคาจากระบบเมื่อข้อมูลพร้อม แล้วส่งคำขอจองหรือคิวด่วนโดยไม่ต้องล็อกอินก่อน</p>
            <div class="hero-proof-row" aria-label="จุดเด่น CWF">
              <span>ราคาจากระบบจริง</span>
              <span>ช่างผ่านมาตรฐาน</span>
              <span>รองรับ Guest booking</span>
            </div>
          </div>

          <section class="commerce-primary-cta">
            <button class="primary-btn" type="button" data-commerce-service="wall-normal">จองล้างแอร์ยอดนิยม</button>
            <button class="secondary-btn" type="button" data-route="tracking">ติดตามงาน</button>
          </section>

          <section class="card commerce-section">
            <div class="section-head">
              <span class="section-kicker">Services</span>
              <h2>เลือกหมวดบริการ</h2>
            </div>
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
            <div class="section-head">
              <span class="section-kicker">Quick book</span>
              <h2>บริการที่ลูกค้าเลือกบ่อย</h2>
            </div>
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
            <div class="section-head">
              <span class="section-kicker">Urgent</span>
              <h2>ต้องการให้ช่วยดูอาการเร็ว</h2>
            </div>
            <div class="urgent-commerce-card">
              <p>คิวด่วนเป็นการส่งคำขอให้ช่างพาร์ทเนอร์หรือแอดมินช่วยตรวจสอบก่อน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</p>
              <button class="secondary-btn" type="button" data-commerce-service="urgent-inspect">เริ่มคำขอคิวด่วน</button>
            </div>
          </section>

          <section class="card commerce-section">
            <div class="section-head">
              <span class="section-kicker">Promotions</span>
              <h2>โปรโมชันที่เปิดใช้งาน</h2>
            </div>
            <div data-promotions>${renderPromotionSummary()}</div>
          </section>

          <section class="card commerce-section">
            <div class="section-head">
              <span class="section-kicker">Cleaning methods</span>
              <h2>วิธีล้างแอร์ผนัง 4 แบบ</h2>
            </div>
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
            <div class="section-head">
              <span class="section-kicker">Trust</span>
              <h2>ทำไมลูกค้าเลือก CWF</h2>
            </div>
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
            <div class="section-head">
              <span class="section-kicker">Coverage</span>
              <h2>พื้นที่ให้บริการ</h2>
            </div>
            <div data-zones>${renderCoverageSummary()}</div>
          </section>

          <section class="card commerce-section">
            <div class="section-head">
              <span class="section-kicker">Catalog</span>
              <h2>รายการบริการในระบบ</h2>
            </div>
            <div data-catalog>${renderCatalogSummary()}</div>
          </section>

          ${renderAccountShortcut()}
        </section>
      `;
      bindCommerceHome(container);
      loadHomeData(container);
    },
    renderBookingMode(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero booking-hero">
            <div class="hero-badge">เลือกวิธีจอง</div>
            <h2>จองคิวบริการ</h2>
            <p>เลือกแบบที่เหมาะกับสถานการณ์ของคุณ ภายในไม่กี่วินาที</p>
          </div>
          <div class="card-grid">
            <button class="mode-card is-scheduled" type="button" data-route="scheduled">
              <span class="mode-kicker">เหมาะกับงานวางแผน</span>
              <strong>จองล่วงหน้า</strong>
              <span>เลือกวันเวลาที่สะดวกจากคิวช่างที่ว่าง เหมาะกับงานล้างแอร์ คอนโด หรืองานหลายเครื่อง</span>
              <span class="mode-foot">เลือกวันและเวลาเอง</span>
            </button>
            <button class="mode-card is-urgent" type="button" data-route="urgent">
              <span class="mode-kicker">ต้องการให้ช่างตอบรับเร็ว</span>
              <strong>คิวด่วน</strong>
              <span>ส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง ช่างอาจรับหรือไม่รับก็ได้</span>
              <span class="mode-foot">รอพาร์ทเนอร์กดรับ</span>
            </button>
          </div>
          <div class="notice is-urgent">คิวด่วนยังไม่ถือว่ายืนยันงาน จนกว่าจะมีช่างพาร์ทเนอร์กดรับ หรือแอดมินยืนยัน</div>
        </section>
      `;
    },
    supportButtons() {
      return `
        <section class="card">
          <h2>ต้องการความช่วยเหลือ</h2>
          <div class="support-strip">
            <button class="secondary-btn" type="button" disabled>โทรหา CWF</button>
            <button class="secondary-btn" type="button" disabled>LINE หา CWF</button>
          </div>
        </section>
      `;
    },
  };

  root.ui = ui;
})();
