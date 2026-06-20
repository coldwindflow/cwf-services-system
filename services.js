(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function draft() {
    return root.state.draft.urgent || {};
  }

  function service() {
    const normalized = root.services.normalizeServiceDraft({
      ...draft(),
      service_kind: "clean",
      job_type: "ล้าง",
      repair_variant: "",
    });
    return { ...normalized, service_kind: "clean", job_type: "ล้าง", repair_variant: "" };
  }

  function setFlow(patch) {
    root.state.setUrgentFlow(patch || {});
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
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
    const note = String(d.symptom || "").trim();
    const serviceLine = {
      job_type: "ล้าง",
      ac_type: s.ac_type,
      btu: s.btu || 0,
      machine_count: s.machine_count || 1,
      wash_variant: s.wash_variant || "",
      repair_variant: "",
    };
    return {
      customer_name: String(d.customer_name || "").trim(),
      customer_phone: String(d.customer_phone || "").trim(),
      appointment_datetime: nextUrgentAppointmentIso(),
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      job_zone: String(d.job_zone || "").trim(),
      customer_note: note ? `[คำขอจองด่วนงานล้าง] ${note}` : "[คำขอจองด่วนงานล้าง] ต้องการช่างเร็วที่สุด",
      booking_mode: "urgent",
      client_app: "customer_app_v2",
      ...serviceLine,
      services: [serviceLine],
    };
  }

  function serviceSummary() {
    return root.services.serviceLabel(service());
  }

  function renderChoiceGroup(field, options, selected, extraClass) {
    return `
      <div class="choice-grid ${extraClass || ""}">
        ${options.map((option) => {
          const active = String(selected || "") === String(option.value);
          return `
            <button class="choice-card ${active ? "is-selected" : ""}" type="button"
              data-urgent-choice="${field}" data-choice-value="${root.utils.escapeHtml(option.value)}"
              aria-pressed="${active ? "true" : "false"}">
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
    const count = Number(s.machine_count || 1);
    return `
      <div class="field field-wide">
        <label>ชนิดแอร์</label>
        ${renderChoiceGroup("ac_type", root.services.bookableAcTypes, s.ac_type, "ac-type-grid")}
      </div>
      ${s.ac_type === "ผนัง" ? `
        <div class="field field-wide">
          <label>รูปแบบการล้าง</label>
          ${renderChoiceGroup("wash_variant", root.services.washVariants, s.wash_variant || d.wash_variant, "wash-variant-grid")}
        </div>
      ` : ""}
      <div class="field field-wide">
        <label>ขนาด BTU</label>
        ${renderChoiceGroup("btu", root.services.bookableBtuOptions, s.btu_value || d.btu, "btu-choice-grid")}
      </div>
      <div class="field quantity-field">
        <label>จำนวนเครื่อง</label>
        <div class="quantity-picker" role="group" aria-label="เลือกจำนวนเครื่อง">
          <button type="button" data-urgent-count="decrease" aria-label="ลดจำนวนเครื่อง" ${count <= 1 ? "disabled" : ""}>−</button>
          <output aria-live="polite"><strong>${count}</strong><span>เครื่อง</span></output>
          <button type="button" data-urgent-count="increase" aria-label="เพิ่มจำนวนเครื่อง" ${count >= 10 ? "disabled" : ""}>+</button>
        </div>
      </div>
    `;
  }

  function validate() {
    const d = draft();
    const s = service();
    const errors = [];
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
    if (phoneDigits.length < 9 || phoneDigits.length > 10) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
    if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
    if (!s.ac_type || !root.services.bookableAcTypes.some((item) => item.value === s.ac_type)) errors.push("กรุณาเลือกชนิดแอร์");
    if (!s.btu || !root.services.bookableBtuOptions.some((item) => Number(item.btu) === Number(s.btu))) errors.push("กรุณาเลือกขนาด BTU");
    if (!s.machine_count || s.machine_count < 1) errors.push("กรุณาระบุจำนวนเครื่อง");
    if (s.ac_type === "ผนัง" && !s.wash_variant) errors.push("กรุณาเลือกรูปแบบการล้าง");
    return errors;
  }

  function hero() {
    return `
      <div class="hero urgent-hero urgent-hero-fx">
        <div class="urgent-aurora" aria-hidden="true"></div>
        <div class="urgent-spark" aria-hidden="true"></div>
        <div class="hero-badge">คำขอล้างแอร์ด่วน</div>
        <h2>ส่งคำขอให้ช่างที่พร้อมรับงาน</h2>
        <p>ไม่ต้องเลือกวันหรือช่วงเวลา ระบบจะส่งคำขอให้ช่างพาร์ทเนอร์ที่พร้อมรับงานกดรับ</p>
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
    const activeIndex = order[active] ?? 0;
    return `
      <div class="flow-rail" aria-label="ขั้นตอนจองด่วน">
        ${steps.map((step, index) => `
          <div class="flow-node ${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-active" : ""}">
            <span class="flow-bullet">${index < activeIndex ? "✓" : index + 1}</span>
            <span class="flow-label">${step.label}</span>
          </div>
        `).join('<span class="flow-bar" aria-hidden="true"></span>')}
      </div>
    `;
  }

  function renderForm() {
    const d = draft();
    const error = root.state.urgentFlow?.error || "";
    return `
      <section class="card form-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">ข้อมูลผู้ติดต่อ</span>
          <h2>สถานที่รับบริการ</h2>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="urgent-name">ชื่อผู้ติดต่อ</label>
            <input id="urgent-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-urgent-field="customer_name" autocomplete="name" placeholder="ชื่อผู้ติดต่อ">
          </div>
          <div class="field">
            <label for="urgent-phone">เบอร์โทร</label>
            <input id="urgent-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-urgent-field="customer_phone" inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX">
          </div>
          <div class="field field-wide">
            <label for="urgent-address">ที่อยู่หน้างาน</label>
            <textarea id="urgent-address" class="input textarea" data-urgent-field="address_text" rows="3" placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง และจุดนัดพบ">${root.utils.escapeHtml(d.address_text || "")}</textarea>
          </div>
          <div class="field">
            <label for="urgent-maps">ลิงก์ Google Maps (ถ้ามี)</label>
            <input id="urgent-maps" class="input" value="${root.utils.escapeHtml(d.maps_url || "")}" data-urgent-field="maps_url" inputmode="url" placeholder="https://maps.app.goo.gl/...">
          </div>
          <div class="field">
            <label for="urgent-zone">พื้นที่ / โซน (ถ้ามี)</label>
            <input id="urgent-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-urgent-field="job_zone" placeholder="เช่น อ่อนนุช บางนา พระราม 3">
          </div>
        </div>
      </section>

      <section class="card form-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">รายละเอียดงานล้าง</span>
          <h2>ข้อมูลเครื่องปรับอากาศ</h2>
        </div>
        <div class="form-grid service-taxonomy-grid">
          ${renderServiceFields()}
          <div class="field field-wide">
            <label for="urgent-note">หมายเหตุหน้างาน (ถ้ามี)</label>
            <textarea id="urgent-note" class="input textarea" data-urgent-field="symptom" rows="3" placeholder="เช่น คอนโดเข้าทำได้ก่อน 17:00 น. ที่จอดรถ หรือจุดนัดพบ">${root.utils.escapeHtml(d.symptom || "")}</textarea>
          </div>
        </div>
      </section>

      <div class="notice is-urgent">คิวด่วนเป็นการส่งคำขอให้ช่างกดรับ ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
      ${error ? `<div class="state-box is-error" data-urgent-error tabindex="-1">${root.utils.escapeHtml(error)}</div>` : ""}
      <div class="urgent-action-row">
        <button class="secondary-btn" type="button" data-route="booking">กลับไปเลือกแบบจอง</button>
        <button class="primary-btn" type="button" data-urgent-action="to-review">ตรวจสอบคำขอ</button>
      </div>
    `;
  }

  function renderReview() {
    const d = draft();
    const flow = root.state.urgentFlow || {};
    const submitting = flow.status === "submitting";
    return `
      <section class="card review-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">ตรวจสอบก่อนส่ง</span>
          <h2>คำขอล้างแอร์ด่วน</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>เวลาที่ต้องการ</strong><span class="muted">เร็วที่สุดที่มีช่างพร้อมรับงาน</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          ${d.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone)}</span></div>` : ""}
          ${d.maps_url ? `<div class="data-row"><strong>แผนที่</strong><span class="muted">แนบลิงก์ Google Maps แล้ว</span></div>` : ""}
          <div class="data-row"><strong>หมายเหตุ</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
        </div>
        <div class="notice is-urgent">หลังส่งคำขอ ระบบจะส่งงานให้ช่างพาร์ทเนอร์ที่พร้อมรับ งานยังไม่ยืนยันจนกว่าจะมีช่างกดรับหรือแอดมินยืนยัน</div>
        ${flow.error ? `<div class="state-box is-error" data-urgent-error tabindex="-1">${root.utils.escapeHtml(flow.error)}</div>` : ""}
        <div class="urgent-action-row">
          <button class="secondary-btn" type="button" data-urgent-action="back-form" ${submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
          <button class="primary-btn" type="button" data-urgent-action="confirm" ${submitting ? "disabled" : ""}>${submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอจองด่วน"}</button>
        </div>
      </section>
    `;
  }

  function renderWaiting() {
    const d = draft();
    const result = root.state.urgentFlow?.result || {};
    const trackingKey = result.token || result.booking_code || "";
    const offersCount = Number(result.offers_count || 0);
    const offerEnabled = result.urgent_offer_enabled !== false;
    const hasOfferTargets = offerEnabled && offersCount > 0;
    const statusTitle = hasOfferTargets ? "กำลังรอช่างกดรับงาน" : "ยังไม่มีช่างพร้อมรับในขณะนี้";
    const statusCopy = hasOfferTargets
      ? `ระบบส่งคำขอให้ช่างพาร์ทเนอร์ที่พร้อมรับงานแล้ว ${offersCount} ราย`
      : "คำขอถูกบันทึกแล้ว สามารถติดตามสถานะ เปลี่ยนเป็นจองล่วงหน้า หรือติดต่อแอดมินได้";
    return `
      <section class="card waiting-room waiting-room-fx">
        <div class="radar-wrap" aria-hidden="true">
          <div class="radar">
            <span class="radar-ping"></span><span class="radar-ping d2"></span><span class="radar-ping d3"></span>
            <span class="radar-sweep"></span><span class="radar-core">⚡</span>
          </div>
        </div>
        <div class="waiting-status">
          <div class="pulse-row"><span class="pulse-dot" aria-hidden="true"></span><span>${root.utils.escapeHtml(statusTitle)}</span></div>
          <div class="notice is-urgent">ส่งคำขอคิวด่วนแล้ว ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน</div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head"><span class="section-kicker">สถานะคำขอ</span><h2>${root.utils.escapeHtml(statusTitle)}</h2></div>
        <p class="muted">${root.utils.escapeHtml(statusCopy)}</p>
        <div class="data-list">
          <div class="data-row"><strong>รหัสจอง</strong><span class="booking-code-value">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>ราคาในระบบ</strong><span class="muted">${Number(result.base_total || 0) > 0 ? root.utils.formatBaht(result.base_total) : "รอตรวจสอบ"}</span></div>
        </div>
      </section>

      <section class="card urgent-card-fx">
        <div class="section-head"><span class="section-kicker">ดำเนินการต่อ</span><h2>เลือกสิ่งที่ต้องการทำ</h2></div>
        <div class="urgent-result-actions">
          ${trackingKey ? `<button class="primary-btn" type="button" data-urgent-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามคำขอนี้</button>` : ""}
          <button class="secondary-btn" type="button" data-urgent-action="to-scheduled">เปลี่ยนเป็นจองล่วงหน้า</button>
          <a class="secondary-btn" href="https://line.me/R/ti/p/@cwfair" target="_blank" rel="noopener noreferrer">แชท LINE @cwfair</a>
          <a class="secondary-btn" href="tel:0988777321">โทร 098-877-7321</a>
          <button class="text-action-btn" type="button" data-urgent-action="new-request">เริ่มคำขอใหม่</button>
        </div>
      </section>
    `;
  }

  function body() {
    const step = root.state.urgentFlow?.step || "form";
    if (step === "review") return renderReview();
    if (step === "waiting") return renderWaiting();
    return renderForm();
  }

  function paint(container, options = {}) {
    const step = root.state.urgentFlow?.step || "form";
    container.innerHTML = `
      <section class="screen urgent-screen" data-urgent-step="${step}">
        ${hero()}
        ${flowRail(step)}
        <div class="urgent-body" data-urgent-body>${body()}</div>
      </section>
    `;
    bind(container);
    if (options.focusError) {
      requestAnimationFrame(() => {
        const error = container.querySelector("[data-urgent-error]");
        error?.scrollIntoView({ behavior: "smooth", block: "center" });
        error?.focus({ preventScroll: true });
      });
    } else if (options.scrollTop) {
      requestAnimationFrame(() => container.querySelector(".urgent-screen")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function submitUrgent(container) {
    if (root.state.urgentFlow?.status === "submitting") return;
    setFlow({ step: "review", status: "submitting", error: "", result: null });
    paint(container);
    try {
      const result = await root.api.submitUrgentRequest(buildSubmitPayload());
      const trackingKey = result.token || result.booking_code || "";
      if (trackingKey) root.state.updateDraft("tracking", { trackingCode: trackingKey });
      setFlow({ step: "waiting", status: "success", error: "", result });
      paint(container, { scrollTop: true });
    } catch (error) {
      setFlow({ step: "review", status: "error", error: error?.message || "ส่งคำขอจองด่วนไม่สำเร็จ กรุณาลองอีกครั้ง", result: null });
      paint(container, { focusError: true });
    }
  }

  function copyToScheduled() {
    const d = draft();
    root.state.updateDraft("scheduled", {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: d.ac_type || "ผนัง",
      wash_variant: d.wash_variant || "ล้างธรรมดา",
      repair_variant: "",
      btu: d.btu || "12000",
      machine_count: Number(d.machine_count || 1),
      customer_name: d.customer_name || "",
      customer_phone: d.customer_phone || "",
      address_text: d.address_text || "",
      maps_url: d.maps_url || "",
      customer_note: d.symptom || "",
      job_zone: d.job_zone || "",
      selectedSlot: null,
    });
    root.state.setScheduledWizard({ step: 1, error: "" });
    root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function bind(container) {
    container.querySelectorAll("[data-urgent-field]").forEach((element) => {
      const handler = () => {
        root.state.updateDraft("urgent", { [element.getAttribute("data-urgent-field")]: element.value });
        if (root.state.urgentFlow?.error) setFlow({ error: "" });
      };
      element.addEventListener("input", handler);
      element.addEventListener("change", handler);
    });

    container.querySelectorAll("[data-urgent-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-urgent-choice");
        const value = button.getAttribute("data-choice-value");
        const patch = { [field]: value, service_kind: "clean", job_type: "ล้าง", repair_variant: "" };
        if (field === "ac_type" && value !== "ผนัง") patch.wash_variant = "";
        if (field === "ac_type" && value === "ผนัง" && !draft().wash_variant) patch.wash_variant = "ล้างธรรมดา";
        root.state.updateDraft("urgent", patch);
        setFlow({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-urgent-count]").forEach((button) => {
      button.addEventListener("click", () => {
        const current = Math.max(1, Math.min(10, Number(draft().machine_count || 1)));
        const next = button.getAttribute("data-urgent-count") === "increase" ? current + 1 : current - 1;
        root.state.updateDraft("urgent", { machine_count: Math.max(1, Math.min(10, next)) });
        paint(container);
      });
    });

    container.querySelectorAll("[data-urgent-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-urgent-action");
        if (action === "to-review") {
          const errors = validate();
          if (errors.length) {
            setFlow({ step: "form", status: "idle", error: errors[0] });
            paint(container, { focusError: true });
            return;
          }
          setFlow({ step: "review", status: "idle", error: "" });
          paint(container, { scrollTop: true });
        } else if (action === "back-form") {
          setFlow({ step: "form", status: "idle", error: "" });
          paint(container, { scrollTop: true });
        } else if (action === "confirm") {
          await submitUrgent(container);
        } else if (action === "new-request") {
          if (typeof root.state.resetUrgentDraft === "function") root.state.resetUrgentDraft();
          else setFlow({ step: "form", status: "idle", error: "", result: null });
          paint(container, { scrollTop: true });
        } else if (action === "track-created") {
          const key = button.getAttribute("data-tracking-key") || "";
          root.state.updateDraft("tracking", { trackingCode: key });
          root.state.setTracking({ status: "idle", data: null, error: "" });
          root.utils.routeTo("tracking");
        } else if (action === "to-scheduled") {
          copyToScheduled();
          root.utils.routeTo("scheduled");
        }
      });
    });
  }

  root.bookingUrgent = {
    render(container) {
      root.state.ensureSavedAddressPrefill("urgent", () => {
        if (root.state.currentRoute === "urgent") paint(container);
      });
      const validSteps = new Set(["form", "review", "waiting"]);
      if (!validSteps.has(root.state.urgentFlow?.step)) setFlow({ step: "form", status: "idle", error: "", result: null });
      paint(container);
    },
  };
})();
