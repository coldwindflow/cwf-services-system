(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function renderTrackingResult() {
    const state = root.state.tracking;
    if (state.status === "idle") return root.utils.stateBox("", "กรอกเลขงานหรือรหัสติดตามเพื่อดูสถานะจากระบบ");
    if (state.status === "loading") return root.utils.stateBox("loading", "กำลังค้นหาสถานะงาน...");
    if (state.status === "error") return root.utils.stateBox("error", state.error || "ไม่พบข้อมูลงาน");
    const data = state.data || {};
    const tech = data.technician || {};
    const photos = Array.isArray(data.photos) ? data.photos : [];
    return `
      <div class="data-list">
        <div class="data-row">
          <strong>${root.utils.escapeHtml(data.booking_code || "ไม่พบเลขงาน")}</strong>
          <span class="muted">สถานะ: ${root.utils.escapeHtml(data.job_status || "-")}</span>
        </div>
        <div class="data-row">
          <strong>${root.utils.escapeHtml(data.job_type || "บริการ CWF")}</strong>
          <span class="muted">นัดหมาย: ${root.utils.formatDateTime(data.appointment_datetime)}</span>
        </div>
        <div class="data-row">
          <strong>ที่อยู่หน้างาน</strong>
          <span class="muted">${root.utils.escapeHtml(data.address_text || "-")}</span>
        </div>
        <div class="data-row">
          <strong>ช่างผู้ให้บริการ</strong>
          <span class="muted">${root.utils.escapeHtml(tech.full_name || tech.username || "รอการมอบหมาย")}</span>
        </div>
        <div class="data-row">
          <strong>หลังจบงาน</strong>
          <span class="muted">รูปงาน ${photos.length} รายการ ${data.receipt_url ? "และมีใบเสร็จพร้อมดู" : ""}</span>
        </div>
      </div>
    `;
  }

  async function lookup(container) {
    const input = container.querySelector("#tracking-code");
    const q = String(input.value || "").trim();
    root.state.updateDraft("tracking", { trackingCode: q });
    if (!q) {
      root.state.setTracking({ status: "error", data: null, error: "กรุณากรอกเลขงานหรือรหัสติดตาม" });
      container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
      return;
    }
    root.state.setTracking({ status: "loading", data: null, error: "" });
    container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
    try {
      const data = await root.api.trackBooking(q);
      root.state.setTracking({ status: "success", data, error: "" });
    } catch (error) {
      root.state.setTracking({ status: "error", data: null, error: error.message });
    }
    container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
  }

  root.tracking = {
    render(container) {
      const code = root.state.draft.tracking.trackingCode || "";
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>ติดตามงาน</h2>
            <p>ใส่เลขงานหรือรหัสติดตาม เพื่อดูสถานะสำคัญตั้งแต่รับคำขอจนจบงาน</p>
          </div>
          <section class="card">
            <div class="field">
              <label for="tracking-code">เลขงาน / รหัสติดตาม</label>
              <input id="tracking-code" class="input" placeholder="เช่น CWFXXXXXXX" value="${root.utils.escapeHtml(code)}">
            </div>
            <div class="button-row">
              <button class="secondary-btn" type="button" data-action="track-read">ตรวจสอบสถานะงาน</button>
            </div>
          </section>
          <section class="card">
            <h2>ผลการติดตาม</h2>
            <div data-tracking-result>${renderTrackingResult()}</div>
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
          ${root.ui.supportButtons()}
        </section>
      `;
      container.querySelector("[data-action='track-read']").addEventListener("click", () => lookup(container));
      container.querySelector("#tracking-code").addEventListener("change", (event) => {
        root.state.updateDraft("tracking", { trackingCode: event.target.value });
      });
    },
  };
})();
