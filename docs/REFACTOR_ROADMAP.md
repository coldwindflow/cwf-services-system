# CWF Refactor Roadmap

This roadmap prepares CWF for safer modularization. It intentionally starts with documentation and folder boundaries only.

## Goal

Make the repository easier for humans and Codex to read before extracting routes from the very large `index.js`.

## Non-Goals For Phase 0

- Do not move business logic.
- Do not rewrite `index.js`.
- Do not remove routes from `index.js`.
- Do not change runtime behavior.
- Do not change DB queries.
- Do not introduce a new framework.
- Do not import new route modules into production.

## Phase 0: Documentation And Folder Boundaries

Status: this patch.

Deliverables:

- Architecture audit.
- Index split plan.
- AI editing guide.
- Future folder README boundaries.
- No runtime code changes.

Validation:

- `node --check index.js`
- Confirm `index.js`, `app.js`, `tech.html`, and `sw.js` runtime logic were not modified by this patch.

## Phase 1: Health And Version Routes

Candidate routes:

- `/api/version`
- Pure health checks with no DB writes.

Requirements:

- Use a route factory module.
- Keep route path and response shape unchanged.
- Pass dependencies explicitly.
- Delete the old route from `index.js` only after checks pass.

Manual checks:

- App starts.
- `/api/version` response is unchanged.
- Login page still loads.

## Phase 2: Read-Only Technician Routes

Candidate scope:

- Read-only technician display routes with no DB writes.
- Avoid close job, photos, evidence, payout, income calculation writes, and work calendar writes.

Requirements:

- Confirm middleware behavior.
- Confirm response shape.
- Confirm frontend tabs still load.

Manual checks:

- Login works.
- Technician page loads.
- Current job, history, and income tabs load.

## Phase 3: Technician Income Display

Candidate scope:

- Technician income display routes that already rely on existing modules:
  - `server/technicianIncome.js`
  - `server/technicianJobIncomeDisplay.js`
  - `server/technicianJobMoneySummary.js`

Do not touch:

- payout generation
- payout locking
- payout payment
- withdrawal requests
- accounting settlement

Manual checks:

- Technician income tabs match current output.
- Admin/super income previews still match current output.
- Payout screens are unchanged.

## Phase 4: job_units, Photos, And Evidence

Candidate scope:

- Job unit helper functions.
- Evidence metadata helpers.
- Upload wrappers only after dedicated tests.

Requirements:

- Dedicated tests or a precise manual test script.
- Verify Cloudinary and local fallback behavior.
- Verify close-job validation before and after.

Manual checks:

- Upload photo.
- Add/check unit evidence.
- Close job with required evidence.
- Re-open job details and confirm evidence persists.

## Phase 5: Admin Job Routes

Candidate scope:

- Admin job read/edit routes only after full route map.

Frozen until then:

- `/admin/book_v2`
- `/admin/job_v2` edit logic
- admin assignment and dispatch logic
- warranty/rework/return flows

Manual checks:

- Admin add job still works.
- Admin edit job still works.
- Admin schedule still works.
- Technician assignment still works.
- Public tracking reflects correct job state.

## Global Regression Checklist

Use this checklist for every future extraction phase:

- App starts with `node index.js`.
- Login works.
- Technician page loads.
- Technician current/history/income tabs load.
- Admin add job still works.
- Public booking still works.
- Close job still works.
- PWA cache refreshed if frontend JS changed.
