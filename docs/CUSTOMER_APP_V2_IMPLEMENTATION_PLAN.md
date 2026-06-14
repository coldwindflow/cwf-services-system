# Customer App V2 Implementation Plan

Date: 2026-06-15
Status: Proposal only. Do not implement runtime code from this plan without owner approval.

## Phase 0: Discovery / Audit

Goal:
- Lock the spec, document current architecture, and identify risks before implementation.

Authorized files:
- `docs/CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`
- `docs/CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`
- `CLAUDE.md`
- `docs/CUSTOMER_APP_V2_CODEX_REPO_AUDIT.md`
- `docs/CUSTOMER_APP_V2_CURRENT_AUDIT.md`
- `docs/CUSTOMER_APP_V2_IMPLEMENTATION_PLAN.md`

Readable files:
- `index.js`, `customer.html`, `track.html`, `sw.js`, `manifest.json`, `style.css`
- `server/customerLookup.js`, `server/customerPricing.js`, `server/pricing.js`
- `server/routes/public/README.md`
- `docs/INDEX_JS_SPLIT_PLAN.md`, `docs/REPO_ARCHITECTURE_AUDIT.md`, `docs/CWF_SOURCE_OF_TRUTH.md`, `docs/CWF_SERVICE_AND_PRICING_RULES.md`
- `package.json`

Forbidden files/areas:
- Runtime booking/tracking/payment/accounting/payout/tax/receipt logic.
- Database migrations.

Acceptance criteria:
- Spec and addendum are in `docs/`.
- `CLAUDE.md` points to the locked spec.
- Audit and implementation plan are committed or ready for review.
- No runtime behavior changed.

Test checklist:
- `git status --short --branch`
- `git diff --name-only`
- `node --check index.js`

Rollback plan:
- Remove the added docs and `CLAUDE.md` rule.

Known risks:
- Canonical source spec artifacts were not found; reconcile if owner provides them.

## Phase 1: Customer-App Skeleton Only

Goal:
- Add a separate V2 frontend shell with no business logic changes and no production route changes.

Authorized files:
- New static V2 frontend files only, for example `customer-app-v2.html`, `customer-app-v2.js`, and scoped CSS if approved.
- Documentation updates for route and rollback.

Readable files:
- Current customer pages and public API docs.

Forbidden files/areas:
- `/public/book`, `/public/availability_v2`, `/public/pricing_preview`, `/public/track`
- `index.js` business logic
- `sw.js` unless explicitly approved for cache strategy
- payment/accounting/tax/payout/receipt logic
- migrations

Acceptance criteria:
- V2 shell loads independently.
- Legacy `customer.html` and `track.html` remain unchanged.
- No booking can be submitted from skeleton unless wired in Phase 2.

Test checklist:
- Browser smoke for desktop/mobile.
- No console errors.
- Existing `customer.html` and `track.html` still load.
- `node --check index.js`.

Rollback plan:
- Delete the new V2 static files and remove any static page alias if one was added.

Known risks:
- If the service worker caches the new shell too early, stale shell behavior may persist.

## Phase 2: Frontend V2 Using Existing APIs

Goal:
- Build the premium mobile-first booking/tracking UI while using current production APIs unchanged.

Authorized files:
- V2 frontend files and V2-only styling.
- Documentation and manual test checklist.

Readable files:
- `customer.html`, `track.html`, `style.css`, public API handlers in `index.js`.

Forbidden files/areas:
- Production public API handler behavior.
- `index.js` business logic.
- Payment/accounting/tax/payout/receipt logic.
- Migrations.

Acceptance criteria:
- Scheduled booking calls existing pricing, availability, and booking endpoints.
- Urgent booking is clearly labeled as a request, not confirmed.
- Urgent Waiting Room UI can be driven by existing `/public/track` status, while documenting missing fields.
- Phase 2 must preserve the current partner-first urgent behavior and must not introduce automatic company technician urgent dispatch.
- Legacy pages still work.

Test checklist:
- Price preview.
- Availability load.
- Scheduled booking happy path in staging/manual environment.
- Urgent request wording check.
- Partner-first urgent wording check.
- Tracking page status check.
- Mobile viewport checks.

Rollback plan:
- Disable or remove the V2 entry link/route; keep legacy pages.

Known risks:
- Existing `/public/track` lacks timeout and offer-round fields, so Waiting Room may initially be presentational and status-based only.

## Phase 3: Backend Route Extraction

Goal:
- Extract public customer route modules without behavior changes only after V2 API needs are known.

Authorized files:
- `server/routes/public/*.js` modules if explicitly approved.
- `index.js` only for moving existing handlers with identical paths and dependencies.
- Focused tests/checklists.

Readable files:
- `index.js`, public route handlers, customer frontend callers, pricing/lookup modules.

Forbidden files/areas:
- Behavior changes to booking, availability, pricing, tracking.
- Payment/accounting/tax/payout/receipt mutation logic.
- Migrations.

Acceptance criteria:
- Route paths and response shapes are unchanged.
- No duplicate route handlers.
- Startup and smoke tests pass.

Test checklist:
- `node --check index.js`
- `node --check` on every extracted module.
- Startup smoke.
- Manual smoke for pricing, availability, booking, tracking.

Rollback plan:
- Restore inline route handlers in `index.js`, remove extracted modules, rerun checks.

Known risks:
- `index.js` handlers depend on many local helpers; extraction can easily miss hidden dependencies.

## Phase 4: Urgent Booking Full Lifecycle

Goal:
- Implement the locked partner-first urgent lifecycle with Waiting Room, timeout, partner-area offers, partner-adjacent-zone offers, admin fallback, conversion to scheduled, decline reasons, and single-accept guarantees.

Authorized files:
- To be decided after owner policy approval.
- Likely new service modules, public urgent status endpoint, admin fallback endpoint, and technician offer changes.

Readable files:
- Current urgent offer code, technician offer routes, admin dispatch routes, public booking/tracking routes.

Forbidden files/areas:
- Payment/accounting/tax/payout/receipt logic unless a separate finance review explicitly approves.
- Migrations until schema design is approved.

Acceptance criteria:
- Urgent customer never sees `จองสำเร็จแล้ว`, `ยืนยันคิวแล้ว`, or confirmed language before partner technician acceptance or admin confirmation.
- Waiting Room shows status, timeout, and fallback options.
- Offers proceed in owner-approved partner-first rounds.
- Exactly one technician can accept.
- Decline reason is captured where supported.
- Partner confirmation policy is enforced.
- Company technician assignment occurs only through admin fallback decision unless owner explicitly changes policy.

Test checklist:
- No technician accepts.
- One technician accepts.
- Two technicians accept at nearly the same time.
- Technician declines with and without reason.
- Partner acceptance requiring admin confirmation if policy says so.
- No partner accepts within timeout, then admin fallback.
- Convert to scheduled.
- Admin fallback.

Rollback plan:
- Feature flag the full urgent V2 lifecycle and fall back to current legacy urgent behavior.

Known risks:
- Current public urgent sends to ready partner technicians, which aligns with the owner correction.
- The missing parts are adjacent-zone partner rounds, customer-facing timeout/fallback state, conversion to scheduled, decline reasons, and final partner confirmation policy.
- Current schema may need additional state columns or tables, which requires a later migration phase.

## Phase 5: Google Login

Goal:
- Add Google Login only after customer profile identity rules are decided.

Authorized files:
- Auth docs, auth route/module files, frontend login UI only after approval.

Readable files:
- Existing LINE auth and customer profile code.

Forbidden files/areas:
- Existing LINE login regression.
- Payment/accounting/tax/payout/receipt logic.

Acceptance criteria:
- Existing LINE login remains stable.
- Customer identity merge/linking rules are implemented.
- Logout/session behavior is clear.

Test checklist:
- LINE login still works.
- Google login works.
- Existing customer profile data is not overwritten incorrectly.

Rollback plan:
- Disable Google provider and hide entry point.

Known risks:
- Duplicate customer profiles if LINE and Google identity linking is not designed first.

## Phase 6: Cutover / Fallback Cleanup

Goal:
- Make V2 the primary customer experience only after production validation.

Authorized files:
- Entry routes, navigation links, documentation, and cache strategy.

Readable files:
- Legacy pages, service worker, manifest, routing in `index.js`.

Forbidden files/areas:
- Deleting legacy pages before rollback window ends.
- Payment/accounting/tax/payout/receipt logic.

Acceptance criteria:
- V2 is primary.
- Legacy fallback remains reachable during rollback window.
- Service worker cache strategy is updated safely.
- Monitoring/manual checks are complete.

Test checklist:
- Fresh browser.
- Installed PWA.
- Offline/stale cache scenario.
- Legacy fallback URL.
- Booking/tracking smoke.

Rollback plan:
- Repoint entry links/routes to legacy `customer.html` and `track.html`.

Known risks:
- PWA cache can keep old files active after deploy.

## Challenge The Plan

What I agree with:
- Locking the spec before implementation is necessary because urgent booking language and confirmation state are easy to get wrong.
- Keeping V2 separated from `customer.html`, `track.html`, and `index.js` is the safest path.
- Starting with existing APIs avoids destabilizing booking and tracking.
- The owner correction that urgent dispatch is partner-first matches the current public urgent direction better than a company-first model.

What I disagree with:
- Treating urgent booking as a simple frontend mode is not enough. Current backend behavior does not yet model the full locked lifecycle.
- Company technicians should not be automatic urgent first-round dispatch. They belong behind Admin Fallback unless the owner explicitly changes that policy later.

What is missing:
- Owner policy for whether partner acceptance confirms directly or requires admin confirmation.
- Timeout duration and round duration.
- Admin fallback ownership and SLA.
- Conversion-to-scheduled API/state design.
- Decline reason taxonomy.
- Token-first tracking/security decision.
- Cache cutover plan.
- Definition of customer area and adjacent zones for partner-first urgent rounds.

What should be delayed:
- Google Login.
- Backend route extraction.
- Urgent lifecycle schema changes.
- Service worker cache changes.
- Any payment/accounting/tax/payout/receipt changes.

What must be decided by the owner before implementation:
- Whether partner acceptance confirms directly or requires admin confirmation.
- Timeout length for partner offers and total Waiting Room.
- How nearby/adjacent partner zones are defined.
- What timeout duration customers see.
- What happens after timeout: admin fallback first, scheduled conversion first, or both.
- Whether booking code alone should continue to expose tracking details in V2.
- Whether automatic company urgent dispatch is ever allowed later; default is no.

Scope mismatch:
- The requested source spec/addendum/zip files were not present in the workspace.
- `CLAUDE.md` did not exist on latest `main`; this round created it with only the requested rule.
- Current authorized files do not include V2 frontend skeleton files, so Phase 1 cannot start until a new authorized scope is approved.
