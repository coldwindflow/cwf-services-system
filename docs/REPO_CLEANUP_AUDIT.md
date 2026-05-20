# Repo Cleanup Audit

## Cleanup Summary

This cleanup pass audited tracked repository files before deleting anything. The goal was to remove only artifacts that are provably unused and low risk while preserving production behavior.

Runtime code, route modules, frontend files, migrations, deployment files, and recently extracted Phase 3 modules were not modified.

## Inventory Summary

### Runtime Core

- `index.js`
- `db.js`
- `package.json`
- `package-lock.json`
- `.npmrc`
- `.gitignore`

Action: keep.

### Backend Route Modules

- `server/routes/system/index.js`
- `server/routes/users/technicians.js`
- `server/routes/catalog/items.js`
- `server/routes/serviceZones/index.js`
- `server/routes/pages/index.js`
- `server/routes/docs.js`
- `server/routes/accountingReadOnly.js`
- `server/routes/adminDeductionsReadOnly.js`
- `server/routes/adminReworkReadOnly.js`
- `server/routes/technicianBaseStatusReadOnly.js`
- `server/routes/technicianCalendarReadOnly.js`
- `server/routes/technicianCountSummaryReadOnly.js`

Action: keep. These are required by `index.js`.

### Backend Helpers

- `server/normalizers.js`
- `server/pricing.js`
- `server/customerPricing.js`
- `server/customerLookup.js`
- `server/technicianIncome.js`
- `server/technicianJobIncomeDisplay.js`
- `server/technicianJobMoneySummary.js`
- `server/technicianRework.js`
- `server/adminJobItems.js`
- `server/helpers/adminReworkDeductionsHelpers.js`
- `server/helpers/technicianBaseStatusDataHelpers.js`
- `server/helpers/technicianBaseStatusScoring.js`
- `server/db/pool.js`

Action: keep. These are required directly or used by extracted routes.

### Frontend Pages

Root HTML pages such as `login.html`, `tech.html`, `customer.html`, admin pages, partner pages, `index.html`, `track.html`, and `register.html`.

Action: keep. These may be served through `sendHtml(...)`, static aliases, or `express.static(ROOT_DIR)`.

### Frontend JS/CSS/Assets

Root JS/CSS files, icons, images, fonts, PDF templates, and `findfix/` assets.

Action: keep unless separately reviewed. Root static files can be directly URL-addressable through `express.static(ROOT_DIR)`.

### Service Worker/PWA

- `sw.js`
- `manifest.json`
- `mainfest.json`
- PWA icons
- `cwf-pwa.js`

Action: keep. PWA/static behavior is production sensitive.

### Migrations

All files under `migrations/`.

Action: keep. The duplicate root-level `partner_onboarding_phase1c.sql` was removed because the canonical identical copy remains under `migrations/partner_onboarding_phase1c.sql`.

### Current Docs

Core docs and recent Phase 3 docs are kept, including:

- `CWF_Technician_App_Master_Spec.md`
- `docs/AI_EDITING_GUIDE.md`
- `docs/INDEX_JS_SPLIT_PLAN.md`
- `docs/REPO_ARCHITECTURE_AUDIT.md`
- `docs/REFACTOR_ROADMAP.md`
- Phase route audit/extraction docs.

Action: keep.

### Docs Old / Superseded

Several README and patch-note files appear historical, but they were not removed in this pass because they may still be useful provenance:

- `README_ACCEPT_READINESS_FIX_20260508.txt`
- `README_ADMIN_WORK_READINESS_PHASE1.txt`
- `README_ADVANCE_CALENDAR_REAL_UI_REPLACE.txt`
- `README_ADVANCE_CALENDAR_TOGGLE_LOCK_FIX.txt`
- `README_CALENDAR_BUTTON_SAFE_OPENER_FIX.txt`
- `README_WORK_CALENDAR_MULTI_SELECT_FIX.txt`
- `TECHNICIAN_BASE_STATUS_PATCH_NOTES.md`
- `TECHNICIAN_SELF_BASE_STATUS_PATCH_NOTES.md`
- `CWF_TECH_WORK_CALENDAR_V2_PATCH_NOTES.md`

Action: needs confirmation before deletion.

### Temp / Backup / Generated Files

Tracked:

- no tracked `.zip`, `.bak`, `.old`, `.tmp`, or `.backup` files were found.

Untracked local artifacts:

- `cwf-admin-assignment-service-fix-8a2c883.zip`
- `cwf-admin-job-edit-price-fix-a98a364.zip`
- `cwf-admin-rework-ui-cache-bust-20260508.zip`
- `cwf-admin-rework-ui-changed-files-20260508.zip`
- `cwf-repo-architecture-audit-changed-files-20260510.zip`
- `cwf-revisit-upload-changed-files-20260508.zip`

Action: not committed and not deleted by this patch. `.gitignore` now ignores `*.zip` so generated ZIP artifacts do not accidentally enter future commits.

### Test / Debug Scripts

- `cleanup_repo_hygiene.sh`

Action: needs confirmation. It is not referenced by package scripts, but it documents and automates removal of sensitive local artifacts, so this pass kept it.

### Unknown / Needs Confirmation

- `docs/index.js`
- `docs/app.js`
- `docs/tech.html`
- `docs/sw.js`
- `findfix/`
- old README/patch-note files listed above

Action: keep for now.

## Files Deleted

| Path | Type | Why It Looks Unused | References Found | Checks | Risk | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/Readme.txt` | empty doc artifact | File contains only CRLF and no content | none | exact filename search, git tracked file search | Low | delete now |
| `partner_onboarding_phase1c.sql` | duplicate migration copy at repo root | Byte-for-byte identical to `migrations/partner_onboarding_phase1c.sql` | none outside file list | exact filename search, SHA-256 compare, content compare | Low | delete now |

## Files Kept

| Path / Group | Reason |
| --- | --- |
| `index.js`, `app.js`, `tech.html`, `sw.js` | production runtime/frontend critical |
| `package.json`, `package-lock.json`, `db.js`, `migrations/` | runtime/deploy/database critical |
| `server/routes/*`, `server/helpers/*`, `server/*.js` | required or potentially required by production modules |
| root HTML/JS/CSS/assets | served through `sendHtml(...)` and/or `express.static(ROOT_DIR)` |
| `docs/CWF_partner_contract_single_rate_2026.pdf` | referenced by `/docs/...` URL in runtime and `partner-apply.html` |
| `findfix/` | root static access possible through `express.static(ROOT_DIR)` |

## Files Needing Confirmation

| Path | Why It Needs Confirmation |
| --- | --- |
| `docs/index.js` | Large historical snapshot; referenced in docs as historical only, but deletion should be explicitly approved because it is a major audit artifact. |
| `docs/app.js` | Historical snapshot; no runtime reference found, but paired with other snapshots. |
| `docs/tech.html` | Historical snapshot; no runtime reference found, but related to technician app provenance. |
| `docs/sw.js` | Historical snapshot; no runtime reference found, but PWA provenance is sensitive. |
| old README/patch-note files | Likely historical docs, but may contain operational context. |
| `cleanup_repo_hygiene.sh` | Unreferenced script, but intentionally removes sensitive local artifacts. |
| `findfix/` | Not CWF core, but statically accessible at `/findfix/`; needs product decision before deletion. |

## Dead Code Candidates

No runtime dead code was deleted. Potential future audits:

- historical snapshot files in `docs/`
- old README/patch notes
- `findfix/` if confirmed out of scope
- static page aliases after a dedicated route/static access review

No function was removed from `index.js` or server modules in this pass.

## Reference Search Notes

Checks used:

- exact filename search with `rg`
- tracked file scan with `git ls-files`
- duplicate content comparison with SHA-256 and `Compare-Object`
- runtime serving risk check through `sendHtml(...)`, `res.sendFile(...)`, and `express.static(ROOT_DIR)`
- package/deploy-sensitive file review

Important findings:

- `docs/index.js`, `docs/app.js`, `docs/tech.html`, and `docs/sw.js` are documented as historical snapshots in `docs/REPO_ARCHITECTURE_AUDIT.md`.
- `docs/CWF_partner_contract_single_rate_2026.pdf` is referenced from `index.js` and `partner-apply.html`, so it must stay.
- root `partner_onboarding_phase1c.sql` had the same SHA-256 as `migrations/partner_onboarding_phase1c.sql`.

## Tests Run

Required after deletion:

- `node --check index.js`
- `node --check` on extracted route/helper modules
- `git diff --check`
- startup smoke with `node index.js` for 5 seconds

## Manual Smoke Checklist

- App starts.
- `/login` and `POST /login` still work.
- `/tech` and `/tech.html` still work.
- technician job page still loads.
- technician income page still loads.
- admin pages load.
- docs routes still work.
- accounting read-only routes still work.
- admin deductions/rework routes still work.
- base-status routes still work.
- calendar/readiness routes still work.
- `/service_zones` and `POST /service_zones/detect` still work.
- static assets load: JS/CSS/logo/images.
- service worker does not error.

## Rollback Plan

If any issue appears:

```bash
git switch main
git pull origin main
git revert -m 1 <cleanup_merge_commit_hash>
git push origin main
```

For local-only ZIP artifacts, no rollback is needed because this patch only adds an ignore rule and does not delete those local files.
