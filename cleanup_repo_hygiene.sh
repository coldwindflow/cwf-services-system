#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Files that must not be in repo
TARGETS=(
  "192.168.1.105+2-key.pem"
  "192.168.1.105+2.pem"
  "cwf_phase1_phase1_timezone_swfix.zip"
)

removed=0
for f in "${TARGETS[@]}"; do
  if [ -f "$f" ]; then
    echo "[REMOVE] $f"
    rm -f "$f"
    removed=$((removed+1))
  else
    echo "[OK] not found: $f"
  fi
done

echo
if [ "$removed" -gt 0 ]; then
  echo "Done. Removed $removed file(s)."
else
  echo "Done. Nothing to remove."
fi

echo "\nNext steps:" 
echo "- Commit the deletions (git rm / git commit)"
echo "- Verify .gitignore contains *.pem *.key and nested update zip patterns"
