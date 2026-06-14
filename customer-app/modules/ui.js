(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const ui = {
    renderHome(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>บริการแอร์ที่จองง่ายและติดตามได้ชัดเจน</h2>
            <p>เริ่มจองได้ทันทีแบบ Guest แล้วค่อย Login เพื่อบันทึกที่อยู่และประวัติภายหลัง</p>
          </div>
          <section class="quick-actions">
            ${root.services.primaryActions.map((action) => `
              <button class="action-card" type="button" data-route="${root.utils.escapeHtml(action.route)}">
                <strong>${root.utils.escapeHtml(action.title)}</strong>
                <span>${root.utils.escapeHtml(action.copy)}</span>
              </button>
            `).join("")}
          </section>
          <section class="card">
            <h2>เลือกวิธีจอง</h2>
            <p class="muted">จองล่วงหน้าสำหรับงานวางแผนได้ หรือส่งคำขอคิวด่วนให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง</p>
          </section>
          ${root.auth.renderLoginPanel()}
        </section>
      `;
    },
    renderBookingMode(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>จองบริการ</h2>
            <p>เลือกโหมดที่เหมาะกับสถานการณ์ของคุณ</p>
          </div>
          <div class="card-grid">
            <button class="mode-card is-scheduled" type="button" data-route="scheduled">
              <strong>จองล่วงหน้า</strong>
              <span>เลือกวันและเวลาที่มีช่างว่าง</span>
            </button>
            <button class="mode-card is-urgent" type="button" data-route="urgent">
              <strong>คิวด่วน</strong>
              <span>ส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง ช่างรับหรือไม่รับก็ได้</span>
            </button>
          </div>
          <div class="notice is-urgent">คิวด่วนยังไม่ถือว่ายืนยันงาน จนกว่าจะมีช่างพาร์ทเนอร์กดรับ หรือแอดมินยืนยัน</div>
        </section>
      `;
    },
    supportButtons() {
      return `
        <section class="card">
          <h2>ติดต่อ CWF</h2>
          <div class="support-strip">
            <button class="secondary-btn" type="button" disabled>โทรหา CWF</button>
            <button class="secondary-btn" type="button" disabled>LINE @cwfair</button>
          </div>
        </section>
      `;
    },
  };

  root.ui = ui;
})();
