#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"
STAMP="$(date +%Y%m%d%H%M%S)"

if [ ! -f "server/routes/adminAiOfficeReadOnly.js" ]; then
  echo "ERROR: server/routes/adminAiOfficeReadOnly.js not found"
  exit 1
fi
if [ ! -f "server/routes/lineWebhook.js" ]; then
  echo "ERROR: server/routes/lineWebhook.js not found"
  exit 1
fi

cp server/routes/adminAiOfficeReadOnly.js "server/routes/adminAiOfficeReadOnly.js.bak.$STAMP"
cp server/routes/lineWebhook.js "server/routes/lineWebhook.js.bak.$STAMP"

python3 - <<'PY_PATCH_ADMIN'
from pathlib import Path
import re

p = Path("server/routes/adminAiOfficeReadOnly.js")
s = p.read_text(encoding="utf-8")
orig = s

s = re.sub(
    r'function requireAiOfficePin\(req\) \{[\s\S]*?\n\}',
    'function requireAiOfficePin(_req) {\n  return;\n}',
    s,
    count=1,
)
s = s.replace('pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim())', 'pin_required: false')
s = s.replace('const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());', 'const pinRequired = false;')

if 'function sanitizeConversationHistory(' not in s:
    marker = 'function getAgent(agentKey) {'
    helper = '''function sanitizeConversationHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).map((item) => {
    const role = item && item.role === "user" ? "user" : "assistant";
    const content = cleanText(item && item.content, 1600);
    if (!content) return null;
    return { role, content };
  }).filter(Boolean);
}

'''
    if marker in s:
        s = s.replace(marker, helper + marker, 1)

if 'async function ensureAiOfficeLineTables(' not in s:
    marker = '\nmodule.exports = function createAdminAiOfficeReadOnlyRoutes'
    helper = r'''
async function ensureAiOfficeLineTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.line_conversations (
      id BIGSERIAL PRIMARY KEY,
      line_user_id TEXT NOT NULL UNIQUE,
      display_name TEXT NULL,
      picture_url TEXT NULL,
      last_message_text TEXT NULL,
      last_message_type TEXT NULL,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.line_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT REFERENCES public.line_conversations(id) ON DELETE CASCADE,
      line_user_id TEXT NOT NULL,
      message_id TEXT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      event_type TEXT NULL,
      message_type TEXT NULL,
      message_text TEXT NULL,
      raw_event_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_conversations_last_message_at ON public.line_conversations(last_message_at DESC NULLS LAST)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_messages_conversation_created ON public.line_messages(conversation_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_messages_line_user_created ON public.line_messages(line_user_id, created_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_line_messages_message_id_unique ON public.line_messages(message_id) WHERE message_id IS NOT NULL`);
}

function countPattern(text, re) {
  const matches = String(text || '').match(re);
  return matches ? matches.length : 0;
}

function detectLineLanguageHint(text) {
  const t = String(text || '');
  if (/[\u3040-\u30ff]/.test(t)) return 'Japanese';
  if (/[\u3400-\u9fff]/.test(t)) return 'Chinese';
  if (/[\uac00-\ud7af]/.test(t)) return 'Korean';
  if (/[A-Za-z]/.test(t)) return 'English';
  return 'foreign_language';
}

function looksForeignCustomerText(text) {
  const t = cleanText(text, 4000);
  if (!t) return false;
  const thai = countPattern(t, /[ก-๙]/g);
  const latin = countPattern(t, /[A-Za-z]/g);
  const cjk = countPattern(t, /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g);
  const foreign = latin + cjk;
  if (foreign < 3) return false;
  return thai < Math.max(3, Math.floor(foreign * 0.35));
}

function foreignCustomerLabel(conversation) {
  const name = cleanText(conversation?.display_name, 120) || 'ไม่ทราบชื่อ LINE';
  return `ลูกค้าต่างชาติ: ${name}`;
}

async function translateLineTextToThai({ apiKey, model, text, displayName }) {
  const source = cleanText(text, 4000);
  if (!source || !apiKey) return '';
  const prompt = [
    'แปลข้อความลูกค้าต่างชาติเป็นภาษาไทยสำหรับแอดมิน Coldwindflow Air Services',
    'ให้แปลตรงความหมาย สุภาพ อ่านง่าย ไม่แต่งข้อมูลเพิ่ม',
    'ถ้ามีคำเกี่ยวกับแอร์ งานซ่อม นัดหมาย ราคา ให้รักษาความหมายให้ชัด',
    `ชื่อ LINE ของลูกค้า: ${cleanText(displayName, 120) || 'ไม่ทราบชื่อ'}`,
    '',
    'ข้อความต้นฉบับ:',
    source,
    '',
    'ตอบเฉพาะคำแปลภาษาไทยเท่านั้น'
  ].join('\n');
  try {
    return cleanText(await callOpenAI({ apiKey, model, prompt }), 4000);
  } catch (e) {
    return '';
  }
}

async function enrichLineConversationsForAdmin({ conversations, apiKey, model }) {
  const rows = Array.isArray(conversations) ? conversations : [];
  const out = [];
  let translatedCount = 0;
  for (const row of rows) {
    const item = { ...row };
    const text = item.last_message_text || '';
    const isForeign = looksForeignCustomerText(text);
    item.is_foreign_customer = Boolean(isForeign);
    item.foreign_customer_label = isForeign ? foreignCustomerLabel(item) : '';
    item.detected_language_hint = isForeign ? detectLineLanguageHint(text) : 'Thai/unknown';
    item.original_last_message_text = text;
    item.last_message_thai_translation = '';
    item.last_message_text_for_admin = text;
    if (isForeign) {
      if (translatedCount < 8) {
        item.last_message_thai_translation = await translateLineTextToThai({ apiKey, model, text, displayName: item.display_name });
        translatedCount += 1;
      }
      const translated = item.last_message_thai_translation || 'ยังแปลไม่ได้ ตรวจ OPENAI_API_KEY หรือให้ AI ช่วยแปลจากข้อความนี้';
      item.last_message_text_for_admin = `${item.foreign_customer_label}\nต้นฉบับ: ${text}\nแปลไทย: ${translated}`;
    }
    out.push(item);
  }
  return out;
}

async function enrichLineMessagesForAdmin({ conversation, messages, apiKey, model }) {
  const rows = Array.isArray(messages) ? messages : [];
  const out = [];
  let translatedCount = 0;
  for (const row of rows) {
    const item = { ...row };
    const text = item.message_text || '';
    const inbound = String(item.direction || '').toLowerCase() !== 'outbound';
    const isForeign = inbound && looksForeignCustomerText(text);
    item.is_foreign_customer_message = Boolean(isForeign);
    item.foreign_customer_label = isForeign ? foreignCustomerLabel(conversation) : '';
    item.detected_language_hint = isForeign ? detectLineLanguageHint(text) : 'Thai/unknown';
    item.original_message_text = text;
    item.thai_translation = '';
    item.message_text_for_admin = text;
    if (isForeign) {
      if (translatedCount < 20) {
        item.thai_translation = await translateLineTextToThai({ apiKey, model, text, displayName: conversation?.display_name });
        translatedCount += 1;
      }
      const translated = item.thai_translation || 'ยังแปลไม่ได้ ตรวจ OPENAI_API_KEY หรือให้ AI ช่วยแปลจากข้อความนี้';
      item.message_text_for_admin = `${item.foreign_customer_label}\nต้นฉบับ: ${text}\nแปลไทย: ${translated}`;
    }
    out.push(item);
  }
  return out;
}

async function loadRecentLineContext(pool, { apiKey = '', model = AI_OFFICE_DEFAULT_MODEL, limit = 12 } = {}) {
  await ensureAiOfficeLineTables(pool);
  const n = Math.max(1, Math.min(Number(limit || 12), 30));
  const conv = await pool.query(
    `SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at, updated_at
     FROM public.line_conversations
     ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC NULLS LAST
     LIMIT $1`,
    [n]
  );
  const conversations = [];
  for (const row of conv.rows || []) {
    const msg = await pool.query(
      `SELECT id, direction, event_type, message_type, message_text, received_at, created_at
       FROM public.line_messages
       WHERE conversation_id=$1
       ORDER BY COALESCE(received_at, created_at) DESC NULLS LAST, id DESC
       LIMIT 8`,
      [row.id]
    );
    const conversation = {
      id: row.id,
      line_user_id: row.line_user_id,
      display_name: row.display_name || '',
      picture_url: row.picture_url || '',
      last_message_text: row.last_message_text || '',
      last_message_type: row.last_message_type || '',
      last_message_at: row.last_message_at || row.updated_at || null,
    };
    const enrichedMessages = await enrichLineMessagesForAdmin({
      conversation,
      messages: (msg.rows || []).reverse().map((m) => ({
        id: m.id,
        direction: m.direction || '',
        event_type: m.event_type || '',
        message_type: m.message_type || '',
        message_text: m.message_text || '',
        received_at: m.received_at || m.created_at || null,
      })),
      apiKey,
      model,
    });
    conversations.push({ ...conversation, recent_messages: enrichedMessages });
  }
  return conversations;
}

function shouldAttachLineContext(question, agentKey) {
  const q = String(question || '').toLowerCase();
  const agent = String(agentKey || '').toLowerCase();
  return ['admin', 'sales', 'ops', 'content'].includes(agent)
    || q.includes('line') || q.includes('oa') || q.includes('แชท') || q.includes('ลูกค้า')
    || q.includes('ตอบ') || q.includes('ทัก') || q.includes('ล่าสุด') || q.includes('ต่างชาติ') || q.includes('แปล');
}

'''
    if marker in s:
        s = s.replace(marker, helper + marker, 1)

if 'function buildGroundedPrompt(question, context, agent)' in s:
    new_prompt = '''function buildGroundedPrompt(question, context, agent, history = []) {
  const safeHistory = sanitizeConversationHistory(history);
  return [
    "คุณคือ CWF Operations Copilot / ผู้ช่วยผู้จัดการออฟฟิศ Coldwindflow สำหรับแอดมินเท่านั้น",
    `ตัวละครที่ถูกเลือก: ${agent.name}`,
    `บทบาทของตัวละครนี้: ${agent.role}`,
    "ตอบเป็นภาษาไทย สุภาพ มืออาชีพ ตรงประเด็น พร้อมใช้งานจริง",
    "ใช้ข้อมูลจริงใน JSON เท่านั้น ห้ามแต่งข้อมูลงานหรือแชทเพิ่มเอง",
    "ถ้า context.line_inbox มีข้อมูล ให้ใช้เป็นข้อมูลแชท LINE OA ล่าสุดของลูกค้า",
    "ถ้าข้อความเป็นลูกค้าต่างชาติ ให้ระบุชื่อ LINE/ชื่อที่ระบบมีให้ชัด เช่น 'ลูกค้าต่างชาติ: ชื่อ...' แล้วตามด้วยคำแปลไทย",
    "ถ้าไม่มีข้อมูล LINE ให้บอกชัดว่ายังไม่มีแชท LINE ที่ระบบเก็บได้ หรือ webhook เพิ่งเริ่มเก็บหลังเปิดใช้งาน",
    "ถ้าคำถามต่อเนื่อง ให้ใช้ประวัติแชทล่าสุดช่วยตีความ แต่ข้อเท็จจริงต้องยึดข้อมูลจริงใน JSON",
    "ห้ามสร้างงาน ห้ามแก้งาน ห้ามเปลี่ยนสถานะ ห้ามส่ง LINE ห้ามปรับแอด ห้าม deploy/merge เอง เพราะ Phase 1 เป็น read-only/draft-only",
    "ถ้าร่างข้อความ ให้เขียนเป็นข้อความพร้อมคัดลอก",
    "",
    "ประวัติแชทล่าสุด:",
    JSON.stringify(safeHistory, null, 2),
    "",
    `คำถามล่าสุด: ${cleanText(question, 1200)}`,
    "",
    "ข้อมูลจริงจากระบบ CWF/LINE:",
    JSON.stringify(context, null, 2),
  ].join("\\n");
}'''
    s = re.sub(r'function buildGroundedPrompt\(question, context, agent\) \{[\s\S]*?\n\}', lambda _: new_prompt, s, count=1)

if 'router.get("/admin/ai-office/connectors/status"' not in s:
    marker = '  router.get("/admin/ai-office/config", requireAdminSession, (req, res) => {'
    block = '''  router.get("/admin/ai-office/connectors/status", requireAdminSession, async (req, res) => {
    try {
      await ensureAiOfficeLineTables(pool);
      const lineCount = await pool.query(`SELECT COUNT(*)::int AS count, MAX(COALESCE(last_message_at, updated_at, created_at)) AS latest_at FROM public.line_conversations`);
      const msgCount = await pool.query(`SELECT COUNT(*)::int AS count, MAX(COALESCE(received_at, created_at)) AS latest_at FROM public.line_messages`);
      return res.json({
        ok: true,
        connectors: {
          cwf_db: { connected: true },
          line_oa: {
            configured: Boolean(String(process.env.LINE_CHANNEL_SECRET || "").trim()) && Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()),
            conversations: Number(lineCount.rows?.[0]?.count || 0),
            messages: Number(msgCount.rows?.[0]?.count || 0),
            latest_conversation_at: lineCount.rows?.[0]?.latest_at || null,
            latest_message_at: msgCount.rows?.[0]?.latest_at || null,
            auto_translate_foreign_customers: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
          },
          openai: { configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()) },
          google_ads: { configured: Boolean(String(process.env.GOOGLE_ADS_CLIENT_ID || "").trim()) && Boolean(String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim()) },
          github: { configured: Boolean(String(process.env.GITHUB_TOKEN || "").trim()) },
          render: { configured: Boolean(String(process.env.RENDER_API_KEY || "").trim()) },
        },
      });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ตรวจ connector ไม่สำเร็จ" });
    }
  });

'''
    if marker in s:
        s = s.replace(marker, block + marker, 1)

s = s.replace(
    '      const limit = clampLimit(req.query.limit, 30, 100);\n      const conversations = await loadLineInbox(pool, limit);\n      return res.json({ ok: true, conversations });',
    '      await ensureAiOfficeLineTables(pool);\n      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();\n      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;\n      const limit = clampLimit(req.query.limit, 30, 100);\n      const rawConversations = await loadLineInbox(pool, limit);\n      const conversations = await enrichLineConversationsForAdmin({ conversations: rawConversations, apiKey, model });\n      return res.json({ ok: true, conversations });'
)
s = s.replace(
    '      const limit = clampLimit(req.query.limit, 50, 100);\n      const conversation = await loadLineConversation(pool, req.params.id);\n      const messages = await loadLineMessages(pool, req.params.id, limit);\n      return res.json({ ok: true, conversation, messages });',
    '      await ensureAiOfficeLineTables(pool);\n      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();\n      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;\n      const limit = clampLimit(req.query.limit, 50, 100);\n      const conversation = await loadLineConversation(pool, req.params.id);\n      const rawMessages = await loadLineMessages(pool, req.params.id, limit);\n      const messages = await enrichLineMessagesForAdmin({ conversation, messages: rawMessages, apiKey, model });\n      return res.json({ ok: true, conversation, messages });'
)
s = s.replace('      const conversationId = Number(req.body?.conversation_id || 0);', '      await ensureAiOfficeLineTables(pool);\n      const conversationId = Number(req.body?.conversation_id || 0);')

needle = '      const question = cleanText(req.body?.question, 1200);\n      const agent = getAgent(req.body?.agent);'
if needle in s and 'const history = sanitizeConversationHistory(req.body?.conversation_history);' not in s:
    s = s.replace(needle, '      const question = cleanText(req.body?.question, 1200);\n      const history = sanitizeConversationHistory(req.body?.conversation_history);\n      const agent = getAgent(req.body?.agent);', 1)
needle_context = '      const context = { summary, buckets: {}, phone_search: null, generated_at: new Date().toISOString() };'
if needle_context in s and 'line_inbox: null' not in s:
    s = s.replace(needle_context, '      const context = { summary, buckets: {}, phone_search: null, line_inbox: null, generated_at: new Date().toISOString() };', 1)
insert_marker = '      if (onlyDigits(phone).length >= 6 || onlyDigits(question).length >= 6) {'
insert_block = '''      if (shouldAttachLineContext(question, req.body?.agent)) {
        const lineApiKey = String(process.env.OPENAI_API_KEY || "").trim();
        const lineModel = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
        context.line_inbox = await loadRecentLineContext(pool, { apiKey: lineApiKey, model: lineModel, limit: 12 }).catch((err) => ({ error: err.message }));
      }

'''
if insert_marker in s and 'context.line_inbox = await loadRecentLineContext' not in s:
    s = s.replace(insert_marker, insert_block + insert_marker, 1)
s = s.replace('const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });', 'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });')
s = s.replace('{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },', '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF แบบคุยต่อเนื่อง ยึดข้อมูลจริงจาก CWF และ LINE OA เท่านั้น แปลลูกค้าต่างชาติเป็นไทยเมื่อมีข้อมูล และห้ามทำ action แทนแอดมิน" },')

if s != orig:
    p.write_text(s, encoding="utf-8")
    print("Patched adminAiOfficeReadOnly.js: LINE status, LINE reading, foreign customer translation, PIN removed.")
else:
    print("adminAiOfficeReadOnly.js already patched/no matching changes.")
PY_PATCH_ADMIN

python3 - <<'PY_PATCH_LINE'
from pathlib import Path
p = Path("server/routes/lineWebhook.js")
s = p.read_text(encoding="utf-8")
orig = s
s = s.replace('const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");', 'const rawBody = Buffer.isBuffer(req.body) ? req.body : (Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})));')
if 'let lineSchemaReady = false;' not in s:
    s = s.replace('  const router = express.Router();', '''  const router = express.Router();
  let lineSchemaReady = false;
  async function ensureSchemaOnce() {
    if (lineSchemaReady) return;
    await ensureLineInboxSchema(pool);
    lineSchemaReady = true;
  }''', 1)
if 'await ensureSchemaOnce();\n          await storeInboundLineMessage' not in s:
    s = s.replace('          await storeInboundLineMessage(pool, event, profile);', '          await ensureSchemaOnce();\n          await storeInboundLineMessage(pool, event, profile);', 1)
if s != orig:
    p.write_text(s, encoding="utf-8")
    print("Patched lineWebhook.js: robust raw body fallback + auto schema ensure.")
else:
    print("lineWebhook.js already patched/no matching changes.")
PY_PATCH_LINE

node --check server/routes/adminAiOfficeReadOnly.js
node --check server/routes/lineWebhook.js

echo ""
echo "Done. Commit + deploy Render, then test:"
echo "1) /admin/ai-office/connectors/status"
echo "2) /admin/ai-office/line-inbox"
echo "3) Ask Admin AI: มีลูกค้า LINE ทักเข้ามาล่าสุดไหม ถ้ามีต่างชาติแปลไทยให้ด้วย"
