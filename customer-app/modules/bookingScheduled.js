(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const MAX_ADVANCE_DAYS = 90;
  let availabilityRequestSeq = 0;
  let recoveryPromise = null;

  function draft() {
    return root.state.draft.scheduled || {};
  }

  function service() {
    return root.services.normalizeServiceDraft(draft());
  }

  function payloadFromDraft() {
    return root.services.payloadFromServiceDraft(draft());
  }

  function step() {
    return Math.max(1, Math.min(5, Number(root.state.scheduledWizard?.step || 1)));
  }

  function finalPrice() {
    const data = root.state.scheduledPreview.pricing.data;
    if (!data) return null;
    if (data.promo && data.promo.total_after_discount != null) return Number(data.promo.total_after_discount);
    return Number(data.active_price || data.standard_price || 0) || null;
  }

  function appointmentDatetime() {
    const d = draft();
    const selected = d.selectedSlot || null;
    if (!d.date || !selected || !selected.start || selected.date !== d.date) return "";
    return `${d.date}T${selected.start}:00`;
  }

  function dateFromYmd(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function ymdFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(value, days) {
    const date = dateFromYmd(value);
    if (!date) return value;
    date.setDate(date.getDate() + Number(days || 0));
    return ymdFromDate(date);
  }

  function monthLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return "";
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" })
      .format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  }

  function changeMonth(value, delta) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    const base = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
      : dateFromYmd(root.availability.bangkokTodayYmd());
    base.setMonth(base.getMonth() + Number(delta || 0));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  }

  function isAllowedMapsUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return true;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname.toLowerCase();
      return host === "maps.app.goo.gl"
        || host === "goo.gl"
        || host === "maps.google.com"
        || host === "google.com"
        || host === "www.google.com"
        || host === "google.co.th"
        || host === "www.google.co.th";
    } catch (_) {
      return false;
    }
  }

  function monthWithinRange(month) {
    const today = root.availability.bangkokTodayYmd();
    const maxDate = addDays(today, MAX_ADVANCE_DAYS);
    const minMonth = today.slice(0, 7);
    const maxMonth = maxDate.slice(0, 7);
    return month >= minMonth && month <= maxMonth;
  }

  function resetPriceAndSlots() {
    availabilityRequestSeq += 1;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function resetSlots() {
    availabilityRequestSeq += 1;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function prefillContact() {
    const customer = root.state.customer;
    if (!customer?.logged_in) return;
    const d = draft();
    const user = customer.user || {};
    const profile = customer.profile || {};
    const patch = {};
    const name = String(user.name || customer.display_name || profile.display_name || "").trim();
    const phone = String(profile.phone || customer.phone || user.phone || "").trim();
    if (!String(d.customer_name || "").trim() && name) patch.customer_name = name;
    if (!String(d.customer_phone || "").trim() && phone) patch.customer_phone = phone;
    if (Object.keys(patch).length) root.state.updateDraft("scheduled", patch);
    root.state.prefillSavedAddress("scheduled");
  }

  function choiceGroup(field, options, selected, className) {
    return `<div class="choice-grid ${className || ""}">${options.map((option) => {
      const active = String(selected || "") === String(option.value);
      return `
        <button class="choice-card ${active ? "is-selected" : ""}" type="button"
          data-scheduled-choice="${root.utils.escapeHtml(field)}"
          data-choice-value="${root.utils.escapeHtml(option.value)}"
          aria-pressed="${active ? "true" : "false"}">
          <strong>${root.utils.escapeHtml(option.label)}</strong>
          ${option.copy ? `<span>${root.utils.escapeHtml(option.copy)}</span>` : ""}
        </button>
      `;
    }).join("")}</div>`;
  }

  function renderProgress() {
    const labels = ["ข้อมูลลูกค้า", "บริการ", "ราคา", "วันและเวลา", "ยืนยัน"];
    const current = step();
    return `
      <ol class="booking-stepper" aria-label="ขั้นตอนจองล้างแอร์">
        ${labels.map((label, index) => {
          const n = index + 1;
          const status = n < current ? "is-done" : (n === current ? "is-active" : "");
          return `<li class="${status}" aria-current="${n === current ? "step" : "false"}"><span>${n < current ? "✓" : n}</span><strong>${label}</strong></li>`;
        }).join("")}
      </ol>
    `;
  }

  function renderStepOne() {
    const d = draft();
    const s = service();
    return `
      <section class="card booking-wizard-card">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 2 จาก 5</span>
          <h2>เลือกรายละเอียดงานล้าง</h2>
          <p class="muted">ระบบเปิดจองออนไลน์เฉพาะงานล้างที่มีราคาและระยะเวลามาตรฐาน</p>
        </div>
        <div class="field field-wide">
          <label>ชนิดแอร์</label>
          ${choiceGroup("ac_type", root.services.bookableAcTypes, s.ac_type, "ac-type-grid")}
        </div>
        ${s.ac_type === "ผนัง" ? `
          <div class="field field-wide">
            <label>รูปแบบการล้าง</label>
            ${choiceGroup("wash_variant", root.services.washVariants, s.wash_variant || d.wash_variant, "wash-variant-grid")}
          </div>
        ` : `
          <div class="state-box">แอร์ชนิดนี้ใช้ราคามาตรฐานตามชนิดเครื่อง จำนวน และ BTU โดยไม่ต้องเลือกรูปแบบล้างแอร์ผนัง</div>
        `}
        <div class="field field-wide">
          <label>ขนาด BTU</label>
          ${choiceGroup("btu", root.services.bookableBtuOptions, s.btu_value || d.btu, "btu-choice-grid")}
        </div>
        <div class="field">
          <label for="scheduled-count">จำนวนเครื่อง</label>
          <select id="scheduled-count" class="select" data-scheduled-field="machine_count">
            ${root.services.machineCounts.map((n) => `<option value="${n}" ${Number(s.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
          </select>
        </div>
        ${root.state.scheduledPreview.pricing.status === "loading" ? root.utils.stateBox("loading", "กำลังคำนวณราคาและเวลาทำงานจากระบบจริง...") : ""}
        ${root.state.scheduledPreview.pricing.status === "error" ? root.utils.stateBox("error", root.state.scheduledPreview.pricing.error || "คำนวณราคาไม่สำเร็จ") : ""}
      </section>
    `;
  }

  function renderPricingSummary() {
    const data = root.state.scheduledPreview.pricing.data;
    if (!data) return root.utils.stateBox("warning", "ยังไม่มีข้อมูลราคา กรุณาย้อนกลับไปเลือกรายละเอียดบริการใหม่");
    return `
      <div class="wizard-price-summary">
        <div><span>ราคาประมาณการ</span><strong>${root.utils.formatBaht(finalPrice())}</strong></div>
        <div><span>เวลาทำงานโดยประมาณ</span><strong>${root.utils.escapeHtml(data.duration_min || "-")} นาที</strong></div>
        ${data.promo ? `<small>ใช้โปรโมชั่น: ${root.utils.escapeHtml(data.promo.promo_name || "โปรโมชั่นปัจจุบัน")}</small>` : ""}
      </div>
    `;
  }

  function renderCalendar() {
    const d = draft();
    const today = root.availability.bangkokTodayYmd();
    const maxDate = addDays(today, MAX_ADVANCE_DAYS);
    const month = monthWithinRange(d.calendar_month || "") ? d.calendar_month : d.date.slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1, 12);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(`<span class="calendar-day is-empty" aria-hidden="true"></span>`);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateValue = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const disabled = dateValue < today || dateValue > maxDate;
      const selected = dateValue === d.date;
      const isToday = dateValue === today;
      cells.push(`
        <button type="button" class="calendar-day ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""}"
          data-calendar-date="${dateValue}" ${disabled ? "disabled" : ""}
          aria-pressed="${selected ? "true" : "false"}" aria-label="${root.utils.escapeHtml(dateValue)}">
          <span>${day}</span>${isToday ? "<small>วันนี้</small>" : ""}
        </button>
      `);
    }
    const previous = changeMonth(month, -1);
    const next = changeMonth(month, 1);
    return `
      <div class="booking-calendar">
        <div class="calendar-toolbar">
          <button type="button" class="calendar-nav" data-calendar-month="-1" ${monthWithinRange(previous) ? "" : "disabled"} aria-label="เดือนก่อน">‹</button>
          <strong>${root.utils.escapeHtml(monthLabel(month))}</strong>
          <button type="button" class="calendar-nav" data-calendar-month="1" ${monthWithinRange(next) ? "" : "disabled"} aria-label="เดือนถัดไป">›</button>
        </div>
        <div class="calendar-weekdays" aria-hidden="true"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>
        <div class="calendar-grid">${cells.join("")}</div>
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
    const state = root.state.scheduledPreview.availability;
    return root.availability.normalizePublicSlots(state.data, root.state.scheduledPreview.pricing.data?.duration_min);
  }

  function renderSlots() {
    const availability = root.state.scheduledPreview.availability;
    const selected = draft().selectedSlot || null;
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังตรวจคิวว่างจริงจากตารางงานช่าง CWF...");
    if (availability.status === "error") {
      return `${root.utils.stateBox("error", availability.error || "โหลดคิวว่างไม่สำเร็จ")}<button type="button" class="secondary-btn" data-action="reload-slots">ลองโหลดคิวอีกครั้ง</button>`;
    }
    if (!availability.data) return root.utils.stateBox("", "เลือกวันที่ในปฏิทิน ระบบจะโหลดเฉพาะช่วงเวลาที่ช่าง CWF ว่างจริง");
    const slots = normalizedSlots();
    if (!slots.length) {
      return `${root.utils.stateBox("warning", "วันที่เลือกไม่มีคิวช่างว่างสำหรับระยะเวลางานนี้ กรุณาเลือกวันอื่น")}<button type="button" class="secondary-btn" data-action="reload-slots">ตรวจคิววันนี้อีกครั้ง</button>`;
    }
    return `
      <div class="availability-meta"><strong>คิวว่างวันที่ ${root.utils.escapeHtml(draft().date)}</strong><span>ระบบจะตรวจซ้ำอีกครั้งก่อนส่งจอง</span></div>
      <div class="real-slot-grid">
        ${slots.map((slot) => {
          const active = selected && selected.key === slot.key && selected.query_key === availability.query_key;
          return `<button class="real-slot-card ${active ? "is-selected" : ""}" type="button" data-real-slot-key="${root.utils.escapeHtml(slot.key)}" aria-pressed="${active ? "true" : "false"}">
            <strong>${root.utils.escapeHtml(slot.start)}</strong><span>ถึงประมาณ ${root.utils.escapeHtml(slot.end)}</span><small>ช่างว่าง</small>
          </button>`;
        }).join("")}
      </div>
      ${selected && selected.query_key === availability.query_key ? `<div class="selected-slot-banner"><span>เวลาที่เลือก</span><strong>${root.utils.escapeHtml(selected.start)}-${root.utils.escapeHtml(selected.end)} น.</strong></div>` : ""}
    `;
  }

  function renderStepTwo() {
    return `
      <section class="card booking-wizard-card">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 4 จาก 5</span>
          <h2>เลือกวันและคิวช่างว่างจริง</h2>
          <p class="muted">เลือกวันจากปฏิทิน แล้วเลือกช่วงเวลาที่ระบบยืนยันว่ามีช่างว่าง</p>
        </div>
        ${renderCalendar()}
        <div class="slot-section" data-availability-preview>${renderSlots()}</div>
      </section>
    `;
  }

  function renderStepPrice() {
    const pricing = root.state.scheduledPreview.pricing;
    return `
      <section class="card booking-wizard-card">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 3 จาก 5</span>
          <h2>ราคา</h2>
          <p class="muted">ราคานี้มาจากระบบหลังบ้านเท่านั้น พร้อมโปรโมชันและเวลาทำงานที่คำนวณได้จริง</p>
        </div>
        ${pricing.status === "loading" ? root.utils.stateBox("loading", "กำลังคำนวณราคาจากระบบจริง...") : ""}
        ${pricing.status === "error" ? root.utils.stateBox("error", pricing.error || "คำนวณราคาไม่สำเร็จ") : ""}
        ${pricing.data ? renderPricingSummary() : ""}
        <div class="data-list">
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(root.services.serviceLabel(service()))}</span></div>
        </div>
        <button type="button" class="secondary-btn" data-action="edit-service">กลับไปแก้ไขบริการ</button>
      </section>
    `;
  }

  function renderStepThree() {
    const d = draft();
    const saved = root.state.savedAddress();
    return `
      <section class="card booking-wizard-card">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 1 จาก 5</span>
          <h2>ข้อมูลลูกค้า</h2>
          <p class="muted">กรอกข้อมูลที่ช่างใช้เดินทางและติดต่อก่อนเข้าบริการ</p>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="scheduled-name">ชื่อผู้ติดต่อ <span aria-hidden="true">*</span></label>
            <input id="scheduled-name" class="input" autocomplete="name" value="${root.utils.escapeHtml(d.customer_name || "")}" data-scheduled-field="customer_name" placeholder="ชื่อผู้ติดต่อ">
          </div>
          <div class="field">
            <label for="scheduled-phone">เบอร์โทร <span aria-hidden="true">*</span></label>
            <input id="scheduled-phone" class="input" type="tel" inputmode="tel" autocomplete="tel" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-scheduled-field="customer_phone" placeholder="08x-xxx-xxxx">
          </div>
          <div class="field field-wide">
            <label for="scheduled-address">ที่อยู่หน้างาน <span aria-hidden="true">*</span></label>
            <textarea id="scheduled-address" class="textarea" rows="4" data-scheduled-field="address_text" placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง ซอย ถนน และจุดนัดพบ">${root.utils.escapeHtml(d.address_text || "")}</textarea>
          </div>
          <div class="field field-wide">
            <label for="scheduled-map">ลิงก์ Google Maps</label>
            <input id="scheduled-map" class="input" type="url" inputmode="url" value="${root.utils.escapeHtml(d.maps_url || "")}" data-scheduled-field="maps_url" placeholder="https://maps.app.goo.gl/...">
          </div>
          <div class="field">
            <label for="scheduled-zone">พื้นที่ / เขต</label>
            <input id="scheduled-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-scheduled-field="job_zone" placeholder="เช่น อ่อนนุช บางนา">
          </div>
          <div class="field field-wide">
            <label for="scheduled-note">หมายเหตุเพิ่มเติม</label>
            <textarea id="scheduled-note" class="textarea" rows="3" data-scheduled-field="customer_note" placeholder="ที่จอดรถ เวลาเข้าอาคาร จำนวนชั้น หรือข้อมูลอื่นที่ควรทราบ">${root.utils.escapeHtml(d.customer_note || "")}</textarea>
          </div>
        </div>
        ${saved.address && !d.address_text ? `<button type="button" class="secondary-btn" data-action="use-saved-address">ใช้ที่อยู่ที่บันทึกไว้</button>` : ""}
        ${root.state.customer?.logged_in ? `<div class="state-box is-success">เข้าสู่ระบบแล้ว ข้อมูลการจองจะไม่ถูกบังคับให้ย้อนกลับไปหน้า Login</div>` : `<div class="state-box">จองแบบ Guest ได้โดยไม่ต้องเข้าสู่ระบบ ข้อมูลในขั้นตอนนี้จะถูกเก็บไว้ในอุปกรณ์ระหว่างการจอง</div>`}
      </section>
    `;
  }

  function renderReviewRows() {
    const d = draft();
    const s = service();
    const selected = d.selectedSlot || {};
    const map = String(d.maps_url || "").trim();
    return `
      <div class="data-list review-data-list">
        <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(root.services.serviceLabel(s))}</span></div>
        <div class="data-row"><strong>วันและเวลา</strong><span class="muted">${root.utils.escapeHtml(d.date || "-")} · ${root.utils.escapeHtml(selected.start || "-")}-${root.utils.escapeHtml(selected.end || "-")} น.</span></div>
        <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} · ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
        <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
        ${map ? `<div class="data-row"><strong>แผนที่</strong><span class="muted">แนบลิงก์ Google Maps แล้ว</span></div>` : ""}
        <div class="data-row"><strong>ราคาประมาณการ</strong><span class="muted">${root.utils.formatBaht(finalPrice())}</span></div>
        <div class="data-row"><strong>หมายเหตุ</strong><span class="muted">${root.utils.escapeHtml(d.customer_note || "-")}</span></div>
      </div>
    `;
  }

  function renderStepFour() {
    const submit = root.state.scheduledSubmit;
    const pending = ["validating", "checking_slot", "submitting"].includes(submit.status);
    return `
      <section class="card booking-wizard-card review-card">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 5 จาก 5</span>
          <h2>ยืนยัน</h2>
          <p class="muted">ระบบจะตรวจราคาและคิวช่างซ้ำจาก Server ก่อนสร้าง Booking จริง</p>
        </div>
        ${renderReviewRows()}
        <div class="notice">การส่งรายการนี้เป็นคำขอจองล้างแอร์ล่วงหน้า สถานะและ Booking Code จะแสดงจากผลตอบกลับของ Server เท่านั้น</div>
        ${submit.status === "checking_slot" ? root.utils.stateBox("loading", "กำลังตรวจคิวช่างล่าสุด...") : ""}
        ${submit.status === "submitting" ? root.utils.stateBox("loading", "กำลังส่งข้อมูลจอง...") : ""}
        ${submit.status === "error" ? root.utils.stateBox("error", submit.error || "ส่งคำขอจองไม่สำเร็จ") : ""}
        <div class="button-row review-submit-actions">
          <button type="button" class="secondary-btn" data-action="wizard-back" ${pending ? "disabled" : ""}>ย้อนกลับแก้ไข</button>
          <button type="button" class="primary-btn wizard-submit-btn" data-action="submit-scheduled" ${pending ? "disabled" : ""}>${pending ? "กำลังตรวจสอบ..." : "ยืนยันส่งคำขอจอง"}</button>
        </div>
      </section>
    `;
  }

  function renderSuccess() {
    const result = root.state.scheduledSubmit.result || {};
    const selected = draft().selectedSlot || {};
    const trackingKey = result.token || result.booking_code || "";
    return `
      <section class="card success-card booking-result-card">
        <div class="success-mark">✓</div>
        <span class="section-kicker">Server confirmed</span>
        <h2>ส่งคำขอจองเรียบร้อย</h2>
        <div class="state-box is-success">ระบบสร้าง Booking จากข้อมูลจริงแล้ว โปรดเก็บรหัสเพื่อติดตามสถานะและการยืนยันงาน</div>
        <div class="data-list">
          <div class="data-row"><strong>Booking Code</strong><span class="booking-code-value">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>วันและเวลา</strong><span class="muted">${root.utils.escapeHtml(selected.date || draft().date || "-")} · ${root.utils.escapeHtml(selected.start || "-")}-${root.utils.escapeHtml(selected.end || "-")} น.</span></div>
          <div class="data-row"><strong>ราคาจากระบบ</strong><span class="muted">${root.utils.formatBaht(result.base_total)}</span></div>
          <div class="data-row"><strong>เวลาทำงานโดยประมาณ</strong><span class="muted">${root.utils.escapeHtml(result.duration_min || "-")} นาที</span></div>
        </div>
        <div class="button-row">
          <button type="button" class="primary-btn" data-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามสถานะงาน</button>
          <button type="button" class="secondary-btn" data-action="new-cleaning-booking">จองล้างแอร์เพิ่ม</button>
        </div>
      </section>
    `;
  }

  function validateStepOne() {
    const s = service();
    if (!payloadFromDraft() || s.job_type !== "ล้าง") return "บริการนี้ยังไม่เปิดจองออนไลน์ กรุณาติดต่อแอดมิน";
    if (!s.ac_type || !s.btu || s.machine_count < 1) return "กรุณาเลือกรายละเอียดงานล้างให้ครบ";
    if (s.ac_type === "ผนัง" && !s.wash_variant) return "กรุณาเลือกรูปแบบการล้าง";
    return "";
  }

  function validateStepTwo() {
    const d = draft();
    const selected = d.selectedSlot || null;
    const availability = root.state.scheduledPreview.availability;
    const expectedKey = currentAvailabilityKey();
    if (!d.date) return "กรุณาเลือกวันที่";
    if (!availability.data || availability.query_key !== expectedKey) return "กรุณารอให้ระบบโหลดคิวว่างของวันที่เลือก";
    if (!selected) return "กรุณาเลือกช่วงเวลาที่ช่างว่าง";
    if (!root.availability.selectedSlotIsCurrent(selected, availability.data, availability.query_key)) return "คิวที่เลือกไม่ตรงกับข้อมูลล่าสุด กรุณาเลือกเวลาใหม่";
    return "";
  }

  function validateStepThree() {
    const d = draft();
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) return "กรุณากรอกชื่อผู้ติดต่อ";
    if (phoneDigits.length < 9 || phoneDigits.length > 10) return "กรุณากรอกเบอร์โทร 9-10 หลัก";
    if (!String(d.address_text || "").trim()) return "กรุณากรอกที่อยู่หน้างาน";
    const map = String(d.maps_url || "").trim();
    if (map && !isAllowedMapsUrl(map)) return "ลิงก์แผนที่ต้องเป็นลิงก์ HTTPS ของ Google Maps";
    return "";
  }

  function buildSubmitPayload() {
    const d = draft();
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
      ...payloadFromDraft(),
    };
  }

  async function refreshPricing(container) {
    const payload = payloadFromDraft();
    if (!payload) throw new Error(validateStepOne() || "ข้อมูลบริการไม่ครบ");
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.updateDraft("scheduled", { selectedSlot: null });
    paint(container);
    try {
      const data = await root.api.previewPricing(payload);
      if (!data || !Number(data.duration_min || 0)) throw new Error("ระบบยังไม่สามารถคำนวณระยะเวลางานนี้ได้");
      root.state.setScheduledPreview("pricing", { status: "success", data, error: "" });
      return data;
    } catch (error) {
      root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error.message || "คำนวณราคาไม่สำเร็จ" });
      throw error;
    } finally {
      paint(container);
    }
  }

  async function refreshAvailability(container) {
    const query = currentAvailabilityQuery();
    if (!query) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: "ข้อมูลบริการ ราคา หรือวันที่ยังไม่พร้อม", query_key: "", loaded_at: "" });
      paint(container);
      return null;
    }
    if (draft().date < root.availability.bangkokTodayYmd()) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: "ไม่สามารถจองย้อนหลังได้", query_key: "", loaded_at: "" });
      paint(container);
      return null;
    }
    const expectedKey = root.availability.queryKey(query);
    const requestId = ++availabilityRequestSeq;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "", query_key: expectedKey, loaded_at: "" });
    paint(container);
    try {
      const data = await root.api.loadAvailability(query);
      if (requestId !== availabilityRequestSeq || expectedKey !== currentAvailabilityKey()) return null;
      root.state.setScheduledPreview("availability", { status: "success", data, error: "", query_key: expectedKey, loaded_at: new Date().toISOString() });
      return data;
    } catch (error) {
      if (requestId !== availabilityRequestSeq) return null;
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: error.message || "โหลดคิวว่างไม่สำเร็จ", query_key: expectedKey, loaded_at: "" });
      return null;
    } finally {
      if (requestId === availabilityRequestSeq) paint(container);
    }
  }

  async function recoverPersistedFlow(container) {
    if (recoveryPromise || step() < 3 || root.state.scheduledPreview.pricing.data) return recoveryPromise;
    const payload = payloadFromDraft();
    if (!payload) {
      root.state.setScheduledWizard({ step: 2, error: "ข้อมูลบริการเดิมไม่สมบูรณ์ กรุณาเลือกบริการใหม่" });
      paint(container);
      return null;
    }
    const selectedSnapshot = draft().selectedSlot ? { ...draft().selectedSlot } : null;
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    paint(container);
    recoveryPromise = (async () => {
      try {
        const pricing = await root.api.previewPricing(payload);
        if (!pricing || !Number(pricing.duration_min || 0)) throw new Error("ระบบยังไม่สามารถคำนวณระยะเวลางานนี้ได้");
        root.state.setScheduledPreview("pricing", { status: "success", data: pricing, error: "" });
        const query = root.availability.publicAvailabilityQuery(draft(), payload, pricing);
        const queryKey = root.availability.queryKey(query);
        root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "", query_key: queryKey, loaded_at: "" });
        paint(container);
        const availability = await root.api.loadAvailability(query);
        root.state.setScheduledPreview("availability", { status: "success", data: availability, error: "", query_key: queryKey, loaded_at: new Date().toISOString() });
        if (selectedSnapshot) {
          const restored = root.availability.normalizePublicSlots(availability, pricing.duration_min)
            .find((slot) => slot.date === selectedSnapshot.date && slot.start === selectedSnapshot.start);
          if (restored) {
            root.state.updateDraft("scheduled", { selectedSlot: { ...restored, query_key: queryKey } });
          } else {
            root.state.updateDraft("scheduled", { selectedSlot: null });
            root.state.setScheduledWizard({ step: 4, error: "คิวเดิมไม่ว่างแล้ว กรุณาเลือกช่วงเวลาใหม่" });
          }
        } else if (step() > 4) {
          root.state.setScheduledWizard({ step: 4, error: "กรุณาเลือกช่วงเวลาที่ว่างอีกครั้ง" });
        }
      } catch (error) {
        root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error.message || "กู้ข้อมูลราคาไม่สำเร็จ" });
        root.state.setScheduledWizard({ step: 2, error: "ไม่สามารถกู้ข้อมูลการจองล่าสุดได้ กรุณาตรวจบริการและลองใหม่" });
      } finally {
        recoveryPromise = null;
        paint(container);
      }
    })();
    return recoveryPromise;
  }

  async function revalidateSelectedSlot(container) {
    const selected = draft().selectedSlot || null;
    const query = currentAvailabilityQuery();
    if (!selected || !query) throw new Error("ข้อมูลคิวไม่พร้อม กรุณาเลือกเวลาใหม่");
    const expectedKey = root.availability.queryKey(query);
    const data = await root.api.loadAvailability(query);
    root.state.setScheduledPreview("availability", { status: "success", data, error: "", query_key: expectedKey, loaded_at: new Date().toISOString() });
    const latest = root.availability.normalizePublicSlots(data, query.duration_min)
      .find((slot) => slot.key === selected.key && slot.date === selected.date && slot.start === selected.start);
    if (!latest) {
      root.state.updateDraft("scheduled", { selectedSlot: null });
      const error = new Error("คิวนี้ไม่ว่างแล้ว กรุณาเลือกช่วงเวลาใหม่");
      error.status = 409;
      throw error;
    }
    root.state.updateDraft("scheduled", { selectedSlot: { ...latest, query_key: expectedKey } });
    return true;
  }

  async function goNext(container) {
    const current = step();
    root.state.setScheduledWizard({ error: "" });
    if (current === 1) {
      const error = validateStepThree();
      if (error) { root.state.setScheduledWizard({ error }); paint(container); return; }
      root.state.setScheduledWizard({ step: 2, error: "" });
      paint(container);
      return;
    }
    if (current === 2) {
      const error = validateStepOne();
      if (error) { root.state.setScheduledWizard({ error }); paint(container); return; }
      root.state.setScheduledWizard({ step: 3, error: "" });
      paint(container);
      try {
        await refreshPricing(container);
      } catch (_) { /* error is already rendered */ }
      return;
    }
    if (current === 3) {
      if (!root.state.scheduledPreview.pricing.data) {
        root.state.setScheduledWizard({ error: root.state.scheduledPreview.pricing.error || "กรุณารอให้ระบบคำนวณราคาให้สำเร็จ" });
        paint(container);
        return;
      }
      root.state.setScheduledWizard({ step: 4, error: "" });
      paint(container);
      await refreshAvailability(container);
      return;
    }
    if (current === 4) {
      const error = validateStepTwo();
      if (error) { root.state.setScheduledWizard({ error }); paint(container); return; }
      root.state.setScheduledWizard({ step: 5, error: "" });
      paint(container);
    }
  }

  function goBack(container) {
    if (step() <= 1) {
      root.utils.routeTo("booking");
      return;
    }
    root.state.setScheduledWizard({ step: step() - 1, error: "" });
    paint(container);
  }

  async function submit(container) {
    if (["validating", "checking_slot", "submitting"].includes(root.state.scheduledSubmit.status)) return;
    const serviceError = validateStepOne();
    const slotError = validateStepTwo();
    const contactError = validateStepThree();
    const payload = buildSubmitPayload();
    if (serviceError || slotError || contactError || !payload.appointment_datetime) {
      root.state.setScheduledSubmit({ status: "error", error: serviceError || slotError || contactError || "ข้อมูลจองไม่ครบ", result: null });
      if (slotError) {
        root.state.updateDraft("scheduled", { selectedSlot: null });
        root.state.setScheduledWizard({ step: 4, error: slotError });
      }
      paint(container);
      return;
    }
    root.state.setScheduledSubmit({ status: "checking_slot", error: "", result: null });
    paint(container);
    try {
      await revalidateSelectedSlot(container);
      root.state.setScheduledSubmit({ status: "submitting", error: "", result: null });
      paint(container);
      const result = await root.api.submitScheduledBooking(buildSubmitPayload());
      if (!result?.success || (!result.booking_code && !result.token)) throw new Error("Server ไม่ได้ส่ง Booking Code กลับมา");
      root.state.setScheduledSubmit({ status: "success", error: "", result });
      try { window.sessionStorage.removeItem("cwf_customer_app_v2_scheduled_v2"); } catch (_) { /* ignore */ }
      paint(container);
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      root.state.setScheduledSubmit({ status: "error", error: error.message || "ส่งคำขอจองไม่สำเร็จ", result: null });
      if (Number(error.status) === 400 || Number(error.status) === 409) {
        root.state.updateDraft("scheduled", { selectedSlot: null });
        root.state.setScheduledWizard({ step: 4, error: "คิวที่เลือกอาจเต็มแล้ว กรุณาเลือกช่วงเวลาใหม่" });
      }
      paint(container);
    }
  }

  function renderActions() {
    if (root.state.scheduledSubmit.status === "success") return "";
    const current = step();
    if (current === 5) return "";
    const nextLabel = current === 1
      ? "เลือกบริการ"
      : current === 2
        ? "ดูราคา"
        : current === 3
          ? "เลือกวันและเวลา"
          : "ตรวจสอบรายการ";
    return `
      <div class="wizard-action-bar">
        <button type="button" class="secondary-btn" data-action="wizard-back">${current === 1 ? "กลับหน้าบริการ" : "ย้อนกลับ"}</button>
        ${current < 5 ? `<button type="button" class="primary-btn" data-action="wizard-next">${nextLabel}</button>` : ""}
      </div>
    `;
  }

  function paint(container) {
    if (!container) return;
    prefillContact();
    const current = step();
    const success = root.state.scheduledSubmit.status === "success";
    const content = success
      ? renderSuccess()
      : current === 1 ? renderStepThree()
        : current === 2 ? renderStepOne()
          : current === 3 ? renderStepPrice()
            : current === 4 ? renderStepTwo()
              : renderStepFour();
    container.innerHTML = `
      <div class="page booking-wizard-page">
        <div class="page-toolbar">
          <button type="button" class="text-btn" data-route="home">← หน้าแรก</button>
          <a class="text-btn" href="https://line.me/R/ti/p/@cwfair" target="_blank" rel="noopener noreferrer">ติดต่อแอดมิน</a>
        </div>
        <section class="booking-wizard-intro">
          <span class="section-kicker">Scheduled cleaning</span>
          <h1>จองล้างแอร์ล่วงหน้า</h1>
          <p>เลือกบริการ ราคา วัน และคิวช่างจากระบบจริง งานซ่อม ติดตั้ง ย้าย และตรวจอาการยังต้องติดต่อแอดมิน</p>
        </section>
        ${success ? "" : renderProgress()}
        ${root.state.scheduledWizard.error ? root.utils.stateBox("error", root.state.scheduledWizard.error) : ""}
        ${content}
        ${renderActions()}
      </div>
    `;
    bind(container);
  }

  function bind(container) {
    container.querySelectorAll("[data-scheduled-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-scheduled-choice");
        const value = button.getAttribute("data-choice-value");
        const patch = { [field]: value, service_kind: "clean", job_type: "ล้าง" };
        if (field === "ac_type" && value !== "ผนัง") patch.wash_variant = "";
        if (field === "ac_type" && value === "ผนัง" && !draft().wash_variant) patch.wash_variant = "ล้างธรรมดา";
        root.state.updateDraft("scheduled", patch);
        resetPriceAndSlots();
        root.state.setScheduledWizard({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-scheduled-field]").forEach((input) => {
      const eventName = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventName, () => {
        const field = input.getAttribute("data-scheduled-field");
        const value = field === "machine_count" ? Number(input.value || 1) : input.value;
        root.state.updateDraft("scheduled", { [field]: value });
        root.state.setScheduledWizard({ error: "" });
        if (field === "machine_count") {
          resetPriceAndSlots();
          paint(container);
        }
      });
      if (eventName === "input") input.addEventListener("change", () => root.state.persistScheduledDraft());
    });

    container.querySelectorAll("[data-calendar-month]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextMonth = changeMonth(draft().calendar_month || draft().date.slice(0, 7), Number(button.getAttribute("data-calendar-month") || 0));
        if (!monthWithinRange(nextMonth)) return;
        root.state.updateDraft("scheduled", { calendar_month: nextMonth });
        paint(container);
      });
    });

    container.querySelectorAll("[data-calendar-date]").forEach((button) => {
      button.addEventListener("click", async () => {
        const date = button.getAttribute("data-calendar-date");
        root.state.updateDraft("scheduled", { date, calendar_month: date.slice(0, 7), selectedSlot: null });
        resetSlots();
        root.state.setScheduledWizard({ error: "" });
        paint(container);
        await refreshAvailability(container);
      });
    });

    container.querySelectorAll("[data-real-slot-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const availability = root.state.scheduledPreview.availability;
        const found = normalizedSlots().find((slot) => slot.key === button.getAttribute("data-real-slot-key"));
        if (!found) return;
        root.state.updateDraft("scheduled", { selectedSlot: { ...found, query_key: availability.query_key } });
        root.state.setScheduledWizard({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-action");
        if (action === "wizard-next") await goNext(container);
        if (action === "wizard-back") goBack(container);
        if (action === "edit-service") {
          root.state.setScheduledWizard({ step: 2, error: "" });
          paint(container);
        }
        if (action === "reload-slots") await refreshAvailability(container);
        if (action === "use-saved-address") {
          root.state.prefillSavedAddress("scheduled");
          paint(container);
        }
        if (action === "submit-scheduled") await submit(container);
        if (action === "track-created") {
          const key = button.getAttribute("data-tracking-key") || "";
          if (key) root.state.updateDraft("tracking", { trackingCode: key });
          root.utils.routeTo("tracking");
        }
        if (action === "new-cleaning-booking") {
          root.state.resetScheduledDraft();
          paint(container);
        }
      });
    });
  }

  function render(container) {
    paint(container);
    if (step() >= 3 && !root.state.scheduledPreview.pricing.data && root.state.scheduledPreview.pricing.status === "idle") {
      recoverPersistedFlow(container);
    } else if (step() === 4 && root.state.scheduledPreview.pricing.data && root.state.scheduledPreview.availability.status === "idle") {
      refreshAvailability(container);
    }
    root.state.ensureSavedAddressPrefill("scheduled", () => paint(container));
  }

  root.bookingScheduled = { render, refreshAvailability };
})();
