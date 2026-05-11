# index.js Split Plan

This plan is intentionally conservative. Do not extract production logic from `index.js` until each phase has a route map, dependency list, syntax check, and manual regression checklist.

## Target Structure

Recommended future structure:

```text
server/
  db/
    pool.js
  middleware/
    auth.js
    upload.js
  routes/
    technician/
      jobs.js
      income.js
      payouts.js
      rework.js
      evidence.js
    admin/
      jobs.js
      booking.js
      deductions.js
      rework.js
      payouts.js
      accounting.js
    public/
      booking.js
      tracking.js
      pricingPreview.js
    partner/
      applications.js
      agreement.js
      academy.js
    docs/
      receipts.js
      quotes.js
      eslip.js
  services/
    jobs/
      jobItems.js
      jobUnits.js
      closeJob.js
      closeJobValidation.js
    technician/
      incomeDisplay.js
      payoutPeriods.js
      identity.js
    admin/
      bookingService.js
    public/
      availabilityService.js
  utils/
    dates.js
    money.js
    asyncHandler.js
```

## Module Pattern For Future Route Extraction

Prefer route factory modules that receive all dependencies explicitly:

```js
module.exports = function createXRoutes(deps) {
  const router = deps.express.Router();

  router.get("/existing/path", deps.requireAdminSession, async (req, res) => {
    // moved handler only after tests pass
  });

  return router;
};
```

Rules:

- Keep CommonJS.
- Keep route paths exactly the same.
- Pass dependencies explicitly.
- Do not import global app state from `index.js`.
- Do not create duplicate route logic.
- If extracting, delete the old duplicate route from `index.js` in the same patch only after tests pass.

## Safe Phased Plan

### Phase 0: Documentation and Folder Boundaries Only

- Add architecture docs.
- Add empty/skeleton folders with README files.
- Do not change runtime code.
- Do not import new modules into `index.js`.

### Phase 1: Tiny Low-Risk Routes Only

- Move only pure health/status routes, such as `/api/version`, or pure health checks.
- No DB writes.
- No auth/session changes.
- No business calculations.
- Confirm `node index.js` still starts.

Phase 1A status:

- `GET /api/version` has been extracted to `server/routes/system/index.js`.
- `index.js` imports `./server/routes/system` and mounts it at the existing `Health / Version` location before `/api/maps/resolve`.
- Rollback: remove the system route import and mount from `index.js`, restore the original inline `app.get("/api/version", ...)` block at the same marker, delete `server/routes/system/index.js`, then run `node --check index.js`.

Phase 1B status:

- No additional route was extracted.
- Rechecked the next apparent health/status candidates:
  - `/test-db` uses DB access.
  - `/admin/debug/status` uses admin middleware and runtime debug state.
  - `/public/line_config` is LINE-adjacent configuration.
  - Other `status` routes are partner, technician, admin, attendance, or job business-flow routes.
- Rollback: no runtime rollback is needed for Phase 1B because it is docs-only. Revert the Phase 1B docs commit if the finding needs to be removed.

### Phase 2A: DB Pool Preparation

- Root `db.js` remains the single source of truth and still exports the pool object directly.
- `server/db/pool.js` re-exports `../../db` for future route/service modules.
- `index.js` was not changed in Phase 2A to avoid startup behavior risk.
- Do not create another `new Pool(...)` anywhere else.
- See `docs/DB_POOL_EXTRACTION_PLAN.md` before moving DB-backed routes.

### Phase 2C: Small DB Health Route

- `GET /test-db` has been extracted into `server/routes/system/index.js`.
- `index.js` now mounts the system router with the existing pool: `app.use(createSystemRoutes({ pool }))`.
- SQL and response shapes are unchanged:
  - success: `{ ok: true, now }`
  - error: HTTP 500 with `{ ok: false, error: "db connection failed" }`
- No new PostgreSQL pool was created.
- Rollback: remove the `/test-db` route from `server/routes/system/index.js`, restore the old inline `app.get("/test-db", ...)` block at the `TEST DB` marker in `index.js`, and restore `app.use(createSystemRoutes({}))` if the system router no longer needs the pool.

### Phase 2D: Technician Directory Route Map

- `GET /users/technicians` was audited as the next smallest DB-backed read-only candidate.
- No route was moved and no runtime file was changed in Phase 2D.
- Phase 2E extracted `GET /users/technicians` to `server/routes/users/technicians.js`.
- Old location: `index.js:12906`, between the password change route block and the `CATALOG` marker.
- Current mount: `app.use(createTechnicianDirectoryRoutes({ pool }))` at the same old inline route location.
- Dependencies: `pool.query` and `console.error`.
- SQL: `SELECT username FROM public.users WHERE role='technician' ORDER BY username`.
- This route should not be added to `server/routes/system/index.js` because it is a technician directory endpoint, not a health/status endpoint.
- Rollback: remove the `createTechnicianDirectoryRoutes` import and mount from `index.js`, restore the original inline `app.get("/users/technicians", ...)` block at the same location, delete `server/routes/users/technicians.js`, then run syntax checks.
- See `docs/PHASE2D_TECHNICIAN_DIRECTORY_ROUTE_MAP.md` for the Phase 2E extraction notes, manual test checklist, and rollback steps.

### Phase 2G: Catalog Items Route

- `GET /catalog/items` has been extracted to `server/routes/catalog/items.js`.
- Old location: `index.js:12916`, before `POST /catalog/items`.
- Current mount: `app.use(createCatalogItemRoutes({ pool }))` at the same old inline route location.
- Dependencies: `pool.query`, request query filters, local `where`/`params`, and `console.error`.
- SQL, query filter behavior, ordering, success response `res.json(r.rows)`, and HTTP 500 error response are unchanged.
- `GET /promotions`, `GET /service_zones`, and `POST /catalog/items` were not moved.
- Risk remains medium because the route is catalog/pricing-adjacent and used by the admin add-job flow.
- Rollback: remove the `createCatalogItemRoutes` import and mount from `index.js`, restore the original inline `app.get("/catalog/items", ...)` block before `POST /catalog/items`, delete `server/routes/catalog/items.js`, then run syntax checks.

### Phase 2I: Service Zones Route

- `GET /service_zones` has been extracted to `server/routes/serviceZones/index.js`.
- Old location: `index.js:21281`, immediately before `POST /service_zones/detect`.
- Current mount: `app.use(createServiceZoneRoutes({ getServiceZones, SERVICE_ZONE_SEEDS, ENABLE_SERVICE_ZONE_FILTER }))` at the same old inline route location.
- Dependencies are passed from `index.js`: `getServiceZones`, `SERVICE_ZONE_SEEDS`, and `ENABLE_SERVICE_ZONE_FILTER`.
- Success response remains `{ ok: true, zones, filter_enabled }`.
- Error response remains HTTP 500 with `{ error: "LOAD_SERVICE_ZONES_FAILED" }`, and `console.error("GET /service_zones", e)` is preserved.
- `getServiceZones()`, `SERVICE_ZONE_SEEDS`, `ENABLE_SERVICE_ZONE_FILTER`, and `POST /service_zones/detect` were not moved or changed.
- Risk remains medium-high because service zones affect admin add-job and technician zone detection flows.
- Rollback: remove the `createServiceZoneRoutes` import and mount from `index.js`, restore the original inline `app.get("/service_zones", ...)` block immediately before `POST /service_zones/detect`, delete `server/routes/serviceZones/index.js`, then run syntax checks.

### Phase 2K: Login Static Page Routes

- `GET /login` and `GET /login.html` have been extracted to `server/routes/pages/index.js`.
- Old locations:
  - `GET /login`: `index.js:26872`
  - `GET /login.html`: `index.js:26898`
- Current mount: `app.use(createPageRoutes({ sendHtml }))` in the bottom static page route area, after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)`.
- Dependencies are passed from `index.js`: `sendHtml`.
- The new page router contains only:
  - `GET /login`
  - `GET /login.html`
- `sendHtml()`, `POST /login`, `GET /`, `GET /tech`, `GET /tech.html`, protected admin/partner pages, and frontend files were not changed.
- Risk is low for `/login` and low-medium for `/login.html` because `express.static(ROOT_DIR)` is mounted before the explicit static page route area.
- Rollback: remove the `createPageRoutes` import and mount from `index.js`, restore the original inline `app.get("/login", ...)` and `app.get("/login.html", ...)` handlers at the bottom static page route area, delete `server/routes/pages/index.js`, then run syntax checks.

### Phase 2: Read-Only Technician Routes

- Move read-only technician routes with no DB writes.
- Confirm route paths and response shapes are identical.
- Keep technician session middleware behavior unchanged.
- Avoid current job, close job, photos, evidence, payout, and income write paths.

### Phase 3: Technician Income Display Routes

- Move technician income display routes only if they already use:
  - `server/technicianIncome.js`
  - `server/technicianJobIncomeDisplay.js`
  - `server/technicianJobMoneySummary.js`
- Preserve calculation helpers and response fields exactly.
- Do not modify payout generation, settlement, withdrawal, or accounting flows.

### Phase 4: job_units and Evidence Helpers

- Move `job_units`, photo metadata, upload, and evidence helpers only after dedicated tests exist.
- Validate close-job and per-unit evidence behavior before and after extraction.
- Keep upload middleware and Cloudinary behavior unchanged.

### Phase 5: Admin Job Routes

- Move admin job routes only after a route map and regression checklist exist.
- Freeze `/admin/book_v2` and `/admin/job_v2` edit logic until there are focused tests.
- Preserve admin soft/session middleware behavior exactly.

## High-Risk Frozen Areas

Explicitly DO NOT MOVE YET:

- `/public/book`
- `/public/availability_v2`
- `/public/pricing_preview`
- `/admin/book_v2`
- `/admin/job_v2` edit logic
- auth/session routes
- LINE login routes
- payout calculation
- technician finalize/close job
- accounting documents and tax routes
- customer tracking

## Split Readiness Checklist

Before extracting any route:

- Grep the route path and confirm there is exactly one production handler.
- Identify helper functions used by the route.
- Identify middleware used by the route.
- Identify database tables and columns touched by the route.
- Identify frontend callers and expected response shape.
- Add or update a focused test/checklist.
- Run `node --check index.js` and `node --check` on every changed JS file.
- Run manual smoke tests for the relevant user flow.
