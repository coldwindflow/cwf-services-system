# Phase 3B Prep Admin Rework Deductions Extraction

Date: 2026-05-16

## Scope

Prepare the mixed admin deductions/rework area for future large extraction without moving business mutations.

## Block Inventory

| Category | Items |
| --- | --- |
| Read-only GET routes | `/admin/deductions`, `/admin/deductions/summary`, `/admin/deductions/audit`, `/admin/deductions/technician_search`, `/admin/deductions/job_search`, `/admin/deductions/warranty_jobs`, `/admin/deductions/suggestions`, `/admin/deductions/:id`, `/admin/rework_cases`, `/admin/rework_cases/:id` |
| Write routes | `POST /admin/deductions`, `PATCH /admin/deductions/:id`, deduction submit/approve/reject/void POST routes, `POST /admin/jobs/:job_id/rework_case`, `POST /admin/rework_cases/:id/resolve` |
| Pure helpers | `dHas`, `dCol`, `dTextCol`, `dSearchParts` |
| DB query helpers | `getDeductionTableMeta`, deduction table metadata cache |
| State transition helpers | `transitionDeductionCase` |
| Must stay for now | all write routes, approval/release/finalize paths, rework creation/resolution, payout/payment mutations |

## Selected Safe Subset

Moved in this prep pass:

- `server/helpers/adminReworkDeductionsHelpers.js`
  - `getDeductionTableMeta`
  - `dHas`
  - `dCol`
  - `dTextCol`
  - `dSearchParts`
- `server/routes/adminDeductionsReadOnly.js`
  - `GET /admin/deductions`
  - `GET /admin/deductions/summary`
  - `GET /admin/deductions/audit`
- `server/routes/adminReworkReadOnly.js`
  - `GET /admin/rework_cases`
  - `GET /admin/rework_cases/:id`

These routes are read-only, preserve the same SQL and response shapes, and keep the same `requireAdminSession` middleware through dependency injection.

## Skipped Risky Subset

- All POST/PATCH mutation routes
- `transitionDeductionCase`
- deduction approval/reject/void flows
- rework creation and resolve flows
- technician income formula / payout / accounting / close-job flows

The remaining deductions lookup/detail routes are intentionally left inline for now because they share a denser adjacent surface with route-specific search/detail logic. The new helper seam lets a later pass move them with less risk after this first extraction is validated.

## Before / After

- `index.js` before: 24,959 lines
- `index.js` after: 24,671 lines
- Net reduction: 288 lines
- Moved route count: 5
- Moved helper count: 5

## Files Changed

- `index.js`
- `server/helpers/adminReworkDeductionsHelpers.js`
- `server/routes/adminDeductionsReadOnly.js`
- `server/routes/adminReworkReadOnly.js`
- `docs/INDEX_JS_SPLIT_PLAN.md`
- `docs/PHASE3B_PREP_ADMIN_REWORK_DEDUCTIONS_EXTRACTION.md`

## Risk

- Overall risk: Medium.
- Why acceptable:
  - moved routes are GET-only and read-only
  - SQL, response shapes, status codes, logging, and auth middleware are preserved
  - mutation routes remain untouched
- Why not low:
  - `GET /admin/rework_cases/:id` is a large schema-aware read path that fans out across multiple tables

## Tests Run

```bash
node --check index.js
node --check server/helpers/adminReworkDeductionsHelpers.js
node --check server/routes/adminDeductionsReadOnly.js
node --check server/routes/adminReworkReadOnly.js
node --check server/routes/pages/index.js
node --check server/routes/serviceZones/index.js
node --check server/routes/catalog/items.js
node --check server/routes/system/index.js
node --check server/routes/users/technicians.js
node --check server/db/pool.js
```

## Manual Smoke Checklist

- App starts.
- Admin rework/deductions read-only pages/API still return the same data.
- `GET /admin/deductions` returns the same list shape.
- `GET /admin/deductions/summary` returns the same summary shape.
- `GET /admin/deductions/audit` returns the same audit shape.
- `GET /admin/rework_cases` returns the same list shape.
- `GET /admin/rework_cases/:id` returns the same detail shape.
- No regression in deduction write actions.
- No regression in rework state transitions.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is not touched.
- Booking, pricing, and customer flow are not touched.

## Rollback Plan

1. Restore the original schema helper block in `index.js`.
2. Restore the original inline handlers for:
   - `GET /admin/deductions`
   - `GET /admin/deductions/summary`
   - `GET /admin/deductions/audit`
   - `GET /admin/rework_cases`
   - `GET /admin/rework_cases/:id`
3. Remove:
   - `server/helpers/adminReworkDeductionsHelpers.js`
   - `server/routes/adminDeductionsReadOnly.js`
   - `server/routes/adminReworkReadOnly.js`
4. Remove the helper/router imports and route mount from `index.js`.
5. Run the syntax checks above and smoke test read-only rework plus existing deduction/rework mutation flows.
