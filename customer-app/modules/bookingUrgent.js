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
      job_type: "à¸¥à¹‰à¸²à¸‡",
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
      job_type: "à¸¥à¹‰à¸²à¸‡",
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
    return services().map((line) => root.services.serviceLabel(line)).join(" â€¢ ");
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

  function validGpsPair(source) {
    const rawLatitude = source?.gps_latitude;
    const rawLongitude = source?.gps_longitude;
    const latitudeProvided = rawLatitude !== null && rawLatitude !== undefined && String(rawLatitude).trim() !== "";
    const longitudeProvided = rawLongitude !== null && rawLongitude !== undefined && String(rawLongitude).trim() !== "";
    if (!(latitudeProvided && longitudeProvided)) return null;
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    if (latitude === 0 && longitude === 0) return null;
    return { latitude, longitude };
  }

  function buildSubmitPayload() {
    const d = sanitizeUrgentDraft();
    const payload = servicePayload() || {};
    const cleaningLines = (Array.isArray(payload.services) ? payload.services : []).map((line) => ({
      ...line,
      job_type: "à¸¥à¹‰à¸²à¸‡",
      repair_variant: "",
    }));
    const gps = validGpsPair(d);
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
      ...(gps ? { gps_latitude: gps.latitude, gps_longitude: gps.longitude } : {}),
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
          <button type="button" class="text-btn danger-text" data-urgent-action="remove-line" data-line-id="${root.utils.escapeHtml(s.line_id)}" ${canRemove ? "" : "disabled"}>à¸¥à¸š</button>
        </div>
        <div class="field field-wide">
          <label>à¸Šà¸™à¸´à¸”à¹à¸­à¸£à¹Œ</label>
          ${choiceGroup("ac_type", root.services.bookableAcTypes, s.ac_type, "ac-type-grid", s.line_id)}
        </div>
        ${s.ac_type === root.services.WALL_AC ? `
          <div class="field field-wide">
            <label>à¸§à¸´à¸˜à¸µà¸¥à¹‰à¸²à¸‡</label>
            ${choiceGroup("wash_variant", root.services.washVariants, s.wash_variant, "wash-variant-grid", s.line_id)}
          </div>
        ` : ""}
        <div class="field field-wide">
          <label>BTU</label>
          ${choiceGroup("btu", root.services.bookableBtuOptions, s.btu, "btu-choice-grid", s.line_id)}
        </div>
        <div class="field">
          <label for="urgent-line-count-${root.utils.escapeHtml(s.line_id)}">à¸ˆà¸³à¸™à¸§à¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡</label>
          <select id="urgent-line-count-${root.utils.escapeHtml(s.line_id)}" class="select" data-urgent-line-field="machine_count" data-line-id="${root.utils.escapeHtml(s.line_id)}">
            ${root.services.machineCounts.map((count) => `<option value="${count}" ${Number(s.machine_count) === count ? "selected" : ""}>${count} à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡</option>`).join("")}
          </select>
        </div>
      </article>
    `;
  }

  function renderPricingSummary() {
    const pricing = root.state.urgentFlow?.pricing || { status: "idle", data: null, error: "" };
    if (pricing.status === "loading") return root.utils.stateBox("loading", "à¸à¸³à¸¥à¸±à¸‡à¸„à¸³à¸™à¸§à¸“à¸£à¸²à¸„à¸²à¹à¸¥à¸°à¹€à¸§à¸¥à¸²à¸—à¸³à¸‡à¸²à¸™...");
    if (pricing.status === "error") return root.utils.stateBox("error", pricing.error || "à¸„à¸³à¸™à¸§à¸“à¸£à¸²à¸„à¸²à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡");
    if (!pricing.data) return root.utils.stateBox("", "à¸£à¸°à¸šà¸šà¸ˆà¸°à¸„à¸³à¸™à¸§à¸“à¸£à¸²à¸„à¸²à¸ˆà¸²à¸à¸£à¸²à¸¢à¸à¸²à¸£à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸");
    return `
      <div class="wizard-price-summary">
        <div><span>à¸£à¸²à¸„à¸²à¸£à¸§à¸¡à¸›à¸£à¸°à¸¡à¸²à¸“à¸à¸²à¸£</span><strong>${root.utils.formatBaht(finalPrice())}</strong></div>
        <div><span>à¹€à¸§à¸¥à¸²à¸—à¸³à¸‡à¸²à¸™à¸£à¸§à¸¡</span><strong>${root.utils.escapeHtml(pricing.data.duration_min || "-")} à¸™à¸²à¸—à¸µ</strong></div>
        ${pricing.data.promo ? `<small>à¹ƒà¸Šà¹‰à¹‚à¸›à¸£à¹‚à¸¡à¸Šà¸±à¸™: ${root.utils.escapeHtml(pricing.data.promo.promo_name || "à¹‚à¸›à¸£à¹‚à¸¡à¸Šà¸±à¸™à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™")}</small>` : ""}
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
              <small>${root.utils.escapeHtml(summary.line2)} Â· ${root.utils.escapeHtml(linePrice)}</small>
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
          <span class="section-kicker">à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™ 1 à¸ˆà¸²à¸ 3</span>
          <h2>à¸šà¸£à¸´à¸à¸²à¸£à¹à¸¥à¸°à¸£à¸²à¸„à¸²</h2>
          <p class="muted">à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸²à¸¢à¸à¸²à¸£à¹à¸¢à¸à¸•à¸²à¸¡à¸Šà¸™à¸´à¸”à¹à¸­à¸£à¹Œ BTU à¸ˆà¸³à¸™à¸§à¸™ à¹à¸¥à¸°à¸§à¸´à¸˜à¸µà¸¥à¹‰à¸²à¸‡</p>
        </div>
        <div class="service-line-list">${services().map(renderServiceLineCard).join("")}</div>
        <button type="button" class="secondary-btn" data-urgent-action="add-line">+ à¹€à¸žà¸´à¹ˆà¸¡à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡ / à¹€à¸žà¸´à¹ˆà¸¡à¸£à¸²à¸¢à¸à¸²à¸£</button>
        <div class="slot-section-divider"></div>
        ${renderServiceReviewList()}
        ${renderPricingSummary()}
      </section>
      ${error ? `<div class="state-box is-error" role="alert">${root.utils.escapeHtml(error)}</div>` : ""}
      <div class="button-row">
        <button class="primary-btn btn-shine" type="button" data-urgent-action="to-details">à¸à¸£à¸­à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸«à¸™à¹‰à¸²à¸‡à¸²à¸™</button>
      </div>
    `;
  }

  function renderTimePreference() {
    const flexible = draft().allow_time_proposal === true;
    return `
      <div class="choice-grid">
        <button type="button" class="choice-card ${flexible ? "" : "is-selected"}" data-urgent-time-proposal="false" aria-pressed="${flexible ? "false" : "true"}">
          <strong>à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸•à¸²à¸¡à¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸</strong>
          <span>à¹à¸­à¸”à¸¡à¸´à¸™à¸ˆà¸°à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹€à¸§à¸¥à¸²à¸™à¸µà¹‰à¸à¹ˆà¸­à¸™à¸¢à¸·à¸™à¸¢à¸±à¸™</span>
        </button>
        <button type="button" class="choice-card ${flexible ? "is-selected" : ""}" data-urgent-time-proposal="true" aria-pressed="${flexible ? "true" : "false"}">
          <strong>à¸ªà¸²à¸¡à¸²à¸£à¸–à¹€à¸ªà¸™à¸­à¹€à¸§à¸¥à¸²à¹ƒà¸«à¸¡à¹ˆà¹ƒà¸«à¹‰à¸‰à¸±à¸™à¹„à¸”à¹‰</strong>
          <span>à¹à¸­à¸”à¸¡à¸´à¸™à¸•à¸´à¸”à¸•à¹ˆà¸­à¸à¸¥à¸±à¸šà¸«à¸²à¸à¸•à¹‰à¸­à¸‡à¸›à¸£à¸±à¸šà¹€à¸§à¸¥à¸²</span>
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
          <span class="section-kicker">à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™ 2 à¸ˆà¸²à¸ 3</span>
          <h2>à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸«à¸™à¹‰à¸²à¸‡à¸²à¸™à¹à¸¥à¸°à¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£</h2>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="urgent-name">à¸Šà¸·à¹ˆà¸­à¸œà¸¹à¹‰à¸•à¸´à¸”à¸•à¹ˆà¸­</label>
            <input id="urgent-name" class="input" value="${root.utils.escapeHtml(d.customer_name || "")}" data-urgent-field="customer_name" autocomplete="name">
          </div>
          <div class="field">
            <label for="urgent-phone">à¹€à¸šà¸­à¸£à¹Œà¹‚à¸—à¸£</label>
            <input id="urgent-phone" class="input" value="${root.utils.escapeHtml(d.customer_phone || "")}" data-urgent-field="customer_phone" inputmode="tel" autocomplete="tel">
          </div>
          <div class="field">
            <label for="urgent-date">à¸§à¸±à¸™à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£</label>
            <input id="urgent-date" class="input" type="date" value="${root.utils.escapeHtml(d.date || "")}" data-urgent-field="date">
          </div>
          <div class="field">
            <label for="urgent-time">à¹€à¸§à¸¥à¸²à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£</label>
            <input id="urgent-time" class="input" type="time" value="${root.utils.escapeHtml(d.time || "")}" data-urgent-field="time">
          </div>
          <div class="field field-wide">
            <label>à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¹€à¸§à¸¥à¸²</label>
            ${renderTimePreference()}
          </div>
          <div class="field field-wide">
            <label for="urgent-address">à¸—à¸µà¹ˆà¸­à¸¢à¸¹à¹ˆà¸«à¸™à¹‰à¸²à¸‡à¸²à¸™</label>
            <textarea id="urgent-address" class="input textarea" data-urgent-field="address_text" rows="3">${root.utils.escapeHtml(d.address_text || "")}</textarea>
          </div>
          <div class="field field-wide">
            <label for="urgent-maps">à¸¥à¸´à¸‡à¸à¹Œ Google Maps (à¸–à¹‰à¸ã}÷¶‰žËkºwµç@ñ‘¥Ø±…ÍÌô‰™±½ÜµÉ…¥°ˆ…É¥„µ±…‰•°ô‹‚â‚âÇ‚æ'‚âg‚âW‚â·‚âg‚â#‚â·‚â‚â—‚æ'‚âË‚â‚æ‚â·‚â‚æ3‚âS‚æ#‚âŸ‚âdˆø(€€€€€€€€‘íÍÑ•ÁÌ¹µ…À ¡¥Ñ•´°¥¹‘•à¤€ôø€(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±½Üµ¹½‘”€‘í¥¹‘•à€ð…Ñ¥Ù•%¹‘•à€ü€‰¥Ìµ‘½¹”ˆ€è€ˆ‰ô€‘í¥¹‘•à€ôôô…Ñ¥Ù•%¹‘•à€ü€‰¥Ìµ…Ñ¥Ù”ˆ€è€ˆ‰ôˆø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰™±½Üµ‰Õ±±•Ðˆø‘í¥¹‘•à€ð…Ñ¥Ù•%¹‘•à€ü€‹ŠrLˆ€è¥¹‘•à€¬€Åôð½ÍÁ…¸ø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰™±½Üµ±…‰•°ˆø‘í¥Ñ•´¹±…‰•±ôð½ÍÁ…¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€¤¹©½¥¸ œñÍÁ…¸±…ÍÌô‰™±½Üµ‰…Èˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøð½ÍÁ…¸øœ¥ô(€€€€€€ð½‘¥Øø(€€€€ì(€ô((€™Õ¹Ñ¥½¸É•¹‘•ÉMÕ‰µ¥ÑÑ•¡ÍÕ‰µ¥ÑÑ•‘Y¥•Ü¤ì(€€€½¹ÍÐ€ô‘É…™Ð ¤ì(€€€½¹ÍÐ™±½Ü€ôÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Üñðíôì(€€€½¹ÍÐÉ•ÍÕ±Ð€ô™±½Ü¹É•ÍÕ±Ðñðíôì(€€€½¹ÍÐÑÉ…­¥¹-•ä€ôÑÉ…­¥¹-•åÉ½µI•ÍÕ±Ð¡É•ÍÕ±Ð¤ì(€€€½¹ÍÐÙ¥•Ü€ôÍÕ‰µ¥ÑÑ•‘Y¥•ÜñðÉ½½Ð¹ÕÍÑ½µ•É½Áä¹ÕÉ•¹ÑMÕ‰µ¥ÑÑ•‘Y¥•Ü¡™±½Ü¹±¥Ù•MÑ…ÑÕÌ¤ì(€€€É•ÑÕÉ¸€(€€€€€€ñÍ•Ñ¥½¸±…ÍÌô‰…É€‘íÙ¥•Ü¹…É‘±…ÍÍô‰½½­¥¹œµÉ•ÍÕ±Ðµ…ÉÕÉ•¹Ðµ…Éµ™àˆø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰ÍÕ•ÍÌµµ…É¬ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹µ…É¬¥ôð½‘¥Øø(€€€€€€€€ñÍÁ…¸±…ÍÌô‰Í•Ñ¥½¸µ­¥­•Èˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹­¥­•È¥ôð½ÍÁ…¸ø(€€€€€€€€ñ Èø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹Ñ¥Ñ±”¥ôð½ Èø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰ÍÑ…Ñ”µ‰½à€‘íÙ¥•Ü¹‰½á±…ÍÍôˆ‘…Ñ„µÕÉ•¹Ðµ±¥Ù”µÍÑ…ÑÕÌø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹µ•ÍÍ…”¥ôð½‘¥Øø(€€€€€€€€ñÀ±…ÍÌô‰µÕÑ•ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹‘•Ñ…¥°¥ôð½Àø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘…Ñ„µ±¥ÍÐˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘…Ñ„µÉ½ÜˆøñÍÑÉ½¹œû‚â‚â¯‚âÇ‚â«‚â‚âË‚â‚â#‚â·‚âð½ÍÑÉ½¹œøñÍÁ…¸±…ÍÌô‰‰½½­¥¹œµ½‘”µÙ…±Õ”ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡É•ÍÕ±Ð¹‰½½­¥¹}½‘”ñð€ˆ´ˆ¥ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘…Ñ„µÉ½ÜˆøñÍÑÉ½¹œû‚âk‚â‚âÓ‚â‚âË‚âŒð½ÍÑÉ½¹œøñÍÁ…¸±…ÍÌô‰µÕÑ•ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Í•ÉÙ¥•MÕµµ…Éä ¤¥ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘…Ñ„µÉ½ÜˆøñÍÑÉ½¹œû‚æ‚âŸ‚â—‚âË‚â_‚â×‚æ#‚âW‚æ'‚â·‚â‚â‚âË‚âŒð½ÍÑÉ½¹œøñÍÁ…¸±…ÍÌô‰µÕÑ•ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡™½Éµ…ÑÁÁ½¥¹Ñµ•¹Ð ¤¥ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰‘…Ñ„µÉ½ÜˆøñÍÑÉ½¹œû‚â«‚â[‚âË‚âg‚âÀð½ÍÑÉ½¹œøñÍÁ…¸±…ÍÌô‰µÕÑ•ˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡Ù¥•Ü¹ÍÑ…ÑÕÍ1…‰•°¥ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€€€‘í™±½Ü¹±¥Ù•MÑ…ÑÕÍÉÉ½È€ü€ñ‘¥Ø±…ÍÌô‰ÍÑ…Ñ”µ‰½à¥Ìµ•ÉÉ½ÈˆÉ½±”ô‰…±•ÉÐˆø‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡™±½Ü¹±¥Ù•MÑ…ÑÕÍÉÉ½È¥ôð½‘¥Øù€€è€ˆ‰ô(€€€€€€€€ñ‘¥Ø±…ÍÌô‰‰ÕÑÑ½¸µÉ½Üˆø(€€€€€€€€€€‘í™±½Ü¹±¥Ù•MÑ…ÑÕÍÉÉ½È€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäµ‰Ñ¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÕÉ•¹Ðµ…Ñ¥½¸ô‰É•ÑÉäµÍÑ…ÑÕÌˆû‚â—‚â·‚â‚âW‚â‚âŸ‚â#‚â«‚â·‚âk‚â«‚â[‚âË‚âg‚âÃ‚â·‚â×‚â‚â‚â‚âÇ‚æ'‚âð½‰ÕÑÑ½¸ù€€è€ˆ‰ô(€€€€€€€€€€‘íÑÉ…­¥¹-•ä€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäµ‰Ñ¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÕÉ•¹Ðµ…Ñ¥½¸ô‰ÑÉ…¬µÉ•…Ñ•ˆ‘…Ñ„µÑÉ…­¥¹œµ­•äôˆ‘íÉ½½Ð¹ÕÑ¥±Ì¹•Í…Á•!Ñµ°¡ÑÉ…­¥¹-•ä¥ôˆû‚âW‚âÓ‚âS‚âW‚âË‚â‡‚â«‚â[‚âË‚âg‚âÃ‚â‚âË‚âdð½‰ÕÑÑ½¸ù€€è€ˆ‰ô(€€€€€€€€€€‘íÙ¥•Ü¹Í¡½Ý‘µ¥¹½¹Ñ…Ð€ü€ñ„±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸±¥¹”µ™…±±‰…¬µ‰Ñ¸ˆ¡É•˜ôˆ‘í5%9}1%9}UI1ôˆÑ…É•Ðô‰}‰±…¹¬ˆÉ•°ô‰¹½½Á•¹•È¹½É•™•ÉÉ•Èˆû‚âW‚âÓ‚âS‚âW‚æ#‚â·‚æ‚â·‚âS‚â‡‚âÓ‚âg‚â_‚âË‚â1%9ð½„ù€€è€ˆ‰ô(€€€€€€€€€€‘íÙ¥•Ü¹ÍÑ…Ñ”€ôôô€‰Ñ•Éµ¥¹…°ˆ€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÕÉ•¹Ðµ…Ñ¥½¸ô‰¹•ÜµÉ•ÅÕ•ÍÐˆû‚â#‚â·‚â‚â—‚æ'‚âË‚â‚æ‚â·‚â‚æ3‚æ‚â¯‚â‡‚æ ð½‰ÕÑÑ½¸ù€€è€ˆ‰ô(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÌô‰Í•½¹‘…Éäµ‰Ñ¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÉ½ÕÑ”ô‰¡½µ”ˆû‚â‚â—‚âÇ‚âk‚â¯‚âg‚æ'‚âË‚æ‚â‚âð½‰ÕÑÑ½¸ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½Í•Ñ¥½¸ø(€€€€ì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸ÍÕ‰µ¥ÑUÉ•¹Ð¡½¹Ñ…¥¹•È¤ì(€€€¥˜€¡…Ñ¥Ù•MÕ‰µ¥ÐñðÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ¥¹œˆ¤É•ÑÕÉ¸ì(€€€½¹ÍÐÍÕ‰µ¥ÑÁ½ €ôÁ½±±Á½ ì(€€€½¹ÍÐÍÕ‰µ¥ÑÑÑ•µÁÐ€ôì•Á½ èÍÕ‰µ¥ÑÁ½ ôì(€€€…Ñ¥Ù•MÕ‰µ¥Ð€ôÍÕ‰µ¥ÑÑÑ•µÁÐì(€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì(€€€€€ÍÑ•Àè€‰É•Ù¥•Üˆ°(€€€€€ÍÑ…ÑÕÌè€‰ÍÕ‰µ¥ÑÑ¥¹œˆ°(€€€€€ÍÕ‰µ¥ÑÑÑ•µÁÑ•èÑÉÕ”°(€€€€€•ÉÉ½Èè€ˆˆ°(€€€€€É•ÍÕ±Ðè¹Õ±°°(€€€€€‘¥Í…‰±•‘}±¥¹•}ÕÉ°è€ˆˆ°(€€€ô¤ì(€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€ÑÉäì(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÉ½½Ð¹…Á¤¹ÍÕ‰µ¥ÑUÉ•¹ÑI•ÅÕ•ÍÐ¡‰Õ¥±‘MÕ‰µ¥ÑA…å±½… ¤¤ì(€€€€€¥˜€¡ÍÕ‰µ¥ÑÁ½ €„ôôÁ½±±Á½ ¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐÑÉ…­¥¹-•ä€ôÑÉ…­¥¹-•åÉ½µI•ÍÕ±Ð¡É•ÍÕ±Ð¤ì(€€€€€¥˜€¡ÑÉ…­¥¹-•ä¤É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÑÉ…­¥¹œˆ°ìÑÉ…­¥¹½‘”èÑÉ…­¥¹-•äô¤ì(€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ìÍÑ•Àè€‰ÍÕ‰µ¥ÑÑ•ˆ°ÍÑ…ÑÕÌè€‰ÍÕ•ÍÌˆ°•ÉÉ½Èè€ˆˆ°É•ÍÕ±Ð°±¥Ù•MÑ…ÑÕÌè¹Õ±°°±¥Ù•MÑ…ÑÕÍÉÉ½Èè€ˆˆô¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€¥˜€¡ÍÕ‰µ¥ÑÁ½ €„ôôÁ½±±Á½ ¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ‘¥Í…‰±•€ôl‰UI9Q}	==-%9}%M	1ˆ°€‰UMQ=5I}	==-%9}%M	1ˆ°€‰=91%9}	==-%9}%M	1‰t(€€€€€€€€¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡•ÉÉ½Èü¹‘…Ñ„ü¹½‘”ñð€ˆˆ¤¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤¤(€€€€€€€ñð9Õµ‰•È¡•ÉÉ½Èü¹ÍÑ…ÑÕÌ¤€ôôô€ÔÀÌì(€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì(€€€€€€€ÍÑ•Àè€‰É•Ù¥•Üˆ°(€€€€€€€ÍÑ…ÑÕÌè€‰•ÉÉ½Èˆ°(€€€€€€€•ÉÉ½ÈèÉ½½Ð¹ÕÍÑ½µ•É½Áä¹‰½½­¥¹ÉÉ½È¡•ÉÉ½È°‘¥Í…‰±•€ü€‰‘¥Í…‰±•ˆ€èÕ¹‘•™¥¹•¤°(€€€€€€€É•ÍÕ±Ðè¹Õ±°°(€€€€€€€‘¥Í…‰±•‘}±¥¹•}ÕÉ°è‘¥Í…‰±•€ü5%9}1%9}UI0€è€ˆˆ°(€€€€€ô¤ì(€€€ô™¥¹…±±äì(€€€€€¥˜€¡…Ñ¥Ù•MÕ‰µ¥Ð€ôôôÍÕ‰µ¥ÑÑÑ•µÁÐ¤…Ñ¥Ù•MÕ‰µ¥Ð€ô¹Õ±°ì(€€€€€¥˜€¡ÍÕ‰µ¥ÑÁ½ €ôôôÁ½±±Á½ ¤Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€ô(€ô((€™Õ¹Ñ¥½¸ÍÑ½ÁA½±±¥¹œ ¤ì(€€€¥˜€¡Á½±±Q¥µ•È¤±•…É%¹Ñ•ÉÙ…°¡Á½±±Q¥µ•È¤ì(€€€Á½±±Q¥µ•È€ô¹Õ±°ì(€ô((€™Õ¹Ñ¥½¸½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤ì(€€€É•ÑÕÉ¸É½½Ð¹ÍÑ…Ñ”¹ÕÉÉ•¹ÑI½ÕÑ”€ôôô€‰ÕÉ•¹Ðˆ€˜˜É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ•À€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆì(€ô((€™Õ¹Ñ¥½¸ÍÑ…ÑÕÍ¥¹•ÉÁÉ¥¹Ð ¤ì(€€€½¹ÍÐ™±½Ü€ôÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Üñðíôì(€€€½¹ÍÐÙ¥•Ü€ôÉ½½Ð¹ÕÍÑ½µ•É½Áä¹ÕÉ•¹ÑMÕ‰µ¥ÑÑ•‘Y¥•Ü¡™±½Ü¹±¥Ù•MÑ…ÑÕÌ¤ì(€€€É•ÑÕÉ¸€‘íÙ¥•Ü¹ÍÑ…Ñ•õð‘íÙ¥•Ü¹ÍÑ…ÑÕÍ1…‰•±õð‘íMÑÉ¥¹œ¡™±½Ü¹±¥Ù•MÑ…ÑÕÍÉÉ½Èñð€ˆˆ¥õ€ì(€ô((€™Õ¹Ñ¥½¸Í¡½Õ±‘A½±±UÉ•¹ÑMÑ…ÑÕÌ ¤ì(€€€½¹ÍÐ™±½Ü€ôÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Üñðíôì(€€€½¹ÍÐ­•ä€ôÑÉ…­¥¹-•åÉ½µI•ÍÕ±Ð¡™±½Ü¹É•ÍÕ±Ðñð¹Õ±°¤ì(€€€½¹ÍÐÙ¥•Ü€ôÉ½½Ð¹ÕÍÑ½µ•É½Áä¹ÕÉ•¹ÑMÕ‰µ¥ÑÑ•‘Y¥•Ü¡™±½Ü¹±¥Ù•MÑ…ÑÕÌ¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡­•ä¤€˜˜½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤€˜˜€…™±½Ü¹±¥Ù•MÑ…ÑÕÍÉÉ½È€˜˜Ù¥•Ü¹ÍÑ…Ñ”€ôôô€‰Á•¹‘¥¹œˆì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸Á½±±UÉ•¹ÑMÑ…ÑÕÌ¡½¹Ñ…¥¹•È¤ì(€€€¥˜€¡Á½±±%¹±¥¡Ð¤É•ÑÕÉ¸Á½±±%¹±¥¡Ðì(€€€½¹ÍÐ­•ä€ôÑÉ…­¥¹-•åÉ½µI•ÍÕ±Ð¡É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Üü¹É•ÍÕ±Ðñð¹Õ±°¤ì(€€€¥˜€ …­•äñð€…½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤¤ì(€€€€€ÍÑ½ÁA½±±¥¹œ ¤ì(€€€€€É•ÑÕÉ¸¹Õ±°ì(€€€ô(€€€½¹ÍÐÉ•ÅÕ•ÍÑÁ½ €ôÁ½±±Á½ ì(€€€½¹ÍÐ‰•™½É”€ôÍÑ…ÑÕÍ¥¹•ÉÁÉ¥¹Ð ¤ì(€€€Á½±±%¹±¥¡Ð€ô€¡…Íå¹Œ€ ¤€ôøì(€€€€€ÑÉäì(€€€€€€€½¹ÍÐÍÑ…ÑÕÌ€ô…Ý…¥ÐÉ½½Ð¹…Á¤¹±½…‘UÉ•¹ÑMÑ…ÑÕÌ¡­•ä¤ì(€€€€€€€¥˜€¡É•ÅÕ•ÍÑÁ½ €„ôôÁ½±±Á½ ñð€…½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì±¥Ù•MÑ…ÑÕÌèÍÑ…ÑÕÌ°±¥Ù•MÑ…ÑÕÍÉÉ½Èè€ˆˆô¤ì(€€€€€€€½¹ÍÐÙ¥•Ü€ôÉ½½Ð¹ÕÍÑ½µ•É½Áä¹ÕÉ•¹ÑMÕ‰µ¥ÑÑ•‘Y¥•Ü¡ÍÑ…ÑÕÌ¤ì(€€€€€€€¥˜€¡Ù¥•Ü¹ÍÑ…Ñ”€„ôô€‰Á•¹‘¥¹œˆ¤ÍÑ½ÁA½±±¥¹œ ¤ì(€€€€€€€¥˜€¡‰•™½É”€„ôôÍÑ…ÑÕÍ¥¹•ÉÁÉ¥¹Ð ¤¤Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€É•ÑÕÉ¸ÍÑ…ÑÕÌì(€€€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€€€¥˜€¡É•ÅÕ•ÍÑÁ½ €„ôôÁ½±±Á½ ñð€…½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì±¥Ù•MÑ…ÑÕÍÉÉ½ÈèÉ½½Ð¹ÕÍÑ½µ•É½Áä¹‰½½­¥¹ÉÉ½È¡•ÉÉ½È¤ô¤ì(€€€€€€€ÍÑ½ÁA½±±¥¹œ ¤ì(€€€€€€€¥˜€¡‰•™½É”€„ôôÍÑ…ÑÕÍ¥¹•ÉÁÉ¥¹Ð ¤¤Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€É•ÑÕÉ¸¹Õ±°ì(€€€€€ô™¥¹…±±äì(€€€€€€€¥˜€¡É•ÅÕ•ÍÑÁ½ €ôôôÁ½±±Á½ ¤Á½±±%¹±¥¡Ð€ô¹Õ±°ì(€€€€€ô(€€€ô¤ ¤ì(€€€É•ÑÕÉ¸Á½±±%¹±¥¡Ðì(€ô((€™Õ¹Ñ¥½¸ÍÑ…ÉÑA½±±¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€…Ñ¥Ù•½¹Ñ…¥¹•È€ô½¹Ñ…¥¹•Èì(€€€¥˜€ …Í¡½Õ±‘A½±±UÉ•¹ÑMÑ…ÑÕÌ ¤¤ì(€€€€€ÍÑ½ÁA½±±¥¹œ ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡Á½±±Q¥µ•È¤É•ÑÕÉ¸ì(€€€Á½±±Q¥µ•È€ôÍ•Ñ%¹Ñ•ÉÙ…°  ¤€ôøÁ½±±UÉ•¹ÑMÑ…ÑÕÌ¡½¹Ñ…¥¹•È¤°€ÄÀÀÀÀ¤ì(€€€Á½±±UÉ•¹ÑMÑ…ÑÕÌ¡½¹Ñ…¥¹•È¤ì(€ô((€™Õ¹Ñ¥½¸‰¥¹‘Y¥Í¥‰¥±¥ÑåI•™É•Í  ¤ì(€€€¥˜€¡Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤É•ÑÕÉ¸ì(€€€Ù¥Í¥‰¥±¥ÑåI•™É•Í €ô€ ¤€ôøì(€€€€€¥˜€¡‘½Õµ•¹Ð¹Ù¥Í¥‰¥±¥ÑåMÑ…Ñ”€ôôô€‰Ù¥Í¥‰±”ˆ€˜˜½¹MÕ‰µ¥ÑÑ•‘MÉ••¸ ¤€˜˜…Ñ¥Ù•½¹Ñ…¥¹•È¤Á½±±UÉ•¹ÑMÑ…ÑÕÌ¡…Ñ¥Ù•½¹Ñ…¥¹•È¤ì(€€€ôì(€€€‘½Õµ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ù¥Í¥‰¥±¥Ñå¡…¹”ˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰™½ÕÌˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á…•Í¡½Üˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€ô((€™Õ¹Ñ¥½¸Õ¹‰¥¹‘Y¥Í¥‰¥±¥ÑåI•™É•Í  ¤ì(€€€¥˜€ …Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤É•ÑÕÉ¸ì(€€€‘½Õµ•¹Ð¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•Èü¸ ‰Ù¥Í¥‰¥±¥Ñå¡…¹”ˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•Èü¸ ‰™½ÕÌˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•Èü¸ ‰Á…•Í¡½Üˆ°Ù¥Í¥‰¥±¥ÑåI•™É•Í ¤ì(€€€Ù¥Í¥‰¥±¥ÑåI•™É•Í €ô¹Õ±°ì(€ô((€™Õ¹Ñ¥½¸‰½‘ä¡ÍÕ‰µ¥ÑÑ•‘Y¥•Ü¤ì(€€€½¹ÍÐÍÑ•À€ôÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ•Àñð€‰Í•ÉÙ¥•Ìˆì(€€€¥˜€¡ÍÑ•À€ôôô€‰‘•Ñ…¥±Ìˆ¤É•ÑÕÉ¸É•¹‘•É•Ñ…¥±ÍMÑ•À ¤ì(€€€¥˜€¡ÍÑ•À€ôôô€‰É•Ù¥•Üˆ¤É•ÑÕÉ¸É•¹‘•ÉI•Ù¥•Ü ¤ì(€€€¥˜€¡ÍÑ•À€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ¤É•ÑÕÉ¸É•¹‘•ÉMÕ‰µ¥ÑÑ•¡ÍÕ‰µ¥ÑÑ•‘Y¥•Ü¤ì(€€€É•ÑÕÉ¸É•¹‘•ÉM•ÉÙ¥•ÍMÑ•À ¤ì(€ô((€™Õ¹Ñ¥½¸Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€½¹ÍÐÍÑ•À€ôÉ½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ•Àñð€‰Í•ÉÙ¥•Ìˆì(€€€½¹ÍÐÍÕ‰µ¥ÑÑ•‘Y¥•Ü€ôÍÑ•À€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ(€€€€€€üÉ½½Ð¹ÕÍÑ½µ•É½Áä¹ÕÉ•¹ÑMÕ‰µ¥ÑÑ•‘Y¥•Ü¡É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹±¥Ù•MÑ…ÑÕÌ¤(€€€€€€è¹Õ±°ì(€€€½¹Ñ…¥¹•È¹¥¹¹•É!Q50€ô€(€€€€€€ñÍ•Ñ¥½¸±…ÍÌô‰ÍÉ••¸ÕÉ•¹ÐµÍÉ••¸ˆ‘…Ñ„µÕÉ•¹ÐµÍÑ•Àôˆ‘íÍÑ•Áôˆø(€€€€€€€€‘í¡•É¼ ¥ô(€€€€€€€€‘í™±½ÝI…¥°¡ÍÑ•À°ÍÕ‰µ¥ÑÑ•‘Y¥•Ü¥ô(€€€€€€€€ñ‘¥Ø±…ÍÌô‰ÕÉ•¹Ðµ‰½‘äˆ‘…Ñ„µÕÉ•¹Ðµ‰½‘äø‘í‰½‘ä¡ÍÕ‰µ¥ÑÑ•‘Y¥•Ü¥ôð½‘¥Øø(€€€€€€ð½Í•Ñ¥½¸ø(€€€€ì(€€€‰¥¹¡½¹Ñ…¥¹•È¤ì(€€€¥˜€¡ÍÑ•À€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€˜˜Í¡½Õ±‘A½±±UÉ•¹ÑMÑ…ÑÕÌ ¤¤ÍÑ…ÉÑA½±±¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€•±Í”ÍÑ½ÁA½±±¥¹œ ¤ì(€ô((€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•1¥¹”¡±¥¹•%°Á…Ñ ¤ì(€€€½¹ÍÐ¹•áÐ€ôÉ½½Ð¹Í•ÉÙ¥•Ì¹±¥¹•A…Ñ¡Q½É…™ÑM•ÉÙ¥•Ì¡‘É…™Ð ¤°±¥¹•%°Á…Ñ ¤ì(€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÕÉ•¹Ðˆ°ìÍ•ÉÙ¥•Ìè¹•áÐô¤ì(€€€Í…¹¥Ñ¥é•UÉ•¹ÑÉ…™Ð ¤ì(€€€¥¹Ù…±¥‘…Ñ•AÉ¥¥¹œ ¤ì(€ô((€™Õ¹Ñ¥½¸‰¥¹¡½¹Ñ…¥¹•È¤ì(€€€½¹Ñ…¥¹•È¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÕÉ•¹Ðµ™¥•±‘tˆ¤¹™½É…  ¡•±•µ•¹Ð¤€ôøì(€€€€€½¹ÍÐ¡…¹‘±•È€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ™¥•±€ô•±•µ•¹Ð¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÕÉ•¹Ðµ™¥•±ˆ¤ì(€€€€€€€½¹ÍÐÁ…Ñ €ôìm™¥•±‘tè•±•µ•¹Ð¹Ù…±Õ”ôì(€€€€€€€¥˜€¡™¥•±€ôôô€‰µ…ÁÍ}ÕÉ°ˆ¤ì(€€€€€€€€€½¹ÍÐÁÌ€ôÙ…±¥‘ÁÍA…¥È¡‘É…™Ð ¤¤ì(€€€€€€€€€½¹ÍÐÕÉÉ•¹ÑÁÍUÉ°€ôÁÌ€ü¡ÑÑÁÌè¼½ÝÝÜ¹½½±”¹½´½µ…ÁÌýÄô‘íÁÌ¹±…Ñ¥ÑÕ‘•ô°‘íÁÌ¹±½¹¥ÑÕ‘•õ€€è€ˆˆì(€€€€€€€€€¥˜€¡MÑÉ¥¹œ¡•±•µ•¹Ð¹Ù…±Õ”ñð€ˆˆ¤¹ÑÉ¥´ ¤€„ôôÕÉÉ•¹ÑÁÍUÉ°¤ì(€€€€€€€€€€€Á…Ñ ¹ÁÍ}±…Ñ¥ÑÕ‘”€ô¹Õ±°ì(€€€€€€€€€€€Á…Ñ ¹ÁÍ}±½¹¥ÑÕ‘”€ô¹Õ±°ì(€€€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì±½…Ñ¥½¹MÑ…ÑÕÌè€‰¥‘±”ˆ°±½…Ñ¥½¹5•ÍÍ…”è€ˆˆô¤ì(€€€€€€€€€ô(€€€€€€€ô(€€€€€€€µ…É­A…å±½…‘¡…¹• ¤ì(€€€€€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÕÉ•¹Ðˆ°Á…Ñ ¤ì(€€€€€€€¥˜€¡É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹•ÉÉ½È¤É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì•ÉÉ½Èè€ˆˆô¤ì(€€€€€ôì(€€€€€•±•µ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕÐˆ°¡…¹‘±•È¤ì(€€€€€•±•µ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¡…¹”ˆ°¡…¹‘±•È¤ì(€€€ô¤ì((€€€½¹Ñ…¥¹•È¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÕÉ•¹Ðµ±¥¹”µ¡½¥•tˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì(€€€€€€€½¹ÍÐ™¥•±€ô‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÕÉ•¹Ðµ±¥¹”µ¡½¥”ˆ¤ì(€€€€€€€½¹ÍÐÙ…±Õ”€ô‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µ¡½¥”µÙ…±Õ”ˆ¤ì(€€€€€€€½¹ÍÐÁ…Ñ €ôìm™¥•±‘tè™¥•±€ôôô€‰‰ÑÔˆ€ü9Õµ‰•È¡Ù…±Õ”¤€èÙ…±Õ”ôì(€€€€€€€¥˜€¡™¥•±€ôôô€‰…}ÑåÁ”ˆ¤Á…Ñ ¹Ý…Í¡}Ù…É¥…¹Ð€ôÙ…±Õ”€ôôôÉ½½Ð¹Í•ÉÙ¥•Ì¹]11}€ü€‹‚â—‚æ'‚âË‚â‚âc‚â‚â‚â‡‚âS‚âÈˆ€è€ˆˆì(€€€€€€€ÕÁ‘…Ñ•1¥¹”¡‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µ±¥¹”µ¥ˆ¤°Á…Ñ ¤ì(€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€€€ô¤ì(€€€ô¤ì((€€€½¹Ñ…¥¹•È¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÕÉ•¹Ðµ±¥¹”µ™¥•±‘tˆ¤¹™½É…  ¡•±•µ•¹Ð¤€ôøì(€€€€€•±•µ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¡…¹”ˆ°€ ¤€ôøì(€€€€€€€ÕÁ‘…Ñ•1¥¹”¡•±•µ•¹Ð¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µ±¥¹”µ¥ˆ¤°ì(€€€€€€€€€m•±•µ•¹Ð¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÕÉ•¹Ðµ±¥¹”µ™¥•±ˆ¥tè9Õµ‰•È¡•±•µ•¹Ð¹Ù…±Õ”¤°(€€€€€€€ô¤ì(€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€€€ô¤ì(€€€ô¤ì((€€€½¹Ñ…¥¹•È¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÕÉ•¹ÐµÑ¥µ”µÁÉ½Á½Í…±tˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì(€€€€€€€µ…É­A…å±½…‘¡…¹• ¤ì(€€€€€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÕÉ•¹Ðˆ°ì…±±½Ý}Ñ¥µ•}ÁÉ½Á½Í…°è‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÕÉ•¹ÐµÑ¥µ”µÁÉ½Á½Í…°ˆ¤€ôôô€‰ÑÉÕ”ˆô¤ì(€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì•ÉÉ½Èè€ˆˆô¤ì(€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€ô¤ì(€€€ô¤ì((€€€½¹Ñ…¥¹•È¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÕÉ•¹Ðµ…Ñ¥½¹tˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°…Íå¹Œ€ ¤€ôøì(€€€€€€€½¹ÍÐ…Ñ¥½¸€ô‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÕÉ•¹Ðµ…Ñ¥½¸ˆ¤ì(€€€€€€€¥˜€¡…Ñ¥½¸€ôôô€‰…‘µ±¥¹”ˆ¤ì(€€€€€€€€€½¹ÍÐ¹•áÐ€ôl¸¸¹Í•ÉÙ¥•Ì ¤°É½½Ð¹Í•ÉÙ¥•Ì¹É•…Ñ•M•ÉÙ¥•1¥¹” ¥tì(€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÕÉ•¹Ðˆ°ìÍ•ÉÙ¥•Ìè¹•áÐô¤ì(€€€€€€€€€¥¹Ù…±¥‘…Ñ•AÉ¥¥¹œ ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰É•µ½Ù”µ±¥¹”ˆ¤ì(€€€€€€€€€½¹ÍÐ±¥¹•%€ô‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µ±¥¹”µ¥ˆ¤ì(€€€€€€€€€½¹ÍÐ¹•áÐ€ôÍ•ÉÙ¥•Ì ¤¹™¥±Ñ•È ¡±¥¹”¤€ôøMÑÉ¥¹œ¡±¥¹”¹±¥¹•}¥¤€„ôôMÑÉ¥¹œ¡±¥¹•%¤¤ì(€€€€€€€€€¥˜€¡¹•áÐ¹±•¹Ñ ¤ì(€€€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÕÉ•¹Ðˆ°ìÍ•ÉÙ¥•Ìè¹•áÐô¤ì(€€€€€€€€€€€¥¹Ù…±¥‘…Ñ•AÉ¥¥¹œ ¤ì(€€€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€€€€€€€ô(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰Ñ¼µ‘•Ñ…¥±Ìˆ¤ì(€€€€€€€€€½¹ÍÐ•ÉÉ½È€ôÙ…±¥‘…Ñ•M•ÉÙ¥•Ì ¤ì(€€€€€€€€€¥˜€¡•ÉÉ½È¤Í•ÑMÑ•À ‰Í•ÉÙ¥•Ìˆ°•ÉÉ½È¤ì(€€€€€€€€€•±Í”Í•ÑMÑ•À ‰‘•Ñ…¥±Ìˆ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰‰…¬µÍ•ÉÙ¥•Ìˆ¤ì(€€€€€€€€€Í•ÑMÑ•À ‰Í•ÉÙ¥•Ìˆ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰Ñ¼µÉ•Ù¥•Üˆ¤ì(€€€€€€€€€½¹ÍÐ•ÉÉ½È€ôÙ…±¥‘…Ñ••Ñ…¥±Ì ¤ì(€€€€€€€€€¥˜€¡•ÉÉ½È¤Í•ÑMÑ•À ‰‘•Ñ…¥±Ìˆ°•ÉÉ½È¤ì(€€€€€€€€€•±Í”Í•ÑMÑ•À ‰É•Ù¥•Üˆ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰‰…¬µ‘•Ñ…¥±Ìˆ¤ì(€€€€€€€€€Í•ÑMÑ•À ‰‘•Ñ…¥±Ìˆ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰ÕÍ”µ±½…Ñ¥½¸ˆ¤ì(€€€€€€€€€…Ý…¥ÐÉ•ÅÕ•ÍÑÕÉÉ•¹Ñ1½…Ñ¥½¸ ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰½¹™¥É´ˆ¤ì(€€€€€€€€€…Ý…¥ÐÍÕ‰µ¥ÑUÉ•¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰É•ÑÉäµÍÑ…ÑÕÌˆ¤ì(€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì±¥Ù•MÑ…ÑÕÍÉÉ½Èè€ˆˆô¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰¹•ÜµÉ•ÅÕ•ÍÐˆ¤ì(€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹É•Í•ÑUÉ•¹ÑÉ…™Ð ¤ì(€€€€€€€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€€€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€€€€€ô•±Í”¥˜€¡…Ñ¥½¸€ôôô€‰ÑÉ…¬µÉ•…Ñ•ˆ¤ì(€€€€€€€€€½¹ÍÐ­•ä€ô‰ÕÑÑ½¸¹•ÑÑÑÉ¥‰ÕÑ” ‰‘…Ñ„µÑÉ…­¥¹œµ­•äˆ¤ñð€ˆˆì(€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹ÕÁ‘…Ñ•É…™Ð ‰ÑÉ…­¥¹œˆ°ìÑÉ…­¥¹½‘”è­•äô¤ì(€€€€€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑQÉ…­¥¹œ¡ìÍÑ…ÑÕÌè€‰¥‘±”ˆ°‘…Ñ„è¹Õ±°°•ÉÉ½Èè€ˆˆô¤ì(€€€€€€€€€É½½Ð¹ÕÑ¥±Ì¹É½ÕÑ•Q¼ ‰ÑÉ…­¥¹œˆ¤ì(€€€€€€€ô(€€€€€ô¤ì(€€€ô¤ì(€ô((€™Õ¹Ñ¥½¸É•¹‘•È¡½¹Ñ…¥¹•È¤ì(€€€½¹ÍÐ±¥™•å±•Á½ €ôÁ½±±Á½ ì(€€€Í…¹¥Ñ¥é•UÉ•¹ÑÉ…™Ð ¤ì(€€€É½½Ð¹ÍÑ…Ñ”¹•¹ÍÕÉ•M…Ù•‘‘‘É•ÍÍAÉ•™¥±° ‰ÕÉ•¹Ðˆ°€ ¤€ôøì(€€€€€¥˜€¡±¥™•å±•Á½ €ôôôÁ½±±Á½ €˜˜É½½Ð¹ÍÑ…Ñ”¹ÕÉÉ•¹ÑI½ÕÑ”€ôôô€‰ÕÉ•¹Ðˆ¤É•¹‘•È¡½¹Ñ…¥¹•È¤ì(€€€ô¤ì(€€€¥˜€ …É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Üñð€…É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ•À¤ì(€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ì(€€€€€€€ÍÑ•Àè€‰Í•ÉÙ¥•Ìˆ°(€€€€€€€ÍÑ…ÑÕÌè€‰¥‘±”ˆ°(€€€€€€€•ÉÉ½Èè€ˆˆ°(€€€€€€€É•ÍÕ±Ðè¹Õ±°°(€€€€€€€ÁÉ¥¥¹œèìÍÑ…ÑÕÌè€‰¥‘±”ˆ°‘…Ñ„è¹Õ±°°•ÉÉ½Èè€ˆˆô°(€€€€€€€±¥Ù•MÑ…ÑÕÌè¹Õ±°°(€€€€€€€±¥Ù•MÑ…ÑÕÍÉÉ½Èè€ˆˆ°(€€€€€ô¤ì(€€€ô(€€€‰¥¹‘Y¥Í¥‰¥±¥ÑåI•™É•Í  ¤ì(€€€Á…¥¹Ð¡½¹Ñ…¥¹•È¤ì(€€€¥˜€¡É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ•À€ôôô€‰Í•ÉÙ¥•Ìˆ€˜˜É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÁÉ¥¥¹œü¹ÍÑ…ÑÕÌ€ôôô€‰¥‘±”ˆ¤ì(€€€€€É•™É•Í¡AÉ¥¥¹œ¡½¹Ñ…¥¹•È¤ì(€€€ô(€ô((€É•¹‘•È¹½¹1•…Ù”€ô€ ¤€ôøì(€€€Á½±±Á½ €¬ô€Äì(€€€ÁÉ¥¥¹Á½ €¬ô€Äì(€€€Á½±±%¹±¥¡Ð€ô¹Õ±°ì(€€€…Ñ¥Ù•MÕ‰µ¥Ð€ô¹Õ±°ì(€€€¥˜€¡É½½Ð¹ÍÑ…Ñ”¹ÕÉ•¹Ñ±½Ü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ¥¹œˆ¤ì(€€€€€É½½Ð¹ÍÑ…Ñ”¹Í•ÑUÉ•¹Ñ±½Ü¡ìÍÑ•Àè€‰É•Ù¥•Üˆ°ÍÑ…ÑÕÌè€‰¥‘±”ˆ°•ÉÉ½Èè€ˆˆô¤ì(€€€ô(€€€ÍÑ½ÁA½±±¥¹œ ¤ì(€€€Õ¹‰¥¹‘Y¥Í¥‰¥±¥ÑåI•™É•Í  ¤ì(€€€…Ñ¥Ù•½¹Ñ…¥¹•È€ô¹Õ±°ì(€ôì((€É½½Ð¹‰½½­¥¹UÉ•¹Ð€ôì(€€€É•¹‘•È°(€€€}Ñ•ÍÐèì(€€€€€Í…¹¥Ñ¥é•UÉ•¹ÑÉ…™Ð°(€€€€€‰Õ¥±‘MÕ‰µ¥ÑA…å±½…°(€€€€€Ù…±¥‘…Ñ•M•ÉÙ¥•Ì°(€€€€€Ù…±¥‘…Ñ••Ñ…¥±Ì°(€€€€€É•¹‘•ÉM•ÉÙ¥•ÍMÑ•À°(€€€€€É•¹‘•É•Ñ…¥±ÍMÑ•À°(€€€€€É•¹‘•ÉI•Ù¥•Ü°(€€€€€É•¹‘•ÉMÕ‰µ¥ÑÑ•°(€€€€€É•ÅÕ•ÍÑÕÉÉ•¹Ñ1½…Ñ¥½¸°(€€€€€É•™É•Í¡AÉ¥¥¹œ°(€€€ô°(€ôì)ô¤ ¤ì