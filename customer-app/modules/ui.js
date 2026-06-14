(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const ui = {
    renderHome(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>บริการแอร์ที่จองง่าย ติดตามได้ชัดเจน</h2>
            <p>เริ่มจองได้ทันทีแบบ Guest แล้วค่อยเข้าสู่บัญชีเพื่อบันทึกที่อยู่ ประวัติ และจองซ้ำภายหลัง</p>
          </div>
          <section class="quick-actions">
            ${root.services.primaryActions.map((action) => `
              <button class="action-card" type="button" data-route="${root.utils.escapeHtml(action.route)}" data-icon="${root.utils.escapeHtml(action.icon)}">
                <strong>${root.utils.escapeHtml(action.title)}</strong>
                <span>${root.utils.escapeHtml(action.copy)}</span>
              </button>
            `).join("")}
          </section>
          <section class="card">
            <h2>เลือกวิธีจองให้เหมาะกับงาน</h2>
            <p class="muted">จองล่วงหน้าสำหรับงานที่วางแผนได้ หรือส่งคำขอคิวด่วนให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง</p>
          </section>
          <section class="card">
            <h2>ทำไมลูกค้าเลือก CWF</h2>
            <div class="trust-grid">
              ${root.services.trustItems.map((item) => `
                <div class="trust-item">
                  <strong>${root.utils.escapeHtml(item.title)}</strong>
                  <span>${root.utils.escapeHtml(item.copy)}</span>
                </div>
              `).join("")}
            </div>
          </section>
          ${root.auth.renderLoginPanel()}
        </section>
      `;
    },
    renderBookingMode(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>จองคิวบริการ</h2>
            <p>เลือกวิธีจองที่ตรงกับความเร่งด่วนของคุณ</p>
          </div>
          <div class="card-grid">
            <button class="mode-card is-scheduled" type="button" data-route="scheduled">
              <strong>จองล่วงหน้า</strong>
              <span>เลือกวันเวลาที่สะดวก เหมาะกับงานล้างแอร์ งานคอนโด หรืองานหลายเครื่อง</span>
            </button>
            <button class="mode-card is-urgent" type="button" data-route="urgent">
              <strong>คิวด่วน</strong>
              <span>ส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง ช่างอาจรับหรือไม่รับก็ได้</span>
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
