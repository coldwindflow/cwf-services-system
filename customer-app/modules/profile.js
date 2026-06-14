(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.profile = {
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>โปรไฟล์ลูกค้า</h2>
            <p>ใช้แบบ Guest ได้ก่อน Login จะช่วยจำที่อยู่ ประวัติ และจองซ้ำใน Phase ถัดไป</p>
          </div>
          ${root.auth.renderLoginPanel()}
          <section class="card">
            <h2>ที่อยู่ที่บันทึกไว้</h2>
            <p class="muted">Placeholder สำหรับที่อยู่ แผนที่ และข้อมูลติดต่อ</p>
          </section>
          <section class="card">
            <h2>ประวัติและจองซ้ำ</h2>
            <div class="tag-row">
              <span class="tag">งานล่าสุด</span>
              <span class="tag">จองซ้ำ</span>
              <span class="tag">บริการที่ใช้บ่อย</span>
            </div>
          </section>
          ${root.ui.supportButtons()}
        </section>
      `;
    },
  };
})();
