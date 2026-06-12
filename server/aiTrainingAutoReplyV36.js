"use strict";

const https = require("https");
const {
  buildCoreBrainContext,
  formatCoreBrainForPrompt,
  saveCoreBrainLesson,
  detectLanguage,
  boolValue,
} = require("./aiOfficeCoreBrain");
const {
  createReplyExample,
  loadMatchingReplyExamples,
  logReplyLearningEvent,
} = require("./aiReplyLearning");

const BUILD = "v36_shared_core_brain_auto_internal_training_20260612";
const DEFAULT_MODEL = "gpt-4.1-mini";

function cleanText(value, max = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function clamp(n, min, max, fallback = min) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
function safeJson(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch (_) { return JSON.stringify(fallback); }
}
function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch (_) { return {}; }
}
function safeJsonArray(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 240)).filter(Boolean).slice(0, 12);
  if (!value) return [];
  return [cleanText(value, 240)].filter(Boolean);
}
function inferSituation(text = "") {
  const s = String(text || "").toLowerCase();
  if (/แพง|ลด|ส่วนลด|ทำไมราคา|expensive|discount/.test(s)) return "expensive";
  if (/ราคา|เท่าไหร่|กี่บาท|โปร|promotion|price|cost/.test(s)) return "price_question";
  if (/กลิ่น|เหม็น|อับ/.test(s)) return "bad_smell";
  if (/ไม่เย็น|ไม่ค่อยเย็น|ลมไม่เย็น|น้ำหยด|หยดน้ำ|รั่ว|เสียงดัง|เสีย|ซ่อม|error|e\d|h\d|f\d/.test(s)) return "repair_symptom";
  if (/นัด|คิว|ว่าง|วันไหน|เวลา|จอง|วันนี้|พรุ่งนี้|appointment|booking/.test(s)) return "appointment";
  if (/ล้างแบบ|แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง/.test(s)) return "cleaning_package";
  if (/โวย|ร้องเรียน|ไม่พอใจ|เสียหาย|ช้า|แย่|refund|police|lawsuit/.test(s)) return "complaint";
  if (/[a-z]{4,}/i.test(s) && !/[ก-๙]/.test(s)) return "foreign_customer";
  return "general";
}
function normalizeDecision(value, confidence = 0) {
  const s = cleanText(value, 60).toLowerCase();
  if (/ส่งได้|safe|ready/.test(s)) return "ส่งได้";
  if (/ห้าม|blocked|unsafe|wrong/.test(s)) return "ห้ามส่ง";
  if (/ไม่รู้|unknown|cannot/.test(s)) return "AI ยังไม่รู้";
  if (Number(confidence || 0) >= 82) return "ส่งได้";
  if (Number(confidence || 0) < 55) return "AI ยังไม่รู้";
  return "ต้องตรวจ";
}
function sanitizeCustomerReply(text) {
  let out = cleanText(text, 1800);
  out = out.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  if (/^\{[\s\S]*\}$/.test(out)) {
    try { out = cleanText(JSON.parse(out).customer_reply || "", 1800); } catch (_) {}
  }
  return out;
}

function callOpenAI({ apiKey, model, messages }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, temperature: 0.22, messages, response_format: { type: "json_object" } });
    const req = https.request({
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

async function ensureAutoTrainingSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_training_auto_answers (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NULL,
      line_message_id TEXT NULL,
      line_message_pk BIGINT NULL,
      customer_message TEXT NOT NULL DEFAULT '',
      ai_reply TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 0,
      intent TEXT NOT NULL DEFAULT 'general',
      situation_type TEXT NOT NULL DEFAULT 'general',
      service_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_review',
      source TEXT NOT NULL DEFAULT 'brain_v2_auto_training',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      reviewed_by TEXT NULL,
      reviewed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_training_auto_answers_line_message_id ON public.ai_training_auto_answers(line_message_id) WHERE line_message_id IS NOT NULL AND line_message_id <> ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_training_auto_answers_status_created ON public.ai_training_auto_answers(status, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_training_auto_answers_conversation ON public.ai_training_auto_answers(conversation_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_training_conversation_settings (
      conversation_id BIGINT PRIMARY KEY,
      line_user_id TEXT NULL,
      mode TEXT NOT NULL DEFAULT 'inherit',
      auto_internal_answer_enabled BOOLEAN NULL,
      updated_by TEXT NULL,
      reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_training_conversation_settings_mode ON public.ai_training_conversation_settings(mode)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_office_control_settings (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'main',
      label TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      value JSONB NOT NULL DEFAULT 'false'::jsonb,
      locked BOOLEAN NOT NULL DEFAULT false,
      updated_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const defaults = [
    ["auto_internal_training_enabled", "training", "Auto Training ภายใน", "เปิดให้ระบบสร้างคำตอบภายในจากข้อความ LINE ลูกค้า", false, false],
    ["auto_internal_training_auto_answer", "training", "ให้ AI ลองตอบเองเมื่อข้อความเข้า", "เมื่อเปิด ระบบจะสร้างคำตอบภายในไว้ให้แอดมินตรวจ โดยไม่ส่ง LINE จริง", false, false],
    ["auto_internal_training_learn_to_core_brain", "training", "บันทึกบทเรียนเข้าคลังสมองกลาง", "คำตอบที่แอดมินกดถูก/สอนเพิ่ม จะเก็บเข้าคลังสมองกลางที่ทุก Agent ใช้ร่วมกัน", true, false],
  ];
  for (const row of defaults) {
    await pool.query(`
      INSERT INTO public.ai_office_control_settings(key,category,label,description,value,locked)
      VALUES($1,$2,$3,$4,$5::jsonb,$6)
      ON CONFLICT (key) DO UPDATE SET category=EXCLUDED.category,label=EXCLUDED.label,description=EXCLUDED.description,locked=EXCLUDED.locked
    `, [row[0], row[1], row[2], row[3], safeJson(row[4]), row[5]]);
  }
}

async function getAutoTrainingSettings(pool, conversationId = null) {
  await ensureAutoTrainingSchema(pool);
  const rows = await pool.query(`SELECT key,value FROM public.ai_office_control_settings WHERE key IN ('auto_internal_training_enabled','auto_internal_training_auto_answer','auto_internal_training_learn_to_core_brain')`);
  const values = Object.fromEntries((rows.rows || []).map((r) => [r.key, typeof r.value === "string" ? JSON.parse(r.value) : r.value]));
  let conv = null;
  const id = Number(conversationId || 0);
  if (id) {
    const cr = await pool.query(`SELECT * FROM public.ai_training_conversation_settings WHERE conversation_id=$1 LIMIT 1`, [id]).catch(() => ({ rows: [] }));
    conv = cr.rows?.[0] || null;
  }
  const masterEnabled = boolValue(values.auto_internal_training_enabled, false);
  const globalAutoAnswer = boolValue(values.auto_internal_training_auto_answer, false);
  const mode = cleanText(conv?.mode || "inherit", 20) || "inherit";
  const enabledForConversation = mode === "off" ? false : (mode === "on" ? masterEnabled : (masterEnabled && globalAutoAnswer));
  return {
    master_enabled: masterEnabled,
    global_auto_answer: globalAutoAnswer,
    learn_to_core_brain: boolValue(values.auto_internal_training_learn_to_core_brain, true),
    conversation_mode: mode,
    enabled_for_conversation: enabledForConversation,
    conversation_setting: conv,
  };
}

async function setTrainingConversationMode(pool, conversationId, mode = "inherit", payload = {}, adminUser = "") {
  await ensureAutoTrainingSchema(pool);
  const id = Number(conversationId || 0);
  if (!id) { const err = new Error("CONVERSATION_ID_REQUIRED"); err.status = 400; throw err; }
  const cleanMode = ["inherit", "on", "off"].includes(String(mode || "").toLowerCase()) ? String(mode).toLowerCase() : "inherit";
  const r = await pool.query(`
    INSERT INTO public.ai_training_conversation_settings(conversation_id,line_user_id,mode,auto_internal_answer_enabled,updated_by,reason,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (conversation_id) DO UPDATE SET
      line_user_id=COALESCE(EXCLUDED.line_user_id, public.ai_training_conversation_settings.line_user_id),
      mode=EXCLUDED.mode,
      auto_internal_answer_enabled=EXCLUDED.auto_internal_answer_enabled,
      updated_by=EXCLUDED.updated_by,
      reason=EXCLUDED.reason,
      updated_at=NOW()
    RETURNING *
  `, [id, cleanText(payload.line_user_id || "", 255) || null, cleanMode, cleanMode === "inherit" ? null : cleanMode === "on", cleanText(adminUser, 120), cleanText(payload.reason || "", 500)]);
  return r.rows?.[0] || null;
}

async function loadConversation(pool, id) {
  const r = await pool.query(`SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_at FROM public.line_conversations WHERE id=$1 LIMIT 1`, [Number(id || 0)]);
  return r.rows?.[0] || null;
}
async function loadMessages(pool, conversationId) {
  const r = await pool.query(`
    SELECT id, conversation_id, direction, message_type, message_text, received_at, created_at
      FROM public.line_messages
     WHERE conversation_id=$1
     ORDER BY received_at DESC NULLS LAST, created_at DESC
     LIMIT 80
  `, [Number(conversationId || 0)]);
  return (r.rows || []).reverse();
}
async function findExistingAutoAnswer(pool, lineMessageId, conversationId, customerMessage) {
  await ensureAutoTrainingSchema(pool);
  const msgId = cleanText(lineMessageId || "", 255);
  if (msgId) {
    const r = await pool.query(`SELECT * FROM public.ai_training_auto_answers WHERE line_message_id=$1 LIMIT 1`, [msgId]);
    if (r.rows?.[0]) return r.rows[0];
  }
  const id = Number(conversationId || 0);
  if (id && customerMessage) {
    const r = await pool.query(`
      SELECT * FROM public.ai_training_auto_answers
       WHERE conversation_id=$1 AND customer_message=$2 AND created_at > NOW() - INTERVAL '1 day'
       ORDER BY created_at DESC LIMIT 1
    `, [id, cleanText(customerMessage, 4000)]);
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function saveAutoAnswer(pool, payload = {}) {
  await ensureAutoTrainingSchema(pool);
  const lineMessageId = cleanText(payload.line_message_id || "", 255) || null;
  const r = await pool.query(`
    INSERT INTO public.ai_training_auto_answers(
      conversation_id,line_user_id,line_message_id,line_message_pk,customer_message,ai_reply,confidence,intent,situation_type,service_type,status,source,metadata,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW())
    ON CONFLICT (line_message_id) WHERE line_message_id IS NOT NULL AND line_message_id <> '' DO UPDATE SET
      conversation_id=COALESCE(EXCLUDED.conversation_id, public.ai_training_auto_answers.conversation_id),
      line_user_id=COALESCE(EXCLUDED.line_user_id, public.ai_training_auto_answers.line_user_id),
      line_message_pk=COALESCE(EXCLUDED.line_message_pk, public.ai_training_auto_answers.line_message_pk),
      customer_message=COALESCE(NULLIF(EXCLUDED.customer_message,''), public.ai_training_auto_answers.customer_message),
      ai_reply=COALESCE(NULLIF(EXCLUDED.ai_reply,''), public.ai_training_auto_answers.ai_reply),
      confidence=CASE WHEN EXCLUDED.ai_reply <> '' THEN EXCLUDED.confidence ELSE public.ai_training_auto_answers.confidence END,
      intent=COALESCE(NULLIF(EXCLUDED.intent,''), public.ai_training_auto_answers.intent),
      situation_type=COALESCE(NULLIF(EXCLUDED.situation_type,''), public.ai_training_auto_answers.situation_type),
      service_type=COALESCE(NULLIF(EXCLUDED.service_type,''), public.ai_training_auto_answers.service_type),
      metadata=public.ai_training_auto_answers.metadata || EXCLUDED.metadata,
      updated_at=NOW()
    RETURNING *
  `, [
    Number(payload.conversation_id || 0) || null,
    cleanText(payload.line_user_id || "", 255) || null,
    lineMessageId,
    Number(payload.line_message_pk || 0) || null,
    cleanText(payload.customer_message || "", 4000),
    cleanText(payload.ai_reply || "", 4000),
    clamp(payload.confidence, 0, 100, 0),
    cleanText(payload.intent || "general", 80),
    cleanText(payload.situation_type || "general", 80),
    cleanText(payload.service_type || "", 120),
    cleanText(payload.status || "pending_review", 80),
    cleanText(payload.source || "brain_v2_auto_training", 120),
    safeJson(Object.assign({ build: BUILD, internal_only: true, no_line_send: true }, payload.metadata || {})),
  ]);
  return r.rows?.[0] || null;
}

async function buildAndSaveInternalAnswer(pool, input = {}) {
  await ensureAutoTrainingSchema(pool);
  const conversationId = Number(input.conversation_id || 0);
  const customerMessage = cleanText(input.customer_message || input.selected_customer_question || "", 4000);
  const lineMessageId = cleanText(input.line_message_id || "", 255);
  if (!conversationId || !customerMessage) return { ok: false, skipped: true, reason: "MISSING_CONTEXT" };
  const existing = await findExistingAutoAnswer(pool, lineMessageId, conversationId, customerMessage);
  if (existing && !input.force) return { ok: true, skipped: true, reason: "ALREADY_EXISTS", auto_answer: existing };

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return { ok: false, skipped: true, reason: "OPENAI_API_KEY_MISSING" };
  const conversation = await loadConversation(pool, conversationId);
  const messages = await loadMessages(pool, conversationId);
  const language = detectLanguage(customerMessage);
  const situationType = cleanText(input.situation_type || inferSituation(`${customerMessage}\n${input.admin_instruction || ""}`), 80);
  const coreBrain = await buildCoreBrainContext(pool, {
    query: customerMessage,
    agent_key: input.agent_key || "sales",
    language,
    intent: situationType,
    limit: 14,
  });
  let examples = [];
  try {
    examples = await loadMatchingReplyExamples(pool, { situation_type: situationType, language, text: customerMessage, limit: 6 });
  } catch (_) { examples = []; }

  const system = [
    "You are CWF AI trainee generating an INTERNAL draft for review, not sending LINE.",
    "Return strict JSON only.",
    "JSON keys: customer_reply, confidence, decision, decision_reason, known_info, missing_info, next_best_action, skill_category, should_auto_reply, service_type.",
    "Use CWF Core Brain and CWF Professional Sales Admin Brain v2.8 as the shared source of truth before any role-specific behavior.",
    "Do not invent booking confirmation, queue availability, payment, discount, tax invoice, or repair diagnosis.",
    "Use real CWF sales admin style: natural, concise, useful, not robotic, and move the sale to the next step. Infer known_info from the full thread first. Do not ask for location again if map/location already exists. If the customer truly uses English, answer simple English; do not infer English from URL/map/display name.",
    "This is internal-only. Never claim a message was sent. Never trigger LINE sending.",
  ].join(" ");
  const prompt = [
    "REAL_CUSTOMER_MESSAGE:", customerMessage, "",
    "SITUATION_TYPE:", situationType, "",
    "ADMIN_INSTRUCTION:", cleanText(input.admin_instruction || "Auto Internal Training: draft internally for admin review only. Do not send LINE.", 1400), "",
    formatCoreBrainForPrompt(coreBrain), "",
    "RECENT_LINE_CONTEXT:", JSON.stringify({ display_name: conversation?.display_name || "", messages: messages.map((m) => ({ direction: m.direction, text: m.message_text, at: m.received_at || m.created_at })).slice(-20) }, null, 2), "",
    "APPROVED_SHARED_REPLY_EXAMPLES:", JSON.stringify(examples.map((e) => ({ id: e.id, situation_type: e.situation_type, customer_message: e.customer_message, final_admin_reply: e.final_admin_reply, language: e.language, service_type: e.service_type, tags: e.tags })), null, 2), "",
    "TASK:",
    "Auto Internal Training must create the answer immediately for later review. It should look like a real chat reply, not an AI report. First infer known_info/missing_info and next_best_action from RECENT_LINE_CONTEXT. Ask only 1-2 missing fields; if info is enough, close toward booking/check queue.", "",
    "CWF_STATIC_SAFETY_FACTS:", JSON.stringify({
      services: ["ล้างแอร์", "ซ่อมแอร์", "ติดตั้งแอร์", "ตรวจเช็คแอร์"],
      rainy_promo: { wall_under_12000: { normal: 550, premium: 790, hanging_coil: 1290, deep_clean: 1850 }, wall_18000_up: { normal: 690, premium: 990, hanging_coil: 1550, deep_clean: 2150 } },
      check_fee: 700,
      cleaning_warranty_days: 30,
      tax_invoice: "currently_not_available_do_not_offer_unless_customer_asks_then_say_not_available",
      no_line_send: true,
    }, null, 2),
  ].join("\n");

  const model = String(process.env.AI_OFFICE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  let raw = "";
  try {
    raw = await callOpenAI({ apiKey, model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] });
  } catch (e) {
    return { ok: false, skipped: false, reason: "OPENAI_FAILED", error: e.message || "OPENAI_FAILED" };
  }
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch (_) { parsed = { customer_reply: raw, confidence: 45, decision: "ต้องตรวจ", decision_reason: "AI returned non JSON" }; }
  const confidence = clamp(parsed.confidence, 0, 100, 45);
  const aiReply = sanitizeCustomerReply(parsed.customer_reply || "");
  const decision = normalizeDecision(parsed.decision, confidence);
  const status = decision === "AI ยังไม่รู้" ? "needs_teacher" : "pending_review";
  const autoAnswer = await saveAutoAnswer(pool, {
    conversation_id: conversationId,
    line_user_id: input.line_user_id || conversation?.line_user_id || "",
    line_message_id: lineMessageId,
    line_message_pk: input.line_message_pk || null,
    customer_message: customerMessage,
    ai_reply: aiReply,
    confidence,
    intent: situationType,
    situation_type: situationType,
    service_type: cleanText(parsed.service_type || coreBrain.inferred?.service_type || "", 120),
    status,
    source: input.source || "brain_v2_auto_training",
    metadata: {
      decision,
      decision_reason: cleanText(parsed.decision_reason || "", 1000),
      known_info: parsed.known_info && typeof parsed.known_info === "object" ? parsed.known_info : {},
      missing_info: safeJsonArray(parsed.missing_info),
      next_best_action: cleanText(parsed.next_best_action || "", 500),
      should_auto_reply: false,
      internal_only: true,
      no_line_send: true,
      model,
      used_core_brain_item_ids: (coreBrain.summary || []).map((x) => x.id).filter(Boolean),
      used_reply_example_ids: examples.map((x) => x.id).filter(Boolean),
      source_event: input.source_event || "manual_or_webhook",
    },
  });
  await logReplyLearningEvent(pool, {
    event_type: "auto_internal_training_answered",
    conversation_id: conversationId,
    agent_key: input.agent_key || "sales",
    situation_type: situationType,
    customer_message: customerMessage,
    ai_reply: aiReply,
    source: "auto_internal_training",
    metadata: { auto_answer_id: autoAnswer?.id || null, confidence, decision, internal_only: true, no_line_send: true, used_core_brain_item_ids: (coreBrain.summary || []).map((x) => x.id).filter(Boolean) },
    created_by: "ai_auto_training",
  }).catch(() => {});
  return { ok: true, auto_answer: autoAnswer, answer: aiReply, draft: { customer_reply: aiReply, confidence, decision, decision_reason: parsed.decision_reason || "", known_info: parsed.known_info && typeof parsed.known_info === "object" ? parsed.known_info : {},
      missing_info: safeJsonArray(parsed.missing_info),
      next_best_action: cleanText(parsed.next_best_action || "", 500), selected_customer_question: customerMessage, situation_type: situationType, internal_only: true, no_line_send: true, core_brain_used: coreBrain.summary || [] }, core_brain: coreBrain, used_reply_examples: examples, conversation, messages };
}

async function handleAutoInternalTrainingFromWebhook(pool, event, stored = {}) {
  try {
    if (!pool || !event || event.type !== "message" || event.message?.type !== "text") return { ok: false, skipped: true, reason: "UNSUPPORTED_EVENT" };
    const conversationId = Number(stored.conversation_id || 0);
    const customerMessage = cleanText(event.message?.text || "", 4000);
    const lineMessageId = cleanText(event.message?.id || "", 255);
    if (!conversationId || !customerMessage || !lineMessageId) return { ok: false, skipped: true, reason: "MISSING_CONTEXT" };
    const settings = await getAutoTrainingSettings(pool, conversationId);
    if (!settings.enabled_for_conversation) return { ok: false, skipped: true, reason: "AUTO_INTERNAL_TRAINING_DISABLED", settings };
    return await buildAndSaveInternalAnswer(pool, {
      conversation_id: conversationId,
      line_user_id: event.source?.userId || "",
      line_message_id: lineMessageId,
      customer_message: customerMessage,
      source: "brain_v2_auto_training_webhook",
      source_event: "line_webhook",
    });
  } catch (e) {
    return { ok: false, skipped: false, error: e.message || "AUTO_INTERNAL_TRAINING_FAILED" };
  }
}

async function listAutoTrainingAnswers(pool, opts = {}) {
  await ensureAutoTrainingSchema(pool);
  const limit = Math.max(1, Math.min(200, Number(opts.limit || 80)));
  const status = cleanText(opts.status || "", 80);
  const params = [limit];
  let where = "";
  if (status) { params.push(status); where = `WHERE a.status=$${params.length}`; }
  const r = await pool.query(`
    SELECT a.*, c.display_name, c.picture_url, c.last_message_at, s.mode AS conversation_mode
      FROM public.ai_training_auto_answers a
      LEFT JOIN public.line_conversations c ON c.id=a.conversation_id
      LEFT JOIN public.ai_training_conversation_settings s ON s.conversation_id=a.conversation_id
      ${where}
     ORDER BY a.created_at DESC
     LIMIT $1
  `, params);
  return r.rows || [];
}

async function updateAutoTrainingFeedback(pool, id, input = {}, adminUser = "") {
  await ensureAutoTrainingSchema(pool);
  const answerId = Number(id || input.id || input.auto_answer_id || 0);
  if (!answerId) { const err = new Error("AUTO_ANSWER_ID_REQUIRED"); err.status = 400; throw err; }
  const current = await pool.query(`SELECT * FROM public.ai_training_auto_answers WHERE id=$1 LIMIT 1`, [answerId]);
  const row = current.rows?.[0];
  if (!row) { const err = new Error("AUTO_ANSWER_NOT_FOUND"); err.status = 404; throw err; }
  const verdict = cleanText(input.verdict || input.status || "approved", 80);
  const isReject = /reject|wrong|ไม่ถูก|failed|bad|มั่ว|rejected/i.test(verdict);
  const finalReply = cleanText(input.final_admin_reply || input.corrected_reply || (isReject ? "" : row.ai_reply), 4000);
  const status = isReject ? "rejected" : (finalReply && finalReply !== row.ai_reply ? "corrected" : "approved");
  const meta = parseJsonObject(row.metadata);
  const nextMeta = Object.assign({}, meta, { feedback_verdict: verdict, feedback_reason: cleanText(input.reason || "", 800), final_admin_reply: finalReply, reviewed_by: cleanText(adminUser, 120), reviewed_at: new Date().toISOString() });
  const updated = await pool.query(`
    UPDATE public.ai_training_auto_answers
       SET status=$2, metadata=$3::jsonb, reviewed_by=$4, reviewed_at=NOW(), updated_at=NOW()
     WHERE id=$1
     RETURNING *
  `, [answerId, status, safeJson(nextMeta), cleanText(adminUser, 120)]);
  let example = null;
  if (!isReject && finalReply) {
    example = await createReplyExample(pool, {
      agent_key: input.agent_key || "sales",
      situation_type: row.situation_type || row.intent || "general",
      customer_message: row.customer_message,
      final_admin_reply: finalReply,
      language: input.language || detectLanguage(`${row.customer_message}\n${finalReply}`),
      service_type: row.service_type || "",
      tags: ["auto_internal_training", "shared_core_brain", row.situation_type || row.intent || "general"],
      source: "auto_internal_training",
      source_conversation_id: row.conversation_id || null,
      created_by: adminUser,
      quality: status === "approved" ? "teacher_approved_auto_answer" : "teacher_corrected_auto_answer",
    }).catch(() => null);
  }
  let brainItem = null;
  const settings = await getAutoTrainingSettings(pool, row.conversation_id).catch(() => ({ learn_to_core_brain: true }));
  if (settings.learn_to_core_brain) {
    brainItem = await saveCoreBrainLesson(pool, {
      auto_answer_id: answerId,
      conversation_id: row.conversation_id,
      line_message_id: row.line_message_id,
      customer_message: row.customer_message,
      ai_reply: row.ai_reply,
      final_admin_reply: finalReply,
      verdict: status,
      reason: input.reason || "",
      situation_type: row.situation_type || row.intent || "general",
      service_type: row.service_type || "",
      source: "auto_internal_training_feedback",
      created_by: adminUser,
      metadata: { reply_example_id: example?.id || null },
    }).catch(() => null);
  }
  await logReplyLearningEvent(pool, {
    event_type: `auto_training_${status}`,
    reply_example_id: example?.id || null,
    conversation_id: row.conversation_id || null,
    agent_key: input.agent_key || "sales",
    situation_type: row.situation_type || row.intent || "general",
    customer_message: row.customer_message,
    ai_reply: row.ai_reply,
    final_admin_reply: finalReply,
    source: "auto_internal_training_feedback",
    metadata: { auto_answer_id: answerId, brain_item_id: brainItem?.id || null, status, reason: input.reason || "" },
    created_by: adminUser,
  }).catch(() => {});
  return { ok: true, auto_answer: updated.rows?.[0] || null, example, brain_item: brainItem };
}

module.exports = {
  BUILD,
  ensureAutoTrainingSchema,
  getAutoTrainingSettings,
  setTrainingConversationMode,
  buildAndSaveInternalAnswer,
  handleAutoInternalTrainingFromWebhook,
  listAutoTrainingAnswers,
  updateAutoTrainingFeedback,
};
