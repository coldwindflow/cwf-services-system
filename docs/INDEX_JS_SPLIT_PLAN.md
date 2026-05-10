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
