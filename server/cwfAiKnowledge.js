const BANGKOK_TZ = "Asia/Bangkok";
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bangkokParts(value) {
  const d = toDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d).reduce((acc, item) => {
    if (item.type !== "literal") acc[item.type] = item.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function bangkokNowParts() {
  return bangkokParts(new Date());
}

function addDaysToIsoDate(dateIso, days) {
  const [y, m, d] = String(dateIso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const utc = new Date(Date.UTC(y, m - 1, d + Number(days || 0), 12, 0, 0));
  return utc.toISOString().slice(0, 10);
}

function compareIsoDate(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function formatThaiDateTime(value, opts = {}) {
  const p = bangkokParts(value);
  if (!p) return "";
  const today = opts.todayIso || bangkokNowParts()?.date;
  const tomorrow = today ? addDaysToIsoDate(today, 1) : "";
  let dateLabel = "";
  if (p.date === today) dateLabel = "วันนี้";
  else if (p.date === tomorrow) dateLabel = "พรุ่งนี้";
  else dateLabel = `${p.day} ${THAI_MONTHS[p.month - 1]} ${p.year + 543}`;
  return `${dateLabel} เวลา ${p.time} น.`;
}

function formatThaiTime(value) {
  const p = bangkokParts(value);
  return p ? `${p.time} น.` : "";
}

function getThaiTodayRange() {
  const today = bangkokNowParts()?.date;
  return { today, tomorrow: addDaysToIsoDate(today, 1), day_after_tomorrow: addDaysToIsoDate(today, 2) };
}

function parseThaiRelativeDate(text) {
  const q = String(text || "").toLowerCase();
  const range = getThaiTodayRange();
  const explicit = q.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]);
    let year = explicit[3] ? Number(explicit[3]) : bangkokNowParts().year;
    if (year > 2400) year -= 543;
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (q.includes("มะรืน") || q.includes("day after tomorrow")) return range.day_after_tomorrow;
  if (q.includes("พรุ่งนี้") || q.includes("tomorrow")) return range.tomorrow;
  return range.today;
}

function parseThaiTimePhrase(text) {
  const q = String(text || "").toLowerCase();
  const hm = q.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    return { kind: "point", hour, minute, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} น.` };
  }
  const hourText = q.match(/(\d{1,2})\s*(โมง|นาฬิกา)/);
  if (hourText) {
    let hour = Number(hourText[1]);
    if (q.includes("บ่าย") && hour >= 1 && hour <= 6) hour += 12;
    return { kind: "point", hour, minute: 0, label: `${String(hour).padStart(2, "0")}:00 น.` };
  }
  if (q.includes("บ่ายโมง")) return { kind: "point", hour: 13, minute: 0, label: "13:00 น." };
  if (q.includes("ช่วงเช้า") || q.includes("ตอนเช้า")) return { kind: "range", start: 9, end: 12, label: "ช่วงเช้า" };
  if (q.includes("ช่วงบ่าย") || q.includes("ตอนบ่าย") || q.includes("บ่าย")) return { kind: "range", start: 13, end: 17, label: "ช่วงบ่าย" };
  if (q.includes("เย็น")) return { kind: "range", start: 16, end: 18, label: "ช่วงเย็น" };
  return null;
}

function serviceKnowledge() {
  return {
    current: true,
    pricing_priority: "Use this current CWF knowledge before old chat history.",
    sales_tone: [
      "ตอบสั้นแบบแอดมิน LINE จริง 1-4 บรรทัด",
      "ถ้าถามราคา ให้ตอบราคาก่อน แล้วถามเรื่องนัดหมายหรือพื้นที่อย่างเดียว",
      "ถ้าลูกค้าบอกว่าแพง ให้รับทราบสุภาพ แล้วเสนอทางเลือกประหยัดโดยไม่เถียง",
      "ห้ามใช้ราคาจากแชทเก่าถ้าขัดกับราคาปัจจุบันนี้",
    ],
    services: [
      {
        name: "ล้างปกติ",
        fit: "เหมาะกับแอร์ที่ใช้ตามรอบและยังไม่สกปรกมาก",
        includes: ["ตรวจเช็กอาการเบื้องต้น", "ล้างฟิลเตอร์", "ล้างคอยล์เย็น", "ล้างคอยล์ร้อน", "ฉีดอัดท่อน้ำทิ้ง", "รับประกันงานล้าง 30 วัน"],
      },
      {
        name: "ล้างพรีเมียม",
        fit: "เหมาะกับแอร์ฝุ่นสะสมมาก ลมออกเบา ไม่ค่อยเย็น หรือไม่ได้ล้างมานาน",
        includes: ["ตรวจเช็กอาการเบื้องต้น", "ล้างคอยล์เย็นละเอียด", "ล้างคอยล์ร้อนละเอียด", "ถอดรางน้ำทิ้งล้าง", "ถอดโพร่งกระรอกล้าง", "ฉีดอัดท่อน้ำทิ้ง", "รับประกันงานล้าง 30 วัน"],
      },
      {
        name: "ล้างแบบแขวนคอยล์",
        fit: "เหมาะกับแอร์น้ำหยด เสียงดัง หรืออยากล้างเชิงลึก",
        includes: ["ถอดแผงไฟและถาดหลังออก", "เหลือรังผึ้งห้อยกับผนังเพื่อทำความสะอาดลึก", "ใช้น้ำยาล้างสูตรพิเศษ", "รับประกันงานล้าง 30 วัน"],
      },
      {
        name: "ตัดล้างใหญ่",
        fit: "เหมาะกับแอร์คราบหนัก มีเชื้อรา หรือไม่ได้ล้างมานาน",
        includes: ["ถอดเครื่องออกมาล้างเต็มระบบ", "ทำความสะอาดลึกถึงจุดที่การล้างทั่วไปเข้าไม่ถึง", "ใช้น้ำยาล้างสูตรพิเศษ", "รับประกันงานล้าง 30 วัน"],
      },
    ],
    prices: {
      wall_upto_12000_btu: { normal: 550, premium: 790, coil_hang: 1290, deep: 1850 },
      wall_18000_btu_up: { normal: 690, premium: 990, coil_hang: 1550, deep: 2150 },
      other: { check: 700, cassette: 1500, hanging: 1200, concealed: 1200 },
    },
    promotion: "โปรคิวว่างช่วงหน้าฝน สำหรับลูกค้าใกล้พระโขนงและย่านใกล้เคียง",
    trust: ["ช่างผ่านการทดสอบและมีใบรับรองจากกรมพัฒนาฝีมือแรงงาน", "รับประกันงานล้าง 30 วัน เฉพาะอาการที่เกิดจากการบริการ", "เหมาะกับแอร์มีกลิ่นอับ น้ำหยด ลมไม่เย็น หรือไม่ได้ล้างมานาน"],
    approved_reply_style: [
      {
        intent: "price_premium_12000",
        reply: "ล้างพรีเมียมแอร์ผนังไม่เกิน 12,000 BTU ราคา 790 บาท/เครื่องค่ะ\nเหมาะกับแอร์ที่ฝุ่นเยอะ ลมเบา หรือไม่ได้ล้างมานานนะคะ\nสะดวกให้ช่างเข้าวันไหนคะ",
      },
      {
        intent: "price_objection",
        reply: "เข้าใจค่ะ ถ้าต้องการประหยัดงบ แนะนำเริ่มจากล้างปกติ 550 บาทก่อนได้ค่ะ\nแต่ถ้าแอร์ฝุ่นเยอะ มีกลิ่น หรือน้ำหยด พรีเมียมจะเหมาะกว่านะคะ",
      },
      {
        intent: "queue_request",
        reply: "ขอเช็กคิวช่างให้ก่อนนะคะ\nรบกวนแจ้งพื้นที่หน้างานกับจำนวนเครื่องให้หน่อยค่ะ",
      },
      {
        intent: "not_cold",
        reply: "เบื้องต้นแนะนำให้ช่างเข้าตรวจเช็กก่อนค่ะ ค่าตรวจเช็ก 700 บาท\nถ้าต้องซ่อมหรือเติมน้ำยา ช่างจะแจ้งราคาก่อนเริ่มงานนะคะ",
      },
    ],
  };
}

function estimateJobDurationMinutes(job) {
  const explicit = Number(job?.duration_min || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${job?.job_type || ""} ${job?.item_summary || ""}`.toLowerCase();
  const qtyNumbers = Array.from(text.matchAll(/\b(\d{1,2})\b/g)).map((m) => Number(m[1])).filter((n) => n > 0 && n < 30);
  const units = qtyNumbers.length ? Math.max(...qtyNumbers) : 1;
  const many = units >= 2;
  if (/ตัด|deep|disassembly/.test(text)) return many ? units * 120 : 180;
  if (/แขวนคอยล์|coil/.test(text)) return many ? units * 90 : 120;
  if (/สี่ทิศ|cassette|ceiling|suspended|concealed|ฝัง/.test(text)) return many ? units * 90 : 120;
  if (/premium|พรีเมียม/.test(text)) return many ? units * 50 : 80;
  return many ? units * 40 : 60;
}

function minutesFromBangkokJob(job) {
  const p = bangkokParts(job?.appointment_datetime);
  if (!p) return null;
  return p.hour * 60 + p.minute;
}

function parseTechnicianNames(job) {
  const names = new Set();
  String(job?.technician_username || "").split(/[,/|]/).map((s) => s.trim()).filter(Boolean).forEach((s) => names.add(s));
  String(job?.technician_team || "").split(/[,/|]/).map((s) => s.trim()).filter(Boolean).forEach((s) => names.add(s));
  return Array.from(names);
}

function analyzeAvailability({ question, targetDate, jobs, technicians }) {
  const time = parseThaiTimePhrase(question);
  const targetLabel = targetDate || parseThaiRelativeDate(question);
  const techList = Array.isArray(technicians) ? technicians.map((t) => t.username || t).filter(Boolean) : [];
  const intervals = [];
  const missing = [];
  for (const job of jobs || []) {
    const start = minutesFromBangkokJob(job);
    if (start == null) continue;
    const baseDuration = estimateJobDurationMinutes(job);
    const duration = baseDuration + 30;
    const techs = parseTechnicianNames(job);
    if (!techs.length) missing.push(`งาน ${job.booking_code || job.job_id} ไม่มีข้อมูลช่างที่รับงาน`);
    intervals.push({
      job_id: job.job_id,
      booking_code: job.booking_code,
      time: job.appointment_display || formatThaiDateTime(job.appointment_datetime),
      start_minute: start,
      end_minute: start + duration,
      duration_min: duration,
      technicians: techs,
      job_type: job.job_type || "",
      zone: job.job_zone || "",
    });
  }
  const assignedTechs = new Set(intervals.flatMap((i) => i.technicians));
  const hasTechnicianData = techList.length > 0 || assignedTechs.size > 0;
  const requestedStart = time?.kind === "point" ? (time.hour * 60 + time.minute) : null;
  const rangeStart = time?.kind === "range" ? time.start * 60 : (requestedStart ?? 9 * 60);
  const rangeEnd = time?.kind === "range" ? time.end * 60 : (requestedStart != null ? requestedStart + 60 : 17 * 60);
  const conflicts = intervals.filter((i) => i.start_minute < rangeEnd && i.end_minute > rangeStart);
  const occupiedTechs = new Set(conflicts.flatMap((i) => i.technicians));
  const availableTechnicians = hasTechnicianData ? techList.filter((name) => !occupiedTechs.has(name)) : [];
  const candidateSlots = [];
  for (let minute = 9 * 60; minute <= 17 * 60; minute += 60) {
    const slotConflicts = intervals.filter((i) => i.start_minute < minute + 60 && i.end_minute > minute);
    candidateSlots.push({
      time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:00 น.`,
      conflict_count: slotConflicts.length,
      busy_technicians: Array.from(new Set(slotConflicts.flatMap((i) => i.technicians))),
    });
  }
  const bestSlots = candidateSlots.filter((s) => s.conflict_count === Math.min(...candidateSlots.map((x) => x.conflict_count))).slice(0, 4);
  return {
    target_date: targetLabel,
    target_time: time?.label || null,
    mode: hasTechnicianData ? "technician_schedule" : "job_schedule_only",
    can_confirm_exact_technician: hasTechnicianData,
    jobs_on_date: (jobs || []).length,
    occupied_intervals: intervals,
    conflicts_at_requested_time: conflicts,
    available_technicians_at_requested_time: availableTechnicians,
    nearest_low_conflict_slots: bestSlots,
    missing_data: missing,
    deterministic_note: hasTechnicianData
      ? "มีข้อมูลช่างบางส่วน ใช้ผลคำนวณนี้เป็นฐานคำตอบ และยังต้องเช็กพื้นที่/ประเภทงานก่อนยืนยันกับลูกค้า"
      : "ยังไม่มีข้อมูลช่างครบในตารางงาน ใช้ได้เฉพาะการดูคิวงานรวม ห้ามตอบว่าว่างแบบยืนยัน",
  };
}

function looksLikeAvailabilityQuestion(text) {
  const q = String(text || "");
  return /(ว่าง|คิว|ช่าง|รับงานเพิ่ม|ชนคิว|ช่วงบ่าย|ช่วงเช้า|เย็น|available|queue)/i.test(q);
}

function routeOfficeIntent(text) {
  const q = String(text || "").toLowerCase();
  const agents = new Set();
  if (/(ราคา|แพง|ขาย|ตอบลูกค้า|ล้าง|btu|โปร|ปิดการขาย)/i.test(q)) agents.add("Sales AI");
  if (/(คิว|วันนี้|พรุ่งนี้|ช่าง|งาน|นัด|ยังไม่จ่าย|ยังไม่ปิด|สถานะ|ว่าง)/i.test(q)) agents.add("Admin AI");
  if (/(เสี่ยง|หน้างาน|ล่าช้า|route|ปฏิบัติการ|ชนคิว)/i.test(q)) agents.add("Ops AI");
  if (/(ads|โฆษณา|keyword|facebook|google|tiktok)/i.test(q)) agents.add("Ads AI");
  if (/(โพสต์|แคปชั่น|content|reels|script|รีวิว)/i.test(q)) agents.add("Content AI");
  if (/(bug|deploy|api|database|codex|ระบบ|cache|service worker)/i.test(q)) agents.add("Dev AI");
  if (!agents.size) agents.add("Admin AI");
  return Array.from(agents);
}

function sanitizeChatText(value) {
  return String(value || "")
    .replace(/\b0\d{8,9}\b/g, "[phone]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-Z]{2,5}[-_]?\d{3,}\b/gi, "[code]")
    .replace(/(?:condo|building|room)\s*[\w .-]{1,40}/gi, "[location]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function formatBangkokChatTime(value) {
  return formatThaiDateTime(value);
}

function detectCustomerIntent(text) {
  const q = String(text || "").toLowerCase();
  if (/not cold/.test(q)) return "air_not_cold";
  if (/water dripping|dripping|leak/.test(q)) return "water_dripping";
  if (/smell|mold/.test(q)) return "smell";
  if (/on the way|arrived/.test(q)) return "technician_on_the_way";
  if (/schedule|available|queue/.test(q)) return "schedule_inquiry";
  if (/แพง|ลด|ส่วนลด/.test(q)) return "price_objection";
  if (/ราคา|เท่าไหร่|กี่บาท|btu|ล้าง/.test(q)) return "price_inquiry";
  if (/จอง|นัด|สะดวก|พรุ่งนี้|วันนี้|คิว|ว่าง/.test(q)) return "booking";
  if (/ด่วน|วันนี้|ตอนนี้|เร็ว/.test(q)) return "urgent_job";
  if (/ร้องเรียน|ไม่พอใจ|เสียหาย|แย่|ช้า|ยังไม่มา/.test(q)) return "complaint";
  if (/โอน|จ่าย|ชำระ|สลิป|ใบเสร็จ|receipt|payment/.test(q)) return "payment";
  if (/ติดตาม|เรียบร้อย|หลังบริการ|ขอบคุณ/.test(q)) return "follow_up";
  return "general";
}

function deriveConversationStatus({ latestText, hasInboundLatest, linkedJob }) {
  const intent = detectCustomerIntent(latestText);
  if (linkedJob?.finished_at) return "job_done";
  if (linkedJob?.job_id) return "booked";
  if (intent === "payment") return "follow_up";
  if (intent === "booking") return hasInboundLatest ? "checking_schedule" : "booking_pending";
  if (intent === "price_inquiry" || intent === "price_objection") return hasInboundLatest ? "needs_reply" : "quoted";
  if (intent === "complaint") return "needs_reply";
  return hasInboundLatest ? "unread" : "new";
}

function detectPriorityFlags({ latestText, lastMessageAt, isForeign }) {
  const q = String(latestText || "").toLowerCase();
  const flags = [];
  if (/ด่วน|วันนี้|ตอนนี้|เร็ว/.test(q)) flags.push("urgent_today");
  if (/ราคา|เท่าไหร่|กี่บาท|btu/.test(q)) flags.push("customer_asking_price");
  if (/จอง|นัด|ตกลง|เอา|พร้อม/.test(q)) flags.push("customer_ready_to_book");
  if (/ร้องเรียน|ไม่พอใจ|เสียหาย|แย่|ช้า|ยังไม่มา/.test(q)) flags.push("complaint");
  if (/โอน|จ่าย|ชำระ|สลิป|ใบเสร็จ|receipt|payment/.test(q)) flags.push("payment_receipt");
  if (isForeign) flags.push("foreign_customer");
  if (/ช่าง.*ช้า|ยังไม่มา|เลื่อน|delay/.test(q)) flags.push("technician_delay");
  const d = toDate(lastMessageAt);
  if (d && Date.now() - d.getTime() > 60 * 60 * 1000) flags.push("customer_waiting_too_long");
  return flags;
}

function extractCustomerContextFromMessages(messages, linkedJobs = []) {
  const text = (messages || []).map((m) => m.message_text || "").join("\n");
  const phone = (text.match(/0\d[\d\s.-]{7,12}\d/) || [])[0] || "";
  const btu = (text.match(/(\d{4,5})\s*BTU/i) || [])[1] || "";
  const units = (text.match(/(\d{1,2})\s*(เครื่อง|ตัว)/) || [])[1] || "";
  const quoted = (text.match(/(\d{3,5})\s*บาท/) || [])[1] || "";
  const booking = (text.match(/\b([A-Z]{2,5}[-_]?\d{3,})\b/i) || [])[1] || "";
  const area = (text.match(/(?:แถว|ย่าน|อยู่|ที่)\s*([ก-๙A-Za-z0-9\s.-]{2,40})/) || [])[1] || "";
  const service = /พรีเมียม/.test(text) ? "ล้างพรีเมียม"
    : /แขวนคอยล์/.test(text) ? "ล้างแบบแขวนคอยล์"
    : /ตัดล้าง|ล้างใหญ่/.test(text) ? "ตัดล้างใหญ่"
    : /ล้าง/.test(text) ? "ล้างปกติ" : "";
  const latestJob = linkedJobs[0] || null;
  const missing = [];
  if (!phone && !latestJob?.customer_phone) missing.push("เบอร์ลูกค้า");
  if (!area && !latestJob?.job_zone && !latestJob?.address_text) missing.push("พื้นที่/ที่อยู่");
  if (!service && !latestJob?.job_type) missing.push("ประเภทงาน");
  if (!units) missing.push("จำนวนเครื่อง");
  return {
    customer_name: latestJob?.customer_name || "",
    phone: phone || latestJob?.customer_phone || "",
    area: area || latestJob?.job_zone || latestJob?.address_text || "",
    linked_job_id: latestJob?.job_id || null,
    service_type: service || latestJob?.job_type || "",
    units,
    btu,
    quoted_price: quoted || (latestJob?.job_price ? String(latestJob.job_price) : ""),
    requested_datetime: "",
    current_status: "",
    booking_code: booking || latestJob?.booking_code || "",
    missing_information: missing,
  };
}

function filterReplyExample(customerMessage, adminReply) {
  const c = sanitizeChatText(customerMessage);
  const a = sanitizeChatText(adminReply);
  if (c.length < 5 || a.length < 5 || a.length > 700) return null;
  if (/โอน|สลิป|เลขบัญชี|ภายใน|รหัส|password|token/i.test(a)) return null;
  return { customer_message: c, admin_reply: a, strength: "weak_style_reference" };
}

module.exports = {
  BANGKOK_TZ,
  formatThaiDateTime,
  formatThaiTime,
  getThaiTodayRange,
  parseThaiRelativeDate,
  parseThaiTimePhrase,
  serviceKnowledge,
  estimateJobDurationMinutes,
  analyzeAvailability,
  looksLikeAvailabilityQuestion,
  routeOfficeIntent,
  sanitizeChatText,
  filterReplyExample,
  formatBangkokChatTime,
  detectCustomerIntent,
  deriveConversationStatus,
  detectPriorityFlags,
  extractCustomerContextFromMessages,
};
