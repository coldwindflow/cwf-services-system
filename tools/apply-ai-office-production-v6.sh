#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
STAMP="$(date +%Y%m%d%H%M%S)"
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$BASE_DIR/admin-ai-office.html" ] || [ ! -f "$BASE_DIR/admin-ai-office.js" ]; then
  echo "Cannot find v6 source files. Run this script from the extracted zip folder or pass repo root." >&2
  exit 1
fi

cp admin-ai-office.html "admin-ai-office.html.bak.$STAMP" 2>/dev/null || true
cp admin-ai-office.js "admin-ai-office.js.bak.$STAMP" 2>/dev/null || true
cp "$BASE_DIR/admin-ai-office.html" admin-ai-office.html
cp "$BASE_DIR/admin-ai-office.js" admin-ai-office.js

python3 - <<'PY'
from pathlib import Path

p = Path('server/routes/adminAiOfficeReadOnly.js')
if not p.exists():
    raise SystemExit('server/routes/adminAiOfficeReadOnly.js not found. Frontend copied, backend PIN/history patch not applied.')

s = p.read_text(encoding='utf-8')
original = s


def replace_function(source, name, replacement):
    start = source.find(f'function {name}')
    if start == -1:
        return source, False
    brace = source.find('{', start)
    if brace == -1:
        return source, False
    depth = 0
    i = brace
    in_str = None
    esc = False
    while i < len(source):
        ch = source[i]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in ('"', "'", '`'):
                in_str = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return source[:start] + replacement + source[i+1:], True
        i += 1
    return source, False

# Admin session already protects these routes. Do not require a second PIN for AI Office.
new_pin = 'function requireAiOfficePin(_req) {\n  return;\n}'
s, ok_pin = replace_function(s, 'requireAiOfficePin', new_pin)
if not ok_pin:
    print('WARN: requireAiOfficePin function not found or not replaced')

s = s.replace(
    'pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim())',
    'pin_required: false'
)
s = s.replace(
    "pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || '').trim())",
    'pin_required: false'
)
s = s.replace(
    'const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());',
    'const pinRequired = false;'
)
s = s.replace(
    "const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || '').trim());",
    'const pinRequired = false;'
)

# Add safe conversation history support for full-screen chat continuity.
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
    else:
        print('WARN: getAgent marker not found; conversation history helper not inserted')

new_prompt_fn = '''function buildGroundedPrompt(question, context, agent, history = []) {
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
  ].join("\\n");
}'''
s, ok_prompt = replace_function(s, 'buildGroundedPrompt', new_prompt_fn)
if not ok_prompt:
    print('WARN: buildGroundedPrompt function not found or not replaced')

needle = '      const question = cleanText(req.body?.question, 1200);\n      const agent = getAgent(req.body?.agent);'
if needle in s and 'const history = sanitizeConversationHistory(req.body?.conversation_history);' not in s:
    s = s.replace(
        needle,
        '      const question = cleanText(req.body?.question, 1200);\n      const history = sanitizeConversationHistory(req.body?.conversation_history);\n      const agent = getAgent(req.body?.agent);',
        1,
    )

s = s.replace(
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });',
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });'
)
s = s.replace(
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });',
    'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });'
)

s = s.replace(
    '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },',
    '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF แบบคุยต่อเนื่อง ยึดข้อมูลจริงที่ให้มาเท่านั้น และห้ามทำ action แทนแอดมิน" },'
)

p.write_text(s, encoding='utf-8')
print('AI Office v6 backend patched: admin session only, no extra PIN, conversation history enabled.')
PY

# Optional cache bump for service worker if present.
python3 - <<'PY'
from pathlib import Path
p = Path('sw.js')
if p.exists():
    s = p.read_text(encoding='utf-8')
    old = s
    import re
    s = re.sub(r'CACHE_NAME\s*=\s*"[^"]+"', 'CACHE_NAME = "cwf-cache-ai-office-v6-20260607"', s, count=1)
    if '/admin-ai-office.js' in s and 'admin-ai-office-production-v6' not in s:
        pass
    if s != old:
        p.write_text(s, encoding='utf-8')
        print('Service worker cache name bumped.')
PY

node --check admin-ai-office.js
node --check server/routes/adminAiOfficeReadOnly.js

echo "Done. Commit, deploy, then hard refresh /admin/ai-office. This v6 polishes office UX, bubbles, agent positions, and live office movement."
