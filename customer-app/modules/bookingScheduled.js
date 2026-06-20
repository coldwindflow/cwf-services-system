(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  let availabilityRequestSeq = 0;

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
    const slot = d.selectedSlot || null;
    if (!d.date || !slot || !slot.start || slot.date !== d.date) return "";
    return `${d.date}T${slot.start}:00`;
  }

  function resetDependentState() {
    availabilityRequestSeq += 1;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
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
        <input id="scheduled-date" class="input" type="date" min="${root.utils.escapeHtml(root.availability.bangkokTodayYmd())}" value="${root.utils.escapeHtml(d.date)}" data-scheduled-field="date">
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
          <small>คำนวณจากบริการ จำนวนเครื่อง และโปรโมชั่นปัจจุบัน ยังไม่รวมงานเพิ่มเติมที่ต้องแจ้งก่อนเริ่มงาน</small>
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

  function currentAvailabilityQuery() {
    const payload = payloadFromDraft();
    const pricing = root.state.scheduledPreview.pricing.data;
    if (!payload || !pricing || !draft().date) return null;
    return root.availability.publicAvailabilityQuery(draft(), payload, pricing);
  }

  function currentAvailabilityKey() {
    const query = currentAvailabilityQuery();
    return query ? root.availability.queryKey(query) : "";
  }

  function normalizedSlots() {
    const availability = root.state.scheduledPreview.availability;
    const pricing = root.state.scheduledPreview.pricing.data;
    return root.availability.normalizePublicSlots(availability.data, pricing && pricing.duration_min);
  }

  function renderAvailability() {
    const s = service();
    const availability = root.state.scheduledPreview.availability;
    const selected = draft().selectedSlot || null;
    if (s.needs_admin_estimate) return root.utils.stateBox("warning", "รายการนี้ต้องให้แอดมินประเมินก่อน จึงยังไม่สามารถเลือกคิวอัตโนมัติได้");
    if (!root.state.scheduledPreview.pricing.data) return root.utils.stateBox("", "เลือกบริการและวันที่ แล้วกด ‘ดูราคาและคิวว่างจริง’ ระบบจะตรวจตารางช่าง CWF ให้ทันที");
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังตรวจคิวจริงจากตารางงานช่าง...");
    if (availability.status === "error") return root.utils.stateBox("error", `โหลดคิวจริงไม่สำเร็จ: ${availability.error}`);
    if (!availability.data) return root.utils.stateBox("", "กด ‘ดูราคาและคิวว่างจริง’ เพื่อเลือกช่วงเวลาที่มีช่างว่างจริง");

    const slots = normalizedSlots();
    if (!slots.length) return root.utils.stateBox("warning", "วันที่เลือกไม่มีคิวช่างว่างจริงสำหรับระยะเวลางานนี้ กรุณาเลือกวันอื่น");

    return `
      <div class="availability-meta">
        <strong>คิวจริงจากตารางงานช่าง CWF</strong>
        <span>${root.utils.escapeHtml(availability.data.date || draft().date)} • ใช้เวลาประมาณ ${root.utils.escapeHtml(availability.data.duration_min || "-")} นาที</span>
      </div>
      <div class="real-slot-grid">
        ${slots.map((slot) => {
          const isSelected = selected && selected.key === slot.key && selected.query_key === availability.query_key;
          return `
            <button class="real-slot-card ${isSelected ? "is-selected" : ""}" type="button" aria-pressed="${isSelected ? "true" : "false"}" data-real-slot-key="${root.utils.escapeHtml(slot.key)}">
              <strong>${root.utils.escapeHtml(slot.start)}</strong>
              <span>ถึงประมาณ ${root.utils.escapeHtml(slot.end)}</span>
              <small>ช่วงนี้มีช่างว่าง</small>
            </button>
          `;
        }).join("")}
      </div>
      ${selected && selected.query_key === availability.query_key ? `
        <div class="selected-slot-banner">
          <span>เวลาที่เลือก</span>
          <strong>${root.utils.escapeHtml(selected.date)} • ${root.utils.escapeHtml(selected.start)}-${root.utils.escapeHtml(selected.end)}</strong>
        </div>
      ` : ""}
      <p class="muted slot-source-note">อัปเดตจากตารางงานจริงของทีม CWF และระบบจะตรวจซ้ำก่อนรับจอง</p>
    `;
  }

  function validateDraft() {
    const d = draft();
    const s = service();
    const servicePayload = payloadFromDraft();
    const errors = [];
    const pricing = root.state.scheduledPreview.pricing;
    const availability = root.state.scheduledPreview.availability;
    const selectedSlot = d.selectedSlot || null;
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    const queryKey = currentAvailabilityKey();

    if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
    if (!(phoneDigits.length >= 9 && phoneDigits.length <= 10)) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
    if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
    if (!s.job_type) errors.push("กรุณาเลือกประเภทบริการ");
    if (!s.ac_type) errors.push("กรุณาเลือกชนิดแอร์");
    if (!s.btu && s.btu_value !== root.services.UNKNOWN_BTU) errors.push("กรุณาเลือก BTU");
    if (!s.machine_count || s.machine_count < 1) errors.push("จำนวนเครื่องต้องมากกว่า 0");
    if (s.job_type === "ล้าง" && s.ac_type === "ผนัง" && !s.wash_variant) errors.push("กรุณาเลือกประเภทการล้าง");
    if (s.needs_admin_estimate || !servicePayload) errors.push(`${s.admin_reason || "รายการนี้ต้องให้แอดมินประเมินราคา"} ก่อนส่งจองอัตโนมัติ`);
    if (!pricing.data) errors.push("กรุณาดูราคาและคิวว่างจริงก่อนส่งจอง");
    if (!d.date) errors.push("กรุณาเลือกวันที่ต้องการจอง");
    if (!availability.data || availability.query_key !== queryKey) errors.push("กรุณาโหลดคิวจริงของวันที่และบริการล่าสุด");
    if (!selectedSlot) errors.push("กรุณาเลือกช่วงเวลาที่มีช่างว่างจริง");
    if (selectedSlot && (
      selectedSlot.date !== d.date
      || selectedSlot.query_key !== availability.query_key
      || !root.availability.selectedSlotIsCurrent(selectedSlot, availability.data, availability.query_key)
    )) errors.push("คิวที่เลือกไม่ตรงกับข้อมูลล่าสุด กรุณาเลือกเวลาใหม่");
    if (!appointmentDatetime()) errors.push("กรุณาเลือกคิวจริงก่อนส่งจอง");
    return errors;
  }

  function buildSubmitPayload() {
    const d = draft();
    const servicePayload = payloadFromDraft();
    return {
      customer_name: String(d.customer_name || "").trim(),
      customer_phone: String(d.customer_phone || "").trim(),
      appointment_datetime: appointmentDatetime(),
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      customer_note: String(d.customer_note || "").trim(),
      booking_mode: "scheduled",
      client_app: "customer_app_v2",
      job_zone: String(d.job_zone || "").trim(),
      ...servicePayload,
    };
  }

  function serviceSummary() {
    return root.services.serviceLabel(service());
  }

  function renderReview() {
    const d = draft();
    const submit = root.state.scheduledSubmit;
    const errors = validateDraft();
    const slot = d.selectedSlot ? `${d.selectedSlot.date} ${d.selectedSlot.start}-${d.selectedSlot.end}` : "ยังไม่ได้เลือกคิวจริง";
    const price = finalPrice();
    const pending = ["validating", "checking_slot", "submitting"].includes(submit.status);
    return `
      <section class="card review-card">
        <div class="section-head">
          <span class="section-kicker">Final check</span>
          <h2>ตรวจสอบก่อนจอง</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>คิวช่างที่เลือก</strong><span class="muted">${root.utils.escapeHtml(slot)}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          <div class="data-row"><strong>ราคาประมาณการ</strong><span class="muted">${price ? root.utils.formatBaht(price) : "กรุณาประเมินราคาก่อน"}</span></div>
        </div>
        <div class="notice">ระบบจะตรวจคิวช่างซ้ำทันทีอีกครั้งก่อนรับจอง หากคิวถูกจองไปแล้วจะให้เลือกเวลาใหม่</div>
        ${errors.length ? `
          <div class="state-box is-error">
            ${errors.map((error) => `<div>${root.utils.escapeHtml(error)}</div>`).join("")}
          </div>
        ` : root.utils.stateBox("success", "ข้อมูลและคิวช่างพร้อมส่งคำขอจองล่วงหน้า")}
        ${submit.status === "checking_slot" ? root.utils.stateBox("loading", "กำลังตรวจคิวช่างล่าสุดก่อนส่งจอง...") : ""}
        ${submit.status === "error" ? root.utils.stateBox("error", submit.error || "ส่งคำขอจองไม่สำเร็จ") : ""}
        <div class="button-row sticky-submit-row">
          <button class="primary-btn" type="button" data-action="submit-scheduled" ${pending || errors.length ? "disabled" : ""}>
            ${pending ? "กำลังตรวจสอบคิว..." : "ส่งคำขอจองช่วงเวลานี้"}
          </button>
        </div>
      </section>
    `;
  }

  function renderSuccess() {
    const result = root.state.scheduledSubmit.result;
    if (!result) return "";
    const trackingKey = result.token || result.booking_code || "";
    const selected = draft().selectedSlot || null;
    const selectedLabel = selected ? `${selected.date} ${selected.start}-${selected.end}` : "-";
    return `
      <section class="card success-card">
        <div class="success-mark">✓</div>
        <h2>ส่งคำขอจองแล้ว</h2>
        <div class="state-box is-success">ระบบรับคำขอในช่วงเวลาที่เลือกแล้ว คุณสามารถติดตามสถานะได้ทันที</div>
        <div class="data-list">
          <div class="data-row"><strong>เลข Booking</strong><span class="muted">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>ช่วงเวลาที่เลือก</strong><span class="muted">${root.utils.escapeHtml(selectedLabel)}</span></div>
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

  async function refreshPricing(container, options = {}) {
    const payload = payloadFromDraft();
    if (!payload) {
      resetDependentState();
      renderAll(container);
      return null;
    }
    availabilityRequestSeq += 1;
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    renderAll(container);
    try {
      const data = await root.api.previewPricing(payload);
      root.state.setScheduledPreview("pricing", { status: "success", data, error: "" });
      renderAll(container);
      if (options.loadSlots === true) await refreshAvailability(container);
      return data;
    } catch (error) {
      root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error.message });
      renderAll(container);
      return null;
    }
  }

  async function refreshAvailability(container) {
    const payload = payloadFromDraft();
    const pricing = root.state.scheduledPreview.pricing.data;
    const d = draft();
    if (!payload || !pricing || !d.date) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: "กรุณาเลือกบริการ วันที่ และประเมินราคาก่อน", query_key: "", loaded_at: "" });
      root.state.updateDraft("scheduled", { selectedSlot: null });
      renderAll(container);
      return null;
    }
    if (d.date < root.availability.bangkokTodayYmd()) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: "ไม่สามารถจองย้อนหลังได้", query_key: "", loaded_at: "" });
      root.state.updateDraft("scheduled", { selectedSlot: null });
      renderAll(container);
      return null;
    }

    const query = root.availability.publicAvailabilityQuery(d, payload, pricing);
    const expectedKey = root.availability.queryKey(query);
    const requestId = ++availabilityRequestSeq;
    root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "", query_key: expectedKey, loaded_at: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    renderAll(container);

    try {
      const data = await root.api.loadAvailability(query);
      if (requestId !== availabilityRequestSeq || expectedKey !== currentAvailabilityKey()) return null;
      root.state.setScheduledPreview("availability", {
        status: "success",
        data,
        error: "",
        query_key: expectedKey,
        loaded_at: new Date().toISOString(),
      });
      return data;
    } catch (error) {
      if (requestId !== availabilityRequestSeq) return null;
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: error.message, query_key: expectedKey, loaded_at: "" });
      return null;
    } finally {
      if (requestId === availabilityRequestSeq) renderAll(container);
    }
  }

  async function loadRealPriceAndSlots(container) {
    const s = service();
    if (s.needs_admin_estimate) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: s.admin_reason || "รายการนี้ต้องให้แอดมินประเมินก่อน", query_key: "", loaded_at: "" });
      renderAll(container);
      return;
    }
    if (!draft().date) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: "กรุณาเลือกวันที่ต้องการ", query_key: "", loaded_at: "" });
      renderAll(container);
      return;
    }
    if (!root.state.scheduledPreview.pricing.data) {
      await refreshPricing(container, { loadSlots: true });
      return;
    }
    await refreshAvailability(container);
  }

  async function revalidateSelectedSlot(container) {
    const selected = draft().selectedSlot || null;
    if (!selected) throw new Error("กรุณาเลือกช่วงเวลาที่มีช่างว่างจริง");
    const query = currentAvailabilityQuery();
    if (!query) throw new Error("ข้อมูลบริการหรือราคาไม่พร้อมสำหรับตรวจคิว");
    const expectedKey = root.availability.queryKey(query);
    const data = await root.api.loadAvailability(query);
    root.state.setScheduledPreview("availability", {
      status: "success",
      data,
      error: "",
      query_key: expectedKey,
      loaded_at: new Date().toISOString(),
    });
    const slots = root.availability.normalizePublicSlots(data, query.duration_min);
    const latest = slots.find((slot) => slot.key === selected.key && slot.start === selected.start && slot.date === selected.date);
    if (!latest) {
      root.state.updateDraft("scheduled", { selectedSlot: null });
      renderAll(container);
      throw new Error("คิวนี้เพิ่งถูกจองหรือไม่ว่างแล้ว กรุณาเลือกเวลาใหม่");
    }
    root.state.updateDraft("scheduled", { selectedSlot: { ...latest, query_key: expectedKey } });
    renderAll(container);
    return true;
  }

  async function submit(container) {
    const current = root.state.scheduledSubmit.status;
    if (["validating", "checking_slot", "submitting"].includes(current)) return;
    root.state.setScheduledSubmit({ status: "validating", error: "", result: null });
    renderAll(container);
    const errors = validateDraft();
    if (errors.length) {
      root.state.setScheduledSubmit({ status: "error", error: errors[0], result: null });
      renderAll(container);
      return;
    }

    root.state.setScheduledSubmit({ status: "checking_slot", error: "", result: null });
    renderAll(container);
    try {
      await revalidateSelectedSlot(container);
    } catch (error) {
      root.state.setScheduledSubmit({ status: "error", error: error.message || "คิวที่เลือกไม่พร้อมแล้ว", result: null });
      renderAll(container);
      return;
    }

    root.state.setScheduledSubmit({ status: "submitting", error: "", result: null });
    renderAll(container);
    try {
      const result = await root.api.submitScheduledBooking(buildSubmitPayload());
      root.state.setScheduledSubmit({ status: "success", error: "", result });
    } catch (error) {
      const isSlotConflict = /ช่วงเวลานี้เต็ม|ไม่ว่าง|slot/i.test(error.message || "");
      if (isSlotConflict) {
        root.state.updateDraft("scheduled", { selectedSlot: null });
        root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      }
      root.state.setScheduledSubmit({
        status: "error",
        error: isSlotConflict ? "คิวนี้ไม่ว่างแล้ว กรุณาโหลดคิวจริงและเลือกเวลาใหม่" : (error.message || "ส่งคำขอจองไม่สำเร็จ กรุณาลองอีกครั้ง"),
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
          availabilityRequestSeq += 1;
          patch.selectedSlot = null;
          root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
        }
        root.state.updateDraft("scheduled", patch);
        root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
        if (key === "machine_count") resetDependentState();
        renderAll(container);
        if (key === "date" && field.value && root.state.scheduledPreview.pricing.data) {
          refreshAvailability(container);
        }
      };
      const eventName = field.tagName === "SELECT" || field.type === "date" ? "change" : "input";
      field.addEventListener(eventName, handler);
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
    container.querySelector("[data-action='load-slots']").addEventListener("click", () => loadRealPriceAndSlots(container));
  }

  function bindDynamic(container) {
    container.querySelectorAll("[data-real-slot-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const slot = normalizedSlots().find((item) => item.key === button.getAttribute("data-real-slot-key"));
        const availability = root.state.scheduledPreview.availability;
        if (!slot || availability.status !== "success") return;
        root.state.updateDraft("scheduled", {
          selectedSlot: {
            ...slot,
            query_key: availability.query_key,
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
            <p>เลือกบริการและวันที่ ระบบจะแสดงเฉพาะคิวจริงที่มีช่างว่างตามระยะเวลางาน</p>
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
              <p class="muted">ระบบจะคำนวณราคาให้ตามบริการ จำนวนเครื่อง และโปรโมชั่นที่ใช้ได้</p>
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
              <span class="section-kicker">Real technician slots</span>
              <h2>เลือกคิวช่างจริง</h2>
              <p class="muted">แสดงเฉพาะช่วงเวลาที่มีทีมช่างพร้อมตามระยะเวลาของงาน</p>
            </div>
            <div data-availability-preview>${renderAvailability()}</div>
            <div class="button-row">
              <button class="primary-btn action-btn" type="button" data-action="load-slots" ${s.needs_admin_estimate ? "disabled" : ""}>ดูราคาและคิวว่างจริง</button>
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
