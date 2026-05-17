# Phase 3F: Next Safe index.js Reduction Audit

## Current State

- Current `main` head checked for this audit: `072bc38157d4ea3b4798648028e1edb96f2dc15b`
- Current `index.js` line count: `25,567`
- Phase 3F goal: find one production-safe extraction block worth at least `200` lines.
- Result: no candidate met both the size target and the requested safety gates, so Phase 3F stops at audit only.

## Top Candidates Reviewed

| Candidate | Approx area | Estimated removable lines | Risk | Decision |
| --- | --- | ---: | --- | --- |
| Admin dashboard v2 | `index.js:4371-4747` | `370+` | High | Skip: the GET handler also expires technician accept statuses and recomputes live technician cost through payout helpers |
| Admin payout read views | `index.js:7805-8016` | `200+` | High | Skip: the surrounding payout block is coupled to payout generation/finalization helpers and contains period auto-create behavior |
| Technician work calendar + readiness | `index.js:19821-20449` | `600+` | High | Skip: read routes share helpers with writes, and `ensureDailyReadinessRow()` inserts/updates rows |
| Technician base-status block | `index.js:20935-21235` | `300+` total, but safe helper-only subset is below `200` | High for the full block / Low for helper-only seam | Skip for now: the full block mixes GET and POST routes; the safe pure-helper subset is too small for the Phase 3F threshold |
| Remaining accounting-adjacent block | `index.js:22305-23352` | `200+` | High | Skip: remaining GET routes are tied to schema ensure, payout auto-create, report audit logging, or tax/withholding/document flows |

## Why No Runtime Extraction Was Opened

The remaining blocks large enough to reduce `index.js` meaningfully all violate at least one Phase 3F safety gate:

- hidden writes inside GET flows
- direct coupling to payout mutation/finalization
- shared helpers used by both read and write routes
- tax/withholding/document behavior outside the allowed scope
- technician state flows that are not yet split into a read-only seam

The only clearly safe subset identified in this pass is the pure helper portion of technician base-status calculation, but it is below the requested `200` line threshold and would repeat the small-PR pattern the project is explicitly trying to leave behind.

## Candidate-Specific Notes

### 1. Admin Dashboard v2

- Includes `GET /admin/dashboard_v2`
- Dependencies include `_buildPayoutLinesForJob`, `_sqlDonePredicate`, `_accounting*` helpers, and `expireTechnicianAcceptStatuses(pool)`
- Not safe for Phase 3F because the route is not a pure read path despite being a GET endpoint

### 2. Admin Payout Read Views

- Includes admin/super payout list and detail GET routes
- Surrounding block is interleaved with generation, reconciliation, lock, pay, delete, and adjustment actions
- Not safe while payout mutation/finalization remains explicitly frozen

### 3. Technician Work Calendar + Daily Readiness

- Includes work-calendar/readiness GET routes plus shared helpers
- Read helpers are coupled to:
  - `upsertCalendarDay(...)`
  - `ensureDailyReadinessRow(...)`
  - route-level writes in adjacent `PUT`/`POST` handlers
- `ensureDailyReadinessRow(...)` performs `INSERT ... ON CONFLICT DO UPDATE`
- Not safe until a deliberate read-only seam is designed

### 4. Technician Base Status

- Full block includes both GET and POST routes plus shared calculation helpers
- Pure helpers such as `calculateTechnicianBaseStatus()` and `buildTechnicianCharacterPrompt()` are moveable in principle
- However, moving only the helper seam would remove less than `200` lines from `index.js`, so it does not satisfy the current phase objective

### 5. Remaining Accounting-Adjacent Routes

- Explicitly skipped:
  - `GET /admin/accounting/settings`
  - `GET /admin/accounting/payouts`
  - report CSV export
  - tax profile / withholding certificate / document print routes
- Reasons include schema ensure, auto-create behavior, audit writes, and tax/document scope restrictions

## Runtime Scope

- Runtime code changed in Phase 3F: **none**
- New route modules created: **none**
- Existing route modules changed: **none**
- This phase is documentation/audit only.

## Recommended Next Step

Before the next runtime extraction, first create a dedicated prep/audit phase for one of these seams:

1. **Technician base-status helper seam**
   - Extract only pure functions into a helper module
   - Keep all GET/POST routes in place initially
   - Use it as groundwork for a later larger route move
2. **Technician work-calendar read/write separation**
   - Map which helpers are truly pure/read-only
   - Identify whether GET routes can be separated without carrying `ensureDailyReadinessRow()` side effects

Neither should be moved blindly in the same PR without a fresh focused audit.

## Required Verification for Future Backend Refactors

Syntax checks alone are not sufficient. Every future backend extraction PR must include:

- `node --check` on all changed runtime files
- runtime startup smoke, such as `timeout 5s node index.js` or an equivalent 5-second boot check
- confirmation that all new route factory imports are present and names match their exports exactly

## Manual Smoke Checklist for Future Selected Block

- App starts.
- Every moved route/function behaves exactly as before.
- Accounting read-only routes from Phase 3E still work.
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

No runtime code changed in Phase 3F, so no rollback is required for this audit-only phase.
