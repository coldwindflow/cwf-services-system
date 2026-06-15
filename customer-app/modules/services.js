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
    normalizeServiceDraft,
    payloadFromServiceDraft,
    serviceLabel,
  };
})();
