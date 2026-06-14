# Repo Cleanup Safe Audit 2026-06-14

Branch: `repo-cleanup-safe-audit-20260614`

Base commit: `ef468993b317d223cfa24f7c8db085ff9da83fe2`

## Scope

This cleanup was limited to root documentation clutter, exact duplicate non-migration SQL, unreferenced docs snapshots, README modernization, and future ignore guardrails.

No production runtime logic was changed. No migration history was edited. No AI Office assets were removed.

## Inventory Findings

- Root historical README/PATCH/NOTES files found: 36.
- Large files over 500 KB are dominated by `assets/ai-office-final/**`, plus `index.js`, `app.js`, and old docs snapshots.
- Exact duplicate files found:
  - `partner_onboarding_phase1c.sql` equals `migrations/partner_onboarding_phase1c.sql`.
  - `manifest.json` equals `mainfest.json`.
  - root PWA icon duplicates exist across `icon-*` and `icon-cwf-v34-*`.
  - AI Office `characters-clean/**` contains same-hash role-state images.
- Docs snapshots found:
  - `docs/index.js`
  - `docs/app.js`
  - `docs/tech.html`
  - `docs/sw.js`

## Reference Decisions

- `mainfest.json` was retained because `sw.js` still caches it.
- Root PWA icons were retained because `manifest.json`, `mainfest.json`, `sw.js`, and accounting UI still reference them.
- `assets/ai-office-final/**` was retained because `assets/ai-office-final/manifest.json` and `server/routes/adminAiOfficeReadOnly.js` reference both normal and clean asset paths.
- Docs snapshots were removed because grep found no runtime references to those filenames.
- The root duplicate SQL was removed because the exact copy remains in `migrations/`.

## Cleanup Applied

- Moved root historical patch notes to `docs/archive/patch-notes-legacy/`.
- Removed exact duplicate root SQL: `partner_onboarding_phase1c.sql`.
- Removed unreferenced docs snapshots: `docs/index.js`, `docs/app.js`, `docs/tech.html`, `docs/sw.js`, and `docs/Readme.txt`.
- Replaced stale patch README with a current production overview.
- Added `.gitignore` guardrails for future zip, patch, deploy, and root patch-note artifacts.

## Size Notes

- Tracked file bytes on `origin/main`: 173,786,990 bytes.
- Tracked file bytes after cleanup: 171,813,063 bytes.
- Tracked file reduction: 1,973,927 bytes, about 1.88 MiB.
- Raw working tree file bytes before cleanup, including `.git`: 324,218,796 bytes.
- Raw working tree file bytes after primary cleanup, before local dependency install: 322,204,484 bytes.
- Git pack size before cleanup: 143.22 MiB.
- Git pack size after cleanup: unchanged until history is repacked or old commits are no longer reachable.

## Verification Targets

- `node --check index.js`
- `node --check sw.js`
- `npm start` smoke start
- grep checks for removed runtime filenames and duplicate SQL
