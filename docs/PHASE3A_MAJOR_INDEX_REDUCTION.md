# Phase 3A Major Index Reduction

Date: 2026-05-16

## Before / After

- `index.js` before: 24,959 lines
- `index.js` after: 24,943 lines
- Reduction: 16 route lines
- Route count moved in this batch: 16

## Current Repo / PR Status

- `main` was inspected at commit `dcabd7c8e704faf315e4958542d84323695a64be`.
- PR #16 was open during planning and contained only the smaller 8-route admin page subset.
- Decision: supersede PR #16 with this larger current-main batch instead of merging another small PR first.

## Route Inventory Summary

| Group | Current state | Decision |
| --- | --- | --- |
| Static/sendHtml page routes | Bottom page area plus a few protected static routes | Move safe unprotected subset |
| Redirect-only routes | Existing page aliases and a few guarded aliases | Keep prior extracted routes; do not move guarded aliases |
| Public/customer routes | `/public/*`, `/customer`, `/track`, install quote pages | Keep in place |
| Admin routes | Large protected CRUD/business surface | Keep in place |
| Technician routes | Jobs, income, readiness, profile, base status | Keep in place except static page aliases |
| Income/payout routes | Many DB-backed routes | Keep in place |
| Rework routes | Admin DB-backed routes | Keep in place |
| Service zone routes | `GET /service_zones` extracted; detect remains inline | Keep detect inline |
| Auth/session routes | LINE, login, logout, password/session | Keep in place |
| Booking/availability routes | Public/admin DB-backed routes | Keep in place |
| Accounting/tax routes | Protected accounting routes | Keep in place |
| Utility/API routes | maps/docs/debug/etc. | Keep in place |

## Routes Moved

### Admin page aliases

| Route | Old location | Behavior |
| --- | --- | --- |
| `GET /admin-add` | `index.js:26822` | `sendHtml("admin-add-v2.html")` |
| `GET /admin-review` | `index.js:26823` | `sendHtml("admin-review-v2.html")` |
| `GET /admin-queue` | `index.js:26824` | `sendHtml("admin-queue-v2.html")` |
| `GET /admin-history` | `index.js:26825` | `sendHtml("admin-history-v2.html")` |
| `GET /admin-add-v2.html` | `index.js:26842` | `sendHtml("admin-add-v2.html")` |
| `GET /admin-review-v2.html` | `index.js:26843` | `sendHtml("admin-review-v2.html")` |
| `GET /admin-queue-v2.html` | `index.js:26844` | `sendHtml("admin-queue-v2.html")` |
| `GET /admin-history-v2.html` | `index.js:26845` | `sendHtml("admin-history-v2.html")` |

### Technician page aliases

| Route | Old location | Behavior |
| --- | --- | --- |
| `GET /edit-profile` | `index.js:26827` | `sendHtml("edit-profile.html")` |
| `GET /tech` | `index.js:26828` | `sendHtml("tech.html")` |
| `GET /edit-profile.html` | `index.js:26846` | `sendHtml("edit-profile.html")` |
| `GET /tech.html` | `index.js:26847` | `sendHtml("tech.html")` |

### Public neutral page aliases

| Route | Old location | Behavior |
| --- | --- | --- |
| `GET /register` | `index.js:26838` | `sendHtml("register.html")` |
| `GET /home` | `index.js:26840` | `sendHtml("index.html")` |
| `GET /register.html` | `index.js:26848` | `sendHtml("register.html")` |
| `GET /index.html` | `index.js:26853` | `sendHtml("index.html")` |

## Modules Created / Updated

- Updated `server/routes/pages/index.js`
- Added `server/routes/pages/admin.js`
- Added `server/routes/pages/technician.js`
- Added `server/routes/pages/public.js`

## Routes Skipped And Why

- `GET /customer`, `GET /track`: customer/public flow surfaces; keep out of this batch.
- `GET /install-quote`, `GET /install-quote.html`: pricing-adjacent.
- Partner page routes: keep outside this project slice.
- Protected admin static pages and base-status pages: contain auth middleware / guard sensitivity.
- `/`, `POST /login`: explicit auth-entry surfaces.
- `GET /promotions`, booking, availability, customer tracking APIs, technician income, payouts, close-job, evidence, accounting/tax/VAT: hard-frozen business systems.

## Risk

- Overall risk: Medium.
- Reason: admin and technician page aliases are user-visible entry points, even though handlers are static-only.
- Protections:
  - exact route paths preserved
  - exact `sendHtml(...)` targets preserved
  - existing `app.use(createPageRoutes({ sendHtml }))` mount preserved
  - no middleware order changes
  - no frontend, DB, migration, or package changes

## Tests Run

```bash
node --check index.js
node --check server/routes/pages/index.js
node --check server/routes/pages/admin.js
node --check server/routes/pages/technician.js
node --check server/routes/pages/public.js
node --check server/routes/serviceZones/index.js
node --check server/routes/catalog/items.js
node --check server/routes/system/index.js
node --check server/routes/users/technicians.js
node --check server/db/pool.js
```

## Manual Smoke Checklist

- App starts.
- `/login` and `/login.html` still work.
- `POST /login` still works.
- `/` still works.
- `/tech` and `/tech.html` still work.
- All moved page routes still return exactly as before.
- Admin pages that were moved still open.
- Admin guard behavior still works.
- `/service_zones` still works.
- `POST /service_zones/detect` still works.
- Technician job page still loads.
- Technician history page still loads.
- Technician income page still loads.
- Customer/public pages that were not moved still work.
- No regression in booking, pricing, income, or close-job flows.

## Rollback Plan

1. Restore the 16 original inline handlers in `index.js`.
2. Remove `server/routes/pages/admin.js`, `server/routes/pages/technician.js`, and `server/routes/pages/public.js`.
3. Revert `server/routes/pages/index.js` to the prior single-file router.
4. Run the syntax checks above.
5. Smoke test all moved routes plus login, technician, service zone, and admin page entry points.
