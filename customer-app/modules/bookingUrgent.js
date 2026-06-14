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
    // Phase 2A must not implement real urgent dispatch.
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>คิวด่วน</h2>
            <p>ส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่กดรับเอง ช่างสามารถรับหรือปฏิเสธได้</p>
          </div>
          <div class="notice is-urgent">คิวด่วนยังไม่ถือว่ายืนยันงาน จนกว่าจะมีช่างพาร์ทเนอร์กดรับ หรือแอดมินยืนยัน</div>
          <section class="card">
            <h2>ขั้นตอนคิวด่วน</h2>
            ${root.utils.stepCards(root.services.urgentSteps)}
          </section>
          <section class="card waiting-room">
            <h2>Waiting Room คิวด่วน</h2>
            <div class="waiting-status">
              <div class="pulse-row">
                <span class="pulse-dot" aria-hidden="true"></span>
                <span>กำลังรอพาร์ทเนอร์ช่างตอบรับ</span>
              </div>
              <div class="notice is-urgent">ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
            </div>
            <div class="status-grid">
              <div class="status-pill">
                <strong>กำลังส่งคำขอ</strong>
                <span>ระบบเตรียมส่งให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่</span>
              </div>
              <div class="status-pill">
                <strong>รอช่างพาร์ทเนอร์</strong>
                <span>ช่างอาจกดรับหรือปฏิเสธงานได้ตามความพร้อม</span>
              </div>
              <div class="status-pill">
                <strong>แอดมินช่วยต่อ</strong>
                <span>หากไม่มีช่างรับในเวลา แอดมินจะช่วยดูทางเลือกให้</span>
              </div>
              <div class="status-pill">
                <strong>เปลี่ยนเป็นจองล่วงหน้า</strong>
                <span>ลูกค้าสามารถเลือกวันเวลาที่สะดวกแทนคิวด่วนได้</span>
              </div>
            </div>
          </section>
          <section class="card">
            <h2>ทางเลือกเมื่อยังไม่มีช่างรับ</h2>
            <div class="button-row">
              <button class="secondary-btn" type="button" disabled>ให้แอดมินช่วยจัดคิว</button>
              <button class="secondary-btn" type="button" disabled>เปลี่ยนเป็นจองล่วงหน้า</button>
            </div>
          </section>
          <div class="sticky-action">
            <button class="disabled-btn" type="button" disabled>ขั้นตอนนี้จะเชื่อมต่อกับระบบคิวด่วนจริงในรอบถัดไป</button>
            <p class="muted">หน้านี้ยังไม่ส่งคำขอจริง และไม่ยืนยันงานก่อนช่างรับหรือแอดมินยืนยัน</p>
          </div>
        </section>
      `;
    },
  };
})();
