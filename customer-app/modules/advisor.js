(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const controllers = new WeakMap();

  const AC_TYPES = Object.freeze([
    { value: "wall", label: "แอร์ผนัง", bookingValue: "ผนัง" },
    { value: "fourway", label: "แอร์สี่ทิศทาง", bookingValue: "สี่ทิศทาง" },
    { value: "hanging", label: "แอร์แขวน", bookingValue: "แขวน" },
    { value: "ceiling", label: "แอร์เปลือยใต้ฝ้า", bookingValue: "เปลือยใต้ฝ้า" },
    { value: "unknown", label: "ไม่แน่ใจ", bookingValue: null },
  ]);

  const MONTH_BANDS = Object.freeze([
    { value: "recent", label: "ไม่เกิน 3 เดือน" },
    { value: "m4_5", label: "4–5 เดือน" },
    { value: "m6_8", label: "6–8 เดือน" },
    { value: "m9_12", label: "9–12 เดือน" },
    { value: "over12", label: "เกิน 1 ปี" },
    { value: "unknown", label: "จำไม่ได้ / ไม่แน่ใจ" },
  ]);

  const SYMPTOMS = Object.freeze([
    { value: "routine", label: "ไม่มีอาการ แค่ถึงรอบล้าง" },
    { value: "reduced_cooling", label: "เย็นน้อยลง" },
    { value: "weak_airflow", label: "ลมอ่อน" },
    { value: "odor", label: "มีกลิ่น" },
    { value: "drain", label: "น้ำหยด / ระบายน้ำไม่ดี" },
    { value: "dusty", label: "มีฝุ่นหรือคราบมาก" },
    { value: "heavy_dirt", label: "สกปรกหนัก / หมักหมม" },
    { value: "noise", label: "เสียงดัง" },
    { value: "heavy_use", label: "ใช้งานหนักทุกวัน" },
    { value: "pets", label: "มีสัตว์เลี้ยง" },
    { value: "allergy", label: "มีผู้แพ้ง่ายหรือเด็กเล็ก" },
    { value: "never_deep", label: "ไม่เคยล้างลึก" },
  ]);

  const REPAIR_SIGNALS = Object.freeze([
    { value: "error_code", label: "มี Error Code" },
    { value: "ac_not_running", label: "แอร์ไม่ทำงาน" },
    { value: "outdoor_not_running", label: "คอยร้อนไม่ทำงาน" },
    { value: "indoor_not_running", label: "คอยล์เย็นไม่ทำงาน" },
    { value: "breaker_trip", label: "เบรกเกอร์ตัด" },
    { value: "burning_smell", label: "มีเสียงหรือกลิ่นไหม้" },
    { value: "none", label: "ไม่มีอาการเหล่านี้" },
  ]);

  const VERDICT_META = Object.freeze({
    standard_clean: { label: "ล้างธรรมดา", short: "ดูแลตามรอบ", variant: "normal", tone: "good" },
    premium_clean: { label: "ล้างพรีเมียม", short: "ดูแลละเอียดขึ้น", variant: "premium", tone: "premium" },
    hanging_coil: { label: "ล้างแขวนคอยล์", short: "จัดการคราบสะสมลึก", variant: "coil", tone: "watch" },
    big_wash: { label: "ตัดล้าง / ล้างใหญ่", short: "ฟื้นฟูเครื่องที่สะสมหนัก", variant: "overhaul", tone: "due" },
    repair_check: { label: "ตรวจเช็ค / ซ่อมก่อน", short: "ตรวจหาสาเหตุก่อนเลือกล้าง", variant: null, tone: "repair" },
    needs_assessment: { label: "ให้ทีมช่วยประเมิน", short: "ยืนยันชนิดเครื่องและอาการก่อน", variant: null, tone: "neutral" },
  });

  const CONFIDENCE_LABELS = Object.freeze({
    high: "สูง",
    medium: "ปานกลาง",
    assessment: "ต้องประเมินเพิ่ม",
  });

  function uniqueValues(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
  }

  function result(verdict, confidence, reasons, options = {}) {
    return {
      verdict,
      confidence,
      reasons: uniqueValues(reasons).slice(0, 4),
      alternative: options.alternative || null,
      catalogIntent: options.catalogIntent || null,
      action: options.action || "contact",
      note: options.note || "คำแนะนำเบื้องต้น อาการจริงหน้างานอาจทำให้รูปแบบบริการเปลี่ยนได้",
    };
  }

  function evaluateRecommendation(rawInput = {}) {
    const acType = String(rawInput.acType || "").trim();
    const monthsBand = String(rawInput.monthsBand || "").trim();
    const symptoms = uniqueValues(rawInput.symptoms);
    const repairSignals = uniqueValues(rawInput.repairSignals);
    const actualRepairSignals = repairSignals.filter((signal) => signal !== "none");
    const conflictingSymptoms = symptoms.includes("routine") && symptoms.length > 1;
    const conflictingRepair = repairSignals.includes("none") && actualRepairSignals.length > 0;

    if (actualRepairSignals.length) {
      return result("repair_check", "high", [
        "พบอาการที่อาจเกี่ยวกับระบบไฟฟ้า การควบคุม หรืออุปกรณ์ภายใน",
        "การล้างเพียงอย่างเดียวอาจไม่แก้สาเหตุของอาการนี้",
      ], {
        catalogIntent: { kind: "repair", acType },
        action: "contact",
        note: "ควรหยุดใช้งานหากมีเบรกเกอร์ตัด กลิ่นไหม้ หรือเสียงผิดปกติ และให้ช่างตรวจเช็คก่อน",
      });
    }

    if (!acType || acType === "unknown" || conflictingSymptoms || conflictingRepair) {
      const reasons = [];
      if (!acType || acType === "unknown") reasons.push("ยังไม่ทราบชนิดแอร์ที่แน่นอน");
      if (conflictingSymptoms || conflictingRepair) reasons.push("ตัวเลือกอาการยังขัดกันและควรยืนยันเพิ่มเติม");
      return result("needs_assessment", "assessment", reasons, {
        catalogIntent: null,
        action: "contact",
      });
    }

    if (acType !== "wall") {
      const acLabel = AC_TYPES.find((item) => item.value === acType)?.label || "ชนิดเครื่องนี้";
      return result("needs_assessment", monthsBand === "unknown" ? "assessment" : "medium", [
        `${acLabel}ต้องเลือกบริการให้ตรงรูปแบบเครื่องและสภาพหน้างาน`,
        monthsBand === "unknown" ? "ยังไม่ทราบระยะจากการล้างครั้งก่อน" : "ระบบจะค้นหารายการ Catalog ที่ตรงชนิดเครื่องก่อน",
      ], {
        catalogIntent: { kind: "clean", acType },
        action: "catalog_or_contact",
        note: "แนะนำล้างตามชนิดเครื่องและให้ทีมประเมินรูปแบบหน้างาน ไม่ใช้วิธีล้างของแอร์ผนังแทนกัน",
      });
    }

    if (!monthsBand || monthsBand === "unknown") {
      return result("needs_assessment", "assessment", [
        "ยังไม่ทราบระยะจากการล้างครั้งก่อน",
        symptoms.length ? "มีข้อมูลอาการ แต่ยังต้องประเมินระดับความสะสมร่วมด้วย" : "ยังไม่มีข้อมูลอาการเพียงพอสำหรับเลือกวิธีล้าง",
      ], { action: "contact" });
    }

    const has = (value) => symptoms.includes(value);
    const accumulationSymptoms = ["weak_airflow", "odor", "drain", "dusty", "never_deep"].filter(has);
    const premiumSymptoms = ["heavy_use", "pets", "allergy", "odor", "dusty"].filter(has);
    const severeAccumulation = has("heavy_dirt") || has("never_deep");
    const catalogIntent = (verdict) => ({ kind: "clean", acType: "wall", variant: VERDICT_META[verdict].variant });

    if (monthsBand === "over12") {
      if (severeAccumulation) {
        return result("big_wash", "high", [
          "เว้นระยะล้างเกินหนึ่งปี",
          has("heavy_dirt") ? "มีคราบหรือความสกปรกสะสมหนัก" : "ยังไม่เคยล้างลึก",
        ], { alternative: "hanging_coil", catalogIntent: catalogIntent("big_wash"), action: "catalog" });
      }
      return result("hanging_coil", "assessment", [
        "เว้นระยะล้างเกินหนึ่งปี",
        "ยังไม่มีข้อมูลสภาพสะสมมากพอที่จะฟันธงงานตัดล้าง",
      ], { alternative: "big_wash", catalogIntent: catalogIntent("hanging_coil"), action: "catalog_or_contact" });
    }

    if (monthsBand === "m9_12") {
      if (accumulationSymptoms.length || has("heavy_dirt")) {
        return result("hanging_coil", "high", [
          "เว้นระยะล้างประมาณ 9–12 เดือน",
          "มีอาการที่สอดคล้องกับความสกปรกสะสมภายใน",
        ], { alternative: has("heavy_dirt") ? "big_wash" : "premium_clean", catalogIntent: catalogIntent("hanging_coil"), action: "catalog" });
      }
      return result("premium_clean", "medium", [
        "เว้นระยะล้างประมาณ 9–12 เดือน",
        "ยังไม่พบอาการสะสมที่ชี้ว่าต้องล้างลึกทันที",
      ], { alternative: "hanging_coil", catalogIntent: catalogIntent("premium_clean"), action: "catalog" });
    }

    if (monthsBand === "m6_8") {
      if (has("heavy_dirt")) {
        return result("hanging_coil", "medium", [
          "มีความสกปรกสะสมหนักกว่าการล้างตามรอบทั่วไป",
          "ควรให้ทีมยืนยันสภาพก่อนเริ่มงาน",
        ], { alternative: "premium_clean", catalogIntent: catalogIntent("hanging_coil"), action: "catalog_or_contact" });
      }
      return result("premium_clean", premiumSymptoms.length ? "high" : "medium", [
        "เว้นระยะล้างประมาณ 6–8 เดือน",
        premiumSymptoms.length ? "มีปัจจัยใช้งานหรือสภาพแวดล้อมที่เหมาะกับการดูแลละเอียดขึ้น" : "เหมาะกับการล้างที่ละเอียดกว่ารอบทั่วไป",
      ], { alternative: "standard_clean", catalogIntent: catalogIntent("premium_clean"), action: "catalog" });
    }

    if (monthsBand === "m4_5") {
      if (premiumSymptoms.length || accumulationSymptoms.length || has("heavy_dirt")) {
        return result("premium_clean", "medium", [
          "ถึงรอบดูแลทั่วไปแล้ว",
          "มีอาการหรือสภาพแวดล้อมที่ควรเพิ่มความละเอียดในการล้าง",
        ], { alternative: "standard_clean", catalogIntent: catalogIntent("premium_clean"), action: "catalog" });
      }
      return result("standard_clean", "high", [
        "เว้นระยะล้างประมาณ 4–5 เดือน",
        "ไม่พบอาการรุนแรงหรือความสกปรกสะสมหนัก",
      ], { alternative: "premium_clean", catalogIntent: catalogIntent("standard_clean"), action: "catalog" });
    }

    if (premiumSymptoms.length || accumulationSymptoms.length || has("heavy_dirt")) {
      return result("premium_clean", "assessment", [
        "เพิ่งล้างไม่นาน แต่อาการที่เลือกควรได้รับการประเมินเพิ่มเติม",
        "ไม่ควรเร่งสรุปงานล้างใหญ่จากระยะเวลาเพียงอย่างเดียว",
      ], { alternative: "standard_clean", catalogIntent: catalogIntent("premium_clean"), action: "catalog_or_contact" });
    }
    return result("standard_clean", "medium", [
      "เพิ่งล้างมาไม่นานและไม่มีอาการรุนแรง",
      "อาจยังไม่จำเป็นต้องรีบล้าง เว้นแต่สภาพใช้งานจริงเปลี่ยนไป",
    ], { catalogIntent: catalogIntent("standard_clean"), action: "catalog" });
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function canonicalAcType(item) {
    const authoritative = normalize(item && item.booking_ac_type);
    const exact = { "ผนัง": "wall", "สี่ทิศทาง": "fourway", "แขวน": "hanging", "เปลือยใต้ฝ้า": "ceiling" };
    if (authoritative) return exact[authoritative] || null;
    const text = normalize(item && item.item_name);
    if (/สี่ทิศทาง|four.?way|cassette/.test(text)) return "fourway";
    if (/เปลือยใต้ฝ้า|ใต้ฝ้า|ceiling/.test(text)) return "ceiling";
    if (/แอร์แขวน|แขวนเพดาน|hanging/.test(text)) return "hanging";
    if (/แอร์ผนัง|wall/.test(text)) return "wall";
    return null;
  }

  function canonicalJobCategory(item) {
    const authoritative = normalize(item && item.job_category);
    if (authoritative) {
      if (/^(ล้าง|ล้างแอร์|wash|clean)$/.test(authoritative)) return "wash";
      if (/^(ซ่อม|ซ่อมแอร์|repair)$/.test(authoritative)) return "repair";
      if (/^(ตรวจเช็ค|ตรวจเช็คแอร์|ตรวจสอบ|inspection|inspect)$/.test(authoritative)) return "inspection";
      return null;
    }
    const text = normalize(item && item.item_name);
    if (/ซ่อม|repair/.test(text)) return "repair";
    if (/ตรวจเช็ค|ตรวจสอบ|inspect/.test(text)) return "inspection";
    if (/ล้าง|wash|clean/.test(text)) return "wash";
    return null;
  }

  function canonicalWashVariant(item) {
    const authoritative = normalize(item && item.booking_wash_variant);
    const exact = {
      "ล้างธรรมดา": "normal",
      "ล้างปกติ": "normal",
      "ล้างพรีเมียม": "premium",
      "ล้างแขวนคอยล์": "coil",
      "ล้างแบบตัดล้าง": "overhaul",
    };
    if (authoritative) return exact[authoritative] || null;
    const text = normalize(item && item.item_name);
    if (/ตัดล้าง|ล้างใหญ่|overhaul/.test(text)) return "overhaul";
    if (/แขวนคอยล์|coil/.test(text)) return "coil";
    if (/พรีเมียม|premium/.test(text)) return "premium";
    if (/ล้างธรรมดา|ล้างปกติ|ธรรมดา|ปกติ|normal/.test(text)) return "normal";
    return null;
  }

  function eligibleCatalogItems(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
      const id = String(item && item.item_id || "").trim();
      if (!id || item.is_active === false || item.is_customer_visible === false || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function mapCatalogItems(recommendation, items, options = {}) {
    const intent = recommendation && recommendation.catalogIntent;
    if (!intent) return [];
    const adapter = typeof options.adapter === "function" ? options.adapter : null;
    return eligibleCatalogItems(items).map((item, index) => {
      const job = canonicalJobCategory(item);
      const acType = canonicalAcType(item);
      const variant = canonicalWashVariant(item);
      let rank = 99;
      let exact = false;
      if (intent.kind === "repair") {
        if (job === "repair") { rank = 0; exact = true; }
        else if (job === "inspection") { rank = 1; exact = true; }
      } else if (intent.kind === "clean" && job === "wash") {
        if (acType === intent.acType && (!intent.variant || variant === intent.variant)) { rank = 0; exact = true; }
        else if (acType === intent.acType) rank = 2;
        else rank = 5;
      }
      if (rank === 99) return null;
      const draft = intent.kind === "clean" && item.booking_mode === "bookable" && adapter ? adapter(item) : null;
      return { item, exact, directBook: Boolean(draft), rank: rank + (draft ? 0 : 0.5), index };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, 3);
  }

  function initialState() {
    return { step: 0, acType: "", monthsBand: "", symptoms: [], repairSignals: [], recommendation: null };
  }

  function esc(value) {
    return root.utils.escapeHtml(value == null ? "" : String(value));
  }

  function icon(name, size) {
    return typeof root.utils.icon === "function" ? root.utils.icon(name, size) : "";
  }

  function choiceButtons(items, selected, attribute) {
    return `<div class="advisor-choice-grid">${items.map((item) => `
      <button class="advisor-choice ${selected === item.value ? "is-selected" : ""}" type="button"
        ${attribute}="${esc(item.value)}" aria-pressed="${selected === item.value ? "true" : "false"}">
        <span>${esc(item.label)}</span>
      </button>
    `).join("")}</div>`;
  }

  function chipButtons(items, selected, attribute) {
    const values = new Set(selected || []);
    return `<div class="advisor-chip-grid">${items.map((item) => `
      <button class="advisor-chip ${values.has(item.value) ? "is-selected" : ""}" type="button"
        ${attribute}="${esc(item.value)}" aria-pressed="${values.has(item.value) ? "true" : "false"}">
        <span class="advisor-chip-check" aria-hidden="true">${values.has(item.value) ? "✓" : "+"}</span>
        <span>${esc(item.label)}</span>
      </button>
    `).join("")}</div>`;
  }

  function priceText(item) {
    const value = item.display_price ?? item.active_price ?? item.base_price;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? root.utils.formatBaht(numeric) : "สอบถามราคา";
  }

  function firstImage(item) {
    const images = Array.isArray(item.images) ? item.images : [];
    const primary = images.find((image) => image && image.is_primary) || images[0];
    return String(primary && primary.image_url || item.image_url || "").trim();
  }

  function renderCatalogResults(recommendation, catalogState) {
    if (catalogState.status === "loading" || catalogState.status === "idle") {
      return `<div class="advisor-catalog-loading" role="status"><span></span><span></span><p>กำลังค้นหาบริการที่ตรงจาก Catalog</p></div>`;
    }
    const matches = mapCatalogItems(recommendation, catalogState.items, {
      adapter: (item) => root.services.catalogItemToCommerceDraft(item),
    });
    if (!matches.length) {
      return `
        <div class="advisor-catalog-empty">
          <strong>ยังไม่มีรายการที่ตรงสำหรับจองอัตโนมัติ</strong>
          <p>ให้ทีม CWF ตรวจชนิดเครื่องและอาการก่อนเลือกบริการ</p>
          <button class="primary-btn" type="button" data-advisor-contact>${icon("chat", 18)} ติดต่อให้ทีมประเมิน</button>
        </div>
      `;
    }
    return `
      <div class="advisor-catalog-head">
        <strong>บริการที่เกี่ยวข้องจาก Catalog</strong>
        <span>เลือกดูรายละเอียดหรือดำเนินการต่อ</span>
      </div>
      <div class="advisor-result-products">
        ${matches.map(({ item, directBook, exact }) => {
          const image = firstImage(item);
          return `
            <article class="advisor-product ${exact ? "is-exact" : ""}" data-advisor-product="${esc(item.item_id)}">
              <div class="advisor-product-image">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : icon("sparkle", 24)}</div>
              <div class="advisor-product-body">
                <span>${exact ? "ตรงกับผลประเมิน" : "ตัวเลือกที่เกี่ยวข้อง"}</span>
                <h4>${esc(item.item_name)}</h4>
                <p>${esc(priceText(item))}${item.unit_label ? ` / ${esc(item.unit_label)}` : ""}</p>
                <div class="advisor-product-actions">
                  <button class="secondary-btn" type="button" data-advisor-detail="${esc(item.item_id)}">ดูรายละเอียด</button>
                  <button class="primary-btn" type="button" data-advisor-item-action="${esc(item.item_id)}">
                    ${directBook ? "จองบริการนี้" : "ติดต่อประเมิน"}
                  </button>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderResult(state, catalogState) {
    const recommendation = state.recommendation || evaluateRecommendation(state);
    const meta = VERDICT_META[recommendation.verdict];
    const alternative = recommendation.alternative ? VERDICT_META[recommendation.alternative] : null;
    return `
      <div class="advisor-result tone-${esc(meta.tone)}" data-advisor-result tabindex="-1" role="status" aria-live="polite">
        <div class="advisor-result-hero">
          <div class="advisor-result-mark" aria-hidden="true">${icon(recommendation.verdict === "repair_check" ? "wrench" : "sparkle", 28)}</div>
          <div>
            <span>ผลประเมินเบื้องต้น</span>
            <h3>แนะนำ: ${esc(meta.label)}</h3>
            <p>${esc(meta.short)}</p>
          </div>
          <span class="advisor-confidence">ความมั่นใจ ${esc(CONFIDENCE_LABELS[recommendation.confidence])}</span>
        </div>
        <div class="advisor-reason-list">
          ${recommendation.reasons.map((reason) => `<div>${icon("shield", 17)}<span>${esc(reason)}</span></div>`).join("")}
        </div>
        ${alternative ? `<div class="advisor-alternative"><span>ทางเลือกสำรอง</span><strong>${esc(alternative.label)}</strong></div>` : ""}
        <p class="advisor-note">${esc(recommendation.note)}</p>
        <div class="advisor-catalog" data-advisor-catalog>${renderCatalogResults(recommendation, catalogState)}</div>
        <div class="advisor-result-footer">
          <button class="secondary-btn" type="button" data-advisor-back>ย้อนกลับแก้อาการ</button>
          <button class="advisor-reset-btn" type="button" data-advisor-reset>เริ่มประเมินใหม่</button>
        </div>
      </div>
    `;
  }

  function stepContent(state, catalogState) {
    if (state.step === 4) return renderResult(state, catalogState);
    const steps = [
      { title: "แอร์ของคุณเป็นแบบไหน", copy: "เลือกชนิดเครื่องก่อน เพื่อไม่แนะนำวิธีล้างผิดประเภท" },
      { title: "ล้างครั้งก่อนเมื่อไร", copy: "ใช้ช่วงเวลาโดยประมาณได้ ไม่จำเป็นต้องจำวันที่แน่นอน" },
      { title: "ตอนนี้มีอาการอะไรบ้าง", copy: "เลือกได้หลายข้อ ระบบจะใช้ร่วมกับรอบล้าง" },
      { title: "มีอาการที่ควรตรวจซ่อมก่อนไหม", copy: "อาการกลุ่มนี้จะถูกส่งไปตรวจเช็คก่อนงานล้าง" },
    ];
    const current = steps[state.step];
    let controls = "";
    if (state.step === 0) controls = choiceButtons(AC_TYPES, state.acType, "data-advisor-ac");
    if (state.step === 1) controls = choiceButtons(MONTH_BANDS, state.monthsBand, "data-advisor-months");
    if (state.step === 2) controls = chipButtons(SYMPTOMS, state.symptoms, "data-advisor-symptom");
    if (state.step === 3) controls = chipButtons(REPAIR_SIGNALS, state.repairSignals, "data-advisor-repair");
    const valid = (state.step === 0 && state.acType)
      || (state.step === 1 && state.monthsBand)
      || (state.step === 2 && state.symptoms.length)
      || (state.step === 3 && state.repairSignals.length);
    return `
      <div class="advisor-step" data-advisor-step="${state.step + 1}">
        <div class="advisor-step-copy">
          <span>ขั้นที่ ${state.step + 1} จาก 4</span>
          <h3>${esc(current.title)}</h3>
          <p>${esc(current.copy)}</p>
        </div>
        ${controls}
        <div class="advisor-step-actions">
          ${state.step ? `<button class="secondary-btn" type="button" data-advisor-back>ย้อนกลับ</button>` : `<span></span>`}
          <button class="primary-btn" type="button" data-advisor-next ${valid ? "" : "disabled"}>
            ${state.step === 3 ? "ดูผลประเมิน" : "ขั้นต่อไป"}
          </button>
        </div>
      </div>
    `;
  }

  function renderSection(catalogState = { status: "idle", items: [] }) {
    const state = initialState();
    return `
      <section class="smart-advisor-section homepage-section" data-smart-advisor data-home-reveal>
        <div class="advisor-aura" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="advisor-heading">
          <div class="advisor-brand-mark">${icon("sparkle", 23)}</div>
          <div>
            <span class="section-kicker">CWF Smart Advisor</span>
            <h2>ช่วยเลือกแบบล้างหรือซ่อมให้เหมาะกับอาการ</h2>
            <p>ตอบคำถามสั้น ๆ แล้วดูบริการจริงที่เหมาะกับเครื่องของคุณ</p>
          </div>
        </div>
        <div class="advisor-progress" aria-label="ความคืบหน้าการประเมิน">
          ${[0, 1, 2, 3].map((index) => `<span class="${index === 0 ? "is-active" : ""}" data-advisor-progress="${index}"></span>`).join("")}
        </div>
        <div class="advisor-body" data-advisor-body>${stepContent(state, catalogState)}</div>
      </section>
    `;
  }

  function bind(container) {
    const mount = container && container.querySelector ? container.querySelector("[data-smart-advisor]") : null;
    if (!mount) return null;
    const existing = controllers.get(mount);
    if (existing) return existing;
    let state = initialState();
    let destroyed = false;
    const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    mount.classList?.toggle?.("is-reduced-motion", reducedMotion);
    const catalogState = () => root.state.catalog || { status: "idle", items: [] };

    const updateProgress = () => {
      mount.querySelectorAll("[data-advisor-progress]").forEach((node, index) => {
        const active = state.step === 4 ? true : index <= state.step;
        node.classList.toggle("is-active", active);
        if (index === Math.min(state.step, 3)) node.setAttribute("aria-current", "step");
        else node.removeAttribute("aria-current");
      });
    };
    const render = (focusResult = false) => {
      if (destroyed || !mount.isConnected) return;
      const body = mount.querySelector("[data-advisor-body]");
      if (!body) return;
      body.innerHTML = stepContent(state, catalogState());
      updateProgress();
      if (focusResult) requestAnimationFrame(() => mount.querySelector("[data-advisor-result]")?.focus({ preventScroll: true }));
    };
    const toggleExclusive = (values, value, exclusive) => {
      const selected = new Set(values);
      if (value === exclusive) return selected.has(value) ? [] : [value];
      selected.delete(exclusive);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return Array.from(selected);
    };
    const contact = (title) => root.ui.openContactSheet(container, { title: title || "ให้ทีม CWF ช่วยประเมินบริการ" });
    const onClick = (event) => {
      const button = event.target.closest("button");
      if (!button || destroyed) return;
      if (button.hasAttribute("data-advisor-ac")) {
        state.acType = button.getAttribute("data-advisor-ac");
        render();
      } else if (button.hasAttribute("data-advisor-months")) {
        state.monthsBand = button.getAttribute("data-advisor-months");
        render();
      } else if (button.hasAttribute("data-advisor-symptom")) {
        state.symptoms = toggleExclusive(state.symptoms, button.getAttribute("data-advisor-symptom"), "routine");
        render();
      } else if (button.hasAttribute("data-advisor-repair")) {
        state.repairSignals = toggleExclusive(state.repairSignals, button.getAttribute("data-advisor-repair"), "none");
        render();
      } else if (button.hasAttribute("data-advisor-next")) {
        if (state.step < 3) state.step += 1;
        else {
          state.recommendation = evaluateRecommendation(state);
          state.step = 4;
        }
        render(state.step === 4);
      } else if (button.hasAttribute("data-advisor-back")) {
        state.step = state.step === 4 ? 3 : Math.max(0, state.step - 1);
        state.recommendation = null;
        render();
      } else if (button.hasAttribute("data-advisor-reset")) {
        state = initialState();
        render();
        mount.querySelector("[data-advisor-ac]")?.focus();
      } else if (button.hasAttribute("data-advisor-detail")) {
        root.utils.routeTo(`storeItem-${button.getAttribute("data-advisor-detail")}`);
      } else if (button.hasAttribute("data-advisor-item-action")) {
        const id = button.getAttribute("data-advisor-item-action");
        const item = (catalogState().items || []).find((row) => String(row.item_id) === String(id));
        if (state.recommendation?.verdict === "repair_check") {
          contact(item && item.item_name);
          return;
        }
        const draft = item ? root.services.catalogItemToCommerceDraft(item) : null;
        if (draft && root.services.applyCommerceDraft("scheduled", draft)) {
          root.utils.routeTo("scheduled");
        } else {
          contact(item && item.item_name);
        }
      } else if (button.hasAttribute("data-advisor-contact")) {
        contact();
      }
    };
    mount.addEventListener("click", onClick);
    updateProgress();
    const controller = {
      refreshCatalog() {
        if (!destroyed && state.step === 4) render();
      },
      state() {
        return { ...state, symptoms: [...state.symptoms], repairSignals: [...state.repairSignals] };
      },
      reducedMotion,
      cleanup() {
        if (destroyed) return;
        destroyed = true;
        mount.removeEventListener("click", onClick);
        controllers.delete(mount);
      },
    };
    controllers.set(mount, controller);
    return controller;
  }

  function controllerFor(container) {
    const mount = container && container.querySelector ? container.querySelector("[data-smart-advisor]") : null;
    return mount ? controllers.get(mount) : null;
  }

  function refreshCatalog(container) {
    controllerFor(container)?.refreshCatalog();
  }

  function cleanup(container) {
    controllerFor(container)?.cleanup();
  }

  root.advisor = {
    renderSection,
    bind,
    refreshCatalog,
    cleanup,
    _test: {
      AC_TYPES,
      MONTH_BANDS,
      SYMPTOMS,
      REPAIR_SIGNALS,
      VERDICT_META,
      evaluateRecommendation,
      canonicalAcType,
      canonicalJobCategory,
      canonicalWashVariant,
      eligibleCatalogItems,
      mapCatalogItems,
      initialState,
      renderSection,
      stepContent,
    },
  };
})();
