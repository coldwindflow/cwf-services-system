(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.auth = {
    renderLoginPanel() {
      return `
        <section class="card">
          <h2>บัญชีลูกค้า</h2>
          <p class="muted">เริ่มจองแบบ Guest ได้ก่อน เข้าสู่บัญชีเมื่อพร้อมเพื่อบันทึกที่อยู่ ดูประวัติ และจองซ้ำได้เร็วขึ้น</p>
          <div class="button-row">
            <button class="secondary-btn" type="button" disabled>เข้าสู่ระบบด้วย LINE</button>
            <button class="secondary-btn" type="button" disabled>เข้าสู่ระบบด้วย Google</button>
          </div>
        </section>
      `;
    },
  };
})();
