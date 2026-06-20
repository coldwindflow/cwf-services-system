# Customer App V2 Production Recovery Report

Date: 2026-06-21  
Branch: `fix/customer-app-v2-production-recovery`  
Base: `origin/main` / `0404f357150477a0b0be7b2fd031e42726c27345`  
Build id: `20260621_production_recovery_v1`

## Scope

This recovery stayed inside the approved Customer App V2 frontend surface, focused tests, and docs:

- `customer-app/index.html`
- `customer-app/manifest.webmanifest`
- `customer-app/sw.js`
- `customer-app/assets/customer-app.css`
- `customer-app/assets/customer-app.js`
- `customer-app/modules/*.js`
- `test/customerAppRecovery.test.js`
- `test/customerAppSavedAddress.test.js`
- `docs/customer-app-v2-recovery-screenshots/*`

No backend code, migrations, `package.json`, or `package-lock.json` were changed.

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

## Root Causes Addressed

- Stale production caches could keep old Customer App V2 files alive because the shell and SW assets were not tied to a unique recovery build id.
- The app could miss service-worker registration when boot work completed after `load`.
- The urgent route existed as a user-facing concept but was routed back to scheduled booking.
- Scheduled booking mixed service, pricing, availability, and confirmation in a way that made stale-slot recovery and privacy guarantees fragile.
- Customer-facing slot UI could expose technician details/counts that should remain hidden until backend assignment.

## Backend Scope Mismatch

The current frontend-only scope can hide technician information and counts from the Customer App UI, and tests now lock that behavior. Full guarantees that `/public/availability_v2` returns only eligible anonymous slots, and that `/public/book` rejects spoofed or stale technician/slot selections, require backend handler enforcement. Those backend modules were not changed because the recovery request restricted backend edits unless explicitly approved.

## QA Artifacts

Screenshots and JSON browser results are committed under:

- `docs/customer-app-v2-recovery-screenshots/home-320.png`
- `docs/customer-app-v2-recovery-screenshots/home-360.png`
- `docs/customer-app-v2-recovery-screenshots/home-390.png`
- `docs/customer-app-v2-recovery-screenshots/home-430.png`
- `docs/customer-app-v2-recovery-screenshots/home-desktop.png`
- `docs/customer-app-v2-recovery-screenshots/logged-in-header.png`
- `docs/customer-app-v2-recovery-screenshots/logged-in-account.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-step-1-customer.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-step-2-service.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-step-3-price.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-step-4-slots.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-step-5-review.png`
- `docs/customer-app-v2-recovery-screenshots/scheduled-stale-slot-return.png`
- `docs/customer-app-v2-recovery-screenshots/urgent-request-page.png`
- `docs/customer-app-v2-recovery-screenshots/tracking-route.png`
- `docs/customer-app-v2-recovery-screenshots/service-worker-refresh.png`
- `docs/customer-app-v2-recovery-screenshots/browser-qa-flow-results.json`
- `docs/customer-app-v2-recovery-screenshots/browser-qa-sw-results.json`

Browser QA covered logged-out and logged-in header states, scheduled flow steps 1-5, stale-slot return to step 4, urgent route rendering, tracking route rendering, overflow checks, console errors, service-worker registration, active control, and stale cache removal.

## Automated Verification

- `node --check customer-app/assets/customer-app.js`
- `node --check customer-app/sw.js`
- `node --check customer-app/modules/*.js`
- `node --check test/customerAppRecovery.test.js`
- `node --test test/customerAppRecovery.test.js`
- `npm test`
- `git diff --check`

Final `npm test` result: 62 tests passing.

`git diff --check` passed with line-ending warnings only: Git reported that LF will be replaced by CRLF the next time touched for existing Customer App files.

## Residual Risks

- Backend eligibility/rejection guarantees still need backend review if the API currently returns technician identity/counts or accepts spoofed slot payloads.
- Production deployment should confirm the hosting layer serves `customer-app/sw.js` with JavaScript MIME type and does not strip query strings from versioned asset URLs.
- Production smoke testing should include a real logged-in customer session because local browser QA used mocked public endpoints.
