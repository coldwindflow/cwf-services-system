(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const UNKNOWN_AC = "__unknown_ac__";
  const UNKNOWN_BTU = "__unknown_btu__";

  const serviceKinds = [
    { value: "clean", label: "ล้างแอร์", short: "ล้าง", job_type: "ล้าง", copy: "เลือกชนิดแอร์และรูปแบบการล้าง" },
    { value: "repair", label: "ซ่อมแอร์", short: "ซ่อม", job_type: "ซ่อม", repair_variant: "ซ่อมทั่วไป", copy: "ให้ทีมประเมินอาการและแนวทางซ่อม" },
    { value: "install", label: "ติดตั้งแอร์", short: "ติดตั้ง", job_type: "ติดตั้ง", copy: "ให้ทีมช่วยประเมินหน้างานและคิวติดตั้ง" },
    { value: "inspect", label: "ตรวจอาการ / ปรึกษา", short: "ตรวจอาการ", job_type: "ซ่อม", repair_variant: "ตรวจอาการ", copy: "ส่งรายละเอียดเพื่อให้ทีมช่วยดูอาการก่อน" },
  ];

  const acTypes = [
    { value: "ผนัง", label: "แอร์ผนัง", copy: "เหมาะกับบ้านและคอนโดทั่วไป", priced: true },
    { value: "สี่ทิศทาง", label: "แอร์สี่ทิศทาง", copy: "แอร์ฝังคาสเซ็ตในสำนักงาน/ร้านค้า", priced: true },
    { value: "แขวน", label: "แอร์แขวน", copy: "แอร์แขวนเพดานหรือพื้นที่ใหญ่", priced: true },
    { value: "เปลือยใต้ฝ้า", label: "แอร์เปลือยใต้ฝ้า", copy: "งานใต้ฝ้าที่ต้องเข้าถึงตัวเครื่อง", priced: true },
    { value: UNKNOWN_AC, label: "อื่น ๆ / ไม่แน่ใจ", copy: "ให้แอดมินช่วยประเมินชนิดแอร์", priced: false },
  ];

  const washVariants = [
    { value: "ล้างธรรมดา", label: "ล้างปกติ", copy: "ล้างดูแลตามรอบปกติ" },
    { value: "ล้างพรีเมียม", label: "ล้างพรีเมียม", copy: "ละเอียดขึ้น เหมาะกับแอร์ใช้งานหนัก" },
    { value: "ล้างแขวนคอยล์", label: "ล้างแบบแขวนคอยล์", copy: "ดูแลคอยล์โดยไม่ถอดใหญ่" },
    { value: "ล้างแบบตัดล้าง", label: "ตัดล้างใหญ่", copy: "งานล้างใหญ่เมื่อสกปรกมาก" },
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
    const kind = serviceKind(d.service_kind || (d.job_type === "ซ่อม" && d.repair_variant === "ตรวจอาการ" ? "inspect" : ""));
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
      needs_admin_estimate: false,
      admin_reason: "",
    };

    if (service.job_type === "ล้าง" && service.ac_type === "ผนัง") {
      service.wash_variant = find(washVariants, d.wash_variant || "ล้างธรรมดา").value;
    }
    if (service.job_type === "ซ่อม" && !service.repair_variant) {
      service.repair_variant = find(repairVariants, d.repair_variant || "ซ่อมทั่วไป").value;
    }
    if (!ac.priced) {
      service.needs_admin_estimate = true;
      service.admin_reason = "ยังไม่ทราบชนิดแอร์";
    } else if (!btu.priced) {
      service.needs_admin_estimate = true;
      service.admin_reason = "ยังไม่ทราบ BTU";
    } else if (service.job_type !== "ล้าง") {
      service.needs_admin_estimate = true;
      service.admin_reason = "งานนี้ต้องให้แอดมินประเมินราคา";
    }
    return service;
  }

  function payloadFromServiceDraft(draft) {
    const service = normalizeServiceDraft(draft);
    if (service.needs_admin_estimate) return null;
    const payload = {
      job_type: service.job_type,
      ac_type: service.ac_type,
      btu: service.btu,
      machine_count: service.machine_count,
    };
    if (service.wash_variant) payload.wash_variant = service.wash_variant;
    if (service.repair_variant) payload.repair_variant = service.repair_variant;
    payload.services = [{ ...payload }];
    return payload;
  }

  function serviceLabel(service) {
    const s = service || {};
    const kind = serviceKind(s.service_kind);
    const ac = acType(s.ac_type);
    const btu = btuOption(s.btu_value || s.btu);
    const parts = [
      kind.short,
      ac.label,
      btu.label,
      `${s.machine_count || 1} เครื่อง`,
      s.wash_variant ? find(washVariants, s.wash_variant).label : "",
      s.repair_variant || "",
    ].filter(Boolean);
    return parts.join(" / ");
  }

  const commerceCategories = [
    {
      id: "clean",
      route: "scheduled",
      glyph: "sparkle",
      title: "ล้างแอร์",
      copy: "เลือกวิธีล้างและดูราคาประเมินจากระบบก่อนจอง",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: "12000", machine_count: 1 },
    },
    {
      id: "repair",
      route: "urgent",
      glyph: "tool",
      title: "ซ่อม / ตรวจอาการ",
      copy: "ส่งอาการให้ทีมช่วยประเมินและจัดคิวที่เหมาะสม",
      draft: { service_kind: "inspect", job_type: "ซ่อม", ac_type: UNKNOWN_AC, repair_variant: "ตรวจอาการ", btu: UNKNOWN_BTU, machine_count: 1 },
    },
    {
      id: "install",
      route: "scheduled",
      glyph: "shield",
      title: "ติดตั้งแอร์",
      copy: "ให้ทีมช่วยประเมินหน้างานและคิวติดตั้ง",
      draft: { service_kind: "install", job_type: "ติดตั้ง", ac_type: UNKNOWN_AC, btu: UNKNOWN_BTU, machine_count: 1 },
    },
    {
      id: "care",
      route: "scheduled",
      glyph: "tag",
      title: "ดูแลตามรอบ",
      copy: "เริ่มจากล้างมาตรฐาน แล้วเลือกจำนวนเครื่องในขั้นตอนจอง",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: "12000", machine_count: 2 },
    },
  ];

  const quickServices = [
    {
      id: "wall-normal",
      route: "scheduled",
      title: "ล้างแอร์ผนัง",
      kicker: "ยอดนิยม",
      copy: "เหมาะกับบ้านและคอนโดทั่วไป",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างธรรมดา", btu: "12000", machine_count: 1 },
      priceable: true,
    },
    {
      id: "wall-premium",
      route: "scheduled",
      title: "ล้างพรีเมียม",
      kicker: "ดูแลลึกขึ้น",
      copy: "สำหรับแอร์ใช้งานหนักหรืออยากล้างละเอียดขึ้น",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างพรีเมียม", btu: "12000", machine_count: 1 },
      priceable: true,
    },
    {
      id: "cassette",
      route: "scheduled",
      title: "ล้างแอร์สี่ทิศทาง",
      kicker: "ร้านค้า / ออฟฟิศ",
      copy: "เลือกชนิดแอร์ไว้ให้ แล้วระบบประเมินจากข้อมูลจริง",
      draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "สี่ทิศทาง", btu: "24000", machine_count: 1 },
      priceable: true,
    },
    {
      id: "urgent-inspect",
      route: "urgent",
      title: "แอร์ไม่เย็น / มีอาการ",
      kicker: "คิวด่วน",
      copy: "ส่งคำขอให้ช่างพาร์ทเนอร์หรือแอดมินช่วยตรวจสอบ ไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน",
      draft: { service_kind: "inspect", job_type: "ซ่อม", ac_type: UNKNOWN_AC, repair_variant: "ตรวจอาการ", btu: UNKNOWN_BTU, machine_count: 1 },
      priceable: false,
    },
  ];

  const cleaningMethods = [
    { title: "ล้างปกติ", copy: "ดูแลตามรอบ ใช้กับแอร์ผนังที่อาการปกติ", draft: quickServices[0].draft },
    { title: "ล้างพรีเมียม", copy: "เพิ่มความละเอียดสำหรับแอร์ใช้งานหนัก", draft: quickServices[1].draft },
    { title: "ล้างแบบแขวนคอยล์", copy: "ลดการถอดใหญ่ เหมาะกับงานที่ต้องดูหน้างานประกอบ", draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างแขวนคอยล์", btu: "12000", machine_count: 1 } },
    { title: "ตัดล้างใหญ่", copy: "งานล้างหนักเมื่อสกปรกมาก ให้ทีมประเมินก่อนยืนยัน", draft: { service_kind: "clean", job_type: "ล้าง", ac_type: "ผนัง", wash_variant: "ล้างแบบตัดล้าง", btu: "12000", machine_count: 1 } },
  ];

  function commerceItem(id) {
    return [...commerceCategories, ...quickServices, ...cleaningMethods].find((item) => item.id === id || item.title === id) || null;
  }

  function applyCommerceDraft(scope, item) {
    const target = item && item.draft ? item.draft : {};
    root.state.updateDraft(scope, {
      ...target,
      selectedSlot: null,
    });
    root.state.selectedService = { id: item.id || item.title || "", route: scope };
    if (scope === "scheduled") {
      root.state.setScheduledPreview("pricing", { status: "idle", data: null, error: "" });
      root.state.setScheduledPreview("availability", { status: "idle", data: null, error: "" });
      root.state.setScheduledSubmit({ status: "idle", error: "", result: null });
    }
    if (scope === "urgent") {
      root.state.setUrgentFlow({ step: "form", status: "idle", error: "", result: null });
    }
  }

  root.services = {
    UNKNOWN_AC,
    UNKNOWN_BTU,
    serviceKinds,
    acTypes,
    washVariants,
    repairVariants,
    btuOptions,
    machineCounts,
    primaryActions: [
      { route: "booking", glyph: "calendar", title: "จองคิวบริการ", copy: "เลือกจองล่วงหน้าหรือคิวด่วนตามความเร่งด่วน" },
      { route: "tracking", glyph: "pin", title: "ติดตามงาน", copy: "ดูสถานะคิว ช่างที่รับงาน และข้อมูลหลังบริการ" },
      { route: "profile", glyph: "phone", title: "โทร / LINE หา CWF", copy: "ติดต่อทีมดูแลลูกค้าหรือดูข้อมูลบัญชีของคุณ" },
    ],
    trustItems: [
      { glyph: "shield", title: "ช่างผ่านการทดสอบ", copy: "คัดกรองทักษะและมาตรฐานบริการก่อนรับงาน" },
      { glyph: "tag", title: "แจ้งราคาก่อนเริ่ม", copy: "ลูกค้าเห็นราคาประมาณการก่อนยืนยันทุกครั้ง" },
      { glyph: "sparkle", title: "รับประกันงานล้าง 30 วัน", copy: "ดูแลหลังงานตามเงื่อนไขบริการของ CWF" },
      { glyph: "pin", title: "ติดตามสถานะงานได้", copy: "เห็นสถานะสำคัญตั้งแต่จองจนจบงาน" },
    ],
    scheduledSteps: [
      { title: "เลือกบริการ / อาการ", copy: "เลือกประเภทงานและปัญหาหลักของแอร์" },
      { title: "รายละเอียดแอร์", copy: "ระบุชนิดแอร์ BTU จำนวนเครื่อง และวิธีล้างถ้ามี" },
      { title: "ที่อยู่ / แผนที่", copy: "เตรียมที่อยู่หน้างานและลิงก์แผนที่ให้ช่างเดินทางถูกต้อง" },
      { title: "เลือกวันและเวลา", copy: "เลือกช่วงเวลาที่สะดวกจากคิวช่างที่ว่าง" },
      { title: "ประเมินราคา", copy: "ดูราคาประมาณการจากระบบก่อนยืนยันการจอง" },
      { title: "ตรวจสอบก่อนส่ง", copy: "ทบทวนรายละเอียดทั้งหมดก่อนส่งคำขอจอง" },
    ],
    urgentSteps: [
      { title: "กรอกข้อมูลงานด่วน", copy: "ใส่ชื่อ เบอร์ ที่อยู่ ประเภทบริการ และอาการที่ต้องการให้ช่างช่วย" },
      { title: "ตรวจสอบคำขอ", copy: "ทบทวนรายละเอียดทั้งหมดก่อนส่งคำขอคิวด่วน" },
      { title: "ส่งคำขอคิวด่วน", copy: "ส่งให้พาร์ทเนอร์ช่างที่พร้อมรับงานในพื้นที่กดรับเอง" },
      { title: "รอช่างพาร์ทเนอร์กดรับ", copy: "ช่างอาจกดรับหรือปฏิเสธงานได้ตามความพร้อม" },
      { title: "แอดมินช่วยต่อ", copy: "ถ้าไม่มีช่างรับ แอดมินจะช่วยจัดคิวหรือเปลี่ยนเป็นจองล่วงหน้า" },
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
