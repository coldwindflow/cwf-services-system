(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.bookingScheduled = {
    // Scheduled booking rule:
    // Customer selects date/time from real technician availability in Phase 2.
    // Phase 1.1 must not call /public/book or mutate production booking data.
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>จองล่วงหน้า</h2>
            <p>เลือกวันและเวลาที่สะดวก เหมาะกับงานล้างแอร์ งานคอนโด และงานหลายเครื่องที่วางแผนได้</p>
          </div>
          <section class="card">
            <h2>ขั้นตอนการจอง</h2>
            ${root.utils.stepCards(root.services.scheduledSteps)}
          </section>
          <section class="card">
            <h2>ข้อมูลที่ใช้ประเมินงาน</h2>
            <div class="tag-row">
              <span class="tag">ประเภทงาน</span>
              <span class="tag">BTU</span>
              <span class="tag">จำนวนเครื่อง</span>
              <span class="tag">ตำแหน่งหน้างาน</span>
              <span class="tag">วันและเวลา</span>
            </div>
          </section>
          <div class="sticky-action">
            <button class="disabled-btn" type="button" disabled>ขั้นตอนนี้จะเชื่อมต่อกับระบบจองจริงในรอบถัดไป</button>
            <p class="muted">ตอนนี้เป็นหน้าตัวอย่างสำหรับตรวจประสบการณ์ลูกค้า ยังไม่ส่งข้อมูลเข้าระบบจริง</p>
          </div>
        </section>
      `;
    },
  };
})();
