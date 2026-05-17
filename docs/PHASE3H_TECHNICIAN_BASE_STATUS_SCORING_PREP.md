# Phase 3H: Technician Base Status Scoring Prep

## Current State

- Baseline after Phase 3G:
  - physical lines: `25,468`
  - non-empty lines: `23,619`
- Goal: move the remaining pure scoring seam without touching POST/write behavior.

## Inventory

### Pure Helpers Moved

- `clamp100`
- `avgNums`
- `score100`
- `pickEvidence`
- `selectedCaps`
- `rankFromAverage`
- `expSkill`
- `optionScore`
- `capLabels`
- `calculateTechnicianBaseStatus`
- `buildTechnicianCharacterPrompt`
- `TECH_BASE_STATUS_CAPS`

New location:

- `server/helpers/technicianBaseStatusScoring.js`

### POST Routes Kept In Place

- `POST /admin/api/technicians/:username/base-status`
- `POST /tech/api/base-status`

These remain in `index.js` and now import the same scoring function from the new helper module.

## Why The Move Is Safe

- No moved helper touches DB, `req`, `res`, filesystem, network, or mutable shared state.
- Both POST routes keep:
  - identical payload validation
  - identical identity source
  - identical DB writes
  - identical response shape and error handling
- The only runtime dependency change is where `calculateTechnicianBaseStatus` is imported from.

## Output Parity Check

A temporary compare script evaluated the old inline helper block from `main:index.js` against the new module with three representative sample inputs.

- compare case 1: `true`
- compare case 2: `true`
- compare case 3: `true`

No temporary file was committed.

## Before / After

- Before:
  - physical lines: `25,468`
  - non-empty lines: `23,619`
- After:
  - physical lines: `25,354`
  - non-empty lines: `23,517`

## Risk

- Overall risk: Low
- Why:
  - pure helper extraction only
  - exact output parity spot-checked
  - POST/write routes remain in place

## Tests Run

- `node --check index.js`
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
- GET base-status routes from Phase 3G still work.
- `POST /admin/api/technicians/:username/base-status` still writes the same way.
- `POST /tech/api/base-status` still writes the same way.
- scoring, rank, and prompt output remain unchanged.
- readiness/work-calendar behavior does not change.
- technician job page still loads.
- technician income page still loads.
- close-job flow is not regressed.
- booking/pricing/customer flow is not regressed.
- `/login` and `POST /login` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove the scoring helper import from `index.js`.
2. Restore the original inline scoring helper block in `index.js`.
3. Delete `server/helpers/technicianBaseStatusScoring.js`.
4. Run the parity compare again, syntax checks, startup smoke, and the manual smoke checklist.
