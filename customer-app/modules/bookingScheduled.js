(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const MAX_ADVANCE_DAYS = 90;
  const STEP_MAX = 3;
  let availabilityRequestSeq = 0;
  let calendarRequestSeq = 0;
  let recoveryInFlight = false;

  function draft() {
    return root.state.draft.scheduled || {};
  }

  function services() {
    return root.services.normalizeServiceLines(draft());
  }

  function payloadFromDraft() {
    return root.services.payloadFromScheduledDraft(draft());
  }

  function step() {
    return Math.max(1, Math.min(STEP_MAX, Number(root.state.scheduledWizard?.step || 1)));
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

  function scrollToWizardTop(container) {
    requestAnimationFrame(() => {
      const target = typeof container?.querySelector === "function"
        ? container.querySelector("[data-booking-step]")
        : null;
      (target || container)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  }

  function clearPriceCalendarSlots() {
    availabilityRequestSeq += 1;
    calendarRequestSeq += 1;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledPreview("calendar", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function clearCalendarSlots() {
    availabilityRequestSeq += 1;
    calendarRequestSeq += 1;
    root.state.updateDraft("scheduled", { selectedSlot: null });
    root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledPreview("calendar", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
    root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
  }

  function clearSlotsOnly() {
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

  function choiceGroup(field, options, selected, className, lineId) {
    return `<div class="choice-grid ${className || ""}">${options.map((option) => {
      const active = String(selected || "") === String(option.value);
      return `
        <button class="choice-card ${active ? "is-selected" : ""}" type="button"
          data-line-choice="${root.utils.escapeHtml(field)}"
          data-line-id="${root.utils.escapeHtml(lineId || "")}"
          data-choice-value="${root.utils.escapeHtml(option.value)}"
          aria-pressed="${active ? "true" : "false"}">
          <strong>${root.utils.escapeHtml(option.label)}</strong>
          ${option.copy ? `<span>${root.utils.escapeHtml(option.copy)}</span>` : ""}
        </button>
      `;
    }).join("")}</div>`;
  }

  function renderProgress() {
    const labels = ["บริการและราคา", "ข้อมูลหน้างานและคิว", "ตรวจสอบและยืนยัน"];
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

  function renderStepContactLocation() {
    const d = draft();
    const saved = root.state.savedAddress();
    return `
      <section class="card booking-wizard-card" data-booking-step="2">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 2 จาก 3</span>
          <h2>ข้อมูลหน้างานและคิว</h2>
          <p class="muted">กรอกข้อมูลสำหรับติดต่อ เดินทาง เลือกวันที่ และเลือกช่วงเวลาว่างจริง</p>
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
            <label for="scheduled-note">หมายเหตุหน้างาน</label>
            <textarea id="scheduled-note" class="textarea" rows="4" data-scheduled-field="customer_note" placeholder="ที่จอดรถ เวลาเข้าอาคาร ชั้น ห้อง หรือข้อมูลอื่นที่ควรทราบ">${root.utils.escapeHtml(d.customer_note || "")}</textarea>
          </div>
        </div>
        ${saved.address && !String(d.address_text || "").trim() ? `<button type="button" class="secondary-btn" data-action="use-saved-address">ใช้ที่อยู่ที่บันทึกไว้</button>` : ""}
        <div class="slot-section-divider"></div>
        <div class="section-head section-head-compact">
          <h2>ปฏิทิน วัน เวลา และเงื่อนไขการเสนอเวลา</h2>
          <p class="muted">เลือกวันที่มีคิวและช่วงเวลาว่างจริงสำหรับรายการทั้งหมด</p>
        </div>
        ${renderCalendar()}
        <div class="slot-section" data-availability-preview>${renderSlots()}</div>
        <div class="field field-wide">
          <label>หากเวลาที่เลือกมีการเปลี่ยนแปลง</label>
          ${renderTimePreference()}
        </div>
      </section>
    `;
  }

  function renderServiceLineCard(line, index) {
    const s = root.services.normalizeServiceLine(line);
    const summary = root.services.serviceLineSummary(s, index);
    const canRemove = services().length > 1;
    return `
      <article class="service-line-card" data-service-line-card="${root.utils.escapeHtml(s.line_id)}">
        <div class="service-line-head">
          <div>
            <span class="section-kicker">${root.utils.escapeHtml(summary.title)}</span>
            <strong>${root.utils.escapeHtml(summary.line1)}</strong>
            <small>${root.utils.escapeHtml(summary.line2)}</small>
          </div>
          <button type="button" class="text-btn danger-text" data-action="remove-line" data-line-id="${root.utils.escapeHtml(s.line_id)}" ${canRemove ? "" : "disabled"}>ลบ</button>
        </div>
        <div class="field field-wide">
          <label>ชนิดแอร์</label>
          ${choiceGroup("ac_type", root.services.bookableAcTypes, s.ac_type, "ac-type-grid", s.line_id)}
        </div>
        ${s.ac_type === root.services.WALL_AC ? `
          <div class="field field-wide">
            <label>วิธีล้าง</label>
            ${choiceGroup("wash_variant", root.services.washVariants, s.wash_variant, "wash-variant-grid", s.line_id)}
          </div>
        ` : ""}
        <div class="field field-wide">
          <label>BTU</label>
          ${choiceGroup("btu", root.services.bookableBtuOptions, s.btu, "btu-choice-grid", s.line_id)}
        </div>
        <div class="field">
          <label for="line-count-${root.utils.escapeHtml(s.line_id)}">จำนวนเครื่อง</label>
          <select id="line-count-${root.utils.escapeHtml(s.line_id)}" class="select" data-line-field="machine_count" data-line-id="${root.utils.escapeHtml(s.line_id)}">
            ${root.services.machineCounts.map((n) => `<option value="${n}" ${Number(s.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
          </select>
        </div>
      </article>
    `;
  }

  function renderStepServices() {
    const lines = services();
    return `
      <section class="card booking-wizard-card" data-booking-step="1">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 1 จาก 3</span>
          <h2>บริการและราคา</h2>
          <p class="muted">เพิ่มรายการแยกตามชนิดแอร์ BTU จำนวน และวิธีล้าง</p>
        </div>
        <div class="service-line-list">
          ${lines.map(renderServiceLineCard).join("")}
        </div>
        <button type="button" class="secondary-btn" data-action="add-line">+ เพิ่มเครื่อง / เพิ่มรายการ</button>
        <div class="slot-section-divider"></div>
        <div class="section-head section-head-compact">
          <h2>ราคาและระยะเวลารวม</h2>
          <p class="muted">ราคาเป็นราคาประเมินจากรายการที่เลือก แอดมินจะตรวจสอบอีกครั้งก่อนยืนยันคิว</p>
        </div>
        <div class="service-line-review-list">
          ${lines.map((line, index) => {
            const summary = root.services.serviceLineSummary(line, index);
            const priceLine = priceLineFor(index);
            const linePrice = priceLine && (priceLine.line_total != null || priceLine.total != null)
              ? root.utils.formatBaht(priceLine.line_total ?? priceLine.total)
              : "-";
            return `
              <div class="service-summary-box">
                <span>${root.utils.escapeHtml(summary.title)}</span>
                <strong>${root.utils.escapeHtml(summary.line1)}</strong>
                <small>${root.utils.escapeHtml(summary.line2)} · ${root.utils.escapeHtml(linePrice)}</small>
              </div>
            `;
          }).join("")}
        </div>
        ${renderPricingSummary()}
      </section>
    `;
  }

  function priceLineFor(index) {
    const pricing = root.state.scheduledPreview.pricing.data || {};
    const lines = Array.isArray(pricing.price_lines) ? pricing.price_lines : [];
    return lines[index] || null;
  }

  function renderPricingSummary() {
    const pricing = root.state.scheduledPreview.pricing;
    const data = pricing.data;
    if (pricing.status === "loading") return root.utils.stateBox("loading", "กำลังคำนวณราคาและเวลาทำงาน...");
    if (pricing.status === "error") return root.utils.stateBox("error", pricing.error || "คำนวณราคาไม่สำเร็จ");
    if (!data) return root.utils.stateBox("", "ระบบจะคำนวณราคาและเวลาทำงานหลังเลือกบริการ");
    return `
      <div class="wizard-price-summary">
        <div><span>ราคารวมประมาณการ</span><strong>${root.utils.formatBaht(finalPrice())}</strong></div>
        <div><span>เวลาทำงานรวม</span><strong>${root.utils.escapeHtml(data.duration_min || "-")} นาที</strong></div>
        ${data.promo ? `<small>ใช้โปรโมชัน: ${root.utils.escapeHtml(data.promo.promo_name || "โปรโมชันปัจจุบัน")}</small>` : `<small>ยังไม่มีโปรโมชันที่ระบบเลือกให้สำหรับรายการนี้</small>`}
      </div>
    `;
  }

  function renderStepPricing() {
    const lines = services();
    return `
      <section class="card booking-wizard-card" data-booking-step="3">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 3 จาก 5</span>
          <h2>ราคาและระยะเวลารวม</h2>
          <p class="muted">ตรวจสอบรายการและยอดรวมก่อนเลือกคิว</p>
        </div>
        <div class="service-line-review-list">
          ${lines.map((line, index) => {
            const summary = root.services.serviceLineSummary(line, index);
            const priceLine = priceLineFor(index);
            const linePrice = priceLine && (priceLine.line_total != null || priceLine.total != null)
              ? root.utils.formatBaht(priceLine.line_total ?? priceLine.total)
              : "-";
            return `
              <div class="service-summary-box">
                <span>${root.utils.escapeHtml(summary.title)}</span>
                <strong>${root.utils.escapeHtml(summary.line1)}</strong>
                <small>${root.utils.escapeHtml(summary.line2)} · ${root.utils.escapeHtml(linePrice)}</small>
              </div>
            `;
          }).join("")}
        </div>
        ${renderPricingSummary()}
      </section>
    `;
  }

  function currentCalendarQuery() {
    const payload = payloadFromDraft();
    const pricing = root.state.scheduledPreview.pricing.data;
    if (!payload || !pricing) return null;
    return root.availability.publicCalendarQuery(draft(), payload, pricing);
  }

  function currentCalendarKey() {
    const query = currentCalendarQuery();
    return query ? root.availability.calendarQueryKey(query) : "";
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

  function renderCalendar() {
    const d = draft();
    const today = root.availability.bangkokTodayYmd();
    const maxDate = addDays(today, MAX_ADVANCE_DAYS);
    const month = monthWithinRange(d.calendar_month || "") ? d.calendar_month : d.date.slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1, 12);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const calendarState = root.state.scheduledPreview.calendar;
    const expectedKey = currentCalendarKey();
    // Defect B: only trust calendar day data when the backend successfully answered the CURRENT
    // query. While pricing/calendar are still resolving (idle, loading, recovering, or a stale key)
    // we render a neutral pending state and never manufacture "ยังไม่มีคิวเปิด" from missing data.
    const hasData = Boolean(expectedKey) && calendarState.status === "success" && calendarState.query_key === expectedKey;
    const isError = Boolean(expectedKey) && calendarState.status === "error" && calendarState.query_key === expectedKey;
    const isPending = !hasData && !isError;
    const dayMap = hasData ? root.availability.normalizeCalendarDays(calendarState.data) : new Map();
    const isLoading = isPending;
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(`<span class="calendar-day is-empty" aria-hidden="true"></span>`);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateValue = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const outsideRange = dateValue < today || dateValue > maxDate;
      const selected = dateValue === d.date;
      const isToday = dateValue === today;
      const status = dayMap.get(dateValue);
      const available = status && status.available === true;
      const dayStatus = status?.status || (available ? "available" : "");
      const full = dayStatus === "full";
      const noOpenSlots = dayStatus === "no_open_slots";
      const systemIssue = dayStatus === "error";
      // Days are only selectable once a confirmed availability response marks them available.
      const disabled = outsideRange || isPending || !available;
      const label = outsideRange
        ? ""
        : (isPending
            ? "..."
            : (available
                ? "มีคิว"
                : (full
                    ? "เต็ม"
                    : (systemIssue
                        ? "ลองใหม่"
                        : (noOpenSlots ? "ยังไม่มีคิวเปิด" : "")))));
      cells.push(`
        <button type="button" class="calendar-day ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""} ${available ? "is-available" : ""} ${full ? "is-full" : ""} ${noOpenSlots ? "is-no-open-slots" : ""} ${systemIssue ? "is-error" : ""} ${isLoading ? "is-loading" : ""}"
          data-calendar-date="${dateValue}" ${disabled ? "disabled" : ""}
          aria-pressed="${selected ? "true" : "false"}" aria-label="${root.utils.escapeHtml(`${dateValue} ${label}`)}">
          <span>${day}</span>${label ? `<small>${root.utils.escapeHtml(label)}</small>` : ""}
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
      ${calendarState.status === "error" ? `${root.utils.stateBox("error", calendarState.error || "โหลดปฏิทินไม่สำเร็จ")}<button type="button" class="secondary-btn" data-action="reload-calendar">ลองโหลดปฏิทินอีกครั้ง</button>` : ""}
    `;
  }

  function renderSlots() {
    const availability = root.state.scheduledPreview.availability;
    const selected = draft().selectedSlot || null;
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังตรวจคิวว่างจริง...");
    if (availability.status === "error") {
      return `${root.utils.stateBox("error", availability.error || "โหลดคิวว่างไม่สำเร็จ")}<button type="button" class="secondary-btn" data-action="reload-slots">ลองโหลดคิวอีกครั้ง</button>`;
    }
    if (!availability.data) return root.utils.stateBox("", "เลือกวันที่มีคิว ระบบจะแสดงช่วงเวลาว่างด้านล่าง");
    const slots = normalizedSlots();
    if (!slots.length) {
      // Defect B: derive the empty message strictly from the backend status. "ยังไม่มีคิวเปิด" is
      // shown only when the backend explicitly returns no_open_slots; any other/unknown status is
      // treated as a recoverable condition rather than a manufactured "no open slots".
      const status = String(availability.data.availability_status || "").trim();
      let message;
      let tone = "warning";
      if (status === "full") {
        message = "วันที่เลือกเต็มแล้ว กรุณาเลือกวันอื่น";
      } else if (status === "error") {
        message = "ระบบตรวจคิววันนี้ไม่สำเร็จ กรุณาลองใหม่";
        tone = "error";
      } else if (status === "no_open_slots") {
        message = "ยังไม่มีคิวเปิดในวันนี้ กรุณาเลือกวันอื่น";
      } else {
        message = "ไม่พบช่วงเวลาว่างในวันนี้ กรุณาลองใหม่อีกครั้งหรือเลือกวันอื่น";
      }
      return `${root.utils.stateBox(tone, message)}<button type="button" class="secondary-btn" data-action="reload-slots">ตรวจคิววันนี้อีกครั้ง</button>`;
    }
    return `
      <div class="availability-meta"><strong>คิวว่างวันที่ ${root.utils.escapeHtml(draft().date)}</strong><span>ระบบจะตรวจซ้ำก่อนส่งคำขอจอง</span></div>
      <div class="real-slot-grid">
        ${slots.map((slot) => {
          const active = selected && selected.key === slot.key && selected.query_key === availability.query_key;
          return `<button class="real-slot-card ${active ? "is-selected" : ""}" type="button" data-real-slot-key="${root.utils.escapeHtml(slot.key)}" aria-pressed="${active ? "true" : "false"}">
            <strong>${root.utils.escapeHtml(slot.start)}-${root.utils.escapeHtml(slot.end)}</strong><span>ช่วงเวลาว่าง</span><small>เลือกคิวนี้</small>
          </button>`;
        }).join("")}
      </div>
      ${selected && selected.query_key === availability.query_key ? `<div class="selected-slot-banner"><span>เวลาที่เลือก</span><strong>${root.utils.escapeHtml(selected.start)}-${root.utils.escapeHtml(selected.end)} น.</strong></div>` : ""}
    `;
  }

  function renderTimePreference() {
    const flexible = draft().allow_time_proposal === true;
    const options = [
      { value: "false", title: "ต้องการเวลานี้เท่านั้น", copy: "หากช่วงเวลานี้ไม่ว่างแล้ว กรุณาให้ฉันเลือกเวลาใหม่" },
      { value: "true", title: "สามารถเสนอเวลาใหม่ให้ฉันได้", copy: "หากคิวมีการเปลี่ยนแปลง แอดมินหรือช่างสามารถเสนอช่วงเวลาใหม่เพื่อให้ฉันยืนยัน" },
    ];
    return `
      <div class="time-preference" role="radiogroup" aria-label="เงื่อนไขการเสนอเวลา">
        ${options.map((option) => {
          const active = String(flexible) === option.value;
          return `
            <button type="button" class="choice-card time-preference-card ${active ? "is-selected" : ""}" data-time-proposal="${option.value}" role="radio" aria-checked="${active ? "true" : "false"}">
              <strong>${root.utils.escapeHtml(option.title)}</strong>
              <span>${root.utils.escapeHtml(option.copy)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderStepCalendarSlot() {
    return `
      <section class="card booking-wizard-card" data-booking-step="4">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 4 จาก 5</span>
          <h2>ปฏิทิน วัน เวลา และเงื่อนไขการเสนอเวลา</h2>
          <p class="muted">เลือกวันที่มีคิวและช่วงเวลาว่างจริงสำหรับรายการทั้งหมด</p>
        </div>
        ${renderCalendar()}
        <div class="slot-section" data-availability-preview>${renderSlots()}</div>
        <div class="field field-wide">
          <label>หากเวลาที่เลือกมีการเปลี่ยนแปลง</label>
          ${renderTimePreference()}
        </div>
      </section>
    `;
  }

  function timePreferenceLabel() {
    return draft().allow_time_proposal === true
      ? "สามารถเสนอเวลาใหม่ให้ฉันได้"
      : "ต้องการเวลานี้เท่านั้น";
  }

  function renderReviewRows() {
    const d = draft();
    const selected = d.selectedSlot || {};
    const map = String(d.maps_url || "").trim();
    const pricing = root.state.scheduledPreview.pricing.data || {};
    return `
      <div class="data-list review-data-list">
        ${services().map((line, index) => {
          const summary = root.services.serviceLineSummary(line, index);
          return `<div class="data-row"><strong>${root.utils.escapeHtml(summary.title)}</strong><span class="muted">${root.utils.escapeHtml(summary.line1)} · ${root.utils.escapeHtml(summary.line2)}</span></div>`;
        }).join("")}
        <div class="data-row"><strong>ราคา</strong><span class="muted">${root.utils.formatBaht(finalPrice())}</span></div>
        <div class="data-row"><strong>โปรโมชัน</strong><span class="muted">${root.utils.escapeHtml(pricing.promo?.promo_name || "-")}</span></div>
        <div class="data-row"><strong>ระยะเวลา</strong><span class="muted">${root.utils.escapeHtml(pricing.duration_min || "-")} นาที</span></div>
        <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} · ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
        <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
        <div class="data-row"><strong>แผนที่</strong><span class="muted">${map ? "แนบลิงก์ Google Maps แล้ว" : "ไม่มีลิงก์แผนที่"}</span></div>
        <div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone || "-")}</span></div>
        <div class="data-row"><strong>หมายเหตุ</strong><span class="muted">${root.utils.escapeHtml(d.customer_note || "-")}</span></div>
        <div class="data-row"><strong>วันและเวลา</strong><span class="muted">${root.utils.escapeHtml(d.date || "-")} · ${root.utils.escapeHtml(selected.start || "-")}-${root.utils.escapeHtml(selected.end || "-")} น.</span></div>
        <div class="data-row"><strong>การเสนอเวลา</strong><span class="muted">${root.utils.escapeHtml(timePreferenceLabel())}</span></div>
      </div>
    `;
  }

  function renderStepReview() {
    const submit = root.state.scheduledSubmit;
    const pending = ["validating", "checking_slot", "submitting"].includes(submit.status);
    return `
      <section class="card booking-wizard-card review-card" data-booking-step="3">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 3 จาก 3</span>
          <h2>ตรวจสอบและยืนยัน</h2>
          <p class="muted">ตรวจข้อมูลทั้งหมดก่อนส่งคำขอจอง</p>
        </div>
        ${renderReviewRows()}
        <div class="notice">การส่งรายการนี้เป็นคำขอจองล้างแอร์ล่วงหน้า แอดมินจะตรวจสอบและยืนยันคิวอีกครั้ง</div>
        ${submit.status === "checking_slot" ? root.utils.stateBox("loading", "กำลังตรวจคิวล่าสุด...") : ""}
        ${submit.status === "submitting" ? root.utils.stateBox("loading", "กำลังส่งข้อมูลจอง...") : ""}
        ${submit.status === "error" ? root.utils.stateBox("error", submit.error || "ส่งคำขอจองไม่สำเร็จ") : ""}
        <button type="button" class="primary-btn wizard-submit-btn" data-action="submit-scheduled" ${pending ? "disabled" : ""}>${pending ? "กำลังตรวจสอบ..." : "ยืนยันส่งคำขอจอง"}</button>
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
        <span class="section-kicker">ส่งคำขอแล้ว</span>
        <h2>ส่งคำขอจองเรียบร้อย</h2>
        <div class="state-box is-success">รอแอดมินตรวจสอบและยืนยันคิว โปรดเก็บรหัสนี้ไว้เพื่อติดตามสถานะงาน</div>
        <div class="data-list">
          <div class="data-row"><strong>Booking Code</strong><span class="booking-code-value">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>วันและเวลา</strong><span class="muted">${root.utils.escapeHtml(selected.date || draft().date || "-")} · ${root.utils.escapeHtml(selected.start || "-")}-${root.utils.escapeHtml(selected.end || "-")} น.</span></div>
          <div class="data-row"><strong>ราคา</strong><span class="muted">${root.utils.formatBaht(result.base_total)}</span></div>
          <div class="data-row"><strong>เวลาทำงาน</strong><span class="muted">${root.utils.escapeHtml(result.duration_min || "-")} นาที</span></div>
        </div>
        <div class="button-row">
          <button type="button" class="primary-btn" data-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามสถานะงาน</button>
          <button type="button" class="secondary-btn" data-action="new-cleaning-booking">จองล้างแอร์เพิ่ม</button>
        </div>
      </section>
    `;
  }

  function validateContactStep() {
    const d = draft();
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) return "กรุณากรอกชื่อผู้ติดต่อ";
    if (phoneDigits.length < 9 || phoneDigits.length > 10) return "กรุณากรอกเบอร์โทร 9-10 หลัก";
    if (!String(d.address_text || "").trim()) return "กรุณากรอกที่อยู่หน้างาน";
    const map = String(d.maps_url || "").trim();
    if (map && !isAllowedMapsUrl(map)) return "ลิงก์แผนที่ต้องเป็นลิงก์ HTTPS ของ Google Maps";
    return "";
  }

  function validateServiceStep() {
    const lines = services();
    if (!lines.length) return "ต้องมีอย่างน้อย 1 รายการ";
    for (const line of lines) {
      if (line.needs_admin_estimate) return line.admin_reason || "กรุณาเลือกข้อมูลบริการให้ครบ";
      if (!line.ac_type || !line.btu || line.machine_count < 1) return "กรุณาเลือกรายละเอียดงานล้างให้ครบ";
      if (line.ac_type === root.services.WALL_AC && !line.wash_variant) return "กรุณาเลือกวิธีล้างสำหรับแอร์ผนัง";
    }
    return "";
  }

  function validatePricingStep() {
    const serviceError = validateServiceStep();
    if (serviceError) return serviceError;
    const pricing = root.state.scheduledPreview.pricing;
    if (!pricing.data || !Number(pricing.data.duration_min || 0)) return "กรุณารอให้ระบบคำนวณราคาและระยะเวลางานให้สำเร็จ";
    return "";
  }

  function validateSlotStep() {
    const d = draft();
    const selected = d.selectedSlot || null;
    const availability = root.state.scheduledPreview.availability;
    const expectedKey = currentAvailabilityKey();
    if (!d.date) return "กรุณาเลือกวันที่";
    if (!availability.data || availability.query_key !== expectedKey) return "กรุณารอให้ระบบโหลดคิวว่างของวันที่เลือก";
    if (!selected) return "กรุณาเลือกช่วงเวลาที่ว่าง";
    if (!root.availability.selectedSlotIsCurrent(selected, availability.data, availability.query_key)) return "คิวที่เลือกไม่ตรงกับข้อมูลล่าสุด กรุณาเลือกเวลาใหม่";
    if (draft().allow_time_proposal !== true && draft().allow_time_proposal !== false) return "กรุณาเลือกเงื่อนไขการเสนอเวลา";
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
      service_kind: "clean",
      allow_time_proposal: d.allow_time_proposal === true,
      ...payloadFromDraft(),
    };
  }

  async function refreshPricing(container, opts = {}) {
    const payload = payloadFromDraft();
    if (!payload) throw new Error("ข้อมูลบริการไม่ครบ");
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    // During recovery the service has not changed, so keep any restored calendar/slot selection
    // and only recompute the missing pricing. A normal (re)calculation invalidates dependents.
    if (!opts.preserveDependents) {
      root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      root.state.setScheduledPreview("calendar", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      root.state.updateDraft("scheduled", { selectedSlot: null });
    }
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

  async function refreshCalendar(container) {
    const query = currentCalendarQuery();
    if (!query || !query.month) {
      root.state.setScheduledPreview("calendar", { status: "error", data: null, error: "ข้อมูลบริการหรือราคายังไม่พร้อม", query_key: "", loaded_at: "" });
      paint(container);
      return null;
    }
    const expectedKey = root.availability.calendarQueryKey(query);
    const requestId = ++calendarRequestSeq;
    root.state.setScheduledPreview("calendar", { status: "loading", data: null, error: "", query_key: expectedKey, loaded_at: "" });
    paint(container);
    try {
      const data = await root.api.loadAvailabilityCalendar(query);
      if (requestId !== calendarRequestSeq || expectedKey !== currentCalendarKey()) return null;
      root.state.setScheduledPreview("calendar", { status: "success", data, error: "", query_key: expectedKey, loaded_at: new Date().toISOString() });
      return data;
    } catch (error) {
      if (requestId !== calendarRequestSeq) return null;
      root.state.setScheduledPreview("calendar", { status: "error", data: null, error: error.message || "โหลดปฏิทินไม่สำเร็จ", query_key: expectedKey, loaded_at: "" });
      return null;
    } finally {
      if (requestId === calendarRequestSeq) paint(container);
    }
  }

  async function refreshAvailability(container, opts = {}) {
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
    // During recovery a restored slot selection (same service/date) is kept so the customer is not
    // silently bumped; selectedSlotIsCurrent() still re-validates it against the fresh response.
    if (!opts.preserveSelection) {
      root.state.updateDraft("scheduled", { selectedSlot: null });
    }
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

  async function revalidateSelectedSlot() {
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
      const error = validateServiceStep();
      if (error) { root.state.setScheduledWizard({ error }); paint(container); scrollToWizardTop(container); return; }
      try { await refreshPricing(container); }
      catch (_) {
        root.state.setScheduledWizard({ error: root.state.scheduledPreview.pricing.error || "คำนวณราคาไม่สำเร็จ" });
        paint(container);
        scrollToWizardTop(container);
        return;
      }
      root.state.setScheduledWizard({ step: 2, error: "" });
      paint(container);
      scrollToWizardTop(container);
      await refreshCalendar(container);
      await refreshAvailability(container);
      return;
    }
    if (current === 2) {
      const error = validateContactStep() || validatePricingStep() || validateSlotStep();
      if (error) { root.state.setScheduledWizard({ error }); paint(container); scrollToWizardTop(container); return; }
      root.state.setScheduledWizard({ step: 3, error: "" });
      paint(container);
      scrollToWizardTop(container);
    }
  }

  function goBack(container) {
    if (step() <= 1) {
      root.utils.routeTo("booking");
      return;
    }
    root.state.setScheduledWizard({ step: step() - 1, error: "" });
    paint(container);
    scrollToWizardTop(container);
  }

  async function submit(container) {
    if (["validating", "checking_slot", "submitting"].includes(root.state.scheduledSubmit.status)) return;
    const contactError = validateContactStep();
    const serviceError = validateServiceStep();
    const pricingError = validatePricingStep();
    const slotError = validateSlotStep();
    const payload = buildSubmitPayload();
    if (contactError || serviceError || pricingError || slotError || !payload.appointment_datetime) {
      const error = contactError || serviceError || pricingError || slotError || "ข้อมูลจองไม่ครบ";
      root.state.setScheduledSubmit({ status: "error", error, result: null });
      root.state.setScheduledWizard({ step: serviceError ? 1 : 2, error });
      if (slotError) root.state.updateDraft("scheduled", { selectedSlot: null });
      paint(container);
      scrollToWizardTop(container);
      return;
    }
    root.state.setScheduledSubmit({ status: "checking_slot", error: "", result: null });
    paint(container);
    try {
      await revalidateSelectedSlot();
      root.state.setScheduledSubmit({ status: "submitting", error: "", result: null });
      paint(container);
      const result = await root.api.submitScheduledBooking(buildSubmitPayload());
      if (!result?.success || (!result.booking_code && !result.token)) throw new Error("ระบบไม่ได้ส่งรหัสติดตามกลับมา");
      root.state.setScheduledSubmit({ status: "success", error: "", result });
      try {
        window.sessionStorage.removeItem("cwf_customer_app_v2_scheduled_v5");
        window.sessionStorage.removeItem("cwf_customer_app_v2_scheduled_v4");
      } catch (_) { /* ignore */ }
      paint(container);
      scrollToWizardTop(container);
    } catch (error) {
      root.state.setScheduledSubmit({ status: "error", error: error.message || "ส่งคำขอจองไม่สำเร็จ", result: null });
      if (Number(error.status) === 400 || Number(error.status) === 409) {
        root.state.updateDraft("scheduled", { selectedSlot: null });
        root.state.setScheduledWizard({ step: 2, error: "คิวที่เลือกอาจเต็มแล้ว กรุณาเลือกช่วงเวลาใหม่" });
      }
      paint(container);
      scrollToWizardTop(container);
    }
  }

  function renderActions() {
    if (root.state.scheduledSubmit.status === "success") return "";
    const current = step();
    if (current === 3) {
      return `<div class="wizard-action-bar"><button type="button" class="secondary-btn" data-action="wizard-back">ย้อนกลับ</button></div>`;
    }
    const nextLabels = {
      1: "ต่อไป: ข้อมูลหน้างานและคิว",
      2: "ต่อไป: ตรวจสอบและยืนยัน",
    };
    return `
      <div class="wizard-action-bar">
        <button type="button" class="secondary-btn" data-action="wizard-back">${current === 1 ? "กลับหน้าเลือกบริการ" : "ย้อนกลับ"}</button>
        <button type="button" class="primary-btn" data-action="wizard-next">${nextLabels[current] || "ต่อไป"}</button>
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
      : current === 1 ? renderStepServices()
        : current === 2 ? renderStepContactLocation()
          : renderStepReview();
    container.innerHTML = `
      <div class="page booking-wizard-page">
        <div class="page-toolbar">
          <button type="button" class="text-btn" data-route="home">← หน้าแรก</button>
          <a class="text-btn" href="https://line.me/R/ti/p/@cwfair" target="_blank" rel="noopener noreferrer">ติดต่อแอดมิน</a>
        </div>
        <section class="booking-wizard-intro">
          <span class="section-kicker">จองล้างแอร์ล่วงหน้า</span>
          <h1>จองล้างแอร์</h1>
          <p>เพิ่มรายการเครื่องทั้งหมด ดูราคารวม แล้วเลือกคิวว่างจริงจากปฏิทิน</p>
        </section>
        ${success ? "" : renderProgress()}
        ${root.state.scheduledWizard.error ? root.utils.stateBox("error", root.state.scheduledWizard.error) : ""}
        ${content}
        ${renderActions()}
      </div>
    `;
    bind(container);
  }

  function patchLine(lineId, patch, container) {
    const next = root.services.linePatchToDraftServices(draft(), lineId, patch);
    const first = next[0] || root.services.createServiceLine();
    root.state.updateDraft("scheduled", {
      services: next,
      ac_type: first.ac_type,
      btu: String(first.btu),
      machine_count: first.machine_count,
      wash_variant: first.wash_variant || "",
    });
    clearPriceCalendarSlots();
    root.state.setScheduledWizard({ error: "" });
    paint(container);
  }

  function bind(container) {
    container.querySelectorAll("[data-line-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-line-choice");
        const lineId = button.getAttribute("data-line-id");
        const value = button.getAttribute("data-choice-value");
        const patch = field === "btu" ? { [field]: Number(value || 0) } : { [field]: value };
        patchLine(lineId, patch, container);
      });
    });

    container.querySelectorAll("[data-line-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.getAttribute("data-line-field");
        const lineId = input.getAttribute("data-line-id");
        const value = field === "machine_count" ? Number(input.value || 1) : input.value;
        patchLine(lineId, { [field]: value }, container);
      });
    });

    container.querySelectorAll("[data-scheduled-field]").forEach((input) => {
      const eventName = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventName, () => {
        const field = input.getAttribute("data-scheduled-field");
        root.state.updateDraft("scheduled", { [field]: input.value });
        root.state.setScheduledWizard({ error: "" });
      });
      if (eventName === "input") input.addEventListener("change", () => root.state.persistScheduledDraft());
    });

    container.querySelectorAll("[data-calendar-month]").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextMonth = changeMonth(draft().calendar_month || draft().date.slice(0, 7), Number(button.getAttribute("data-calendar-month") || 0));
        if (!monthWithinRange(nextMonth)) return;
        root.state.updateDraft("scheduled", { calendar_month: nextMonth });
        clearSlotsOnly();
        paint(container);
        await refreshCalendar(container);
      });
    });

    container.querySelectorAll("[data-calendar-date]").forEach((button) => {
      button.addEventListener("click", async () => {
        const date = button.getAttribute("data-calendar-date");
        root.state.updateDraft("scheduled", { date, calendar_month: date.slice(0, 7), selectedSlot: null });
        clearSlotsOnly();
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

    container.querySelectorAll("[data-time-proposal]").forEach((button) => {
      button.addEventListener("click", () => {
        root.state.updateDraft("scheduled", { allow_time_proposal: button.getAttribute("data-time-proposal") === "true" });
        root.state.setScheduledWizard({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-action");
        if (action === "wizard-next") await goNext(container);
        if (action === "wizard-back") goBack(container);
        if (action === "add-line") {
          const next = [...services(), root.services.createServiceLine()];
          root.state.updateDraft("scheduled", { services: next, selectedSlot: null });
          clearPriceCalendarSlots();
          paint(container);
        }
        if (action === "remove-line") {
          const lineId = button.getAttribute("data-line-id");
          const next = services().filter((line) => String(line.line_id) !== String(lineId));
          if (!next.length) return;
          const first = next[0];
          root.state.updateDraft("scheduled", { services: next, ac_type: first.ac_type, btu: String(first.btu), machine_count: first.machine_count, wash_variant: first.wash_variant || "", selectedSlot: null });
          clearPriceCalendarSlots();
          paint(container);
        }
        if (action === "reload-calendar") await refreshCalendar(container);
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

  // Defect A: when Step 2/3 is restored from storage (e.g. reload, returning to the tab) the
  // in-memory pricing/calendar/slot preview is gone because only the draft + step are persisted.
  // Recover the dependency chain in order pricing -> calendar -> selected-day availability, without
  // firing competing requests and without bouncing the customer back to Step 1.
  async function recoverScheduledDependencies(container) {
    if (recoveryInFlight) return;
    if (step() < 2) return;
    const preview = root.state.scheduledPreview;
    const needPricing = !preview.pricing.data && preview.pricing.status !== "loading";
    const needCalendar = preview.calendar.status === "idle";
    const needAvailability = preview.availability.status === "idle";
    if (!needPricing && !needCalendar && !needAvailability) return;
    recoveryInFlight = true;
    try {
      if (needPricing) {
        try { await refreshPricing(container, { preserveDependents: true }); }
        catch (_) { return; }
      }
      if (!root.state.scheduledPreview.pricing.data) return;
      if (root.state.scheduledPreview.calendar.status === "idle") {
        await refreshCalendar(container);
      }
      if (root.state.scheduledPreview.availability.status === "idle") {
        await refreshAvailability(container, { preserveSelection: true });
      }
    } finally {
      recoveryInFlight = false;
    }
  }

  function render(container) {
    paint(container);
    if (step() === 1) {
      if (root.state.scheduledPreview.pricing.status === "idle") {
        refreshPricing(container).catch(() => {});
      }
    } else {
      recoverScheduledDependencies(container);
    }
    root.state.ensureSavedAddressPrefill("scheduled", () => paint(container));
  }

  root.bookingScheduled = {
    render,
    refreshAvailability,
    refreshCalendar,
    _test: {
      buildSubmitPayload,
      validateContactStep,
      validateServiceStep,
      validatePricingStep,
      validateSlotStep,
      currentAvailabilityQuery,
      currentCalendarQuery,
    },
  };
})();
