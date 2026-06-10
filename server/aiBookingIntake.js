const BANGKOK_TZ = "Asia/Bangkok";

const KNOWN_AREAS = [
  "พระโขนง", "บางจาก", "อ่อนนุช", "ปุณณวิถี", "อุดมสุข", "บางนา", "แบริ่ง", "สำโรง", "ลาซาล",
  "สุขุมวิท", "เอกมัย", "ทองหล่อ", "พร้อมพงษ์", "คลองเตย", "พระราม 4", "พัฒนาการ", "สวนหลวง",
  "ศรีนครินทร์", "ซีคอน", "พระราม 3", "ยานนาวา", "บางคอแหลม", "สาธุประดิษฐ์", "เจริญกรุง",
  "ช่องนนทรี", "บางพลี", "ลาดกระบัง", "เทพารักษ์", "สาทร", "พระราม 9", "รัชดา", "ดินแดง", "ห้วยขวาง"
];

const CLOSED_STATUSES = new Set(["CLOSED", "JOB_CREATED"]);
const OPEN_STATUSES = ["READY_TO_CREATE_JOB", "NEED_INFO", "ADMIN_REQUIRED", "CUSTOMER_INTERESTED"];

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 120)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((x) => cleanText(x, 120)).filter(Boolean);
    } catch (_) {}
  }
  return [];
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return {};
}

function extractPhone(text) {
  const s = String(text || "");
  const matches = s.match(/(?:\+?66|0)[\d\s\-.]{7,14}\d/g) || [];
  for (const raw of matches) {
    const digits = onlyDigits(raw).replace(/^66/, "0");
    if (digits.length >= 9 && digits.length <= 10) return digits;
  }
  return "";
}

function extractName(text) {
  const s = cleanText(text, 1200);
  const patterns = [
    /(?:ชื่อ|ลูกค้าชื่อ|name)\s*[:：-]?\s*([^,\n\r]{2,40})/i,
    /(?:ผม|ฉัน|หนู|ดิฉัน)\s*ชื่อ\s*([^,\n\r]{2,40})/i,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m && m[1]) {
      return cleanText(m[1].replace(/(เบอร์|โทร|อยู่|ที่อยู่|ล้าง|ซ่อม|ติดตั้ง|ตรวจ|คอนโด|บ้าน|พรุ่งนี้|วันนี้).*$/i, ""), 80);
    }
  }
  return "";
}

function extractServiceType(text) {
  const s = String(text || "").toLowerCase();
  if (/(ติดตั้ง|install)/i.test(s)) return "ติดตั้งแอร์";
  if (/(ซ่อม|รั่ว|ไม่เย็น|น้ำหยด|repair|leak)/i.test(s)) return "ซ่อมแอร์";
  if (/(ตรวจเช็ค|ตรวจเช็ก|เช็ค|check)/i.test(s)) return "ตรวจเช็คแอร์";
  if (/(ล้าง|clean|cleaning)/i.test(s)) return "ล้างแอร์";
  return "";
}

function extractUnitCount(text) {
  const s = String(text || "");
  const m = s.match(/(\d{1,2})\s*(?:เครื่อง|ตัว|unit|units)/i);
  if (m) return clampInt(m[1], 1, 99, null);
  const words = [
    [/(หนึ่ง|1)\s*(?:เครื่อง|ตัว)/, 1],
    [/(สอง|2)\s*(?:เครื่อง|ตัว)/, 2],
    [/(สาม|3)\s*(?:เครื่อง|ตัว)/, 3],
    [/(สี่|4)\s*(?:เครื่อง|ตัว)/, 4],
    [/(ห้า|5)\s*(?:เครื่อง|ตัว)/, 5],
  ];
  for (const [re, n] of words) if (re.test(s)) return n;
  return null;
}

function extractBtu(text) {
  const s = String(text || "");
  const explicit = s.match(/(9,?000|12,?000|13,?000|15,?000|18,?000|24,?000|30,?000|36,?000|38,?000|40,?000|48,?000|60,?000)\s*(?:btu|บีทียู)?/i);
  if (explicit) return `${Number(String(explicit[1]).replace(/,/g, "")).toLocaleString("en-US")} BTU`;
  const short = s.match(/\b(9|12|13|15|18|24|30|36|38|40|48|60)\s*(?:k|พัน|000)\s*(?:btu|บีทียู)?\b/i);
  if (short) return `${Number(short[1]) * 1000 .toLocaleString ? (Number(short[1]) * 1000).toLocaleString("en-US") : Number(short[1]) * 1000} BTU`;
  return "";
}

function extractMapUrl(text) {
  const s = String(text || "");
  const m = s.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.[^\s]+\/maps|maps\.google\.[^\s]+)[^\s)]+/i)
    || s.match(/https?:\/\/[^\s)]+/i);
  return m ? cleanText(m[0], 1000) : "";
}

function extractArea(text) {
  const s = cleanText(text, 2000).toLowerCase();
  const found = KNOWN_AREAS.find((area) => s.includes(area.toLowerCase()));
  return found || "";
}

function extractAddress(text) {
  const s = cleanText(text, 2000);
  const m = s.match(/(?:ที่อยู่|อยู่|address|คอนโด|หมู่บ้าน|ซอย|ถนน)\s*[:：-]?\s*([^\n\r]{6,180})/i);
  if (m && m[1]) return cleanText(m[1], 220);
  const area = extractArea(s);
  return area || "";
}

function extractPreferredDate(text) {
  const s = String(text || "");
  if (/วันนี้/.test(s)) return "วันนี้";
  if (/พรุ่งนี้/.test(s)) return "พรุ่งนี้";
  if (/มะรืน/.test(s)) return "มะรืน";
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (m) return m[0];
  const day = s.match(/(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/);
  return day ? day[1] : "";
}

function extractPreferredTime(text) {
  const s = String(text || "");
  const m = s.match(/(\d{1,2})[:.]([0-5]\d)\s*(?:น\.?|นาฬิกา)?/);
  if (m) return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  if (/ช่วงเช้า|ตอนเช้า|เช้า/.test(s)) return "ช่วงเช้า";
  if (/เที่ยง|กลางวัน/.test(s)) return "ช่วงเที่ยง";
  if (/บ่าย|ช่วงบ่าย/.test(s)) return "ช่วงบ่าย";
  if (/เย็น|ช่วงเย็น/.test(s)) return "ช่วงเย็น";
  if (/ค่ำ/.test(s)) return "ช่วงค่ำ";
  return "";
}

function detectIntent(text) {
  const s = String(text || "").toLowerCase();
  if (/(ร้องเรียน|ไม่พอใจ|เสียหาย|ชดเชย|รับผิดชอบ|ฟ้อง|ตำรวจ|แจ้งความ|รีวิว|refund|complaint|legal)/i.test(s)) return "complaint";
  if (/(ใบกำกับภาษี|tax invoice|vat)/i.test(s)) return "tax_invoice";
  if (/(คืนเงิน|โอนผิด|refund)/i.test(s)) return "refund";
  if (/(แพง|ลดได้ไหม|ลดหน่อย|ส่วนลด|discount|expensive)/i.test(s)) return "price_objection";
  if (/(จอง|นัด|คิว|ว่าง|พร้อม|ตกลง|เอาค่ะ|เอาครับ|book|booking|confirm)/i.test(s)) return "booking_ready";
  if (/(ราคา|กี่บาท|เท่าไหร่|price|cost)/i.test(s)) return "price_question";
  if (/(พื้นที่|ไปถึง|รับงาน|service area)/i.test(s)) return "area_question";
  return "unknown";
}

function classifyRisk(text, intent) {
  const s = String(text || "");
  if (["complaint", "tax_invoice", "refund"].includes(intent)) return "ADMIN_ONLY";
  if (/(ด่วนมาก|เดี๋ยวนี้|ไม่เอาแล้ว|ยกเลิก|ขอผู้จัดการ)/i.test(s)) return "APPROVAL_REQUIRED";
  if (["booking_ready", "price_objection"].includes(intent)) return "APPROVAL_REQUIRED";
  return "LOW";
}

function estimateQuotedPrice() {
  // Do not guess prices here. Admin Add Job uses the real pricing preview / service price book after prefill.
  return null;
}

function extractFieldsFromText(text) {
  const fields = {
    customer_name: extractName(text),
    customer_phone: extractPhone(text),
    service_type: extractServiceType(text),
    unit_count: extractUnitCount(text),
    btu: extractBtu(text),
    area_text: extractArea(text),
    address_text: extractAddress(text),
    map_url: extractMapUrl(text),
    preferred_date: extractPreferredDate(text),
    preferred_time: extractPreferredTime(text),
  };
  fields.quoted_price = estimateQuotedPrice(fields);
  return fields;
}

function mergeFields(previous = {}, next = {}) {
  const merged = Object.assign({}, previous);
  for (const [key, value] of Object.entries(next || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== "") merged[key] = value;
  }
  return merged;
}

function bookingMissingFields(fields, options = {}) {
  const missing = [];
  if (!cleanText(fields.customer_name) && !options.criticalOnly) missing.push("ชื่อลูกค้า");
  if (!cleanText(fields.customer_phone)) missing.push("เบอร์โทร");
  if (!cleanText(fields.service_type)) missing.push("ประเภทงาน");
  if (!Number(fields.unit_count || 0)) missing.push("จำนวนเครื่อง");
  if (!cleanText(fields.address_text) && !cleanText(fields.area_text)) missing.push("พื้นที่/ที่อยู่");
  if (!cleanText(fields.map_url)) missing.push("โลเคชั่น Google Maps");
  if (!cleanText(fields.preferred_date)) missing.push("วันที่ต้องการ");
  if (!cleanText(fields.preferred_time)) missing.push("ช่วงเวลาที่สะดวก");
  return missing;
}

function readinessScore(fields) {
  const total = 8;
  const missing = bookingMissingFields(fields, { criticalOnly: true }).length;
  return Math.max(0, Math.min(100, Math.round(((total - missing) / total) * 100)));
}

function decideStatus({ intent, risk, fields }) {
  if (risk === "ADMIN_ONLY") return "ADMIN_REQUIRED";
  if (intent === "price_objection") return "CUSTOMER_INTERESTED";
  const criticalMissing = bookingMissingFields(fields, { criticalOnly: true });
  if (intent === "booking_ready" && criticalMissing.length === 0) return "READY_TO_CREATE_JOB";
  if (intent === "booking_ready") return "NEED_INFO";
  if (cleanText(fields.customer_phone) || cleanText(fields.map_url) || cleanText(fields.preferred_date)) return "NEED_INFO";
  return "WATCHING";
}

function shouldCreateOrUpdateIntake({ text, intent, fields }) {
  if (!cleanText(text)) return false;
  if (["booking_ready", "price_objection", "complaint", "tax_invoice", "refund"].includes(intent)) return true;
  if (cleanText(fields.customer_phone) || cleanText(fields.map_url)) return true;
  if (cleanText(fields.preferred_date) && cleanText(fields.service_type)) return true;
  return false;
}

function buildAiSummary(fields, status, intent, risk) {
  const parts = [];
  if (fields.service_type) parts.push(fields.service_type);
  if (fields.unit_count) parts.push(`${fields.unit_count} เครื่อง`);
  if (fields.area_text || fields.address_text) parts.push(fields.area_text || fields.address_text);
  if (fields.preferred_date || fields.preferred_time) parts.push([fields.preferred_date, fields.preferred_time].filter(Boolean).join(" "));
  const base = parts.length ? parts.join(" • ") : "รอตรวจข้อมูลจาก LINE";
  if (status === "READY_TO_CREATE_JOB") return `ข้อมูลครบพอให้แอดมินตรวจและเพิ่มงาน: ${base}`;
  if (status === "ADMIN_REQUIRED") return `ต้องให้แอดมินตอบเอง: ${base}`;
  if (intent === "price_objection") return "ลูกค้าต่อราคา ให้ยืนยันราคาตามระบบ ไม่เปิดอนุมัติส่วนลด";
  if (risk === "APPROVAL_REQUIRED") return `ต้องตรวจโดยแอดมินก่อนตอบ/ลงงาน: ${base}`;
  return `ต้องถามข้อมูลเพิ่ม: ${base}`;
}

async function ensureAiBookingIntakeSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_booking_intakes (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'LINE_AI',
      customer_name TEXT NULL,
      customer_phone TEXT NULL,
      service_type TEXT NULL,
      unit_count INTEGER NULL,
      btu TEXT NULL,
      area_text TEXT NULL,
      address_text TEXT NULL,
      map_url TEXT NULL,
      preferred_date TEXT NULL,
      preferred_time TEXT NULL,
      quoted_price NUMERIC(12,2) NULL,
      missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      readiness_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NEED_INFO',
      risk_label TEXT NOT NULL DEFAULT 'LOW',
      latest_customer_message TEXT NULL,
      ai_summary TEXT NULL,
      admin_note TEXT NULL,
      last_message_id TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      job_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_status_updated ON public.ai_booking_intakes(status, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_conversation ON public.ai_booking_intakes(conversation_id)`);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
    line_user_id: row.line_user_id,
    source: row.source || "LINE_AI",
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    service_type: row.service_type || "",
    unit_count: row.unit_count == null ? null : Number(row.unit_count),
    btu: row.btu || "",
    area_text: row.area_text || "",
    address_text: row.address_text || "",
    map_url: row.map_url || "",
    preferred_date: row.preferred_date || "",
    preferred_time: row.preferred_time || "",
    quoted_price: row.quoted_price == null ? null : Number(row.quoted_price),
    missing_fields: parseJsonArray(row.missing_fields),
    readiness_score: Number(row.readiness_score || 0),
    status: row.status || "NEED_INFO",
    risk_label: row.risk_label || "LOW",
    latest_customer_message: row.latest_customer_message || "",
    ai_summary: row.ai_summary || "",
    admin_note: row.admin_note || "",
    last_message_id: row.last_message_id || "",
    metadata: parseJsonObject(row.metadata),
    job_id: row.job_id == null ? null : Number(row.job_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadExistingIntake(pool, lineUserId) {
  const found = await pool.query(`SELECT * FROM public.ai_booking_intakes WHERE line_user_id=$1 LIMIT 1`, [lineUserId]);
  return found.rows?.[0] || null;
}

async function upsertAiBookingIntake(pool, payload) {
  await ensureAiBookingIntakeSchema(pool);
  const lineUserId = cleanText(payload.line_user_id, 255);
  if (!lineUserId) return null;

  const existing = await loadExistingIntake(pool, lineUserId);
  if (existing && CLOSED_STATUSES.has(cleanText(existing.status, 80))) {
    return mapRow(existing);
  }

  const nextFields = extractFieldsFromText(payload.latest_customer_message || "");
  const merged = mergeFields(existing || {}, nextFields);
  const intent = payload.intent || detectIntent(payload.latest_customer_message);
  const risk = payload.risk_label || classifyRisk(payload.latest_customer_message, intent);
  const missing = bookingMissingFields(merged, { criticalOnly: false });
  const criticalMissing = bookingMissingFields(merged, { criticalOnly: true });
  const score = readinessScore(merged);
  const status = decideStatus({ intent, risk, fields: merged });
  const aiSummary = buildAiSummary(merged, status, intent, risk);
  const quotedPrice = null;
  const meta = Object.assign({}, parseJsonObject(existing?.metadata), payload.metadata || {}, {
    intent,
    critical_missing_fields: criticalMissing,
    business_timezone: BANGKOK_TZ,
    last_decision_at: new Date().toISOString(),
    price_rule: intent === "price_objection"
      ? "ใช้ราคาตามระบบเท่านั้น ไม่เปิดอนุมัติส่วนลด"
      : "ให้หน้าเพิ่มงานคำนวณราคาจากระบบราคา/แคมเปญจริง",
  });

  const saved = await pool.query(
    `INSERT INTO public.ai_booking_intakes(
       conversation_id, line_user_id, source, customer_name, customer_phone, service_type, unit_count, btu,
       area_text, address_text, map_url, preferred_date, preferred_time, quoted_price, missing_fields,
       readiness_score, status, risk_label, latest_customer_message, ai_summary, last_message_id, metadata, updated_at
     ) VALUES($1,$2,'LINE_AI',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21::jsonb,NOW())
     ON CONFLICT (line_user_id) DO UPDATE SET
       conversation_id=COALESCE(EXCLUDED.conversation_id, public.ai_booking_intakes.conversation_id),
       customer_name=COALESCE(NULLIF(EXCLUDED.customer_name,''), public.ai_booking_intakes.customer_name),
       customer_phone=COALESCE(NULLIF(EXCLUDED.customer_phone,''), public.ai_booking_intakes.customer_phone),
       service_type=COALESCE(NULLIF(EXCLUDED.service_type,''), public.ai_booking_intakes.service_type),
       unit_count=COALESCE(EXCLUDED.unit_count, public.ai_booking_intakes.unit_count),
       btu=COALESCE(NULLIF(EXCLUDED.btu,''), public.ai_booking_intakes.btu),
       area_text=COALESCE(NULLIF(EXCLUDED.area_text,''), public.ai_booking_intakes.area_text),
       address_text=COALESCE(NULLIF(EXCLUDED.address_text,''), public.ai_booking_intakes.address_text),
       map_url=COALESCE(NULLIF(EXCLUDED.map_url,''), public.ai_booking_intakes.map_url),
       preferred_date=COALESCE(NULLIF(EXCLUDED.preferred_date,''), public.ai_booking_intakes.preferred_date),
       preferred_time=COALESCE(NULLIF(EXCLUDED.preferred_time,''), public.ai_booking_intakes.preferred_time),
       quoted_price=NULL,
       missing_fields=EXCLUDED.missing_fields,
       readiness_score=EXCLUDED.readiness_score,
       status=EXCLUDED.status,
       risk_label=EXCLUDED.risk_label,
       latest_customer_message=EXCLUDED.latest_customer_message,
       ai_summary=EXCLUDED.ai_summary,
       last_message_id=COALESCE(NULLIF(EXCLUDED.last_message_id,''), public.ai_booking_intakes.last_message_id),
       metadata=public.ai_booking_intakes.metadata || EXCLUDED.metadata,
       updated_at=NOW()
     RETURNING *`,
    [
      payload.conversation_id || null,
      lineUserId,
      cleanText(merged.customer_name, 120) || null,
      cleanText(merged.customer_phone, 40) || null,
      cleanText(merged.service_type, 120) || null,
      merged.unit_count || null,
      cleanText(merged.btu, 80) || null,
      cleanText(merged.area_text, 180) || null,
      cleanText(merged.address_text, 300) || null,
      cleanText(merged.map_url, 1000) || null,
      cleanText(merged.preferred_date, 80) || null,
      cleanText(merged.preferred_time, 80) || null,
      quotedPrice,
      JSON.stringify(missing),
      score,
      status,
      risk,
      cleanText(payload.latest_customer_message, 4000) || null,
      aiSummary,
      cleanText(payload.last_message_id, 255) || null,
      JSON.stringify(meta),
    ]
  );
  return mapRow(saved.rows?.[0]);
}

async function ingestLineBookingIntakeFromEvent(pool, event, stored = {}) {
  try {
    const message = event?.message || {};
    const messageType = cleanText(message.type, 80);
    const text = messageType === "text" ? cleanText(message.text, 4000) : "";
    const lineUserId = cleanText(event?.source?.userId, 255);
    if (!pool || !lineUserId || !text) return { ok: false, skipped: true, reason: "not_text_or_missing_user" };
    const fields = extractFieldsFromText(text);
    const intent = detectIntent(text);
    const risk = classifyRisk(text, intent);
    if (!shouldCreateOrUpdateIntake({ text, intent, fields, risk })) return { ok: true, skipped: true, reason: "not_booking_intake" };
    const intake = await upsertAiBookingIntake(pool, {
      conversation_id: stored.conversation_id || null,
      line_user_id: lineUserId,
      last_message_id: cleanText(message.id, 255),
      latest_customer_message: text,
      intent,
      risk_label: risk,
      metadata: {
        line_event_type: cleanText(event?.type, 80),
        line_message_type: messageType,
        received_at: event?.timestamp || null,
      },
    });
    return { ok: true, intake };
  } catch (e) {
    return { ok: false, error: e.message || "AI_BOOKING_INTAKE_FAILED" };
  }
}

async function listAiBookingIntakes(pool, options = {}) {
  await ensureAiBookingIntakeSchema(pool);
  const limit = clampInt(options.limit, 1, 200, 80);
  const status = cleanText(options.status, 80);
  const params = [];
  let where = "WHERE status <> 'CLOSED'";
  if (status && status !== "all" && status !== "open") {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  } else if (status === "open" || !status) {
    params.push(OPEN_STATUSES);
    where = `WHERE status = ANY($${params.length})`;
  }
  params.push(limit);
  const rows = await pool.query(`SELECT * FROM public.ai_booking_intakes ${where} ORDER BY updated_at DESC LIMIT $${params.length}`, params);
  return rows.rows.map(mapRow);
}

async function getAiBookingIntake(pool, id) {
  await ensureAiBookingIntakeSchema(pool);
  const rows = await pool.query(`SELECT * FROM public.ai_booking_intakes WHERE id=$1 LIMIT 1`, [Number(id)]);
  return mapRow(rows.rows?.[0]);
}

async function patchAiBookingIntake(pool, id, patch = {}) {
  await ensureAiBookingIntakeSchema(pool);
  const current = await getAiBookingIntake(pool, id);
  if (!current) return null;
  const merged = mergeFields(current, patch);
  const missing = Array.isArray(patch.missing_fields) ? patch.missing_fields : bookingMissingFields(merged, { criticalOnly: false });
  const score = patch.readiness_score == null ? readinessScore(merged) : clampInt(patch.readiness_score, 0, 100, current.readiness_score);
  const status = cleanText(patch.status, 80) || current.status;
  const saved = await pool.query(
    `UPDATE public.ai_booking_intakes SET
      customer_name=$2, customer_phone=$3, service_type=$4, unit_count=$5, btu=$6,
      area_text=$7, address_text=$8, map_url=$9, preferred_date=$10, preferred_time=$11,
      quoted_price=$12, missing_fields=$13::jsonb, readiness_score=$14, status=$15,
      risk_label=$16, ai_summary=$17, admin_note=$18, job_id=$19, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [
      Number(id),
      cleanText(merged.customer_name, 120) || null,
      cleanText(merged.customer_phone, 40) || null,
      cleanText(merged.service_type, 120) || null,
      merged.unit_count || null,
      cleanText(merged.btu, 80) || null,
      cleanText(merged.area_text, 180) || null,
      cleanText(merged.address_text, 300) || null,
      cleanText(merged.map_url, 1000) || null,
      cleanText(merged.preferred_date, 80) || null,
      cleanText(merged.preferred_time, 80) || null,
      merged.quoted_price || null,
      JSON.stringify(missing),
      score,
      status,
      cleanText(merged.risk_label, 80) || "LOW",
      cleanText(merged.ai_summary, 1000) || null,
      cleanText(merged.admin_note, 1000) || null,
      merged.job_id || null,
    ]
  );
  return mapRow(saved.rows?.[0]);
}

function buildAdminCopyText(intake) {
  const i = intake || {};
  return [
    "ข้อมูลลูกค้าจาก LINE AI",
    `ชื่อลูกค้า: ${i.customer_name || "-"}`,
    `เบอร์โทร: ${i.customer_phone || "-"}`,
    `ประเภทงาน: ${i.service_type || "-"}`,
    `จำนวนเครื่อง: ${i.unit_count || "-"}`,
    `BTU: ${i.btu || "-"}`,
    `พื้นที่/ที่อยู่: ${[i.area_text, i.address_text].filter(Boolean).join(" ") || "-"}`,
    `โลเคชั่น: ${i.map_url || "-"}`,
    `วันเวลา: ${[i.preferred_date, i.preferred_time].filter(Boolean).join(" ") || "-"}`,
    `ราคาตามระบบ: ให้หน้าเพิ่มงานคำนวณจากระบบราคา/แคมเปญจริง`,
    `ข้อมูลที่ยังขาด: ${(i.missing_fields || []).join(", ") || "ครบพอให้ตรวจ"}`,
    `ข้อความล่าสุด: ${i.latest_customer_message || "-"}`,
  ].join("\n");
}

module.exports = {
  ensureAiBookingIntakeSchema,
  ingestLineBookingIntakeFromEvent,
  listAiBookingIntakes,
  getAiBookingIntake,
  patchAiBookingIntake,
  buildAdminCopyText,
  detectIntent,
  classifyRisk,
  extractFieldsFromText,
  bookingMissingFields,
  readinessScore,
};
