(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.tracking = {
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>ติดตามงาน</h2>
            <p>ใส่เลขงานหรือรหัสติดตาม เพื่อดูสถานะสำคัญตั้งแต่รับคำขอจนจบงาน</p>
          </div>
          <section class="card">
            <div class="field">
              <label for="tracking-code">เลขงาน / รหัสติดตาม</label>
              <input id="tracking-code" class="input" placeholder="เช่น CWFXXXXXXX" disabled>
            </div>
            <div class="button-row">
              <button class="disabled-btn" type="button" disabled>ตรวจสอบสถานะงาน</button>
            </div>
          </section>
          <section class="card">
            <h2>สถานะจองล่วงหน้า</h2>
            ${root.utils.timeline([
              { title: "รับคำขอจอง", copy: "ได้รับรายละเอียดบริการและที่อยู่หน้างานแล้ว", kind: "" },
              { title: "ตรวจสอบคิว", copy: "ทีมงานตรวจสอบวันเวลาและความพร้อมของช่าง", kind: "muted" },
              { title: "ช่างเริ่มเดินทาง", copy: "แสดงเมื่อช่างออกเดินทางไปยังหน้างาน", kind: "muted" },
              { title: "จบงาน", copy: "ดูรูปงาน ใบเสร็จ รีวิว และจองซ้ำหลังบริการ", kind: "muted" },
            ])}
          </section>
          <section class="card">
            <h2>สถานะคิวด่วน</h2>
            ${root.utils.timeline([
              { title: "ส่งคำขอคิวด่วน", copy: "คำขอยังไม่ถือว่ายืนยันงาน", kind: "" },
              { title: "รอช่างพาร์ทเนอร์", copy: "พาร์ทเนอร์ช่างกำลังพิจารณารับหรือปฏิเสธงาน", kind: "warning" },
              { title: "ช่างรับงาน", copy: "ยืนยันเมื่อมีช่างรับหรือแอดมินยืนยัน", kind: "muted" },
              { title: "แอดมินช่วยต่อ", copy: "ใช้เมื่อไม่มีพาร์ทเนอร์ช่างรับในเวลาที่กำหนด", kind: "muted" },
              { title: "เปลี่ยนเป็นจองล่วงหน้า", copy: "ลูกค้าเลือกวันเวลาที่สะดวกแทนคิวด่วน", kind: "muted" },
              { title: "ยกเลิก / หมดเวลา", copy: "แสดงเมื่อคำขอหมดอายุหรือถูกยกเลิก", kind: "muted" },
            ])}
          </section>
          <section class="tracking-card">
            <h3>ข้อมูลช่างผู้ให้บริการ</h3>
            <p class="muted">เมื่อมีช่างรับงาน ลูกค้าจะเห็นข้อมูลที่จำเป็นสำหรับติดตามงานและติดต่อช่วยเหลือ</p>
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
