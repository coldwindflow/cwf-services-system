#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

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
    print("ERROR: Could not auto-find Express entry file.")
    print("Mount manually BEFORE createAdminAiOfficeReadOnlyRoutes:")
    print('const createAdminAiOfficeBrainV30Routes = require("./server/routes/adminAiOfficeBrainV30");')
    print('app.use(createAdminAiOfficeBrainV30Routes({ pool, requireAdminSession }));')
    raise SystemExit(1)

s = target.read_text(encoding="utf-8", errors="ignore")
orig = s
prefix = "./" if len(target.parent.parts) == 0 else "../" * len(target.parent.parts)
req = f'const createAdminAiOfficeBrainV30Routes = require("{prefix}server/routes/adminAiOfficeBrainV30");'
if "createAdminAiOfficeBrainV30Routes" not in s:
    lines = s.splitlines()
    idx = 0
    for i, line in enumerate(lines[:160]):
        if "require(" in line:
            idx = i + 1
    lines.insert(idx, req)
    s = "\n".join(lines) + ("\n" if orig.endswith("\n") else "")

mount = "app.use(createAdminAiOfficeBrainV30Routes({ pool, requireAdminSession })); // CWF AI Office Brain Manager v30"
if "createAdminAiOfficeBrainV30Routes({ pool" not in s:
    markers = [
        "createAdminAiOfficeReadOnlyRoutes",
        "createAdminAiOfficeSharedMemoryV27Routes",
        "createAdminAiOfficeLineDraftV27Routes",
        "createAdminAiOfficeSmartAssistantV28Routes",
        '"/admin/ai-office"',
        "'/admin/ai-office'",
        "app.listen",
    ]
    inserted = False
    # Prefer before read-only route, after v28 route if mounted.
    read_only_pos = s.find("createAdminAiOfficeReadOnlyRoutes")
    if read_only_pos != -1:
        line_start = s.rfind("\n", 0, read_only_pos) + 1
        s = s[:line_start] + mount + "\n" + s[line_start:]
        inserted = True
    else:
        v28_pos = s.find("createAdminAiOfficeSmartAssistantV28Routes")
        if v28_pos != -1:
            line_end = s.find("\n", v28_pos)
            if line_end != -1:
                s = s[:line_end + 1] + mount + "\n" + s[line_end + 1:]
                inserted = True
    if not inserted:
        for marker in markers:
            pos = s.find(marker)
            if pos != -1:
                line_start = s.rfind("\n", 0, pos) + 1
                s = s[:line_start] + mount + "\n" + s[line_start:]
                inserted = True
                break
    if not inserted:
        s += "\n" + mount + "\n"

if s != orig:
    backup = target.with_suffix(target.suffix + ".before-ai-brain-v30.bak")
    if not backup.exists():
        backup.write_text(orig, encoding="utf-8")
    target.write_text(s, encoding="utf-8")
    print(f"Mounted AI Brain v30 route in {target}")
else:
    print("AI Brain v30 route already mounted")
PY

node --check server/aiBrainImportV30.js
node --check server/routes/adminAiOfficeBrainV30.js
if [ -f index.js ]; then node --check index.js; fi

echo "Done. Deploy, then POST /admin/ai-office/brain/seed-cwf-v2 from an admin session."
