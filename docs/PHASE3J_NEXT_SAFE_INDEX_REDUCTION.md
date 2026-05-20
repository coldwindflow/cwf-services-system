# Phase 3J: Technician Calendar Read-Only Extraction

## Current State

- Baseline after Phase 3I:
  - physical lines: `25,441`
  - non-empty lines: `23,603`
- Goal: find the next useful read-only/helper seam after base-status, without touching POST base-status routes or business-critical flows.

## Candidates Reviewed

| Candidate | Approx lines | Estimated removable lines | Risk | Decision |
| --- | ---: | ---: | --- | --- |
| Technician calendar/readiness read-only subset | `20268-20584` | `170-200` | Medium | Selected |
| Admin dashboard v2 | `4377-4753` | `350+` | High | Skipped because the GET route calls live payout-cost helpers and `expireTechnicianAcceptStatuses`, so it is not a simple read-only seam |
| Partner onboarding read-only routes | `3112-4260` mixed | `300+` | Medium-High | Skipped because GET routes are interleaved with partner application, academy, certification, agreement, and trial state workflows |
| Accounting report CSV route | `23201-23618` | `400+` | High | Skipped because CSV/report behavior is accounting/tax-adjacent and must preserve reporting side effects and audit expectations |
| Media retention read-only summary/jobs | `19193-19250` | `<100` | Medium | Skipped because the useful read-only subset is too small and adjacent to purge/delete behavior |

## Selected Routes Moved

Moved to:

- `server/routes/technicianCalendarReadOnly.js`

Routes:

- `GET /tech/work-calendar`
- `GET /admin/technician-readiness/today`
- `GET /admin/technicians/work-readiness`

Helper:

- `_adminReadinessServiceLabels`

## Routes Explicitly Skipped

- `GET /tech/daily-readiness/today`
  - calls `ensureDailyReadinessRow(username)`, so it may create/update readiness state and is not pure read-only.
- `POST /tech/daily-readiness`
- `PUT /tech/work-calendar/day`
- `PUT /tech/work-calendar/bulk`
- all admin technician calendar write/update routes
- both base-status POST routes
- technician income, close-job, booking, pricing, customer flow, auth/session, LINE, payout/payment, accounting/tax/VAT, file upload/photo/evidence mutation routes

## Dependencies

The new route factory receives explicit dependencies from `index.js`:

- `pool`
- `requireTechnicianSession`
- `requireAdminSession`
- `toIsoDate`
- `firstDayOfMonthIso`
- `endDayOfMonthIso`
- `isStrictIsoDate`

## Behavior Preservation

The extraction preserves:

- route paths
- middleware
- SQL
- query parameter behavior
- response shape
- status codes
- error strings
- console logging
- calendar/readiness helper behavior

## Before / After

- Before:
  - physical lines: `25,441`
  - non-empty lines: `23,603`
- After:
  - physical lines: `25,260`
  - non-empty lines: `23,430`
- Reduction:
  - physical lines: `181`
  - non-empty lines: `173`

## Risk

- Overall risk: Medium
- Why:
  - all moved routes are GET routes and do not perform DB writes
  - they are still technician-facing/admin-readiness routes, so manual smoke is required
  - the mutating readiness/work-calendar endpoints remain in `index.js`

## Tests Run

- `node --check index.js`
- `node --check server/routes/technicianCalendarReadOnly.js`
- `node --check server/helpers/technicianBaseStatusScoring.js`
- `node --check server/helpers/technicianBaseStatusDataHelpers.js`
- `node --check server/routes/technicianBaseStatusReadOnly.js`
- `node --check server/routes/accountingReadOnly.js`
- `node --check server/routes/docs.js`
- `node --check server/helpers/adminReworkDeductionsHelpers.js`
- `node --check server/routes/adminDeductionsReadOnly.js`
- `node --check server/routes/adminReworkReadOnly.js`
- `node --check server/routes/pages/index.js`
- `node --check server/routes/serviceZones/index.js`
- `node --check server/routes/catalog/items.js`
- `node --check server/routes/system/index.js`
- `node --check server/routes/users/technicians.js`
- `node --check server/db/pool.js`
- `git diff --check`
- 5-second startup smoke

## Manual Smoke Checklist

- App starts.
- `GET /tech/work-calendar` returns the same shape.
- `GET /admin/technician-readiness/today` returns the same shape.
- `GET /admin/technicians/work-readiness` returns the same shape.
- `GET /tech/daily-readiness/today` still works as before.
- `POST /tech/daily-readiness` still writes as before.
- `PUT /tech/work-calendar/day` still writes as before.
- `PUT /tech/work-calendar/bulk` still writes as before.
- base-status GET routes still work.
- base-status POST routes still work.
- scoring output does not change.
- accounting read-only routes still work.
- docs routes still work.
- admin deductions/rework routes still work.
- technician job page still loads.
- technician income page still loads.
- close-job flow is not regressed.
- booking/pricing/customer flow is not regressed.
- `/login` and `POST /login` still work.
- `/tech` and `/tech.html` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove `createTechnicianCalendarReadOnlyRoutes` import and mount from `index.js`.
2. Restore the original inline handlers/helper in their old location:
   - `GET /tech/work-calendar`
   - `GET /admin/technician-readiness/today`
   - `_adminReadinessServiceLabels`
   - `GET /admin/technicians/work-readiness`
3. Delete `server/routes/technicianCalendarReadOnly.js`.
4. Run syntax checks, startup smoke, and the manual smoke checklist.

