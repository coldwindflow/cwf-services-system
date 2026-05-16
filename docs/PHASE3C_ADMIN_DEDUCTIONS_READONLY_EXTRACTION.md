# Phase 3C Admin Deductions Read-Only Extraction

Date: 2026-05-16

## Scope

Continue the Phase 3B seam by moving the remaining admin deductions GET-only routes out of `index.js` without changing mutation or state-transition behavior.

## Candidate Audit

| Route | Dependencies | Response Shape | Risk | Decision |
| --- | --- | --- | --- | --- |
| `GET /admin/deductions/technician_search` | `pool`, `requireAdminSession`, schema helpers | `{ ok, rows, schema_mode }` | Medium | Move |
| `GET /admin/deductions/job_search` | `pool`, `requireAdminSession`, schema helpers | `{ ok, rows, schema_mode }` | Medium | Move |
| `GET /admin/deductions/warranty_jobs` | `pool`, `requireAdminSession`, schema helpers | `{ ok, rows, row_count, source_filters_used, schema_mode, fallback_mode, note }` | Medium | Move |
| `GET /admin/deductions/suggestions` | `pool`, `requireAdminSession` | `{ ok, rows, skipped_detections }` | Medium | Move |
| `GET /admin/deductions/:id` | `pool`, `requireAdminSession`, `PAYOUT_DEDUCTION_WARNING` | `{ ok, row, job, audit_logs, message }` | Low-Medium | Move |

All five candidates are read-only GET routes. None performs DB writes, state transitions, or payout/payment mutations.

## Routes Moved

Moved into `server/routes/adminDeductionsReadOnly.js`:

- `GET /admin/deductions/technician_search`
- `GET /admin/deductions/job_search`
- `GET /admin/deductions/warranty_jobs`
- `GET /admin/deductions/suggestions`
- `GET /admin/deductions/:id`

The module now receives the existing helper seam from `server/helpers/adminReworkDeductionsHelpers.js` through dependency injection:

- `getDeductionTableMeta`
- `dHas`
- `dTextCol`
- `dSearchParts`

## Skipped Risky Subset

Still intentionally inline in `index.js`:

- `POST /admin/deductions`
- `PATCH /admin/deductions/:id`
- submit / approve / reject / void routes
- `transitionDeductionCase`
- payout/payment mutation
- technician income formula
- accounting / tax / VAT
- close-job flow
- booking / pricing / customer flow

## Before / After

- `index.js` before Phase 3C: 24,671 lines
- `index.js` after Phase 3C: 24,295 lines
- Net reduction: 376 lines
- Additional moved route count: 5

## Files Changed

- `index.js`
- `server/routes/adminDeductionsReadOnly.js`
- `docs/INDEX_JS_SPLIT_PLAN.md`
- `docs/PHASE3C_ADMIN_DEDUCTIONS_READONLY_EXTRACTION.md`

## Risk

- Overall risk: Medium.
- Why acceptable:
  - all moved handlers are GET-only
  - SQL, route paths, response shapes, status codes, auth middleware, logging, and route order are preserved
  - specific routes remain before `GET /admin/deductions/:id`
- Why not low:
  - several routes are long schema-aware read paths with multiple fallback branches and table joins

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
git diff --check
```

## Manual Smoke Checklist

- App starts.
- `GET /admin/deductions/technician_search` returns the same data.
- `GET /admin/deductions/job_search` returns the same data.
- `GET /admin/deductions/warranty_jobs` returns the same data.
- `GET /admin/deductions/suggestions` returns the same data.
- `GET /admin/deductions/:id` returns the same data.
- Existing Phase 3B read-only routes still work.
- Deduction write actions still work.
- Approval / reject / void / finalize flows still work.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is not touched.
- Booking, pricing, and customer flow are not touched.

## Rollback Plan

1. Restore the five inline GET handlers in `index.js` at their original location.
2. Remove the five Phase 3C handlers from `server/routes/adminDeductionsReadOnly.js`.
3. Remove the additional helper dependencies passed into `createAdminDeductionsReadOnlyRoutes(...)` if no longer needed there.
4. Run the syntax checks above.
5. Smoke test all moved deduction GET routes plus the existing deduction write/state flows.
