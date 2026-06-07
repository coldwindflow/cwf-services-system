#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
STAMP="$(date +%Y%m%d%H%M%S)"
PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p server/routes migrations docs
cp "$PACK_DIR/server/aiOfficeIdentityResolver.js" server/aiOfficeIdentityResolver.js
cp "$PACK_DIR/server/aiOfficeConnectorContext.js" server/aiOfficeConnectorContext.js
cp "$PACK_DIR/server/routes/aiOfficeConnectorsProduction.js" server/routes/aiOfficeConnectorsProduction.js
cp "$PACK_DIR/migrations/20260607_ai_office_identity_and_connectors_v2.sql" migrations/20260607_ai_office_identity_and_connectors_v2.sql
cp "$PACK_DIR/docs/CWF_AI_OFFICE_CONNECTORS_IDENTITY_SETUP_TH.md" docs/CWF_AI_OFFICE_CONNECTORS_IDENTITY_SETUP_TH.md

# Patch AI Office read-only route: disable duplicate PIN and inject agent-specific connector context.
python3 - <<'PY'
from pathlib import Path
import re
p = Path('server/routes/adminAiOfficeReadOnly.js')
if not p.exists():
    raise SystemExit('server/routes/adminAiOfficeReadOnly.js not found')
s = p.read_text(encoding='utf-8')
orig = s
backup = p.with_suffix(p.suffix + '.bak')
if not backup.exists(): backup.write_text(s, encoding='utf-8')

# Import connector context.
if 'buildAiOfficeAgentContext' not in s.split('\n', 20)[0:]:
    require_line = 'const path = require("path");'
    insert = 'const { buildAiOfficeAgentContext } = require("../aiOfficeConnectorContext");'
    if insert not in s:
        s = s.replace(require_line, require_line + '\n' + insert, 1)

# Admin session is already required on every route; no duplicate PIN in admin flow.
s = re.sub(r'function requireAiOfficePin\(req\) \{[\s\S]*?\n\}', 'function requireAiOfficePin(_req) {\n  return;\n}', s, count=1)
s = s.replace('pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim())', 'pin_required: false')
s = s.replace('const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());', 'const pinRequired = false;')

# Safe conversation history helper.
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

# Upgrade prompt if still old signature.
if 'function buildGroundedPrompt(question, context, agent)' in s:
    new_prompt = '''function buildGroundedPrompt(question, context, agent, history = []) {
  const safeHistory = sanitizeConversationHistory(history);
  return [
    "คุณคือ CWF Operations Copilot / ผู้ช่วยผู้จัดการออฟฟิศ Coldwindflow สำหรับแอดมินเท่านั้น",
    `ตัวละครที่ถูกเลือก: ${agent.name}`,
    `บทบาทของตัวละครนี้: ${agent.role}`,
    "ตอบเป็นภาษาไทย สุภาพ มืออาชีพ ตรงประเด็น พร้อมใช้งานจริง",
    "ตัวละครแต่ละตัวต้องดูแลเฉพาะทางของตัวเอง และใช้ connector_context ตามบทบาทเป็นหลัก",
    "ข้อมูลจริงของ CWF/LINE/Google Ads/GitHub/Render ใน JSON คือแหล่งอ้างอิงหลัก ห้ามเดาเพิ่ม",
    "ถ้าข้อมูลจาก connector ยังไม่พร้อม ให้บอกชัดว่า connector ใดยังไม่พร้อม และบอกแอดมินว่าต้องตั้งค่าอะไรเพิ่ม",
    "ถ้าคำถามต่อเนื่อง ให้ใช้ประวัติแชทล่าสุดช่วยตีความ แต่ข้อเท็จจริงต้องยึดข้อมูลจริงใน JSON",
    "ห้ามสร้างงาน ห้ามแก้งาน ห้ามเปลี่ยนสถานะ ห้ามส่ง LINE ห้ามปรับแอด ห้าม deploy/merge เอง เพราะ Phase 1 เป็น read-only/draft-only",
    "ถ้าร่างข้อความ ให้เขียนเป็นข้อความพร้อมคัดลอก",
    "",
    "ประวัติแชทล่าสุด:",
    JSON.stringify(safeHistory, null, 2),
    "",
    `คำถามล่าสุด: ${cleanText(question, 1200)}`,
    "",
    "ข้อมูลจริงจากระบบและ connectors:",
    JSON.stringify(context, null, 2),
  ].join("\\n");
}'''
    s = re.sub(r'function buildGroundedPrompt\(question, context, agent\) \{[\s\S]*?\n\}', lambda _: new_prompt, s, count=1)

needle = '      const question = cleanText(req.body?.question, 1200);\n      const agent = getAgent(req.body?.agent);'
if needle in s and 'const history = sanitizeConversationHistory(req.body?.conversation_history);' not in s:
    s = s.replace(needle, '      const question = cleanText(req.body?.question, 1200);\n      const history = sanitizeConversationHistory(req.body?.conversation_history);\n      const agent = getAgent(req.body?.agent);', 1)

# Inject connector context after base context is built. This is deliberately additive and read-only.
if 'context.connector_context = await buildAiOfficeAgentContext' not in s:
    marker = '      if (onlyDigits(phone).length >= 6 || onlyDigits(question).length >= 6) {'
    insert = '''      context.connector_context = await buildAiOfficeAgentContext({ pool, agent: req.body?.agent, body: req.body || {} }).catch((err) => ({ error: err.message }));

'''
    if marker in s:
        s = s.replace(marker, insert + marker, 1)

s = s.replace('const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });', 'const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent, history) });')
s = s.replace('{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },', '{ role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF แบบคุยต่อเนื่อง ยึดข้อมูลจริงจาก CWF connectors เท่านั้น และห้ามทำ action แทนแอดมิน" },')

if s != orig:
    p.write_text(s, encoding='utf-8')
    print('Patched adminAiOfficeReadOnly.js: PIN off, history on, connector context injected')
else:
    print('adminAiOfficeReadOnly.js already patched or no matching markers')
PY

# Try to register production connector routes and LINE webhook in the main Express file.
python3 - <<'PY'
from pathlib import Path
candidates = [Path('index.js'), Path('server.js'), Path('app.js'), Path('src/index.js'), Path('server/index.js')]
files = [p for p in candidates if p.exists() and p.stat().st_size > 0]
if not files:
    print('WARNING: Could not find non-empty Express entry file. Register routes manually:')
    print('  const { createAiOfficeConnectorRoutes } = require("./server/routes/aiOfficeConnectorsProduction");')
    print('  const { createLineWebhookRoutes } = require("./server/routes/lineWebhook");')
    print('  app.use(createLineWebhookRoutes({ pool })); // before express.json if possible')
    print('  app.use(createAiOfficeConnectorRoutes({ pool, requireAdminSession }));')
    raise SystemExit(0)

# Choose file that looks like Express app.
target = None
for p in files:
    txt = p.read_text(encoding='utf-8', errors='ignore')
    if 'express' in txt and 'app.use' in txt:
        target = p; break
if target is None:
    print('WARNING: No Express app.use entry found. Manual route registration required.')
    raise SystemExit(0)

s = target.read_text(encoding='utf-8')
orig = s
if 'aiOfficeConnectorsProduction' not in s:
    # Insert requires after last require block near top.
    lines = s.splitlines()
    idx = 0
    for i, line in enumerate(lines[:80]):
        if line.strip().startswith('const ') and 'require(' in line:
            idx = i + 1
    lines.insert(idx, 'const { createAiOfficeConnectorRoutes } = require("./server/routes/aiOfficeConnectorsProduction");')
    lines.insert(idx + 1, 'const { createLineWebhookRoutes } = require("./server/routes/lineWebhook");')
    s = '\n'.join(lines) + ('\n' if orig.endswith('\n') else '')

# Register LINE webhook before express.json if marker exists; otherwise near first app.use.
if 'createLineWebhookRoutes({ pool })' not in s:
    json_marker = 'app.use(express.json'
    line_route = 'app.use(createLineWebhookRoutes({ pool })); // CWF AI Office LINE OA webhook must be before JSON body parser for signature verification\n'
    if json_marker in s:
        s = s.replace(json_marker, line_route + json_marker, 1)
    else:
        s = s.replace('app.use(', line_route + 'app.use(', 1)

if 'createAiOfficeConnectorRoutes({ pool, requireAdminSession })' not in s:
    route_line = 'app.use(createAiOfficeConnectorRoutes({ pool, requireAdminSession })); // CWF AI Office production connectors\n'
    # Put after admin AI office route if possible, otherwise before listen.
    if 'createAdminAiOfficeReadOnlyRoutes' in s:
        pos = s.find('createAdminAiOfficeReadOnlyRoutes')
        end = s.find('\n', pos)
        if end != -1:
            s = s[:end+1] + route_line + s[end+1:]
        else:
            s += '\n' + route_line
    elif 'app.listen' in s:
        s = s.replace('app.listen', route_line + 'app.listen', 1)
    else:
        s += '\n' + route_line

if s != orig:
    target.with_suffix(target.suffix + f'.bak').write_text(orig, encoding='utf-8')
    target.write_text(s, encoding='utf-8')
    print(f'Patched route registration in {target}')
else:
    print('Route registration already present')
PY

node --check server/aiOfficeIdentityResolver.js
node --check server/aiOfficeConnectorContext.js
node --check server/routes/aiOfficeConnectorsProduction.js
printf '\nDone. Next: run migration, set Render env, deploy, then open /admin/ai-office/connectors/status.\n'
