# Phase 3L: Technician Count Summary Read-Only Extraction

## Summary

Phase 3L extracted the two technician count summary endpoints from `index.js` into a dedicated read-only route module:

- `GET /tech/completed_count_summary`
- `GET /tech/rework_count_summary`

The change is intentionally small because these routes sit directly above the technician income route block. The extraction keeps the technician income formula, close-job flow, job mutation routes, auth/session core, frontend files, booking, pricing, and customer flows untouched.

## Audit Result

Both candidate routes are GET-only and query-only:

- No DB writes.
- No status transition.
- No payout or income calculation formula changes.
- No close-job or job mutation behavior.
- No frontend file changes.
- Existing PWA/webview fallback through `?username` is preserved.

Risk is **Medium** because the routes use technician identity fallback behavior:

1. First try `getAuthContext(req, res)`.
2. If the effective user is a technician, use `ctx.effective.username`.
3. If no authenticated technician is available, allow `?username=` only after validating that username exists in `public.technician_profiles`.

## New Module

Target module:

- `server/routes/technicianCountSummaryReadOnly.js`

Factory:

```js
module.exports = function createTechnicianCountSummaryReadOnlyRoutes(deps = {}) {
  // ...
};
```

Dependencies are passed explicitly from `index.js`:

- `pool`
- `getAuthContext`
- `isTechnicianRole`
- `_bkkNow`
- `_bkkYmd`
- `_bangkokMidnightUTC`
- `_sqlDonePredicate`

## Mount Location

The router is mounted at the original location immediately before:

- `GET /tech/income_summary`

This preserves route order and keeps the extracted summary routes outside the technician income route block.

## Behavior Preserved

`GET /tech/completed_count_summary` preserves:

- SQL text and parameters.
- Bangkok month boundary calculation.
- `finished_at_distinct_jobs` source.
- `401 { ok:false, error:'UNAUTHORIZED' }` when no session and no `?username`.
- `403 { ok:false, error:'FORBIDDEN' }` when fallback username is not a technician profile.
- `500 { ok:false, error:'COMPLETED_COUNT_SUMMARY_FAILED' }`.

`GET /tech/rework_count_summary` preserves:

- `technician_rework_cases` table existence check.
- Missing-table fallback response:
  - `{ ok:true, username, month, month_rework_cases:0, source:'technician_rework_cases_missing' }`
- SQL text and parameters.
- `technician_rework_cases_created_at` source.
- `401`, `403`, and `500` error behavior.

## Line Count

Before Phase 3L:

- `index.js` physical lines: `25,260`
- `index.js` non-empty lines: `23,430`

After Phase 3L:

- `index.js` physical lines: `25,149`
- `index.js` non-empty lines: `23,330`

Reduction:

- `111` physical lines
- `100` non-empty lines

## Routes Skipped

Skipped:

- `GET /tech/income_summary`
- `GET /tech/income_today_month`
- `GET /tech/income_next_period_estimate`
- all other technician income routes

Reason:

- These routes touch technician income calculation/display behavior and are frozen unless a dedicated income-display extraction is requested.

## Tests

Required checks:

- `node --check index.js`
- `node --check server/routes/technicianCountSummaryReadOnly.js`
- `node --check` on all existing route/helper modules
- `git diff --check`
- startup smoke with `node index.js` for 5 seconds

## Manual Smoke Checklist

- App starts.
- `GET /tech/completed_count_summary` returns the same shape as before.
- `GET /tech/rework_count_summary` returns the same shape as before.
- Test normal cookie/session technician flow.
- Test `?username=` fallback behavior.
- Technician job page still loads.
- Technician income page still loads.
- Close-job flow is not regressed.
- Booking/pricing/customer flow is not regressed.
- `/login` and `POST /login` still work.
- `/tech` and `/tech.html` still work.
- `/service_zones` and `POST /service_zones/detect` still work.

## Rollback Plan

1. Remove the `createTechnicianCountSummaryReadOnlyRoutes` require from `index.js`.
2. Remove the `app.use(createTechnicianCountSummaryReadOnlyRoutes(...))` mount from `index.js`.
3. Restore the two inline handlers in `index.js` at the original location before `GET /tech/income_summary`.
4. Delete `server/routes/technicianCountSummaryReadOnly.js`.
5. Run `node --check index.js`.
6. Run startup smoke.
7. Smoke test both count summary endpoints with session and `?username`.
