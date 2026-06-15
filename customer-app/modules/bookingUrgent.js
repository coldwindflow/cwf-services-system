(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  // Correct urgent flow:
  //   1) form  — customer fills request details FIRST
  //   2) review — customer reviews the urgent request summary
  //   3) waiting — ONLY after customer confirms, show partner-first waiting room
  // Partner-first = "after the customer submits the urgent request", never before.
  // Urgent has NO date/time slot selection (unlike scheduled).
  // Real urgent dispatch stays DISABLED in this round — the confirm step moves the
  // UI into a mock/skeleton waiting room and never calls a real dispatch endpoint.

  function draft() {
    return root.state.draft.urgent || {};
  }

  function setStep(step, error) {
    root.state.setUrgentFlow({ step, error: error || "" });
  }

  function serviceSummary() {
    const d = draft();
    const parts = [
      d.job_type,
      d.ac_type,
      d.btu ? `${Number(d.btu).toLocaleString("th-TH")} BTU` : "",
      `${d.machine_count || 1} เครื่อง`,
    ].filter(Boolean);
    return parts.join(" / ");
  }

  function validate() {
    const d = draft();
    const errors = [];
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
    if (!(phoneDigits.length >= 9 && phoneDigits.length <= 10)) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
    if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
    if (!String(d.symptom || "").trim()) errors.push("กรุณาบอกอาการ/สิ่งที่ต้องการให้ช่างช่วย");
    return errors;
  }

  /* ---------------- Hero (shared) ---------------- */
  function hero() {
    return `
      <div class="hero urgent-hero urgent-hero-fx">
        <div class="urgent-aurora" aria-hidden="true"></div>
        <div class="urgent-spark" aria-hidden="true"></div>
        <div class="hero-badge">Partner-first urgent request</div>
        <h2>คิวด่วน</h2>
        <p>กรอกรายละเอียดงานก่อน แล้วระบบจะส่งคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่กดรับเอง</p>
      </div>
    `;
  }

  function flowRail(active) {
    const steps = [
      { key: "form", label: "กรอกข้อมูล" },
      { key: "review", label: "ตรวจสอบ" },
      { key: "waiting", label: "รอช่างรับ" },
    ];
    const order = { form: 0, review: 1, waiting: 2 };
    const ai = order[active];
    return `
      <div class="flow-rail" aria-label="ขั้นตอนคิวด่วน">
        ${steps.map((s, i) => `
          <div class="flow-node ${i < ai ? "is-done" : ""} ${i === ai ? "is-active" : ""}">
            <span class="flow-bullet">${i < ai ? "✓" : i + 1}</span>
            <span class="flow-label">${s.label}</span>
          </div>
        `).join('<span class="flow-bar" aria-hidden="true"></span>')}
      </div>
    `;
  }

  /* ---------------- Step 1: FORM ---------------- */
  function renderForm() {
    const d = draft();
    const errs = root.state.urgentFlow.error;
    return `
      <section class="card form-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Urgent request</span>
          <h2>รายละเอียดงานด่วน</h2>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="urgent-name">ชื่อผู้ติดต่อ</label>
            <input id="urgent-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-urgent-field="customer_name" autocomplete="name" placeholder="เช่น คุณสมชาย">
          </div>
          <div class="field">
            <label for="urgent-phone">เบอร์โทร</label>
            <input id="urgent-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-urgent-field="customer_phone" inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX">
          </div>
          <div class="field">
            <label for="urgent-address">ที่อยู่หน้างาน</label>
            <textarea id="urgent-address" class="input textarea" data-urgent-field="address_text" rows="3" placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง เขต/อำเภอ">${root.utils.escapeHtml(d.address_text || "")}</textarea>
          </div>
          <div class="field">
            <label for="urgent-maps">ลิงก์แผนที่ (ถ้ามี)</label>
            <input id="urgent-maps" class="input" value="${root.utils.escapeHtml(d.maps_url || "")}" data-urgent-field="maps_url" inputmode="url" placeholder="วางลิงก์ Google Maps ถ้ามี">
          </div>
          <div class="field">
            <label for="urgent-zone">พื้นที่ / โซน (ถ้ามี)</label>
            <input id="urgent-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-urgent-field="job_zone" placeholder="เช่น สุขุมวิท อ่อนนุช ลาดพร้าว">
          </div>
        </div>
      </section>

      <section class="card form-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Service</span>
          <h2>ข้อมูลแอร์</h2>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="urgent-job-type">ประเภทบริการ</label>
            <select id="urgent-job-type" class="select" data-urgent-field="job_type">
              <option value="ล้าง" ${d.job_type === "ล้าง" ? "selected" : ""}>ล้างแอร์</option>
              <option value="ซ่อม" ${d.job_type === "ซ่อม" ? "selected" : ""}>ซ่อมแอร์</option>
              <option value="ติดตั้ง" ${d.job_type === "ติดตั้ง" ? "selected" : ""}>ติดตั้งแอร์</option>
            </select>
          </div>
          <div class="field">
            <label for="urgent-ac-type">ชนิดแอร์</label>
            <select id="urgent-ac-type" class="select" data-urgent-field="ac_type">
              <option value="ผนัง" ${d.ac_type === "ผนัง" ? "selected" : ""}>ติดผนัง</option>
              <option value="สี่ทิศ" ${d.ac_type === "สี่ทิศ" ? "selected" : ""}>สี่ทิศ</option>
              <option value="แขวน" ${d.ac_type === "แขวน" ? "selected" : ""}>แขวน</option>
            </select>
          </div>
          <div class="field">
            <label for="urgent-btu">BTU</label>
            <select id="urgent-btu" class="select" data-urgent-field="btu">
              <option value="9000" ${Number(d.btu) === 9000 ? "selected" : ""}>9,000 BTU</option>
              <option value="12000" ${Number(d.btu) === 12000 ? "selected" : ""}>12,000 BTU</option>
              <option value="18000" ${Number(d.btu) === 18000 ? "selected" : ""}>18,000 BTU</option>
              <option value="24000" ${Number(d.btu) === 24000 ? "selected" : ""}>24,000 BTU</option>
            </select>
          </div>
          <div class="field">
            <label for="urgent-count">จำนวนเครื่อง</label>
            <select id="urgent-count" class="select" data-urgent-field="machine_count">
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(d.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="urgent-symptom">อาการ / สิ่งที่ต้องการให้ช่างช่วย</label>
            <textarea id="urgent-symptom" class="input textarea" data-urgent-field="symptom" rows="3" placeholder="เช่น แอร์ไม่เย็น มีน้ำหยด เสียงดัง ต้องการให้มาด่วนวันนี้">${root.utils.escapeHtml(d.symptom || "")}</textarea>
          </div>
        </div>
      </section>

      <div class="notice is-urgent">คิวด่วนเป็นการส่งคำขอให้ช่างพาร์ทเนอร์ที่พร้อมรับงานกดรับเอง ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>

      ${errs ? `<div class="state-box is-error">${root.utils.escapeHtml(errs)}</div>` : ""}

      <div class="button-row">
        <button class="primary-btn btn-shine" type="button" data-urgent-action="to-review">ตรวจสอบคำขอคิวด่วน</button>
      </div>
    `;
  }

  /* ---------------- Step 2: REVIEW ---------------- */
  function renderReview() {
    const d = draft();
    return `
      <section class="card review-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Final check</span>
          <h2>ตรวจสอบคำขอคิวด่วน</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>อาการ</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          ${d.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone)}</span></div>` : ""}
          ${d.maps_url ? `<div class="data-row"><strong>แผนที่</strong><span class="muted">มีลิงก์แผนที่แนบ</span></div>` : ""}
        </div>
        <div class="notice is-urgent">เมื่อกดส่งคำขอ ระบบจะส่งให้พาร์ทเนอร์ช่างที่พร้อมรับงาน งานยังไม่ยืนยันจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
        <div class="button-row">
          <button class="primary-btn btn-shine" type="button" data-urgent-action="confirm">ส่งคำขอคิวด่วน</button>
          <button class="secondary-btn" type="button" data-urgent-action="back-form">กลับไปแก้ไข</button>
        </div>
      </section>
    `;
  }

  /* ---------------- Step 3: WAITING ROOM ---------------- */
  function renderWaiting() {
    const d = draft();
    return `
      <section class="card waiting-room waiting-room-fx">
        <div class="radar-wrap" aria-hidden="true">
          <div class="radar">
            <span class="radar-ping"></span>
            <span class="radar-ping d2"></span>
            <span class="radar-ping d3"></span>
            <span class="radar-sweep"></span>
            <span class="radar-core">⚡</span>
            <span class="radar-blip b1"></span>
            <span class="radar-blip b2"></span>
            <span class="radar-blip b3"></span>
          </div>
        </div>
        <div class="waiting-status">
          <div class="pulse-row">
            <span class="pulse-dot" aria-hidden="true"></span>
            <span>กำลังส่งคำขอหาช่างพาร์ทเนอร์ที่พร้อมรับงานในพื้นที่</span>
          </div>
          <div class="notice is-urgent">ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Request</span>
          <h2>สรุปคำขอที่ส่ง</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>อาการ</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Live status</span>
          <h2>สถานะคำขอ</h2>
        </div>
        <div class="status-stack">
          <div class="status-line is-active">
            <span class="status-ic">📨</span>
            <div><strong>ส่งคำขอแล้ว</strong><span>ระบบกระจายคำขอให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่</span></div>
          </div>
          <div class="status-line is-pending">
            <span class="status-ic">🔔</span>
            <div><strong>รอช่างพาร์ทเนอร์กดรับ</strong><span>ช่างอาจกดรับหรือปฏิเสธงานได้ตามความพร้อม</span></div>
          </div>
          <div class="status-line">
            <span class="status-ic">🛟</span>
            <div><strong>แอดมินช่วยต่อ</strong><span>หากไม่มีช่างรับในเวลา แอดมินจะช่วยดูทางเลือกให้</span></div>
          </div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Next best action</span>
          <h2>ทางเลือกเมื่อยังไม่มีช่างรับ</h2>
        </div>
        <div class="button-row">
          <button class="secondary-btn" type="button" disabled>ให้แอดมินช่วยจัดคิว</button>
          <button class="secondary-btn" type="button" data-urgent-action="to-scheduled">เปลี่ยนเป็นจองล่วงหน้า</button>
        </div>
      </section>

      <div class="sticky-action">
        <button class="disabled-btn" type="button" disabled>ระบบส่งคำขอจริงยังไม่เปิดในรอบนี้</button>
        <p class="muted">นี่คือหน้าสถานะตัวอย่าง ยังไม่ส่ง dispatch จริง และไม่ยืนยันงานก่อนช่างรับหรือแอดมินยืนยัน</p>
        <button class="secondary-btn" type="button" data-urgent-action="new-request">เริ่มคำขอใหม่</button>
      </div>
    `;
  }

  function body() {
    const step = root.state.urgentFlow.step || "form";
    if (step === "review") return renderReview();
    if (step === "waiting") return renderWaiting();
    return renderForm();
  }

  function paint(container) {
    const step = root.state.urgentFlow.step || "form";
    container.innerHTML = `
      <section class="screen urgent-screen" data-urgent-step="${step}">
        ${hero()}
        ${flowRail(step)}
        <div class="urgent-body" data-urgent-body>${body()}</div>
      </section>
    `;
    bind(container);
  }

  function bind(container) {
    // field inputs
    container.querySelectorAll("[data-urgent-field]").forEach((el) => {
      const handler = () => {
        const patch = {};
        patch[el.getAttribute("data-urgent-field")] = el.value;
        root.state.updateDraft("urgent", patch);
        if (root.state.urgentFlow.error) root.state.setUrgentFlow({ error: "" });
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });

    // actions
    container.querySelectorAll("[data-urgent-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-urgent-action");
        if (action === "to-review") {
          const errors = validate();
          if (errors.length) { setStep("form", errors[0]); paint(container); return; }
          setStep("review");
          paint(container);
        } else if (action === "back-form") {
          setStep("form");
          paint(container);
        } else if (action === "confirm") {
          // No real dispatch — move to mock/skeleton waiting room only.
          setStep("waiting");
          paint(container);
        } else if (action === "new-request") {
          setStep("form");
          paint(container);
        } else if (action === "to-scheduled") {
          root.utils.routeTo("scheduled");
        }
      });
    });
  }

  root.bookingUrgent = {
    render(container) {
      // Fresh entry to the urgent screen always starts at the form step.
      // Intra-flow transitions (review/waiting) happen via paint(), not render(),
      // so this reset only fires when the customer navigates into คิวด่วน.
      setStep("form");
      root.state.setUrgentFlow({ error: "" });
      paint(container);
    },
  };
})();
