(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const UNKNOWN_AC = "__unknown_ac__";
  const UNKNOWN_BTU = "__unknown_btu__";

  const serviceKinds = [
    { value: "clean", label: "ล้างแอร์", short: "ล้าง", job_type: "ล้าง", bookable: true, copy: "เลือกชนิดแอร์ รูปแบบการล้าง และคิวช่างจริง" },
    { value: "repair", label: "ซ่อมแอร์", short: "ซ่อม", job_type: "ซ่อม", bookable: false, repair_variant: "ซ่อมทั่วไป", copy: "ติดต่อแอดมินเพื่อคัดกรองอาการและจัดช่างที่เหมาะสม" },
    { value: "install", label: "ติดตั้งแอร์", short: "ติดตั้ง", job_type: "ติดตั้ง", bookable: false, copy: "ติดต่อแอดมินเพื่อประเมินหน้างาน ราคา และคิวติดตั้ง" },
    { value: "move", label: "ย้ายแอร์", short: "ย้าย", job_type: "ย้าย", bookable: false, copy: "ติดต่อแอดมินเพื่อประเมินระยะท่อและหน้างาน" },
    { value: "inspect", label: "ตรวจอาการ / ปรึกษา", short: "ตรวจอาการ", job_type: "ซ่อม", bookable: false, repair_variant: "ตรวจอาการ", copy: "ส่งรายละเอียดให้แอดมินช่วยคัดกรองก่อนนัดช่าง" },
  ];

  const acTypes = [
    { value: "ผนัง", label: "แอร์ผนัง", copy: "บ้านและคอนโดทั่วไป", priced: true },
    { value: "สี่ทิศทาง", label: "แอร์สี่ทิศทาง", copy: "แอร์ฝังคาสเซ็ตในสำนักงานหรือร้านค้า", priced: true },
    { value: "แขวน", label: "แอร์แขวน", copy: "แอร์แขวนเพดานหรือพื้นที่ขนาดใหญ่", priced: true },
    { value: "เปลือยใต้ฝ้า", label: "แอร์เปลือยใต้ฝ้า", copy: "งานใต้ฝ้าที่เข้าถึงตัวเครื่องได้", priced: true },
    { value: UNKNOWN_AC, label: "อื่น ๆ / ไม่แน่ใจ", copy: "กรุณาติดต่อแอดมินเพื่อประเมิน", priced: false },
  ];

  const washVariants = [
    { value: "ล้างธรรมดา", label: "ล้างปกติ", copy: "ฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และท่อน้ำทิ้ง" },
    { value: "ล้างพรีเมียม", label: "ล้างพรีเมียม", copy: "ล้างละเอียดขึ้น รวมชิ้นส่วนภายในที่ถอดทำความสะอาดได้" },
    { value: "ล้างแขวนคอยล์", label: "ล้างแบบแขวนคอยล์", copy: "งานล้างละเอียดโดยแขวนชุดคอยล์" },
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
    return list.find((item) => item.value === value) || list[fallbackIndex] || null;
  }

  function serviceKind(value) {
    return find(serviceKinds, value || "clean");
  }

  function acType(value) {
    return find(acTypes, value || "ผนัง");
  }

  function btuOption(value) {
    return find(btuOptions, String(value || "12000"));
  }

  function normalizeServiceDraft(draft) {
    const d = draft || {};
    const kind = serviceKind(d.service_kind || "clean");
    const ac = acType(d.ac_type);
    const btu = btuOption(d.btu);
    const machineCount = Math.max(1, Math.min(10, Number(d.machine_count || 1)));
    const service = {
      service_kind: kind.value,
      job_type: kind.job_type,
      ac_type: ac.value,
      btu: btu.btu,
      btu_value: btu.value,
      machine_count: machineCount,
      wash_variant: "",
      repair_variant: kind.repair_variant || "",
      needs_admin_estimate: !kind.bookable,
      admin_reason: kind.bookable ? "" : "บริการนี้ต้องติดต่อแอดมิน",
    };

    if (service.job_type === "ล้าง" && service.ac_type === "ผนัง") {
      service.wash_variant = find(washVariants, d.wash_variant || "ล้างธรรมดา").value;
    }
    if (service.job_type === "ซ่อม" && !service.repair_variant) {
      service.repair_variant = find(repairVariants, d.repair_variant || "ซ่อมทั่วไป").value;
    }
    if (!ac.priced) {
      service.needs_admin_estimate = true;
      service.admin_reason = "ยังไม่ทราบชนิดแอร์ กรุณาติดต่อแอดมิน";
    } else if (!btu.priced) {
      service.needs_admin_estimate = true;
      service.admin_reason = "ยังไม่ทราบ BTU กรุณาติดต่อแอดมิน";
    }
    return service;
  }

  function payloadFromServiceDraft(draft) {
    const service = normalizeServiceDraft(draft);
    if (service.needs_admin_estimate || service.job_type !== "ล้าง") return null;
    const payload = {
      job_type: "ล้าง",
      ac_type: service.ac_type,
      btu: service.btu,
      machine_count: service.machine_count,
    };
    if (service.wash_variant) payload.wash_variant = service.wash_variant;
    payload.services = [{ ...payload }];
    return payload;
  }

  function serviceLabel(service) {
    const s = service || {};
    const ac = acType(s.ac_type);
    const btu = btuOption(s.btu_value || s.btu);
    const parts = [
      "ล้าง",
      ac.label,
      btu.label,
      `${s.machine_count || 1} เครื่อง`,
      s.wash_variant ? find(washVariants, s.wash_variant).label : "",
    ].filter(Boolean);
    return parts.join(" / ");
  }

  const commerceCategories = [
    {
      id: "clean",
      action: "book",
      route: "scheduled",
      glyph: "sparkle",
      title: "ล้างแอร์",
      copy: "จองเองได้ เลือกวัน เวลา และคิวช่างว่างจริง",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: "12000", machine_count: 1 },
    },
    {
      id: "repair",
      action: "contact",
      glyph: "wrench",
      title: "ซ่อมแอร์",
      copy: "ติดต่อแอดมินเพื่อสอบถามอาการและจัดช่างเฉพาะทาง",
    },
    {
      id: "install",
      action: "contact",
      glyph: "shield",
      title: "ติดตั้งแอร์",
      copy: "ติดต่อแอดมินเพื่อประเมินหน้างานและราคา",
    },
    {
      id: "move",
      action: "contact",
      glyph: "pin",
      title: "ย้ายแอร์",
      copy: "ติดต่อแอดมินเพื่อประเมินระยะท่อและพื้นที่ติดตั้งใหม่",
    },
    {
      id: "inspect",
      action: "contact",
      glyph: "chat",
      title: "ตรวจอาการ / ปรึกษา",
      copy: "ส่งอาการให้แอดมินช่วยคัดกรองก่อนนัดช่าง",
    },
  ];

  const quickServices = [
    {
      id: "wall-normal",
      action: "book",
      route: "scheduled",
      title: "ล้างแอร์ผนัง",
      kicker: "ยอดนิยม",
      copy: "เหมาะกับบ้านและคอนโดทั่วไป",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: "12000", machine_count: 1 },
      priceable: true,
    },
    {
      id: "wall-premium",
      action: "book",
      route: "scheduled",
      title: "ล้างพรีเมียม",
      kicker: "ดูแลละเอียด",
      copy: "สำหรับแอร์ใช้งานหนักหรือต้องการล้างลึกขึ้น",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu: "12000", machine_count: 1 },
      priceable: true,
    },
    {
      id: "cassette",
      action: "book",
      route: "scheduled",
      title: "ล้างแอร์สี่ทิศทาง",
      kicker: "ร้านค้า / ออฟฟิศ",
      copy: "ระบบคำนวณราคาและเวลาจากข้อมูลจริง",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "สี่ทิศทาง", btu: "24000", machine_count: 1 },
      priceable: true,
    },
  ];

  const cleaningMethods = [
    { id: "method-normal", title: "ล้างปกติ", copy: "ดูแลตามรอบสำหรับแอร์ผนังที่ใช้งานปกติ", draft: quickServices[0].draft },
    { id: "method-premium", title: "ล้างพรีเมียม", copy: "เพิ่มความละเอียดสำหรับแอร์ใช้งานหนัก", draft: quickServices[1].draft },
    { id: "method-coil", title: "ล้างแบบแขวนคอยล์", copy: "ล้างละเอียดถึงชุดคอยล์และชิ้นส่วนภายใน", draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างแขวนคอยล์", btu: "12000", machine_count: 1 } },
    { id: "method-overhaul", title: "ตัดล้างใหญ่", copy: "งานล้างใหญ่สำหรับเครื่องสกปรกมาก", draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างแบบตัดล้าง", btu: "12000", machine_count: 1 } },
  ];

  function commerceItem(id) {
    return [...commerceCategories, ...quickServices, ...cleaningMethods].find((item) => item.id === id || item.title === id) || null;
  }

  function applyCommerceDraft(scope, item) {
    if (!item || item.action === "contact" || !item.draft) return false;
    root.state.updateDraft(scope, {
      ...item.draft,
      service_kind: "clean",
      job_type: "ล้าง",
      selectedSlot: null,
    });
    root.state.selectedService = { id: item.id || item.title || "", route: scope };
    if (scope === "scheduled") {
      root.state.setScheduledWizard({ step: 1, error: "" });
      root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
      root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "", query_key: "", loaded_at: "" });
      root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
    }
    return true;
  }

  root.services = {
    UNKNOWN_AC,
    UNKNOWN_BTU,
    serviceKinds,
    acTypes,
    bookableAcTypes,
    washVariants,
    repairVariants,
    btuOptions,
    bookableBtuOptions,
    machineCounts,
    primaryActions: [
      { route: "scheduled", glyph: "calendar", title: "จองล้างแอร์", copy: "เลือกวัน เวลา และคิวช่างว่างจริง" },
      { route: "tracking", glyph: "pin", title: "ติดตามงาน", copy: "ดูสถานะงานด้วย Booking Code" },
      { route: "profile", glyph: "phone", title: "ติดต่อ CWF", copy: "โทรหรือ LINE หาแอดมิน" },
    ],
    trustItems: [
      { glyph: "shield", title: "ช่างผ่านการทดสอบ", copy: "คัดกรองทักษะและมาตรฐานบริการก่อนรับงาน" },
      { glyph: "tag", title: "แจ้งราคาก่อนเริ่ม", copy: "ระบบแสดงราคาประมาณการก่อนส่งคำขอจอง" },
      { glyph: "sparkle", title: "รับประกันงานล้าง 30 วัน", copy: "ดูแลหลังงานตามเงื่อนไขบริการของ CWF" },
      { glyph: "pin", title: "ติดตามสถานะงานได้", copy: "ใช้ Booking Code ดูสถานะสำคัญของงาน" },
    ],
    commerceCategories,
    quickServices,
    cleaningMethods,
    commerceItem,
    applyCommerceDraft,
    normalizeServiceDraft,
    payloadFromServiceDraft,
    serviceLabel,
  };
})();
