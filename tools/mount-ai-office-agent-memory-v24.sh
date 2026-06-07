#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

mkdir -p server/routes migrations

# Copy files from this pack into repo root.
PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cp "$PACK_DIR/server/routes/adminAiOfficeAgentMemory.js" server/routes/adminAiOfficeAgentMemory.js
cp "$PACK_DIR/migrations/20260608_ai_agent_chat_memory.sql" migrations/20260608_ai_agent_chat_memory.sql

python3 - <<'PY'
from pathlib import Path
import re

candidates = [
    Path("index.js"),
    Path("server.js"),
    Path("server/index.js"),
    Path("src/index.js"),
    Path("src/server.js"),
    Path("api/index.js"),
]
files = [p for p in candidates if p.exists() and p.stat().st_size > 0]
target = None
for p in files:
    s = p.read_text(encoding="utf-8", errors="ignore")
    if "express" in s and "app.use" in s and ("requireAdminSession" in s or "createAdminAiOfficeReadOnlyRoutes" in s or "/admin/ai-office" in s):
        target = p
        break

if target is None:
    print("WARNING: Could not find the real Express entry file to auto-mount.")
    print("Mount manually in the file that creates Express app, after pool and requireAdminSession exist:")
    print('  const createAdminAiOfficeAgentMemoryRoutes = require("./server/routes/adminAiOfficeAgentMemory");')
    print('  app.use(createAdminAiOfficeAgentMemoryRoutes({ pool, requireAdminSession }));')
    raise SystemExit(0)

s = target.read_text(encoding="utf-8", errors="ignore")
orig = s

# Add require with correct relative path from target location.
depth = len(target.parent.parts)
prefix = "./" if depth == 0 else "../" * depth
require_line = f'const createAdminAiOfficeAgentMemoryRoutes = require("{prefix}server/routes/adminAiOfficeAgentMemory");'
if "adminAiOfficeAgentMemory" not in s:
    lines = s.splitlines()
    idx = 0
    for i, line in enumerate(lines[:120]):
        if "require(" in line:
            idx = i + 1
    lines.insert(idx, require_line)
    s = "\n".join(lines) + ("\n" if orig.endswith("\n") else "")

mount_line = "app.use(createAdminAiOfficeAgentMemoryRoutes({ pool, requireAdminSession })); // CWF AI Office agent memory"
if "createAdminAiOfficeAgentMemoryRoutes({ pool, requireAdminSession })" not in s:
    # Prefer after existing AI Office mount.
    markers = [
        "createAdminAiOfficeReadOnlyRoutes",
        "/admin/ai-office",
        "app.listen",
    ]
    inserted = False
    for marker in markers:
        pos = s.find(marker)
        if pos != -1:
            end = s.find("\n", pos)
            if end != -1:
                s = s[:end+1] + mount_line + "\n" + s[end+1:]
                inserted = True
                break
    if not inserted:
        s += "\n" + mount_line + "\n"

if s != orig:
    backup = target.with_suffix(target.suffix + ".before-ai-agent-memory.bak")
    if not backup.exists():
        backup.write_text(orig, encoding="utf-8")
    target.write_text(s, encoding="utf-8")
    print(f"Mounted AI Office agent memory route in {target}")
else:
    print("AI Office agent memory route already mounted")
PY

node --check server/routes/adminAiOfficeAgentMemory.js
echo "Done. Deploy to Render, then test: /admin/ai-office/agent-chat-history?agent_key=admin"
