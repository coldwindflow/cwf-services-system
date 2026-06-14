# Repo Diet Phase 2 Audit

Date: 2026-06-14  
Mode: audit only  
Branch scanned: main  
Baseline: after AI Office asset dedup merge, commit `4f06666`  

## Scope And Guardrails

Scanned:

- `assets/**`
- `uploads/**`
- `docs/**`
- `admin-*.html`
- `admin-*.js`
- `routes/**`
- `server/routes/**`
- `public/**`
- old backup files
- zip/archive files
- duplicate images
- duplicate JavaScript/CSS
- orphan HTML pages

No files were deleted. No runtime code was changed. No auth, payment, accounting, payout, migration, or production data files were edited.

## Executive Summary

- `assets/ai-office-final/**` remains the dominant repository weight. The top 100 largest files are all AI Office image assets.
- No committed `uploads/**` payload files were found.
- No zip/archive artifacts were found in the scanned tree.
- No exact duplicate JavaScript or CSS files were found.
- One exact duplicate image pair was found in `assets/signatures/**`.
- No unlinked `admin-*.html` pages were found by static link/reference scan.
- One route module appears not to be mounted by `index.js`: `server/routes/aiOfficeConnectorsProduction.js`.
- Several rank icon assets and historical docs are not referenced by static grep. These require owner confirmation or runtime checks before deletion.

## Repo Size Signals

| Area | Finding | Risk |
| --- | ---: | --- |
| `assets/**` | Large; AI Office assets dominate the repo | High to delete, low to audit |
| `uploads/**` | No committed payload files found | Low |
| `docs/**` | Small; mostly audit/history documents | Low to medium |
| Exact duplicate images | 1 duplicate group, approx. 0.01 MiB reclaimable | Low |
| Exact duplicate JS/CSS | None found | Low |
| Zip/archive files | None found | Low |

Estimated immediate safe cleanup size, if separately approved: about `0.01 MiB` from the exact duplicate signature image only.

Estimated additional cleanup size requiring product/runtime confirmation: about `0.4 MiB` from rank icon candidates plus about `0.08 MiB` from old docs. Larger savings should come from image optimization or format conversion of AI Office assets, not deletion, because the AI Office manifest and runtime intentionally reference those assets.

## Top 100 Largest Files

All top 100 largest files are under `assets/ai-office-final/**`. These are production-facing AI Office visual assets unless a separate manifest/runtime check proves otherwise.

| # | Size MiB | Path | Risk |
| ---: | ---: | --- | --- |
| 1 | 3.54 | `assets/ai-office-final/maps-clean/office-main-desktop.png` | High |
| 2 | 3.54 | `assets/ai-office-final/maps-clean/office-main-mobile.png` | High |
| 3 | 2.49 | `assets/ai-office-final/maps/office-main-mobile.png` | High |
| 4 | 2.39 | `assets/ai-office-final/maps/office-main-desktop.png` | High |
| 5 | 2.37 | `assets/ai-office-final/maps/room-sales.png` | High |
| 6 | 2.19 | `assets/ai-office-final/maps/room-admin.png` | High |
| 7 | 2.15 | `assets/ai-office-final/maps/room-meeting.png` | High |
| 8 | 1.94 | `assets/ai-office-final/maps/room-ops.png` | High |
| 9 | 1.84 | `assets/ai-office-final/props/ops-board.png` | High |
| 10 | 1.79 | `assets/ai-office-final/props/desk-admin.png` | High |
| 11 | 1.64 | `assets/ai-office-final/props/desk-sales.png` | High |
| 12 | 1.59 | `assets/ai-office-final/props/decor-set.png` | High |
| 13 | 1.58 | `assets/ai-office-final/characters/ads/working.png` | High |
| 14 | 1.52 | `assets/ai-office-final/characters/content/working.png` | High |
| 15 | 1.51 | `assets/ai-office-final/characters/ops/working.png` | High |
| 16 | 1.48 | `assets/ai-office-final/characters/sales/working.png` | High |
| 17 | 1.43 | `assets/ai-office-final/props/meeting-table.png` | High |
| 18 | 1.41 | `assets/ai-office-final/characters/admin/working.png` | High |
| 19 | 1.39 | `assets/ai-office-final/characters/content/walk-2.png` | High |
| 20 | 1.35 | `assets/ai-office-final/characters/sales/walk-2.png` | High |
| 21 | 1.35 | `assets/ai-office-final/characters/ads/walk-3.png` | High |
| 22 | 1.34 | `assets/ai-office-final/characters/sales/walk-3.png` | High |
| 23 | 1.34 | `assets/ai-office-final/characters/sales/talking.png` | High |
| 24 | 1.33 | `assets/ai-office-final/characters/dev/walk-3.png` | High |
| 25 | 1.31 | `assets/ai-office-final/characters/admin/base.png` | High |
| 26 | 1.31 | `assets/ai-office-final/characters/sales/idle.png` | High |
| 27 | 1.31 | `assets/ai-office-final/characters/dev/working.png` | High |
| 28 | 1.31 | `assets/ai-office-final/characters/ads/idle.png` | High |
| 29 | 1.29 | `assets/ai-office-final/characters/admin/talking.png` | High |
| 30 | 1.29 | `assets/ai-office-final/characters/ops/base.png` | High |
| 31 | 1.28 | `assets/ai-office-final/characters/ops/talking.png` | High |
| 32 | 1.28 | `assets/ai-office-final/characters/ads/talking.png` | High |
| 33 | 1.27 | `assets/ai-office-final/characters/content/idle.png` | High |
| 34 | 1.27 | `assets/ai-office-final/characters/ops/walk-1.png` | High |
| 35 | 1.26 | `assets/ai-office-final/characters/dev/talking.png` | High |
| 36 | 1.26 | `assets/ai-office-final/characters/ads/walk-2.png` | High |
| 37 | 1.26 | `assets/ai-office-final/characters/ads/walk-1.png` | High |
| 38 | 1.25 | `assets/ai-office-final/characters/sales/walk-4.png` | High |
| 39 | 1.24 | `assets/ai-office-final/characters/sales/base.png` | High |
| 40 | 1.24 | `assets/ai-office-final/characters/dev/walk-2.png` | High |
| 41 | 1.24 | `assets/ai-office-final/characters/ops/walk-3.png` | High |
| 42 | 1.22 | `assets/ai-office-final/characters/ops/thinking.png` | High |
| 43 | 1.22 | `assets/ai-office-final/ui/quick-command-cards.png` | High |
| 44 | 1.22 | `assets/ai-office-final/ui/bottom-sheet-bg.png` | High |
| 45 | 1.21 | `assets/ai-office-final/characters/content/talking.png` | High |
| 46 | 1.21 | `assets/ai-office-final/characters/admin/walk-2.png` | High |
| 47 | 1.19 | `assets/ai-office-final/characters/ops/idle.png` | High |
| 48 | 1.19 | `assets/ai-office-final/characters/ads/base.png` | High |
| 49 | 1.19 | `assets/ai-office-final/characters/admin/walk-1.png` | High |
| 50 | 1.19 | `assets/ai-office-final/characters/ads/walk-4.png` | High |
| 51 | 1.19 | `assets/ai-office-final/characters/dev/idle.png` | High |
| 52 | 1.19 | `assets/ai-office-final/characters/ops/walk-2.png` | High |
| 53 | 1.18 | `assets/ai-office-final/characters/content/base.png` | High |
| 54 | 1.18 | `assets/ai-office-final/ui/status-badges.png` | High |
| 55 | 1.18 | `assets/ai-office-final/characters/ads/thinking.png` | High |
| 56 | 1.18 | `assets/ai-office-final/characters/sales/thinking.png` | High |
| 57 | 1.17 | `assets/ai-office-final/characters/sales/walk-1.png` | High |
| 58 | 1.17 | `assets/ai-office-final/characters/content/walk-1.png` | High |
| 59 | 1.17 | `assets/ai-office-final/characters/content/walk-3.png` | High |
| 60 | 1.17 | `assets/ai-office-final/ui/role-icons.png` | High |
| 61 | 1.16 | `assets/ai-office-final/characters/dev/base.png` | High |
| 62 | 1.15 | `assets/ai-office-final/ui/nameplate.png` | High |
| 63 | 1.15 | `assets/ai-office-final/characters/dev/thinking.png` | High |
| 64 | 1.15 | `assets/ai-office-final/characters/admin/idle.png` | High |
| 65 | 1.15 | `assets/ai-office-final/characters/admin/walk-3.png` | High |
| 66 | 1.15 | `assets/ai-office-final/characters/content/thinking.png` | High |
| 67 | 1.14 | `assets/ai-office-final/characters/admin/thinking.png` | High |
| 68 | 1.14 | `assets/ai-office-final/characters/dev/walk-4.png` | High |
| 69 | 1.13 | `assets/ai-office-final/characters/ops/walk-4.png` | High |
| 70 | 1.13 | `assets/ai-office-final/characters/content/walk-4.png` | High |
| 71 | 1.12 | `assets/ai-office-final/characters/admin/walk-4.png` | High |
| 72 | 1.10 | `assets/ai-office-final/characters/dev/walk-1.png` | High |
| 73 | 1.04 | `assets/ai-office-final/ui/loading-thinking.png` | High |
| 74 | 1.01 | `assets/ai-office-final/ui/empty-state.png` | High |
| 75 | 1.00 | `assets/ai-office-final/characters-clean/ops/working.png` | High |
| 76 | 0.98 | `assets/ai-office-final/brand/logo-main.png` | High |
| 77 | 0.97 | `assets/ai-office-final/ui/selection-ring.png` | High |
| 78 | 0.96 | `assets/ai-office-final/ui/speech-bubble.png` | High |
| 79 | 0.94 | `assets/ai-office-final/characters-clean/sales/talking.png` | High |
| 80 | 0.94 | `assets/ai-office-final/brand/logo-mark.png` | High |
| 81 | 0.91 | `assets/ai-office-final/characters-clean/ops/talking.png` | High |
| 82 | 0.91 | `assets/ai-office-final/characters-clean/admin/base.png` | High |
| 83 | 0.91 | `assets/ai-office-final/characters-clean/sales/idle.png` | High |
| 84 | 0.91 | `assets/ai-office-final/characters-clean/ads/base.png` | High |
| 85 | 0.89 | `assets/ai-office-final/characters-clean/ops/base.png` | High |
| 86 | 0.88 | `assets/ai-office-final/characters-clean/sales/base.png` | High |
| 87 | 0.85 | `assets/ai-office-final/characters-clean/ops/idle.png` | High |
| 88 | 0.84 | `assets/ai-office-final/characters-clean/ops/thinking.png` | High |
| 89 | 0.83 | `assets/ai-office-final/characters-clean/sales/thinking.png` | High |
| 90 | 0.81 | `assets/ai-office-final/characters-clean/admin/talking.png` | High |
| 91 | 0.81 | `assets/ai-office-final/characters-clean/sales/working.png` | High |
| 92 | 0.81 | `assets/ai-office-final/characters-clean/content/base.png` | High |
| 93 | 0.78 | `assets/ai-office-final/characters-clean/sales/walk-2.png` | High |
| 94 | 0.77 | `assets/ai-office-final/ui/chat-panel-bg.png` | High |
| 95 | 0.74 | `assets/ai-office-final/characters-clean/sales/walk-3.png` | High |
| 96 | 0.74 | `assets/ai-office-final/characters-clean/sales/walk-1.png` | High |
| 97 | 0.73 | `assets/ai-office-final/characters-clean/admin/walk-3.png` | High |
| 98 | 0.73 | `assets/ai-office-final/characters-clean/dev/base.png` | High |
| 99 | 0.72 | `assets/ai-office-final/props/floor-shadow.png` | High |
| 100 | 0.72 | `assets/ai-office-final/characters-clean/ops/walk-1.png` | High |

## Files Not Referenced Anywhere

This section is based on static grep/import/reference scans. Treat results as candidates, not delete approval, because this app uses static serving and may construct some URLs dynamically.

| Path | Size | Static finding | Risk | Recommendation |
| --- | ---: | --- | --- | --- |
| `assets/ranks/rank_lv5_256.png` | ~0.08 MiB | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/rank_lv4_256.png` | ~0.08 MiB | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/rank_lv3_256.png` | ~0.07 MiB | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/rank_lv2_256.png` | ~0.07 MiB | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/rank_lv1_256.png` | ~0.07 MiB | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/rank_lv1_64.png` through `rank_lv5_64.png` | small | No static reference found | Medium | Verify badge/rank UI before deleting |
| `assets/ranks/.gitkeep` | 0 | Directory placeholder only | Low | Can remove only if directory stays populated or policy allows |
| `docs/PHASE2F_CATALOG_PROMOTION_ZONE_ROUTE_AUDIT.md` | small | No runtime reference found | Low | Keep as history or archive deeper |
| `docs/PHASE2H_ORDER_WORKFLOW_ROUTE_AUDIT.md` | small | No runtime reference found | Low | Keep as history or archive deeper |
| `docs/PHASE2L_CATALOG_PROMOTION_CLAIM_FLOW_AUDIT.md` | small | No runtime reference found | Low | Keep as history or archive deeper |
| `docs/PHASE1_LOW_RISK_ROUTE_MAP.md` | small | No runtime reference found | Low | Keep as history or archive deeper |
| `docs/PHASE2J_STATIC_PAGE_ROUTE_AUDIT.md` | small | No runtime reference found | Low | Keep as history or archive deeper |
| `docs/PHASE2B_READONLY_DB_ROUTE_CANDIDATES.md` | small | No runtime reference found | Low | Keep as history or archive deeper |

## Routes Not Reachable

| Route module | Finding | Risk | Recommendation |
| --- | --- | --- | --- |
| `server/routes/aiOfficeConnectorsProduction.js` | Exports an Express router with AI Office connector endpoints, but no current `index.js` mount was found. Static references appear in tooling/docs and the file itself. | Medium | Confirm whether connector endpoints are planned, deprecated, or intentionally disabled. Do not delete without product approval. |

Not flagged:

- `server/routes/pages/index.js`
- `server/routes/system/index.js`
- `server/routes/serviceZones/index.js`

These folder route modules are mounted from `index.js` through their directory imports and should not be treated as unreachable.

## Admin Pages Not Linked

No orphan `admin-*.html` pages were found by static link/reference scan. Existing admin pages have direct references from navigation, route/page handling, service worker/cache lists, scripts, or other admin pages.

Risk: low for the scan result, but any future delete still needs browser verification for `/admin` navigation and direct URL access.

## Duplicate Code Candidates

| Candidate | Finding | Risk | Recommendation |
| --- | --- | --- | --- |
| JavaScript files | No exact duplicate JS file hashes found | Low | No action |
| CSS files | No exact duplicate CSS file hashes found | Low | No action |
| `server/routes/aiOfficeConnectorsProduction.js` | Potential obsolete/dead route module rather than duplicate code | Medium | Product decision needed before any removal |

## Duplicate Image Candidates

| Duplicate group | Duplicate bytes | Risk | Recommendation |
| --- | ---: | --- | --- |
| `assets/signatures/owner-signature-transparent.png` and `assets/signatures/owner-signature.png` | 15,525 bytes | Low | Keep one canonical file only after checking all signature/image references |

No additional exact duplicate image groups were found in the scanned scope after the prior AI Office dedup cleanup.

## Old Backups And Archives

No committed zip/archive files were found in the scanned tree.

No obvious backup files matching common backup naming patterns were found in the scanned tree.

## Obsolete AI Office Resources

No AI Office asset is recommended for deletion in this audit. The largest files are AI Office assets, but they are production-facing and should be treated as high-risk unless the manifest/runtime path audit proves otherwise.

Recommended next step for AI Office size reduction:

- Optimize or convert large PNGs with visual QA.
- Keep the manifest paths stable unless a dedicated PR updates manifest references and verifies diagnostics.
- Do not delete `assets/ai-office-final/**` assets based only on size.

## Estimated Cleanup Size

| Cleanup category | Estimated reduction | Risk | Notes |
| --- | ---: | --- | --- |
| Exact duplicate signature image | ~0.01 MiB | Low | Needs reference check before delete |
| Old docs candidates | ~0.08 MiB | Low | Mostly organization benefit, not repo-size impact |
| Unreferenced rank image candidates | ~0.4 MiB | Medium | Needs UI/runtime verification |
| AI Office image optimization | TBD, potentially meaningful | Medium | Prefer optimize/convert over delete |
| AI Office deletion | Not recommended | High | Runtime/manifest assets |

## Proposed Future Cleanup Tasks

1. Low-risk signature duplicate cleanup PR:
   - Choose canonical signature path.
   - Update references if needed.
   - Delete only the duplicate signature file.

2. Rank icon usage audit:
   - Search UI flows that display technician/customer ranks.
   - Verify direct image requests in browser or route tests.
   - Delete only if rank assets are confirmed unused.

3. AI Office image optimization PR:
   - Do not delete assets.
   - Measure PNG optimization or WebP conversion savings.
   - Verify `assets/ai-office-final/manifest.json`, `/admin/ai-office`, and `/admin/ai-office/diagnostics`.

4. Route decision for `server/routes/aiOfficeConnectorsProduction.js`:
   - Confirm whether production connector endpoints are intentionally disabled.
   - If obsolete, remove in a small route-only PR with grep proof and route tests.
   - If planned, mount intentionally in a separate feature PR, not a cleanup PR.

## Audit Conclusion

The repo is much cleaner after the earlier safe cleanup and AI Office duplicate deletion. The remaining large size is not from obvious trash files; it is mainly production AI Office image weight. The only clearly low-risk delete candidate found in this phase is the exact duplicate signature image, and even that should wait for a small reference-checked implementation PR.
