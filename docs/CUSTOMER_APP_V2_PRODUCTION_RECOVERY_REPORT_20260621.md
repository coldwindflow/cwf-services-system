# Customer App V2 Production Recovery Report

Date: 2026-06-21  
Branch: `fix/customer-app-v2-production-recovery`  
Base: `origin/main` / `0404f357150477a0b0be7b2fd031e42726c27345`  
Build id: `20260621_production_recovery_v1`

## Scope

This recovery stayed inside the approved Customer App V2 frontend surface, authorized backend public booking routes, focused tests, and docs:

- `index.js`
- `customer-app/index.html`
- `customer-app/manifest.webmanifest`
- `customer-app/sw.js`
- `customer-app/assets/customer-app.css`
- `customer-app/assets/customer-app.js`
- `customer-app/modules/*.js`
- `test/customerAppRecovery.test.js`
- `test/customerAppSavedAddress.test.js`
- `test/customerSlotBoundary.test.js`
- `docs/customer-app-v2-recovery-screenshots/*.json`

No database migrations, `package.json`, or `package-lock.json` were changed.

## Recovery Summary

- Versioned the app shell, manifest, scripts, styles, and service worker with `20260621_production_recovery_v1`.
- Rebuilt service-worker caching to use the versioned shell, bypass public API/data endpoints, and remove stale `cwf-customer-app-v2-*` caches on activation.
- Fixed service-worker registration so it still runs when async app boot finishes after the browser `load` event.
- Restored urgent booking as a distinct route and CTA instead of canonicalizing `#urgent` back to scheduled booking.
- Converted scheduled booking into a five-step flow:
  1. Customer/contact details
  2. Service selection
  3. Backend price preview
  4. Backend availability slot selection
  5. Final review and submit
- Moved slot stale handling back to the date/time step, clearing the stale selected slot before retry.
- Removed technician identity/count display from customer slot and urgent waiting views.
- Tightened mobile header/account-chip layout, including narrow-screen avatar-only fallback for logged-in users.
- Replaced the full home rerender after async data with targeted home data patching to avoid resetting visible state.
- Restored backend `index.js` from the owner-provided `cwf-services-system-main (7).zip` so the public availability and booking routes are present in this branch.
- Hardened `GET /public/availability_v2` and `POST /public/book` around the real customer slot boundary.

## Root Causes Addressed

- Stale production caches could keep old Customer App V2 files alive because the shell and SW assets were not tied to a unique recovery build id.
- The app could miss service-worker registration when boot work completed after `load`.
- The urgent route existed as a user-facing concept but was routed back to scheduled booking.
- Scheduled booking mixed service, pricing, availability, and confirmation in a way that made stale-slot recovery and privacy guarantees fragile.
- Customer-facing slot UI could expose technician details/counts that should remain hidden until backend assignment.
- Public slot availability needed server-side filtering by Admin-visible technicians and Service Matrix eligibility, with the same validation repeated during booking submit.

## Backend Slot Boundary

The backend route implementation was restored from `C:\Users\ADMIN\Downloads\cwf-services-system-main (7).zip` and then patched in the authorized `index.js` route/helper area.

Implemented eligibility rules:

- Customer slots include only technicians with `customer_slot_visible === true`.
- `false`, `null`, missing, or malformed visibility does not pass the customer slot filter.
- Public availability no longer falls back to all technicians when the requested technician type has no matches.
- Admin forced availability keeps the legacy type fallback for Admin scheduling views only.
- Service Matrix matching is strict for job type, AC type, wall wash variant, and repair variant when provided.
- Missing, unreadable, or malformed Service Matrix fails closed for customer slots.
- Customer public availability returns anonymous slot data only: `date`, `duration_min`, `slot_step_min`, and `slots[{ start, end, available }]`.
- Public customer response omits technician IDs, names, usernames, phone numbers, available technician lists, capacity, and counts.

Booking revalidation:

- `POST /public/book` rebuilds eligibility from the submitted service payload rather than trusting technician fields from the client.
- The route re-reads technicians, filters `customer_slot_visible === true`, reloads Service Matrix rows, and requires every requested service line to match.
- Missing or incomplete service criteria is rejected before booking.
- The selected appointment time is rechecked against technician availability and duration.
- Stale, spoofed, hidden-technician, or wrong-service Customer App V2 scheduled slots return `409`.
- Customer-supplied technician username, technician name, candidate list, count, and capacity fields are not read from the booking payload.

## QA Artifacts

Concise JSON browser results are committed under:

- `docs/customer-app-v2-recovery-screenshots/browser-qa-flow-results.json`
- `docs/customer-app-v2-recovery-screenshots/browser-qa-sw-results.json`

Binary browser screenshots were removed from the source branch. Screenshots should be attached to the PR conversation or another review artifact store instead of committed to production source.

Browser QA covered logged-out and logged-in header states, scheduled flow steps 1-5, stale-slot return to step 4, urgent route rendering, tracking route rendering, overflow checks, console errors, service-worker registration, active control, and stale cache removal.

## Automated Verification

- `node --check index.js`
- `node --check customer-app/assets/customer-app.js`
- `node --check customer-app/sw.js`
- `node --check customer-app/modules/*.js`
- `node --check test/customerAppRecovery.test.js`
- `node --check test/customerSlotBoundary.test.js`
- `node --test test/customerAppRecovery.test.js`
- `node --test test/customerSlotBoundary.test.js`
- `npm test`
- `git diff --check`

Final `npm test` result: 62 tests passing.

`git diff --check` passed with line-ending warnings only: Git reported that LF will be replaced by CRLF the next time touched for existing Customer App files.

## Residual Risks

- The restored `index.js` comes from the owner-provided zip because the checked-out branch did not contain the backend public route implementation.
- Live production smoke testing still needs owner-approved safe data or staging because `/public/book` writes real booking records.
- Production deployment should confirm the hosting layer serves `customer-app/sw.js` with JavaScript MIME type and does not strip query strings from versioned asset URLs.
- Production smoke testing should include a real logged-in customer session because local browser QA used mocked public endpoints.
