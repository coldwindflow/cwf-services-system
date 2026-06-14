(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.bookingUrgent = {
    // Partner-first urgent rules:
    // 1. Send urgent request to ready approved partner technicians first.
    // 2. Partners may accept or decline.
    // 3. If no partner accepts within timeout, go to Admin Fallback.
    // 4. Admin may help, convert to scheduled booking, or assign company technician manually.
    // 5. Company technicians are not automatic first-round urgent dispatch.
    // Phase 1 must not implement real urgent dispatch.
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>คิวด่วน</h2>
            <p>ส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานกดรับเอง ช่างรับหรือไม่รับก็ได้</p>
          </div>
          <div class="notice is-urgent">คิวด่วนยังไม่ถือว่ายืนยันงาน จนกว่าจะมีช่างพาร์ทเนอร์กดรับ หรือแอดมินยืนยัน</div>
          <section class="card">
            <h2>ขั้นตอนคิวด่วน</h2>
            ${root.utils.stepCards(root.services.urgentSteps)}
          </section>
          <section class="card">
            <h2>Waiting Room</h2>
            <div class="notice is-urgent">ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
            ${root.utils.timeline([
              { title: "ส่งคำขอแล้ว", copy: "ระบบเตรียมส่งให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่", kind: "" },
              { title: "รอช่างพาร์ทเนอร์", copy: "พาร์ทเนอร์อาจกดรับหรือปฏิเสธได้", kind: "warning" },
              { title: "Timeout", copy: "Phase 2/4 จะเชื่อมเวลานับถอยหลังจาก backend", kind: "muted" },
              { title: "Admin Fallback", copy: "ถ้าไม่มีพาร์ทเนอร์รับ แอดมินช่วยต่อคิวหรือแปลงเป็นจองล่วงหน้า", kind: "muted" },
            ])}
          </section>
          <section class="card">
            <h2>ทางเลือกหลัง Timeout</h2>
            <div class="button-row">
              <button class="secondary-btn" type="button" disabled>ให้แอดมินช่วยจัดคิว</button>
              <button class="secondary-btn" type="button" disabled>เปลี่ยนเป็นจองล่วงหน้า</button>
            </div>
          </section>
          <div class="sticky-action">
            <button class="disabled-btn" type="button" disabled>Phase 1 ยังไม่ส่งคำขอคิวด่วนจริง</button>
            <p class="muted">ไม่มีการแตะ urgent dispatch logic ใน Phase นี้</p>
          </div>
        </section>
      `;
    },
  };
})();
