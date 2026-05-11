# Phase 2L Next Route Audit

Date: 2026-05-11

Scope: audit only. No runtime code was changed, no route was moved, and no new module was created.

This audit reviews the remaining `index.js` route groups after:

- Phase 2I extracted `GET /service_zones` to `server/routes/serviceZones/index.js`.
- Phase 2K extracted `GET /login` and `GET /login.html` to `server/routes/pages/index.js`.

## Current Route Groups Still In index.js

Major route groups still in `index.js` include:

- Admin dashboard/profile/super-admin APIs.
- Auth and session routes, including `POST /login` and password changes.
- Catalog write route and promotions routes.
- Core job, admin booking, review queue, edit, assignment, dispatch, payment, pricing, and cancellation routes.
- Technician job, offers, income, close-job/finalize, photos, evidence, units, accept-status, profile, service matrix, and rank routes.
- Public pricing, availability, booking, tracking, and review routes.
- Accounting, tax/VAT, payout, deduction, quote, receipt, and document routes.
- Attendance routes.
- Bottom static page routes and redirects.

Most API routes remain high risk because they use DB reads/writes, auth/session middleware, pricing/promotion helpers, technician income logic, close-job flows, or customer-facing behavior.

## Candidate Comparison

The safest remaining candidates are still in the bottom static page route area after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)`.

| Candidate | Method | Current location | Current behavior | Dependencies | Risk | Move style | Target module | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/admin-legacy` + `/admin-legacy.html` | GET | `index.js:26882`, `index.js:26905` | Redirect 302 to `/admin-review-v2.html` | `res.redirect` only | Low | Move as a pair | `server/routes/pages/index.js` | Recommended Phase 2M candidate |
| `/admin-tech` + `/admin-tech.html` | GET | `index.js:26880`, `index.js:26904` | Redirect 302 to `/admin-review-v2.html` | `res.redirect` only | Low | Move as a pair | `server/routes/pages/index.js` | Safe after legacy redirects, but avoid moving both pairs in the same first follow-up if keeping PR tiny |
| `/add-job` + `/add-job.html` | GET | `index.js:26885`, `index.js:26908` | Redirect 302 to `/admin-add-v2.html` | `res.redirect` only | Low-medium | Move as a pair | `server/routes/pages/index.js` | Safe as redirect-only, but admin add-job is an active business flow, so not first |
| `/home` + `/index.html` | GET | `index.js:26897`, `index.js:26914` | Sends `index.html` | `sendHtml`, `res.sendFile` | Low-medium | Move as a pair | `server/routes/pages/index.js` | Static and simple, but `index.html` exists and may be served by static middleware first |
| `/register` + `/register.html` | GET | `index.js:26895`, `index.js:26909` | Sends `register.html` | `sendHtml`, `res.sendFile` | Medium | Move as a pair only after audit | `server/routes/pages/index.js` | Customer-adjacent registration flow; not next |
| `/install-quote` + `/install-quote.html` | GET | `index.js:26892`, `index.js:26894` | Short path sends `install-quote.html`; `.html` redirects to `/install-quote` | `sendHtml`, `res.sendFile`, `res.redirect` | Medium | Move as a pair only after audit | `server/routes/pages/index.js` | Customer quote/pricing-adjacent; not next |
| `/partner-status` + `/partner-status.html` | GET | `index.js:26888`, `index.js:26911` | Sends `partner-status.html` | `sendHtml`, `res.sendFile` | Medium | Move as a pair only if Partner project resumes | `server/routes/pages/index.js` | Not part of Technician App Stable |
| `/partner-academy` + `/partner-academy.html` | GET | `index.js:26890`, `index.js:26913` | Sends `partner-academy.html` | `sendHtml`, `res.sendFile` | Medium | Move as a pair only if Partner project resumes | `server/routes/pages/index.js` | Do not select for this project |

## Recommended Phase 2M Candidate

Recommended next extraction:

```text
GET /admin-legacy
GET /admin-legacy.html
```

Reason:

- Both are redirect-only routes.
- They do not use DB, auth/session middleware, upload middleware, pricing, promotions, customer booking, technician income, close-job, accounting, LINE, or service-zone helpers.
- They do not serve frontend files directly.
- No `admin-legacy.html` file exists in the repo root, so the `.html` route is less likely to be shadowed by static file serving than static page routes backed by real files.
- They are legacy aliases that redirect to the existing admin review page.

Risk remains low, not zero, because `/admin-legacy.html` matches the earlier protected admin HTML guard:

```text
app.get(/^\/admin-[^\s]+\.html$/i, requireAdminSession, (req, res, next) => next());
```

That guard must remain in `index.js` and must not be moved in Phase 2M. The future page-router mount should stay after both static middlewares, in the same bottom route area, and should only add these redirect handlers to `server/routes/pages/index.js`.

## Proposed Phase 2M Target

Target module:

```text
server/routes/pages/index.js
```

Proposed factory addition:

```js
router.get("/admin-legacy", (req, res) => res.redirect(302, "/admin-review-v2.html"));
router.get("/admin-legacy.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
```

Mount plan:

- Keep the existing `app.use(createPageRoutes({ sendHtml }))` mount after:
  - `if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));`
  - `app.use(express.static(ROOT_DIR));`
- Remove only the old inline `app.get("/admin-legacy", ...)` and `app.get("/admin-legacy.html", ...)` handlers from `index.js`.
- Do not move `GET /admin`, `GET /admin.html`, `GET /admin-add`, `GET /admin-review`, `GET /admin-tech`, protected admin/partner pages, or any admin API route.

## Manual Smoke Checklist For Phase 2M

If Phase 2M extracts only the admin legacy redirects:

- App starts with `node index.js`.
- `GET /admin-legacy` still returns HTTP 302 to `/admin-review-v2.html`.
- `GET /admin-legacy.html` still returns HTTP 302 to `/admin-review-v2.html` after normal admin HTML protection behavior.
- `GET /admin` still redirects to `/admin-review-v2.html`.
- `GET /admin-review-v2.html` still loads as before for an authenticated admin.
- `GET /login` still displays the login page.
- `GET /login.html` still displays the login page or remains served the same as before.
- `POST /login` still works.
- `GET /tech` and `GET /tech.html` still load the technician app.
- `GET /service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

If a future Phase 2M extraction causes any issue:

1. Remove the `/admin-legacy` and `/admin-legacy.html` route handlers from `server/routes/pages/index.js`.
2. Restore the original inline handlers in the bottom static page route area:

```js
app.get("/admin-legacy", (req, res) => res.redirect(302, "/admin-review-v2.html"));
app.get("/admin-legacy.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
```

3. Keep the existing `createPageRoutes({ sendHtml })` mount because it is still needed for `/login` and `/login.html`.
4. Run:

```bash
node --check index.js
node --check server/routes/pages/index.js
```

5. Smoke test `/admin-legacy`, `/admin-legacy.html`, `/login`, and `/login.html`.

## Candidates Not To Touch Next

Do not select these for Phase 2M:

- `GET /promotions`: promotion/pricing-adjacent and uses shared mutable promotion column cache.
- `POST /login`: auth/session core.
- `GET /`: default app landing route.
- `GET /tech` and `GET /tech.html`: technician app entry points.
- `POST /service_zones/detect`: technician/admin zone detection behavior.
- `/attendance/*`: technician attendance flow with writes nearby.
- `/api/maps/resolve`: map URL parsing and external/best-effort behavior.
- `/public/book`, `/public/availability*`, `/public/track`, `/customer`: customer-facing booking/tracking flows.
- `/jobs/*`, `/offers/*`, close-job/finalize/photos/units/evidence routes: technician job workflow.
- Accounting, tax/VAT, payout, deduction, and document routes.
- Partner Academy/static partner routes while this project is Technician App Stable, not Partner Academy.
