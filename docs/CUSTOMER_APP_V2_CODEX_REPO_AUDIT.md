# Customer App V2 Codex Repo Audit

Date: 2026-06-15
Branch audited: `main`
Latest commit audited: `5808f00531b517b5a0b1354c37449ab120c52b14`
Repo: `https://github.com/coldwindflow/cwf-services-system.git`

This audit is documentation-only. No production booking, tracking, payment, accounting, payout, receipt, or database migration logic was changed.

## Fresh Pull Result

- Workspace root `C:\Users\ADMIN\Desktop\repo cwf` is not a git repo.
- Active production repo used for this audit: `C:\Users\ADMIN\Desktop\repo cwf\cwf-services-system-latest`.
- Remote: `origin https://github.com/coldwindflow/cwf-services-system.git`.
- Local branch before pull: `main`, clean, behind `origin/main` by 8 commits.
- `git fetch --all --prune` required elevated Git credentials and succeeded.
- `git pull --ff-only` required elevated Git credentials and fast-forwarded `main` from `d558cef` to `5808f00`.
- Working tree before documentation edits was clean.

## Source Artifact Status

The requested source files were not found in the workspace:

- `CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`
- `CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`
- `CWF_CUSTOMER_APP_V2_SPEC_AND_PROJECT_PROMPT.zip`

The existing `deploy.zip` contained only unrelated AI Office files. The locked spec and addendum were therefore created from the project prompt in this task. This is a scope mismatch to reconcile if the owner has a canonical zip/spec artifact.

## Repository Shape

- Main backend entry remains `index.js`.
- `index.js` still owns public customer booking, tracking, pricing preview, availability, auth/profile, urgent offers, technician accept/decline, admin booking, and many unrelated business domains.
- Public route extraction folder exists at `server/routes/public/README.md`, but it is a README-only placeholder and explicitly freezes `/public/book`, `/public/availability_v2`, `/public/pricing_preview`, and customer tracking.
- Existing modular files relevant to customer work:
  - `server/customerLookup.js`
  - `server/customerPricing.js`
  - `server/pricing.js`
  - `server/routes/public/README.md`
  - `server/routes/technicianCalendarReadOnly.js`
- Existing docs already warn against moving public booking/tracking:
  - `docs/INDEX_JS_SPLIT_PLAN.md`
  - `docs/REPO_ARCHITECTURE_AUDIT.md`
  - `docs/CWF_SOURCE_OF_TRUTH.md`
  - `docs/CWF_SERVICE_AND_PRICING_RULES.md`

## Customer-Facing Runtime Files

- `customer.html`: legacy customer booking page.
- `track.html`: legacy customer tracking page.
- `style.css`: shared styling including customer page sections.
- `sw.js`: PWA service worker caching `customer.html`, `track.html`, and other static assets.
- `manifest.json`: PWA manifest with `start_url` currently set to `/login.html?source=pwa`.

## Public APIs Used By Customer Pages

Current customer booking page calls:

- `GET /public/me`
- `GET /public/line_config` in the debug panel
- `PATCH /public/profile/address`
- `POST /public/logout`
- `POST /public/pricing_preview`
- `GET /public/availability_v2`
- `POST /public/book`
- `GET /promotions?customer=1`

Current tracking page calls:

- `GET /public/track?q=...`
- `POST /public/review`
- `GET /docs/receipt/:job_id` only after completion through tracking response data

## Current Public Booking Architecture

`customer.html` builds a service payload, previews pricing/duration, loads availability, then posts to `/public/book`.

`/public/book` currently:

- Accepts customer details, appointment time, address, maps URL, job type, service fields, extras, and `booking_mode`.
- Computes conservative duration using `computeDurationMinMulti`.
- Resolves customer pricing through `server/customerPricing.js`.
- Applies eligible customer promotion server-side.
- Validates at least one available technician for the selected slot, with company techs for scheduled and partners for urgent.
- Inserts `public.jobs` with `job_source='customer'`.
- Sets `booking_mode` to `scheduled` or `urgent`.
- Sets `dispatch_mode` to `normal` for scheduled and `offer` for urgent.
- Sets scheduled job status to review/pending style status.
- Sets urgent job status to waiting-for-technician-confirmation style status.
- Generates `booking_code` and `booking_token`.
- Creates `job_items`, `job_promotions`, `job_units`, and urgent `job_offers` when urgent is enabled.

Important mismatch: the legacy customer success UI still uses a generic "booking succeeded" title even for urgent mode. It does show a waiting status, but Customer App V2 must use stronger wording that this is only an urgent request until accepted: `ส่งคำขอคิวด่วนแล้ว กำลังรอช่างกดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับ`.

## Current Tracking Architecture

`track.html` accepts a booking code or token and calls `/public/track`.

`/public/track` currently:

- Looks up jobs by `booking_token` or `booking_code`.
- Returns customer name, customer phone, job type, appointment, public status, address, maps, GPS, technician/team data, timeline timestamps, cancellation reason, review state, and photos only after done.
- Maps some internal statuses such as returned/revisit back to a public pending status.
- Shows technician phone based on feature flags and travel-start state.
- Shows no technician/team when urgent work is still unaccepted.
- Does not currently return urgent-specific waiting-room fields such as timeout seconds, offer round, fallback state, or conversion options.

## Existing Urgent/Offer Infrastructure

Existing fields and flows that may support future V2 work:

- `jobs.booking_mode`
- `jobs.dispatch_mode`
- `jobs.booking_code`
- `jobs.booking_token`
- `jobs.job_status`
- `jobs.duration_min`
- `jobs.allow_time_proposal`
- `job_offers.status` with `pending`, `accepted`, `declined`, `expired`
- `job_offers.expires_at`
- `job_offer_time_proposals`
- `technician_profiles.accept_status`
- `technician_profiles.employment_type`
- `technician_monthly_work_calendar.can_accept_urgent_job`
- `partner_applications.can_accept_urgent_jobs`
- `ENABLE_URGENT_FLOW`

Current urgent behavior is partial and production-coupled:

- Public urgent booking sends offers only to ready partner technicians. This matches the owner's intended partner-first urgent model and should not be treated as a bug.
- Admin urgent/dispatch routes support company/partner/all in some flows.
- Technician acceptance is transaction-protected with `FOR UPDATE`, expires competing pending offers, and assigns the job.
- Decline updates offer status but does not store a decline reason.
- Auto-finalize marks urgent jobs as no-technician-found or waiting-for-new-time when offers expire.
- No customer-facing Waiting Room API contract exists yet.
- No explicit customer-facing partner-area, partner-adjacent-zone, admin-fallback lifecycle exists as a single modeled flow.
- Company technician assignment exists in admin flows but should remain an admin fallback decision only, not automatic first-round urgent dispatch.

## PWA And Cache Risks

- `sw.js` caches `customer.html` and `track.html`.
- Static navigate fallback can serve cached `customer.html` or `track.html`.
- APIs are mostly protected from service worker caching because non-static dynamic requests are passed through, but stale HTML can still keep old frontend behavior alive.
- V2 must use versioned assets or a separate route and must plan cache invalidation before cutover.
- Do not modify service worker behavior in Customer App V2 planning unless documenting risk.

## Security And Privacy Risks

- `/public/track` accepts `booking_code` as well as `booking_token`.
- `booking_code` is easier to share and may be easier to enumerate than a token, although it is randomized.
- Tracking response includes customer phone, address, maps/GPS, and technician details after a valid code/token.
- Technician phone may be exposed depending on flags or travel state.
- Receipt URL is returned after done.
- Customer App V2 should consider token-first tracking links, rate limiting, response minimization, and careful field display rules before expanding tracking features.

## Production Risk

High risk if changed too early:

- `/public/book`
- `/public/availability_v2`
- `/public/pricing_preview`
- `/public/track`
- `sw.js`
- payment/accounting/tax/payout/receipt logic
- job item/unit/photo evidence logic
- technician offer accept/decline logic

Do not extract or rewrite these until route maps, acceptance tests, and rollback steps are agreed.
