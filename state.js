(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const STEPS = [
    { id: "service", label: "บริการ" },
    { id: "details", label: "รายละเอียด" },
    { id: "location", label: "สถานที่" },
    { id: "slot", label: "วันเวลา" },
    { id: "price", label: "ราคา" },
    { id: "review", label: "ยืนยัน" },
  ];
  let availabilityRequestSeq = 0;

  function draft() { return root.state.draft.scheduled || {}; }
  function service() { return root.services.normalizeServiceDraft(draft()); }
  function payloadFromDraft() { return root.services.payloadFromServiceDraft(draft()); }
  function currentStep() {
    const value = Number(draft().wizard_step || 1);
    return Math.max(1, Math.min(STEPS.length, Number.isFinite(value) ? value : 1));
  }
  function setStep(step) {
    root.state.updateDraft("scheduled", { wizard_step: Math.max(1, Math.min(STEPS.length, Number(step || 1))) });
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
    return `<div class="choice-grid ${extraClass || ""}">${options.map((option) => {
      const active = String(selected || "") === String(option.value);
      return `<button class="choice-card ${active ? "is-selected" : ""}" type="button" data-scheduled-choice="${field}" data-choice-value="${root.utils.escapeHtml(option.value)}"><strong>${root.utils.escapeHtml(option.label)}</strong>${option.copy ? `<span>${root.utils.escapeHtml(option.copy)}</span>` : ""}</button>`;
    }).join("")}</div>`;
  }

  function renderProgress() {
    const step = currentStep();
    return `<div class="wizard-progress wizard-progress-real" aria-label="ขั้นตอนการจองล่วงหน้า">${STEPS.map((item, index) => {
      const n = index + 1;
      const cls = n === step ? "is-active" : n < step ? "is-complete" : "";
      return `<span class="${cls}"><b>${n}</b><small>${item.label}</small></span>`;
    }).join("")}</div>`;
  }

  function servicePatch(field, value) {
    const patch = { [field]: value };
    if (field === "service_kind") {
      const kind = root.services.serviceKinds.find((item) => item.value === value);
      patch.job_type = kind ? kind.job_type : "ล้าง";
      patch.repair_variant = kind && kind.repair_variant ? kind.repair_variant : "";
      if (value === "clean") patch.wash_variant = draft().wash_variant || "ล้างธรรมดา";
    }
    if (field === "ac_type" && value !== "ผนัง") patch.wash_variant = draft().wash_variant || "ล้างธรรมดา";
    return patch;
  }

  function renderServiceStep() {
    const s = service();
    return `<section class="card form-card wizard-card"><div class="section-head"><span class="section-kicker">Step 1</span><h2>เลือกบริการ</h2><p class="muted">เลือกงานที่ต้องการก่อน แล้วค่อยระบุรายละเอียดในขั้นถัดไป</p></div><div class="field field-wide">${renderChoiceGroup("service_kind", root.services.serviceKinds, s.service_kind, "service-kind-grid")}</div></section>`;
  }

  function renderDetailsStep() {
    const d = draft();
    const s = service();
    return `<section class="card form-card wizard-card"><div class="section-head"><span class="section-kicker">Step 2</span><h2>รายละเอียดแอร์</h2></div><div class="form-grid service-taxonomy-grid"><div class="field field-wide"><label>ชนิดแอร์</label>${renderChoiceGroup("ac_type", root.services.acTypes, s.ac_type, "ac-type-grid")}</div>${s.job_type === "ล้าง" && s.ac_type === "ผนัง" ? `<div class="field field-wide"><label>รูปแบบการล้าง</label>${renderChoiceGroup("wash_variant", root.services.washVariants, s.wash_variant || d.wash_variant, "wash-variant-grid")}</div>` : ""}${s.job_type === "ซ่อม" && s.service_kind !== "inspect" ? `<div class="field field-wide"><label>ลักษณะงานซ่อม</label>${renderChoiceGroup("repair_variant", root.services.repairVariants, s.repair_variant || d.repair_variant, "compact-choice-grid")}</div>` : ""}<div class="field field-wide"><label>BTU</label>${renderChoiceGroup("btu", root.services.btuOptions, s.btu_value || d.btu, "btu-choice-grid")}</div><div class="field"><label for="scheduled-count">จำนวนเครื่อง</label><select id="scheduled-count" class="select" data-scheduled-field="machine_count">${root.services.machineCounts.map((n) => `<option value="${n}" ${Number(s.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}</select></div><div class="field"><label for="scheduled-zone">พื้นที่บริการ</label><input id="scheduled-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-scheduled-field="job_zone" placeholder="เช่น อ่อนนุช บางนา พระราม 3"></div></div>${s.needs_admin_estimate ? root.utils.stateBox("warning", `${s.admin_reason || "รายการนี้ต้องให้แอดมินประเมิน"} ระบบจะไม่ยืนยันราคาอัตโนมัติ`) : ""}</section>`;
  }

  function renderLocationStep() {
    const d = draft();
    const locationType = d.location_type || "house";
    const showBuilding = locationType !== "house";
    return `<section class="card form-card wizard-card"><div class="section-head"><span class="section-kicker">Step 3</span><h2>ข้อมูลผู้ติดต่อและสถานที่</h2><p class="muted">ข้อมูลนี้ใช้สำหรับงานนี้เท่านั้น และช่วยให้ช่างเข้าหน้างานได้ถูกต้อง</p></div><div class="form-grid"><div class="field"><label for="scheduled-name">ชื่อผู้ติดต่อ</label><input id="scheduled-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-scheduled-field="customer_name" autocomplete="name" placeholder="เช่น คุณสมชาย"></div><div class="field"><label for="scheduled-phone">เบอร์โทร</label><input id="scheduled-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-scheduled-field="customer_phone" inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX"></div><div class="field field-wide"><label for="scheduled-location-type">ประเภทสถานที่</label><select id="scheduled-location-type" class="select" data-scheduled-field="location_type"><option value="house" ${locationType === "house" ? "selected" : ""}>บ้าน</option><option value="condo" ${locationType === "condo" ? "selected" : ""}>คอนโด / อพาร์ตเมนต์</option><option value="office" ${locationType === "office" ? "selected" : ""}>สำนักงาน / ร้านค้า</option><option value="other" ${locationType === "other" ? "selected" : ""}>สถานที่อื่น</option></select></div><div class="field field-wide"><label for="scheduled-address">ที่อยู่หน้างาน</label><textarea id="scheduled-address" class="input textarea" data-scheduled-field="address_text" rows="3" placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด">${root.utils.escapeHtml(d.address_text || "")}</textarea></div><div class="field field-wide"><label for="scheduled-maps">ลิงก์ Google Maps</label><input id="scheduled-maps" class="input" value="${root.utils.escapeHtml(d.maps_url || "")}" data-scheduled-field="maps_url" inputmode="url" placeholder="https://maps.app.goo.gl/..."></div>${showBuilding ? `<div class="field"><label for="scheduled-building">ชื่ออาคาร / คอนโด</label><input id="scheduled-building" class="input" value="${root.utils.escapeHtml(d.building_name || "")}" data-scheduled-field="building_name"></div><div class="field"><label for="scheduled-room">ห้อง / ชั้น / อาคาร</label><input id="scheduled-room" class="input" value="${root.utils.escapeHtml(d.room_floor || "")}" data-scheduled-field="room_floor" placeholder="เช่น ห้อง 812 ชั้น 8 อาคาร A"></div><div class="field field-wide"><label for="scheduled-access">ข้อมูลนิติ / ที่จอด / การเข้าพื้นที่</label><textarea id="scheduled-access" class="input textarea" data-scheduled-field="access_note" rows="3" placeholder="เวลานิติอนุญาต ค่าจอด คีย์การ์ด แลกบัตร ลิฟต์ หรือข้อจำกัดอาคาร">${root.utils.escapeHtml(d.access_note || "")}</textarea></div>` : ""}<div class="field field-wide"><label for="scheduled-note">หมายเหตุเพิ่มเติม</label><textarea id="scheduled-note" class="input textarea" data-scheduled-field="customer_note" rows="3">${root.utils.escapeHtml(d.customer_note || "")}</textarea></div></div></section>`;
  }

  function currentAvailabilityQuery() {
    const payload = payloadFromDraft();
    const pricing = root.state.scheduledPreview.pricing.data;
    if (!payload || !pricing || !draft().date) return null;
    return root.availability.publicAvailabilityQuery(draft(), payload, pricing);
  }
  function currentAvailabilityKey() { const q = currentAvailabilityQuery(); return q ? root.availability.queryKey(q) : ""; }
  function normalizedSlots() { return root.availability.normalizePublicSlots(root.state.scheduledPreview.availability.data, root.state.scheduledPreview.pricing.data?.duration_min); }

  function renderAvailability() {
    const availability = root.state.scheduledPreview.availability;
    const selected = draft().selectedSlot || null;
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังตรวจคิวจริงจากตารางงานช่าง...");
    if (availability.status === "error") return root.utils.stateBox("error", availability.error || "โหลดคิวไม่สำเร็จ");
    if (!availability.data) return root.utils.stateBox("", "เลือกวันที่แล้วกดดูคิวว่างจริง");
    const slots = normalizedSlots();
    if (!slots.length) return root.utils.stateBox("warning", "วันที่เลือกยังไม่มี Slot ที่ตรงกับบริการนี้ กรุณาเลือกวันอื่น");
    return `<div class="availability-meta"><strong>ช่วงเวลาที่เปิดให้ลูกค้าเลือก</strong><span>${root.utils.escapeHtml(availability.data.date || draft().date)} · ใช้เวลาประมาณ ${root.utils.escapeHtml(availability.data.duration_min || "-")} นาที</span></div><div class="real-slot-grid">${slots.map((slot) => { const active = selected && selected.key === slot.key && selected.query_key === availability.query_key; return `<button class="real-slot-card ${active ? "is-selected" : ""}" type="button" aria-pressed="${active ? "true" : "false"}" data-real-slot-key="${root.utils.escapeHtml(slot.key)}"><strong>${root.utils.escapeHtml(slot.start)}</strong><span>ถึง ${root.utils.escapeHtml(slot.end)}</span><small>ว่าง</small></button>`; }).join("")}</div>${selected && selected.query_key === availability.query_key ? `<div class="selected-slot-banner"><span>เวลาที่เลือก</span><strong>${root.utils.escapeHtml(selected.date)} · ${root.utils.escapeHtml(selected.start)}-${root.utils.escapeHtml(selected.end)}</strong></div>` : ""}<p class="muted slot-source-note">ไม่แสดงชื่อช่าง และแสดงเฉพาะ Slot ของช่างที่ Admin อนุญาตและรับงานประเภทนี้ได้</p>`;
  }

  function renderSlotStep() {
    const d = draft();
    return `<section class="card preview-section-card wizard-card"><div class="section-head"><span class="section-kicker">Step 4</span><h2>เลือกวันและเวลา</h2><p class="muted">ระบบจะแสดงเฉพาะ Slot จริงที่ตรงกับบริการนี้</p></div><div class="field"><label for="scheduled-date">วันที่ต้องการ</label><input id="scheduled-date" class="input" type="date" min="${root.utils.escapeHtml(root.availability.bangkokTodayYmd())}" value="${root.utils.escapeHtml(d.date || "")}" data-scheduled-field="date"></div><div data-availability-preview>${renderAvailability()}</div><div class="button-row"><button class="primary-btn" type="button" data-action="load-slots">ดูคิวว่างจริง</button></div></section>`;
  }

  function renderPricing() {
    const pricing = root.state.scheduledPreview.pricing;
    if (pricing.status === "loading") return root.utils.stateBox("loading", "กำลังคำนวณราคา...");
    if (pricing.status === "error") return root.utils.stateBox("error", pricing.error || "ยังคำนวณราคาไม่ได้");
    if (!pricing.data) return root.utils.stateBox("", "ระบบจะคำนวณราคาจากบริการที่เลือก");
    return `<div class="preview-grid"><div class="preview-card price-card"><span class="muted">ราคาประเมิน</span><strong>${root.utils.formatBaht(finalPrice())}</strong><small>ราคานี้เป็นราคาประเมินเบื้องต้น หากมีรายการเพิ่มเติม ทีมงานจะแจ้งก่อนเริ่มงานทุกครั้ง</small></div><div class="preview-card"><span class="muted">เวลาทำงานโดยประมาณ</span><strong>${root.utils.escapeHtml(pricing.data.duration_min || "-")} นาที</strong></div>${pricing.data.promo ? `<div class="state-box is-success">ใช้โปร: ${root.utils.escapeHtml(pricing.data.promo.promo_name || "-")}</div>` : ""}</div>`;
  }

  function renderPriceStep() {
    return `<section class="card preview-section-card wizard-card"><div class="section-head"><span class="section-kicker">Step 5</span><h2>ตรวจสอบราคา</h2></div><div data-pricing-preview>${renderPricing()}</div></section>`;
  }

  function buildCustomerNote() {
    const d = draft();
    const parts = [];
    if (d.location_type && d.location_type !== "house") parts.push(`ประเภทสถานที่: ${d.location_type}`);
    if (d.building_name) parts.push(`อาคาร/คอนโด: ${d.building_name}`);
    if (d.room_floor) parts.push(`ห้อง/ชั้น/อาคาร: ${d.room_floor}`);
    if (d.access_note) parts.push(`ข้อมูลเข้าพื้นที่: ${d.access_note}`);
    if (d.customer_note) parts.push(String(d.customer_note).trim());
    return parts.filter(Boolean).join("\n");
  }

  function buildSubmitPayload() {
    const d = draft();
    return { customer_name: String(d.customer_name || "").trim(), customer_phone: String(d.customer_phone || "").trim(), appointment_datetime: appointmentDatetime(), address_text: String(d.address_text || "").trim(), maps_url: root.utils.safeHttpsUrl ? root.utils.safeHttpsUrl(d.maps_url) : String(d.maps_url || "").trim(), customer_note: buildCustomerNote(), booking_mode: "scheduled", client_app: "customer_app_v2", job_zone: String(d.job_zone || "").trim(), ...payloadFromDraft() };
  }

  function validateStep(step) {
    const d = draft();
    const s = service();
    const errors = [];
    if (step === 1 && !s.service_kind) errors.push("กรุณาเลือกบริการ");
    if (step === 2) {
      if (!s.ac_type || s.ac_type === root.services.UNKNOWN_AC) errors.push("กรุณาเลือกชนิดแอร์");
      if (!s.btu || s.btu_value === root.services.UNKNOWN_BTU) errors.push("กรุณาเลือก BTU");
      if (s.job_type === "ล้าง" && s.ac_type === "ผนัง" && !s.wash_variant) errors.push("กรุณาเลือกรูปแบบการล้าง");
      if (!payloadFromDraft()) errors.push(s.admin_reason || "รายการนี้ยังไม่พร้อมจองอัตโนมัติ");
    }
    if (step === 3) {
      const digits = String(d.customer_phone || "").replace(/\D/g, "");
      if (!String(d.customer_name || "").trim()) errors.push("กรุณากรอกชื่อผู้ติดต่อ");
      if (digits.length < 9 || digits.length > 10) errors.push("กรุณากรอกเบอร์โทร 9-10 หลัก");
      if (!String(d.address_text || "").trim()) errors.push("กรุณากรอกที่อยู่หน้างาน");
      if (String(d.maps_url || "").trim() && root.utils.safeHttpsUrl && !root.utils.safeHttpsUrl(d.maps_url)) errors.push("กรุณาใช้ลิงก์แผนที่แบบ HTTPS");
      if ((d.location_type || "house") !== "house" && !String(d.building_name || "").trim()) errors.push("กรุณากรอกชื่ออาคารหรือคอนโด");
    }
    if (step === 4) {
      if (!d.date) errors.push("กรุณาเลือกวันที่");
      if (!d.selectedSlot) errors.push("กรุณาเลือก Slot ที่ว่าง");
      if (d.selectedSlot && d.selectedSlot.query_key !== root.state.scheduledPreview.availability.query_key) errors.push("Slot ที่เลือกไม่ตรงกับข้อมูลล่าสุด");
    }
    if (step === 5 && !root.state.scheduledPreview.pricing.data) errors.push("กรุณาคำนวณราคาก่อน");
    return errors;
  }

  function fullValidation() { return [1,2,3,4,5].flatMap(validateStep); }

  function renderReviewStep() {
    const d = draft();
    const slot = d.selectedSlot ? `${d.selectedSlot.date} ${d.selectedSlot.start}-${d.selectedSlot.end}` : "-";
    const submit = root.state.scheduledSubmit;
    const errors = fullValidation();
    const pending = ["validating", "checking_slot", "submitting"].includes(submit.status);
    return `<section class="card review-card wizard-card"><div class="section-head"><span class="section-kicker">Step 6</span><h2>ตรวจสอบและยืนยัน</h2></div><div class="data-list"><div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(root.services.serviceLabel(service()))}</span></div><div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div><div class="data-row"><strong>สถานที่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div><div class="data-row"><strong>วันเวลา</strong><span class="muted">${root.utils.escapeHtml(slot)}</span></div><div class="data-row"><strong>ราคาประเมิน</strong><span class="muted">${root.utils.formatBaht(finalPrice())}</span></div></div><div class="notice">ระบบจะตรวจ Slot ซ้ำก่อนสร้างงานจริง</div>${submit.status === "error" ? root.utils.stateBox("error", submit.error || "ส่งคำขอไม่สำเร็จ") : ""}${errors.length ? root.utils.stateBox("error", errors[0]) : root.utils.stateBox("success", "ข้อมูลพร้อมส่งคำขอจอง")}</section>`;
  }

  function renderSuccess() {
    const result = root.state.scheduledSubmit.result;
    const key = result?.token || result?.booking_code || "";
    return `<section class="screen"><section class="card success-card"><div class="success-mark">✓</div><h2>ส่งคำขอจองแล้ว</h2><div class="data-list"><div class="data-row"><strong>เลข Booking</strong><span class="muted">${root.utils.escapeHtml(result?.booking_code || "-")}</span></div></div><div class="button-row"><button class="primary-btn" type="button" data-action="track-created" data-tracking-key="${root.utils.escapeHtml(key)}">ติดตามงาน</button></div></section></section>`;
  }

  function renderNavigation() {
    const step = currentStep();
    const errors = step < STEPS.length ? validateStep(step) : fullValidation();
    const pending = ["validating", "checking_slot", "submitting"].includes(root.state.scheduledSubmit.status);
    return `<div class="wizard-nav"><button class="secondary-btn" type="button" data-wizard-back ${step === 1 || pending ? "disabled" : ""}>ย้อนกลับ</button>${step < STEPS.length ? `<button class="primary-btn" type="button" data-wizard-next ${errors.length || pending ? "disabled" : ""}>ถัดไป</button>` : `<button class="primary-btn" type="button" data-action="submit-scheduled" ${errors.length || pending ? "disabled" : ""}>${pending ? "กำลังตรวจสอบ..." : "ยืนยันจอง"}</button>`}</div><p class="wizard-inline-error" data-wizard-error ${errors.length ? "" : "hidden"}>${errors.length ? root.utils.escapeHtml(errors[0]) : ""}</p>`;
  }

  function updateNavigationState(container) {
    const step = currentStep();
    const errors = step < STEPS.length ? validateStep(step) : fullValidation();
    const pending = ["validating", "checking_slot", "submitting"].includes(root.state.scheduledSubmit.status);
    const next = container.querySelector("[data-wizard-next]");
    const submitButton = container.querySelector("[data-action='submit-scheduled']");
    if (next) next.disabled = Boolean(errors.length || pending);
    if (submitButton) submitButton.disabled = Boolean(errors.length || pending);
    const errorNode = container.querySelector("[data-wizard-error]");
    if (errorNode) {
      errorNode.textContent = errors[0] || "";
      errorNode.hidden = !errors.length;
    }
  }

  async function refreshPricing(container, options = {}) {
    const payload = payloadFromDraft();
    if (!payload) return null;
    availabilityRequestSeq += 1;
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    render(container);
    try {
      const data = await root.api.previewPricing(payload);
      root.state.setScheduledPreview("pricing", { status: "success", data, error: "" });
      if (options.loadSlots) await refreshAvailability(container);
      else render(container);
      return data;
    } catch (error) {
      root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error?.message || "คำนวณราคาไม่สำเร็จ" });
      render(container);
      return null;
    }
  }

  async function refreshAvailability(container) {
    const payload = payloadFromDraft();
    const pricing = root.state.scheduledPreview.pricing.data;
    const d = draft();
    if (!payload || !pricing || !d.date) return null;
    const query = root.availability.publicAvailabilityQuery(d, payload, pricing);
    const key = root.availability.queryKey(query);
    const requestId = ++availabilityRequestSeq;
    root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "", query_key: key, loaded_at: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    render(container);
    try {
      const data = await root.api.loadAvailability(query);
      if (requestId !== availabilityRequestSeq) return null;
      root.state.setScheduledPreview("availability", { status: "success", data, error: "", query_key: key, loaded_at: new Date().toISOString() });
      return data;
    } catch (error) {
      if (requestId !== availabilityRequestSeq) return null;
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: error?.message || "โหลดคิวไม่สำเร็จ", query_key: key, loaded_at: "" });
      return null;
    } finally { if (requestId === availabilityRequestSeq) render(container); }
  }

  async function loadRealPriceAndSlots(container) {
    if (!draft().date) { root.state.setScheduledPreview("availability", { status: "error", data: null, error: "กรุณาเลือกวันที่", query_key: "", loaded_at: "" }); render(container); return; }
    if (!root.state.scheduledPreview.pricing.data) await refreshPricing(container, { loadSlots: true });
    else await refreshAvailability(container);
  }

  async function revalidateSelectedSlot(container) {
    const selected = draft().selectedSlot;
    const query = currentAvailabilityQuery();
    if (!selected || !query) throw new Error("ข้อมูล Slot ไม่พร้อม");
    const key = root.availability.queryKey(query);
    const data = await root.api.loadAvailability(query);
    const latest = root.availability.normalizePublicSlots(data, query.duration_min).find((slot) => slot.key === selected.key && slot.start === selected.start && slot.date === selected.date);
    if (!latest) { root.state.updateDraft("scheduled", { selectedSlot: null }); throw new Error("Slot นี้ไม่ว่างแล้ว กรุณาเลือกใหม่"); }
    root.state.setScheduledPreview("availability", { status: "success", data, error: "", query_key: key, loaded_at: new Date().toISOString() });
    root.state.updateDraft("scheduled", { selectedSlot: { ...latest, query_key: key } });
  }

  async function submit(container) {
    if (fullValidation().length) { root.state.setScheduledSubmit({ status: "error", error: fullValidation()[0], result: null }); render(container); return; }
    root.state.setScheduledSubmit({ status: "checking_slot", error: "", result: null }); render(container);
    try { await revalidateSelectedSlot(container); }
    catch (error) { root.state.setScheduledSubmit({ status: "error", error: error?.message || "คิวไม่พร้อม", result: null }); render(container); return; }
    root.state.setScheduledSubmit({ status: "submitting", error: "", result: null }); render(container);
    try { const result = await root.api.submitScheduledBooking(buildSubmitPayload()); root.state.setScheduledSubmit({ status: "success", error: "", result }); }
    catch (error) { root.state.setScheduledSubmit({ status: "error", error: error?.message || "ส่งคำขอไม่สำเร็จ", result: null }); }
    render(container);
  }

  function bind(container) {
    container.querySelectorAll("[data-scheduled-field]").forEach((field) => {
      const eventName = field.tagName === "SELECT" || field.type === "date" ? "change" : "input";
      field.addEventListener(eventName, () => {
        const key = field.getAttribute("data-scheduled-field");
        const patch = { [key]: field.value };
        if (["machine_count", "date"].includes(key)) { patch.selectedSlot = null; root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" }); }
        root.state.updateDraft("scheduled", patch);
        root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
        if (["machine_count", "date", "location_type"].includes(key)) render(container);
        else updateNavigationState(container);
      });
    });
    container.querySelectorAll("[data-scheduled-choice]").forEach((button) => button.addEventListener("click", () => { root.state.updateDraft("scheduled", servicePatch(button.dataset.scheduledChoice, button.dataset.choiceValue)); resetDependentState(); render(container); }));
    container.querySelectorAll("[data-real-slot-key]").forEach((button) => button.addEventListener("click", () => { const slot = normalizedSlots().find((item) => item.key === button.dataset.realSlotKey); const availability = root.state.scheduledPreview.availability; if (!slot) return; root.state.updateDraft("scheduled", { selectedSlot: { ...slot, query_key: availability.query_key } }); render(container); }));
    container.querySelector("[data-action='load-slots']")?.addEventListener("click", () => loadRealPriceAndSlots(container));
    container.querySelector("[data-wizard-back]")?.addEventListener("click", () => { setStep(currentStep() - 1); render(container); });
    container.querySelector("[data-wizard-next]")?.addEventListener("click", async () => { const step = currentStep(); const errors = validateStep(step); if (errors.length) return; if (step === 4 && !root.state.scheduledPreview.pricing.data) await refreshPricing(container); setStep(step + 1); render(container); });
    container.querySelector("[data-action='submit-scheduled']")?.addEventListener("click", () => submit(container));
    container.querySelector("[data-action='track-created']")?.addEventListener("click", () => { const key = container.querySelector("[data-action='track-created']")?.dataset.trackingKey || ""; root.state.updateDraft("tracking", { trackingCode: key }); root.utils.routeTo("tracking"); });
  }

  function renderStep() {
    switch (currentStep()) {
      case 1: return renderServiceStep();
      case 2: return renderDetailsStep();
      case 3: return renderLocationStep();
      case 4: return renderSlotStep();
      case 5: return renderPriceStep();
      default: return renderReviewStep();
    }
  }

  function render(container) {
    if (root.state.scheduledSubmit.status === "success") { container.innerHTML = renderSuccess(); bind(container); return; }
    root.state.ensureSavedAddressPrefill("scheduled", () => { if (root.state.currentRoute === "scheduled") render(container); });
    container.innerHTML = `<section class="screen scheduled-wizard-screen"><div class="hero scheduled-hero"><div class="hero-badge">จองล่วงหน้า</div><h2>เลือกบริการและคิวจริงทีละขั้นตอน</h2><p>ระบบจะไม่รวมทุกอย่างไว้หน้าเดียว และจะตรวจ Slot ซ้ำก่อนสร้างงาน</p></div>${renderProgress()}${renderStep()}${renderNavigation()}</section>`;
    bind(container);
  }

  root.bookingScheduled = { render };
})();
