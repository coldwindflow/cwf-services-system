#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
STAMP="$(date +%Y%m%d%H%M%S)"
cp admin-ai-office.html "admin-ai-office.html.bak.$STAMP" 2>/dev/null || true
cp admin-ai-office.js "admin-ai-office.js.bak.$STAMP" 2>/dev/null || true
SRC_HTML="$(cd "$(dirname "$0")/.." && pwd)/admin-ai-office.html"
SRC_JS="$(cd "$(dirname "$0")/.." && pwd)/admin-ai-office.js"
DST_HTML="$(pwd)/admin-ai-office.html"
DST_JS="$(pwd)/admin-ai-office.js"
if ! cmp -s "$SRC_HTML" "$DST_HTML"; then cp "$SRC_HTML" "$DST_HTML"; fi
if ! cmp -s "$SRC_JS" "$DST_JS"; then cp "$SRC_JS" "$DST_JS"; fi
python3 - <<'PY'
from pathlib import Path
import re

p = Path('server/routes/adminAiOfficeReadOnly.js')
if not p.exists():
    raise SystemExit('server/routes/adminAiOfficeReadOnly.js not found; backend patch skipped')

s = p.read_text(encoding='utf-8')
original = s

# Admin already passes requireAdminSession on every AI Office route. Disable the extra PIN layer.
s = re.sub(
    r'function requireAiOfficePin\(req\) \{[\s\S]*?\n\}',
    'function requireAiOfficePin(_req) {\n  return;\n}',
    s,
    count=1,
)
s = s.replace(
    'pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim())',
    'pin_required: false'
)
s = s.replace(
    'const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());',
    'const pinRequired = false;'
)

# Add safe conversation history sanitizer for ChatGPT-like continuity.
if 'function sanitizeConversationHistory(' not in s:
    marker = 'function getAgent(agentKey) {'
    helper = r'''
function sanitizeConversationHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).map((item) => {
    const role = item && item.role === "user" ? "user" : "assistant";
    const content = cleanText(item && item.content, 1600);
    if (!content) return null;
    return { role, content };
  }).filter(Boolean);
}

'''
    if marker not in s:
        raise SystemExit('Cannot find getAgent marker for conversation history helper')
    s = s.replace(marker, helper + marker, 1)

# Replace grounded prompt so AI can use recent conversation context but stay grounded in real CWF data.
new_prompt_fn = r'''function buildGroundedPrompt(question, context, agent, history = []) {
  const safeHistory = sanitizeConversationHistory(history);
  return [
    "คุณคือ CWF Operations Copilot / ผู้ช่วยผู้จัดการออฟฟิศ Coldwindflow สำหรับแอดมินเท่านั้น",
    `ตัวละครที่ถูกเลือก: ${agent.name}`,
    `บทบาทของตัวละครนี้: ${agent.role}`,
    "บุคลิกการตอบ: ภาษาไทย สุภาพ มืออาชีพ ตรงประเด็น เหมือนหัวหน้าแอดมิน/ผู้ช่วยผู้จัดการที่ช่วยทำงานจริง",
    "ตอบให้เหมือนคุยกับผู้ใช้ต่อเนื่อง สามารถอ้างอิงบริบทจากประวัติแชทล่าสุดได้ แต่ข้อเท็จจริงเรื่องงานต้องยึด JSON ข้อมูลจริงเท่านั้น",
    "ใช้เฉพาะข้อมูลจริงใน JSON ด้านล่าง ห้ามแต่งข้อมูลงานเพิ่ม ห้ามอ้างว่ามีข้อมูลที่ไม่มีใน JSON",
    "ถ้าคำถามต่อเนื่อง เช่น 'งานไหนเสี่ยงสุด', 'ลูกค้าคนนั้น', 'ร่างให้หน่อย' ให้ใช้ประวัติแชทล่าสุดช่วยตีความ",
    "ถ้าข้อมูลไม่พอ ให้บอกชัดว่าข้อมูลไม่พอ และถามแอดมินกลับเป็นรายการสั้น ๆ ว่าต้องการข้อมูลอะไรเพิ่ม",
    "ถ้าร่างข้อความลูกค้าหรือช่าง ให้เขียนเป็นข้อความพร้อมคัดลอก ไม่ใส่คำอธิบายเชิงระบบยาวเกินจำเป็น",
    "รูปแบบตอบโดยทั่วไป: สรุปสั้น ๆ ก่อน แล้วตามด้วยรายละเอียด/ข้อความพร้อมใช้ ถ้ามีความเสี่ยงให้แยกเป็นหัวข้อ 'ต้องระวัง'",
    "ห้ามสั่งแก้สถานะ ห้ามบอกว่าระบบส่งข้อความแล้ว ห้ามสร้างงาน ห้ามแก้ใบงาน เพราะ Phase 1 เป็น read-only",
    "ห้ามแนะนำให้รัน SQL ห้ามเขียน SQL เพื่อให้แอดมินรันเอง",
    "",
    "ประวัติแชทล่าสุดในห้องนี้:",
    JSON.stringify(safeHistory, null, 2),
    "",
    `คำถามล่าสุดจากแอดมิน: ${cleanText(question, 1200)}`,
    "",
    "ข้อมูลจริงจากระบบ CWF:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}'''
s = re.sub(r'function buildGroundedPrompt\(question, context, agent\) \{[\s\S]*?\n\}', lambda _m: new_prompt_fn, s, count=1)

# Read history from frontend and pass it into grounded prompt.
needle = '      const question = cleanText(req.body?.question, 1200);\n      const agent = getAgent(req.body?.agent);'
if needle in s and 'const history = sanitizeConversationHistory(req.body?.conversation_history);' not in s:
    s = s.replace(needle, '      const question = cleanText(req.body?.question, 1200);\n      const history = sanitizeConversationHistory(req.body?.conversation_history);\n      const agent = getAgent(req.body?.agent);', 1)

s = s.replace(
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });',
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });'
)

# Slightly strengthen the system message without exposing secrets or adding actions.
s = s.replace(
    '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },',
    '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF แบบคุยต่อเนื่อง ยึดข้อมูลจริงที่ให้มาเท่านั้น และห้ามทำ action แทนแอดมิน" },'
)

if s == original:
    print('No backend changes were needed.')
else:
    p.write_text(s, encoding='utf-8')
    print('Patched AI Office backend: admin-session-only access + conversation history brain.')
PY
printf '\nDone. Deploy the repo and hard refresh /admin/ai-office.\n'
