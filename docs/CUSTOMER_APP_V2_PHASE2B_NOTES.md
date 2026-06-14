# Customer App V2 Phase 2B Notes

## Scope

Phase 2B enables scheduled booking submission from the separated `customer-app/` frontend by using the existing backend route only:

- `POST /public/book`

No backend route, database, payment, tax, receipt, accounting, service worker, legacy customer page, or legacy tracking behavior was changed.

## What Was Implemented

- Added a real scheduled booking form in `customer-app/modules/bookingScheduled.js`.
- Added customer contact fields:
  - `customer_name`
  - `customer_phone`
  - `address_text`
  - `maps_url`
  - `customer_note`
- Added service fields:
  - `job_type`
  - `ac_type`
  - `wash_variant`
  - `repair_variant`
  - `btu`
  - `machine_count`
  - `job_zone`
  - `date`
- Kept pricing preview through `POST /public/pricing_preview`.
- Kept availability lookup through `GET /public/availability_v2`.
- Enabled scheduled submit only after required validation passes.
- Added submit loading, success, and error states.
- Kept entered form data after submit failure.
- Added duplicate-click guard while submit is validating or in flight.
- Added post-success Customer App tracking handoff using the returned booking token or booking code.

## Payload Sent To `/public/book`

Customer App V2 builds this scheduled payload:

```json
{
  "customer_name": "...",
  "customer_phone": "...",
  "job_type": "...",
  "appointment_datetime": "YYYY-MM-DDTHH:mm:ss",
  "address_text": "...",
  "maps_url": "...",
  "customer_note": "...",
  "booking_mode": "scheduled",
  "job_zone": "...",
  "ac_type": "...",
  "wash_variant": "...",
  "repair_variant": "...",
  "btu": 12000,
  "machine_count": 1
}
```

`customer-app/modules/api.js` also forces `booking_mode: "scheduled"` inside `submitScheduledBooking()` so the V2 scheduled path cannot accidentally start an urgent flow.

If future Phase 2 work adds structured catalog selections, `items` and `services` can be included when already present in Customer App V2 state.

## Validation Before Submit

Submit is disabled until:

- Customer name is present.
- Phone number has 9-10 digits.
- Address is present.
- Service type, AC type, BTU, and machine count are valid.
- Wash/repair variant is provided when required.
- Price preview has been loaded.
- Availability has been loaded.
- Customer has selected an available slot returned by `/public/availability_v2`.

The final `appointment_datetime` is derived from the selected availability date and slot start time.

## Submit States

- `idle`: form is editable and waiting for required data.
- `validating`: local validation is running.
- `submitting`: request to `/public/book` is in flight.
- `success`: backend accepted the scheduled booking.
- `error`: backend or validation failed; customer-entered data remains in the form.

## Urgent Booking Status

Urgent dispatch remains disabled in Phase 2B.

The exact urgent customer-safe wording remains preserved:

> ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน

Partner-first urgent dispatch rules remain documented only. No urgent submit endpoint or dispatch logic was enabled.

## Tracking Status

Existing tracking behavior remains untouched:

- `track.html` was not modified.
- `/public/track` backend behavior was not modified.
- Customer App V2 continues to read tracking data only through the existing safe read endpoint.

## Safety Checks

Required protected files remain unchanged in this phase:

- `index.js`
- `customer.html`
- `track.html`
- `sw.js`

No production deployment, PR merge, database migration, or backend route change was performed.

## Verification Record

Syntax checks passed:

```text
node --check customer-app/assets/customer-app.js
Get-ChildItem customer-app/modules/*.js | ForEach-Object { node --check $_.FullName }
node --check index.js
```

Protected diff checks returned no files:

```text
git diff --name-only origin/main..HEAD -- track.html sw.js
git diff --name-only origin/main..HEAD -- index.js customer.html track.html sw.js
```

Static browser smoke check:

- Opened `http://127.0.0.1:8080/customer-app/index.html#/scheduled` through a temporary local static server.
- Checked 390px mobile viewport.
- Confirmed no horizontal overflow.
- Confirmed no console errors.
- Confirmed scheduled submit is disabled before required customer, price, and availability data exists.
- Confirmed the scheduled screen does not contain an old `track.html` redirect link.
- Opened Home, Booking, Scheduled, Urgent, Tracking, and Profile routes.
- Confirmed urgent screen keeps the exact partner-first waiting wording.

No real production booking was created during this verification. A live `/public/book` booking should only be tested with owner-approved safe test data or a safe environment.

## Remaining Risks Before Phase 2C

- Real test booking should be executed only in an approved safe environment or with approved test data because `/public/book` creates production booking records when pointed at production.
- Pricing preview and booking creation still rely on existing backend consistency; Customer App V2 does not independently lock the quoted price.
- Availability is read before submit, but the existing `/public/book` route remains the final authority.
- Public tracking privacy remains a broader audit item because tracking by booking code/token existed before Customer App V2.
- Saved address mutation is still intentionally delayed.
