# AI Office Connectors Production Route Audit

Date: 2026-06-14  
Mode: investigation only  
Branch: `aioffice-connectors-production-route-audit-20260614`  
Target: `server/routes/aiOfficeConnectorsProduction.js`

## Guardrails

- No files deleted.
- No runtime code edited.
- No auth, payment, accounting, payout, or migration logic touched.
- No route mount or implementation change made.

## Summary

`server/routes/aiOfficeConnectorsProduction.js` appears to be a valid but currently unmounted route module. It is not imported by the active app entrypoint, and its exported `createAiOfficeConnectorRoutes` function is not mounted in `index.js`.

The file should not be deleted immediately because it contains documented Google Ads OAuth/sync endpoints and LINE customer-linking endpoints that may represent unfinished or manually expected production connector behavior. However, as of this audit, those endpoints are not reachable through the running Express app unless some external deployment step modifies `index.js`.

## 1. Is It Imported Anywhere?

Static search found no active runtime import of:

- `server/routes/aiOfficeConnectorsProduction.js`
- `createAiOfficeConnectorRoutes`
- `syncGoogleAdsSearchTerms`

References found:

| Reference | Type | Notes | Risk |
| --- | --- | --- | --- |
| `server/routes/aiOfficeConnectorsProduction.js` | Self | Defines and exports the route factory and sync helper | Medium |
| `tools/apply-ai-office-connectors-identity-v2.sh` | Tooling | Script copies/mounts this route and inserts the import/mount into `index.js` | Medium |
| `docs/CWF_AI_OFFICE_CONNECTORS_IDENTITY_SETUP_TH.md` | Documentation | Documents connector endpoints and manual setup | Medium |
| `docs/MANUAL_TEST_LINE_TRANSLATION_FIX.md` | Documentation | Mentions `/admin/ai-office/connectors/status` | Low |
| `docs/archive/patch-notes-legacy/README_CWF_AI_OFFICE_LINE_LIVE_FIX_V3.txt` | Legacy note | Mentions prior `Cannot GET` status issue | Low |

Conclusion: not imported by active runtime code.

## 2. Is It Mounted In `index.js`, `app.js`, Or Route Loader?

No active mount was found.

Expected mount if active:

```js
const { createAiOfficeConnectorRoutes } = require("./server/routes/aiOfficeConnectorsProduction");
app.use(createAiOfficeConnectorRoutes({ pool, requireAdminSession }));
```

Current active AI Office route mounts in `index.js` include:

| Active mount | Location | Notes |
| --- | --- | --- |
| `createAdminAiOfficeControlCenterRoutes` | `index.js` | Mounted |
| `createAdminAiOfficeSharedMemoryV27Routes` | `index.js` | Mounted |
| `createAdminAiOfficeLineDraftV27Routes` | `index.js` | Mounted |
| `createAdminAiOfficeTrainingCenterV35BRoutes` | `index.js` | Mounted |
| `createAdminAiOfficeSmartAssistantV28Routes` | `index.js` | Mounted |
| `createAdminAiOfficeBrainV30Routes` | `index.js` | Mounted |
| `createAdminAiOfficeAgentMemoryRoutes` | `index.js` | Mounted |
| `createAdminAiOfficeReadOnlyRoutes` | `index.js:54`, `index.js:4390` | Mounted |
| `createAdminAiBookingIntakeRoutes` | `index.js` | Mounted |

`createAiOfficeConnectorRoutes` is absent from the active mount list.

Conclusion: not mounted in the current app.

## 3. Does Any Frontend Call Its Endpoints?

Static frontend and runtime search found no active frontend calls to the route-only endpoints outside the route file itself.

Endpoint search results:

| Endpoint | Frontend caller found? | Other active runtime route? | Notes | Risk |
| --- | --- | --- | --- | --- |
| `GET /admin/ai-office/connectors/status` | No direct frontend caller found in this scan | Yes, `server/routes/adminAiOfficeReadOnly.js` | Superseded for read-only connector status | Low |
| `GET /admin/ai-office/line/conversations/:id/identity` | No | No | Documented only | Medium |
| `GET /admin/ai-office/line/conversations/:id/context` | No | No | Route exists only in unmounted file | Medium |
| `POST /admin/ai-office/line/conversations/:id/link-customer` | No | No | Documented only | Medium |
| `GET /admin/ai-office/google-ads/auth` | No | No | Documented OAuth entrypoint | Medium |
| `GET /admin/ai-office/google-ads/callback` | No | No | OAuth redirect target; may be manually opened | Medium |
| `POST /admin/ai-office/google-ads/sync` | No | No | Documented curl/manual endpoint | Medium |
| `GET /admin/ai-office/google-ads/report` | No | No | Google Ads report endpoint | Medium |
| `GET /admin/ai-office/dev/github/status` | No | No direct route | Similar helper used through agent context | Low to medium |
| `GET /admin/ai-office/dev/render/status` | No | No direct route | Similar helper used through agent context | Low to medium |

Conclusion: no active frontend dependency found. Manual/admin URL usage remains possible because docs describe some endpoints.

## 4. Is It Superseded By Another AI Office Connector Route?

Partially.

`server/routes/adminAiOfficeReadOnly.js` now provides:

```js
router.get("/admin/ai-office/connectors/status", requireAdminSession, async (req, res) => {
  try {
    return res.json(await buildConnectorStatus(pool));
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || "AI Office connector status failed" });
  }
});
```

This supersedes the status endpoint from `aiOfficeConnectorsProduction.js` for the mounted production app.

Related connector context also exists in `server/aiOfficeConnectorContext.js`:

- `loadGoogleAdsLatest`
- `loadGithubStatus`
- `loadRenderStatus`
- `buildAiOfficeAgentContext`

These helpers are active support code, but they do not mount the OAuth, sync, report, or LINE linking routes from `aiOfficeConnectorsProduction.js`.

Conclusion: connector status is superseded; Google Ads OAuth/sync/report and LINE identity-link routes are not fully superseded by another mounted route in this scan.

## 5. Would Deleting It Break Any Hidden Or Manual Route?

Deleting the file would not break currently mounted Express routes based on static import/mount analysis, because the app does not import or mount the route module.

Potential breakage areas:

| Area | Risk | Why |
| --- | --- | --- |
| Manual Google Ads setup docs | Medium | `docs/CWF_AI_OFFICE_CONNECTORS_IDENTITY_SETUP_TH.md` instructs admins to use `/admin/ai-office/google-ads/auth` and `/sync` |
| OAuth callback configuration | Medium | `GOOGLE_ADS_REDIRECT_URI` examples point to `/admin/ai-office/google-ads/callback` |
| LINE customer identity linking workflow | Medium | Docs describe identity/link-customer endpoints from this module |
| Tooling script | Medium | `tools/apply-ai-office-connectors-identity-v2.sh` expects this file and can mount it |
| Active connector status route | Low | Mounted replacement exists in `adminAiOfficeReadOnly.js` |
| Hidden dynamic require | Low | No dynamic import evidence found; deletion still needs production grep and deploy check |

Conclusion: direct runtime risk looks low, but product/process risk is medium because docs and tooling still describe the file as the production connector route.

## Syntax Check

`node --check server/routes/aiOfficeConnectorsProduction.js` passed.

## Recommendation

Do not delete this file yet.

Recommended next step is a product decision:

1. If Google Ads OAuth/sync and LINE identity linking are still planned, create an implementation PR to intentionally mount and test this route or move the needed endpoints into the current mounted AI Office route structure.
2. If the feature is obsolete, create a cleanup PR that:
   - updates or removes the stale connector setup docs,
   - updates/removes `tools/apply-ai-office-connectors-identity-v2.sh`,
   - deletes `server/routes/aiOfficeConnectorsProduction.js`,
   - confirms `/admin/ai-office/connectors/status` still works through `adminAiOfficeReadOnly.js`,
   - confirms no Google Ads or LINE linking manual workflow is expected in production.

## Deletion Risk Rating

Overall deletion risk: **Medium**.

Reason: currently unmounted and likely not serving live traffic, but still documented as production connector setup and contains endpoints that are not fully replaced elsewhere.
