# Customer App V2 Runtime Completion Report

Branch: `fix/customer-app-v2-production-runtime`  
Base: latest `origin/main` after PR #68 merge

## Scope

- Restored the Customer App V2 runtime flow on top of the recovered backend slot boundary.
- Converted scheduled booking from the previous 5-step runtime to the required 6-step gated wizard:
  service, AC details, customer/jobsite, real date/time slots, price/terms, review/confirm.
- Hardened Home service actions with delegated routing so async home data, auth refresh, and service-worker refresh do not detach the booking CTA.
- Reworked logged-in profile/account rendering so login/guest controls disappear after login and the profile shows account summary, service address, and logout.
- Bumped the Customer App build id to `20260621_production_runtime_v1`.

## Root Cause

- Home CTA handlers were bound directly to the rendered buttons. Async patching could replace or refresh parts of the home surface without a durable action path.
- The scheduled booking runtime still rendered a 5-step flow and mixed customer details, service details, pricing, slots, and final review in the wrong order.
- The logged-in profile reused the auth/login panel, which made account UI feel duplicated and left the header chip vulnerable to long-label overflow.

## Slot Boundary

- The frontend continues to use `/public/availability_v2` for real public availability and `/public/book` for submit revalidation.
- No fake/default slots are generated in the Customer App.
- Selected slots are cleared when service, pricing, or date changes, and submit revalidates the selected slot before booking.

## Scope Mismatch / Not Changed

- `CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md` was not present in the repo.
- No migration, payment flow, production deployment, or auth backend behavior was changed.
- Multi-location saved addresses were not implemented because they require schema/backend work beyond this runtime completion.

## Validation

- `node --check customer-app/modules/bookingScheduled.js`
- `node --check customer-app/modules/state.js`
- `node --check customer-app/modules/services.js`
- `node --check customer-app/modules/ui.js`
- `node --check customer-app/modules/profile.js`
- `node --check customer-app/modules/auth.js`
- `node --check customer-app/assets/customer-app.js`
- `node --check customer-app/sw.js`
- `node --test test/customerAppRecovery.test.js`
- `npm test`

## Browser QA

Local mock API/static run: `http://127.0.0.1:4177/customer-app/index.html`

Artifacts:

- `docs/customer-app-v2-runtime-qa/browser-qa-results.json`
- `docs/customer-app-v2-runtime-qa/home-mobile.png`
- `docs/customer-app-v2-runtime-qa/price-mobile.png`
- `docs/customer-app-v2-runtime-qa/review-mobile.png`
- `docs/customer-app-v2-runtime-qa/profile-desktop.png`

