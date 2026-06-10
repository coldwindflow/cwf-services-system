#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

python3 - <<'PY'
from pathlib import Path

def inject_script(path, script_line, before_script_contains=None):
    p = Path(path)
    if not p.exists():
        print(f"SKIP {path}: not found")
        return
    s = p.read_text(encoding="utf-8", errors="ignore")
    orig = s
    src = script_line.split('src="',1)[1].split('"',1)[0].split('?',1)[0]
    # Remove old duplicate of the same script if requested, then add the desired line once.
    lines = s.splitlines()
    new_lines = [ln for ln in lines if src not in ln]
    s = "\n".join(new_lines) + ("\n" if orig.endswith("\n") else "")
    if before_script_contains and before_script_contains in s:
        marker_pos = s.find(before_script_contains)
        line_start = s.rfind("\n", 0, marker_pos) + 1
        s = s[:line_start] + script_line + "\n" + s[line_start:]
    elif "</body>" in s:
        s = s.replace("</body>", script_line + "\n</body>", 1)
    else:
        s += "\n" + script_line + "\n"
    if s != orig:
        p.write_text(s, encoding="utf-8")
        print(f"UPDATED {path}: injected {src}")
    else:
        print(f"OK {path}: no change")

# Make the AI intake panel visibly load on Admin Review Queue.
inject_script(
    "admin-review-v2.html",
    '<script src="admin-review-ai-intake.js?v=ai-booking-intake-visible-v2"></script>',
)

# Make Add Job prefill work when opened from the AI intake card.
inject_script(
    "admin-add-v2.html",
    '<script src="admin-add-ai-intake-prefill.js?v=ai-intake-prefill-visible-v2"></script>',
)
PY

node --check admin-review-ai-intake.js
node --check admin-add-ai-intake-prefill.js

echo "Done. Deploy/restart Render after committing these changes."
