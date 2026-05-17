# Phase 3G: Technician Base Status Prep

## Current State

- Baseline head: `072bc38157d4ea3b4798648028e1edb96f2dc15b`
- `index.js` before Phase 3G:
  - physical lines: `25,567`
  - non-empty lines: `23,717`
- Goal: create a safe seam inside the mixed technician base-status block without touching write routes or changing technician identity/auth behavior.

## Block Inventory

### Pure Helper Functions Kept In Place For Now

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

These remain in `index.js` because they are shared by the write routes still frozen for now.

### Read-Only Data Helpers Moved

- `getTechnicianForStatus`
- `getLatestBaseStatus`

New location:

- `server/helpers/technicianBaseStatusDataHelpers.js`

These helpers only read from the database and now form an explicit dependency seam that can be reused by both the retained write routes and the extracted read-only routes.

### GET Read-Only Routes Moved

- `GET /admin/api/team-status`
- `GET /admin/api/technicians/:username/base-status`
- `GET /admin/api/technicians/:username/status`
- `GET /tech/api/base-status`

New location:

- `server/routes/technicianBaseStatusReadOnly.js`

Mount location:

- `index.js` mounts `createTechnicianBaseStatusReadOnlyRoutes({...})` immediately after the existing team-status page aliases and before the retained write routes.

### Routes Kept In `index.js`

- `POST /admin/api/technicians/:username/base-status`
- `POST /tech/api/base-status`
- `GET /admin/team-status`
- `GET /admin/team-status.html`
- `GET /admin-team-status.html`
- `GET /tech/base-status`
- `GET /tech/base-status.html`

These stay in place because the POST routes write assessments, and the page aliases are not needed to create the read-only seam.

## Why This Prep Seam Matters

This phase reduces less than the normal target:

- physical reduction: `99` lines
- non-empty reduction: `94` lines

That is intentionally smaller than the usual threshold, but it is still useful rather than cosmetic:

1. It separates the read-only API surface from the POST/write surface.
2. It moves the shared read-only database helpers behind an explicit dependency seam.
3. It makes a later extraction of the remaining POST routes easier to review because the future diff can focus on write behavior only.
4. It avoids moving the pure scoring helpers prematurely while they are still shared by the retained write routes.

## Behavior Preservation

- Route paths unchanged
- Middleware unchanged
- SQL unchanged
- Response shapes unchanged
- Status codes unchanged
- Error bodies unchanged
- `req.auth` / `req.effective` identity source unchanged
- No frontend, booking, pricing, close-job, readiness, or work-calendar code changed

## Before / After

- Before:
  - physical lines: `25,567`
  - non-empty lines: `23,717`
- After:
  - physical lines: `25,468`
  - non-empty lines: `23,623`

## Risk

- Overall risk: Medium-Low
- Why:
  - only GET read-only routes moved
  - database helpers are read-only
  - existing POST/write flows remain in place
  - the main review point is confirming the new factory import/mount and response parity

## Tests Run

- `node --check index.js`
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
- runtime startup smoke with 5-second `node index.js` boot window

## Manual Smoke Checklist

- App starts.
- `/tech` and `/tech.html` still load.
- `GET /admin/api/team-status` returns the same payload.
- `GET /admin/api/technicians/:username/base-status` returns the same payload.
- `GET /admin/api/technicians/:username/status` returns the same payload.
- `GET /tech/api/base-status` returns the same payload.
- `POST /admin/api/technicians/:username/base-status` still writes the same way.
- `POST /tech/api/base-status` still writes the same way.
- Readiness behavior does not change.
- Work-calendar behavior does not change.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is not regressed.
- Booking/pricing/customer flow is not regressed.
- `/login` and `POST /login` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove the `createTechnicianBaseStatusDataHelpers` and `createTechnicianBaseStatusReadOnlyRoutes` imports from `index.js`.
2. Restore `getTechnicianForStatus` and `getLatestBaseStatus` inline in `index.js`.
3. Restore the four original inline GET handlers at their previous locations.
4. Remove the read-only router mount.
5. Delete:
   - `server/helpers/technicianBaseStatusDataHelpers.js`
   - `server/routes/technicianBaseStatusReadOnly.js`
6. Run syntax checks, startup smoke, and the base-status manual smoke checklist.
