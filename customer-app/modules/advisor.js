(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const controllers = new WeakMap();

  const AC_TYPES = Object.freeze([
    { value: "wall", label: "แอร์ผนัง", bookingValue: "ผนัง", icon: "wall-ac" },
    { value: "fourway", label: "แอร์สี่ทิศทาง", bookingValue: "สี่ทิศทาง", icon: "fourway" },
    { value: "hanging", label: "แอร์แขวน", bookingValue: "แขวน", icon: "hanging-ac" },
    { value: "ceiling", label: "แอร์เปลือยใต้ฝ้า", bookingValue: "เปลือยใต้ฝ้า", icon: "ceiling-ac" },
    { value: "unknown", label: "ไม่แน่ใจ", bookingValue: null, icon: "question" },
  ]);

  const MONTH_BANDS = Object.freeze([
    { value: "recent", label: "ไม่เกิน 3 เดือน", icon: "calendar-check" },
    { value: "m4_5", label: "4–5 เดือน", icon: "calendar" },
    { value: "m6_8", label: "6–8 เดือน", icon: "clock" },
    { value: "m9_12", label: "9–12 เดือน", icon: "history" },
    { value: "over12", label: "เกิน 1 ปี", icon: "calendar-alert" },
    { value: "unknown", label: "จำไม่ได้ / ไม่แน่ใจ", icon: "question" },
  ]);

  const SYMPTOMS = Object.freeze([
    { value: "routine", label: "ไม่มีอาการ แค่ถึงรอบล้าง", icon: "check-circle" },
    { value: "reduced_cooling", label: "เย็นน้อยลง", icon: "thermometer" },
    { value: "weak_airflow", label: "ลมอ่อน", icon: "wind" },
    { value: "odor", label: "มีกลิ่น", icon: "air-wave" },
    { value: "drain", label: "น้ำหยด / ระบายน้ำไม่ดี", icon: "droplet" },
    { value: "dusty", label: "มีฝุ่นหรือคราบมาก", icon: "filter" },
    { value: "heavy_dirt", label: "สกปรกหนัก / หมักหมม", icon: "warning" },
    { value: "noise", label: "เสียงดัง", icon: "sound" },
    { value: "heavy_use", label: "ใช้งานหนักทุกวัน", icon: "activity" },
    { value: "pets", label: "มีสัตว์เลี้ยง", icon: "paw" },
    { value: "allergy", label: "มีผู้แพ้ง่ายหรือเด็กเล็ก", icon: "health-shield" },
    { value: "never_deep", label: "ไม่เคยล้างลึก", icon: "layers" },
  ]);

  const REPAIR_SIGNALS = Object.freeze([
    { value: "error_code", label: "มี Error Code", icon: "code-alert" },
    { value: "ac_not_running", label: "แอร์ไม่ทำงาน", icon: "power-off" },
    { value: "outdoor_not_running", label: "คอยร้อนไม่ทำงาน", icon: "fan" },
    { value: "indoor_not_running", label: "คอยล์เย็นไม่ทำงาน", icon: "snow-vent" },
    { value: "breaker_trip", label: "เบรกเกอร์ตัด", icon: "breaker" },
    { value: "burning_smell", label: "มีเสียงหรือกลิ่นไหม้", icon: "flame-alert" },
    { value: "none", label: "ไม่มีอาการเหล่านี้", icon: "check-circle" },
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
    const alternativeVariant = recommendation.alternative && VERDICT_META[recommendation.alternative]
      ? VERDICT_META[recommendation.alternative].variant
      : null;
    return eligibleCatalogItems(items).map((item, index) => {
      const job = canonicalJobCategory(item);
      const acType = canonicalAcType(item);
      const variant = canonicalWashVariant(item);
      let rank = 99;
      let matchType = null;
      if (intent.kind === "repair") {
        if (job === "repair") { rank = 0; matchType = "primary"; }
        else if (job === "inspection") { rank = 1; matchType = "primary"; }
      } else if (intent.kind === "clean" && job === "wash") {
        if (acType !== intent.acType) return null;
        if (!intent.variant || variant === intent.variant) {
          rank = 0;
          matchType = "primary";
        } else if (alternativeVariant && variant === alternativeVariant) {
          rank = 1;
          matchType = "alternative";
        }
      }
      if (rank === 99 || !matchType) return null;
      const mayBook = intent.kind === "clean"
        && matchType === "primary"
        && item.booking_mode === "bookable"
        && (recommendation.action === "catalog" || recommendation.action === "catalog_or_contact");
      const draft = mayBook && adapter ? adapter(item) : null;
      return {
        item,
        exact: matchType === "primary",
        matchType,
        directBook: Boolean(draft),
        draft,
        rank: rank + (draft ? 0 : 0.5),
        index,
      };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, 3);
  }

  function initialState() {
    return { step: 0, acType: "", monthsBand: "", symptoms: [], repairSignals: [], recommendation: null, started: false };
  }

  function esc(value) {
    return root.utils.escapeHtml(value == null ? "" : String(value));
  }

  function icon(name, size) {
    return typeof root.utils.icon === "function" ? root.utils.icon(name, size) : "";
  }

  const ADVISOR_ICON_PATHS = Object.freeze({
    "arrow-left": '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    "wall-ac": '<rect x="3" y="5" width="18" height="8" rx="2"/><path d="M7 9h10M8 16c1.2 1.2 2.5 1.8 4 1.8s2.8-.6 4-1.8"/>',
    fourway: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M9 9h6v6H9z"/>',
    "hanging-ac": '<path d="M6 3v3M18 3v3"/><rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18h10M9 14v4M15 14v4"/>',
    "ceiling-ac": '<path d="M3 5h18M6 5v8h12V5M9 16h6M8 20c1.1-1.2 2.4-1.8 4-1.8s2.9.6 4 1.8"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1-1.4 2M12 17h.01"/>',
    "calendar-check": '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18M8 15l2 2 5-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18M8 13h2M14 13h2M8 17h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    history: '<path d="M4 5v5h5M5.5 18A9 9 0 1 0 4 10"/><path d="M12 7v5l3 2"/>',
    "calendar-alert": '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18M12 12v4M12 18h.01"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    thermometer: '<path d="M10 5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0V5zM12 9v7"/><path d="M17 6h3M18 10h2"/>',
    wind: '<path d="M3 8h11a2 2 0 1 0-2-2M3 12h16a2 2 0 1 1-2 2M3 16h9"/>',
    "air-wave": '<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 13c3-3 6 3 9 0s6 3 9 0M5 18c2-2 4 2 6 0"/>',
    droplet: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/><path d="M9 15c.5 1.2 1.5 1.8 3 1.8"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/><path d="M7 8h10"/>',
    warning: '<path d="M12 3 2.8 20h18.4L12 3z"/><path d="M12 9v5M12 17h.01"/>',
    sound: '<path d="M4 10v4h4l5 4V6L8 10H4zM17 9c1.5 1.5 1.5 4.5 0 6M19.5 6.5c3 3 3 8 0 11"/>',
    activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    paw: '<circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/><path d="M8 17c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2-1.5 3-4 3s-4-1-4-3z"/>',
    "health-shield": '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M12 8v8M8 12h8"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    "code-alert": '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"/><circle cx="19" cy="5" r="3"/><path d="M19 3.8v1.4M19 6.2h.01"/>',
    "power-off": '<path d="M12 3v8M6.3 5.8A8 8 0 1 0 18.5 6M3 3l18 18"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c-1-4 1-7 4-7 2 3 1 6-2 8M14 12c4-1 7 1 7 4-3 2-6 1-8-2M12 14c1 4-1 7-4 7-2-3-1-6 2-8M10 12c-4 1-7-1-7-4 3-2 6-1 8 2"/>',
    "snow-vent": '<path d="M12 3v18M5 7l14 10M19 7 5 17M8 4l4 3 4-3M8 20l4-3 4 3"/>',
    breaker: '<path d="M13 2 5 13h6l-1 9 9-12h-6l0-8z"/><path d="M3 3l18 18"/>',
    "flame-alert": '<path d="M13 3c1 4-2 5-2 8 0 1.5 1 2.5 2 3.5 1.5-1 2.5-2.5 2-5 3 2 4 4.5 3 7a6.5 6.5 0 0 1-12 0c-1-3 1-6 4-8-.5 3 1 4 1 4"/><path d="M20 4v3M20 9h.01"/>',
  });

  function semanticIcon(name, size = 20) {
    const key = ADVISOR_ICON_PATHS[name] ? name : "question";
    return `<span class="advisor-semantic-icon" data-advisor-icon="${esc(key)}" aria-hidden="true"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ADVISOR_ICON_PATHS[key]}</svg></span>`;
  }

  function choiceButtons(items, selected, attribute) {
    return `<div class="advisor-choice-grid">${items.map((item) => `
      <button class="advisor-choice ${selected === item.value ? "is-selected" : ""}" type="button"
        ${attribute}="${esc(item.value)}" aria-pressed="${selected === item.value ? "true" : "false"}">
        <span class="advisor-choice-icon">${semanticIcon(item.icon, 20)}</span>
        <span class="advisor-choice-label">${esc(item.label)}</span>
        <span class="advisor-choice-check" aria-hidden="true">${selected === item.value ? "✓" : ""}</span>
      </button>
    `).join("")}</div>`;
  }

  function chipButtons(items, selected, attribute) {
    const values = new Set(selected || []);
    return `<div class="advisor-chip-grid ${attribute === "data-advisor-repair" ? "is-repair-list" : ""}">${items.map((item) => `
      <button class="advisor-chip ${values.has(item.value) ? "is-selected" : ""}" type="button"
        ${attribute}="${esc(item.value)}" aria-pressed="${values.has(item.value) ? "true" : "false"}">
        <span class="advisor-choice-icon">${semanticIcon(item.icon, 20)}</span>
        <span class="advisor-choice-label">${esc(item.label)}</span>
        <span class="advisor-choice-check" aria-hidden="true">${values.has(item.value) ? "✓" : ""}</span>
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
          <button class="primary-btn" type="button" data-advisor-contact>${icon("chat", 18)} ให้ทีมช่วยประเมิน</button>
        </div>
      `;
    }
    return `
      <div class="advisor-catalog-head">
        <strong>บริการที่เกี่ยวข้องจาก Catalog</strong>
        <span>เลือกดูรายละเอียดหรือดำเนินการต่อ</span>
      </div>
      <div class="advisor-result-products">
        ${matches.map(({ item, directBook, exact, matchType }) => {
          const image = firstImage(item);
          return `
            <article class="advisor-product ${exact ? "is-exact" : ""}" data-advisor-product="${esc(item.item_id)}">
              <div class="advisor-product-image">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : icon("sparkle", 24)}</div>
              <div class="advisor-product-body">
                <span>${matchType === "alternative" ? "ทางเลือกสำรอง" : "ตรงกับผลประเมิน"}</span>
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
      ${recommendation.confidence === "assessment" || String(recommendation.action || "").includes("contact") ? `
        <div class="advisor-assessment-cta">
          <button class="primary-btn" type="button" data-advisor-contact>${icon("chat", 18)} ให้ทีมช่วยประเมิน</button>
        </div>
      ` : ""}
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
      </div>
    `;
  }

  const STEP_COPY = Object.freeze([
    { title: "แอร์ของคุณเป็นแบบไหน", copy: "เลือกชนิดเครื่องก่อน เพื่อไม่แนะนำวิธีล้างผิดประเภท" },
    { title: "ล้างครั้งก่อนเมื่อไร", copy: "ใช้ช่วงเวลาโดยประมาณได้ ไม่จำเป็นต้องจำวันที่แน่นอน" },
    { title: "ตอนนี้มีอาการอะไรบ้าง", copy: "เลือกได้หลายข้อ ระบบจะใช้ร่วมกับรอบล้าง" },
    { title: "มีอาการที่ควรตรวจซ่อมก่อนไหม", copy: "อาการกลุ่มนี้จะถูกส่งไปตรวจเช็คก่อนงานล้าง" },
  ]);

  function stepIsValid(state) {
    return Boolean((state.step === 0 && state.acType)
      || (state.step === 1 && state.monthsBand)
      || (state.step === 2 && state.symptoms.length)
      || (state.step === 3 && state.repairSignals.length));
  }

  function stepContent(state, catalogState) {
    if (state.step === 4) return renderResult(state, catalogState);
    const current = STEP_COPY[state.step];
    let controls = "";
    if (state.step === 0) controls = choiceButtons(AC_TYPES, state.acType, "data-advisor-ac");
    if (state.step === 1) controls = choiceButtons(MONTH_BANDS, state.monthsBand, "data-advisor-months");
    if (state.step === 2) controls = chipButtons(SYMPTOMS, state.symptoms, "data-advisor-symptom");
    if (state.step === 3) controls = chipButtons(REPAIR_SIGNALS, state.repairSignals, "data-advisor-repair");
    return `
      <div class="advisor-step advisor-step-${state.step + 1}" data-advisor-step="${state.step + 1}">
        <div class="advisor-step-copy">
          <h3 data-advisor-question-title tabindex="-1">${esc(current.title)}</h3>
          <p>${esc(current.copy)}</p>
        </div>
        ${controls}
      </div>
    `;
  }

  function launcherContent(state, isOpen) {
    const hasResult = Boolean(state.recommendation);
    const started = Boolean(state.started);
    const meta = hasResult ? VERDICT_META[state.recommendation.verdict] : null;
    const cta = hasResult ? "ดูผลประเมิน" : started ? "ทำแบบประเมินต่อ" : "เริ่มประเมิน";
    const status = hasResult
      ? `<span class="advisor-launcher-status">ผลล่าสุด: <strong>${esc(meta.label)}</strong></span>`
      : started
        ? `<span class="advisor-launcher-status">ทำถึงขั้นที่ ${Math.min(state.step + 1, 4)} จาก 4</span>`
        : `<span class="advisor-launcher-status">${icon("clock", 15)} ใช้เวลาประมาณ 1 นาที</span>`;
    return `
      <div class="advisor-launcher-copy">
        <span class="section-kicker">CWF SMART ADVISOR</span>
        <h2>${hasResult ? esc(meta.label) : "ไม่แน่ใจว่าควรล้างหรือซ่อม?"}</h2>
        <p>${hasResult ? "เปิดดูเหตุผลและบริการจริงที่ระบบแนะนำ" : "ตอบคำถามสั้น ๆ แล้วให้ระบบช่วยเลือกบริการที่เหมาะ"}</p>
      </div>
      <div class="advisor-launcher-footer">
        ${status}
        <div class="advisor-launcher-actions">
          <button class="primary-btn" type="button" data-advisor-launch aria-expanded="${isOpen ? "true" : "false"}" aria-controls="advisor-sheet-dialog"><span>${cta}</span></button>
          ${hasResult ? `<button class="advisor-reset-btn" type="button" data-advisor-reset-launcher>ประเมินใหม่</button>` : ""}
        </div>
      </div>
    `;
  }

  function sheetActions(state) {
    if (state.step === 4) {
      return `
        <button class="secondary-btn advisor-result-edit-btn" type="button" data-advisor-back>แก้คำตอบ</button>
        <button class="advisor-reset-btn advisor-result-reset-btn" type="button" data-advisor-reset>ประเมินใหม่</button>
      `;
    }
    if (state.step === 2 && state.symptoms.length && !state.symptoms.includes("routine")) {
      return `<button class="primary-btn advisor-symptoms-done" type="button" data-advisor-symptoms-done>เลือกครบแล้ว</button>`;
    }
    return "";
  }

  function sheetProgressHtml(stepNumber) {
    return [0, 1, 2, 3].map((index) => `<span class="${index < stepNumber ? "is-active" : ""}" ${index === Math.min(stepNumber - 1, 3) ? `aria-current="step"` : ""}></span>`).join("");
  }

  function sheetHtml() {
    return `
      <div class="advisor-sheet-layer is-opening" data-advisor-backdrop>
        <section class="advisor-sheet" id="advisor-sheet-dialog" data-advisor-dialog role="dialog" aria-modal="true" aria-labelledby="advisor-sheet-title">
          <header class="advisor-sheet-header">
            <div class="advisor-sheet-leading" data-advisor-header-leading></div>
            <div>
              <h2 id="advisor-sheet-title">ผู้ช่วยเลือกบริการ</h2>
              <span data-advisor-step-label></span>
            </div>
            <button class="advisor-sheet-close" type="button" data-advisor-close aria-label="ปิดผู้ช่วยเลือกบริการ">×</button>
            <div class="advisor-sheet-progress" data-advisor-progress aria-label="ความคืบหน้าการประเมิน"></div>
          </header>
          <div class="advisor-sheet-scroll" data-advisor-scroll>
            <div class="advisor-sheet-body" data-advisor-body></div>
          </div>
          <footer class="advisor-sheet-actions" data-advisor-actions></footer>
        </section>
      </div>
    `;
  }

  function renderSection(catalogState = { status: "idle", items: [] }) {
    const state = initialState();
    return `
      <section class="smart-advisor-section homepage-section" data-smart-advisor data-home-reveal>
        <div class="advisor-launcher-orb" aria-hidden="true"><span>${icon("sparkle", 24)}</span></div>
        <div class="advisor-launcher-content" data-advisor-launcher-content>${launcherContent(state, false)}</div>
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
    let isOpen = false;
    let closeTimer = null;
    let transitionTimer = null;
    let transitionLocked = false;
    let portalRoot = null;
    const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const viewportTarget = window.visualViewport || window;
    let viewportListenersBound = false;
    mount.classList?.toggle?.("is-reduced-motion", reducedMotion);
    const catalogState = () => root.state.catalog || { status: "idle", items: [] };
    const sheetQuery = (selector) => portalRoot?.querySelector?.(selector) || null;
    const ensurePortal = () => {
      if (portalRoot && portalRoot.isConnected !== false) return portalRoot;
      portalRoot = document.createElement("div");
      portalRoot.className = "advisor-portal-root is-open";
      portalRoot.setAttribute("data-advisor-portal", "");
      portalRoot.addEventListener("click", onPortalClick);
      document.body.appendChild(portalRoot);
      return portalRoot;
    };
    const updateViewport = () => {
      if (destroyed || !isOpen || !portalRoot) return;
      const viewport = window.visualViewport;
      const height = Number(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0);
      const offsetTop = Number(viewport?.offsetTop || 0);
      if (height > 0) portalRoot.style?.setProperty?.("--advisor-viewport-height", `${Math.round(height)}px`);
      portalRoot.style?.setProperty?.("--advisor-viewport-top", `${Math.max(0, Math.round(offsetTop))}px`);
    };
    const bindViewport = () => {
      if (viewportListenersBound) return;
      viewportListenersBound = true;
      viewportTarget.addEventListener?.("resize", updateViewport);
      if (window.visualViewport) viewportTarget.addEventListener?.("scroll", updateViewport);
      updateViewport();
    };
    const stopViewportListeners = () => {
      if (!viewportListenersBound) return;
      viewportListenersBound = false;
      viewportTarget.removeEventListener?.("resize", updateViewport);
      if (window.visualViewport) viewportTarget.removeEventListener?.("scroll", updateViewport);
    };
    const clearViewportVariables = () => {
      portalRoot?.style?.removeProperty?.("--advisor-viewport-height");
      portalRoot?.style?.removeProperty?.("--advisor-viewport-top");
    };
    const removePortal = () => {
      if (!portalRoot) return;
      portalRoot.removeEventListener("click", onPortalClick);
      portalRoot.remove?.();
      portalRoot = null;
    };
    const renderLauncher = () => {
      const launcher = mount.querySelector("[data-advisor-launcher-content]");
      if (launcher) launcher.innerHTML = launcherContent(state, isOpen);
    };
    const focusCurrent = () => requestAnimationFrame(() => {
      if (destroyed || !isOpen) return;
      const target = sheetQuery(state.step === 4 ? "[data-advisor-result]" : "[data-advisor-question-title]")
        || sheetQuery("[data-advisor-close]");
      target?.focus?.({ preventScroll: true });
    });
    const renderSheet = (direction = "forward", options = {}) => {
      if (destroyed || !isOpen || !mount.isConnected) return;
      const host = ensurePortal();
      let dialog = sheetQuery("[data-advisor-dialog]");
      const opening = !dialog;
      if (opening) {
        host.innerHTML = sheetHtml();
        dialog = sheetQuery("[data-advisor-dialog]");
      }
      if (!dialog) return;
      mount.classList?.toggle?.("is-sheet-open", true);
      portalRoot?.classList?.add?.("is-open");
      const result = state.step === 4;
      const stepNumber = result ? 4 : state.step + 1;
      const layer = sheetQuery("[data-advisor-backdrop]");
      const body = sheetQuery("[data-advisor-body]");
      const actions = sheetQuery("[data-advisor-actions]");
      const stepLabel = sheetQuery("[data-advisor-step-label]");
      const progress = sheetQuery("[data-advisor-progress]");
      const leading = sheetQuery("[data-advisor-header-leading]");
      dialog.setAttribute("data-step", stepNumber);
      if (stepLabel) stepLabel.textContent = result ? "ผลประเมิน" : `ขั้นที่ ${stepNumber} จาก 4`;
      if (progress) progress.innerHTML = sheetProgressHtml(stepNumber);
      if (leading) leading.innerHTML = state.step > 0
        ? `<button class="advisor-sheet-back" type="button" data-advisor-back aria-label="ย้อนกลับ">${semanticIcon("arrow-left", 19)}</button>`
        : `<div class="advisor-sheet-brand" aria-hidden="true">${icon("sparkle", 18)}</div>`;
      if (actions) {
        actions.innerHTML = sheetActions(state);
        actions.hidden = !actions.innerHTML.trim();
        actions.classList.toggle("is-symptom-actions", state.step === 2 && !actions.hidden);
      }
      if (body) {
        body.classList.remove("is-step-forward");
        body.classList.remove("is-step-back");
        body.classList.remove("is-refresh");
        body.classList.add(direction === "back" ? "is-step-back" : direction === "refresh" ? "is-refresh" : "is-step-forward");
        body.innerHTML = stepContent(state, catalogState());
      }
      if (opening) layer?.classList?.add?.("is-opening");
      else layer?.classList?.remove?.("is-opening");
      const scroll = sheetQuery("[data-advisor-scroll]");
      if (scroll && options.resetScroll !== false) scroll.scrollTop = 0;
      if (options.focus !== false) focusCurrent();
    };
    const toggleExclusive = (values, value, exclusive) => {
      const selected = new Set(values);
      if (value === exclusive) return selected.has(value) ? [] : [value];
      selected.delete(exclusive);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return Array.from(selected);
    };
    const syncChoices = (attribute, selectedValues) => {
      const selected = new Set(Array.isArray(selectedValues) ? selectedValues : [selectedValues]);
      portalRoot?.querySelectorAll?.(`[${attribute}]`).forEach((button) => {
        const active = selected.has(button.getAttribute(attribute));
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        const check = button.querySelector?.(".advisor-choice-check");
        if (check) check.textContent = active ? "✓" : "";
      });
    };
    const updateActions = () => {
      const actions = sheetQuery("[data-advisor-actions]");
      if (!actions) return;
      actions.innerHTML = sheetActions(state);
      actions.hidden = !actions.innerHTML.trim();
      actions.classList.toggle("is-symptom-actions", state.step === 2 && !actions.hidden);
    };
    const clearTransition = () => {
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = null;
      transitionLocked = false;
    };
    const afterSelection = (callback) => {
      if (transitionLocked || destroyed || !isOpen) return;
      transitionLocked = true;
      const finish = () => {
        transitionTimer = null;
        transitionLocked = false;
        if (!destroyed && isOpen) callback();
      };
      if (reducedMotion) finish();
      else transitionTimer = setTimeout(finish, 180);
    };
    const focusableNodes = () => {
      const dialog = sheetQuery("[data-advisor-dialog]");
      if (!dialog) return [];
      return Array.from(dialog.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"))
        .filter((node) => !node.hidden);
    };
    const onDocumentKeydown = (event) => {
      if (!isOpen || destroyed) return;
      if (event.key === "Escape") {
        event.preventDefault?.();
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusableNodes();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault?.();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault?.();
        first.focus();
      }
    };
    const removeOpenListeners = () => document.removeEventListener("keydown", onDocumentKeydown);
    const openSheet = () => {
      if (destroyed || isOpen) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
        removePortal();
      }
      state.started = true;
      isOpen = true;
      ensurePortal();
      document.body.classList.add("has-advisor-sheet");
      document.addEventListener("keydown", onDocumentKeydown);
      bindViewport();
      renderLauncher();
      renderSheet("forward");
    };
    const closeSheet = (options = {}) => {
      if (!isOpen && !options.immediate) return;
      if (options.immediate && closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      isOpen = false;
      portalRoot?.classList?.remove?.("is-open");
      portalRoot?.classList?.add?.("is-closing");
      clearTransition();
      removeOpenListeners();
      stopViewportListeners();
      document.body.classList.remove("has-advisor-sheet");
      renderLauncher();
      const host = portalRoot;
      const layer = sheetQuery("[data-advisor-backdrop]");
      const finish = () => {
        closeTimer = null;
        if (host && !isOpen) host.innerHTML = "";
        mount.classList?.toggle?.("is-sheet-open", false);
        clearViewportVariables();
        removePortal();
        if (options.restoreFocus !== false && !destroyed) mount.querySelector("[data-advisor-launch]")?.focus?.({ preventScroll: true });
      };
      if (options.immediate || reducedMotion || !layer) {
        finish();
      } else {
        layer.classList?.add?.("is-closing");
        closeTimer = true;
        const timerId = setTimeout(finish, 220);
        if (closeTimer !== null) closeTimer = timerId;
      }
    };
    const contact = (title) => {
      closeSheet({ immediate: true, restoreFocus: false });
      root.ui.openContactSheet(container, { title: title || "ให้ทีม CWF ช่วยประเมินบริการ" });
    };
    const onLauncherClick = (event) => {
      const button = event.target.closest("button");
      if (destroyed) return;
      if (!button) return;
      if (button.hasAttribute("data-advisor-launch")) {
        openSheet();
      } else if (button.hasAttribute("data-advisor-reset-launcher")) {
        state = initialState();
        renderLauncher();
        openSheet();
      }
    };
    const onPortalClick = (event) => {
      if (destroyed || !isOpen) return;
      const button = event.target.closest?.("button");
      if (!button) {
        const backdrop = event.target.closest?.("[data-advisor-backdrop]");
        const dialog = event.target.closest?.("[data-advisor-dialog]");
        if (backdrop && !dialog) closeSheet();
        return;
      }
      if (button.hasAttribute("data-advisor-close")) {
        closeSheet();
      } else if (button.hasAttribute("data-advisor-ac")) {
        if (transitionLocked) return;
        state.acType = button.getAttribute("data-advisor-ac");
        syncChoices("data-advisor-ac", state.acType);
        afterSelection(() => {
          state.step = 1;
          renderSheet("forward");
        });
      } else if (button.hasAttribute("data-advisor-months")) {
        if (transitionLocked) return;
        state.monthsBand = button.getAttribute("data-advisor-months");
        syncChoices("data-advisor-months", state.monthsBand);
        afterSelection(() => {
          state.step = 2;
          renderSheet("forward");
        });
      } else if (button.hasAttribute("data-advisor-symptom")) {
        if (transitionLocked) return;
        const symptom = button.getAttribute("data-advisor-symptom");
        state.symptoms = symptom === "routine" ? ["routine"] : toggleExclusive(state.symptoms, symptom, "routine");
        syncChoices("data-advisor-symptom", state.symptoms);
        updateActions();
        if (state.symptoms.includes("routine")) afterSelection(() => {
          state.step = 3;
          renderSheet("forward");
        });
      } else if (button.hasAttribute("data-advisor-repair")) {
        if (transitionLocked) return;
        state.repairSignals = [button.getAttribute("data-advisor-repair")];
        syncChoices("data-advisor-repair", state.repairSignals);
        afterSelection(() => {
          state.recommendation = evaluateRecommendation(state);
          state.step = 4;
          renderSheet("forward");
        });
      } else if (button.hasAttribute("data-advisor-symptoms-done")) {
        if (!state.symptoms.length || state.symptoms.includes("routine")) return;
        state.step = 3;
        renderSheet("forward");
      } else if (button.hasAttribute("data-advisor-back")) {
        clearTransition();
        state.step = state.step === 4 ? 3 : Math.max(0, state.step - 1);
        state.recommendation = null;
        renderSheet("back");
      } else if (button.hasAttribute("data-advisor-reset")) {
        state = initialState();
        state.started = true;
        renderLauncher();
        renderSheet("back");
      } else if (button.hasAttribute("data-advisor-detail")) {
        closeSheet({ immediate: true, restoreFocus: false });
        root.utils.routeTo(`storeItem-${button.getAttribute("data-advisor-detail")}`);
      } else if (button.hasAttribute("data-advisor-item-action")) {
        const id = button.getAttribute("data-advisor-item-action");
        if (state.recommendation?.verdict === "repair_check") {
          contact();
          return;
        }
        const allowedMatches = mapCatalogItems(state.recommendation, catalogState().items, {
          adapter: (item) => root.services.catalogItemToCommerceDraft(item),
        });
        const match = allowedMatches.find((candidate) => String(candidate.item.item_id) === String(id));
        if (!match || !match.directBook || !match.draft) {
          contact(match && match.item.item_name);
          return;
        }
        if (root.services.applyCommerceDraft("scheduled", match.draft)) {
          root.utils.routeTo("scheduled");
        } else {
          contact(match.item.item_name);
        }
      } else if (button.hasAttribute("data-advisor-contact")) {
        contact();
      }
    };
    mount.addEventListener("click", onLauncherClick);
    renderLauncher();
    const controller = {
      refreshCatalog() {
        if (destroyed || !isOpen || state.step !== 4) return;
        const catalog = sheetQuery("[data-advisor-catalog]");
        if (catalog) catalog.innerHTML = renderCatalogResults(state.recommendation, catalogState());
      },
      state() {
        return { ...state, isOpen, symptoms: [...state.symptoms], repairSignals: [...state.repairSignals] };
      },
      open: openSheet,
      close: closeSheet,
      reducedMotion,
      cleanup() {
        if (destroyed) return;
        closeSheet({ immediate: true, restoreFocus: false });
        destroyed = true;
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
        clearTransition();
        removeOpenListeners();
        stopViewportListeners();
        clearViewportVariables();
        removePortal();
        document.body.classList.remove("has-advisor-sheet");
        mount.removeEventListener("click", onLauncherClick);
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
      launcherContent,
      sheetHtml,
      sheetActions,
      stepIsValid,
    },
  };
})();
