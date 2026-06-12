const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { ensureLineInboxSchema } = require("./lineWebhook");
const { buildCoreBrainContext, formatCoreBrainForPrompt } = require("../aiOfficeCoreBrain");
const {
  loadSavedReplyExamples,
  saveReplyFeedback,
  getReplyLearningStatus,
  listReplyExamples,
  createReplyExample,
  updateReplyExample,
  disableReplyExample,
  loadMatchingReplyExamples,
  incrementReplyExampleUsage,
  logReplyLearningEvent,
} = require("../aiReplyLearning");
const {
  BANGKOK_TZ,
  formatThaiDateTime,
  formatThaiTime,
  parseThaiRelativeDate,
  serviceKnowledge,
  analyzeAvailability,
  looksLikeAvailabilityQuestion,
  routeOfficeIntent,
  filterReplyExample,
  formatBangkokChatTime,
  detectCustomerIntent,
  deriveConversationStatus,
  detectPriorityFlags,
  extractCustomerContextFromMessages,
} = require("../cwfAiKnowledge");

const AI_OFFICE_DEFAULT_MODEL = "gpt-4.1-mini";
const AI_OFFICE_JOB_LIMIT = 80;
const AI_OFFICE_ROOT_DIR = path.resolve(__dirname, "..", "..");
const AI_OFFICE_FRONTEND_FILES = ["admin-ai-office.html", "admin-ai-office.js"];
const AI_OFFICE_FORBIDDEN_TERMS = [
  "de" + "mo",
  "mo" + "ck",
  "sam" + "ple",
  "proto" + "type",
  "tem" + "plate",
  "created" + " by",
  "creator" + " showcase",
  "ผู้" + "สร้าง",
];
const AI_OFFICE_MUTATING_TOKENS = [
  "in" + "sert",
  "up" + "date",
  "de" + "lete",
  "al" + "ter",
  "dr" + "op",
  "trun" + "cate",
  "cre" + "ate",
];
const AI_OFFICE_AGENTS = {
  admin: {
    name: "Admin AI",
    role: "ผู้ช่วยแอดมินสำหรับสรุปงาน ร่างข้อความลูกค้า ข้อความช่าง และแปลภาษา",
  },
  sales: {
    name: "Sales AI",
    role: "ผู้ช่วยฝ่ายขายสำหรับปิดการขาย แนะนำแพ็กเกจ และตอบเมื่อลูกค้าบอกว่าแพง",
  },
  ops: {
    name: "Ops AI",
    role: "ผู้ควบคุมงานสำหรับงานวันนี้ พรุ่งนี้ งานยังไม่จ่าย งานยังไม่ปิด และความเสี่ยงต้องติดตาม",
  },
  ads: {
    name: "Ads AI",
    role: "ผู้ช่วยการตลาดสำหรับ Google Ads, Facebook Ads, TikTok Ads, keyword และพื้นที่บริการ โดยอ้างอิงงานจริงที่มี",
  },
  content: {
    name: "Content AI",
    role: "ผู้ช่วยทำคอนเทนต์สำหรับโพสต์ แคปชัน รีวิว และสคริปต์ Reels/TikTok จากบริบทงานจริง",
  },
  dev: {
    name: "Dev AI",
    role: "ผู้ช่วยระบบสำหรับ prompt, สรุปบั๊ก, checklist deploy และ review ความเสี่ยงแบบอ่านข้อมูลอย่างเดียว",
  },
  office: {
    name: "Office Chat",
    role: "โหมดรวมทุกแผนกสำหรับแยกเจตนาคำถามและรวมคำตอบจากทีม AI ที่เกี่ยวข้อง",
  },
};

let lineInboxSchemaReady = false;
const lineTranslationCache = new Map();

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}


function getReplyTone() {
  const tone = cleanText(process.env.AI_OFFICE_REPLY_TONE || process.env.CWF_REPLY_TONE || "female", 20).toLowerCase();
  return ["female", "male", "neutral", "auto"].includes(tone) ? tone : "female";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function clampLimit(value, def = 30, max = 100) {
  const n = Math.floor(Number(value || def));
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function maskLineUserId(value) {
  const s = String(value || "");
  if (s.length <= 8) return s ? "LINE-USER" : "";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

async function ensureLineInboxSchemaOnce(pool) {
  if (lineInboxSchemaReady) return;
  await ensureLineInboxSchema(pool);
  lineInboxSchemaReady = true;
}

function hasThaiText(value) {
  return /[\u0E00-\u0E7F]/.test(String(value || ""));
}

function isLikelyForeignCustomerText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) return true;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  return latinCount >= 6 && !hasThaiText(text);
}

function foreignCustomerLabel(conversation) {
  const name = cleanText(conversation?.display_name, 120);
  return `\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e0a\u0e32\u0e15\u0e34${name ? `: ${name}` : ""}`;
}

function isDoneStatusExpr(alias = "j") {
  return `(
    ${alias}.finished_at IS NOT NULL
    OR COALESCE(${alias}.job_status,'') ILIKE '%ปิด%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%เสร็จ%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%done%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%closed%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%complete%'
  )`;
}

function isCanceledStatusExpr(alias = "j") {
  return `(
    ${alias}.canceled_at IS NOT NULL
    OR COALESCE(${alias}.job_status,'') ILIKE '%ยกเลิก%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%cancel%'
  )`;
}

function mapJob(row) {
  const appointmentDisplay = formatThaiDateTime(row.appointment_datetime);
  return {
    job_id: row.job_id,
    booking_code: row.booking_code || null,
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    job_type: row.job_type || "",
    appointment_datetime: row.appointment_datetime || null,
    appointment_display: appointmentDisplay,
    appointment_time_th: formatThaiTime(row.appointment_datetime),
    business_timezone: BANGKOK_TZ,
    job_status: row.job_status || "",
    payment_status: row.payment_status || "unpaid",
    job_price: Number(row.job_price || 0),
    address_text: row.address_text || "",
    job_zone: row.job_zone || "",
    technician_username: row.technician_username || "",
    technician_team: row.technician_team || "",
    duration_min: Number(row.duration_min || 0),
    created_at: row.created_at || null,
    finished_at: row.finished_at || null,
    paid_at: row.paid_at || null,
    close_payment_status: row.close_payment_status || "",
    item_summary: row.item_summary || "",
  };
}

function createAiOfficeError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireAiOfficePin(req) {
  const expected = String(process.env.AI_OFFICE_ACCESS_PIN || "").trim();
  if (!expected) return;
  const supplied = String(req.headers["x-ai-office-pin"] || req.body?.pin || req.query?.pin || "").trim();
  if (!supplied || supplied !== expected) {
    throw createAiOfficeError("AI_OFFICE_PIN_REQUIRED", 403);
  }
}

function baseJobSelect() {
  return `
    SELECT
      j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, COALESCE(j.payment_status,'unpaid') AS payment_status,
      j.job_price, j.address_text, j.job_zone, j.technician_username, j.technician_team,
      j.duration_min, j.created_at, j.finished_at, j.paid_at, j.close_payment_status,
      COALESCE(
        STRING_AGG(
          DISTINCT NULLIF(CONCAT_WS(' ', ji.item_name, NULLIF(ji.qty::text,''), NULLIF(ji.line_total::text,'')), ''),
          ' | '
        ) FILTER (WHERE ji.job_id IS NOT NULL),
        ''
      ) AS item_summary
    FROM public.jobs j
    LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
  `;
}

function baseJobGroupOrder(order = "j.appointment_datetime ASC NULLS LAST, j.job_id ASC") {
  return `
    GROUP BY j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, j.payment_status, j.job_price, j.address_text,
      j.job_zone, j.technician_username, j.technician_team, j.duration_min, j.created_at,
      j.finished_at, j.paid_at, j.close_payment_status
    ORDER BY ${order}
    LIMIT ${AI_OFFICE_JOB_LIMIT}
  `;
}

async function loadJobs(pool, bucket, phone) {
  const params = [];
  let where = "";
  let order = "j.appointment_datetime ASC NULLS LAST, j.job_id ASC";
  const done = isDoneStatusExpr("j");
  const canceled = isCanceledStatusExpr("j");

  if (bucket === "today" || bucket === "tomorrow") {
    const offset = bucket === "tomorrow" ? " + INTERVAL '1 day'" : "";
    where = `
      WHERE j.appointment_datetime IS NOT NULL
        AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = ((NOW() AT TIME ZONE 'Asia/Bangkok')::date${offset})
        AND NOT ${canceled}
    `;
  } else if (bucket === "unpaid") {
    where = `
      WHERE NOT ${canceled}
        AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
    `;
    order = "j.appointment_datetime ASC NULLS LAST, j.job_id DESC";
  } else if (bucket === "open") {
    where = `
      WHERE NOT ${canceled}
        AND NOT ${done}
    `;
    order = "j.appointment_datetime ASC NULLS LAST, j.job_id DESC";
  } else if (bucket === "phone") {
    const digits = onlyDigits(phone);
    if (digits.length < 6) throw createAiOfficeError("กรุณาใส่เบอร์ลูกค้าอย่างน้อย 6 ตัวเลข");
    params.push(digits);
    where = `WHERE regexp_replace(COALESCE(j.customer_phone,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'`;
    order = "COALESCE(j.appointment_datetime, j.created_at) DESC NULLS LAST, j.job_id DESC";
  } else {
    throw createAiOfficeError("ประเภทข้อมูลไม่ถูกต้อง");
  }

  const r = await pool.query(`${baseJobSelect()} ${where} ${baseJobGroupOrder(order)}`, params);
  return (r.rows || []).map(mapJob);
}

async function loadJobsForBangkokDate(pool, dateIso) {
  const canceled = isCanceledStatusExpr("j");
  const r = await pool.query(
    `${baseJobSelect()}
      WHERE j.appointment_datetime IS NOT NULL
        AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $1::date
        AND NOT ${canceled}
      ${baseJobGroupOrder("j.appointment_datetime ASC NULLS LAST, j.job_id ASC")}`,
    [dateIso]
  );
  return (r.rows || []).map(mapJob);
}

async function loadTechniciansForAvailability(pool) {
  try {
    const r = await pool.query(`
      SELECT DISTINCT username, full_name
      FROM (
        SELECT username, COALESCE(full_name, username) AS full_name
          FROM public.users
         WHERE role IN ('technician','tech','senior_technician','lead_technician')
        UNION
        SELECT username, COALESCE(full_name, username) AS full_name
          FROM public.technician_profiles
         WHERE username IS NOT NULL
      ) t
      WHERE username IS NOT NULL
      ORDER BY username
      LIMIT 120
    `);
    return (r.rows || []).map((row) => ({ username: row.username, full_name: row.full_name || row.username }));
  } catch (_) {
    return [];
  }
}


async function tableExists(pool, tableName) {
  const r = await pool.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(r.rows?.[0]?.table_name);
}

async function buildProductionHealth(pool) {
  const messagingSecret = String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim();
  const loginSecret = String(process.env.LINE_LOGIN_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim();
  const checks = [];
  const add = (key, label, ok, fix, message) => checks.push({ key, label, ok: Boolean(ok), fix: fix || "", message: message || "" });
  add("openai_key", "OpenAI API", Boolean(String(process.env.OPENAI_API_KEY || "").trim()), "ใส่ OPENAI_API_KEY ใน Render Environment");
  add("ai_model", "AI Office Model", Boolean(String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim()), "ใส่ AI_OFFICE_MODEL หรือใช้ค่าเริ่มต้น");
  add("line_token", "LINE Channel Access Token", Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()), "ใส่ LINE_CHANNEL_ACCESS_TOKEN ของ Messaging API");
  add("line_messaging_secret", "LINE Messaging Secret", Boolean(messagingSecret), "แนะนำให้ใช้ LINE_MESSAGING_CHANNEL_SECRET และคง LINE_CHANNEL_SECRET เป็น fallback ได้");
  add("line_login_secret", "LINE Login Secret", Boolean(loginSecret), "ถ้าใช้ LINE Login ให้แยก LINE_LOGIN_CHANNEL_SECRET ออกจาก Messaging secret");
  const requiredTables = [
    ["jobs", "ตารางงานจริง"],
    ["line_conversations", "LINE conversations"],
    ["line_messages", "LINE messages"],
    ["ai_office_control_settings", "AI control settings"],
    ["ai_auto_safe_reply_playbooks", "Auto Safe Playbook"],
    ["ai_auto_safe_reply_logs", "Auto Safe logs"],
    ["ai_auto_safe_quality_feedback", "Quality feedback"],
    ["ai_auto_safe_playbook_suggestions", "Playbook suggestions"],
    ["ai_reply_decision_logs", "Reply decision logs"],
    ["ai_agent_chat_memory", "Agent chat memory"],
    ["ai_brain_items", "AI Brain items"],
    ["ai_training_auto_answers", "AI auto internal training answers"],
    ["ai_training_conversation_settings", "AI per-conversation training settings"],
    ["ai_office_work_action_logs", "AI Office action logs"],
  ];
  for (const [table, label] of requiredTables) {
    let ok = false;
    try { ok = await tableExists(pool, table); } catch (_) { ok = false; }
    add(`table_${table}`, label, ok, `ยังไม่พบ ${table} ให้ run migration ที่เกี่ยวข้องก่อน deploy ใช้งานจริง`);
  }
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    reply_tone: getReplyTone(),
    webhook_url: "/line/webhook",
    setup_notes: [
      "ตั้งค่า LINE webhook URL ไปที่ https://<your-domain>/line/webhook",
      "ใส่ OPENAI_API_KEY, AI_OFFICE_MODEL, LINE_CHANNEL_ACCESS_TOKEN, LINE_MESSAGING_CHANNEL_SECRET ใน Render",
      "รัน migrations V13-V19 และ V25-V27 ที่ยังไม่เคยรัน",
      "ใช้ Kill Switch ใน LINE OA Control หากต้องหยุด Auto Safe ทันที"
    ],
    checks
  };
}

async function loadSummary(pool) {
  const done = isDoneStatusExpr("j");
  const canceled = isCanceledStatusExpr("j");
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE j.appointment_datetime IS NOT NULL
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
          AND NOT ${canceled}
      )::int AS today_count,
      COUNT(*) FILTER (
        WHERE j.appointment_datetime IS NOT NULL
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = ((NOW() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '1 day')
          AND NOT ${canceled}
      )::int AS tomorrow_count,
      COUNT(*) FILTER (
        WHERE NOT ${canceled}
          AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
      )::int AS unpaid_count,
      COUNT(*) FILTER (
        WHERE NOT ${canceled}
          AND NOT ${done}
      )::int AS open_count
    FROM public.jobs j
  `);
  return r.rows[0] || { today_count: 0, tomorrow_count: 0, unpaid_count: 0, open_count: 0 };
}

function getAgent(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  return AI_OFFICE_AGENTS[key] || AI_OFFICE_AGENTS.admin;
}

function getLineAgent(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  if (key === "sales") return AI_OFFICE_AGENTS.sales;
  if (key === "ops") return AI_OFFICE_AGENTS.ops;
  return AI_OFFICE_AGENTS.admin;
}

function buildGroundedPrompt(question, context, agent) {
  const officeInstructions = [
    `Business timezone: ${BANGKOK_TZ}. All user-facing dates and times must use appointment_display or appointment_time_th. Never show raw UTC timestamps to the admin or customer.`,
    "For queue/technician availability questions, use context.availability as the deterministic source. If it says job_schedule_only or missing data, do not confirm exact availability.",
    "For service, price, objection, and customer-reply questions, use context.cwf_core_brain as the first source of truth, then context.cwf_knowledge as static fallback. It overrides old chat history.",
    "If agent is Office Chat, detect and combine relevant departments from context.office_chat_agents, then include a short line starting with แผนกที่เกี่ยวข้อง:",
    "Sales/customer replies must sound like a real LINE admin: short, natural Thai, usually 1-4 lines, price first when asked, one missing question at a time.",
    "Never reveal raw retrieved customer chat examples or private customer data.",
  ];
  return [
    ...officeInstructions,
    "คุณคือผู้ช่วยออฟฟิศภายในของ Coldwindflow Air Services สำหรับแอดมินเท่านั้น",
    `แผนกที่เลือก: ${agent.name}`,
    `บทบาท: ${agent.role}`,
    "ตอบเป็นภาษาไทยแบบมืออาชีพ กระชับ ใช้งานได้จริง",
    "ใช้เฉพาะข้อมูลจริงใน JSON ด้านล่าง ห้ามแต่งข้อมูลเพิ่ม ห้ามอ้างว่ามีข้อมูลที่ไม่มีใน JSON",
    "ถ้าข้อมูลไม่พอให้บอกว่าข้อมูลไม่พอและถามแอดมินว่าต้องการค้นเบอร์/เปิดใบงานใดเพิ่ม",
    "ถ้าร่างข้อความลูกค้าหรือช่าง ให้เขียนเป็นข้อความพร้อมคัดลอก ไม่ใส่คำอธิบายเชิงระบบ",
    "ห้ามสั่งแก้สถานะ ห้ามบอกว่าระบบส่งข้อความแล้ว เพราะ Phase 1 เป็นอ่านอย่างเดียว",
    "",
    `คำถามแอดมิน: ${cleanText(question, 1200)}`,
    "",
    "ข้อมูลจริงจากระบบ:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function buildLineDraftPrompt({ conversation, messages, agent, instruction, threadContext }) {
  return [
    `Business timezone: ${BANGKOK_TZ}. Use Thai local time only; never show raw UTC timestamps.`,
    "Return STRICT JSON only. No markdown, no prose outside JSON.",
    "JSON schema: {\"customer_reply\":\"string\",\"admin_summary\":[\"short bullet\"],\"missing_info\":[\"short bullet\"],\"next_step\":\"string\",\"customer_language\":\"th|en|ja|zh|ko|unknown\",\"is_foreign_customer\":true,\"foreign_customer_label\":\"string\",\"original_message\":\"string\",\"thai_translation\":\"string\"}",
    "Use CWF Core Brain and current CWF service/pricing knowledge with short LINE admin tone. Do not use old chat prices as facts.",
    "If thread_context.reply_examples exists, use only final_admin_reply as trusted admin style examples. They are sanitized style memory, not factual pricing. Current CWF knowledge overrides them.",
    "Customer Inbox isolation rule: use only this selected conversation, selected customer context, CWF knowledge, and linked jobs in this JSON. Do not use any other customer's conversation.",
    "Phase 1 rule: draft copy-ready replies only. Do not claim a LINE message was sent, do not open a booking, and do not change any job/customer status.",
    "Reply style: short, natural, polite, usually 1-4 lines. Ask only one missing question at a time.",
    thaiToneInstruction(),
    "customer_reply must contain only the final customer-facing message. Do not include admin_summary, missing_info, next_step, or internal notes inside customer_reply.",
    "customer_reply must not contain headings, bullets, JSON keys, the words สรุป, ข้อมูลที่ยังขาด, หมายเหตุสำหรับแอดมิน, แนะนำขั้นต่อไป, customer_reply, or admin_summary.",
    "If the customer asks price, answer the current CWF price first from cwf_knowledge, then ask one useful missing detail if needed.",
    "If the customer says expensive, explain value briefly and naturally, then offer a lower option when available.",
    "If the latest customer message is English, customer_reply must be English. If Japanese, reply Japanese if possible, otherwise English. For foreign customers, include thai_translation for admin.",
    threadContext?.cwf_core_brain ? formatCoreBrainForPrompt(threadContext.cwf_core_brain) : "CWF_CORE_BRAIN: not loaded",
    JSON.stringify({ cwf_knowledge: serviceKnowledge() }, null, 2),
    "คุณคือผู้ช่วย AI ภายในของ Coldwindflow Air Services สำหรับช่วยแอดมินอ่านแชท LINE OA เท่านั้น",
    `บทบาทที่เลือก: ${agent.name}`,
    `หน้าที่: ${agent.role}`,
    "ใช้เฉพาะข้อมูลแชท LINE ที่ส่งมาใน JSON นี้ ห้ามแต่งข้อมูลเพิ่ม",
    "ห้ามบอกว่าระบบส่งข้อความแล้ว ห้ามสร้างงาน ห้ามแก้ใบงาน ห้ามเปลี่ยนสถานะ",
    "ตอบเป็นภาษาไทยแบบมืออาชีพ กระชับ ใช้งานจริงได้",
    `คำสั่งแอดมินเพิ่มเติม: ${cleanText(instruction, 1000) || "-"}`,
    "",
    "ข้อมูลแชทจริง:",
    JSON.stringify({ conversation, messages, thread_context: threadContext }, null, 2),
  ].join("\n");
}

function callOpenAI({ apiKey, model, prompt, system, responseFormat }) {
  const requestPayload = {
    model,
    messages: [
      { role: "system", content: system || "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  };
  if (responseFormat) requestPayload.response_format = responseFormat;
  const payload = JSON.stringify(requestPayload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(createAiOfficeError(parsed?.error?.message || "OPENAI_REQUEST_FAILED", 502));
        }
        const answer = parsed?.choices?.[0]?.message?.content;
        if (!answer) return reject(createAiOfficeError("OPENAI_EMPTY_RESPONSE", 502));
        return resolve(String(answer).trim());
      });
    });
    req.on("timeout", () => req.destroy(createAiOfficeError("OPENAI_TIMEOUT", 504)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function detectCustomerLanguage(text) {
  const value = String(text || "");
  if (/[\u3040-\u30ff]/.test(value)) return "ja";
  if (/[\u3400-\u9fff]/.test(value)) return "zh";
  if (/[\uac00-\ud7af]/.test(value)) return "ko";
  if (/[A-Za-z]/.test(value) && !/[\u0E00-\u0E7F]/.test(value)) return "en";
  if (/[\u0E00-\u0E7F]/.test(value)) return "th";
  return "unknown";
}


function customerReplyTone() {
  const tone = String(process.env.AI_OFFICE_REPLY_TONE || process.env.CWF_REPLY_TONE || "female").trim().toLowerCase();
  if (["male", "female", "neutral", "auto"].includes(tone)) return tone;
  return "female";
}

function thaiToneInstruction() {
  const tone = customerReplyTone();
  if (tone === "male") return "Thai customer_reply must use polite male/admin tone: ครับ, นะครับ, ได้เลยครับ. Avoid ค่ะ/นะคะ.";
  if (tone === "neutral") return "Thai customer_reply must be polite, natural, and ready to send. Do not force a gendered ending if it makes the message unnatural.";
  if (tone === "auto") return "Thai customer_reply must be polite, natural, and ready to send. Choose ครับ/ค่ะ consistently from available admin style examples when clear; otherwise use neutral polite Thai.";
  return "Thai customer_reply must use polite female/admin tone: ค่ะ, นะคะ, ได้เลยค่ะ, ขอบคุณค่ะ. Avoid ครับ/นะครับ.";
}

function applyThaiReplyTone(text) {
  let out = cleanText(text, 2000);
  const tone = customerReplyTone();
  if (!hasThaiText(out)) return out;
  if (tone === "male") {
    out = out
      .replace(/นะคะ/g, "นะครับ")
      .replace(/ค่ะ/g, "ครับ")
      .replace(/คะ/g, "ครับ")
      .replace(/ได้เลยครับครับ/g, "ได้เลยครับ")
      .replace(/ครับครับ/g, "ครับ")
      .trim();
    if (!/(ครับ)(\s|$|[.!?…🙏])/.test(out)) out = `${out}ครับ`;
    return out;
  }
  if (tone === "female") {
    out = out
      .replace(/นะครับ/g, "นะคะ")
      .replace(/ครับ/g, "ค่ะ")
      .replace(/ได้เลยค่ะค่ะ/g, "ได้เลยค่ะ")
      .replace(/ค่ะค่ะ/g, "ค่ะ")
      .replace(/คะค่ะ/g, "คะ")
      .trim();
    if (!/(ค่ะ|คะ)(\s|$|[.!?…🙏])/.test(out)) out = `${out}ค่ะ`;
    return out;
  }
  return out.replace(/ค่ะค่ะ/g, "ค่ะ").replace(/ครับครับ/g, "ครับ").trim();
}

function latestCustomerMessage(messages) {
  return [...(messages || [])].reverse().find((m) => m.direction === "inbound" && (m.message_text || m.message_text_for_admin)) || {};
}

function fallbackLineDraft({ conversation, messages, threadContext }) {
  const latest = latestCustomerMessage(messages);
  const original = cleanText(latest.message_text || latest.message_text_for_admin || conversation?.last_message_text, 1000);
  const language = detectCustomerLanguage(original);
  const isForeign = Boolean(latest.is_foreign_customer || language !== "th" && language !== "unknown");
  const missing = threadContext?.customer_context?.missing_information || ["พื้นที่/ที่อยู่", "ประเภทงาน", "จำนวนเครื่อง", "วันเวลาที่สะดวก"];
  const reply = ["en", "ja", "zh", "ko"].includes(language)
    ? "Hello, could you please share the service area, number of air conditioners, and preferred date/time? Our admin will check the queue and details for you."
    : applyThaiReplyTone("สวัสดีค่ะ รบกวนแจ้งพื้นที่ให้บริการ จำนวนเครื่อง และวันเวลาที่สะดวกเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินตรวจสอบคิวและแจ้งรายละเอียดให้นะคะ");
  return {
    customer_reply: reply,
    admin_summary: [original ? "ลูกค้าส่งข้อความเข้ามา ต้องรอข้อมูลเพิ่มเติมก่อนตอบราคา/คิวให้ชัดเจน" : "ยังไม่มีข้อความลูกค้าที่อ่านได้"],
    missing_info: missing,
    next_step: "ขอข้อมูลที่จำเป็นจากลูกค้าก่อนเสนอราคาและนัดหมาย",
    customer_language: language,
    is_foreign_customer: isForeign,
    foreign_customer_label: isForeign ? foreignCustomerLabel(conversation) : "",
    original_message: original,
    thai_translation: latest.thai_translation || "",
  };
}

function normalizeLineDraftPayload(payload, fallback) {
  const language = cleanText(payload?.customer_language, 20) || fallback.customer_language;
  const out = {
    customer_reply: sanitizeCustomerReply(cleanText(payload?.customer_reply, 2000), fallback, language),
    admin_summary: Array.isArray(payload?.admin_summary) ? payload.admin_summary.map((x) => cleanText(x, 300)).filter(Boolean).slice(0, 6) : fallback.admin_summary,
    missing_info: Array.isArray(payload?.missing_info) ? payload.missing_info.map((x) => cleanText(x, 200)).filter(Boolean).slice(0, 8) : fallback.missing_info,
    next_step: cleanText(payload?.next_step, 500) || fallback.next_step,
    customer_language: language,
    is_foreign_customer: Boolean(payload?.is_foreign_customer ?? fallback.is_foreign_customer),
    foreign_customer_label: cleanText(payload?.foreign_customer_label, 200) || fallback.foreign_customer_label,
    original_message: cleanText(payload?.original_message, 1000) || fallback.original_message,
    thai_translation: cleanText(payload?.thai_translation, 1000) || fallback.thai_translation,
  };
  return out;
}

function sanitizeCustomerReply(reply, fallback, language) {
  let text = cleanText(reply, 2000);
  const isThai = (language || fallback?.customer_language) === "th" || hasThaiText(text);
  const reportLike = !text ||
    /(^|\n)\s*[-*•]/.test(text) ||
    /(สรุป|ข้อมูลที่ยังขาด|หมายเหตุสำหรับแอดมิน|แนะนำขั้นต่อไป|customer_reply|admin_summary|missing_info|next_step|```|\{|\})/i.test(text);
  if (reportLike) text = fallback.customer_reply;
  text = text
    .replace(/^\s*(ข้อความพร้อมส่งลูกค้า|ข้อความพร้อมตอบ)\s*[:：-]?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (isThai) text = applyThaiReplyTone(text);
  return cleanText(text, 2000) || fallback.customer_reply;
}

function lineDraftResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "cwf_line_reply_draft",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          customer_reply: { type: "string" },
          admin_summary: { type: "array", items: { type: "string" } },
          missing_info: { type: "array", items: { type: "string" } },
          next_step: { type: "string" },
          customer_language: { type: "string", enum: ["th", "en", "ja", "zh", "ko", "unknown"] },
          is_foreign_customer: { type: "boolean" },
          foreign_customer_label: { type: "string" },
          original_message: { type: "string" },
          thai_translation: { type: "string" },
        },
        required: ["customer_reply", "admin_summary", "missing_info", "next_step", "customer_language", "is_foreign_customer", "foreign_customer_label", "original_message", "thai_translation"],
      },
    },
  };
}

function parseLineDraftAnswer(answer, fallback) {
  const raw = String(answer || "").trim();
  try {
    return normalizeLineDraftPayload(JSON.parse(raw), fallback);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return normalizeLineDraftPayload(JSON.parse(match[0]), fallback); } catch (__) {}
    }
  }
  return normalizeLineDraftPayload({}, fallback);
}

async function translateLineMessageToThai(text, { apiKey, model }) {
  const source = cleanText(text, 2000);
  if (!source || !apiKey || hasThaiText(source)) return "";
  const cacheKey = `${model}:${source}`;
  if (lineTranslationCache.has(cacheKey)) return lineTranslationCache.get(cacheKey);
  try {
    const translated = await callOpenAI({
      apiKey,
      model,
      prompt: [
        "Translate this customer LINE message into Thai for a CWF admin.",
        "Return only the Thai translation. Do not add facts, actions, or formatting.",
        "",
        source,
      ].join("\n"),
    });
    const safe = cleanText(translated, 2000);
    lineTranslationCache.set(cacheKey, safe);
    if (lineTranslationCache.size > 200) lineTranslationCache.clear();
    return safe;
  } catch (_) {
    return "";
  }
}

async function enrichLineMessageForAdmin(message, conversation, deps) {
  const original = cleanText(message?.message_text, 4000);
  const isForeign = message?.direction === "inbound" && isLikelyForeignCustomerText(original);
  const thaiTranslation = isForeign ? await translateLineMessageToThai(original, deps) : "";
  const label = isForeign ? foreignCustomerLabel(conversation) : "";
  return {
    ...message,
    is_foreign_customer: isForeign,
    foreign_customer_label: label,
    original_message_text: isForeign ? original : "",
    thai_translation: thaiTranslation,
    message_text_for_admin: isForeign
      ? [label, thaiTranslation ? `Thai translation: ${thaiTranslation}` : "", `Original: ${original}`].filter(Boolean).join("\n")
      : original,
  };
}

async function enrichLineMessagesForAdmin(messages, conversation, deps) {
  const out = [];
  for (const message of messages || []) {
    out.push(await enrichLineMessageForAdmin(message, conversation, deps));
  }
  return out;
}

async function enrichLineInboxForAdmin(conversations, deps) {
  const out = [];
  for (const conversation of conversations || []) {
    const probe = { direction: "inbound", message_text: conversation.last_message_text || "" };
    const enriched = await enrichLineMessageForAdmin(probe, conversation, deps);
    out.push({
      ...conversation,
      is_foreign_customer: enriched.is_foreign_customer,
      foreign_customer_label: enriched.foreign_customer_label,
      original_message_text: enriched.original_message_text,
      thai_translation: enriched.thai_translation,
      message_text_for_admin: enriched.message_text_for_admin,
    });
  }
  return out;
}

function shouldAttachLineContext(agentKey, question) {
  const key = String(agentKey || "").trim().toLowerCase();
  const q = String(question || "").trim().toLowerCase();
  if (["admin", "sales", "ops", "content"].includes(key)) return true;
  return /line|ไลน์|แชท|chat|inbox|ลูกค้าทัก|ต่างชาติ|แปล|translation/.test(q);
}

async function loadRecentLineContext(pool, deps) {
  await ensureLineInboxSchemaOnce(pool);
  const conversations = await loadLineInbox(pool, 5);
  const detailed = [];
  for (const conversation of conversations.slice(0, 3)) {
    const messages = await loadLineMessages(pool, conversation.id, 12);
    detailed.push({
      conversation,
      messages: await enrichLineMessagesForAdmin(messages, conversation, deps),
    });
  }
  return { available: true, conversations, recent_conversations: detailed };
}

async function loadReplyStyleMemory(pool, question) {
  const intent = detectCustomerIntent(question);
  const memory = {
    approved_examples: serviceKnowledge().approved_reply_style,
    saved_examples: [],
    sanitized_real_examples: [],
    source_note: "Current CWF knowledge is factual source of truth. Real chat examples are sanitized weak style references only.",
  };
  try {
    memory.saved_examples = await loadSavedReplyExamples(pool, intent, 8);
  } catch (_) {
    memory.saved_examples = [];
  }
  try {
    await ensureLineInboxSchemaOnce(pool);
    const r = await pool.query(`
      WITH ordered AS (
        SELECT conversation_id, direction, message_text, received_at,
               LEAD(direction) OVER (PARTITION BY conversation_id ORDER BY received_at ASC NULLS LAST, created_at ASC) AS next_direction,
               LEAD(message_text) OVER (PARTITION BY conversation_id ORDER BY received_at ASC NULLS LAST, created_at ASC) AS next_text
          FROM public.line_messages
         WHERE message_text IS NOT NULL
      )
      SELECT message_text AS customer_message, next_text AS admin_reply
        FROM ordered
       WHERE direction='inbound'
         AND next_direction IN ('outbound','admin','reply')
         AND next_text IS NOT NULL
       ORDER BY received_at DESC NULLS LAST
       LIMIT 24
    `);
    memory.sanitized_real_examples = (r.rows || [])
      .map((row) => filterReplyExample(row.customer_message, row.admin_reply))
      .filter(Boolean)
      .slice(0, 8);
  } catch (_) {
    memory.source_note = "No readable admin reply history found; using approved examples and current CWF knowledge only.";
  }
  memory.intent = intent;
  memory.intent_agents = routeOfficeIntent(question);
  return memory;
}

function inferBuckets(question) {
  const q = String(question || "").toLowerCase();
  const buckets = new Set();
  if (q.includes("พรุ่งนี้") || q.includes("tomorrow")) buckets.add("tomorrow");
  if (q.includes("วันนี้") || q.includes("today") || q.includes("ระวัง")) buckets.add("today");
  if (q.includes("ยังไม่จ่าย") || q.includes("ไม่จ่าย") || q.includes("unpaid") || q.includes("payment")) buckets.add("unpaid");
  if (q.includes("ยังไม่ปิด") || q.includes("เปิด") || q.includes("open") || q.includes("ค้าง")) buckets.add("open");
  if (!buckets.size) {
    buckets.add("today");
    buckets.add("tomorrow");
    buckets.add("unpaid");
    buckets.add("open");
  }
  return Array.from(buckets);
}

function readAiOfficeFile(relativePath) {
  const fullPath = path.join(AI_OFFICE_ROOT_DIR, relativePath);
  if (!fullPath.startsWith(AI_OFFICE_ROOT_DIR)) throw createAiOfficeError("INVALID_DIAGNOSTIC_PATH", 400);
  return fs.readFileSync(fullPath, "utf8");
}

function toLocalAssetPath(assetUrl) {
  const clean = String(assetUrl || "").split("?")[0].trim();
  if (!clean.startsWith("/assets/ai-office-final/")) return null;
  return path.join(AI_OFFICE_ROOT_DIR, clean.replace(/^\//, ""));
}

function collectManifestAssetPaths(value, out = []) {
  if (!value) return out;
  if (typeof value === "string") {
    if (value.startsWith("/assets/ai-office-final/")) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectManifestAssetPaths(item, out));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectManifestAssetPaths(item, out));
  }
  return out;
}

function diagnosticItem(id, label, passed, detail, extra = {}) {
  return {
    id,
    label,
    status: passed ? "pass" : "fail",
    detail: String(detail || ""),
    ...extra,
  };
}

function buildDeployFixPrompt(items, risks) {
  const failed = items.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.detail}`);
  const riskLines = (risks || []).map((risk) => `${risk.label}: ${risk.detail}`);
  return [
    "CWF AI Office production issue. Fix only read-only Phase 1 behavior.",
    "Do not add write SQL, schema changes, external message sending, fake data, or frontend secrets.",
    "Check these diagnostics:",
    ...(failed.length ? failed : ["No failed diagnostics. Review risks only."]),
    ...(riskLines.length ? ["Risks:", ...riskLines] : []),
    "Keep /admin/ai-office protected by admin auth and optional AI Office PIN.",
    "Run syntax checks and verify final assets, service worker cache bypass, and mobile layout before committing.",
  ].join("\n");
}

function extractSqlLikeFragments(source) {
  const fragments = [];
  const templateMatches = String(source || "").match(/`[\s\S]*?`/g) || [];
  templateMatches.forEach((block) => {
    if (/\b(select|from|where|join|group by|order by|limit)\b/i.test(block)) fragments.push(block);
  });
  return fragments.join("\n");
}

async function runAiOfficeDiagnostics({ pool, req }) {
  const items = [];
  const risks = [];
  const root = AI_OFFICE_ROOT_DIR;
  const width = Number(req.body?.viewport_width || req.query?.viewport_width || 0);
  const safePhone = cleanText(req.body?.phone || req.query?.phone, 80);

  const htmlExists = fs.existsSync(path.join(root, "admin-ai-office.html"));
  const jsExists = fs.existsSync(path.join(root, "admin-ai-office.js"));
  items.push(diagnosticItem(
    "page",
    "หน้า /admin/ai-office",
    htmlExists && jsExists,
    htmlExists && jsExists ? "ไฟล์หน้าและสคริปต์หลักพร้อมใช้งานหลังผ่านแอดมิน" : "ไม่พบไฟล์หน้า AI Office หรือสคริปต์หลัก"
  ));

  try {
    const summary = await loadSummary(pool);
    items.push(diagnosticItem("summary", "API summary", true, "อ่านสรุปงานจริงได้", { summary }));
  } catch (e) {
    items.push(diagnosticItem("summary", "API summary", false, e.message || "อ่าน summary ไม่สำเร็จ"));
  }

  const hasServerKey = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  items.push(diagnosticItem(
    "ask",
    "Ask endpoint และ OpenAI ฝั่ง server",
    hasServerKey,
    hasServerKey ? "endpoint พร้อมเรียก OpenAI จาก backend เท่านั้น ไม่ส่งค่า secret ออกไป" : "ยังไม่ได้ตั้งค่า OpenAI key ใน environment"
  ));

  if (onlyDigits(safePhone).length >= 6) {
    try {
      const jobs = await loadJobs(pool, "phone", safePhone);
      items.push(diagnosticItem("phone", "Phone search", true, `ค้นด้วยเบอร์ที่แอดมินกรอกได้ ${jobs.length} งาน`));
    } catch (e) {
      items.push(diagnosticItem("phone", "Phone search", false, e.message || "ค้นเบอร์ไม่สำเร็จ"));
    }
  } else {
    items.push(diagnosticItem("phone", "Phone search", true, "ข้ามการค้นเบอร์ เพราะยังไม่ได้กรอกเบอร์อย่างน้อย 6 ตัวเลข"));
  }

  let manifest = null;
  let manifestPaths = [];
  try {
    manifest = JSON.parse(readAiOfficeFile("assets/ai-office-final/manifest.json"));
    manifestPaths = collectManifestAssetPaths(manifest);
    const missing = manifestPaths.filter((assetPath) => {
      const localPath = toLocalAssetPath(assetPath);
      return !localPath || !fs.existsSync(localPath);
    });
    items.push(diagnosticItem(
      "manifest",
      "Asset manifest",
      missing.length === 0,
      missing.length ? `พบ asset หาย ${missing.length} ไฟล์` : `manifest พร้อม มี asset ${manifestPaths.length} ไฟล์`,
      { missing_assets: missing }
    ));
  } catch (e) {
    items.push(diagnosticItem("manifest", "Asset manifest", false, e.message || "อ่าน manifest ไม่สำเร็จ", { missing_assets: [] }));
  }

  const requiredImages = [
    "/assets/ai-office-final/maps/office-main-desktop.png",
    "/assets/ai-office-final/maps/office-main-mobile.png",
    "/assets/ai-office-final/brand/logo-main.png",
    "/assets/ai-office-final/ui/selection-ring.png",
    ...["admin", "sales", "ops", "ads", "content", "dev"].map((role) => `/assets/ai-office-final/characters/${role}/idle.png`),
  ];
  const missingImages = requiredImages.filter((assetPath) => {
    const localPath = toLocalAssetPath(assetPath);
    return !localPath || !fs.existsSync(localPath);
  });
  items.push(diagnosticItem(
    "images",
    "Image asset loading",
    missingImages.length === 0,
    missingImages.length ? `พบรูปหลักหาย ${missingImages.length} ไฟล์` : "รูปหลักของ office และ NPC ครบ",
    { missing_assets: missingImages }
  ));

  try {
    const sw = readAiOfficeFile("sw.js");
    const cacheMatch = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
    const bypassesAiOffice = sw.includes("/admin/ai-office/") && sw.includes("/assets/ai-office-final/");
    items.push(diagnosticItem(
      "cache",
      "Cache / Service Worker",
      Boolean(cacheMatch && bypassesAiOffice),
      cacheMatch && bypassesAiOffice ? `cache version ${cacheMatch[1]} และ bypass AI Office แล้ว` : "ยังไม่พบ cache version หรือ bypass AI Office ใน service worker",
      { cache_name: cacheMatch?.[1] || "" }
    ));
  } catch (e) {
    items.push(diagnosticItem("cache", "Cache / Service Worker", false, e.message || "อ่าน service worker ไม่สำเร็จ"));
  }

  try {
    const frontendSource = AI_OFFICE_FRONTEND_FILES.map(readAiOfficeFile).join("\n");
    const keyNeedle = "OPENAI" + "_API_KEY";
    items.push(diagnosticItem(
      "frontend_secret",
      "Frontend source secret scan",
      !frontendSource.includes(keyNeedle),
      frontendSource.includes(keyNeedle) ? "พบชื่อ key ใน frontend source" : "ไม่พบชื่อ key ใน frontend source"
    ));
    const lower = frontendSource.toLowerCase();
    const foundForbidden = AI_OFFICE_FORBIDDEN_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    items.push(diagnosticItem(
      "wording",
      "คำต้องห้ามใน UI",
      foundForbidden.length === 0,
      foundForbidden.length ? `พบคำต้องห้าม ${foundForbidden.length} รายการ` : "ไม่พบคำต้องห้ามในไฟล์ UI",
      { found_terms: foundForbidden }
    ));
  } catch (e) {
    items.push(diagnosticItem("frontend_secret", "Frontend source secret scan", false, e.message || "อ่าน frontend source ไม่สำเร็จ"));
    items.push(diagnosticItem("wording", "คำต้องห้ามใน UI", false, e.message || "อ่าน UI source ไม่สำเร็จ"));
  }

  try {
    const routeSource = readAiOfficeFile("server/routes/adminAiOfficeReadOnly.js");
    const sqlSource = extractSqlLikeFragments(routeSource);
    const suspicious = AI_OFFICE_MUTATING_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`, "i").test(sqlSource));
    const dynamicSql = /openai|prompt|question|answer/i.test(routeSource) && /pool\.query\([^`'"]/i.test(routeSource);
    items.push(diagnosticItem(
      "readonly",
      "API read-only",
      suspicious.length === 0 && !dynamicSql,
      suspicious.length || dynamicSql ? "พบความเสี่ยง mutating SQL หรือ query dynamic ใน AI Office route" : "ไม่พบ write SQL และไม่พบ AI สร้าง SQL ไปรัน",
      { suspicious_tokens: suspicious }
    ));
  } catch (e) {
    items.push(diagnosticItem("readonly", "API read-only", false, e.message || "อ่าน route ไม่สำเร็จ"));
  }

  const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());
  items.push(diagnosticItem(
    "auth_pin",
    "Auth / PIN",
    true,
    pinRequired ? "ผ่าน admin auth และมี AI Office PIN เพิ่มอีกชั้น" : "ผ่าน admin auth และไม่ได้ตั้ง PIN เพิ่ม"
  ));

  if (width && width < 360) {
    risks.push({ label: "Mobile layout", detail: `viewport ${width}px แคบมาก ควรทดสอบการแตะ NPC และ bottom console จริง` });
  } else {
    risks.push({ label: "Mobile layout", detail: width ? `viewport ${width}px อยู่ในช่วงที่รองรับ แต่ควรทดสอบบนเครื่องจริง` : "ยังไม่ได้ส่ง viewport width จาก frontend" });
  }

  const failed = items.filter((item) => item.status !== "pass");
  const prompt = buildDeployFixPrompt(items, risks);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    passed: failed.length === 0,
    items,
    summary: {
      pass: items.filter((item) => item.status === "pass").map((item) => item.label),
      fix: failed.map((item) => `${item.label}: ${item.detail}`),
      risks,
      prompt,
    },
  };
}

async function loadLineInbox(pool, limit) {
  const r = await pool.query(
    `SELECT c.id, c.line_user_id, c.display_name, c.picture_url, c.last_message_text,
            c.last_message_type, c.last_message_at, COUNT(m.id)::int AS message_count
       FROM public.line_conversations c
       LEFT JOIN public.line_messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
      LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    line_user_id_masked: maskLineUserId(row.line_user_id),
    display_name: row.display_name || "",
    picture_url: row.picture_url || "",
    last_message_text: row.last_message_text || "",
    last_message_type: row.last_message_type || "",
    last_message_at: row.last_message_at || null,
    message_count: Number(row.message_count || 0),
  }));
}

async function loadLineConversation(pool, conversationId) {
  const id = Number(conversationId || 0);
  if (!Number.isFinite(id) || id <= 0) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  const r = await pool.query(
    `SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at
       FROM public.line_conversations
      WHERE id=$1
      LIMIT 1`,
    [id]
  );
  const row = r.rows?.[0];
  if (!row) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  return {
    id: row.id,
    line_user_id_masked: maskLineUserId(row.line_user_id),
    display_name: row.display_name || "",
    picture_url: row.picture_url || "",
    last_message_text: row.last_message_text || "",
    last_message_type: row.last_message_type || "",
    last_message_at: row.last_message_at || null,
  };
}

async function loadLineMessages(pool, conversationId, limit) {
  const id = Number(conversationId || 0);
  if (!Number.isFinite(id) || id <= 0) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  const r = await pool.query(
    `SELECT id, conversation_id, direction, event_type, message_type, message_text, received_at, created_at
       FROM public.line_messages
      WHERE conversation_id=$1
      ORDER BY received_at DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [id, limit]
  );
  return (r.rows || []).reverse().map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction || "inbound",
    event_type: row.event_type || "",
    message_type: row.message_type || "",
    message_text: row.message_text || "",
    received_at: row.received_at || row.created_at || null,
    received_at_display: formatBangkokChatTime(row.received_at || row.created_at),
  }));
}

function extractThreadLookup(messages) {
  const text = (messages || []).map((m) => m.message_text || "").join("\n");
  const phone = onlyDigits((text.match(/0\d[\d\s.-]{7,12}\d/) || [])[0] || "");
  const bookingCode = cleanText((text.match(/\b([A-Z]{2,5}[-_]?\d{3,})\b/i) || [])[1] || "", 40);
  return { phone, bookingCode };
}

async function loadLinkedJobsForThread(pool, messages) {
  const { phone, bookingCode } = extractThreadLookup(messages);
  const params = [];
  const clauses = [];
  if (phone.length >= 6) {
    params.push(phone);
    clauses.push(`regexp_replace(COALESCE(j.customer_phone,''), '[^0-9]', '', 'g') LIKE '%' || $${params.length} || '%'`);
  }
  if (bookingCode) {
    params.push(bookingCode);
    clauses.push(`COALESCE(j.booking_code,'') ILIKE '%' || $${params.length} || '%'`);
  }
  if (!clauses.length) return [];
  const r = await pool.query(
    `${baseJobSelect()}
      WHERE (${clauses.join(" OR ")})
      ${baseJobGroupOrder("COALESCE(j.appointment_datetime, j.created_at) DESC NULLS LAST, j.job_id DESC")}`,
    params
  );
  return (r.rows || []).map(mapJob).slice(0, 8);
}

async function buildCustomerThreadContext(pool, conversation, messages) {
  const linkedJobs = await loadLinkedJobsForThread(pool, messages).catch(() => []);
  const card = extractCustomerContextFromMessages(messages, linkedJobs);
  const latest = [...(messages || [])].reverse().find((m) => m.message_text) || {};
  const hasInboundLatest = latest.direction === "inbound";
  const status = deriveConversationStatus({ latestText: latest.message_text || conversation.last_message_text, hasInboundLatest, linkedJob: linkedJobs[0] });
  card.customer_name = card.customer_name || conversation.display_name || "";
  card.current_status = status;
  return {
    thread_key: conversation.line_user_id_masked || `conversation-${conversation.id}`,
    conversation_id: conversation.id,
    conversation,
    customer_context: card,
    linked_jobs: linkedJobs,
    detected_intent: detectCustomerIntent(latest.message_text || conversation.last_message_text),
    priority_flags: detectPriorityFlags({
      latestText: latest.message_text || conversation.last_message_text,
      lastMessageAt: latest.received_at || conversation.last_message_at,
      isForeign: Boolean(latest.is_foreign_customer || conversation.is_foreign_customer),
    }),
    status,
  };
}

async function enrichLineInboxMetadata(pool, conversations, deps) {
  const out = [];
  for (const conversation of conversations || []) {
    const messages = await loadLineMessages(pool, conversation.id, 8).catch(() => []);
    const enrichedMessages = await enrichLineMessagesForAdmin(messages, conversation, deps);
    const thread = await buildCustomerThreadContext(pool, conversation, enrichedMessages);
    out.push({
      ...conversation,
      last_message_at_display: formatBangkokChatTime(conversation.last_message_at),
      unread: thread.status === "unread" || thread.status === "needs_reply",
      conversation_status: thread.status,
      detected_intent: thread.detected_intent,
      priority_flags: thread.priority_flags,
      customer_context: thread.customer_context,
    });
  }
  return out;
}

async function getLineConnectorStatus(pool) {
  await ensureLineInboxSchemaOnce(pool);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS conversation_count, MAX(last_message_at) AS latest_message_at
       FROM public.line_conversations`
  );
  const row = r.rows?.[0] || {};
  return {
    configured: Boolean(String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim()),
    channel_secret_present: Boolean(String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim()),
    access_token_present: Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()),
    webhook_path: "/line/webhook",
    schema_ready: true,
    conversation_count: Number(row.conversation_count || 0),
    latest_message_at: row.latest_message_at || null,
  };
}

async function buildConnectorStatus(pool) {
  const connectors = {
    cwf_database: { connected: false, summary_readable: false },
    line_oa: { configured: false, schema_ready: false },
    openai: {
      configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
      model: String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL,
    },
    google_ads: {
      configured: Boolean(
        String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim()
        && String(process.env.GOOGLE_ADS_CUSTOMER_ID || "").trim()
      ),
      developer_token_present: Boolean(String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim()),
      customer_id_present: Boolean(String(process.env.GOOGLE_ADS_CUSTOMER_ID || "").trim()),
      refresh_token_present: Boolean(String(process.env.GOOGLE_ADS_REFRESH_TOKEN || "").trim()),
    },
    github: {
      configured: Boolean(String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim()),
      token_present: Boolean(String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim()),
    },
    render: {
      configured: Boolean(String(process.env.RENDER_API_KEY || process.env.RENDER_TOKEN || "").trim()),
      api_key_present: Boolean(String(process.env.RENDER_API_KEY || process.env.RENDER_TOKEN || "").trim()),
      service_id_present: Boolean(String(process.env.RENDER_SERVICE_ID || process.env.RENDER_SERVICE_IDS || "").trim()),
    },
  };

  try {
    await pool.query("SELECT 1");
    await loadSummary(pool);
    connectors.cwf_database = { connected: true, summary_readable: true };
  } catch (e) {
    connectors.cwf_database = { connected: false, summary_readable: false, error: e.message || "database unavailable" };
  }

  try {
    connectors.line_oa = await getLineConnectorStatus(pool);
  } catch (e) {
    connectors.line_oa = {
      configured: Boolean(String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim()),
      channel_secret_present: Boolean(String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim()),
      access_token_present: Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()),
      webhook_path: "/line/webhook",
      schema_ready: false,
      error: e.message || "LINE inbox unavailable",
    };
  }

  return { ok: true, generated_at: new Date().toISOString(), connectors };
}

module.exports = function createAdminAiOfficeReadOnlyRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeReadOnlyRoutes requires pool and requireAdminSession");

  const router = express.Router();

  router.use("/admin/ai-office", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
    });
    next();
  });

  router.get("/admin/ai-office/config", requireAdminSession, (req, res) => {
    return res.json({
      ok: true,
      pin_required: false,
      model: String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim(),
      reply_tone: getReplyTone(),
    });
  });


  router.post("/admin/ai-office/work-actions", requireAdminSession, async (req, res) => {
    try {
      const body = req.body || {};
      const action = cleanText(body.action, 80);
      if (!action) return res.status(400).json({ ok: false, error: "MISSING_ACTION" });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.ai_office_work_action_logs (
          id BIGSERIAL PRIMARY KEY,
          page TEXT,
          action TEXT NOT NULL,
          job_id BIGINT,
          booking_code TEXT,
          customer_phone TEXT,
          payload JSONB DEFAULT '{}'::jsonb,
          actor TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const actor = cleanText(req.session?.user?.username || req.user?.username || req.session?.username || "admin", 120);
      const jobId = body.job_id && /^\d+$/.test(String(body.job_id)) ? Number(body.job_id) : null;
      await pool.query(
        `INSERT INTO public.ai_office_work_action_logs
          (page, action, job_id, booking_code, customer_phone, payload, actor)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [
          cleanText(body.page, 80),
          action,
          jobId,
          cleanText(body.booking_code, 120),
          cleanText(body.customer_phone, 80),
          JSON.stringify(body.payload || {}),
          actor
        ]
      );
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "SAVE_WORK_ACTION_FAILED" });
    }
  });


  router.get("/admin/ai-office/production-health", requireAdminSession, async (req, res) => {
    try {
      return res.json(await buildProductionHealth(pool));
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ตรวจ Production Health ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/connectors/status", requireAdminSession, async (req, res) => {
    try {
      return res.json(await buildConnectorStatus(pool));
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "AI Office connector status failed" });
    }
  });

  router.get("/admin/ai-office/summary", requireAdminSession, async (req, res) => {
    try {
      const summary = await loadSummary(pool);
      return res.json({ ok: true, summary });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/jobs", requireAdminSession, async (req, res) => {
    try {
      const bucket = cleanText(req.query.bucket, 40);
      const jobs = await loadJobs(pool, bucket, req.query.phone);
      return res.json({ ok: true, bucket, jobs });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อมูลงานไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/search-by-phone", requireAdminSession, async (req, res) => {
    try {
      const phone = cleanText(req.query.phone, 80);
      const jobs = await loadJobs(pool, "phone", phone);
      return res.json({ ok: true, jobs });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ค้นงานไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/diagnostics", requireAdminSession, async (req, res) => {
    try {
      const result = await runAiOfficeDiagnostics({ pool, req });
      return res.json(result);
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ตรวจระบบ AI Office ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/reply-learning/status", requireAdminSession, async (req, res) => {
    try {
      return res.json(await getReplyLearningStatus(pool));
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ตรวจระบบเรียนรู้คำตอบแอดมินไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/reply-examples", requireAdminSession, async (req, res) => {
    try {
      const examples = await listReplyExamples(pool, {
        active_only: req.query.active_only !== "false",
        agent_key: cleanText(req.query.agent_key, 40),
        situation_type: cleanText(req.query.situation_type, 80),
        search: cleanText(req.query.search, 160),
        limit: clampLimit(req.query.limit, 80, 200),
      });
      return res.json({ ok: true, examples });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_REPLY_EXAMPLES_FAILED" });
    }
  });

  router.post("/admin/ai-office/reply-examples", requireAdminSession, async (req, res) => {
    try {
      const example = await createReplyExample(pool, {
        ...(req.body || {}),
        created_by: req.session?.user?.username || req.session?.user?.email || req.session?.username || "",
        source: "admin_memory",
      });
      return res.json({ ok: true, example });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "SAVE_REPLY_EXAMPLE_FAILED" });
    }
  });

  router.patch("/admin/ai-office/reply-examples/:id", requireAdminSession, async (req, res) => {
    try {
      const example = await updateReplyExample(pool, req.params.id, req.body || {});
      return res.json({ ok: true, example });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "UPDATE_REPLY_EXAMPLE_FAILED" });
    }
  });

  router.patch("/admin/ai-office/reply-examples/:id/disable", requireAdminSession, async (req, res) => {
    try {
      const example = await disableReplyExample(pool, req.params.id);
      return res.json({ ok: true, example });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "DISABLE_REPLY_EXAMPLE_FAILED" });
    }
  });

  router.post("/admin/ai-office/reply-learning/event", requireAdminSession, async (req, res) => {
    try {
      const result = await logReplyLearningEvent(pool, {
        ...(req.body || {}),
        created_by: req.session?.user?.username || req.session?.user?.email || req.session?.username || "",
      });
      return res.json(result);
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "SAVE_REPLY_LEARNING_EVENT_FAILED" });
    }
  });

  router.post("/admin/ai-office/reply-learning/feedback", requireAdminSession, async (req, res) => {
    try {
      const result = await saveReplyFeedback(pool, req.body || {});
      return res.json(result);
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "บันทึก feedback ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/line-inbox", requireAdminSession, async (req, res) => {
    try {
      await ensureLineInboxSchemaOnce(pool);
      const limit = clampLimit(req.query.limit, 30, 100);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      const conversations = await enrichLineInboxMetadata(pool, await enrichLineInboxForAdmin(await loadLineInbox(pool, limit), { apiKey, model }), { apiKey, model });
      return res.json({ ok: true, conversations });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลด LINE inbox ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/line-conversations/:id/messages", requireAdminSession, async (req, res) => {
    try {
      await ensureLineInboxSchemaOnce(pool);
      const limit = clampLimit(req.query.limit, 50, 100);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      const conversation = await loadLineConversation(pool, req.params.id);
      const messages = await enrichLineMessagesForAdmin(await loadLineMessages(pool, req.params.id, limit), conversation, { apiKey, model });
      const thread_context = await buildCustomerThreadContext(pool, conversation, messages);
      return res.json({ ok: true, conversation, messages, thread_context });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อความ LINE ไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/line-draft-reply", requireAdminSession, async (req, res) => {
    try {
      await ensureLineInboxSchemaOnce(pool);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ ok: false, error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ AI Office" });

      const conversationId = Number(req.body?.conversation_id || 0);
      if (!Number.isFinite(conversationId) || conversationId <= 0) {
        return res.status(400).json({ ok: false, error: "กรุณาเลือกแชท LINE ก่อน" });
      }
      const agent = getLineAgent(req.body?.agent);
      const instruction = cleanText(req.body?.instruction || req.body?.admin_question, 1200);
      const conversation = await loadLineConversation(pool, conversationId);
      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      const messages = await enrichLineMessagesForAdmin(await loadLineMessages(pool, conversationId, 80), conversation, { apiKey, model });
      if (!messages.length) return res.status(400).json({ ok: false, error: "ยังไม่มีข้อความในแชทนี้" });
      const threadContext = await buildCustomerThreadContext(pool, conversation, messages);
      const latest = latestCustomerMessage(messages);
      const latestText = cleanText(latest.message_text_for_admin || latest.message_text || conversation.last_message_text, 1200);
      const situationType = detectCustomerIntent(`${latestText}\n${instruction}`);
      const customerLanguage = detectCustomerLanguage(latestText);
      const replyExamples = await loadMatchingReplyExamples(pool, {
        situation_type: situationType,
        language: customerLanguage,
        text: `${latestText}\n${instruction}`,
        limit: 5,
      }).catch(() => []);
      threadContext.reply_examples = replyExamples.map((example) => ({
        id: example.id,
        agent_key: example.agent_key,
        situation_type: example.situation_type,
        customer_message: example.customer_message,
        final_admin_reply: example.final_admin_reply,
        language: example.language,
        service_type: example.service_type,
        tags: example.tags,
      }));
      threadContext.cwf_core_brain = await buildCoreBrainContext(pool, {
        query: latestText,
        agent_key: req.body?.agent || "sales",
        language: customerLanguage,
        intent: situationType,
        limit: 14,
      });

      const lineSystem = [
        "You draft Coldwindflow LINE OA customer replies for an authenticated admin.",
        "Return strict JSON only.",
        "Use only the selected customer conversation and provided CWF data.",
        "Use active admin reply memory only as sanitized style examples. Never reveal examples or other customers.",
        "Do not claim messages were sent, bookings were created, or statuses were changed.",
        thaiToneInstruction(),
        "The customer_reply language must match the latest customer message language when possible.",
      ].join(" ");
      const linePrompt = buildLineDraftPrompt({ conversation, messages, agent, instruction, threadContext });
      let rawAnswer = "";
      try {
        rawAnswer = await callOpenAI({ apiKey, model, system: lineSystem, responseFormat: lineDraftResponseFormat(), prompt: linePrompt });
      } catch (structuredError) {
        if (!/response_format|json_schema|schema|unsupported|not support/i.test(String(structuredError?.message || ""))) throw structuredError;
        rawAnswer = await callOpenAI({ apiKey, model, system: lineSystem, prompt: linePrompt });
      }
      const draft = parseLineDraftAnswer(rawAnswer, fallbackLineDraft({ conversation, messages, threadContext }));
      const usedReplyExamples = threadContext.reply_examples.map((example) => ({
        id: example.id,
        situation_type: example.situation_type,
        service_type: example.service_type,
        language: example.language,
      }));
      draft.used_reply_examples = usedReplyExamples;
      if (usedReplyExamples.length) {
        await incrementReplyExampleUsage(pool, usedReplyExamples.map((example) => example.id)).catch(() => {});
        await logReplyLearningEvent(pool, {
          event_type: "examples_used",
          conversation_id: conversationId,
          agent_key: "sales",
          situation_type: situationType,
          customer_message: latestText,
          ai_reply: draft.customer_reply,
          source: "line_draft_reply",
          metadata: { example_ids: usedReplyExamples.map((example) => example.id), used_core_brain_item_ids: (threadContext.cwf_core_brain?.summary || []).map((x) => x.id).filter(Boolean) },
        }).catch(() => {});
      }
      draft.core_brain_used = (threadContext.cwf_core_brain?.summary || []).map((x) => ({ id:x.id, type:x.type, title:x.title, source:x.source }));
      return res.json({ ok: true, answer: draft.customer_reply, draft, used_reply_examples: usedReplyExamples, core_brain: threadContext.cwf_core_brain, conversation, messages, thread_context: threadContext, agent });
    } catch (e) {
      console.error("POST /admin/ai-office/line-draft-reply error:", e.message);
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ร่างข้อความจาก LINE ไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/ask", requireAdminSession, async (req, res) => {
    try {
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ ok: false, error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ AI Office" });

      const question = cleanText(req.body?.question, 1200);
      const agent = getAgent(req.body?.agent);
      const phone = cleanText(req.body?.phone, 80);
      if (!question) return res.status(400).json({ ok: false, error: "กรุณาพิมพ์คำถาม" });

      const summary = await loadSummary(pool);
      const buckets = inferBuckets(question);
      const context = {
        summary,
        buckets: {},
        phone_search: null,
        business_timezone: BANGKOK_TZ,
        generated_at: new Date().toISOString(),
        generated_at_display: formatThaiDateTime(new Date()),
        cwf_knowledge: serviceKnowledge(),
        cwf_core_brain: null,
      };
      for (const bucket of buckets) {
        context.buckets[bucket] = await loadJobs(pool, bucket);
      }
      if (onlyDigits(phone).length >= 6 || onlyDigits(question).length >= 6) {
        context.phone_search = await loadJobs(pool, "phone", phone || question);
      }

      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      context.cwf_core_brain = await buildCoreBrainContext(pool, { query: question, agent_key: req.body?.agent || "admin", language: "th", limit: 16 });
      if (agent.name === "Office Chat") {
        context.office_chat_agents = routeOfficeIntent(question);
      }
      if (looksLikeAvailabilityQuestion(question)) {
        const targetDate = parseThaiRelativeDate(question);
        const jobsForDate = await loadJobsForBangkokDate(pool, targetDate);
        const technicians = await loadTechniciansForAvailability(pool);
        context.availability = analyzeAvailability({ question, targetDate, jobs: jobsForDate, technicians });
      }
      if (["Admin AI", "Sales AI", "Office Chat"].includes(agent.name) || /ตอบลูกค้า|ลูกค้า|แพง|ราคา|reply|LINE|ไลน์/i.test(question)) {
        context.reply_style_memory = await loadReplyStyleMemory(pool, question);
      }
      if (shouldAttachLineContext(req.body?.agent, question)) {
        try {
          context.line = await loadRecentLineContext(pool, { apiKey, model });
        } catch (lineError) {
          context.line = { available: false, error: lineError.message || "LINE context unavailable" };
        }
      }
      const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });
      return res.json({ ok: true, answer, context, agent });
    } catch (e) {
      console.error("POST /admin/ai-office/ask error:", e);
      return res.status(e.status || 500).json({ ok: false, error: e.message || "AI Office ตอบไม่ได้ในขณะนี้" });
    }
  });

  return router;
};
