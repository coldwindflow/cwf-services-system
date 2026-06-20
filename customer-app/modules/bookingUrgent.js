(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  // Correct urgent flow:
  //   1) form - customer fills request details FIRST
  //   2) review - customer reviews the urgent request summary
  //   3) waiting - ONLY after customer confirms, show partner-first waiting room
  // Partner-first = after the customer submits the urgent request, never before.
  // Urgent has NO date/time slot selection and NO real dispatch in this round.

  function draft() {
    return root.state.draft.urgent || {};
  }

  function service() {
    return root.services.normalizeServiceDraft(draft());
  }

  function setStep(step, error) {
    root.state.setUrgentFlow({ step, error: error || "" });
  }

  function serviceSummary() {
    return root.services.serviceLabel(service());
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function nextUrgentAppointmentIso() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(Date.now() + 30 * 60 * 1000)).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    let year = Number(parts.year);
    let month = Number(parts.month);
    let day = Number(parts.day);
    let hour = Number(parts.hour);
    let minute = Math.ceil(Number(parts.minute || 0) / 30) * 30;
    if (minute >= 60) {
      hour += 1;
      minute = 0;
    }
    if (hour < 9) {
      hour = 9;
      minute = 0;
    } else if (hour >= 18) {
      const next = new Date(Date.UTC(year, month - 1, day + 1, 2, 0, 0));
      const nextParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(next).reduce((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});
      year = Number(nextParts.year);
      month = Number(nextParts.month);
      day = Number(nextParts.day);
      hour = 9;
      minute = 0;
    }
    return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+07:00`;
  }

  function buildSubmitPayload() {
    const d = draft();
    const s = service();
    return {
      customer_name: String(d.customer_name || "").trim(),
      customer_phone: String(d.customer_phone || "").trim(),
      appointment_datetime: nextUrgentAppointmentIso(),
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      job_zone: String(d.job_zone || "").trim(),
      customer_note: String(d.symptom || "").trim(),
      booking_mode: "urgent",
      client_app: "customer_app_v2",
      job_type: s.job_type,
      ac_type: s.ac_type,
      btu: s.btu || 0,
      machine_count: s.machine_count || 1,
      wash_variant: s.wash_variant || "",
      repair_variant: s.repair_variant || "",
      services: [{
        job_type: s.job_type,
        ac_type: s.ac_type,
        btu: s.btu || 0,
        machine_count: s.machine_count || 1,
        wash_variant: s.wash_variant || "",
        repair_variant: s.repair_variant || "",
      }],
    };
  }

  function renderChoiceGroup(field, options, selected, extraClass) {
    return `
      <div class="choice-grid ${extraClass || ""}">
        ${options.map((option) => {
          const active = String(selected || "") === String(option.value);
          return `
            <button class="choice-card ${active ? "is-selected" : ""}" type="button" data-urgent-choice="${field}" data-choice-value="${root.utils.escapeHtml(option.value)}">
              <strong>${root.utils.escapeHtml(option.label)}</strong>
              ${option.copy ? `<span>${root.utils.escapeHtml(option.copy)}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderServiceFields() {
    const d = draft();
    const s = service();
    return `
      <div class="field field-wide">
        <label>ประเภทบริการ</label>
        ${renderChoiceGroup("service_kind", root.services.serviceKinds, s.service_kind, "service-kind-grid")}
      </div>
      <div class="field field-wide">
        <label>ชนิดแอร์</label>
        ${renderChoiceGroup("ac_type", root.services.acTypes, s.ac_type, "ac-type-grid")}
      </div>
      ${s.job_type === "ล้าง" && s.ac_type === "ผนัง" ? `
        <div class="field field-wide">
          <label>รูปแบบการล้างแอร์ผนัง</label>
          ${renderChoiceGroup("wash_variant", root.services.washVariants, s.wash_variant || d.wash_variant, "wash-variant-grid")}
        </div>
      ` : ""}
      ${s.job_type === "ล้าง" && s.ac_type !== "ผนัง" && s.ac_type !== root.services.UNKNOWN_AC ? `
        <div class="field field-wide">
          ${root.utils.stateBox("", "แอร์ชนิดนี้ไม่ต้องเลือก 4 แบบล้างของแอร์ผนัง พาร์ทเนอร์ช่างจะเห็นชนิดแอร์จากคำขอ")}
        </div>
      ` : ""}
      ${s.job_type === "ซ่อม" && s.service_kind !== "inspect" ? `
        <div class="field field-wide">
          <label>รายละเอียดงานซ่อม</label>
          ${renderChoiceGroup("repair_variant", root.services.repairVariants, s.repair_variant || d.repair_variant, "compact-choice-grid")}
        </div>
      ` : ""}
      ${s.service_kind === "inspect" ? `
        <div class="field field-wide">
          ${root.utils.stateBox("", "คำขอนี้จะบันทึกเป็นงานซ่อมแบบตรวจอาการเพื่อให้แอดมินและช่างช่วยประเมินต่อ")}
        </div>
      ` : ""}
      <div class="field field-wide">
        <label>BTU</label>
        ${renderChoiceGroup("btu", root.services.btuOptions, s.btu_value || d.btu, "btu-choice-grid")}
      </div>
      <div class="field">
        <label for="urgent-count">จำนวนเครื่อง</label>
        <select id="urgent-count" class="select" data-urgent-field="machine_count">
          ${root.services.machineCounts.map((n) => `<option value="${n}" ${Number(s.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
        </select>
      </div>
    `;
  }

  function validate() {
    const d = draft();
    const s = service();
    const errors = [];
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
    if (!(phoneDigits.length >= 9 && phoneDigits.length <= 10)) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
    if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
    if (!s.job_type) errors.push("กรุณาเลือกประเภทบริการ");
    if (!s.ac_type) errors.push("กรุณาเลือกชนิดแอร์");
    if (!s.machine_count || s.machine_count < 1) errors.push("จำนวนเครื่องต้องมากกว่า 0");
    if (s.job_type === "ล้าง" && s.ac_type === "ผนัง" && !s.wash_variant) errors.push("กรุณาเลือกประเภทการล้าง");
    if (s.job_type === "ซ่อม" && !s.repair_variant) errors.push("กรุณาเลือกประเภทงานซ่อม");
    if (!String(d.symptom || "").trim()) errors.push("กรุณาบอกอาการ/สิ่งที่ต้องการให้ช่างช่วย");
    return errors;
  }

  function hero() {
    return `
      <div class="hero urgent-hero urgent-hero-fx">
        <div class="urgent-aurora" aria-hidden="true"></div>
        <div class="urgent-spark" aria-hidden="true"></div>
        <div class="hero-badge">Partner-first urgent request</div>
        <h2>คิวด่วน</h2>
        <p>กรอกรายละเอียดงานก่อน แล้วระบบจะแสดงคำขอสำหรับพาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่กดรับเอง</p>
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
        ${steps.map((step, index) => `
          <div class="flow-node ${index < ai ? "is-done" : ""} ${index === ai ? "is-active" : ""}">
            <span class="flow-bullet">${index < ai ? "✓" : index + 1}</span>
            <span class="flow-label">${step.label}</span>
          </div>
        `).join('<span class="flow-bar" aria-hidden="true"></span>')}
      </div>
    `;
  }

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
        <div class="form-grid service-taxonomy-grid">
          ${renderServiceFields()}
          <div class="field field-wide">
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

  function renderReview() {
    const d = draft();
    const s = service();
    const flow = root.state.urgentFlow || {};
    const submitting = flow.status === "submitting";
    return `
      <section class="card review-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Final check</span>
          <h2>ตรวจสอบคำขอคิวด่วน</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>ราคา</strong><span class="muted">${s.needs_admin_estimate ? "ให้แอดมินประเมินราคา" : "ยังไม่ยืนยันราคาในคิวด่วน"}</span></div>
          <div class="data-row"><strong>อาการ</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          ${d.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone)}</span></div>` : ""}
          ${d.maps_url ? `<div class="data-row"><strong>แผนที่</strong><span class="muted">มีลิงก์แผนที่แนบ</span></div>` : ""}
        </div>
        <div class="notice is-urgent">เมื่อกดส่งคำขอ ระบบจะแสดง Waiting Room สำหรับคิวด่วน งานยังไม่ยืนยันจนกว่าจะมีช่างพาร์ทเนอร์รับหรือแอดมินยืนยัน</div>
        ${flow.error ? `<div class="state-box is-error">${root.utils.escapeHtml(flow.error)}</div>` : ""}
        <div class="button-row">
          <button class="primary-btn btn-shine" type="button" data-urgent-action="confirm" ${submitting ? "disabled" : ""}>${submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอคิวด่วน"}</button>
          <button class="secondary-btn" type="button" data-urgent-action="back-form" ${submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
        </div>
      </section>
    `;
  }

  function renderWaiting() {
    const d = draft();
    const flow = root.state.urgentFlow || {};
    const result = flow.result || null;
    const trackingKey = result ? (result.token || result.booking_code || "") : "";
    const offersCount = result ? Number(result.offers_count || 0) : 0;
    const offerEnabled = result ? result.urgent_offer_enabled !== false : true;
    const waitingText = offerEnabled && offersCount > 0
      ? "ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน"
      : "ส่งคำขอคิวด่วนแล้ว แอดมินกำลังช่วยตรวจสอบคิวด่วน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน";
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
          <div class="notice is-urgent">${root.utils.escapeHtml(waitingText)}</div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">Request</span>
          <h2>สรุปคำขอที่ส่ง</h2>
        </div>
        <div class="data-list">
          ${result ? `<div class="data-row"><strong>เลข Booking</strong><span class="muted">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>` : ""}
          ${trackingKey ? `<div class="data-row"><strong>รหัสติดตาม</strong><span class="muted">${root.utils.escapeHtml(trackingKey)}</span></div>` : ""}
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>อาการ</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
          ${result ? `<div class="data-row"><strong>ส่งข้อเสนอ</strong><span class="muted">${offersCount} ช่าง/พาร์ทเนอร์${offerEnabled ? "" : " (ระบบส่ง offer ปิดอยู่)"}</span></div>` : ""}
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
            <div><strong>ส่งคำขอแล้ว</strong><span>${offerEnabled && offersCount > 0 ? "ระบบแสดงคำขอสำหรับพาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่" : "แอดมินจะเห็นคำขอนี้เพื่อช่วยตรวจสอบและจัดคิวต่อ"}</span></div>
          </div>
          <div class="status-line ${offerEnabled && offersCount > 0 ? "is-pending" : ""}">
            <span class="status-ic">🔔</span>
            <div><strong>${offerEnabled && offersCount > 0 ? "รอช่างพาร์ทเนอร์กดรับ" : "แอดมินกำลังช่วยตรวจสอบ"}</strong><span>${offerEnabled && offersCount > 0 ? "ช่างอาจกดรับหรือปฏิเสธงานได้ตามความพร้อม" : "กรณียังไม่มีช่างพร้อมรับ ระบบเก็บคำขอไว้ให้แอดมินช่วยต่อ"}</span></div>
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
        ${trackingKey ? `<button class="primary-btn" type="button" data-urgent-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามงานนี้</button>` : ""}
        <p class="muted">ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</p>
        <button class="secondary-btn" type="button" data-urgent-action="new-request">เริ่มคำขอใหม่</button>
      </div>
    `;
  }

  async function submitUrgent(container) {
    root.state.setUrgentFlow({ step: "review", status: "submitting", error: "", result: null });
    paint(container);
    try {
      const result = await root.api.submitUrgentRequest(buildSubmitPayload());
      const trackingKey = result.token || result.booking_code || "";
      if (trackingKey) root.state.updateDraft("tracking", { trackingCode: trackingKey });
      root.state.setUrgentFlow({ step: "waiting", status: "success", error: "", result });
      paint(container);
    } catch (error) {
      root.state.setUrgentFlow({ step: "review", status: "error", error: error.message || "ส่งคำขอคิวด่วนไม่สำเร็จ", result: null });
      paint(container);
    }
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

  function servicePatch(field, value) {
    const patch = { [field]: value };
    if (field === "service_kind") {
      const kind = root.services.serviceKinds.find((item) => item.value === value);
      patch.job_type = kind ? kind.job_type : "ล้าง";
      patch.repair_variant = kind && kind.repair_variant ? kind.repair_variant : "";
      if (value === "clean" && !draft().wash_variant) patch.wash_variant = "ล้างธรรมดา";
    }
    return patch;
  }

  function bind(container) {
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

    container.querySelectorAll("[data-urgent-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-urgent-choice");
        const value = button.getAttribute("data-choice-value");
        root.state.updateDraft("urgent", servicePatch(field, value));
        root.state.setUrgentFlow({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-urgent-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
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
          await submitUrgent(container);
        } else if (action === "new-request") {
          root.state.setUrgentFlow({ step: "form", status: "idle", error: "", result: null });
          paint(container);
        } else if (action === "track-created") {
          const key = btn.getAttribute("data-tracking-key") || "";
          root.state.updateDraft("tracking", { trackingCode: key });
          root.state.setTracking({ status: "idle", data: null, error: "" });
          root.utils.routeTo("tracking");
        } else if (action === "to-scheduled") {
          root.utils.routeTo("scheduled");
        }
      });
    });
  }

  root.bookingUrgent = {
    render(container) {
      root.state.ensureSavedAddressPrefill("urgent", () => {
        if (root.state.currentRoute === "urgent") root.bookingUrgent.render(container);
      });
      root.state.setUrgentFlow({ step: "form", status: "idle", error: "", result: null });
      paint(container);
    },
  };
})();
