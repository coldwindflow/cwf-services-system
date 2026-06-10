const BANGKOK_TZ = "Asia/Bangkok";

const KNOWN_AREAS = [
  "พระโขนง", "บางจาก", "อ่อนนุช", "ปุณณวิถี", "อุดมสุข", "บางนา", "แบริ่ง", "สำโรง", "ลาซาล",
  "สุขุมวิท", "เอกมัย", "ทองหล่อ", "พร้อมพงษ์", "คลองเตย", "พระราม 4", "พัฒนาการ", "สวนหลวง",
  "ศรีนครินทร์", "ซีคอน", "พระราม 3", "ยานนาวา", "บางคอแหลม", "สาธุประดิษฐ์", "เจริญกรุง",
  "ช่องนนทรี", "บางพลี", "ลาดกระบัง", "เทพารักษ์", "สาทร", "พระราม 9", "รัชดา", "ดินแดง", "ห้วยขวาง"
];

const CLOSED_STATUSES = new Set(["CLOSED", "JOB_CREATED"]);
const OPEN_STATUSES = ["READY_TO_CREATE_JOB", "NEED_INFO", "ADMIN_REQUIRED", "CUSTOMER_INTERESTED", "WAITING_CUSTOMER_REPLY"];
const ACTIVE_STATUSES = [...OPEN_STATUSES, "WATCHING"];

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
  if (short) return `${(Number(short[1]) * 1000).toLocaleString("en-US")} BTU`;
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
  if (status === "WAITING_CUSTOMER_REPLY") return `ถามข้อมูลเพิ่มแล้ว รอลูกค้าตอบกลับ: ${base}`;
  if (intent === "price_objection") return "ลูกค้าต่อราคา ให้ยืนยันราคาตามระบบ ไม่เปิดอนุมัติส่วนลด";
  if (risk === "APPROVAL_REQUIRED") return `ต้องตรวจโดยแอดมินก่อนตอบ/ลงงาน: ${base}`;
  return `ต้องถามข้อมูลเพิ่ม: ${base}`;
}

async function ensureAiBookingIntakeSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_booking_intakes (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NOT NULL,
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
      thread_context TEXT NULL,
      ai_summary TEXT NULL,
      admin_note TEXT NULL,
      last_message_id TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      job_id BIGINT NULL,
      status_changed_at TIMESTAMPTZ NULL,
      waiting_since TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Previous patch created line_user_id as UNIQUE. Real use needs repeat bookings from the same LINE user.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.ai_booking_intakes'::regclass
          AND conname = 'ai_booking_intakes_line_user_id_key'
      ) THEN
        ALTER TABLE public.ai_booking_intakes DROP CONSTRAINT ai_booking_intakes_line_user_id_key;
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS thread_context TEXT NULL`);
  await pool.query(`ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL`);
  await pool.query(`ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_status_updated ON public.ai_booking_intakes(status, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_conversation ON public.ai_booking_intakes(conversation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_line_user_status_updated ON public.ai_booking_intakes(line_user_id, status, updated_at DESC)`);
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
    thread_context: row.thread_context || "",
    ai_summary: row.ai_summary || "",
    admin_note: row.admin_note || "",
    last_message_id: row.last_message_id || "",
    metadata: parseJsonObject(row.metadata),
    job_id: row.job_id == null ? null : Number(row.job_id),
    status_changed_at: row.status_changed_at || null,
    waiting_since: row.waiting_since || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadActiveIntake(pool, lineUserId) {
  const found = await pool.query(
    `SELECT * FROM public.ai_booking_intakes
     WHERE line_user_id=$1 AND status <> ALL($2::text[])
     ORDER BY updated_at DESC
     LIMIT 1`,
    [lineUserId, Array.from(CLOSED_STATUSES)]
  );
  return found.rows?.[0] || null;
}

async function loadLineThreadContext(pool, { lineUserId, conversationId, limit = 30 } = {}) {
  const safeLimit = clampInt(limit, 5, 50, 30);
  const params = [];
  let where = "";
  if (conversationId) {
    params.push(Number(conversationId));
    where = `conversation_id=$${params.length}`;
  } else if (lineUserId) {
    params.push(lineUserId);
    where = `line_user_id=$${params.length}`;
  } else {
    return { text: "", message_count: 0, latest_line_message_at: null };
  }
  params.push(safeLimit);
  try {
    const rows = await pool.query(
      `SELECT direction, message_text, received_at, created_at
       FROM public.line_messages
       WHERE ${where}
         AND message_type='text'
         AND COALESCE(message_text,'') <> ''
       ORDER BY COALESCE(received_at, created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    const ordered = [...(rows.rows || [])].reverse();
    const lines = ordered.map((r) => {
      const who = r.direction === "outbound" ? "แอดมิน" : "ลูกค้า";
      return `${who}: ${cleanText(r.message_text, 500)}`;
    }).filter(Boolean);
    return {
      text: cleanText(lines.join("\n"), 8000),
      message_count: ordered.length,
      latest_line_message_at: rows.rows?.[0]?.received_at || rows.rows?.[0]?.created_at || null,
    };
  } catch (e) {
    return { text: "", message_count: 0, latest_line_message_at: null, error: e.message || "LOAD_THREAD_FAILED" };
  }
}

async function upsertAiBookingIntake(pool, payload) {
  await ensureAiBookingIntakeSchema(pool);
  const lineUserId = cleanText(payload.line_user_id, 255);
  if (!lineUserId) return null;

  const existing = await loadActiveIntake(pool, lineUserId);
  const threadText = cleanText(payload.thread_context, 8000) || cleanText(payload.latest_customer_message, 4000);
  const nextFields = extractFieldsFromText(threadText);
  const merged = mergeFields(existing || {}, nextFields);
  const intent = payload.intent || detectIntent(threadText);
  const risk = payload.risk_label || classifyRisk(threadText, intent);
  const missing = bookingMissingFields(merged, { criticalOnly: false });
  const criticalMissing = bookingMissingFields(merged, { criticalOnly: true });
  const score = readinessScore(merged);
  const status = decideStatus({ intent, risk, fields: merged });
  const aiSummary = buildAiSummary(merged, status, intent, risk);
  const quotedPrice = null;
  const nowIso = new Date().toISOString();
  const meta = Object.assign({}, parseJsonObject(existing?.metadata), payload.metadata || {}, {
    intent,
    critical_missing_fields: criticalMissing,
    business_timezone: BANGKOK_TZ,
    last_decision_at: nowIso,
    line_thread_message_count: Number(payload.thread_message_count || 0) || undefined,
    latest_line_message_at: payload.latest_line_message_at || undefined,
    price_rule: intent === "price_objection"
      ? "ใช้ราคาตามระบบเท่านั้น ไม่เปิดอนุมัติส่วนลด"
      : "ให้หน้าเพิ่มงานคำนวณราคาจากระบบราคา/แคมเปญจริง",
  });

  const values = [
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
    cleanText(threadText, 8000) || null,
    aiSummary,
    cleanText(payload.last_message_id, 255) || null,
    JSON.stringify(meta),
  ];

  if (existing) {
    const saved = await pool.query(
      `UPDATE public.ai_booking_intakes SET
         conversation_id=COALESCE($1, conversation_id),
         customer_name=COALESCE(NULLIF($3,''), customer_name),
         customer_phone=COALESCE(NULLIF($4,''), customer_phone),
         service_type=COALESCE(NULLIF($5,''), service_type),
         unit_count=COALESCE($6, unit_count),
         btu=COALESCE(NULLIF($7,''), btu),
         area_text=COALESCE(NULLIF($8,''), area_text),
         address_text=COALESCE(NULLIF($9,''), address_text),
         map_url=COALESCE(NULLIF($10,''), map_url),
         preferred_date=COALESCE(NULLIF($11,''), preferred_date),
         preferred_time=COALESCE(NULLIF($12,''), preferred_time),
         quoted_price=NULL,
         missing_fields=$14::jsonb,
         readiness_score=$15,
         status=$16,
         risk_label=$17,
         latest_customer_message=COALESCE(NULLIF($18,''), latest_customer_message),
         thread_context=COALESCE(NULLIF($19,''), thread_context),
         ai_summary=$20,
         last_message_id=COALESCE(NULLIF($21,''), last_message_id),
         metadata=metadata || $22::jsonb,
         status_changed_at=CASE WHEN status IS DISTINCT FROM $16 THEN NOW() ELSE status_changed_at END,
         waiting_since=CASE WHEN $16='WAITING_CUSTOMER_REPLY' THEN COALESCE(waiting_since, NOW()) ELSE waiting_since END,
         updated_at=NOW()
       WHERE id=$23 RETURNING *`,
      [...values, Number(existing.id)]
    );
    return mapRow(saved.rows?.[0]);
  }

  const saved = await pool.query(
    `INSERT INTO public.ai_booking_intakes(
       conversation_id, line_user_id, source, customer_name, customer_phone, service_type, unit_count, btu,
       area_text, address_text, map_url, preferred_date, preferred_time, quoted_price, missing_fields,
       readiness_score, status, risk_label, latest_customer_message, thread_context, ai_summary, last_message_id, metadata,
       status_changed_at, waiting_since, updated_at
     ) VALUES($1,$2,'LINE_AI',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,NOW(),CASE WHEN $16='WAITING_CUSTOMER_REPLY' THEN NOW() ELSE NULL END,NOW())
     RETURNING *`,
    values
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

    await ensureAiBookingIntakeSchema(pool);
    const thread = await loadLineThreadContext(pool, {
      lineUserId,
      conversationId: stored.conversation_id || null,
      limit: 30,
    });
    const analysisText = thread.text || text;
    const fields = extractFieldsFromText(analysisText);
    const intent = detectIntent(analysisText);
    const risk = classifyRisk(analysisText, intent);
    if (!shouldCreateOrUpdateIntake({ text: analysisText, intent, fields, risk })) {
      return { ok: true, skipped: true, reason: "not_booking_intake" };
    }
    const intake = await upsertAiBookingIntake(pool, {
      conversation_id: stored.conversation_id || null,
      line_user_id: lineUserId,
      last_message_id: cleanText(message.id, 255),
      latest_customer_message: text,
      thread_context: analysisText,
      thread_message_count: thread.message_count || 0,
      latest_line_message_at: thread.latest_line_message_at || null,
      intent,
      risk_label: risk,
      metadata: {
        line_event_type: cleanText(event?.type, 80),
        line_message_type: messageType,
        received_at: event?.timestamp || null,
        intake_engine: "thread_v4",
        thread_error: thread.error || undefined,
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
  const statusChanged = status !== current.status;
  const meta = Object.assign({}, parseJsonObject(current.metadata), parseJsonObject(patch.metadata), {
    last_admin_action_at: new Date().toISOString(),
  });
  const saved = await pool.query(
    `UPDATE public.ai_booking_intakes SET
      customer_name=$2, customer_phone=$3, service_type=$4, unit_count=$5, btu=$6,
      area_text=$7, address_text=$8, map_url=$9, preferred_date=$10, preferred_time=$11,
      quoted_price=$12, missing_fields=$13::jsonb, readiness_score=$14, status=$15,
      risk_label=$16, ai_summary=$17, admin_note=$18, job_id=$19,
      metadata=$20::jsonb,
      status_changed_at=CASE WHEN $21 THEN NOW() ELSE status_changed_at END,
      waiting_since=CASE WHEN $15='WAITING_CUSTOMER_REPLY' THEN COALESCE(waiting_since, NOW()) ELSE waiting_since END,
      updated_at=NOW()
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
      JSON.stringify(meta),
      statusChanged,
    ]
  );
  return mapRow(saved.rows?.[0]);
}

async function getAiBookingIntakeHealth(pool) {
  await ensureAiBookingIntakeSchema(pool);
  const tables = await pool.query(`
    SELECT
      to_regclass('public.ai_booking_intakes') IS NOT NULL AS ai_booking_intakes_ready,
      to_regclass('public.line_conversations') IS NOT NULL AS line_conversations_ready,
      to_regclass('public.line_messages') IS NOT NULL AS line_messages_ready
  `);
  const counts = await pool.query(`
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE status = 'READY_TO_CREATE_JOB')::int AS ready_count,
      COUNT(*) FILTER (WHERE status = 'NEED_INFO')::int AS need_info_count,
      COUNT(*) FILTER (WHERE status = 'WAITING_CUSTOMER_REPLY')::int AS waiting_customer_count,
      COUNT(*) FILTER (WHERE status = 'ADMIN_REQUIRED')::int AS admin_required_count,
      COUNT(*) FILTER (WHERE status = 'JOB_CREATED')::int AS job_created_count,
      MAX(updated_at) AS latest_ai_intake_at
    FROM public.ai_booking_intakes
  `);
  let latestLine = null;
  try {
    const line = await pool.query(`
      SELECT id, line_user_id, message_text, received_at, created_at
      FROM public.line_messages
      ORDER BY COALESCE(received_at, created_at) DESC
      LIMIT 1
    `);
    latestLine = line.rows?.[0] || null;
  } catch (_) {}
  const latest = await pool.query(`
    SELECT id, status, customer_name, customer_phone, service_type, updated_at, metadata
    FROM public.ai_booking_intakes
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  return {
    route: "admin-ai-booking-intake",
    table_ready: Boolean(tables.rows?.[0]?.ai_booking_intakes_ready),
    line_inbox_table_ready: Boolean(tables.rows?.[0]?.line_conversations_ready && tables.rows?.[0]?.line_messages_ready),
    line_secret_configured: Boolean(String(process.env.LINE_CHANNEL_SECRET || "").trim()),
    line_token_configured: Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()),
    multiple_intakes_per_line_user: true,
    thread_analysis_enabled: true,
    waiting_customer_reply_enabled: true,
    protected: true,
    can_create_from_line_text: true,
    counts: counts.rows?.[0] || {},
    latest_line_message: latestLine,
    latest_intake: latest.rows?.[0] || null,
  };
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
    `สถานะ: ${i.status || "-"}`,
    `ข้อความล่าสุด: ${i.latest_customer_message || "-"}`,
  ].join("\n");
}

module.exports = {
  ensureAiBookingIntakeSchema,
  ingestLineBookingIntakeFromEvent,
  upsertAiBookingIntake,
  listAiBookingIntakes,
  getAiBookingIntake,
  patchAiBookingIntake,
  getAiBookingIntakeHealth,
  buildAdminCopyText,
  detectIntent,
  classifyRisk,
  extractFieldsFromText,
  bookingMissingFields,
  readinessScore,
  loadLineThreadContext,
};
