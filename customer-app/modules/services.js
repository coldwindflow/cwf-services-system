(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const UNKNOWN_AC = "__unknown_ac__";
  const UNKNOWN_BTU = "__unknown_btu__";
  const WALL_AC = "ผนัง";
  const DEFAULT_WASH = "ล้างธรรมดา";

  const serviceKinds = [
    { value: "clean", label: "ล้างแอร์", short: "ล้าง", job_type: "ล้าง", bookable: true, copy: "เลือกชนิดแอร์ จำนวน และคิวว่างจริง" },
    { value: "repair", label: "ซ่อมแอร์", short: "ซ่อม", job_type: "ซ่อม", bookable: false, repair_variant: "ซ่อมทั่วไป", copy: "ติดต่อแอดมินเพื่อประเมินอาการและจัดช่าง" },
    { value: "install", label: "ติดตั้งแอร์", short: "ติดตั้ง", job_type: "ติดตั้ง", bookable: false, copy: "ติดต่อแอดมินเพื่อประเมินหน้างาน ราคา และคิวติดตั้ง" },
    { value: "move", label: "ย้ายแอร์", short: "ย้าย", job_type: "ย้าย", bookable: false, copy: "ติดต่อแอดมินเพื่อประเมินระยะท่อและพื้นที่ติดตั้งใหม่" },
    { value: "inspect", label: "ตรวจอาการ / ปรึกษา", short: "ตรวจอาการ", job_type: "ซ่อม", bookable: false, repair_variant: "ตรวจอาการ", copy: "ส่งรายละเอียดให้แอดมินช่วยคัดกรองก่อนนัดช่าง" },
  ];

  const acTypes = [
    { value: WALL_AC, label: "แอร์ผนัง", copy: "บ้านและคอนโดทั่วไป", priced: true },
    { value: "สี่ทิศทาง", label: "แอร์สี่ทิศทาง", copy: "แอร์ฝังคาสเซ็ตในสำนักงานหรือร้านค้า", priced: true },
    { value: "แขวน", label: "แอร์แขวน", copy: "แอร์แขวนเพดานหรือพื้นที่ขนาดใหญ่", priced: true },
    { value: "เปลือยใต้ฝ้า", label: "แอร์เปลือยใต้ฝ้า", copy: "งานใต้ฝ้าที่เข้าถึงตัวเครื่องได้", priced: true },
    { value: UNKNOWN_AC, label: "อื่น ๆ / ไม่แน่ใจ", copy: "กรุณาติดต่อแอดมินเพื่อประเมิน", priced: false },
  ];

  const washVariants = [
    { value: "ล้างธรรมดา", label: "ล้างปกติ", copy: "ฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และท่อน้ำทิ้ง" },
    { value: "ล้างพรีเมียม", label: "ล้างพรีเมียม", copy: "ล้างละเอียดขึ้น รวมชิ้นส่วนภายในที่ถอดทำความสะอาดได้" },
    { value: "ล้างแขวนคอยล์", label: "ล้างแบบแขวนคอยล์", copy: "ล้างละเอียดโดยแขวนชุดคอยล์" },
    { value: "ล้างแบบตัดล้าง", label: "ตัดล้างใหญ่", copy: "ถอดล้างครั้งใหญ่สำหรับเครื่องสกปรกมาก" },
  ];

  const repairVariants = [
    { value: "ตรวจอาการ", label: "ตรวจอาการ" },
    { value: "ซ่อมทั่วไป", label: "ซ่อมทั่วไป" },
    { value: "ตรวจเช็ครั่ว", label: "ตรวจเช็ครั่ว" },
  ];

  const btuOptions = [
    { value: "9000", label: "9,000 BTU", btu: 9000, priced: true },
    { value: "12000", label: "12,000 BTU", btu: 12000, priced: true },
    { value: "18000", label: "18,000 BTU", btu: 18000, priced: true },
    { value: "24000", label: "24,000 BTU", btu: 24000, priced: true },
    { value: "30000", label: "30,000+ BTU", btu: 30000, priced: true },
    { value: UNKNOWN_BTU, label: "ไม่แน่ใจ", btu: null, priced: false },
  ];

  const bookableAcTypes = acTypes.filter((item) => item.priced);
  const bookableBtuOptions = btuOptions.filter((item) => item.priced);
  const machineCounts = Array.from({ length: 10 }, (_, index) => index + 1);

  function find(list, value, fallbackIndex = 0) {
    return list.find((item) => String(item.value) === String(value)) || list[fallbackIndex] || null;
  }

  function acType(value) {
    return find(acTypes, value || WALL_AC);
  }

  function btuOption(value) {
    return find(btuOptions, String(value || "12000"));
  }

  function washVariant(value) {
    return find(washVariants, value || DEFAULT_WASH);
  }

  function makeLineId() {
    return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createServiceLine(patch) {
    const input = patch || {};
    const line = {
      line_id: String(input.line_id || makeLineId()),
      job_type: "ล้าง",
      ac_type: String(input.ac_type || WALL_AC),
      btu: Number(input.btu || 12000),
      machine_count: Math.max(1, Math.min(10, Number(input.machine_count || 1))),
      wash_variant: "",
    };
    if (line.ac_type === WALL_AC) line.wash_variant = String(input.wash_variant || DEFAULT_WASH);
    return line;
  }

  function normalizeServiceLine(line) {
    const input = line || {};
    const ac = acType(input.ac_type);
    const btu = btuOption(input.btu);
    const normalized = {
      line_id: String(input.line_id || makeLineId()),
      job_type: "ล้าง",
      ac_type: ac.value,
      btu: btu.btu,
      machine_count: Math.max(1, Math.min(10, Number(input.machine_count || 1))),
      wash_variant: "",
      needs_admin_estimate: !ac.priced || !btu.priced,
      admin_reason: "",
    };
    if (normalized.ac_type === WALL_AC) normalized.wash_variant = washVariant(input.wash_variant || DEFAULT_WASH).value;
    if (!ac.priced) normalized.admin_reason = "กรุณาติดต่อแอดมินเพื่อประเมินชนิดแอร์นี้";
    if (!btu.priced) normalized.admin_reason = "กรุณาเลือก BTU ให้ชัดเจนก่อนจอง";
    return normalized;
  }

  function normalizeServiceLines(draft) {
    const d = draft || {};
    const raw = Array.isArray(d.services) && d.services.length
      ? d.services
      : [{
          line_id: "line-1",
          job_type: d.job_type || "ล้าง",
          ac_type: d.ac_type || WALL_AC,
          btu: d.btu || 12000,
          machine_count: d.machine_count || 1,
          wash_variant: d.wash_variant || DEFAULT_WASH,
        }];
    return raw.map(normalizeServiceLine);
  }

  function toBackendServiceLine(line) {
    const normalized = normalizeServiceLine(line);
    if (normalized.needs_admin_estimate || normalized.job_type !== "ล้าง") return null;
    const out = {
      job_type: "ล้าง",
      ac_type: normalized.ac_type,
      btu: normalized.btu,
      machine_count: normalized.machine_count,
    };
    if (normalized.ac_type === WALL_AC && normalized.wash_variant) out.wash_variant = normalized.wash_variant;
    return out;
  }

  function payloadFromServiceLines(lines) {
    const normalized = (Array.isArray(lines) && lines.length ? lines : [createServiceLine()])
      .map(toBackendServiceLine);
    if (!normalized.length || normalized.some((line) => !line)) return null;
    const first = normalized[0];
    return {
      job_type: "ล้าง",
      ac_type: first.ac_type,
      btu: first.btu,
      machine_count: first.machine_count,
      wash_variant: first.wash_variant || "",
      repair_variant: "",
      services: normalized,
    };
  }

  function payloadFromScheduledDraft(draft) {
    return payloadFromServiceLines(normalizeServiceLines(draft));
  }

  function normalizeServiceDraft(draft) {
    return normalizeServiceLines(draft)[0] || normalizeServiceLine(createServiceLine());
  }

  function payloadFromServiceDraft(draft) {
    return payloadFromScheduledDraft(draft);
  }

  function serviceLabel(service) {
    const s = normalizeServiceLine(service);
    const ac = acType(s.ac_type);
    const btu = btuOption(s.btu);
    const parts = [
      ac.label,
      btu.label,
      s.ac_type === WALL_AC && s.wash_variant ? washVariant(s.wash_variant).label : "",
      `${s.machine_count || 1} เครื่อง`,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  function serviceLineSummary(line, index) {
    const s = normalizeServiceLine(line);
    return {
      title: `รายการที่ ${Number(index || 0) + 1}`,
      line1: `${acType(s.ac_type).label} · ${btuOption(s.btu).label}`,
      line2: [s.ac_type === WALL_AC && s.wash_variant ? washVariant(s.wash_variant).label : "", `${s.machine_count} เครื่อง`].filter(Boolean).join(" · "),
    };
  }

  function linePatchToDraftServices(draft, lineId, patch) {
    const services = normalizeServiceLines(draft);
    const index = services.findIndex((line) => String(line.line_id) === String(lineId));
    if (index < 0) return services;
    const nextLine = { ...services[index], ...(patch || {}) };
    if (patch && Object.prototype.hasOwnProperty.call(patch, "ac_type")) {
      nextLine.wash_variant = patch.ac_type === WALL_AC ? (nextLine.wash_variant || DEFAULT_WASH) : "";
    }
    services[index] = normalizeServiceLine(nextLine);
    return services;
  }

  const commerceCategories = [
    { id: "clean", action: "book", route: "scheduled", glyph: "sparkle", title: "ล้างแอร์", copy: "เลือกวัน เวลา และคิวช่างว่างจริง", draft: createServiceLine() },
    { id: "repair", action: "contact", glyph: "wrench", title: "ซ่อมแอร์", copy: "ติดต่อแอดมินเพื่อประเมินอาการและจัดช่าง" },
    { id: "install", action: "contact", glyph: "shield", title: "ติดตั้งแอร์", copy: "ติดต่อแอดมินเพื่อประเมินหน้างานและราคา" },
    { id: "move", action: "contact", glyph: "pin", title: "ย้ายแอร์", copy: "ติดต่อแอดมินเพื่อประเมินระยะท่อและพื้นที่ใหม่" },
    { id: "inspect", action: "contact", glyph: "chat", title: "ตรวจอาการ / ปรึกษา", copy: "ส่งรายละเอียดให้แอดมินช่วยคัดกรองก่อนนัดช่าง" },
    { id: "urgent", action: "urgent", route: "urgent", glyph: "bolt", title: "คิวด่วน", copy: "ส่งคำขอด่วนสำหรับงานล้าง รอช่างหรือแอดมินยืนยันก่อนเริ่มงาน" },
  ];

  const quickServices = [
    { id: "wall-normal", action: "book", route: "scheduled", title: "ล้างแอร์ผนัง", kicker: "ยอดนิยม", copy: "เหมาะกับบ้านและคอนโดทั่วไป", draft: createServiceLine({ ac_type: WALL_AC, wash_variant: DEFAULT_WASH, btu: 12000, machine_count: 1 }), priceable: true },
    { id: "wall-premium", action: "book", route: "scheduled", title: "ล้างพรีเมียม", kicker: "ดูแลละเอียด", copy: "สำหรับแอร์ใช้งานหนักหรือต้องการล้างลึกขึ้น", draft: createServiceLine({ ac_type: WALL_AC, wash_variant: "ล้างพรีเมียม", btu: 12000, machine_count: 1 }), priceable: true },
    { id: "cassette", action: "book", route: "scheduled", title: "ล้างแอร์สี่ทิศทาง", kicker: "ร้านค้า / ออฟฟิศ", copy: "ระบบคำนวณราคาและเวลาทำงานหลังเลือกบริการ", draft: createServiceLine({ ac_type: "สี่ทิศทาง", btu: 24000, machine_count: 1, wash_variant: "" }), priceable: true },
  ];

  const cleaningMethods = [
    { id: "method-normal", title: "ล้างปกติ", copy: "ดูแลตามรอบสำหรับแอร์ผนังที่ใช้งานปกติ", draft: quickServices[0].draft },
    { id: "method-premium", title: "ล้างพรีเมียม", copy: "เพิ่มความละเอียดสำหรับแอร์ใช้งานหนัก", draft: quickServices[1].draft },
    { id: "method-coil", title: "ล้างแบบแขวนคอยล์", copy: "ล้างละเอียดถึงชุดคอยล์และชิ้นส่วนภายใน", draft: createServiceLine({ ac_type: WALL_AC, wash_variant: "ล้างแขวนคอยล์", btu: 12000, machine_count: 1 }) },
    { id: "method-overhaul", title: "ตัดล้างใหญ่", copy: "งานล้างใหญ่สำหรับเครื่องสกปรกมาก", draft: createServiceLine({ ac_type: WALL_AC, wash_variant: "ล้างแบบตัดล้าง", btu: 12000, machine_count: 1 }) },
  ];

  function commerceItem(id) {
    return [...commerceCategories, ...quickServices, ...cleaningMethods].find((item) => item.id === id || item.title === id) || null;
  }

  function applyCommerceDraft(scope, item) {
    if (!item || item.action === "contact" || !item.draft) return false;
    const line = normalizeServiceLine(item.draft);
    root.state.updateDraft(scope, {
      service_kind: "clean",
      job_type: "ล้าง",
      ac_type: line.ac_type,
      btu: String(line.btu),
      machine_count: line.machine_count,
      wash_variant: line.wash_variant,
      services: [line],
      selectedSlot: null,
    });
    root.state.selectedService = { id: item.id || item.title || "", route: scope };
    if (scope === "scheduled") {
      root.state.setScheduledWizard({ step: 1, error: "" });
      root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
      root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      root.state.setScheduledPreview("calendar", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
    }
    return true;
  }

  root.services = {
    UNKNOWN_AC,
    UNKNOWN_BTU,
    WALL_AC,
    DEFAULT_WASH,
    serviceKinds,
    acTypes,
    bookableAcTypes,
    washVariants,
    repairVariants,
    btuOptions,
    bookableBtuOptions,
    machineCounts,
    primaryActions: [
      { route: "scheduled", glyph: "calendar", title: "จองล้างแอร์", copy: "เลือกวัน เวลา และคิวว่างจริง" },
      { route: "urgent", glyph: "bolt", title: "คิวด่วน", copy: "สำหรับงานล้างที่ต้องการช่างเร็วที่สุด" },
      { route: "tracking", glyph: "pin", title: "ติดตามงาน", copy: "ดูสถานะงานด้วย Booking Code" },
      { route: "profile", glyph: "phone", title: "ติดต่อ CWF", copy: "โทรหรือ LINE หาแอดมิน" },
    ],
    trustItems: [
      { glyph: "shield", title: "ช่างผ่านการคัดกรอง", copy: "แสดงคิวเฉพาะช่างที่เปิดให้ลูกค้าจองได้" },
      { glyph: "tag", title: "แจ้งราคาก่อนส่งคำขอ", copy: "ระบบคำนวณราคาและเวลาทำงานหลังเลือกบริการ" },
      { glyph: "sparkle", title: "รองรับหลายเครื่อง", copy: "แยกรายการตามชนิดแอร์ BTU และวิธีล้าง" },
      { glyph: "pin", title: "ติดตามสถานะได้", copy: "ใช้ Booking Code ดูสถานะสำคัญของงาน" },
    ],
    commerceCategories,
    quickServices,
    cleaningMethods,
    commerceItem,
    applyCommerceDraft,
    createServiceLine,
    normalizeServiceLine,
    normalizeServiceLines,
    linePatchToDraftServices,
    payloadFromServiceLines,
    payloadFromScheduledDraft,
    normalizeServiceDraft,
    payloadFromServiceDraft,
    serviceLabel,
    serviceLineSummary,
    acType,
    btuOption,
    washVariant,
  };
})();
