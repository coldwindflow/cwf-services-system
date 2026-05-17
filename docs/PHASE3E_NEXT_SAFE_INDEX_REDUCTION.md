# Phase 3E: Next Safe index.js Reduction

## Current State

- Baseline before Phase 3E: `index.js` had `24,019` lines after Phase 3D.
- Phase 3E target: reduce one meaningful block without changing runtime behavior or touching mutation flows.
- Selected risk ceiling: Medium.

## Candidates Reviewed

| Candidate | Approx area | Estimated removable lines | Risk | Decision |
| --- | --- | ---: | --- | --- |
| Accounting read-only views | `index.js:22352-23704` | `300+` | Medium | Selected |
| Admin payout views | `index.js:7804-8016` | `200+` | High | Skipped because `GET /admin/super/payouts` auto-creates payout periods |
| Calendar/readiness block | `index.js:19882-20516` | `500+` | High | Skipped because read routes are tightly coupled with write/upsert helpers |
| Admin dashboard v2 | `index.js:4370-4745` | `370+` | High | Skipped because dashboard GET performs live payout recompute and accept-status expiry work |
| Technician base-status block | `index.js:20936-21234` | `300+` | High | Skipped because read and write routes share the same assessment/calculation seam |

## Selected Extraction

New module:

- `server/routes/accountingReadOnly.js`

Moved routes:

- `GET /admin/accounting/summary`
- `GET /admin/accounting/revenue`
- `GET /admin/accounting/reports/summary`
- `GET /admin/accounting/payouts/:payout_id/techs`
- `GET /admin/accounting/deposits`
- `GET /admin/accounting/audit`

Mount location:

- `index.js` mounts `createAccountingReadOnlyRoutes({...})` at the old accounting read-only seam before `POST /admin/accounting/revenue/:job_id/mark-paid`.

Dependencies passed explicitly:

- `pool`
- `requireAccountingPermission`
- `_accountingSafeQuery`
- `_accountingCard`
- `_accountingRevenueStatus`
- `_accountingStoredPayoutTechRows`
- `_accountingEnrichPayoutTechRows`
- `_accountingPayoutDueDate`
- `_accountingThaiDate`
- `_accountingPayoutCutoffLabel`
- `_accountingWhtMonthKeyFromPeriod`
- `_accountingWhtMonthLabel`
- `_buildPayoutTechSummaryRows`
- `_getPayoutPeriod`
- `_maskPhone`
- `_money`
- `_paidStatus`
- `_sqlDonePredicate`

## Explicitly Skipped

- `GET /admin/accounting/settings`
  - Skipped because `_getAccountingSettings()` calls schema ensure logic.
- `GET /admin/accounting/payouts`
  - Skipped because it calls `_ensureDuePayoutPeriodsBangkok()` and can create payout periods.
- `GET /admin/accounting/reports/:report_key.csv`
  - Skipped because it records a report export audit entry.
- Technician tax profile / withholding certificate routes
  - Skipped because they are tax-adjacent and outside this read-only summary seam.
- Accounting mutation routes
  - Skipped entirely: mark-paid, expenses, documents, payout pay, tax request approval/rejection, withholding certificate creation.

## Before / After

- Before: `24,019` lines
- After: `23,716` lines
- Net reduction: `303` lines

## Risk

- Overall risk: Medium
- Why:
  - Routes are GET-only and preserve existing SQL/response/error behavior.
  - The selected set still touches accounting and payout display data, so manual smoke testing is required.
  - Hidden-write GET routes were intentionally excluded from this phase.

## Tests Run

- `node --check index.js`
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

## Manual Smoke Checklist

- App starts.
- `GET /admin/accounting/summary` returns the same card payload.
- `GET /admin/accounting/revenue` returns the same revenue rows.
- `GET /admin/accounting/reports/summary` returns the same report summary payload.
- `GET /admin/accounting/payouts/:payout_id/techs` returns the same technician payout detail shape.
- `GET /admin/accounting/deposits` returns the same deposit summary and ledger rows.
- `GET /admin/accounting/audit` returns the same audit rows and filters.
- Docs routes from Phase 3D still work.
- Admin deductions/rework routes from Phases 3B and 3C still work.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is not regressed.
- Booking/pricing/customer flow is not regressed.
- `/login` and `POST /login` still work.
- `/tech` and `/tech.html` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove the `createAccountingReadOnlyRoutes` import and mount from `index.js`.
2. Restore the six original inline GET handlers in their prior accounting block positions.
3. Delete `server/routes/accountingReadOnly.js`.
4. Run syntax checks.
5. Smoke test the six accounting routes plus the previously extracted docs and deductions routes.
