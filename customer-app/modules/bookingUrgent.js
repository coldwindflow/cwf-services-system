(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_LINE_URL = "https://lin.ee/fG1Oq7y";
  let submitInFlight = false;
  let pollTimer = null;
  let activeContainer = null;

  function draft() {
    return root.state.draft.urgent || {};
  }

  function canonicalCleaningPatch(input) {
    const source = input || {};
    const acOptions = root.services.bookableAcTypes || [];
    const btuOptions = root.services.bookableBtuOptions || [];
    const ac = acOptions.find((item) => item.value === source.ac_type) || acOptions[0];
    const btu = btuOptions.find((item) => Number(item.btu) === Number(source.btu)) || btuOptions.find((item) => Number(item.btu) === 12000) || btuOptions[0];
    const count = Math.max(1, Math.min(10, Number(source.machine_count || 1)));
    const wallAc = root.services.WALL_AC;
    const washOptions = root.services.washVariants || [];
    const wash = washOptions.find((item) => item.value === source.wash_variant) || washOptions[0];
    return {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: ac?.value || wallAc || "ผนัง",
      btu: String(btu?.btu || 12000),
      machine_count: count,
      wash_variant: (ac?.value || wallAc) === wallAc ? (wash?.value || "ล้างธรรมดา") : "",
      repair_variant: "",
    };
  }

  function sanitizeUrgentDraft() {
    const current = draft();
    const patch = canonicalCleaningPatch(current);
    const changed = Object.entries(patch).some(([key, value]) => String(current[key] ?? "") !== String(value));
    if (changed) root.state.updateDraft("urgent", patch);
    return { ...current, ...patch };
  }

  function service() {
    return root.services.normalizeServiceDraft({ ...sanitizeUrgentDraft(), services: [] });
  }

  function setStep(step, error) {
    root.state.setUrgentFlow({ step, error: error || "" });
  }

  function serviceSummary() {
    return root.services.serviceLabel(service());
  }

  function ensureRequestKey() {
    const d = draft();
    if (d.urgent_request_key) return d.urgent_request_key;
    const key = root.utils.randomKey();
    root.state.updateDraft("urgent", { urgent_request_key: key });
    return key;
  }

  function buildSubmitPayload() {
    const d = sanitizeUrgentDraft();
    const s = service();
    const cleaningLine = {
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
      address_text: String(d.address_text || "").trim(),
      maps_url: String(d.maps_url || "").trim(),
      job_zone: String(d.job_zone || "").trim(),
      customer_note: String(d.symptom || "").trim(),
      booking_mode: "urgent",
      client_app: "customer_app_v2",
      urgent_request_key: ensureRequestKey(),
      job_type: "ล้าง",
      ac_type: cleaningLine.ac_type,
      btu: cleaningLine.btu,
      machine_count: cleaningLine.machine_count,
      wash_variant: cleaningLine.wash_variant,
      repair_variant: "",
      services: [cleaningLine],
    };
  }

  function renderChoiceGroup(field, options, selected, extraClass) {
    return `
      <div class="choice-grid ${extraClass || ""}">
        ${options.map((option) => {
          const active = String(selected || "") === String(option.value);
          return `
            <button class="choice-card ${active ? "is-selected" : ""}" type="button" data-urgent-choice="${field}" data-choice-value="${root.utils.escapeHtml(option.value)}" aria-pressed="${active ? "true" : "false"}">
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
        <label>ชนิดแอร์</label>
        ${renderChoiceGroup("ac_type", root.services.bookableAcTypes, s.ac_type, "ac-type-grid")}
      </div>
      ${s.ac_type === root.services.WALL_AC ? `
        <div class="field field-wide">
          <label>รูปแบบการล้างสำหรับแอร์ผนัง</label>
          ${renderChoiceGroup("wash_variant", root.services.washVariants, s.wash_variant || d.wash_variant, "wash-variant-grid")}
        </div>
      ` : ""}
      <div class="field field-wide">
        <label>BTU</label>
        ${renderChoiceGroup("btu", root.services.bookableBtuOptions, d.btu, "btu-choice-grid")}
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
    const d = sanitizeUrgentDraft();
    const s = service();
    const phoneDigits = String(d.customer_phone || "").replace(/\D/g, "");
    if (!String(d.customer_name || "").trim()) return "กรุณากรอกชื่อผู้ติดต่อ";
    if (phoneDigits.length < 9 || phoneDigits.length > 10) return "กรุณากรอกเบอร์โทร 9-10 หลัก";
    if (!String(d.address_text || "").trim()) return "กรุณากรอกที่อยู่หน้างาน";
    if (!s.ac_type || !s.btu || s.machine_count < 1) return "กรุณาเลือกข้อมูลแอร์ให้ครบ";
    if (s.ac_type === root.services.WALL_AC && !s.wash_variant) return "กรุณาเลือกรูปแบบการล้าง";
    if (!String(d.symptom || "").trim()) return "กรุณากรอกรายละเอียดเพิ่มเติม";
    return "";
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
        <p>ส่งรายละเอียดเพื่อให้แอดมินตรวจสอบและจัดหาช่างที่ว่าง</p>
      </div>
    `;
  }

  function flowRail(active, submittedView) {
    const steps = [
      { key: "form", label: "กรอกข้อมูล" },
      { key: "review", label: "ตรวจสอบ" },
      { key: "submitted", label: submittedView?.railLabel || "รอแอดมิน" },
    ];
    const order = { form: 0, review: 1, submitted: 2 };
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

  function renderForm() {
    const d = sanitizeUrgentDraft();
    const error = root.state.urgentFlow.error;
    return `
      <section class="card form-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">ข้อมูลลูกค้าและหน้างาน</span>
          <h2>รายละเอียดสำหรับติดต่อ</h2>
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
          <div class="field field-wide">
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
          <span class="section-kicker">งานล้างแอร์เท่านั้น</span>
          <h2>ข้อมูลแอร์</h2>
        </div>
        <div class="form-grid service-taxonomy-grid">
          ${renderServiceFields()}
          <div class="field field-wide">
            <label for="urgent-symptom">รายละเอียดเพิ่มเติม</label>
            <textarea id="urgent-symptom" class="input textarea" data-urgent-field="symptom" rows="3" placeholder="เช่น ต้องการล้างด่วนวันนี้ มีฝุ่นหรือกลิ่นผิดปกติ">${root.utils.escapeHtml(d.symptom || "")}</textarea>
          </div>
        </div>
      </section>

      <div class="notice is-urgent">คำขอนี้จะส่งให้แอดมินตรวจสอบก่อนจัดหาช่างที่ว่าง</div>
      ${error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(error)}</div>` : ""}
      <div class="button-row">
        <button class="primary-btn btn-shine" type="button" data-urgent-action="to-review">ตรวจสอบรายละเอียด</button>
      </div>
    `;
  }

  function renderReview() {
    const d = sanitizeUrgentDraft();
    const flow = root.state.urgentFlow || {};
    const submitting = flow.status === "submitting";
    return `
      <section class="card review-card urgent-card-fx">
        <div class="section-head">
          <span class="section-kicker">ตรวจสอบก่อนส่ง</span>
          <h2>ตรวจสอบรายละเอียดงานล้าง</h2>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>ผู้ติดต่อ</strong><span class="muted">${root.utils.escapeHtml(d.customer_name || "-")} / ${root.utils.escapeHtml(d.customer_phone || "-")}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${root.utils.escapeHtml(serviceSummary())}</span></div>
          <div class="data-row"><strong>รายละเอียด</strong><span class="muted">${root.utils.escapeHtml(d.symptom || "-")}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${root.utils.escapeHtml(d.address_text || "-")}</span></div>
          ${d.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone)}</span></div>` : ""}
          ${d.maps_url ? '<div class="data-row"><strong>แผนที่</strong><span class="muted">มีลิงก์แผนที่แนบ</span></div>' : ""}
        </div>
        <div class="notice is-urgent">แอดมินจะตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง</div>
        ${flow.error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(flow.error)}</div>` : ""}
        <div class="button-row">
          ${flow.disabled_line_url
            ? `<a class="primary-btn line-fallback-btn" href="${ADMIN_LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>`
            : `<button class="primary-btn btn-shine" type="button" data-urgent-action="confirm" ${submitting ? "disabled" : ""}>${submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอ"}</button>`}
          <button class="secondary-btn" type="button" data-urgent-action="back-form" ${submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
        </div>
      </section>
    `;
  }

  function isUrgentRequestTerminal(status) {
    return root.customerCopy.urgentSubmittedView(status).state === "terminal";
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
          <div class="data-row"><strong>พื้นที่</strong><span class="muted">${root.utils.escapeHtml(d.job_zone || "-")}</span></div>
          <div class="data-row"><strong>สถานะ</strong><span class="muted">${root.utils.escapeHtml(view.statusLabel)}</span></div>
        </div>
        ${flow.liveStatusError ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(flow.liveStatusError)}</div>` : ""}
        <div class="button-row">
          ${trackingKey ? `<button class="primary-btn" type="button" data-urgent-action="track-created" data-tracking-key="${root.utils.escapeHtml(trackingKey)}">ติดตามสถานะงาน</button>` : ""}
          ${view.showAdminContact ? `<a class="secondary-btn line-fallback-btn" href="${ADMIN_LINE_URL}" target="_blank" rel="noopener noreferrer">ติดต่อแอดมินทาง LINE</a>` : ""}
          <button class="secondary-btn" type="button" data-route="home">กลับหน้าแรก</button>
        </div>
      </section>
    `;
  }

  async function submitUrgent(container) {
    if (submitInFlight || root.state.urgentFlow.status === "submitting") return;
    submitInFlight = true;
    root.state.setUrgentFlow({ step: "review", status: "submitting", error: "", result: null, disabled_line_url: "" });
    paint(container);
    try {
      const result = await root.api.submitUrgentRequest(buildSubmitPayload());
      const trackingKey = trackingKeyFromResult(result);
      if (trackingKey) root.state.updateDraft("tracking", { trackingCode: trackingKey });
      root.state.setUrgentFlow({ step: "submitted", status: "success", error: "", result, liveStatus: null, liveStatusError: "" });
    } catch (error) {
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
      submitInFlight = false;
      paint(container);
    }
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function onSubmittedScreen() {
    return root.state.currentRoute === "urgent" && root.state.urgentFlow.step === "submitted";
  }

  async function pollUrgentStatus(container) {
    const key = trackingKeyFromResult(root.state.urgentFlow?.result || null);
    if (!key) return;
    try {
      const status = await root.api.loadUrgentStatus(key);
      root.state.setUrgentFlow({ liveStatus: status, liveStatusError: "" });
      if (onSubmittedScreen()) paint(container);
      if (isUrgentRequestTerminal(status)) stopPolling();
    } catch (error) {
      root.state.setUrgentFlow({ liveStatusError: root.customerCopy.bookingError(error) });
      if (onSubmittedScreen()) paint(container);
    }
  }

  function startPolling(container) {
    activeContainer = container;
    if (pollTimer) return;
    pollUrgentStatus(container);
    pollTimer = setInterval(() => pollUrgentStatus(container), 10000);
  }

  let visibilityBound = false;
  function bindVisibilityRefresh() {
    if (visibilityBound) return;
    visibilityBound = true;
    const refresh = () => {
      if (document.visibilityState === "visible" && onSubmittedScreen() && activeContainer) pollUrgentStatus(activeContainer);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
  }

  function body(submittedView) {
    const step = root.state.urgentFlow.step || "form";
    if (step === "review") return renderReview();
    if (step === "submitted") return renderSubmitted(submittedView);
    return renderForm();
  }

  function paint(container) {
    const step = root.state.urgentFlow.step || "form";
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
    if (step === "submitted" && !isUrgentRequestTerminal(root.state.urgentFlow.liveStatus)) startPolling(container);
    else stopPolling();
  }

  function servicePatch(field, value) {
    const patch = { [field]: value, service_kind: "clean", job_type: "ล้าง", repair_variant: "" };
    if (field === "ac_type") patch.wash_variant = value === root.services.WALL_AC ? (draft().wash_variant || "ล้างธรรมดา") : "";
    return patch;
  }

  function bind(container) {
    container.querySelectorAll("[data-urgent-field]").forEach((element) => {
      const handler = () => {
        root.state.updateDraft("urgent", { [element.getAttribute("data-urgent-field")]: element.value });
        if (root.state.urgentFlow.error) root.state.setUrgentFlow({ error: "" });
      };
      element.addEventListener("input", handler);
      element.addEventListener("change", handler);
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

    container.querySelectorAll("[data-urgent-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-urgent-action");
        if (action === "to-review") {
          const error = validate();
          if (error) setStep("form", error);
          else setStep("review");
          paint(container);
        } else if (action === "back-form") {
          setStep("form");
          paint(container);
        } else if (action === "confirm") {
          await submitUrgent(container);
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
    sanitizeUrgentDraft();
    root.state.ensureSavedAddressPrefill("urgent", () => {
      if (root.state.currentRoute === "urgent") render(container);
    });
    if (!root.state.urgentFlow || !root.state.urgentFlow.step) {
      root.state.setUrgentFlow({ step: "form", status: "idle", error: "", result: null, liveStatus: null, liveStatusError: "" });
    }
    bindVisibilityRefresh();
    paint(container);
  }

  render.onLeave = () => {
    stopPolling();
    activeContainer = null;
  };

  root.bookingUrgent = {
    render,
    _test: {
      canonicalCleaningPatch,
      sanitizeUrgentDraft,
      buildSubmitPayload,
      validate,
      renderForm,
      renderReview,
      renderSubmitted,
    },
  };
})();
