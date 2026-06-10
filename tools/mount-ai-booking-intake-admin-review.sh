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
    if "express" in s and "app.use" in s and ("requireAdminSession" in s or "/admin/ai-office" in s or "createAdminAiOfficeReadOnlyRoutes" in s):
        target = p
        break

if target is None:
    print("WARNING: Could not auto-find Express entry file.")
    print("Mount manually in the production Express app:")
    print('const createAdminAiBookingIntakeRoutes = require("./server/routes/adminAiBookingIntake");')
    print('app.use(createAdminAiBookingIntakeRoutes({ pool, requireAdminSession }));')
    raise SystemExit(0)

s = target.read_text(encoding="utf-8", errors="ignore")
orig = s
prefix = "./" if len(target.parent.parts) == 0 else "../" * len(target.parent.parts)
req = f'const createAdminAiBookingIntakeRoutes = require("{prefix}server/routes/adminAiBookingIntake");'
if "createAdminAiBookingIntakeRoutes" not in s:
    lines = s.splitlines()
    idx = 0
    for i, line in enumerate(lines[:140]):
        if "require(" in line:
            idx = i + 1
    lines.insert(idx, req)
    s = "\n".join(lines) + ("\n" if orig.endswith("\n") else "")

mount = "app.use(createAdminAiBookingIntakeRoutes({ pool, requireAdminSession })); // CWF AI booking intake for Admin Review Queue"
if "createAdminAiBookingIntakeRoutes({ pool" not in s:
    markers = ["createAdminAiOfficeReadOnlyRoutes", '"/admin/ai-office"', "'/admin/ai-office'", "createLineWebhookRoutes", "app.listen"]
    inserted = False
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
    backup = target.with_suffix(target.suffix + ".before-ai-booking-intake.bak")
    if not backup.exists():
        backup.write_text(orig, encoding="utf-8")
    target.write_text(s, encoding="utf-8")
    print(f"Mounted AI booking intake routes in {target}")
else:
    print("AI booking intake routes already mounted")
PY

node --check server/aiBookingIntake.js
node --check server/routes/adminAiBookingIntake.js
node --check server/routes/lineWebhook.js
node --check admin-review-ai-intake.js
