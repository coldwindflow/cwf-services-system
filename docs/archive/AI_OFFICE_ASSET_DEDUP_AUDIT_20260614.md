# AI Office Asset Dedup Audit 2026-06-14

Issue: #31

Branch: `ai-office-asset-dedup-audit-20260614`

Mode: audit only. No assets were deleted, rewritten, compressed, or moved.

## Scope

Audited:

- `assets/ai-office-final/**`
- `assets/ai-office-final/manifest.json`
- `server/routes/adminAiOfficeReadOnly.js`
- AI Office frontend files:
  - `admin-ai-office.js`
  - `admin-ai-control-center.js`
  - `admin-ai-office.html`
  - `admin-ai-office-admin.html`
  - `admin-ai-office-sales.html`
  - `admin-ai-office-ops.html`
  - `admin-ai-office-content.html`
  - `admin-ai-office-dev.html`
  - `admin-ai-line-control.html`

No runtime code, migrations, auth, payment, accounting, tax, or payout files were edited.

## Total Size

`assets/ai-office-final` currently contains 135 files totaling 160,706,121 bytes, about 153.26 MiB.

Directory breakdown:

| Directory | Files | Size |
| --- | ---: | ---: |
| `characters` | 54 | 67.62 MiB |
| `characters-clean` | 54 | 43.43 MiB |
| `maps` | 6 | 13.53 MiB |
| `ui` | 10 | 10.68 MiB |
| `props` | 6 | 9.00 MiB |
| `maps-clean` | 2 | 7.09 MiB |
| `brand` | 2 | 1.92 MiB |

Manifest/reference count:

- PNG files under `assets/ai-office-final`: 134
- PNG paths referenced by `assets/ai-office-final/manifest.json`: 134
- Unreferenced PNG files: 0
- Missing manifest-referenced PNG files: 0

## Runtime Reference Findings

`assets/ai-office-final/manifest.json` references every PNG in the folder tree.

`server/routes/adminAiOfficeReadOnly.js` reads the manifest in diagnostics:

- `readAiOfficeFile("assets/ai-office-final/manifest.json")`
- `collectManifestAssetPaths(manifest)` recursively collects every `/assets/ai-office-final/...` string.
- Diagnostics fail if any collected manifest asset path is missing.

The same route also directly checks these required images:

- `assets/ai-office-final/maps/office-main-desktop.png`
- `assets/ai-office-final/maps/office-main-mobile.png`
- `assets/ai-office-final/brand/logo-main.png`
- `assets/ai-office-final/ui/selection-ring.png`
- `assets/ai-office-final/characters/{admin,sales,ops,ads,content,dev}/idle.png`

Frontend audit:

- `admin-ai-office.js` and `admin-ai-control-center.js` call `/admin/ai-office...` APIs.
- No direct `/assets/ai-office-final/...` image path loads were found in the audited frontend files.
- AI Office HTML files only reference the root app manifest with `<link rel="manifest" href="/manifest.json">`.

Service worker:

- `sw.js` does not cache individual AI Office image files.
- It bypasses same-origin AI Office URLs including paths that start with `/assets/ai-office-final/`.

## Duplicate Files By SHA

Only four duplicate SHA groups were found, all under `assets/ai-office-final/characters-clean`.

### `characters-clean/ads`

- SHA256: `5589CAD7D852B63CB49E62D5575E7605EF91AC56AF20852849AB1D0A888F55F2`
- Count: 9 files
- Size each: 948,968 bytes
- Duplicate bytes if one canonical file is kept: 7,591,744 bytes
- All files are referenced by `manifest.json` under `cleanCharacters.ads`.

Files:

- `assets/ai-office-final/characters-clean/ads/base.png`
- `assets/ai-office-final/characters-clean/ads/idle.png`
- `assets/ai-office-final/characters-clean/ads/talking.png`
- `assets/ai-office-final/characters-clean/ads/thinking.png`
- `assets/ai-office-final/characters-clean/ads/walk-1.png`
- `assets/ai-office-final/characters-clean/ads/walk-2.png`
- `assets/ai-office-final/characters-clean/ads/walk-3.png`
- `assets/ai-office-final/characters-clean/ads/walk-4.png`
- `assets/ai-office-final/characters-clean/ads/working.png`

### `characters-clean/content`

- SHA256: `B1C2D52D62C3BBCAE13E4895DBB5DF9D47BEB31E219E0209AE1AA65EA28D3DB3`
- Count: 9 files
- Size each: 844,119 bytes
- Duplicate bytes if one canonical file is kept: 6,752,952 bytes
- All files are referenced by `manifest.json` under `cleanCharacters.content`.

Files:

- `assets/ai-office-final/characters-clean/content/base.png`
- `assets/ai-office-final/characters-clean/content/idle.png`
- `assets/ai-office-final/characters-clean/content/talking.png`
- `assets/ai-office-final/characters-clean/content/thinking.png`
- `assets/ai-office-final/characters-clean/content/walk-1.png`
- `assets/ai-office-final/characters-clean/content/walk-2.png`
- `assets/ai-office-final/characters-clean/content/walk-3.png`
- `assets/ai-office-final/characters-clean/content/walk-4.png`
- `assets/ai-office-final/characters-clean/content/working.png`

### `characters-clean/dev`

- SHA256: `6BD5DED2D9E46DE39FF02B7B33BADE9691156387F0C421C9028682D12CDB6CED`
- Count: 9 files
- Size each: 762,599 bytes
- Duplicate bytes if one canonical file is kept: 6,100,792 bytes
- All files are referenced by `manifest.json` under `cleanCharacters.dev`.

Files:

- `assets/ai-office-final/characters-clean/dev/base.png`
- `assets/ai-office-final/characters-clean/dev/idle.png`
- `assets/ai-office-final/characters-clean/dev/talking.png`
- `assets/ai-office-final/characters-clean/dev/thinking.png`
- `assets/ai-office-final/characters-clean/dev/walk-1.png`
- `assets/ai-office-final/characters-clean/dev/walk-2.png`
- `assets/ai-office-final/characters-clean/dev/walk-3.png`
- `assets/ai-office-final/characters-clean/dev/walk-4.png`
- `assets/ai-office-final/characters-clean/dev/working.png`

### `characters-clean/ops`

- SHA256: `23E4A81A6FEF063AC513988EAD55BB519B6E7C9005F2479126D42F0C0D20CF9F`
- Count: 4 files
- Size each: 889,552 bytes
- Duplicate bytes if one canonical file is kept: 2,668,656 bytes
- All files are referenced by `manifest.json` under `cleanCharacters.ops`.

Files:

- `assets/ai-office-final/characters-clean/ops/idle.png`
- `assets/ai-office-final/characters-clean/ops/walk-2.png`
- `assets/ai-office-final/characters-clean/ops/walk-3.png`
- `assets/ai-office-final/characters-clean/ops/walk-4.png`

## Safe-To-Remove-Later Assessment

No AI Office asset is safe to delete in the current code state without a manifest/runtime-aware implementation, because all duplicate files are currently referenced by `assets/ai-office-final/manifest.json` and validated by `server/routes/adminAiOfficeReadOnly.js` diagnostics.

The duplicate files appear safe to remove in a later approved cleanup PR only if that PR also updates `assets/ai-office-final/manifest.json` so duplicate state keys point to the retained canonical file for each same-hash group, then verifies diagnostics and AI Office pages.

Recommended canonical files to keep for a future implementation:

- `assets/ai-office-final/characters-clean/ads/base.png`
- `assets/ai-office-final/characters-clean/content/base.png`
- `assets/ai-office-final/characters-clean/dev/base.png`
- `assets/ai-office-final/characters-clean/ops/idle.png`

## Files That Must Be Kept

For this audit-only task, every file under `assets/ai-office-final/**` must be kept.

For a future implementation PR, these must still be kept:

- `assets/ai-office-final/manifest.json`
- all non-duplicate PNG files
- the canonical duplicate representatives listed above
- all files directly checked by `server/routes/adminAiOfficeReadOnly.js` required image diagnostics
- all files referenced by the updated manifest after deduplication

## Estimated Size Reduction If Cleanup Is Approved

Potential reduction from same-hash duplicate cleanup:

- Files removable later with manifest update: 27
- Bytes removable later: 23,114,144 bytes
- Estimated reduction: about 22.04 MiB

This estimate does not require image recompression or Git history rewrite. Repository pack size will not fully shrink until old commits are no longer reachable or history is rewritten, which is explicitly out of scope.

## Exact Proposed Delete List For Next PR

This list is for the next implementation PR only. Do not apply it unless that PR also updates `assets/ai-office-final/manifest.json` and verifies diagnostics/runtime behavior.

```text
assets/ai-office-final/characters-clean/ads/idle.png
assets/ai-office-final/characters-clean/ads/talking.png
assets/ai-office-final/characters-clean/ads/thinking.png
assets/ai-office-final/characters-clean/ads/walk-1.png
assets/ai-office-final/characters-clean/ads/walk-2.png
assets/ai-office-final/characters-clean/ads/walk-3.png
assets/ai-office-final/characters-clean/ads/walk-4.png
assets/ai-office-final/characters-clean/ads/working.png
assets/ai-office-final/characters-clean/content/idle.png
assets/ai-office-final/characters-clean/content/talking.png
assets/ai-office-final/characters-clean/content/thinking.png
assets/ai-office-final/characters-clean/content/walk-1.png
assets/ai-office-final/characters-clean/content/walk-2.png
assets/ai-office-final/characters-clean/content/walk-3.png
assets/ai-office-final/characters-clean/content/walk-4.png
assets/ai-office-final/characters-clean/content/working.png
assets/ai-office-final/characters-clean/dev/idle.png
assets/ai-office-final/characters-clean/dev/talking.png
assets/ai-office-final/characters-clean/dev/thinking.png
assets/ai-office-final/characters-clean/dev/walk-1.png
assets/ai-office-final/characters-clean/dev/walk-2.png
assets/ai-office-final/characters-clean/dev/walk-3.png
assets/ai-office-final/characters-clean/dev/walk-4.png
assets/ai-office-final/characters-clean/dev/working.png
assets/ai-office-final/characters-clean/ops/walk-2.png
assets/ai-office-final/characters-clean/ops/walk-3.png
assets/ai-office-final/characters-clean/ops/walk-4.png
```

## Required Verification For Next PR

- Parse `assets/ai-office-final/manifest.json`.
- Confirm every manifest-referenced path exists.
- Confirm `/admin/ai-office` and `/admin/ai-office/control/health` diagnostics still pass.
- Confirm `sw.js` still bypasses `/assets/ai-office-final/`.
- Confirm no frontend file directly references a deleted path.
- Run `node --check server/routes/adminAiOfficeReadOnly.js` if runtime diagnostics code is touched.
