# Customer App V2 Phase 1 Notes

Date: 2026-06-15
Branch: `feature/customer-app-v2-spec-and-skeleton`

Phase 1 and Phase 1.1 are skeleton-only. They do not implement real booking, real urgent dispatch, backend route changes, service worker changes, migrations, payment, accounting, tax, payout, receipt mutation, or production tracking logic.

## What Was Created

- `customer-app/index.html`
- `customer-app/assets/customer-app.css`
- `customer-app/assets/customer-app.js`
- Static classic JS modules under `customer-app/modules/`

The app is intentionally viewable by opening `customer-app/index.html` directly. The modules attach to `window.CWFCustomerAppV2` instead of using browser ES module imports, so file-open testing does not require a local server.

## Phase 1.1 UI Polish

- Reworked visible copy to be customer-facing Thai instead of developer-facing implementation notes.
- Improved mobile wrapping rules with viewport-safe width, `box-sizing`, `min-width: 0`, responsive buttons, and `overflow-wrap`.
- Updated bottom navigation to four customer tabs: `หน้าแรก`, `จองคิว`, `ติดตาม`, `บัญชี`.
- Improved the Home screen with clearer primary actions and trust/proof content.
- Improved Booking Mode cards so scheduled booking and urgent booking are visually distinct and easy to understand quickly.
- Improved the Urgent Waiting Room to feel active and customer-friendly while still clearly not confirming the job before acceptance.
- Kept all real submit, login, tracking, pricing, and availability actions disabled.

## Screen Map

- Home: CWF brand header, primary actions, guest-friendly copy, trust/proof section, secondary login panel.
- Booking Mode Selection: scheduled booking and urgent booking cards.
- Scheduled Booking Skeleton: service/problem chooser, AC details, address/map, date/slot, price estimate, review/confirm.
- Urgent Booking Skeleton: symptom, address/map, photo/video, partner-first explanation, Waiting Room, timeout, admin fallback, and convert-to-scheduled.
- Tracking Skeleton: booking code/token input, scheduled timeline, urgent timeline, technician card, support, receipt/photos/review/rebook.
- Profile Skeleton: guest mode, LINE login, Google login, saved address, history, and rebook.

## Module Responsibilities

- `assets/customer-app.js`: initializes state and router.
- `modules/state.js`: central in-memory skeleton state.
- `modules/router.js`: hash navigation and nav state.
- `modules/api.js`: placeholder API functions only; no real booking/tracking calls.
- `modules/auth.js`: login/profile panel skeleton.
- `modules/services.js`: static copy and step definitions.
- `modules/bookingScheduled.js`: scheduled booking skeleton and rules.
- `modules/bookingUrgent.js`: partner-first urgent skeleton and rules.
- `modules/tracking.js`: tracking and urgent timeline skeleton.
- `modules/profile.js`: guest/profile/history skeleton.
- `modules/pricing.js`: pricing integration placeholder.
- `modules/availability.js`: availability integration placeholder.
- `modules/ui.js`: shared screen fragments.
- `modules/utils.js`: escaping, route helper, step cards, timeline rendering.

## Placeholder Areas

- Real booking submission is disabled.
- Real urgent request submission is disabled.
- Real tracking lookup is disabled.
- LINE Login is disabled.
- Google Login is disabled.
- Price estimate and availability slots are not connected to backend data.
- Waiting Room timeout and admin fallback are visual skeleton states only.

## Phase 2 API Integration Points

- `GET /public/me`
- `POST /public/pricing_preview`
- `GET /public/availability_v2`
- `POST /public/book`
- `GET /public/track?q=...`
- `POST /public/logout`
- `PATCH /public/profile/address`

All API calls must stay centralized in `customer-app/modules/api.js`.

## Urgent Partner-First Confirmation

Urgent booking is partner-first.

- Send urgent requests to ready approved partner technicians first.
- Partners may accept or decline.
- If no partner accepts within timeout, go to Admin Fallback.
- Admin may help, convert to scheduled booking, or assign a company technician manually.
- Company technicians are not automatic first-round urgent dispatch.

The skeleton uses the required safe wording:

`ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน`

## Risks Before Connecting Real APIs

- Current `/public/track` does not expose full Waiting Room fields such as timeout, partner round, fallback state, or convert-to-scheduled options.
- Public tracking currently accepts booking code as well as token, which has privacy implications.
- `sw.js` currently caches legacy customer pages. Cutover needs a separate cache strategy.
- Production public routes must remain frozen until Phase 2/3 authorization and rollback checks exist.
- Google Login must wait for owner-approved identity linking rules.
