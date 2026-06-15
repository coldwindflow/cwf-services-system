# Customer App V2 Current Audit

Date: 2026-06-15
Scope: current customer booking/tracking architecture only.

## Current Customer Pages

- `customer.html` is the current legacy customer booking surface.
- `track.html` is the current legacy customer tracking surface.
- `/customer` serves `customer.html`.
- `/track` serves `track.html`.
- `manifest.json` starts installed PWA sessions at `/login.html?source=pwa`, not directly at customer booking.
- `sw.js` caches both customer pages.

## Current Booking Flow In `customer.html`

The page:

- Loads customer LINE session/profile via `/public/me`.
- Supports LINE login link through `/auth/line`.
- Allows editing saved address through `/public/profile/address`.
- Builds single or multi-service payloads.
- Calls `/public/pricing_preview` to compute price and duration.
- Calls `/public/availability_v2` with date, technician type, duration, and service criteria.
- Uses `tech_type=company` for scheduled booking and `tech_type=partner` for urgent booking.
- Posts booking to `/public/book`.
- Shows booking code and a link to `track.html?q=...`.

Current urgent UI issue:

- The success title says the equivalent of booking success even when urgent is still only waiting for technician acceptance.
- It does show an urgent status row, but Customer App V2 needs a dedicated urgent waiting-room experience and explicit wording: `ส่งคำขอคิวด่วนแล้ว กำลังรอช่างกดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับ`.

## Current Tracking Flow In `track.html`

The page:

- Reads `q` or `token` from URL.
- Calls `/public/track?q=...`.
- Renders booking code, public job status, customer name, job type, appointment, address, navigation, technician/team data, timeline, photos after completion, review form, and warranty text.
- Shows a no-technician urgent fallback message only when status is no-technician-found.
- Does not show offer timeout, current offer round, fallback action state, or conversion to scheduled booking.

## Current Public APIs

- `GET /public/me`
- `GET /public/line_config`
- `PATCH /public/profile/address`
- `GET /public/logout`
- `POST /public/logout`
- `POST /public/register`
- `POST /public/pricing_preview`
- `GET /public/availability_v2`
- `GET /public/availability`
- `POST /public/book`
- `GET /public/track`
- `POST /public/review`
- `GET /promotions?customer=1`

## Backend Logic In `index.js`

Customer-related backend logic still embedded in `index.js` includes:

- LINE auth and customer JWT cookie handling.
- Customer profile lookup/update.
- Booking code and booking token generation.
- Public pricing preview.
- Availability, collision checks, travel buffer, service matrix filtering, and technician work windows.
- Public booking insert, pricing, promotions, job items, job units, and urgent offers.
- Public tracking response shaping.
- Public reviews.
- Technician offer list, accept, decline, time proposal, and urgent auto-finalize.

This is the largest implementation risk. V2 should not add more customer logic into `index.js`.

## Auth And Customer Profile Behavior

- Customer login is LINE-based using `cwf_token`.
- `/public/me` returns session state, display name, picture, provider, and optional profile.
- Customer profile stores phone/address/maps URL in `customer_profiles`.
- `customer.html` stores a local form draft in `localStorage`.
- Google Login is not implemented and should be delayed.

## Availability Behavior

- `/public/availability_v2` computes startable slots using technician work hours, special slots, current jobs, duration, and a travel buffer.
- Customer responses hide technician IDs unless debug/forced mode is used.
- Availability does not depend on technician ready/paused status for scheduled customer booking.
- Service matrix and `customer_slot_visible` can filter eligible technicians.
- If strict matrix filtering eliminates everyone, the endpoint has a fallback to avoid total customer booking outage.

## Pricing Behavior

- `/public/pricing_preview` uses `server/customerPricing.js`.
- `server/customerPricing.js` uses `customer_service_price_rules` when available and falls back to `server/pricing.js`.
- `server/pricing.js` computes standard price and duration.
- Public booking recomputes pricing server-side and ignores customer-submitted item prices.
- Customer promotion is selected server-side.

## Booking Behavior

- Scheduled bookings use `booking_mode='scheduled'`, `dispatch_mode='normal'`, and currently enter a pending/review style status.
- Urgent bookings use `booking_mode='urgent'`, `dispatch_mode='offer'`, and currently enter a waiting-for-technician-confirmation style status.
- Public urgent booking currently offers to ready partner technicians only. This matches the owner's intended partner-first urgent model.
- Admin booking and dispatch routes have broader company/partner/all urgent offer support, but are not a finished customer urgent lifecycle.

## Tracking Behavior

- Public tracking is keyed by booking token or booking code.
- Photos and technician notes are hidden until completion.
- Technician/team display is controlled by production flags and job state.
- Tracking does not yet expose V2 urgent waiting-room metadata.

## PWA Risks

- `sw.js` cache can leave old `customer.html` or `track.html` active after deploy.
- V2 should avoid sharing the same unversioned page during early phases.
- A separate V2 route and versioned assets are safer than replacing legacy pages.

## Security And Privacy Risks

- Booking code lookup exposes enough job details for customer convenience but increases privacy risk if codes are leaked.
- Customer phone/address/maps data appears in tracking responses.
- Technician contact data can appear after travel starts or via flags.
- No V2-specific rate limiting or token-only tracking contract exists in this audit.

## Existing Support For Scheduled/Urgent Concepts

Already present:

- `booking_mode`
- `dispatch_mode`
- `booking_code`
- `booking_token`
- `job_status`
- `job_offers`
- `job_offer_time_proposals`
- `allow_time_proposal`
- technician ready/paused state
- employment type company/partner
- urgent enable flag

Missing or incomplete for V2:

- Customer Waiting Room contract.
- Timeout display API.
- Explicit partner-area, partner-adjacent-zone, and admin-fallback round state.
- Admin fallback API/state surfaced to customer.
- Convert urgent to scheduled flow.
- Decline reasons.
- Owner policy for whether partner acceptance confirms directly or waits for admin confirmation.
- Round-based dispatch sequencing.
