const express = require("express");
const https = require("https");
const { loadAiBrainContext } = require("./adminAiOfficeBrainManager");

const DEFAULT_MODEL = "gpt-4.1-mini";

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 80;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function hasThai(value) {
  return /[\u0E00-\u0E7F]/.test(String(value || ""));
}
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
  if (/ราคา|เท่าไหร่|กี่บาท|price|cost/.test(s)) return "price_question";
  if (/กลิ่น|เหม็น|อับ/.test(s)) return "bad_smell";
  if (/ไม่เย็น|ไม่ค่อยเย็น|ลมไม่เย็น/.test(s)) return "air_not_cold";
  if (/น้ำหยด|หยดน้ำ|รั่ว/.test(s)) return "water_leak";
  if (/นัด|คิว|ว่าง|วันไหน|เวลา/.test(s)) return "appointment";
  if (/ล้างแบบ|แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง/.test(s)) return "cleaning_package";
  return "general";
}
function isAdminCorrection(text) {
  return /(ผิด|ไม่ใช่|ยังว่าง|อย่าบอกว่าคิวเต็ม|ตอบแบบนี้ไม่ดี|ควรตอบแบบนี้|มั่ว|งง)/i.test(String(text || ""));
}
function correctionSituation(text) {
  const s = String(text || "").toLowerCase();
  if (/(คิว|ว่าง|ช่าง|เวลา|เต็ม)/.test(s)) return "availability_logic";
  if (/(รายได้ช่าง|ยอดช่าง|ต้องจ่ายช่าง|ยังไม่จ่ายช่าง|จ่ายช่าง|payout|commission|technician income)/i.test(s)) return "payout_logic";
  if (/(ราคา|แพง|แบบไหนดี|โปร|ส่วนลด)/.test(s)) return "sales_reply_logic";
  return "customer_reply_style";
}
function detectLineIntent(text) {
  const s = String(text || "").toLowerCase();
  if (/(คืนเงิน|ฟ้อง|ร้องเรียน|เคลม|ไม่พอใจ|complaint|refund|legal)/i.test(s)) return "complaint";
  if (/(แพง|ลด|ส่วนลด|ทำไมราคา|price objection|expensive)/i.test(s)) return "price_objection";
  if (/(ราคา|เท่าไหร่|กี่บาท|price|cost)/i.test(s)) return "price_question";
  if (/(แพ็กเกจ|แบบไหนดี|ล้างแบบ|premium|normal|deep clean)/i.test(s)) return "package_recommendation";
  if (/(นัด|จอง|คิว|ว่าง|วันไหน|เวลา|booking)/i.test(s)) return "booking_request";
  if (/(พื้นที่|ไปถึง|เขต|อำเภอ|จังหวัด|service area)/i.test(s)) return "service_area";
  if (/(ประกัน|รับประกัน|warranty)/i.test(s)) return "warranty";
  if (/(ซ่อม|รั่ว|ไม่เย็น|น้ำหยด|repair|leak)/i.test(s)) return "repair_question";
  return "general";
}
function detectCustomerStage(text, intent) {
  const s = String(text || "").toLowerCase();
  if (intent === "complaint") return "complaint";
  if (/(ยืนยัน|ตกลง|จองเลย|พร้อมนัด|confirmed)/i.test(s)) return "booking_ready";
  if (/(ที่อยู่|โลเคชั่น|location|address)/i.test(s)) return "waiting_address";
  if (/(หลังล้าง|หลังบริการ|เรียบร้อย|after service)/i.test(s)) return "after_service";
  if (/(แพง|เทียบ|เจ้าอื่น|ขอดูก่อน|comparing)/i.test(s)) return "comparing";
  if (intent === "price_question" || intent === "price_objection" || intent === "package_recommendation") return "asking_price";
  return "new_lead";
}
function riskMetadata(text, intent) {
  const s = String(text || "").toLowerCase();
  const red = /(ฟ้อง|ทนาย|ร้องเรียน|คืนเงิน|refund|legal)/i.test(s);
  const yellow = red || /(เคลม|ไม่พอใจ|เสียหาย|รั่ว|ซ่อม|complaint|repair|leak)/i.test(s);
  return {
    risk_level: red ? "red" : yellow ? "yellow" : "green",
    needs_admin_review: red || intent === "complaint",
  };
}
function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}

async function ensureLineDraftMemorySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_line_chat_drafts (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL,
      selected_customer_message TEXT NOT NULL DEFAULT '',
      admin_instruction TEXT NOT NULL DEFAULT '',
      ai_draft TEXT NOT NULL DEFAULT '',
      final_admin_reply TEXT NOT NULL DEFAULT '',
      action_status TEXT NOT NULL DEFAULT 'drafted',
      created_by TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_line_chat_drafts_conversation_time ON public.ai_line_chat_drafts(conversation_id, created_at DESC)`);
}


async function loadSharedMemoryForDraft(pool, { conversationId, selectedQuestion, situationType, language }) {
  try {
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
    const r = await pool.query(`
      SELECT source, event_type, agent_key, conversation_id, selected_customer_question, customer_message,
             ai_reply, final_admin_reply, action_status, situation_type, service_type, tags, created_at
        FROM public.ai_memory_events
       WHERE (conversation_id=$1 OR conversation_id IS NULL)
         AND (situation_type=$2 OR situation_type='general')
         AND action_status <> 'disliked'
         AND event_type <> 'disliked'
         AND (final_admin_reply <> '' OR ai_reply <> '')
       ORDER BY CASE WHEN event_type='admin_correction' OR action_status='correction' THEN 0 ELSE 1 END,
                CASE WHEN action_status IN ('saved','copied','liked') THEN 0 ELSE 1 END,
                CASE WHEN source='reply_example' THEN 0 ELSE 1 END,
                created_at DESC
       LIMIT 8
    `, [conversationId || null, situationType || "general"]);
    return r.rows || [];
  } catch (_) {
    return [];
  }
}

async function logSharedDraftMemory(pool, req, payload) {
  try {
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
    await pool.query(`
      INSERT INTO public.ai_memory_events(source,event_type,agent_key,conversation_id,selected_customer_question,customer_message,ai_reply,final_admin_reply,action_status,situation_type,created_by,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    `, [
      payload.source || "line_chat",
      payload.event_type || "line_drafted",
      payload.agent_key || "admin",
      payload.conversation_id || null,
      payload.selected_customer_question || "",
      payload.customer_message || "",
      payload.ai_reply || "",
      payload.final_admin_reply || "",
      payload.action_status || "drafted",
      payload.situation_type || "general",
      getAdminUser(req),
      JSON.stringify(payload.metadata || {}),
    ]);
  } catch (_) {}
}


function callOpenAI({ apiKey, model, messages }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, temperature: 0.35, messages, response_format: { type: "json_object" } });
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
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("OPENAI_TIMEOUT")));
    req.write(payload);
    req.end();
  });
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
async function loadExamples(pool, { situationType, language }) {
  try {
    const r = await pool.query(`
      SELECT id, situation_type, customer_message, final_admin_reply, language, service_type, tags, usage_count
        FROM public.ai_reply_examples
       WHERE COALESCE(is_active, true) = true
         AND ($1 = '' OR situation_type = $1 OR situation_type = 'general')
         AND ($2 = '' OR language = $2 OR language = 'th' OR language = 'unknown')
       ORDER BY CASE WHEN situation_type = $1 THEN 0 ELSE 1 END,
                usage_count DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 5
    `, [situationType || "", language || ""]);
    return r.rows || [];
  } catch (_) {
    return [];
  }
}
function fallbackReply(selectedQuestion) {
  const q = String(selectedQuestion || "");
  if (/กลิ่น|เหม็น|อับ/.test(q)) return "สวัสดีค่ะ ถ้าแอร์เริ่มมีกลิ่นอับแต่ยังเย็นปกติ เบื้องต้นแนะนำล้างพรีเมียมค่ะ รบกวนแจ้งขนาด BTU จำนวนเครื่อง และพื้นที่ให้แอดมินเช็กคิวให้นะคะ 🙏";
  if (/ราคา|เท่าไหร่|กี่บาท/.test(q)) return "สวัสดีค่ะ ราคาล้างแอร์ผนังเริ่มต้น 550 บาทค่ะ รบกวนแจ้งขนาด BTU จำนวนเครื่อง และพื้นที่ให้แอดมินเช็กคิวให้นะคะ 🙏";
  return "สวัสดีค่ะ รบกวนแจ้งรายละเอียดเพิ่มเติมนิดนึงนะคะ เดี๋ยวแอดมินช่วยตรวจสอบและแนะนำให้เหมาะกับหน้างานค่ะ 🙏";
}
function sanitizeCustomerReply(text, selectedQuestion) {
  let out = cleanText(text, 1500)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(ข้อความพร้อมส่งลูกค้า|customer_reply|คำตอบลูกค้า)\s*[:：-]?\s*/i, "")
    .replace(/(?:สรุป|ข้อมูลที่ยังขาด|หมายเหตุสำหรับแอดมิน|แนะนำขั้นต่อไป)\s*[:：][\s\S]*$/i, "")
    .trim();
  if (!out || /สรุป|ข้อมูลที่ยังขาด|หมายเหตุสำหรับแอดมิน|admin_summary|missing_info/i.test(out)) out = fallbackReply(selectedQuestion);
  if (hasThai(out)) {
    out = out.replace(/นะครับ/g, "นะคะ").replace(/ครับ/g, "ค่ะ");
    if (!/(ค่ะ|นะคะ)/.test(out)) out += "ค่ะ";
  }
  return out;
}
async function saveDraft(pool, req, payload) {
  await ensureLineDraftMemorySchema(pool);
  const r = await pool.query(`
    INSERT INTO public.ai_line_chat_drafts(conversation_id, selected_customer_message, admin_instruction, ai_draft, action_status, created_by, metadata)
    VALUES($1,$2,$3,$4,'drafted',$5,$6::jsonb)
    RETURNING id, conversation_id, selected_customer_message, admin_instruction, ai_draft, action_status, created_at
  `, [payload.conversation_id, payload.selected_customer_message, payload.admin_instruction, payload.ai_draft, getAdminUser(req), JSON.stringify(payload.metadata || {})]);
  return r.rows[0];
}

module.exports = function createAdminAiOfficeLineDraftV27Routes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeLineDraftV27Routes requires pool and requireAdminSession");
  const router = express.Router();

  router.get("/admin/ai-office/line-drafts", requireAdminSession, async (req, res) => {
    try {
      await ensureLineDraftMemorySchema(pool);
      const conversationId = Number(req.query.conversation_id || 0);
      if (!conversationId) return res.status(400).json({ ok:false, error:"conversation_id required" });
      const r = await pool.query(`
        SELECT id, conversation_id, selected_customer_message, admin_instruction, ai_draft, final_admin_reply, action_status, created_at
          FROM public.ai_line_chat_drafts
         WHERE conversation_id=$1
         ORDER BY created_at DESC
         LIMIT 20
      `, [conversationId]);
      return res.json({ ok:true, drafts:(r.rows || []).reverse() });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_LINE_DRAFTS_FAILED" });
    }
  });

  router.post("/admin/ai-office/line-draft-reply", requireAdminSession, async (req, res) => {
    try {
      await ensureLineDraftMemorySchema(pool);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ ok:false, error:"ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ AI Office" });
      const conversationId = Number(req.body?.conversation_id || 0);
      if (!conversationId) return res.status(400).json({ ok:false, error:"กรุณาเลือกแชท LINE ก่อน" });

      const conversation = await loadConversation(pool, conversationId);
      const messages = await loadMessages(pool, conversationId);
      if (!messages.length) return res.status(400).json({ ok:false, error:"ยังไม่มีข้อความในแชทนี้" });

      const selectedQuestionFromRequest = cleanText(req.body?.selected_customer_question, 2000);
      const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound" && m.message_text);
      const latestCustomerMessage = cleanText(latestInbound?.message_text || conversation.last_message_text, 2000);
      const selectedQuestion = selectedQuestionFromRequest || latestCustomerMessage;
      const selectedQuestionUsed = Boolean(selectedQuestionFromRequest);
      const draftSource = selectedQuestionUsed ? "selected_customer_question" : "latest_customer_message";
      const adminQuestion = cleanText(req.body?.admin_question || req.body?.instruction || "ควรตอบลูกค้ายังไง", 1200);
      const language = detectLanguage(selectedQuestion);
      const situationType = inferSituation(`${selectedQuestion}\n${adminQuestion}`);
      const intent = detectLineIntent(`${selectedQuestion}\n${adminQuestion}`);
      const customerStage = detectCustomerStage(`${selectedQuestion}\n${adminQuestion}`, intent);
      const brainContext = await loadAiBrainContext(pool, {
        query: `${selectedQuestion}\n${adminQuestion}`,
        agent_key: "sales",
        intent,
        service_type: "",
        customer_stage: customerStage,
        language: language === "unknown" ? "th" : language,
        limit: 10,
      }).catch(() => ({ items: [] }));
      if (isAdminCorrection(adminQuestion)) {
        await logSharedDraftMemory(pool, req, {
          source: "line_chat",
          event_type: "admin_correction",
          agent_key: "admin",
          conversation_id: conversationId,
          selected_customer_question: selectedQuestion,
          customer_message: selectedQuestion,
          final_admin_reply: adminQuestion,
          action_status: "correction",
          situation_type: correctionSituation(`${selectedQuestion}\n${adminQuestion}`),
          metadata: { auto_detected: true },
        });
      }
      const examples = await loadExamples(pool, { situationType, language });
      const sharedMemory = await loadSharedMemoryForDraft(pool, { conversationId, selectedQuestion, situationType, language });
      const priorDrafts = Array.isArray(req.body?.prior_drafts) ? req.body.prior_drafts.slice(-5) : [];

      const system = [
        "You are Sales/Admin AI for Coldwindflow LINE OA.",
        "Return strict JSON only with keys: customer_reply, admin_summary, missing_info, next_step, customer_language, is_foreign_customer, original_message, thai_translation, customer_stage, intent, confidence, risk_level, needs_admin_review.",
        "selected_customer_question is the MAIN customer question to answer. Other LINE messages are context only.",
        "Do not answer from the latest customer message if selected_customer_question exists.",
        "Write like a real Thai female LINE admin: short, warm, natural, ready to send. Use ค่ะ/นะคะ. Never use ครับ.",
        "No headings, no bullets, no report format, no JSON visible inside customer_reply.",
        "Do not repeat questions for details already present in selected_customer_question/context.",
        "If missing required booking info, ask only the missing info. If enough info exists, do not ask again.",
        "If customer says expensive, do not argue; explain value and offer a suitable option.",
        "If repair, leak, or uncertain price, say the technician needs to inspect before final quote.",
        "If complaint, legal, or refund risk exists, set needs_admin_review true.",
        "Follow policy_rule and bad_reply_pattern brain items strictly. Use approved_reply and sales_playbook as examples. Never expose internal brain item text as system says.",
        "Do not claim any LINE message was sent or any booking/status was created.",
        "Use saved final_admin_reply examples as style reference only."
      ].join(" ");

      const prompt = [
        "draft_source:", draftSource, "",
        "selected_customer_question_main:", selectedQuestion, "",
        "latest_customer_message_context_only:", latestCustomerMessage, "",
        "admin_instruction:", adminQuestion, "",
        "conversation:",
        JSON.stringify({ display_name: conversation.display_name || "", messages: messages.map((m) => ({ direction:m.direction, text:m.message_text, at:m.received_at || m.created_at })).slice(-20) }, null, 2),
        "",
        "prior_ai_drafts_for_this_conversation:", JSON.stringify(priorDrafts, null, 2), "",
        "trusted_admin_reply_examples:",
        JSON.stringify(examples.map((e) => ({ situation_type:e.situation_type, customer_message:e.customer_message, final_admin_reply:e.final_admin_reply, language:e.language })), null, 2),
        "",
        "shared_memory_from_agent_and_line_context:",
        JSON.stringify(sharedMemory.map((m) => ({
          source:m.source,
          event_type:m.event_type,
          agent_key:m.agent_key,
          selected_customer_question:m.selected_customer_question,
          customer_message:m.customer_message,
          ai_reply:m.ai_reply,
          final_admin_reply:m.final_admin_reply,
          action_status:m.action_status,
          situation_type:m.situation_type
        })), null, 2),
        "",
        "ai_brain_context:",
        JSON.stringify((brainContext.items || []).map((b) => ({
          item_type:b.item_type,
          title:b.title,
          content:b.content,
          intent:b.intent,
          service_type:b.service_type,
          customer_stage:b.customer_stage,
          agent_key:b.agent_key,
          priority:b.priority,
          confidence:b.confidence,
          tags:b.tags
        })), null, 2),
        "",
        "CWF facts:",
        JSON.stringify({ wall_under_12000: { normal:550, premium:790, hanging_coil:1290, deep_clean:1850 }, wall_18000_up: { normal:690, premium:990, hanging_coil:1550, deep_clean:2150 }, check_fee:700, warranty_cleaning_days:30, services:["ล้างแอร์","ซ่อมแอร์","ติดตั้งแอร์","ตรวจเช็คแอร์"] }, null, 2)
      ].join("\n");

      let raw = "";
      try {
        raw = await callOpenAI({ apiKey, model: String(process.env.AI_OFFICE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL, messages:[{role:"system",content:system},{role:"user",content:prompt}] });
      } catch (e) {
        raw = JSON.stringify({ customer_reply: fallbackReply(selectedQuestion), admin_summary:[], missing_info:[], next_step:"", customer_language:language, is_foreign_customer:language !== "th" && language !== "unknown", original_message:selectedQuestion, thai_translation:"" });
      }

      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (_) { parsed = { customer_reply: raw }; }
      const customerReply = sanitizeCustomerReply(parsed.customer_reply, selectedQuestion);
      const risk = riskMetadata(`${selectedQuestion}\n${adminQuestion}`, intent);
      const draft = {
        customer_reply: customerReply,
        admin_summary: Array.isArray(parsed.admin_summary) ? parsed.admin_summary : [],
        missing_info: Array.isArray(parsed.missing_info) ? parsed.missing_info : [],
        next_step: cleanText(parsed.next_step, 500),
        customer_language: parsed.customer_language || language,
        is_foreign_customer: Boolean(parsed.is_foreign_customer || (language !== "th" && language !== "unknown")),
        foreign_customer_label: "",
        original_message: selectedQuestion,
        thai_translation: cleanText(parsed.thai_translation, 1000),
        selected_customer_question: selectedQuestion,
        situation_type: situationType,
        selected_question_used: selectedQuestionUsed,
        draft_source: draftSource,
        latest_customer_message: latestCustomerMessage,
        intent: cleanText(parsed.intent || intent, 80),
        customer_stage: cleanText(parsed.customer_stage || customerStage, 80),
        confidence: clampConfidence(parsed.confidence),
        risk_level: ["green", "yellow", "red"].includes(parsed.risk_level) ? parsed.risk_level : risk.risk_level,
        needs_admin_review: Boolean(parsed.needs_admin_review || risk.needs_admin_review),
        used_ai_brain_items: (brainContext.items || []).map((b) => ({ id:b.id, item_type:b.item_type, title:b.title, intent:b.intent, agent_key:b.agent_key })),
        used_reply_examples: examples.map((e) => ({ id:e.id, situation_type:e.situation_type, language:e.language, service_type:e.service_type })),
      };
      const saved = await saveDraft(pool, req, { conversation_id: conversationId, selected_customer_message: selectedQuestion, admin_instruction: adminQuestion, ai_draft: customerReply, metadata: { situation_type: situationType, language, intent: draft.intent, customer_stage: draft.customer_stage, risk_level: draft.risk_level, needs_admin_review: draft.needs_admin_review, used_example_ids: draft.used_reply_examples.map((e) => e.id), used_ai_brain_item_ids: draft.used_ai_brain_items.map((e) => e.id) } }).catch(() => null);
      if (saved) draft.saved_draft_id = saved.id;
      await logSharedDraftMemory(pool, req, {
        source: "line_chat",
        event_type: "line_drafted",
        agent_key: "admin",
        conversation_id: conversationId,
        selected_customer_question: selectedQuestion,
        customer_message: selectedQuestion,
        ai_reply: customerReply,
        action_status: "drafted",
        situation_type: situationType,
        metadata: { saved_draft_id: saved?.id || null, intent: draft.intent, customer_stage: draft.customer_stage, risk_level: draft.risk_level, needs_admin_review: draft.needs_admin_review, used_example_ids: draft.used_reply_examples.map((e) => e.id), used_ai_brain_item_ids: draft.used_ai_brain_items.map((e) => e.id) },
      });
      return res.json({
        ok:true,
        answer:customerReply,
        draft,
        used_reply_examples:draft.used_reply_examples,
        conversation,
        messages,
        selected_question_used: selectedQuestionUsed,
        selected_customer_question: selectedQuestion,
        latest_customer_message: latestCustomerMessage,
        draft_source: draftSource,
        intent: draft.intent,
        customer_stage: draft.customer_stage,
        confidence: draft.confidence,
        risk_level: draft.risk_level,
        needs_admin_review: draft.needs_admin_review,
      });
    } catch (e) {
      console.error("V27 /line-draft-reply error:", e);
      return res.status(e.status || 500).json({ ok:false, error:e.message || "ร่างข้อความจาก LINE ไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/line-drafts/:id/action", requireAdminSession, async (req, res) => {
    try {
      await ensureLineDraftMemorySchema(pool);
      const id = Number(req.params.id || 0);
      const action = cleanText(req.body?.action_status || "copied", 40);
      const finalText = cleanText(req.body?.final_admin_reply || "", 4000);
      const r = await pool.query(`
        UPDATE public.ai_line_chat_drafts
           SET action_status=$2,
               final_admin_reply=COALESCE(NULLIF($3,''), final_admin_reply),
               updated_at=NOW()
         WHERE id=$1
         RETURNING *
      `, [id, action, finalText]);
      return res.json({ ok:true, draft:r.rows?.[0] || null });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "UPDATE_LINE_DRAFT_ACTION_FAILED" });
    }
  });

  return router;
};

module.exports.ensureLineDraftMemorySchema = ensureLineDraftMemorySchema;
