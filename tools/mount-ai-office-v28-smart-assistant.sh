#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

mkdir -p server/routes migrations
PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cp "$PACK_DIR/server/routes/adminAiOfficeSharedMemoryV27.js" server/routes/adminAiOfficeSharedMemoryV27.js
cp "$PACK_DIR/server/routes/adminAiOfficeLineDraftV27.js" server/routes/adminAiOfficeLineDraftV27.js
cp "$PACK_DIR/server/routes/adminAiOfficeSmartAssistantV28.js" server/routes/adminAiOfficeSmartAssistantV28.js
cp "$PACK_DIR/migrations/20260608_ai_shared_memory_v27.sql" migrations/20260608_ai_shared_memory_v27.sql
cp "$PACK_DIR/migrations/20260608_ai_line_chat_drafts_v26.sql" migrations/20260608_ai_line_chat_drafts_v26.sql

python3 - <<'PY'
from pathlib import Path

candidates = [Path("index.js"), Path("server.js"), Path("server/index.js"), Path("src/index.js"), Path("src/server.js"), Path("api/index.js")]
target = None
for p in candidates:
    if not p.exists() or p.stat().st_size <= 0:
        continue
    s = p.read_text(encoding="utf-8", errors="ignore")
    if "express" in s and "app.use" in s and ("requireAdminSession" in s or "createAdminAiOfficeReadOnlyRoutes" in s or "/admin/ai-office" in s):
        target = p
        break

if target is None:
    print("WARNING: Could not auto-find Express entry file.")
    print("Mount manually BEFORE the existing adminAiOfficeReadOnly route:")
    print('const createAdminAiOfficeSharedMemoryV27Routes = require("./server/routes/adminAiOfficeSharedMemoryV27");')
    print('const createAdminAiOfficeLineDraftV27Routes = require("./server/routes/adminAiOfficeLineDraftV27");')
    print('const createAdminAiOfficeSmartAssistantV28Routes = require("./server/routes/adminAiOfficeSmartAssistantV28");')
    print('app.use(createAdminAiOfficeSharedMemoryV27Routes({ pool, requireAdminSession }));')
    print('app.use(createAdminAiOfficeLineDraftV27Routes({ pool, requireAdminSession }));')
    print('app.use(createAdminAiOfficeSmartAssistantV28Routes({ pool, requireAdminSession }));')
    raise SystemExit(0)

s = target.read_text(encoding="utf-8", errors="ignore")
orig = s
depth = len(target.parent.parts)
prefix = "./" if depth == 0 else "../" * depth
requires = [
    f'const createAdminAiOfficeSharedMemoryV27Routes = require("{prefix}server/routes/adminAiOfficeSharedMemoryV27");',
    f'const createAdminAiOfficeLineDraftV27Routes = require("{prefix}server/routes/adminAiOfficeLineDraftV27");',
    f'const createAdminAiOfficeSmartAssistantV28Routes = require("{prefix}server/routes/adminAiOfficeSmartAssistantV28");',
]
for req in reversed(requires):
    name = req.split(" = ")[0].replace("const ", "")
    if name not in s:
        lines = s.splitlines()
        idx = 0
        for i, line in enumerate(lines[:120]):
            if "require(" in line:
                idx = i + 1
        lines.insert(idx, req)
        s = "\n".join(lines) + ("\n" if orig.endswith("\n") else "")

mount_lines = [
    "app.use(createAdminAiOfficeSharedMemoryV27Routes({ pool, requireAdminSession })); // CWF AI Office shared memory",
    "app.use(createAdminAiOfficeLineDraftV27Routes({ pool, requireAdminSession })); // CWF AI Office selected-question LINE draft override",
    "app.use(createAdminAiOfficeSmartAssistantV28Routes({ pool, requireAdminSession })); // CWF AI Office deterministic availability + auto learning"
]
for line in mount_lines:
    key = line.split("({")[0]
    if key not in s:
        markers = ["createAdminAiOfficeReadOnlyRoutes", '"/admin/ai-office"', "'/admin/ai-office'", "app.listen"]
        inserted = False
        for marker in markers:
            pos = s.find(marker)
            if pos != -1:
                line_start = s.rfind("\n", 0, pos) + 1
                s = s[:line_start] + line + "\n" + s[line_start:]
                inserted = True
                break
        if not inserted:
            s += "\n" + line + "\n"

if s != orig:
    backup = target.with_suffix(target.suffix + ".before-ai-office-v28.bak")
    if not backup.exists():
        backup.write_text(orig, encoding="utf-8")
    target.write_text(s, encoding="utf-8")
    print(f"Mounted v27 shared memory + v28 smart assistant in {target}")
else:
    print("v27/v28 routes already mounted")
PY

node --check server/routes/adminAiOfficeSharedMemoryV27.js
node --check server/routes/adminAiOfficeLineDraftV27.js
node --check server/routes/adminAiOfficeSmartAssistantV28.js
echo "Done. Run migrations, deploy, then test availability questions."
