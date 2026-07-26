(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_LINE_URL = "https://lin.ee/fG1Oq7y";
  let activeSubmit = null;
  let pollTimer = null;
  let pollInFlight = null;
  let pollEpoch = 0;
  let pricingEpoch = 0;
  let activeContainer = null;
  let visibilityRefresh = null;

  function draft() {
    return root.state.draft.urgent || {};
  }

  function canonicalCleaningLine(input) {
    const line = root.services.normalizeServiceLine(input || {});
    return root.services.createServiceLine({
      line_id: line.line_id,
      job_type: "ล้าง",
      ac_type: line.ac_type,
      btu: line.btu,
      machine_count: line.machine_count,
      wash_variant: line.wash_variant,
    });
  }

  function sanitizeUrgentDraft() {
    const current = draft();
    const sourceLines = Array.isArray(current.services) && current.services.length
      ? current.services
      : [current];
    const lines = sourceLines.slice(0, 10).map(canonicalCleaningLine);
    const first = lines[0] || canonicalCleaningLine({});
    const patch = {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: first.ac_type,
      btu: String(first.btu),
      machine_count: first.machine_count,
      wash_variant: first.wash_variant || "",
      repair_variant: "",
      services: lines,
      allow_time_proposal: current.allow_time_proposal === true,
    };
    const scalarChanged = Object.entries(patch)
      .filter(([key]) => key !== "services")
      .some(([key, value]) => String(current[key] ?? "") !== String(value));
    const linesChanged = JSON.stringify(root.services.normalizeServiceLines(current).map((line) => ({
      line_id: line.line_id,
      job_type: line.job_type,
      ac_type: line.ac_type,
      btu: line.btu,
      machine_count: line.machine_count,
      wash_variant: line.wash_variant,
    }))) !== JSON.stringify(lines);
    if (scalarChanged || linesChanged) root.state.updateDraft("urgent", patch);
    return { ...current, ...patch };
  }

  function services() {
    return root.services.normalizeServiceLines(sanitizeUrgentDraft());
  }

  function servicePayload() {
    return root.services.payloadFromServiceLines(services());
  }

  function setStep(step, error) {
    root.state.setUrgentFlow({ step, error: error || "" });
  }

  function serviceSummary() {
    return services().map((line) => root.services.serviceLabel(line)).join(" • ");
  }

  function ensureRequestKey() {
    const d = draft();
    if (d.urgent_request_key) return d.urgent_request_key;
    const key = root.utils.randomKey();
    root.state.updateDraft("urgent", { urgent_request_key: key });
    return key;
  }

  function appointmentDatetime() {
    const d = draft();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || "")) || !/^\d{2}:\d{2}$/.test(String(d.time || ""))) return "";
    return `${d.date}T${d.time}:00+07:00`;
  }

  function buildSubmitPayload() {
    const d = sanitizeUrgentDraft();
    const payload = servicePayload() || {};
    const cleaningLines = (Array.isArray(payload.services) ? payload.services : []).map((line) => ({
      ...line,
      job_type: "ล้าง",
      repair_variant: "",
    }));
    const latitude = Number(d.gps_latitude);
    const longitude = Number(d.gps_longitude);
    const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
    return {
      customer_name: String(d.customer_name || "").trim(),
      customer_phone: String(d.customer_phone || "").trim(),
      appointment_datetime: appointmentDatetime(),
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      job_zone: String(d.job_zone || "").trim(),
      customer_note: String(d.symptom || "").trim(),
      booking_mode: "urgent",
      client_app: "customer_app_v2",
      urgent_request_key: ensureRequestKey(),
      allow_time_proposal: d.allow_time_proposal === true,
      ...(hasGps ? { gps_latitude: latitude, gps_longitude: longitude } : {}),
      ...payload,
      services: cleaningLines,
    };
  }

  function markPayloadChanged() {
    const flow = root.state.urgentFlow || {};
    if (flow.submitAttempted && draft().urgent_request_key) {
      root.state.updateDraft("urgent", { urgent_request_key: "" });
      root.state.setUrgentFlow({ submitAttempted: false });
    }
  }

  function choiceGroup(field, options, selected, className, lineId) {
    return `<div class="choice-grid ${className || ""}">${options.map((option) => {
      const active = String(selected || "") === String(option.value);
      return `
        <button class="choice-card ${active ? "is-selected" : ""}" type="button"
          data-urgent-line-choice="${root.utils.escapeHtml(field)}"
          data-urgent-choice="${root.utils.escapeHtml(field)}"
          data-line-id="${root.utils.escapeHtml(lineId || "")}"
          data-choice-value="${root.utils.escapeHtml(option.value)}"
          aria-pressed="${active ? "true" : "false"}">
          <strong>${root.utils.escapeHtml(option.label)}</strong>
          ${option.copy ? `<span>${root.utils.escapeHtml(option.copy)}</span>` : ""}
        </button>
      `;
    }).join("")}</div>`;
  }

  function priceData() {
    return root.state.urgentFlow?.pricing?.data || null;
  }

  function finalPrice() {
    const data = priceData();
    if (!data) return null;
    if (data.promo && data.promo.total_after_discount != null) return Number(data.promo.total_after_discount);
    return Number(data.active_price || data.standard_price || 0);
  }

  function priceLineFor(index) {
    const lines = Array.isArray(priceData()?.price_lines) ? priceData().price_lines : [];
    return lines[index] || null;
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
          <button type="button" class="text-btn danger-text" data-urgent-action="remove-line" data-line-id="${root.utils.escapeHtml(s.line_id)}" ${canRemove ? "" : "disabled"}>ลบ</button>
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
          <label for="urgent-line-count-${root.utils.escapeHtml(s.line_id)}">จำนวนเครื่อง</label>
          <select id="urgent-line-count-${root.utils.escapeHtml(s.line_id)}" class="select" data-urgent-line-field="machine_count" data-line-id="${root.utils.escapeHtml(s.line_id)}">
            ${root.services.machineCounts.map((count) => `<option value="${count}" ${Number(s.machine_count) === count ? "selected" : ""}>${count} เครื่อง</option>`).join("")}
          </select>
        </div>
      </article>
    `;
  }

  function renderPricingSummary() {
    const pricing = root.state.urgentFlow?.pricing || { status: "idle", data: null, error: "" };
    if (pricing.status === "loading") return root.utils.stateBox("loading", "กำลังคำนวณราคาและเวลาทำงาน...");
    if (pricing.status === "error") return root.utils.stateBox("error", pricing.error || "คำนวณราคาไม่สำเร็จ กรุณาลองอีกครั้ง");
    if (!pricing.data) return root.utils.stateBox("", "ระบบจะคำนวณราคาจากรายการที่เลือก");
    return `
      <div class="wizard-price-summary">
        <div><span>ราคารวมประมาณการ</span><strong>${root.utils.formatBaht(finalPrice())}</strong></div>
        <div><span>เวลาทำงานรวม</span><strong>${root.utils.escapeHtml(pricing.data.duration_min || "-")} นาที</strong></div>
        ${pricing.data.promo ? `<small>ใช้โปรโมชัน: ${root.utils.escapeHtml(pricing.data.promo.promo_name || "โปรโมชันปัจจุบัน")}</small>` : ""}
      </div>
    `;
  }

  function renderServiceReviewList() {
    return `
      <div class="service-line-review-list">
        ${services().map((line, index) => {
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
    `;
  }

  function renderServicesStep() {
    const error = root.state.urgentFlow.error;
    return `
      <section class="card form-card urgent-card-fx" data-urgent-step-panel="services">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 1 จาก 3</span>
          <h2>บริการและราคา</h2>
          <p class="muted">เพิ่มรายการแยกตามชนิดแอร์ BTU จำนวน และวิธีล้าง</p>
        </div>
        <div class="service-line-list">${services().map(renderServiceLineCard).join("")}</div>
        <button type="button" class="secondary-btn" data-urgent-action="add-line">+ เพิ่มเครื่อง / เพิ่มรายการ</button>
        <div class="slot-section-divider"></div>
        ${renderServiceReviewList()}
        ${renderPricingSummary()}
      </section>
      ${error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(error)}</div>` : ""}
      <div class="button-row">
        <button class="primary-btn btn-shine" type="button" data-urgent-action="to-details">กรอกข้อมูลหน้างาน</button>
      </div>
    `;
  }

  function renderTimePreference() {
    const flexible = draft().allow_time_proposal === true;
    return `
      <div class="choice-grid">
        <button type="button" class="choice-card ${flexible ? "" : "is-selected"}" data-urgent-time-proposal="false" aria-pressed="${flexible ? "false" : "true"}">
          <strong>ต้องการตามเวลาที่เลือก</strong>
          <span>แอดมินจะตรวจสอบเวลานี้ก่อนยืนยัน</span>
        </button>
        <button type="button" class="choice-card ${flexible ? "is-selected" : ""}" data-urgent-time-proposal="true" aria-pressed="${flexible ? "true" : "false"}">
          <strong>สามารถเสนอเวลาใหม่ให้ฉันได้</strong>
          <span>แอดมินติดต่อกลับหากต้องปรับเวลา</span>
        </button>
      </div>
    `;
  }

  function renderDetailsStep() {
    const d = sanitizeUrgentDraft();
    const flow = root.state.urgentFlow || {};
    return `
      <section class="card form-card urgent-card-fx" data-urgent-step-panel="details">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 2 จาก 3</span>
          <h2>ข้อมูลหน้างานและเวลาที่ต้องการ</h2>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="urgent-name">ชื่อผู้ติดต่อ</label>
            <input id="urgent-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-urgent-field="customer_name" autocomplete="name">
          </div>
          <div class="field">
            <label for="urgent-phone">เบอร์โทร</label>
            <input id="urgent-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-urgent-field="customer_phone" inputmode="tel" autocomplete="tel">
          </div>
          <div class="field">
            <label for="urgent-date">วันที่ต้องการ</label>
            <input id="urgent-date" class="input" type="date" value="${root.utils.escapeHtml(d.date || "")}" data-urgent-field="date">
          </div>
          <div class="field">
            <label for="urgent-time">เวลาที่ต้องการ</label>
            <input id="urgent-time" class="input" type="time" value="${root.utils.escapeHtml(d.time || "")}" data-urgent-field="time">
          </div>
          <div class="field field-wide">
            <label>เงื่อนไขเวลา</label>
            ${renderTimePreference()}
          </div>
          <div class="field field-wide">
            <label for="urgent-address">ที่อยู่หน้างาน</label>
            <textarea id="urgent-address" class="input textarea" data-urgent-field="address_text" rows="3">${root.utils.escapeHtml(d.address_text || "")}</textarea>
          </div>
          <div class="field field-wide">
            <label for="urgent-maps">ลิงก์ Google Maps (ถ้ามี)</label>
            <input id="urgent-maps" class="input" value="${root.utils.escapeHtml(d.maps_url || "")}" data-urgent-field="maps_url" inputmode="url">
            <button class="secondary-btn" type="button" data-urgent-action="use-location" ${flow.locationStatus === "loading" ? "disabled" : ""}>
              ${flow.locationStatus === "loading" ? "กำลังอ่านตำแหน่ง..." : "ใช้ตำแหน่งปัจจุบัน"}
            </button>
            ${flow.locationMessage ? `<small class="${flow.locationStatus === "success" ? "muted" : "danger-text"}" role="status">${root.utils.escapeHtml(flow.locationMessage)}</small>` : ""}
          </div>
          <div class="field">
            <label for="urgent-zone">พื้นที่ / โซน (ถ้ามี)</label>
            <input id="urgent-zone" class="input" value="${root.utils.escapeHtml(d.job_zone || "")}" data-urgent-field="job_zone">
          </div>
          <div class="field field-wide">
            <label for="urgent-symptom">รายละเอียดเพิ่มเติม / หมายเหตุ (ไม่บังคับ)</label>
            <textarea id="urgent-symptom" class="input textarea" data-urgent-field="symptom" rows="3">${root.utils.escapeHtml(d.symptom || "")}</textarea>
          </div>
        </div>
      </section>
      ${flow.error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(flow.error)}</div>` : ""}
      <div class="button-row">
        <button class="primary-btn btn-shine" type="button" data-urgent-action="to-review">ตรวจสอบรายละเอียด</button>
        <button class="secondary-btn" type="button" data-urgent-action="back-services">กลับไปแก้บริการ</button>
      </div>
    `;
  }

  function formatAppointment() {
    const d = draft();
    if (!d.date || !d.time) return "-";
    try {
      return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(`${d.date}T${d.time}:00+07:00`));
    } catch (_) {
      return `${d.date} ${d.time}`;
    }
  }

  function timePreferenceLabel() {
    return draft().allow_time_proposal === true
      ? "สามารถเสนอเวลาใหม่ให้ฉันได้"
      : "ต้องการตามเวลานี้";
  }

  function renderReview() {
    const d = sanitizeUrgentDraft();
    const flow = root.state.urgentFlow || {};
    const submitting = flow.status === "submitting";
    const hasGps = Number.isFinite(Number(d.gps_latitude)) && Number.isFinite(Number(d.gps_longitude));
    return `
      <section class="card review-card urgent-card-fx" data-urgent-step-panel="review">
        <div class="section-head">
          <span class="section-kicker">ขั้นตอน 3 จาก 3</span>
          <h2>ตรวจสอบและส่งคำขอ</h2>
        </div>
        ${renderServiceReviewList()}
        ${renderPricingSummary()}
        <div class="data-list">
          <div class="data-row"><strong>วันที่และเวลา</strong><span class="muted">${root.utils.escapeHtml(formatAppointment())}</span></div>
          <div class="data-row"><strong>เงื่อนไขเวลา</strong><span class="muted">${root.utils.escapeHtml(timePreferenceLabel())}</span></div>
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          ${d.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone)}</span></div>` : ""}
          ${d.maps_url ? `<div class="data-row"><strong>แผนที่</strong><span class="muted">${root.utils.escapeHtml(d.maps_url)}</span></div>` : ""}
          ${hasGps ? `<div class="data-row"><strong>GPS</strong><span class="muted">${root.utils.escapeHtml(`${Number(d.gps_latitude)}, ${Number(d.gps_longitude)}`)}</span></div>` : ""}
          ${String(d.symptom || "").trim() ? `<div class="data-row"><strong>หมายเหตุ</strong><span class="muted">${root.utils.escapeHtml(d.symptom)}</span></div>` : ""}
        </div>
        <div class="notice is-urgent">แอดมินจะตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง</div>
        ${flow.error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(flow.error)}</div>` : ""}
        <div class="button-row">
          ${flow.disabled_line_url
            ? `<a class="primary-btn line-fallback-btn" href="${ADMIN_LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>`
            : `<button class="primary-btn btn-shine" type="button" data-urgent-action="confirm" ${submitting ? "disabled" : ""}>${submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอ"}</button>`}
          <button class="secondary-btn" type="button" data-urgent-action="back-details" ${submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
        </div>
      </section>
    `;
  }

  function validateServices() {
    if (!servicePayload() || !services().length) return "กรุณาเลือกข้อมูลบริการให้ครบ";
    const pricing = root.state.urgentFlow?.pricing || {};
    if (pricing.status === "loading") return "กรุณารอระบบคำนวณราคา";
    if (pricing.status !== "success" || !pricing.data) return "กรุณาคำนวณราคาอีกครั้ง";
    return "";
  }

  function validateDetails() {
    const d = sanitizeUrgentDraft();
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) return "กรุณากรอกชื่อผู้ติดต่อ";
    if (phoneDigits.length < 9 || phoneDigits.length > 10) return "กรุณากรอกเบอร์โทร 9-10 หลัก";
    if (!String(d.address_text || "").trim()) return "กรุณากรอกที่อยู่หน้างาน";
    if (!String(d.date || "").trim()) return "กรุณาเลือกวันที่ต้องการ";
    if (!String(d.time || "").trim()) return "กรุณาเลือกเวลาที่ต้องการ";
    const appointment = appointmentDatetime();
    if (!appointment || Number.isNaN(new Date(appointment).getTime())) return "กรุณาเลือกวันที่และเวลาให้ถูกต้อง";
    if (new Date(appointment).getTime() <= Date.now()) return "วันและเวลาที่เลือกย้อนหลังไม่ได้ กรุณาเลือกเวลาใหม่";
    if (d.allow_time_proposal !== true && d.allow_time_proposal !== false) return "กรุณาเลือกเงื่อนไขเวลา";
    const latProvided = d.gps_latitude !== undefined && d.gps_latitude !== null && String(d.gps_latitude).trim() !== "";
    const lngProvided = d.gps_longitude !== undefined && d.gps_longitude !== null && String(d.gps_longitude).trim() !== "";
    if (latProvided !== lngProvided) return "ข้อมูลตำแหน่งไม่ครบ กรุณากดใช้ตำแหน่งปัจจุบันอีกครั้ง";
    if (latProvided) {
      const lat = Number(d.gps_latitude);
      const lng = Number(d.gps_longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
        return "ข้อมูลตำแหน่งไม่ถูกต้อง กรุณากดใช้ตำแหน่งปัจจุบันอีกครั้ง";
      }
    }
    return "";
  }

  async function refreshPricing(container) {
    const payload = servicePayload();
    if (!payload) return;
    const requestEpoch = ++pricingEpoch;
    root.state.setUrgentFlow({ pricing: { status: "loading", data: null, error: "" } });
    if (container) paint(container);
    try {
      const data = await root.api.previewPricing(payload);
      if (requestEpoch !== pricingEpoch || root.state.currentRoute !== "urgent") return;
      root.state.setUrgentFlow({ pricing: { status: "success", data, error: "" } });
    } catch (error) {
      if (requestEpoch !== pricingEpoch || root.state.currentRoute !== "urgent") return;
      root.state.setUrgentFlow({
        pricing: { status: "error", data: null, error: root.customerCopy.bookingError(error) },
      });
    }
    if (container && requestEpoch === pricingEpoch) paint(container);
  }

  function invalidatePricing() {
    pricingEpoch += 1;
    root.state.setUrgentFlow({ pricing: { status: "idle", data: null, error: "" }, error: "" });
    markPayloadChanged();
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
      root.state.setUrgentFlow({
        locationStatus: "error",
        locationMessage: "เบราว์เซอร์นี้ไม่รองรับการอ่านตำแหน่ง กรุณาวางลิงก์ Google Maps เอง",
      });
      return Promise.resolve(false);
    }
    root.state.setUrgentFlow({ locationStatus: "loading", locationMessage: "กำลังอ่านตำแหน่งปัจจุบัน..." });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = Number(position?.coords?.latitude);
          const longitude = Number(position?.coords?.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
            root.state.setUrgentFlow({ locationStatus: "error", locationMessage: "อ่านตำแหน่งไม่สำเร็จ กรุณาลองอีกครั้ง" });
            resolve(false);
            return;
          }
          markPayloadChanged();
          root.state.updateDraft("urgent", {
            gps_latitude: latitude,
            gps_longitude: longitude,
            maps_url: `https://www.google.com/maps?q=${latitude},${longitude}`,
          });
          root.state.setUrgentFlow({ locationStatus: "success", locationMessage: "บันทึกตำแหน่งปัจจุบันสำเร็จ" });
          resolve(true);
        },
        (error) => {
          const message = Number(error?.code) === 1
            ? "คุณปฏิเสธสิทธิ์ตำแหน่ง กรุณาอนุญาตสิทธิ์หรือวางลิงก์ Google Maps เอง"
            : Number(error?.code) === 3
              ? "อ่านตำแหน่งหมดเวลา กรุณาลองอีกครั้ง"
              : "อ่านตำแหน่งไม่สำเร็จ กรุณาลองอีกครั้ง";
          root.state.setUrgentFlow({ locationStatus: "error", locationMessage: message });
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  function trackingKeyFromResult(result) {
    return result ? (result.token || result.booking_token || result.booking_code || "") : "";
  }

  function hero() {
    return `
      <div class="hero urgent-hero urgent-hero-fx">
        <div class="urgent-aurora" aria-hidden="true"></div>
        <div class="urgent-spark" aria-hidden="true"></div>
        <div class="hero-badge">บริการงานล้าง</div>
        <h2>จองล้างแอร์ด่วน</h2>
        <p>เลือกบริการและเวลาที่ต้องการเพื่อให้แอดมินตรวจสอบและจัดงาน</p>
      </div>
    `;
  }

  function flowRail(active, submittedView) {
    const steps = [
      { key: "services", label: "บริการ" },
      { key: "details", label: "หน้างานและเวลา" },
      { key: "review", label: active === "submitted" ? (submittedView?.railLabel || "รอแอดมิน") : "ตรวจสอบ" },
    ];
    const order = { services: 0, details: 1, review: 2, submitted: 2 };
    const activeIndex = order[active] ?? 0;
    return `
      <div class="flow-rail" aria-label="ขั้นตอนจองล้างแอร์ด่วน">
        ${steps.map((item, index) => `
          <div class="flow-node ${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-active" : ""}">
            <span class="flow-bullet">${index < activeIndex ? "✓" : index + 1}</span>
            <span class="flow-label">${item.label}</span>
          </div>
        `).join('<span class="flow-bar" aria-hidden="true"></span>')}
      </div>
    `;
  }

  function renderSubmitted(submittedView) {
    const d = draft();
    const flow = root.state.urgentFlow || {};
    const result = flow.result || {};
    const trackingKey = trackingKeyFromResult(result);
    const view = submittedView || root.customerCopy.urgentSubmittedView(flow.liveStatus);
    return `
      <section class="card ${view.cardClass} booking-result-card urgent-card-fx">
        <div class="success-mark">${root.utils.escapeHtml(view.mark)}</div>
        <span class="section-kicker">${root.utils.escapeHtml(view.kicker)}</span>
        <h2>${root.utils.escapeHtml(view.title)}</h2>
        <div class="state-box ${view.boxClass}" data-urgent-live-status>${root.utils.escapeHtml(view.message)}</div>
        <p class="muted">${root.utils.escapeHtml(view.detail)}</p>
        <div class="data-list">
          <div class="data-row"><strong>รหัสการจอง</strong><span class="booking-code-value">${root.utils.escapeHtml(result.booking_code || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>เวลาที่ต้องการ</strong><span class="muted">${root.utils.escapeHtml(formatAppointment())}</span></div>
          <div class="data-row"><strong>สถานะ</strong><span class="muted">${root.utils.escapeHtml(view.statusLabel)}</span></div>
        </div>
        ${flow.liveStatusError ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(flow.liveStatusError)}</div>` : ""}
        <div class="button-row">
          ${flow.liveStatusError ? `<button class="primary-btn" type="button" data-urgent-action="retry-status">ลองตรวจสอบสถานะอีกครั้ง</button>` : ""}
          ${trackingKey ? `<button class="primary-btn" type="button" data-urgent-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามสถานะงาน</button>` : ""}
          ${view.showAdminContact ? `<a class="secondary-btn line-fallback-btn" href="${ADMIN_LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>` : ""}
          ${view.state === "terminal" ? `<button class="secondary-btn" type="button" data-urgent-action="new-request">จองล้างแอร์ใหม่</button>` : ""}
          <button class="secondary-btn" type="button" data-route="home">กลับหน้าแรก</button>
        </div>
      </section>
    `;
  }

  async function submitUrgent(container) {
    if (activeSubmit || root.state.urgentFlow.status === "submitting") return;
    const submitEpoch = pollEpoch;
    const submitAttempt = { epoch: submitEpoch };
    activeSubmit = submitAttempt;
    root.state.setUrgentFlow({
      step: "review",
      status: "submitting",
      submitAttempted: true,
      error: "",
      result: null,
      disabled_line_url: "",
    });
    paint(container);
    try {
      const result = await root.api.submitUrgentRequest(buildSubmitPayload());
      if (submitEpoch !== pollEpoch) return;
      const trackingKey = trackingKeyFromResult(result);
      if (trackingKey) root.state.updateDraft("tracking", { trackingCode: trackingKey });
      root.state.setUrgentFlow({ step: "submitted", status: "success", error: "", result, liveStatus: null, liveStatusError: "" });
    } catch (error) {
      if (submitEpoch !== pollEpoch) return;
      const disabled = ["URGENT_BOOKING_DISABLED", "CUSTOMER_BOOKING_DISABLED", "ONLINE_BOOKING_DISABLED"]
        .includes(String(error?.data?.code || "").trim().toUpperCase());
      root.state.setUrgentFlow({
        step: "review",
        status: "error",
        error: root.customerCopy.bookingError(error),
        result: null,
        disabled_line_url: disabled ? ADMIN_LINE_URL : "",
      });
    } finally {
      if (activeSubmit === submitAttempt) activeSubmit = null;
      if (submitEpoch === pollEpoch) paint(container);
    }
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function onSubmittedScreen() {
    return root.state.currentRoute === "urgent" && root.state.urgentFlow.step === "submitted";
  }

  function statusFingerprint() {
    const flow = root.state.urgentFlow || {};
    const view = root.customerCopy.urgentSubmittedView(flow.liveStatus);
    return `${view.state}|${view.statusLabel}|${String(flow.liveStatusError || "")}`;
  }

  function shouldPollUrgentStatus() {
    const flow = root.state.urgentFlow || {};
    const key = trackingKeyFromResult(flow.result || null);
    const view = root.customerCopy.urgentSubmittedView(flow.liveStatus);
    return Boolean(key) && onSubmittedScreen() && !flow.liveStatusError && view.state === "pending";
  }

  async function pollUrgentStatus(container) {
    if (pollInFlight) return pollInFlight;
    const key = trackingKeyFromResult(root.state.urgentFlow?.result || null);
    if (!key || !onSubmittedScreen()) {
      stopPolling();
      return null;
    }
    const requestEpoch = pollEpoch;
    const before = statusFingerprint();
    pollInFlight = (async () => {
      try {
        const status = await root.api.loadUrgentStatus(key);
        if (requestEpoch !== pollEpoch || !onSubmittedScreen()) return null;
        root.state.setUrgentFlow({ liveStatus: status, liveStatusError: "" });
        const view = root.customerCopy.urgentSubmittedView(status);
        if (view.state !== "pending") stopPolling();
        if (before !== statusFingerprint()) paint(container);
        return status;
      } catch (error) {
        if (requestEpoch !== pollEpoch || !onSubmittedScreen()) return null;
        root.state.setUrgentFlow({ liveStatusError: root.customerCopy.bookingError(error) });
        stopPolling();
        if (before !== statusFingerprint()) paint(container);
        return null;
      } finally {
        if (requestEpoch === pollEpoch) pollInFlight = null;
      }
    })();
    return pollInFlight;
  }

  function startPolling(container) {
    activeContainer = container;
    if (!shouldPollUrgentStatus()) {
      stopPolling();
      return;
    }
    if (pollTimer) return;
    pollTimer = setInterval(() => pollUrgentStatus(container), 10000);
    pollUrgentStatus(container);
  }

  function bindVisibilityRefresh() {
    if (visibilityRefresh) return;
    visibilityRefresh = () => {
      if (document.visibilityState === "visible" && onSubmittedScreen() && activeContainer) pollUrgentStatus(activeContainer);
    };
    document.addEventListener("visibilitychange", visibilityRefresh);
    window.addEventListener("focus", visibilityRefresh);
    window.addEventListener("pageshow", visibilityRefresh);
  }

  function unbindVisibilityRefresh() {
    if (!visibilityRefresh) return;
    document.removeEventListener?.("visibilitychange", visibilityRefresh);
    window.removeEventListener?.("focus", visibilityRefresh);
    window.removeEventListener?.("pageshow", visibilityRefresh);
    visibilityRefresh = null;
  }

  function body(submittedView) {
    const step = root.state.urgentFlow.step || "services";
    if (step === "details") return renderDetailsStep();
    if (step === "review") return renderReview();
    if (step === "submitted") return renderSubmitted(submittedView);
    return renderServicesStep();
  }

  function paint(container) {
    const step = root.state.urgentFlow.step || "services";
    const submittedView = step === "submitted"
      ? root.customerCopy.urgentSubmittedView(root.state.urgentFlow.liveStatus)
      : null;
    container.innerHTML = `
      <section class="screen urgent-screen" data-urgent-step="${step}">
        ${hero()}
        ${flowRail(step, submittedView)}
        <div class="urgent-body" data-urgent-body>${body(submittedView)}</div>
      </section>
    `;
    bind(container);
    if (step === "submitted" && shouldPollUrgentStatus()) startPolling(container);
    else stopPolling();
  }

  function updateLine(lineId, patch) {
    const next = root.services.linePatchToDraftServices(draft(), lineId, patch);
    root.state.updateDraft("urgent", { services: next });
    sanitizeUrgentDraft();
    invalidatePricing();
  }

  function bind(container) {
    container.querySelectorAll("[data-urgent-field]").forEach((element) => {
      const handler = () => {
        const field = element.getAttribute("data-urgent-field");
        const patch = { [field]: element.value };
        if (field === "maps_url") {
          const currentGpsUrl = Number.isFinite(Number(draft().gps_latitude)) && Number.isFinite(Number(draft().gps_longitude))
            ? `https://www.google.com/maps?q=${Number(draft().gps_latitude)},${Number(draft().gps_longitude)}`
            : "";
          if (String(element.value || "").trim() !== currentGpsUrl) {
            patch.gps_latitude = null;
            patch.gps_longitude = null;
            root.state.setUrgentFlow({ locationStatus: "idle", locationMessage: "" });
          }
        }
        markPayloadChanged();
        root.state.updateDraft("urgent", patch);
        if (root.state.urgentFlow.error) root.state.setUrgentFlow({ error: "" });
      };
      element.addEventListener("input", handler);
      element.addEventListener("change", handler);
    });

    container.querySelectorAll("[data-urgent-line-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.getAttribute("data-urgent-line-choice");
        const value = button.getAttribute("data-choice-value");
        const patch = { [field]: field === "btu" ? Number(value) : value };
        if (field === "ac_type") patch.wash_variant = value === root.services.WALL_AC ? "ล้างธรรมดา" : "";
        updateLine(button.getAttribute("data-line-id"), patch);
        paint(container);
        refreshPricing(container);
      });
    });

    container.querySelectorAll("[data-urgent-line-field]").forEach((element) => {
      element.addEventListener("change", () => {
        updateLine(element.getAttribute("data-line-id"), {
          [element.getAttribute("data-urgent-line-field")]: Number(element.value),
        });
        paint(container);
        refreshPricing(container);
      });
    });

    container.querySelectorAll("[data-urgent-time-proposal]").forEach((button) => {
      button.addEventListener("click", () => {
        markPayloadChanged();
        root.state.updateDraft("urgent", { allow_time_proposal: button.getAttribute("data-urgent-time-proposal") === "true" });
        root.state.setUrgentFlow({ error: "" });
        paint(container);
      });
    });

    container.querySelectorAll("[data-urgent-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-urgent-action");
        if (action === "add-line") {
          const next = [...services(), root.services.createServiceLine()];
          root.state.updateDraft("urgent", { services: next });
          invalidatePricing();
          paint(container);
          refreshPricing(container);
        } else if (action === "remove-line") {
          const lineId = button.getAttribute("data-line-id");
          const next = services().filter((line) => String(line.line_id) !== String(lineId));
          if (next.length) {
            root.state.updateDraft("urgent", { services: next });
            invalidatePricing();
            paint(container);
            refreshPricing(container);
          }
        } else if (action === "to-details") {
          const error = validateServices();
          if (error) setStep("services", error);
          else setStep("details");
          paint(container);
        } else if (action === "back-services") {
          setStep("services");
          paint(container);
        } else if (action === "to-review") {
          const error = validateDetails();
          if (error) setStep("details", error);
          else setStep("review");
          paint(container);
        } else if (action === "back-details") {
          setStep("details");
          paint(container);
        } else if (action === "use-location") {
          await requestCurrentLocation();
          paint(container);
        } else if (action === "confirm") {
          await submitUrgent(container);
        } else if (action === "retry-status") {
          root.state.setUrgentFlow({ liveStatusError: "" });
          paint(container);
        } else if (action === "new-request") {
          root.state.resetUrgentDraft();
          paint(container);
          refreshPricing(container);
        } else if (action === "track-created") {
          const key = button.getAttribute("data-tracking-key") || "";
          root.state.updateDraft("tracking", { trackingCode: key });
          root.state.setTracking({ status: "idle", data: null, error: "" });
          root.utils.routeTo("tracking");
        }
      });
    });
  }

  function render(container) {
    const lifecycleEpoch = pollEpoch;
    sanitizeUrgentDraft();
    root.state.ensureSavedAddressPrefill("urgent", () => {
      if (lifecycleEpoch === pollEpoch && root.state.currentRoute === "urgent") render(container);
    });
    if (!root.state.urgentFlow || !root.state.urgentFlow.step) {
      root.state.setUrgentFlow({
        step: "services",
        status: "idle",
        error: "",
        result: null,
        pricing: { status: "idle", data: null, error: "" },
        liveStatus: null,
        liveStatusError: "",
      });
    }
    bindVisibilityRefresh();
    paint(container);
    if (root.state.urgentFlow.step === "services" && root.state.urgentFlow.pricing?.status === "idle") {
      refreshPricing(container);
    }
  }

  render.onLeave = () => {
    pollEpoch += 1;
    pricingEpoch += 1;
    pollInFlight = null;
    activeSubmit = null;
    if (root.state.urgentFlow.status === "submitting") {
      root.state.setUrgentFlow({ step: "review", status: "idle", error: "" });
    }
    stopPolling();
    unbindVisibilityRefresh();
    activeContainer = null;
  };

  root.bookingUrgent = {
    render,
    _test: {
      sanitizeUrgentDraft,
      buildSubmitPayload,
      validateServices,
      validateDetails,
      renderServicesStep,
      renderDetailsStep,
      renderReview,
      renderSubmitted,
      requestCurrentLocation,
      refreshPricing,
    },
  };
})();
