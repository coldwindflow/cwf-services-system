(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.auth = {
    renderLoginPanel() {
      return `
        <section class="card">
          <h2>บัญชีลูกค้า</h2>
          <p class="muted">เริ่มจองแบบ Guest ได้ก่อน Login ใช้สำหรับบันทึกที่อยู่ ดูประวัติ และจองซ้ำใน Phase ถัดไป</p>
          <div class="button-row">
            <button class="secondary-btn" type="button" disabled>LINE Login Placeholder</button>
            <button class="secondary-btn" type="button" disabled>Google Login Placeholder</button>
          </div>
        </section>
      `;
    },
  };
})();
