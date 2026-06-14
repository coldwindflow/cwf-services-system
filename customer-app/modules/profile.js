(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.profile = {
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>บัญชีลูกค้า</h2>
            <p>ใช้งานแบบ Guest ได้ก่อน เมื่อล็อกอินแล้วจะช่วยจำที่อยู่ ดูประวัติ และจองซ้ำได้สะดวกขึ้น</p>
          </div>
          ${root.auth.renderLoginPanel()}
          <section class="card">
            <h2>โหมด Guest</h2>
            <p class="muted">ลูกค้าสามารถเริ่มจองและติดตามงานได้ โดยไม่ต้องเข้าสู่ระบบตั้งแต่หน้าแรก</p>
          </section>
          <section class="card">
            <h2>ที่อยู่ที่บันทึกไว้</h2>
            <p class="muted">เก็บที่อยู่และตำแหน่งหน้างานสำหรับการจองครั้งถัดไป</p>
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
