# Phase 3D Next Real Index Reduction

## Current State

- Base branch: `main`
- Starting `index.js` line count after Phase 3C: `24,295`
- Goal for this pass: remove one meaningful, behavior-preserving block without touching writes, auth core, pricing, booking, technician income formula, close-job, customer flow, or accounting mutation.

## Candidates Reviewed

| Candidate | Approximate area | Estimated removable lines | Risk | Decision |
| --- | --- | ---: | --- | --- |
| Documents block: helpers + quote/receipt/eslip routes | `index.js` around old lines `23690-24005` | `~320` | Medium | Selected |
| Admin payout read-only views | old lines `7803-8000` | `~200-230` | Medium-High | Skipped: tightly coupled to payout engine and money display helpers |
| Technician summary/income area | old lines `10313-10640` | `~350+` | High | Skipped: technician income formula adjacency is out of scope |
| Accounting summary/revenue GET routes | old lines `22351-22520` | `~200+` | High | Skipped: accounting/tax domain is frozen for this pass |
| Calendar/readiness read-only cluster | old lines `19784-20414` | `~250+` | Medium-High | Skipped: read-only routes are interleaved with stateful helpers and writes |

## Selected Candidate

### Moved helpers

- `money`
- `getJobDocData`
- `docHtml`
- `eSlipHtml`

### Moved routes

- `GET /docs/quote/:job_id`
- `GET /docs/receipt/:job_id`
- `GET /docs/eslip/:job_id`

### New module

- `server/routes/docs.js`

### Dependencies passed explicitly

- `pool`
- `_accountingOwnerSignaturePublicUrl`
- `_accountingSignaturePublicUrl`
- `_accountingOwnerSignerName`
- `_accountingOwnerSignerPosition`

## Why This Was Safe Enough

- The moved routes are GET-only document rendering routes.
- They do not mutate DB state.
- They do not touch booking, availability, pricing decisions, auth/session behavior, technician income formulas, payout mutations, close-job, customer tracking, uploads, or accounting mutation flows.
- The moved helpers were only used by these document routes.
- The router is mounted at the old document block location, preserving order.

## Preserved Behavior

- Route paths unchanged.
- SQL unchanged.
- HTML rendering logic unchanged.
- `Content-Type` header unchanged.
- `404` responses unchanged for missing jobs.
- `400` response unchanged for invalid e-slip `job_id`.
- `500` response unchanged for e-slip generation failure.
- Existing signature helper behavior remains injected from `index.js`.

## Skipped Areas

- Payout read-only views: payout/money display adjacency.
- Technician income routes: formula-adjacent and explicitly frozen.
- Accounting summary/revenue reads: accounting domain frozen in this pass.
- Calendar/readiness block: mixed with writes and stateful helpers.
- Static page aliases: no longer worth micro-refactor work.

## Before / After

- Before: `24,295` lines
- After: `24,019` lines
- Net reduction: `276` lines

## Tests Run

- `node --check index.js`
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
- `GET /docs/quote/:job_id` renders the same quote HTML.
- `GET /docs/receipt/:job_id` renders the same receipt HTML.
- `GET /docs/eslip/:job_id` renders the same e-slip HTML and same fallback/error responses.
- Admin deductions/rework routes from Phases 3B and 3C still work.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is unchanged.
- Booking, pricing, and customer flow remain unchanged.
- `/login` and `POST /login` still work.
- `/tech` and `/tech.html` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove `createDocumentRoutes` import and mount from `index.js`.
2. Restore `money`, `getJobDocData`, `docHtml`, and `eSlipHtml` in the original document block.
3. Restore the three original inline routes for quote, receipt, and e-slip at the old location.
4. Delete `server/routes/docs.js`.
5. Run the syntax checks above.
6. Smoke-test the three document endpoints plus `/login`, `/tech`, `/service_zones`, and the admin deductions/rework routes.
