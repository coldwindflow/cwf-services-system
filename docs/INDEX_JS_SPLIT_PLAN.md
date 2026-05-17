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

### Phase 2M: Admin Legacy Redirect Routes

- `GET /admin-legacy` and `GET /admin-legacy.html` have been extracted to `server/routes/pages/index.js`.
- Old locations:
  - `GET /admin-legacy`: `index.js:26882`
  - `GET /admin-legacy.html`: `index.js:26905`
- Current mount remains `app.use(createPageRoutes({ sendHtml }))` in the bottom static page route area, after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)`.
- The extracted routes are redirect-only and preserve the exact target: HTTP 302 to `/admin-review-v2.html`.
- No auth middleware, admin HTML guard, protected admin page route, frontend file, `sendHtml()`, `POST /login`, `GET /`, `GET /tech`, or `GET /tech.html` behavior was changed.
- Risk is low, but `/admin-legacy.html` still depends on the existing earlier admin HTML guard behavior staying in `index.js`.
- Rollback: remove only `/admin-legacy` and `/admin-legacy.html` handlers from `server/routes/pages/index.js`, restore the two original inline redirect handlers in the bottom static page route area, then run syntax checks.

### Phase 2N: Static Page Redirect Batch

- Six redirect-only page aliases have been extracted to `server/routes/pages/index.js`.
- Moved routes:
  - `GET /admin` -> `/admin-review-v2.html`
  - `GET /admin.html` -> `/admin-review-v2.html`
  - `GET /admin-tech` -> `/admin-review-v2.html`
  - `GET /admin-tech.html` -> `/admin-review-v2.html`
  - `GET /add-job` -> `/admin-add-v2.html`
  - `GET /add-job.html` -> `/admin-add-v2.html`
- Current mount remains `app.use(createPageRoutes({ sendHtml }))` in the bottom static page route area, after `express.static(FRONTEND_DIR)` and `express.static(ROOT_DIR)`.
- These routes use only `res.redirect(302, ...)`; no DB, request body, auth/session core, pricing, booking, technician income, job close, customer flow, external API, or mutable cache was touched.
- Skipped active sendFile/static pages, customer/track/register/quote pages, partner pages, `/`, `/tech`, `/tech.html`, `POST /login`, and all API/business routes.
- Rollback: remove only the six Phase 2N handlers from `server/routes/pages/index.js`, restore the six original inline redirect handlers in `index.js`, then run syntax checks.

### Phase 3B: Prep Admin Rework / Deductions Extraction

- The mixed deductions/rework block has been split conservatively instead of moving mutations.
- Extracted:
  - shared schema-aware helper factory: `server/helpers/adminReworkDeductionsHelpers.js`
  - read-only deductions routes: `server/routes/adminDeductionsReadOnly.js`
    - `GET /admin/deductions`
    - `GET /admin/deductions/summary`
    - `GET /admin/deductions/audit`
  - read-only rework routes: `server/routes/adminReworkReadOnly.js`
    - `GET /admin/rework_cases`
    - `GET /admin/rework_cases/:id`
- Write routes, approval/reject/void transitions, rework creation, and rework resolution remain inline in `index.js`.
- Estimated `index.js` reduction for this prep pass: about 288 net lines.
- Remaining deductions lookup/detail routes stay inline for a later pass after this seam is verified in production.
- Rollback: restore the original helper block plus five extracted GET handlers in `index.js`, remove the new helper/router modules, then run syntax checks and smoke tests.

### Phase 3C: Admin Deductions Read-Only Extraction

- Continued the Phase 3B seam by moving the remaining admin deductions GET-only routes into `server/routes/adminDeductionsReadOnly.js`:
  - `GET /admin/deductions/technician_search`
  - `GET /admin/deductions/job_search`
  - `GET /admin/deductions/warranty_jobs`
  - `GET /admin/deductions/suggestions`
  - `GET /admin/deductions/:id`
- Reused the existing helper seam from `server/helpers/adminReworkDeductionsHelpers.js`.
- Mutation/state routes remain inline in `index.js`, including create, patch, submit, approve, reject, void, and `transitionDeductionCase`.
- Additional `index.js` reduction in this phase: about 376 net lines.
- Rollback: restore the five Phase 3C GET handlers in `index.js`, remove them from `server/routes/adminDeductionsReadOnly.js`, then run syntax checks and smoke tests.

### Phase 3D: Document Rendering Route Extraction

- Extracted the isolated documents block into `server/routes/docs.js`.
- Moved helper functions:
  - `money`
  - `getJobDocData`
  - `docHtml`
  - `eSlipHtml`
- Moved read-only routes:
  - `GET /docs/quote/:job_id`
  - `GET /docs/receipt/:job_id`
  - `GET /docs/eslip/:job_id`
- `index.js` now mounts the documents router at the old document block location with explicit dependencies:
  - `pool`
  - `_accountingOwnerSignaturePublicUrl`
  - `_accountingSignaturePublicUrl`
  - `_accountingOwnerSignerName`
  - `_accountingOwnerSignerPosition`
- SQL, HTML output, content type headers, status codes, and error bodies were preserved.
- `index.js` line count reduced from `24,295` to `24,019` lines.
- Rollback: remove the `createDocumentRoutes` import and mount from `index.js`, restore the four helper functions plus the three original inline document routes at the old block location, delete `server/routes/docs.js`, then run syntax checks and smoke-test all three document endpoints.

### Phase 3E: Accounting Read-Only Views

- Extracted the safe accounting GET-only subset into `server/routes/accountingReadOnly.js`.
- Moved routes:
  - `GET /admin/accounting/summary`
  - `GET /admin/accounting/revenue`
  - `GET /admin/accounting/reports/summary`
  - `GET /admin/accounting/payouts/:payout_id/techs`
  - `GET /admin/accounting/deposits`
  - `GET /admin/accounting/audit`
- `index.js` now mounts `createAccountingReadOnlyRoutes({...})` at the old accounting read-only seam before `POST /admin/accounting/revenue/:job_id/mark-paid`.
- Explicitly skipped:
  - `GET /admin/accounting/settings` because its helper can ensure schema
  - `GET /admin/accounting/payouts` because it can auto-create payout periods
  - `GET /admin/accounting/reports/:report_key.csv` because it writes audit logs
  - tax/withholding/document-print routes and all accounting mutation routes
- `index.js` line count reduced from `24,019` to `23,716` lines.
- Rollback: remove the accounting read-only import/mount, restore the six inline GET handlers, delete `server/routes/accountingReadOnly.js`, then run syntax checks and smoke-test all six routes.

### Phase 3F: Audit for the Next Large Safe Block

- Audited the next large `index.js` candidates after the accounting read-only extraction.
- No runtime extraction was opened because every candidate large enough to remove at least `200` lines still crossed a forbidden seam:
  - admin dashboard v2 has hidden side effects inside a GET path
  - payout views remain coupled to payout mutation/finalization logic
  - technician work-calendar/readiness mixes read paths with write helpers and upsert behavior
  - technician base-status has a pure-helper subset, but the safe subset is still below the phase size threshold
  - remaining accounting-adjacent routes are tied to schema ensure, auto-create, audit writes, or tax/document flows
- See `docs/PHASE3F_NEXT_SAFE_INDEX_REDUCTION.md` for the full candidate inventory and skip rationale.
- Runtime code changed in Phase 3F: none.
- Future backend extraction PRs must include a startup smoke check in addition to syntax checks.

### Phase 3G: Technician Base Status Prep Seam

- Extracted the read-only technician base-status seam while keeping POST/write behavior frozen in `index.js`.
- New helper module:
  - `server/helpers/technicianBaseStatusDataHelpers.js`
- New read-only route module:
  - `server/routes/technicianBaseStatusReadOnly.js`
- Moved read-only routes:
  - `GET /admin/api/team-status`
  - `GET /admin/api/technicians/:username/base-status`
  - `GET /admin/api/technicians/:username/status`
  - `GET /tech/api/base-status`
- Kept in place:
  - `POST /admin/api/technicians/:username/base-status`
  - `POST /tech/api/base-status`
  - pure scoring helpers shared by the retained write routes
- This prep phase intentionally reduces less than the normal target because it creates the safe dependency seam needed before any later POST/write extraction.
- `index.js` line counts changed:
  - physical lines: `25,567` -> `25,468`
  - non-empty lines: `23,717` -> `23,623`
- See `docs/PHASE3G_TECHNICIAN_BASE_STATUS_PREP.md` for the full route inventory, rationale, checklist, and rollback plan.

### Phase 3H: Technician Base Status Scoring Prep

- Extracted the remaining pure scoring seam into `server/helpers/technicianBaseStatusScoring.js`.
- Moved:
  - `TECH_BASE_STATUS_CAPS`
  - the small scoring helpers
  - `calculateTechnicianBaseStatus`
  - `buildTechnicianCharacterPrompt`
- Kept in place:
  - `POST /admin/api/technicians/:username/base-status`
  - `POST /tech/api/base-status`
- Ran a temporary parity compare against the original inline helper block with three sample inputs; all outputs matched.
- `index.js` line counts changed:
  - physical lines: `25,468` -> `25,354`
  - non-empty lines: `23,619` -> `23,517`
- See `docs/PHASE3H_TECHNICIAN_BASE_STATUS_SCORING_PREP.md` for the detailed inventory, parity check, checklist, and rollback plan.

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
- Run a runtime startup smoke such as `timeout 5s node index.js` (or equivalent) and verify no boot-time `ReferenceError`, missing import, or undefined route factory occurs before timeout.
- Run manual smoke tests for the relevant user flow.
