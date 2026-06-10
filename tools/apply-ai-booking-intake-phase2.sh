#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

inject_script() {
  local file="$1"
  local after="$2"
  local script="$3"
  if [ ! -f "$file" ]; then
    echo "SKIP: $file not found"
    return 0
  fi
  if grep -q "$script" "$file"; then
    echo "OK: $script already present in $file"
    return 0
  fi
  python3 - "$file" "$after" "$script" <<'PY'
from pathlib import Path
import sys
file, after, script = sys.argv[1:]
p = Path(file)
s = p.read_text(encoding='utf-8', errors='ignore')
line = f'  <script src="{script}"></script>'
if script in s:
    raise SystemExit(0)
pos = s.find(after)
if pos == -1:
    close = s.rfind('</body>')
    if close == -1:
        raise SystemExit(f'Cannot find injection point in {file}')
    s = s[:close] + line + '\n' + s[close:]
else:
    line_end = s.find('\n', pos)
    if line_end == -1:
        line_end = pos + len(after)
    s = s[:line_end+1] + line + '\n' + s[line_end+1:]
backup = p.with_suffix(p.suffix + '.before-ai-booking-intake-phase2.bak')
if not backup.exists():
    backup.write_text(p.read_text(encoding='utf-8', errors='ignore'), encoding='utf-8')
p.write_text(s, encoding='utf-8')
print(f'Injected {script} into {file}')
PY
}

inject_script "admin-add-v2.html" "admin-add-v2.js" "admin-add-ai-intake-prefill.js?v=ai-booking-intake-phase2"
inject_script "admin-review-v2.html" "admin-review-ai-intake.js" "admin-review-ai-notifications.js?v=ai-booking-intake-phase2"

node --check server/aiBookingIntake.js
node --check admin-add-ai-intake-prefill.js
node --check admin-review-ai-notifications.js

echo "Done. AI Booking Intake Phase 2 scripts injected."
