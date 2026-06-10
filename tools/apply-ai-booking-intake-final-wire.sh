#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

python3 - <<'PY'
from pathlib import Path

def read(p):
    return p.read_text(encoding="utf-8-sig", errors="ignore")

def write(p, s):
    p.write_text(s, encoding="utf-8")

review = Path("admin-review-v2.html")
if review.exists():
    s = read(review)
    orig = s
    # Ensure AI intake JS is loaded after the main review JS and force a cache bump.
    old1 = '<script src="admin-review-ai-intake.js?v=ai-booking-intake-v1"></script>'
    old2 = '<script src="admin-review-ai-intake.js?v=ai-booking-intake-v2"></script>'
    old3 = '<script src="admin-review-ai-intake.js?v=ai-booking-intake-v3"></script>'
    new = '<script src="admin-review-ai-intake.js?v=ai-booking-intake-v4-final-wire"></script>'
    if old1 in s or old2 in s or old3 in s:
        s = s.replace(old1, new).replace(old2, new).replace(old3, new)
    elif 'admin-review-ai-intake.js' not in s:
        marker = '</body>'
        s = s.replace(marker, f'  {new}\n{marker}')
    if s != orig:
        write(review, s)
        print("updated admin-review-v2.html")
    else:
        print("admin-review-v2.html already wired")

add = Path("admin-add-v2.html")
if add.exists():
    s = read(add)
    orig = s
    script = '<script src="admin-add-ai-intake-prefill.js?v=line-ai-prefill-v2-final-wire"></script>'
    if 'admin-add-ai-intake-prefill.js' not in s:
        marker = '</body>'
        s = s.replace(marker, f'  {script}\n{marker}')
    else:
        # bump version if already present
        import re
        s = re.sub(r'<script src="admin-add-ai-intake-prefill\.js[^"]*"></script>', script, s)
    if s != orig:
        write(add, s)
        print("updated admin-add-v2.html")
    else:
        print("admin-add-v2.html already wired")
PY

node --check admin-review-ai-intake.js
node --check admin-add-ai-intake-prefill.js
echo "Done. Deploy/restart Render, then hard refresh admin-review-v2.html and admin-add-v2.html."
