# Phase 3I: Technician Base Status POST Audit

## Current State

- Baseline after Phase 3H:
  - physical lines: `25,354`
  - non-empty lines: `23,517`
- Existing seams:
  - `server/helpers/technicianBaseStatusDataHelpers.js`
  - `server/routes/technicianBaseStatusReadOnly.js`
  - `server/helpers/technicianBaseStatusScoring.js`
- Remaining inline write routes:
  - `POST /admin/api/technicians/:username/base-status`
  - `POST /tech/api/base-status`

## POST Route Inventory

| Route | Middleware / identity | Validation | Write behavior | Response | Risk |
| --- | --- | --- | --- | --- | --- |
| `POST /admin/api/technicians/:username/base-status` | `requireAdminSession`; technician lookup by `req.params.username`; assessor identity from `req.actor?.username || req.auth?.username || 'admin'` | `answers` must be an object and not an array; invalid input falls back to `{}` | Inserts one verified admin assessment row into `public.technician_base_status_assessments` | success `{ ok: true, technician, assessment }`; 404 `{ error: "ไม่พบช่าง" }`; 500 `{ error: "บันทึก Base Status ไม่สำเร็จ" }` | Medium |
| `POST /tech/api/base-status` | `requireTechnicianSession`; technician identity from `req.auth?.username || req.effective?.username` | `answers` must be an object and not an array; invalid input falls back to `{}` | Mutates `answers` with self-assessment metadata, then inserts one pending-review row into `public.technician_base_status_assessments` | success `{ ok: true, technician, assessment, pending_review: true }`; 404 `{ error: "ไม่พบข้อมูลช่างของคุณ" }`; 500 `{ error: "ส่งแบบประเมินไม่สำเร็จ" }` | Medium |

## Dependencies If Extracted Later

Required injections for a future `server/routes/technicianBaseStatusWrite.js`:

- `pool`
- `requireAdminSession`
- `requireTechnicianSession`
- `getTechnicianForStatus`
- `calculateTechnicianBaseStatus`

The routes do **not** currently use:

- `getLatestBaseStatus`
- readiness helpers
- work-calendar helpers
- technician income helpers
- close-job helpers

## Exact Behavior Notes

### Admin POST

- Reads username from `req.params.username`
- Loads technician with `getTechnicianForStatus(username)`
- Computes score with `calculateTechnicianBaseStatus(answers, technician)`
- Uses admin actor fallback order exactly:
  - `req.actor?.username`
  - `req.auth?.username`
  - `'admin'`
- Inserts:
  - `assessment_source = 'admin'`
  - `review_status = 'verified'`
  - `reviewed_by = assessedBy`
  - `reviewed_at = NOW()`
- Logs `POST base-status error:` on failure

### Technician Self POST

- Reads username from `req.auth?.username || req.effective?.username`
- Loads technician with `getTechnicianForStatus(username)`
- Mutates the same `answers` object before scoring:
  - `__self_assessment = true`
  - `__submitted_by = username`
  - `__submitted_at = new Date().toISOString()`
- Inserts:
  - `assessment_source = 'self'`
  - `review_status = 'pending_review'`
- Returns `pending_review: true`
- Logs `POST tech self base-status error:` on failure

## Risk Assessment

Overall risk: **Medium**

Why this is not Low:

- Both routes write production data.
- The technician self route depends on the exact identity fallback order between `req.auth` and `req.effective`.
- The self route mutates the submitted `answers` object before scoring and persistence.
- A future extraction must preserve SQL text, JSON serialization order, error strings, and middleware order exactly.

Why this is still a viable future extraction candidate:

- Read-only data helpers and scoring helpers are already separated.
- Both POST routes are localized and do not call unrelated business flows.
- Their dependency surface is now small and explicit.
- They can move together as one route module without splitting behavior across multiple files.

## Selected Action

**Audit only in Phase 3I.**

Do not move the POST routes in this phase. The current seams are sufficient to make a future move practical, but the routes are write paths and deserve one dedicated extraction PR with focused request/response comparison.

## Conditions Before A Future Move

Before extracting these POST routes:

1. Add a dedicated route-map/extraction doc or checklist for the two POST handlers.
2. Capture before/after request examples for:
   - valid admin submission
   - missing technician
   - valid technician self submission
   - invalid `answers` payload fallback
3. Confirm exact persistence fields for both insert statements.
4. Preserve `req.actor`, `req.auth`, and `req.effective` behavior exactly.
5. Run startup smoke plus manual write-path smoke after extraction.

## Proposed Future Move

- Target module:
  - `server/routes/technicianBaseStatusWrite.js`
- Future line reduction estimate:
  - about `75-85` physical lines from `index.js`
- Expected mount dependencies:
  - `pool`
  - `requireAdminSession`
  - `requireTechnicianSession`
  - `getTechnicianForStatus`
  - `calculateTechnicianBaseStatus`

## Rollback Plan For A Future Extraction

1. Remove the write-router import and mount from `index.js`.
2. Restore the two inline POST handlers at their original location.
3. Delete `server/routes/technicianBaseStatusWrite.js`.
4. Run syntax checks, startup smoke, and manual POST route tests.

