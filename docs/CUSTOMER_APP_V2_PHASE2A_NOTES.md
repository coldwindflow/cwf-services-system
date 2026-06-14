# Customer App V2 Phase 2A Notes

Date: 2026-06-15
Branch: `feature/customer-app-v2-spec-and-skeleton`
PR: #38

Phase 2A connects the Customer App V2 static frontend to safe existing read/preview APIs only. It does not enable real booking submission, real urgent dispatch, backend route changes, migrations, payment, accounting, tax, payout, receipt mutation, service worker changes, or production deploy behavior.

## Endpoints Connected

- `GET /public/me`
- `POST /public/pricing_preview`
- `GET /public/availability_v2`
- `GET /public/track?q=...`
- `GET /promotions?customer=1`
- `GET /service_zones`
- `GET /catalog/items?customer=1`

`/public/profile/address` was not connected in Phase 2A because the current available route is a `PATCH` mutation. Profile display uses `/public/me`, which already includes safe profile data when available.

## Screens Updated

- Home reads customer-visible catalog items, promotions, service zones, and guest/login state.
- Scheduled Booking reads pricing preview and availability slots.
- Tracking reads current tracking data from `/public/track`.
- Profile reads guest/login state and saved address from `/public/me`.
- Urgent Booking remains a non-submitting partner-first waiting-room skeleton.

## Safety Rules Preserved

- `POST /public/book` is not called.
- Urgent request submission is not called.
- Booking confirmation remains disabled.
- Urgent dispatch remains disabled.
- No backend files or production routes were modified.
- No service worker changes were made.
- No customer-facing text says a booking is confirmed before backend confirmation.

## Required Urgent Wording

The UI still includes:

`ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน`

## API Base Behavior

When served by the production app, Phase 2A uses same-origin relative endpoints.

When opened directly from `customer-app/index.html`, browser security may block same-origin API reads because the page is loaded from `file://`. For local visual/API testing, serve the repo over a local static/server origin or pass an API base with:

`customer-app/index.html?api=http://localhost:3000`

The API base can also be stored in local storage under:

`cwf_customer_app_api_base`

## Remaining Risks Before Phase 2B

- Real booking still needs a server-approved payload contract and rollback plan before `/public/book` is enabled.
- Urgent dispatch needs owner-approved lifecycle fields, timeout semantics, and transaction/conditional acceptance logic before implementation.
- Tracking data does not yet expose a complete urgent waiting-room model such as partner round, timeout, fallback state, and conversion state.
- Public tracking continues to support lookup by booking code as well as token, which remains a privacy review item.
- Profile address display is read-only in Phase 2A; saving address should wait for explicit Phase 2B authorization.
