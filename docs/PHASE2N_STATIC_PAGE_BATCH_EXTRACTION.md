# Phase 2N Static Page Batch Extraction

Date: 2026-05-11

Scope: extract a small batch of redirect-only static page aliases from `index.js` into the existing page router.

## Routes Moved

| Route | Old location | Previous behavior | New module | Dependencies | Risk |
| --- | --- | --- | --- | --- | --- |
| `GET /admin` | `index.js:26875` | `res.redirect(302, "/admin-review-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low |
| `GET /admin.html` | `index.js:26898` | `res.redirect(302, "/admin-review-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low |
| `GET /admin-tech` | `index.js:26880` | `res.redirect(302, "/admin-review-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low |
| `GET /admin-tech.html` | `index.js:26903` | `res.redirect(302, "/admin-review-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low |
| `GET /add-job` | `index.js:26884` | `res.redirect(302, "/admin-add-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low-medium |
| `GET /add-job.html` | `index.js:26906` | `res.redirect(302, "/admin-add-v2.html")` | `server/routes/pages/index.js` | `res.redirect` | Low-medium |

All moved routes are redirect-only. They do not use DB access, request bodies, auth/session middleware inside the handler, pricing or promotion logic, customer booking/tracking logic, technician income, job close logic, external APIs, or shared mutable caches.

## Mount Location

The existing page router mount remains in `index.js`:

```js
app.use(createPageRoutes({ sendHtml }));
```

It is still mounted in the bottom static page route area after:

```js
if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));
app.use(express.static(ROOT_DIR));
```

No new `index.js` logic was added.

## Routes Explicitly Skipped

Skipped because they are active static sendFile page routes or should stay out of this batch:

- `GET /admin-add`
- `GET /admin-review`
- `GET /admin-queue`
- `GET /admin-history`
- `GET /admin-add-v2.html`
- `GET /admin-review-v2.html`
- `GET /admin-queue-v2.html`
- `GET /admin-history-v2.html`
- `GET /edit-profile`
- `GET /edit-profile.html`
- `GET /customer`
- `GET /track`
- `GET /register`
- `GET /register.html`
- `GET /install-quote`
- `GET /install-quote.html`
- Partner page routes, including Partner Academy routes

Skipped because they are explicitly frozen for this project phase:

- `GET /promotions`
- `POST /login`
- `GET /`
- `GET /tech`
- `GET /tech.html`
- `POST /service_zones/detect`
- `GET /technicians/:username/profile`
- `/attendance/*`
- `/api/maps/resolve`
- Public booking, availability, and tracking routes
- Job, offer, close-job, photo, unit, and evidence routes
- Technician income and payout routes
- Accounting, tax, and VAT routes
- Auth/session core and LINE login routes

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

- App starts with `node index.js`.
- All moved routes still redirect exactly as before.
- `GET /admin` redirects to `/admin-review-v2.html`.
- `GET /admin.html` redirects to `/admin-review-v2.html`.
- `GET /admin-tech` redirects to `/admin-review-v2.html`.
- `GET /admin-tech.html` redirects to `/admin-review-v2.html`.
- `GET /add-job` redirects to `/admin-add-v2.html`.
- `GET /add-job.html` redirects to `/admin-add-v2.html`.
- `/login` works.
- `/login.html` works.
- `POST /login` still works.
- `/` still works.
- `/tech` and `/tech.html` still work.
- `/admin-review-v2.html` still works.
- Admin static pages still load.
- Existing admin HTML guard behavior still works.
- `/service_zones` still works.
- `POST /service_zones/detect` still works.
- No regression in technician job page.

## Rollback Plan

If this extraction causes any issue:

1. Remove only these handlers from `server/routes/pages/index.js`:

```js
router.get("/admin", (req, res) => res.redirect(302, "/admin-review-v2.html"));
router.get("/admin.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
router.get("/admin-tech", (req, res) => res.redirect(302, "/admin-review-v2.html"));
router.get("/admin-tech.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
router.get("/add-job", (req, res) => res.redirect(302, "/admin-add-v2.html"));
router.get("/add-job.html", (req, res) => res.redirect(302, "/admin-add-v2.html"));
```

2. Restore the original inline handlers in `index.js` at the bottom static page route area.
3. Run:

```bash
node --check index.js
node --check server/routes/pages/index.js
```

4. Smoke test all moved routes plus `/login`, `/tech`, and `/service_zones`.
