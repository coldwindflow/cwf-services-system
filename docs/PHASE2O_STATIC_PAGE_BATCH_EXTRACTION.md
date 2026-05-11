# Phase 2O Static Page Batch Extraction

Date: 2026-05-11

Scope: extract the next safe batch of static admin page aliases from `index.js` into the existing page router.

## Routes Moved

| Route | Old location | Previous behavior | New module | Dependencies | Risk |
| --- | --- | --- | --- | --- | --- |
| `GET /admin-add` | `index.js:26875` | `res.sendFile(sendHtml("admin-add-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-review` | `index.js:26876` | `res.sendFile(sendHtml("admin-review-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-queue` | `index.js:26877` | `res.sendFile(sendHtml("admin-queue-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-history` | `index.js:26878` | `res.sendFile(sendHtml("admin-history-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-add-v2.html` | `index.js:26895` | `res.sendFile(sendHtml("admin-add-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-review-v2.html` | `index.js:26896` | `res.sendFile(sendHtml("admin-review-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-queue-v2.html` | `index.js:26897` | `res.sendFile(sendHtml("admin-queue-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |
| `GET /admin-history-v2.html` | `index.js:26898` | `res.sendFile(sendHtml("admin-history-v2.html"))` | `server/routes/pages/index.js` | `sendHtml` | Medium |

All moved routes are GET-only static page aliases. They do not use DB access, request bodies, auth/session middleware inside the handler, pricing or promotion logic, customer booking/tracking logic, technician income, job close logic, external APIs, or shared mutable caches.

## Mount Location

The existing page router mount remains in `index.js`:

```js
app.use(createPageRoutes({ sendHtml }));
```

It is still mounted in the bottom static page route area after the existing protected admin HTML guard and after:

```js
if (fs.existsSync(FRONTEND_DIR)) app.use(express.static(FRONTEND_DIR));
app.use(express.static(ROOT_DIR));
```

No new `index.js` logic was added. `sendHtml()` was not changed.

## Routes Explicitly Skipped

Skipped because they are frozen for this phase or tied to technician/auth/customer behavior:

- `GET /`
- `GET /tech`
- `GET /tech.html`
- `POST /login`
- `GET /promotions`
- `POST /service_zones/detect`
- `GET /technicians/:username/profile`
- `/attendance/*`
- `/api/maps/resolve`
- Public booking, availability, and tracking routes
- Job, offer, close-job, photo, unit, and evidence routes
- Technician income and payout routes
- Accounting, tax, and VAT routes
- Auth/session core and LINE login routes

Skipped because they are customer, registration, install quote, profile, or partner-facing pages outside this admin static batch:

- `GET /edit-profile`
- `GET /edit-profile.html`
- `GET /customer`
- `GET /track`
- `GET /register`
- `GET /register.html`
- `GET /install-quote`
- `GET /install-quote.html`
- `GET /home`
- `GET /index.html`
- Partner page routes, including Partner Academy routes

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
- All moved routes still return exactly as before.
- `GET /admin-add` opens `admin-add-v2.html`.
- `GET /admin-review` opens `admin-review-v2.html`.
- `GET /admin-queue` opens `admin-queue-v2.html`.
- `GET /admin-history` opens `admin-history-v2.html`.
- `GET /admin-add-v2.html` opens `admin-add-v2.html`.
- `GET /admin-review-v2.html` opens `admin-review-v2.html`.
- `GET /admin-queue-v2.html` opens `admin-queue-v2.html`.
- `GET /admin-history-v2.html` opens `admin-history-v2.html`.
- `/login` works.
- `/login.html` works.
- `POST /login` still works.
- `/` still works.
- `/tech` and `/tech.html` still work.
- Admin static pages still load.
- Existing admin HTML guard behavior still works.
- `/service_zones` still works.
- `POST /service_zones/detect` still works.
- No regression in technician job page.

## Rollback Plan

If this extraction causes any issue:

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

2. Restore the original inline handlers in `index.js` at the bottom static page route area.
3. Run:

```bash
node --check index.js
node --check server/routes/pages/index.js
```

4. Smoke test all moved routes plus `/login`, `/tech`, `/service_zones`, and `POST /service_zones/detect`.
