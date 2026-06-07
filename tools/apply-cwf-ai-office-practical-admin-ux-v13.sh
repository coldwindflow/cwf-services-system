#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
python3 "$(dirname "$0")/apply-cwf-ai-office-practical-admin-ux-v13.py" "$ROOT"
