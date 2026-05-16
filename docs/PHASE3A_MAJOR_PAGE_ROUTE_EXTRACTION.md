# Phase 3A Major Page Route Extraction

Date: 2026-05-16

## Current Repo / PR Status

- `main` has advanced beyond PR #14.
- PR #15 (`refactor: batch extract admin static page routes`) is still open, based on an older `main`, and is no longer mergeable cleanly with the latest branch state.
- Decision: supersede PR #15 with this fresh branch from current `main` instead of merging an outdated branch first. The eight safe routes from PR #15 are included here unchanged.

## Before / After Summary

- Before: 8 clearly safe admin static page aliases still lived inline in `index.js`.
- After: those 8 routes live in `server/routes/pages/index.js`.
- Estimated `index.js` line reduction: 8 route lines.
- Module structure stays simple:
  - `server/routes/pages/index.js`

## Routes Moved

| Route | Old location | Previous behavior | New module | Dependencies | Risk |
| --- | --- | --- | --- | --- | --- |
| `GET /admin-add` | `index.js:26822` | `res.sendFile(sendHtml("admin-add-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-review` | `index.js:26823` | `res.sendFile(sendHtml("admin-review-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-queue` | `index.js:26824` | `res.sendFile(sendHtml("admin-queue-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-history` | `index.js:26825` | `res.sendFile(sendHtml("admin-history-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-add-v2.html` | `index.js:26842` | `res.sendFile(sendHtml("admin-add-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-review-v2.html` | `index.js:26843` | `res.sendFile(sendHtml("admin-review-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-queue-v2.html` | `index.js:26844` | `res.sendFile(sendHtml("admin-queue-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-history-v2.html` | `index.js:26845` | `res.sendFile(sendHtml("admin-history-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |

These routes are GET-only static page aliases. They use no DB, request body, business logic, external API, pricing, booking, technician income, close-job flow, or shared mutable cache.

## Routes Skipped And Why

### Maybe safe, but needs a separate review

- `GET /edit-profile`
- `GET /edit-profile.html`
- `GET /home`
- `GET /index.html`

These are static-only, but they touch technician/profile or public entry surfaces and are not necessary to complete this pass safely.

### Do not touch in this phase

- `GET /`
- `GET /tech`
- `GET /tech.html`
- `POST /login`
- `GET /promotions`
- `POST /service_zones/detect`
- `GET /technicians/:username/profile`
- `/attendance/*`
- `/api/maps/resolve`
- Public booking, availability, customer tracking, and install quote routes
- `GET /customer`
- `GET /track`
- `GET /register`
- `GET /register.html`
- Partner page routes, including Partner Academy routes
- Protected admin pages using auth middleware
- Technician income/payout routes
- Job, offer, close-job, photo, unit, and evidence routes
- Accounting, tax, VAT, auth/session core, and LINE login routes

## Risk

- Overall risk: Medium.
- Why not low: these are admin-facing page aliases, and several HTML paths rely on the existing admin guard/static middleware ordering staying unchanged.
- Protections:
  - same route paths
  - same `sendHtml(...)` targets
  - same mount position via existing page router
  - no frontend, DB, package, migration, or middleware changes

## Tests Run

```bash
node --check index.js
node --check server/routes/pages/index.js
node --check server/routes/serviceZones/index.js
node --check server/routes/catalog/items.js
node --check server/routes/system/index.js
node --check server/routes/users/technicians.js
node --check server/db/pool.js
```

## Manual Smoke Checklist

- App starts.
- All moved routes still return exactly as before.
- `/login` still works.
- `/login.html` still works.
- `POST /login` still works.
- `/` still works.
- `/tech` and `/tech.html` still work.
- All moved admin static pages still open.
- Admin guard behavior still works.
- `/service_zones` still works.
- `POST /service_zones/detect` still works.
- Technician job page has no regression.
- Customer/public pages that were not moved still work.
- No regression in booking, pricing, income, or close-job flows.

## Rollback Plan

1. Remove only these handlers from `server/routes/pages/index.js`:

```js
router.get("/admin-add", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
router.get("/admin-review", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
router.get("/admin-queue", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
router.get("/admin-history", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
router.get("/admin-add-v2.html", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
router.get("/admin-review-v2.html", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
router.get("/admin-queue-v2.html", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
router.get("/admin-history-v2.html", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
```

2. Restore the original inline handlers in `index.js` at the same bottom static page locations.
3. Run syntax checks.
4. Smoke test all moved routes plus `/login`, `/tech`, `/service_zones`, and `POST /service_zones/detect`.
