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

  async function loadHomeData(container) {
    root.auth.loadCustomer(container);
    const load = async (name, fn, key) => {
      const mount = container.querySelector(`[data-${name}]`);
      root.state.setCollection(name, { status: "loading", items: [], error: "" });
      if (mount) root.router.render();
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
  }

  const ui = {
    renderHome(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero home-hero">
            <div class="hero-badge">CWF Premium Air Service</div>
            <h2>บริการแอร์ที่จองง่าย ติดตามได้ชัดเจน</h2>
            <p>เริ่มจองแบบ Guest ได้ทันที เห็นราคาประมาณการ เลือกเวลาว่าง และติดตามสถานะงานในที่เดียว</p>
            <div class="hero-proof-row" aria-label="จุดเด่น CWF">
              <span>ราคาชัดเจน</span>
              <span>ช่างผ่านการทดสอบ</span>
              <span>รับประกันงานล้าง</span>
            </div>
          </div>
          <section class="quick-actions">
            ${root.services.primaryActions.map((action, idx) => `
              <button class="action-card ${idx === 0 ? "is-primary" : ""} ${idx === 2 ? "is-accent" : ""}" type="button" data-route="${root.utils.escapeHtml(action.route)}" data-icon="${root.utils.escapeHtml(action.icon)}">
                <span class="ico-chip">${root.utils.icon(action.glyph || "sparkle", 24)}</span>
                <span class="action-text">
                  <strong>${root.utils.escapeHtml(action.title)}</strong>
                  <span>${root.utils.escapeHtml(action.copy)}</span>
                </span>
              </button>
            `).join("")}
          </section>
          <section class="card service-card">
            <div class="section-head">
              <span class="section-kicker">Services</span>
              <h2>บริการสำหรับลูกค้า</h2>
            </div>
            <div data-catalog>
              ${collectionState("catalog", "ยังไม่มีรายการบริการที่เปิดให้แสดง", (items) => `
                <div class="tag-row">
                  ${items.slice(0, 8).map((item) => `<span class="tag">${root.utils.escapeHtml(item.item_name || item.name || "-")}</span>`).join("")}
                </div>
              `)}
            </div>
          </section>
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">Smart price</span>
              <h2>โปรโมชันที่ใช้ได้</h2>
            </div>
            <div data-promotions>
              ${collectionState("promotions", "ยังไม่มีโปรโมชันสำหรับลูกค้าในตอนนี้", (items) => `
                <div class="data-list">
                  ${items.slice(0, 3).map((promo) => `
                    <div class="data-row">
                      <strong>${root.utils.escapeHtml(promo.promo_name || "-")}</strong>
                      <span class="muted">ระบบจะเลือกโปรโมชันที่เหมาะสมในหน้าประเมินราคา</span>
                    </div>
                  `).join("")}
                </div>
              `)}
            </div>
          </section>
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">Coverage</span>
              <h2>พื้นที่ให้บริการ</h2>
            </div>
            <div data-zones>
              ${collectionState("zones", "ยังไม่พบข้อมูลพื้นที่ให้บริการ", (items) => `
                <div class="tag-row">
                  ${items.slice(0, 10).map((zone) => `<span class="tag">${root.utils.escapeHtml(zone.zone_label || zone.zone_name || zone.zone_code || "-")}</span>`).join("")}
                </div>
              `)}
            </div>
          </section>
          <section class="card trust-card">
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
          ${root.auth.renderLoginPanel()}
        </section>
      `;
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
