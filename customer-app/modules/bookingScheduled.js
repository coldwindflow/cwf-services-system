(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function draft() {
    return root.state.draft.scheduled || {};
  }

  function service() {
    return root.services.normalizeServiceDraft(draft());
  }

  function payloadFromDraft() {
    return root.services.payloadFromServiceDraft(draft());
  }

  function finalPrice() {
    const data = root.state.scheduledPreview.pricing.data;
    if (!data) return null;
    if (data.promo && data.promo.total_after_discount != null) return data.promo.total_after_discount;
    return data.active_price || data.standard_price || null;
  }

  function appointmentDatetime() {
    const d = draft();
    if (!d.date) return "";
    if (!d.selectedSlot || !d.selectedSlot.start) return `${d.date}T09:00:00`;
    return `${d.date}T${d.selectedSlot.start}:00`;
  }

  function resetDependentState() {
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function renderChoiceGroup(field, options, selected, extraClass) {
    return `
      <div class="choice-grid ${extraClass || ""}">
        ${options.map((option) => {
          const active = String(selected || "") === String(option.value);
          return `
            <button class="choice-card ${active ? "is-selected" : ""}" type="button" data-scheduled-choice="${field}" data-choice-value="${root.utils.escapeHtml(option.value)}">
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
          ${root.utils.stateBox("", "แอร์ชนิดนี้ไม่ต้องเลือก 4 แบบล้างของแอร์ผนัง ระบบจะใช้ประเภทแอร์และจำนวนเครื่องเพื่อประเมินราคา")}
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
          ${root.utils.stateBox("", "งานตรวจอาการ / ปรึกษา จะส่งเป็นงานซ่อมพร้อม repair_variant=\"ตรวจอาการ\" และให้แอดมินประเมินราคาก่อนยืนยัน")}
        </div>
      ` : ""}
      <div class="field field-wide">
        <label>BTU</label>
        ${renderChoiceGroup("btu", root.services.btuOptions, s.btu_value || d.btu, "btu-choice-grid")}
      </div>
      <div class="field">
        <label for="scheduled-count">จำนวนเครื่อง</label>
        <select id="scheduled-count" class="select" data-scheduled-field="machine_count">
          ${root.services.machineCounts.map((n) => `<option value="${n}" ${Number(s.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="scheduled-zone">พื้นที่บริการ</label>
        <input id="scheduled-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-scheduled-field="job_zone" placeholder="เช่น สุขุมวิท อ่อนนุช ลาดพร้าว">
      </div>
      <div class="field">
        <label for="scheduled-date">วันที่ต้องการ</label>
        <input id="scheduled-date" class="input" type="date" value="${root.utils.escapeHtml(d.date)}" data-scheduled-field="date">
      </div>
      ${s.needs_admin_estimate ? `
        <div class="field field-wide">
          ${root.utils.stateBox("warning", `${s.admin_reason || "รายการนี้ต้องให้แอดมินประเมินราคา"} จึงยังไม่เปิดส่งจองอัตโนมัติจากหน้านี้`)}
        </div>
      ` : ""}
    `;
  }

  function renderPricing() {
    const s = service();
    const pricing = root.state.scheduledPreview.pricing;
    if (s.needs_admin_estimate) {
      return root.utils.stateBox("warning", `${s.admin_reason || "รายการนี้ต้องให้แอดมินประเมินราคา"} กรุณาให้ทีม CWF ตรวจสอบก่อนยืนยันราคา`);
    }
    if (pricing.status === "loading") return root.utils.stateBox("loading", "กำลังประเมินราคาให้คุณ...");
    if (pricing.status === "error") return root.utils.stateBox("error", `ยังประเมินราคาไม่ได้: ${pricing.error}`);
    if (!pricing.data) return root.utils.stateBox("", "กดประเมินราคาเพื่อดูราคาประมาณการจากระบบก่อนส่งคำขอจอง");
    const data = pricing.data;
    return `
      <div class="preview-grid">
        <div class="preview-card price-card">
          <span class="muted">ราคาประมาณการวันนี้</span>
          <strong>${root.utils.formatBaht(finalPrice())}</strong>
          <small>คำนวณจาก /public/pricing_preview เท่านั้น ยังไม่รวมงานเพิ่มเติมที่ต้องแจ้งก่อนเริ่มงาน</small>
        </div>
        <div class="preview-card">
          <span class="muted">เวลาทำงานโดยประมาณ</span>
          <strong>${root.utils.escapeHtml(data.duration_min || "-")} นาที</strong>
          <small>ใช้สำหรับค้นหาช่วงเวลาว่าง</small>
        </div>
        ${data.promo ? `
          <div class="state-box is-success">ระบบเลือกโปรโมชั่นที่เหมาะสมให้แล้ว: ${root.utils.escapeHtml(data.promo.promo_name || "-")}</div>
        ` : root.utils.stateBox("", "ยังไม่มีโปรโมชั่นที่ใช้กับรายการนี้")}
      </div>
    `;
  }

  function renderAvailability() {
    const s = service();
    const availability = root.state.scheduledPreview.availability;
    const selected = draft().selectedSlot || null;
    if (s.needs_admin_estimate) return root.utils.stateBox("warning", "รายการที่ต้องให้แอดมินประเมินราคายังไม่เปิดเลือกคิวอัตโนมัติ");
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังโหลดเวลาว่างของช่าง...");
    if (availability.status === "error") return root.utils.stateBox("error", `ยังโหลดเวลาว่างไม่ได้: ${availability.error}`);
    if (!availability.data) return root.utils.stateBox("", "เลือกวันแล้วกดโหลดเวลาว่างเพื่อดูช่วงเวลาที่จองได้");
    const slots = Array.isArray(availability.data.slots) ? availability.data.slots : [];
    const available = slots.filter((slot) => slot && slot.available);
    if (!slots.length) return root.utils.stateBox("warning", "ยังไม่พบช่วงเวลาในวันที่เลือก แต่สามารถส่งคำขอให้แอดมินช่วยจัดคิวได้");
    if (!available.length) return root.utils.stateBox("warning", "วันที่เลือกยังไม่มีช่วงเวลาว่าง แต่สามารถส่งคำขอให้แอดมินช่วยจัดคิวได้");
    return `
      <div class="slot-list">
        ${available.slice(0, 24).map((slot) => {
          const isSelected = selected && selected.start === slot.start;
          return `
            <button class="slot-chip ${isSelected ? "is-selected" : ""}" type="button" data-slot-start="${root.utils.escapeHtml(slot.start)}" data-slot-end="${root.utils.escapeHtml(slot.end)}">
              ${root.utils.escapeHtml(slot.start)}-${root.utils.escapeHtml(slot.end)}
            </button>
          `;
        }).join("")}
      </div>
      <p class="muted">เลือกช่วงเวลาที่ต้องการจาก ${available.length} ช่วงเวลาว่าง</p>
    `;
  }

  function validateDraft() {
    const d = draft();
    const s = service();
    const servicePayload = payloadFromDraft();
    const errors = [];
    const pricing = root.state.scheduledPreview.pricing;
    const availability = root.state.scheduledPreview.availability;
    const slots = availability.data && Array.isArray(availability.data.slots) ? availability.data.slots : [];
    const selectedSlot = d.selectedSlot || null;
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
    if (!(phoneDigits.length >= 9 && phoneDigits.length <= 10)) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
    if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
    if (!s.job_type) errors.push("กรุณาเลือกประเภทบริการ");
    if (!s.ac_type) errors.push("กรุณาเลือกชนิดแอร์");
    if (!s.btu && s.btu_value !== root.services.UNKNOWN_BTU) errors.push("กรุณาเลือก BTU");
    if (!s.machine_count || s.machine_count < 1) errors.push("จำนวนเครื่องต้องมากกว่า 0");
    if (s.job_type === "ล้าง" && s.ac_type === "ผนัง" && !s.wash_variant) errors.push("กรุณาเลือกประเภทการล้าง");
    if (s.needs_admin_estimate || !servicePayload) errors.push(`${s.admin_reason || "รายการนี้ต้องให้แอดมินประเมินราคา"} ก่อนส่งจองอัตโนมัติ`);
    if (!pricing.data) errors.push("กรุณาประเมินราคาก่อนส่งคำขอจอง");
    if (!appointmentDatetime()) errors.push("กรุณาเลือกวันที่ต้องการจอง");
    if (selectedSlot && slots.length) {
      const stillAvailable = slots.some((slot) => (
        slot
        && slot.available
        && slot.start === selectedSlot.start
        && slot.end === selectedSlot.end
      ));
      if (!stillAvailable) errors.push("ช่วงเวลาที่เลือกไม่พร้อมให้จองแล้ว กรุณาเลือกเวลาใหม่");
    }
    return errors;
  }

  function buildSubmitPayload() {
    const d = draft();
    const servicePayload = payloadFromDraft();
    const body = {
      customer_name: String(d.customer_name || "").trim(),
      customer_phone: String(d.customer_phone || "").trim(),
      appointment_datetime: appointmentDatetime(),
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      customer_note: [
        String(d.customer_note || "").trim(),
        d.selectedSlot ? "" : "Customer App V2: ลูกค้าส่งคำขอแบบไม่มี slot ว่าง ให้แอดมินช่วยจัดคิว/ยืนยันเวลา",
      ].filter(Boolean).join("\n"),
      booking_mode: "scheduled",
      client_app: "customer_app_v2",
      allow_admin_schedule_fallback: true,
      job_zone: String(d.job_zone || "").trim(),
      ...servicePayload,
    };
    return body;
  }

  function serviceSummary() {
    return root.services.serviceLabel(service());
  }

  function renderReview() {
    const d = draft();
    const submit = root.state.scheduledSubmit;
    const errors = validateDraft();
    const slot = d.selectedSlot ? `${d.date} ${d.selectedSlot.start}-${d.selectedSlot.end}` : `${d.date || "-"} ให้แอดมินช่วยจัดคิว`;
    const price = finalPrice();
    const pending = submit.status === "validating" || submit.status === "submitting";
    return `
      <section class="card review-card">
        <div class="section-head">
          <span class="section-kicker">Final check</span>
          <h2>ตรวจสอบก่อนจอง</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>เวลาที่เลือก</strong><span class="muted">${root.utils.escapeHtml(slot)}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          <div class="data-row"><strong>ราคาประมาณการ</strong><span class="muted">${price ? root.utils.formatBaht(price) : "กรุณาประเมินราคาก่อน"}</span></div>
        </div>
        <div class="notice">ราคานี้เป็นราคาประมาณการ หากพบงานเพิ่มเติม CWF จะแจ้งราคาก่อนเริ่มงาน${d.selectedSlot ? "" : " กรณีไม่มีช่วงเวลาว่าง แอดมินจะช่วยยืนยันเวลานัดอีกครั้ง"}</div>
        ${errors.length ? `
          <div class="state-box is-error">
            ${errors.map((error) => `<div>${root.utils.escapeHtml(error)}</div>`).join("")}
          </div>
        ` : root.utils.stateBox("success", "ข้อมูลพร้อมส่งคำขอจองล่วงหน้า")}
        ${submit.status === "error" ? root.utils.stateBox("error", submit.error || "ส่งคำขอจองไม่สำเร็จ") : ""}
        <div class="button-row sticky-submit-row">
          <button class="primary-btn" type="button" data-action="submit-scheduled" ${pending || errors.length ? "disabled" : ""}>
            ${pending ? "กำลังส่งคำขอจอง..." : "ส่งคำขอจองล่วงหน้า"}
          </button>
        </div>
      </section>
    `;
  }

  function renderSuccess() {
    const result = root.state.scheduledSubmit.result;
    if (!result) return "";
    const trackingKey = result.token || result.booking_code || "";
    return `
      <section class="card success-card">
        <div class="success-mark">✓</div>
        <h2>รับคำขอจองแล้ว</h2>
        <div class="state-box is-success">ระบบรับคำขอจองแล้ว ทีมงานจะตรวจสอบคิวและดำเนินการต่อ</div>
        <div class="data-list">
          <div class="data-row"><strong>เลข Booking</strong><span class="muted">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>ราคาจากระบบ</strong><span class="muted">${root.utils.formatBaht(result.base_total)}</span></div>
          <div class="data-row"><strong>เวลาทำงานโดยประมาณ</strong><span class="muted">${root.utils.escapeHtml(result.duration_min || "-")} นาที</span></div>
        </div>
        <div class="button-row">
          <button class="primary-btn" type="button" data-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามงานในแอป CWF</button>
        </div>
      </section>
    `;
  }

  function renderSubmitArea() {
    return root.state.scheduledSubmit.status === "success" ? renderSuccess() : renderReview();
  }

  function renderAll(container) {
    const pricingMount = container.querySelector("[data-pricing-preview]");
    const availabilityMount = container.querySelector("[data-availability-preview]");
    const submitMount = container.querySelector("[data-submit-area]");
    if (pricingMount) pricingMount.innerHTML = renderPricing();
    if (availabilityMount) availabilityMount.innerHTML = renderAvailability();
    if (submitMount) submitMount.innerHTML = renderSubmitArea();
    bindDynamic(container);
  }

  async function refreshPricing(container) {
    const payload = payloadFromDraft();
    if (!payload) {
      resetDependentState();
      renderAll(container);
      return;
    }
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    renderAll(container);
    try {
      const data = await root.api.previewPricing(payload);
      root.state.setScheduledPreview("pricing", { status: "success", data, error: "" });
    } catch (error) {
      root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error.message });
    }
    renderAll(container);
  }

  async function refreshAvailability(container) {
    const payload = payloadFromDraft();
    if (!payload) {
      resetDependentState();
      renderAll(container);
      return;
    }
    root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    renderAll(container);
    const d = draft();
    const duration = root.state.scheduledPreview.pricing.data
      ? Number(root.state.scheduledPreview.pricing.data.duration_min || 60)
      : 60;
    try {
      const data = await root.api.loadAvailability({
        date: d.date,
        tech_type: "company",
        duration_min: duration,
        ...payload,
      });
      root.state.setScheduledPreview("availability", { status: "success", data, error: "" });
    } catch (error) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: error.message });
    }
    renderAll(container);
  }

  async function submit(container) {
    const current = root.state.scheduledSubmit.status;
    if (current === "validating" || current === "submitting") return;
    root.state.setScheduledSubmit({ status: "validating", error: "", result: null });
    renderAll(container);
    const errors = validateDraft();
    if (errors.length) {
      root.state.setScheduledSubmit({ status: "error", error: errors[0], result: null });
      renderAll(container);
      return;
    }
    root.state.setScheduledSubmit({ status: "submitting", error: "", result: null });
    renderAll(container);
    try {
      const result = await root.api.submitScheduledBooking(buildSubmitPayload());
      root.state.setScheduledSubmit({ status: "success", error: "", result });
    } catch (error) {
      root.state.setScheduledSubmit({
        status: "error",
        error: error.message || "ส่งคำขอจองไม่สำเร็จ กรุณาลองอีกครั้ง",
        result: null,
      });
    }
    renderAll(container);
  }

  function servicePatch(field, value) {
    const patch = { [field]: value };
    if (field === "service_kind") {
      const kind = root.services.serviceKinds.find((item) => item.value === value);
      patch.job_type = kind ? kind.job_type : "ล้าง";
      patch.repair_variant = kind && kind.repair_variant ? kind.repair_variant : "";
      if (value === "clean" && !draft().wash_variant) patch.wash_variant = "ล้างธรรมดา";
    }
    if (field === "ac_type" && value !== "ผนัง") {
      patch.wash_variant = draft().wash_variant || "ล้างธรรมดา";
    }
    return patch;
  }

  function bindStatic(container) {
    container.querySelectorAll("[data-scheduled-field]").forEach((field) => {
      const handler = () => {
        const key = field.getAttribute("data-scheduled-field");
        const patch = {};
        patch[key] = field.value;
        if (["machine_count", "date"].includes(key)) {
          patch.selectedSlot = null;
          root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "" });
        }
        root.state.updateDraft("scheduled", patch);
        root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
        if (key === "machine_count") resetDependentState();
        renderAll(container);
      };
      field.addEventListener("input", handler);
      field.addEventListener("change", handler);
    });
    container.querySelectorAll("[data-scheduled-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-scheduled-choice");
        const value = button.getAttribute("data-choice-value");
        root.state.updateDraft("scheduled", servicePatch(field, value));
        resetDependentState();
        root.bookingScheduled.render(container);
      });
    });
    container.querySelector("[data-action='preview-price']").addEventListener("click", () => refreshPricing(container));
    container.querySelector("[data-action='load-slots']").addEventListener("click", () => refreshAvailability(container));
  }

  function bindDynamic(container) {
    container.querySelectorAll("[data-slot-start]").forEach((button) => {
      button.addEventListener("click", () => {
        root.state.updateDraft("scheduled", {
          selectedSlot: {
            start: button.getAttribute("data-slot-start"),
            end: button.getAttribute("data-slot-end"),
          },
        });
        root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
        renderAll(container);
      }, { once: true });
    });
    const submitButton = container.querySelector("[data-action='submit-scheduled']");
    if (submitButton) submitButton.addEventListener("click", () => submit(container), { once: true });
    const trackButton = container.querySelector("[data-action='track-created']");
    if (trackButton) {
      trackButton.addEventListener("click", () => {
        const key = trackButton.getAttribute("data-tracking-key") || "";
        root.state.updateDraft("tracking", { trackingCode: key });
        root.state.setTracking({ status: "idle", data: null, error: "" });
        root.utils.routeTo("tracking");
      }, { once: true });
    }
  }

  root.bookingScheduled = {
    // Scheduled booking rule:
    // Customer submits scheduled bookings through existing /public/book only.
    // This flow always sends booking_mode="scheduled" and never starts urgent dispatch.
    render(container) {
      root.state.ensureSavedAddressPrefill("scheduled", () => {
        if (root.state.currentRoute === "scheduled") root.bookingScheduled.render(container);
      });
      const d = draft();
      const s = service();
      container.innerHTML = `
        <section class="screen">
          <div class="hero scheduled-hero">
            <div class="hero-badge">Scheduled Booking</div>
            <h2>จองล่วงหน้า</h2>
            <p>เลือกบริการ ดูราคาประมาณการจากระบบ เลือกเวลาว่าง แล้วส่งคำขอจองให้ CWF ตรวจสอบ</p>
          </div>
          <div class="wizard-progress" aria-label="ขั้นตอนการจองล่วงหน้า">
            <span>ข้อมูลลูกค้า</span>
            <span>บริการ</span>
            <span>ราคา</span>
            <span>เวลา</span>
            <span>ยืนยัน</span>
          </div>
          <section class="card form-card">
            <div class="section-head">
              <span class="section-kicker">Customer</span>
              <h2>ข้อมูลผู้ติดต่อ</h2>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="scheduled-name">ชื่อผู้ติดต่อ</label>
                <input id="scheduled-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-scheduled-field="customer_name" autocomplete="name" placeholder="เช่น คุณสมชาย">
              </div>
              <div class="field">
                <label for="scheduled-phone">เบอร์โทร</label>
                <input id="scheduled-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-scheduled-field="customer_phone" inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX">
              </div>
              <div class="field">
                <label for="scheduled-address">ที่อยู่หน้างาน</label>
                <textarea id="scheduled-address" class="input textarea" data-scheduled-field="address_text" rows="3" placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง เขต/อำเภอ">${root.utils.escapeHtml(d.address_text || "")}</textarea>
              </div>
              <div class="field">
                <label for="scheduled-maps">ลิงก์แผนที่</label>
                <input id="scheduled-maps" class="input" value="${root.utils.escapeHtml(d.maps_url || "")}" data-scheduled-field="maps_url" inputmode="url" placeholder="วางลิงก์ Google Maps ถ้ามี">
              </div>
              <div class="field field-wide">
                <label for="scheduled-note">หมายเหตุถึงทีมงาน</label>
                <textarea id="scheduled-note" class="input textarea" data-scheduled-field="customer_note" rows="3" placeholder="เช่น ที่จอดรถ จุดนัดพบ อาการเพิ่มเติม">${root.utils.escapeHtml(d.customer_note || "")}</textarea>
              </div>
            </div>
          </section>
          <section class="card form-card">
            <div class="section-head">
              <span class="section-kicker">Service</span>
              <h2>เลือกบริการ</h2>
              <p class="muted">ราคาจะมาจากระบบประเมินราคาของ CWF เท่านั้น ไม่ใช้ราคาที่ hardcode ในหน้าแอป</p>
            </div>
            <div class="form-grid service-taxonomy-grid">
              ${renderServiceFields()}
            </div>
          </section>
          <section class="card preview-section-card">
            <div class="section-head">
              <span class="section-kicker">Estimate</span>
              <h2>ประเมินราคา</h2>
            </div>
            <div data-pricing-preview>${renderPricing()}</div>
            <div class="button-row">
              <button class="secondary-btn action-btn" type="button" data-action="preview-price" ${s.needs_admin_estimate ? "disabled" : ""}>ประเมินราคา</button>
            </div>
          </section>
          <section class="card preview-section-card">
            <div class="section-head">
              <span class="section-kicker">Available slots</span>
              <h2>เลือกเวลาว่าง</h2>
            </div>
            <div data-availability-preview>${renderAvailability()}</div>
            <div class="button-row">
              <button class="secondary-btn action-btn" type="button" data-action="load-slots" ${s.needs_admin_estimate ? "disabled" : ""}>โหลดเวลาว่าง</button>
            </div>
          </section>
          <div data-submit-area>${renderSubmitArea()}</div>
        </section>
      `;
      bindStatic(container);
      bindDynamic(container);
    },
  };
})();
