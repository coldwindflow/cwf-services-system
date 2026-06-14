(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.tracking = {
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>ติดตามงาน</h2>
            <p>กรอกเลข Booking หรือ token เพื่อติดตามสถานะ งานจริงจะเชื่อม API ใน Phase 2</p>
          </div>
          <section class="card">
            <div class="field">
              <label for="tracking-code">เลข Booking / Token</label>
              <input id="tracking-code" class="input" placeholder="เช่น CWFXXXXXXX" disabled>
            </div>
            <div class="button-row">
              <button class="disabled-btn" type="button" disabled>Phase 2 จะเชื่อมต่อ API ติดตามงานจริง</button>
            </div>
          </section>
          <section class="card">
            <h2>Timeline งานจองล่วงหน้า</h2>
            ${root.utils.timeline([
              { title: "รับคำขอจอง", copy: "ระบบรับรายละเอียดจากลูกค้า", kind: "" },
              { title: "รอแอดมินตรวจสอบ", copy: "ยืนยันข้อมูลและจัดคิว", kind: "muted" },
              { title: "ช่างเริ่มเดินทาง", copy: "แสดงเมื่อเริ่มเดินทางจริง", kind: "muted" },
              { title: "เสร็จสิ้น / รีวิว", copy: "แสดงเอกสาร รูป และรีวิวหลังปิดงาน", kind: "muted" },
            ])}
          </section>
          <section class="card">
            <h2>Timeline คิวด่วน</h2>
            ${root.utils.timeline([
              { title: "ส่งคำขอคิวด่วน", copy: "ยังไม่ถือว่ายืนยันงาน", kind: "" },
              { title: "รอช่างพาร์ทเนอร์", copy: "พาร์ทเนอร์กำลังกดรับหรือปฏิเสธ", kind: "warning" },
              { title: "ช่างรับงาน", copy: "ยืนยันเมื่อมีพาร์ทเนอร์รับหรือแอดมินยืนยัน", kind: "muted" },
              { title: "Admin Fallback", copy: "ถ้าไม่มีพาร์ทเนอร์รับภายใน timeout", kind: "muted" },
              { title: "เปลี่ยนเป็นจองล่วงหน้า", copy: "ลูกค้าสามารถเลือกเวลาที่ว่างแทนได้", kind: "muted" },
              { title: "ยกเลิก / หมดเวลา", copy: "แสดงเมื่อคำขอหมดอายุหรือถูกยกเลิก", kind: "muted" },
            ])}
          </section>
          <section class="tracking-card">
            <h3>Technician Card Placeholder</h3>
            <p class="muted">จะแสดงชื่อ รูป ระดับ และเบอร์โทรตามกติกา tracking ใน Phase 2</p>
          </section>
          <section class="card">
            <h2>หลังจบงาน</h2>
            <div class="tag-row">
              <span class="tag">ใบเสร็จ</span>
              <span class="tag">รูปงาน</span>
              <span class="tag">รีวิว</span>
              <span class="tag">จองซ้ำ</span>
            </div>
          </section>
          ${root.ui.supportButtons()}
        </section>
      `;
    },
  };
})();
