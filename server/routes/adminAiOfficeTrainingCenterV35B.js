const express = require("express");
const https = require("https");
const { createReplyExample, logReplyLearningEvent, listReplyExamples } = require("../aiReplyLearning");
const { buildCoreBrainContext, formatCoreBrainForPrompt, saveCoreBrainLesson } = require("../aiOfficeCoreBrain");
const {
  ensureAutoTrainingSchema,
  setTrainingConversationMode,
  buildAndSaveInternalAnswer,
  listAutoTrainingAnswers,
  updateAutoTrainingFeedback,
} = require("../aiTrainingAutoReplyV36");

const BUILD = "phase35b2_training_backend_20260612";
const DEFAULT_MODEL = "gpt-4.1-mini";

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function hasThai(value) { return /[\u0E00-\u0E7F]/.test(String(value || "")); }
function detectLanguage(text) {
  const s = String(text || "");
  if (hasThai(s)) return "th";
  if (/[ぁ-ゟ゠-ヿ]/.test(s)) return "ja";
  if (/[\u4e00-\u9fff]/.test(s)) return "zh";
  if (/[A-Za-z]/.test(s)) return "en";
  return "unknown";
}
function inferSituation(text) {
  const s = String(text || "").toLowerCase();
  if (/แพง|ลด|ส่วนลด|ทำไมราคา/.test(s)) return "expensive";
  if (/ราคา|เท่าไหร่|กี่บาท|โปร|promotion|price|cost/.test(s)) return "price_question";
  if (/กลิ่น|เหม็น|อับ/.test(s)) return "bad_smell";
  if (/ไม่เย็น|ไม่ค่อยเย็น|ลมไม่เย็น|น้ำหยด|หยดน้ำ|รั่ว|เสียงดัง|เสีย|ซ่อม|error|e\d|h\d|f\d/.test(s)) return "repair_symptom";
  if (/นัด|คิว|ว่าง|วันไหน|เวลา|จอง|วันนี้|พรุ่งนี้/.test(s)) return "appointment";
  if (/ล้างแบบ|แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง/.test(s)) return "cleaning_package";
  if (/โวย|ร้องเรียน|ไม่พอใจ|เสียหาย|ช้า|แย่/.test(s)) return "complaint";
  if (/[a-z]{4,}/i.test(s) && !/[ก-๙]/.test(s)) return "foreign_customer";
  return "general";
}
function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}
function clamp(n, min, max) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function normalizeDecision(value, confidence = 0) {
  const s = cleanText(value, 60).toLowerCase();
  if (/ส่งได้|safe|ready/.test(s)) return "ส่งได้";
  if (/ห้าม|blocked|unsafe|wrong/.test(s)) return "ห้ามส่ง";
  if (/ไม่รู้|unknown|cannot/.test(s)) return "AI ยังไม่รู้";
  if (confidence >= 80) return "ส่งได้";
  if (confidence < 55) return "AI ยังไม่รู้";
  return "ต้องตรวจ";
}
function safeJsonArray(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 240)).filter(Boolean).slice(0, 12);
  if (!value) return [];
  return [cleanText(value, 240)].filter(Boolean);
}

async function tableExists(pool, tableName) {
  const r = await pool.query(`SELECT to_regclass($1) AS name`, [tableName]);
  return Boolean(r.rows?.[0]?.name);
}

async function ensureTrainingMemorySchema(pool) {
  await ensureAutoTrainingSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_memory_events (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'unknown',
      event_type TEXT NOT NULL DEFAULT 'event',
      agent_key TEXT NOT NULL DEFAULT 'admin',
      conversation_id BIGINT NULL,
      selected_customer_question TEXT NOT NULL DEFAULT '',
      customer_message TEXT NOT NULL DEFAULT '',
      ai_reply TEXT NOT NULL DEFAULT '',
      final_admin_reply TEXT NOT NULL DEFAULT '',
      action_status TEXT NOT NULL DEFAULT '',
      situation_type TEXT NOT NULL DEFAULT 'general',
      service_type TEXT NOT NULL DEFAULT '',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_memory_events_training_center ON public.ai_memory_events(source, event_type, situation_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_memory_events_training_conv ON public.ai_memory_events(conversation_id, created_at DESC)`);
}

async function saveTrainingMemoryEvent(pool, req, input = {}) {
  await ensureTrainingMemorySchema(pool);
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const r = await pool.query(`
    INSERT INTO public.ai_memory_events(
      source,event_type,agent_key,conversation_id,selected_customer_question,customer_message,
      ai_reply,final_admin_reply,action_status,situation_type,service_type,tags,created_by,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb)
    RETURNING *
  `, [
    cleanText(input.source || "training_center", 80),
    cleanText(input.event_type || "training_event", 80),
    cleanText(input.agent_key || "sales", 40),
    input.conversation_id ? Number(input.conversation_id) : null,
    cleanText(input.selected_customer_question || input.customer_message || "", 4000),
    cleanText(input.customer_message || input.selected_customer_question || "", 4000),
    cleanText(input.ai_reply || "", 4000),
    cleanText(input.final_admin_reply || "", 4000),
    cleanText(input.action_status || "training", 80),
    cleanText(input.situation_type || inferSituation(`${input.customer_message || ""}\n${input.ai_reply || ""}\n${input.final_admin_reply || ""}`), 80),
    cleanText(input.service_type || "", 120),
    JSON.stringify(Array.isArray(input.tags) ? input.tags.slice(0, 12) : []),
    getAdminUser(req),
    JSON.stringify(Object.assign({ build: BUILD, internal_only: true, no_line_send: true }, metadata)),
  ]);
  return r.rows?.[0] || null;
}

async function listRealCustomerQuestions(pool, opts = {}) {
  const hasConversations = await tableExists(pool, "public.line_conversations");
  const hasMessages = await tableExists(pool, "public.line_messages");
  if (!hasConversations || !hasMessages) return { questions: [], counts: { total: 0 }, missing: { line_conversations: !hasConversations, line_messages: !hasMessages } };
  const limit = clamp(opts.limit || 60, 1, 120);
  const r = await pool.query(`
    SELECT c.id AS conversation_id, c.id, c.line_user_id, c.display_name, c.picture_url,
           c.last_message_text, c.last_message_at,
           lm.id AS line_message_pk, lm.message_id AS line_message_id, lm.message_text AS customer_message, lm.received_at AS customer_message_at,
           latest.event_type AS latest_training_event, latest.action_status AS latest_training_status, latest.created_at AS latest_training_at,
           aa.id AS auto_answer_id, aa.ai_reply AS auto_ai_reply, aa.confidence AS auto_confidence, aa.status AS auto_status, aa.metadata AS auto_metadata, aa.created_at AS auto_created_at,
           cs.mode AS training_conversation_mode
      FROM public.line_conversations c
      LEFT JOIN LATERAL (
        SELECT id, message_id, message_text, received_at, created_at
          FROM public.line_messages
         WHERE conversation_id=c.id
           AND direction='inbound'
           AND COALESCE(message_text,'') <> ''
         ORDER BY received_at DESC NULLS LAST, created_at DESC
         LIMIT 1
      ) lm ON TRUE
      LEFT JOIN LATERAL (
        SELECT event_type, action_status, created_at
          FROM public.ai_memory_events me
         WHERE me.source='training_center'
           AND me.conversation_id=c.id
           AND (me.metadata->>'line_message_id' = COALESCE(lm.message_id, lm.id::text) OR me.customer_message = lm.message_text OR me.selected_customer_question = lm.message_text)
         ORDER BY me.created_at DESC
         LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, ai_reply, confidence, status, metadata, created_at
          FROM public.ai_training_auto_answers a
         WHERE a.conversation_id=c.id
           AND (a.line_message_id = COALESCE(lm.message_id, lm.id::text) OR a.customer_message = lm.message_text)
         ORDER BY a.created_at DESC
         LIMIT 1
      ) aa ON TRUE
      LEFT JOIN public.ai_training_conversation_settings cs ON cs.conversation_id=c.id
     WHERE COALESCE(lm.message_text, c.last_message_text, '') <> ''
     ORDER BY COALESCE(lm.received_at, c.last_message_at) DESC NULLS LAST, c.updated_at DESC NULLS LAST
     LIMIT $1
  `, [limit]);
  const questions = (r.rows || []).map((row) => {
    const message = cleanText(row.customer_message || row.last_message_text || "", 4000);
    const situation = inferSituation(message);
    return {
      id: row.conversation_id,
      conversation_id: row.conversation_id,
      line_user_id: row.line_user_id,
      display_name: row.display_name,
      picture_url: row.picture_url,
      line_message_id: row.line_message_id || (row.line_message_pk ? String(row.line_message_pk) : ""),
      line_message_pk: row.line_message_pk,
      customer_message: message,
      last_message_text: message,
      last_message_at: row.customer_message_at || row.last_message_at,
      situation_type: situation,
      latest_training_event: row.latest_training_event || null,
      latest_training_status: row.latest_training_status || "new_customer_question",
      latest_training_at: row.latest_training_at || null,
      auto_answer_id: row.auto_answer_id || null,
      auto_ai_reply: row.auto_ai_reply || "",
      auto_confidence: row.auto_confidence == null ? null : Number(row.auto_confidence || 0),
      auto_status: row.auto_status || null,
      auto_metadata: row.auto_metadata || {},
      auto_created_at: row.auto_created_at || null,
      training_conversation_mode: row.training_conversation_mode || "inherit",
    };
  });
  return { questions, counts: { total: questions.length } };
}

async function loadConversation(pool, id) {
  const r = await pool.query(`SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_at FROM public.line_conversations WHERE id=$1 LIMIT 1`, [id]);
  if (!r.rows?.[0]) {
    const err = new Error("LINE_CONVERSATION_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  return r.rows[0];
}
async function loadMessages(pool, conversationId) {
  const r = await pool.query(`
    SELECT id, conversation_id, direction, message_type, message_text, received_at, created_at
      FROM public.line_messages
     WHERE conversation_id=$1
     ORDER BY received_at DESC NULLS LAST, created_at DESC
     LIMIT 80
  `, [conversationId]);
  return (r.rows || []).reverse();
}

async function loadTrainingMemory(pool, { conversationId, situationType, selectedQuestion }) {
  try {
    await ensureTrainingMemorySchema(pool);
    const r = await pool.query(`
      SELECT id, event_type, action_status, situation_type, customer_message, ai_reply, final_admin_reply, metadata, created_at
        FROM public.ai_memory_events
       WHERE source IN ('training_center','reply_example','line_chat')
         AND (conversation_id=$1 OR conversation_id IS NULL)
         AND (situation_type=$2 OR situation_type='general' OR customer_message ILIKE $3 OR selected_customer_question ILIKE $3)
         AND action_status <> 'ignored'
       ORDER BY CASE WHEN source='training_center' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 10
    `, [conversationId || null, situationType || "general", `%${cleanText(selectedQuestion, 80)}%`]);
    return r.rows || [];
  } catch (_) {
    return [];
  }
}

async function loadExamplesForTraining(pool, situationType, language, selectedQuestion) {
  try {
    const examples = await listReplyExamples(pool, {
      active_only: true,
      situation_type: situationType || "general",
      search: cleanText(selectedQuestion, 100),
      limit: 8,
    });
    if (examples.length) return examples;
    return await listReplyExamples(pool, { active_only: true, situation_type: "general", limit: 5 });
  } catch (_) {
    return [];
  }
}

function callOpenAI({ apiKey, model, messages }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, temperature: 0.22, messages, response_format: { type: "json_object" } });
    const req = https.request({
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 45000,
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const data = JSON.parse(body || "{}");
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(data.error?.message || `OPENAI_${res.statusCode}`));
          resolve(data.choices?.[0]?.message?.content || "");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("OPENAI_TIMEOUT")));
    req.write(payload);
    req.end();
  });
}

function sanitizeCustomerReply(text) {
  let out = cleanText(text, 1600);
  out = out.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  if (/^\{[\s\S]*\}$/.test(out)) {
    try { out = cleanText(JSON.parse(out).customer_reply || "", 1600); } catch (_) {}
  }
  return out;
}

async function buildInternalTrainingAnswer(pool, req, body = {}) {
  if (body.training_mode_enabled !== true && body.training_mode_enabled !== "true" && body.training_mode_enabled !== "1") {
    const err = new Error("TRAINING_MODE_DISABLED");
    err.status = 423;
    throw err;
  }
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับศูนย์ฝึก AI");
    err.status = 503;
    throw err;
  }
  const conversationId = Number(body.conversation_id || 0);
  if (!conversationId) {
    const err = new Error("กรุณาเลือกคำถามจริงจาก LINE ก่อน");
    err.status = 400;
    throw err;
  }
  const conversation = await loadConversation(pool, conversationId);
  const messages = await loadMessages(pool, conversationId);
  const selectedQuestion = cleanText(body.selected_customer_question, 2400)
    || cleanText([...messages].reverse().find((m) => m.direction === "inbound" && m.message_text)?.message_text || conversation.last_message_text, 2400);
  if (!selectedQuestion) {
    const err = new Error("ไม่พบข้อความลูกค้าสำหรับฝึก AI");
    err.status = 400;
    throw err;
  }
  const language = detectLanguage(selectedQuestion);
  const situationType = cleanText(body.situation_type || inferSituation(`${selectedQuestion}\n${body.admin_question || ""}`), 80);
  const examples = await loadExamplesForTraining(pool, situationType, language, selectedQuestion);
  const trainingMemory = await loadTrainingMemory(pool, { conversationId, situationType, selectedQuestion });
  const coreBrain = await buildCoreBrainContext(pool, { query: selectedQuestion, agent_key: body.agent_key || "sales", language, intent: situationType, limit: 14 });
  const system = [
    "You are CWF AI trainee inside an internal training classroom, not a live LINE sender.",
    "Return strict JSON only.",
    "JSON keys: customer_reply, confidence, decision, decision_reason, missing_info, skill_category, should_auto_reply, teacher_question.",
    "decision must be one of: ส่งได้, ต้องตรวจ, ห้ามส่ง, AI ยังไม่รู้.",
    "This is internal-only. Never claim a message was sent. Never trigger LINE sending.",
    "If facts are missing, set decision='AI ยังไม่รู้' or 'ต้องตรวจ' and ask the teacher what should be taught.",
    "Use CWF Core Brain as the shared source of truth before saved examples. Do not invent tax invoice, discounts, booking confirmation, technician availability, or repair diagnosis.",
    "Use Thai LINE admin style: concise, warm, natural. If customer uses English, answer in simple English.",
  ].join(" ");
  const prompt = [
    "REAL_CUSTOMER_QUESTION:", selectedQuestion, "",
    "SITUATION_TYPE:", situationType, "",
    "ADMIN_TRAINING_INSTRUCTION:", cleanText(body.admin_question || "ศูนย์ฝึก AI: ลองตอบภายในเท่านั้น ห้ามส่ง LINE จริง ถ้าไม่มั่นใจให้บอกผู้สอนว่าควรสอนอะไรเพิ่ม", 1400), "",
    formatCoreBrainForPrompt(coreBrain), "",
    "RECENT_LINE_CONTEXT:", JSON.stringify({ display_name: conversation.display_name || "", messages: messages.map((m) => ({ direction:m.direction, text:m.message_text, at:m.received_at || m.created_at })).slice(-20) }, null, 2), "",
    "SAVED_TEACHER_EXAMPLES:", JSON.stringify(examples.map((e) => ({ id:e.id, situation_type:e.situation_type, customer_message:e.customer_message, final_admin_reply:e.final_admin_reply, language:e.language, tags:e.tags })), null, 2), "",
    "TRAINING_MEMORY:", JSON.stringify(trainingMemory.map((m) => ({ event_type:m.event_type, action_status:m.action_status, customer_message:m.customer_message, ai_reply:m.ai_reply, final_admin_reply:m.final_admin_reply, situation_type:m.situation_type })), null, 2), "",
    "CWF_TRUSTED_FACTS:", JSON.stringify({
      services:["ล้างแอร์","ซ่อมแอร์","ติดตั้งแอร์","ตรวจเช็คแอร์"],
      rainy_promo:{ wall_under_12000:{ normal:550, premium:790, hanging_coil:1290, deep_clean:1850 }, wall_18000_up:{ normal:690, premium:990, hanging_coil:1550, deep_clean:2150 } },
      check_fee:700,
      cleaning_warranty_days:30,
      tax_invoice:"currently_not_available_do_not_offer_unless_customer_asks_then_say_not_available",
      safety_rule:"When unsure, ask for missing info or teacher correction; do not auto-send."
    }, null, 2)
  ].join("\n");
  const raw = await callOpenAI({ apiKey, model: String(process.env.AI_OFFICE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL, messages:[{ role:"system", content: system }, { role:"user", content: prompt }] });
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch (_) { parsed = { customer_reply: raw, confidence: 40, decision:"ต้องตรวจ", decision_reason:"AI returned non-JSON; teacher review required" }; }
  const confidence = clamp(parsed.confidence, 0, 100);
  const answer = sanitizeCustomerReply(parsed.customer_reply || "");
  const decision = normalizeDecision(parsed.decision, confidence);
  const missingInfo = safeJsonArray(parsed.missing_info);
  const draft = {
    customer_reply: answer,
    confidence,
    decision,
    decision_reason: cleanText(parsed.decision_reason || "", 800),
    missing_info: missingInfo,
    next_step: decision === "AI ยังไม่รู้" ? cleanText(parsed.teacher_question || "ควรตอบลูกค้าว่าอย่างไรดี?", 500) : "ให้ผู้สอนตรวจคำตอบก่อนใช้งานจริง",
    customer_language: parsed.customer_language || language,
    is_foreign_customer: language !== "th" && language !== "unknown",
    selected_customer_question: selectedQuestion,
    situation_type: cleanText(parsed.skill_category || situationType, 80),
    used_reply_examples: examples.map((e) => ({ id:e.id, situation_type:e.situation_type, language:e.language, service_type:e.service_type })),
    internal_only: true,
    no_line_send: true,
  };
  const event = await saveTrainingMemoryEvent(pool, req, {
    event_type: "training_answered",
    action_status: decision === "ส่งได้" ? "teacher_review_needed" : (decision === "AI ยังไม่รู้" ? "ai_unknown" : "teacher_review_needed"),
    agent_key: "sales",
    conversation_id: conversationId,
    selected_customer_question: selectedQuestion,
    customer_message: selectedQuestion,
    ai_reply: answer,
    situation_type: situationType,
    tags: ["ศูนย์ฝึก AI", "training_center", situationType],
    metadata: {
      line_message_id: body.line_message_id || null,
      confidence,
      decision,
      decision_reason: draft.decision_reason,
      missing_info: missingInfo,
      used_example_ids: draft.used_reply_examples.map((e) => e.id),
      used_core_brain_item_ids: (coreBrain.summary || []).map((e) => e.id).filter(Boolean),
      should_auto_reply: Boolean(parsed.should_auto_reply) && decision === "ส่งได้" && confidence >= 85,
      model: String(process.env.AI_OFFICE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    },
  });
  await logReplyLearningEvent(pool, {
    event_type: "training_answered",
    conversation_id: conversationId,
    agent_key: "sales",
    situation_type: situationType,
    customer_message: selectedQuestion,
    ai_reply: answer,
    source: "training_center",
    metadata: { memory_event_id: event?.id || null, confidence, decision, internal_only: true, no_line_send: true },
    created_by: getAdminUser(req),
  }).catch(()=>{});
  // v36.2: do not call OpenAI a second time just to save a manual classroom draft.
  // Teacher feedback below saves approved/rejected lessons into the shared brain.
  return { ok:true, answer, draft, training_event:event, used_reply_examples:draft.used_reply_examples, core_brain:coreBrain, conversation, messages };
}

async function getTrainingSkills(pool) {
  await ensureTrainingMemorySchema(pool);
  const categories = [
    ["price_question", "ราคา / โปรโมชัน"],
    ["appointment", "นัดหมาย / คิวช่าง"],
    ["repair_symptom", "อาการเสียแอร์"],
    ["cleaning_package", "แพ็กเกจล้างแอร์"],
    ["complaint", "รับมือคำโวยวาย"],
    ["foreign_customer", "ภาษาอังกฤษ / ลูกค้าต่างชาติ"],
    ["closing", "ปิดการขาย"],
    ["safety", "ความปลอดภัย / ไม่มั่ว"],
    ["general", "ทั่วไป / ถามข้อมูลเพิ่ม"],
  ];
  let exampleRows = [];
  try {
    const r = await pool.query(`
      SELECT situation_type, COUNT(*)::int AS examples
        FROM public.ai_reply_examples
       WHERE COALESCE(is_active, true)=true
       GROUP BY situation_type
    `);
    exampleRows = r.rows || [];
  } catch (_) { exampleRows = []; }
  let eventRows = [];
  try {
    const r = await pool.query(`
      SELECT situation_type,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE action_status IN ('passed','lesson_saved','ready_for_auto_reply_candidate'))::int AS passed,
             COUNT(*) FILTER (WHERE action_status IN ('failed','ai_wrong'))::int AS failed,
             COUNT(*) FILTER (WHERE action_status IN ('ai_unknown'))::int AS unknowns
        FROM public.ai_memory_events
       WHERE source='training_center'
       GROUP BY situation_type
    `);
    eventRows = r.rows || [];
  } catch (_) { eventRows = []; }
  const byExample = Object.fromEntries(exampleRows.map((r) => [r.situation_type || "general", Number(r.examples || 0)]));
  const byEvent = Object.fromEntries(eventRows.map((r) => [r.situation_type || "general", r]));
  const skills = categories.map(([key, label]) => {
    const ev = byEvent[key] || {};
    const examples = Number(byExample[key] || 0);
    const total = Number(ev.total || 0);
    const passed = Number(ev.passed || 0);
    const failed = Number(ev.failed || 0);
    const unknowns = Number(ev.unknowns || 0);
    let score = 0;
    if (examples || total) score = Math.round(Math.min(96, 20 + examples * 9 + passed * 8 + total * 3 - failed * 10 - unknowns * 4));
    score = clamp(score, 0, 100);
    const readiness = score >= 85 ? "พร้อมตอบจริง" : score >= 70 ? "เกือบพร้อม" : score >= 45 ? "ต้องฝึกเพิ่ม" : "ห้าม auto reply";
    return { key, label, score, readiness, examples, training_total: total, passed, failed, unknowns };
  });
  return { ok:true, build:BUILD, skills, counts:{ examples: exampleRows.reduce((n,r)=>n+Number(r.examples||0),0), training_events: eventRows.reduce((n,r)=>n+Number(r.total||0),0) } };
}

module.exports = function createAdminAiOfficeTrainingCenterV35BRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeTrainingCenterV35BRoutes requires pool and requireAdminSession");
  const router = express.Router();

  router.get("/admin/ai-office/training-center/questions", requireAdminSession, async (req, res) => {
    try {
      await ensureTrainingMemorySchema(pool);
      const data = await listRealCustomerQuestions(pool, { limit: req.query.limit || 60 });
      return res.json({ ok:true, build:BUILD, ...data });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_TRAINING_QUESTIONS_FAILED" });
    }
  });

  router.get("/admin/ai-office/training-center/skills", requireAdminSession, async (_req, res) => {
    try {
      return res.json(await getTrainingSkills(pool));
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_TRAINING_SKILLS_FAILED" });
    }
  });

  router.post("/admin/ai-office/training-center/internal-answer", requireAdminSession, async (req, res) => {
    try {
      const result = await buildInternalTrainingAnswer(pool, req, req.body || {});
      return res.json(result);
    } catch (e) {
      console.error("Phase35B training internal-answer error:", e);
      return res.status(e.status || 500).json({ ok:false, error:e.message || "TRAINING_INTERNAL_ANSWER_FAILED" });
    }
  });

  router.post("/admin/ai-office/training-center/lessons", requireAdminSession, async (req, res) => {
    try {
      const body = req.body || {};
      const customerMessage = cleanText(body.customer_message || body.selected_customer_question, 4000);
      const finalReply = cleanText(body.final_admin_reply || body.teacher_reply, 4000);
      if (!customerMessage || !finalReply) return res.status(400).json({ ok:false, error:"กรุณาใส่คำถามลูกค้าและคำตอบที่ผู้สอนต้องการให้จำ" });
      const situationType = cleanText(body.situation_type || inferSituation(`${customerMessage}\n${finalReply}`), 80);
      const example = await createReplyExample(pool, {
        agent_key: body.agent_key || "sales",
        situation_type: situationType,
        customer_message: customerMessage,
        final_admin_reply: finalReply,
        language: body.language || detectLanguage(`${customerMessage}\n${finalReply}`),
        service_type: body.service_type || "",
        tags: body.tags || ["ศูนย์ฝึก AI", "training_center", situationType],
        source: "training_center",
        source_conversation_id: body.conversation_id || null,
        created_by: getAdminUser(req),
        quality: "teacher_approved_training",
      });
      const event = await saveTrainingMemoryEvent(pool, req, {
        event_type: "lesson_saved",
        action_status: body.teacher_verdict || "lesson_saved",
        agent_key: body.agent_key || "sales",
        conversation_id: body.conversation_id || null,
        selected_customer_question: customerMessage,
        customer_message: customerMessage,
        ai_reply: body.ai_reply || "",
        final_admin_reply: finalReply,
        situation_type: situationType,
        tags: ["ศูนย์ฝึก AI", "training_center", situationType],
        metadata: { reply_example_id: example?.id || null, line_message_id: body.line_message_id || null, teacher_verdict: body.teacher_verdict || "lesson_saved" },
      });
      let brainItem = null;
      brainItem = await saveCoreBrainLesson(pool, {
        auto_answer_id: body.auto_answer_id || null,
        conversation_id: body.conversation_id || null,
        line_message_id: body.line_message_id || null,
        customer_message: customerMessage,
        ai_reply: body.ai_reply || "",
        final_admin_reply: finalReply,
        verdict: body.teacher_verdict || "lesson_saved",
        situation_type: situationType,
        service_type: body.service_type || "",
        source: "training_center_lesson",
        created_by: getAdminUser(req),
        metadata: { reply_example_id: example?.id || null }
      }).catch(()=>null);
      if (body.auto_answer_id) {
        await updateAutoTrainingFeedback(pool, body.auto_answer_id, { verdict:"corrected", final_admin_reply:finalReply, reason:"teacher_saved_lesson" }, getAdminUser(req)).catch(()=>{});
      }
      const skills = await getTrainingSkills(pool).catch(()=>null);
      return res.json({ ok:true, example, event, brain_item:brainItem, skills: skills?.skills || [] });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_TRAINING_LESSON_FAILED" });
    }
  });

  router.post("/admin/ai-office/training-center/feedback", requireAdminSession, async (req, res) => {
    try {
      const body = req.body || {};
      const verdict = cleanText(body.verdict || "teacher_review_needed", 80);
      const customerMessage = cleanText(body.customer_message || body.selected_customer_question || "", 4000);
      const aiReply = cleanText(body.ai_reply || "", 4000);
      const isReject = /reject|wrong|ไม่ถูก|failed|bad|มั่ว|rejected/i.test(verdict);
      const finalReply = cleanText(body.final_admin_reply || (!isReject ? aiReply : ""), 4000);
      const situationType = cleanText(body.situation_type || inferSituation(`${customerMessage}
${aiReply}
${finalReply}`), 80);
      const event = await saveTrainingMemoryEvent(pool, req, {
        event_type: "training_feedback",
        action_status: verdict,
        agent_key: body.agent_key || "sales",
        conversation_id: body.conversation_id || null,
        selected_customer_question: customerMessage,
        customer_message: customerMessage,
        ai_reply: aiReply,
        final_admin_reply: finalReply,
        situation_type: situationType,
        service_type: body.service_type || "",
        tags: ["ศูนย์ฝึก AI", "training_center", verdict, situationType],
        metadata: { line_message_id: body.line_message_id || null, reason: body.reason || "", internal_only: true, no_line_send: true },
      });
      let example = null;
      if (!isReject && customerMessage && finalReply) {
        example = await createReplyExample(pool, {
          agent_key: body.agent_key || "sales",
          situation_type: situationType,
          customer_message: customerMessage,
          final_admin_reply: finalReply,
          language: body.language || detectLanguage(`${customerMessage}
${finalReply}`),
          service_type: body.service_type || "",
          tags: body.tags || ["ศูนย์ฝึก AI", "training_center_feedback", situationType],
          source: "training_center_feedback",
          source_conversation_id: body.conversation_id || null,
          created_by: getAdminUser(req),
          quality: "teacher_approved_feedback",
        }).catch(()=>null);
      }
      let brainItem = null;
      if (customerMessage && (aiReply || finalReply)) {
        brainItem = await saveCoreBrainLesson(pool, {
          conversation_id: body.conversation_id || null,
          line_message_id: body.line_message_id || null,
          customer_message: customerMessage,
          ai_reply: aiReply,
          final_admin_reply: finalReply,
          verdict,
          reason: body.reason || "",
          situation_type: situationType,
          service_type: body.service_type || "",
          source: "training_center_feedback",
          created_by: getAdminUser(req),
          metadata: { reply_example_id: example?.id || null, memory_event_id: event?.id || null },
        }).catch(()=>null);
      }
      await logReplyLearningEvent(pool, {
        event_type: verdict,
        conversation_id: body.conversation_id || null,
        agent_key: body.agent_key || "sales",
        situation_type: situationType,
        customer_message: customerMessage,
        ai_reply: aiReply,
        final_admin_reply: finalReply,
        source: "training_center",
        created_by: getAdminUser(req),
        metadata: { memory_event_id: event?.id || null, reply_example_id: example?.id || null, brain_item_id: brainItem?.id || null, verdict, internal_only: true, no_line_send: true },
      }).catch(()=>{});
      return res.json({ ok:true, event, example, brain_item:brainItem });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_TRAINING_FEEDBACK_FAILED" });
    }
  });


  router.get("/admin/ai-office/training-center/auto-answers", requireAdminSession, async (req, res) => {
    try {
      const answers = await listAutoTrainingAnswers(pool, { limit: req.query.limit || 80, status: req.query.status || "" });
      return res.json({ ok:true, build:BUILD, answers, counts:{ total:answers.length } });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AUTO_TRAINING_ANSWERS_FAILED" });
    }
  });

  router.post("/admin/ai-office/training-center/auto-answers/:id/feedback", requireAdminSession, async (req, res) => {
    try {
      const result = await updateAutoTrainingFeedback(pool, req.params.id, req.body || {}, getAdminUser(req));
      return res.json(result);
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_AUTO_TRAINING_FEEDBACK_FAILED" });
    }
  });

  router.post("/admin/ai-office/training-center/conversations/:id/settings", requireAdminSession, async (req, res) => {
    try {
      const setting = await setTrainingConversationMode(pool, req.params.id, req.body?.mode || "inherit", req.body || {}, getAdminUser(req));
      return res.json({ ok:true, setting });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_TRAINING_CONVERSATION_SETTING_FAILED" });
    }
  });

  return router;
};

module.exports.BUILD = BUILD;
module.exports.ensureTrainingMemorySchema = ensureTrainingMemorySchema;
