#!/usr/bin/env bash
set -euo pipefail
FILE="server/routes/adminAiOfficeReadOnly.js"
if [ ! -f "$FILE" ]; then
  echo "Missing $FILE" >&2
  exit 1
fi
cp "$FILE" "$FILE.bak-ai-office-pin"
python3 - <<'PY'
from pathlib import Path
p = Path('server/routes/adminAiOfficeReadOnly.js')
s = p.read_text(encoding='utf-8')
s = s.replace('pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim()),', 'pin_required: false,')
s = s.replace('      requireAiOfficePin(req);\n', '')
s = s.replace('    requireAiOfficePin(req);\n', '')
p.write_text(s, encoding='utf-8')
PY
echo "AI Office extra PIN requirement removed. Admin session still protects endpoints. Backup: $FILE.bak-ai-office-pin"
