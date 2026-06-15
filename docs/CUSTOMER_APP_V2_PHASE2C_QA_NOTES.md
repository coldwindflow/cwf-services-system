# Customer App V2 Phase 2C QA Notes

## Scope

Phase 2C reviewed and hardened the Phase 2B scheduled booking submit implementation before any merge or deploy decision.

This phase did not change backend routes, `index.js`, `customer.html`, `track.html`, `sw.js`, payment, tax, receipt, accounting, auth, database migrations, urgent dispatch, production deployment, or PR merge state.

## QA Findings

### `/public/book` Contract

The current backend route is:

```text
POST /public/book
```

The route reads:

- `customer_name`
- `customer_phone`
- `job_type`
- `appointment_datetime`
- `address_text`
- `customer_note`
- `maps_url`
- `job_zone`
- `items`
- `booking_mode`
- `ac_type`
- `btu`
- `machine_count`
- `wash_variant`
- `repair_variant`
- `services`

The route requires at least:

- `customer_name`
- `job_type`
- `appointment_datetime`
- `address_text`

On success it returns:

- `success`
- `job_id`
- `booking_code`
- `token`
- `booking_mode`
- `duration_min`
- `effective_block_min`
- `travel_buffer_min`
- `applied_promo`
- `base_total`

Customer App V2 maps scheduled submit data to the existing contract and does not require a backend route change.

### Scheduled Mode Safety

`customer-app/modules/api.js` forces:

```js
booking_mode: "scheduled"
```

`customer-app/modules/bookingScheduled.js` also includes `booking_mode: "scheduled"` in the payload and documents that this path never starts urgent dispatch.

Because the API wrapper applies `booking_mode` after spreading the caller payload, a future caller cannot override it accidentally from the scheduled submit path.

### Required Validation

Customer App V2 blocks scheduled submit until:

- `customer_name` is present.
- `customer_phone` has 9-10 digits after removing non-digits.
- `address_text` is present.
- `job_type` is present.
- `ac_type` is present.
- `btu` is present.
- `machine_count >= 1`.
- `wash_variant` is present when required for wall AC wash jobs.
- `repair_variant` is present for repair jobs.
- Pricing preview has been loaded.
- Availability has been loaded.
- A selected availability slot exists.
- The selected slot still exists in the latest returned availability slot list and is marked available.

`appointment_datetime` is derived only from the selected date and selected returned availability slot.

### Double Submit Safety

The scheduled submit handler returns early while submit state is:

- `validating`
- `submitting`

The submit button is also disabled while pending. Repeated taps should not create duplicate client-side requests from the V2 UI.

### Error State Safety

Submit errors render a customer-readable Thai error state and do not clear the scheduled draft. Local mock QA confirmed name and phone remain in the form after a forced error response.

### Success State Safety

On success, Customer App V2 shows:

- `booking_code`
- backend price total when returned
- duration when returned
- Customer App V2 tracking button

The tracking button prefers `token` when present and falls back to `booking_code`. It routes inside Customer App V2 and does not redirect to old `track.html`.

### Urgent Safety

Urgent submit remains disabled.

The exact urgent customer wording remains present:

> ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน

No urgent dispatch endpoint or urgent offer creation was enabled in Customer App V2.

### Tracking Safety

Existing tracking remains untouched:

- `track.html` unchanged.
- `sw.js` unchanged.
- `/public/track` backend behavior unchanged.
- Customer App V2 only reads tracking data through the existing read endpoint.
- No old `track.html` redirect link was added to Customer App V2 success state.

### Service Worker / Cache Safety

`sw.js` was not modified. Customer App V2 is not added to the legacy service worker cache in this phase, so Phase 2C adds no service worker cache impact.

## Launch Gating Warning

If `customer-app/` becomes publicly reachable after deployment, Customer App V2 can create scheduled bookings through the existing production `/public/book` route.

Recommended launch gating before public release:

- Keep PR #38 Draft until owner QA is complete.
- Do not deploy `customer-app/` publicly until owner approves scheduled submit behavior.
- Prefer server/deploy gating so `customer-app/` is not exposed to public traffic before launch.
- If a staging environment exists, test scheduled booking there first.
- Use owner-approved safe test data only if testing against production is unavoidable.

Frontend-only launch gating was not implemented in Phase 2C because a static frontend gate is easy to bypass and could block owner/developer preview. The safer control is deployment or server access gating before public launch.

## Preview Package

Screenshots were generated locally with a mock API server only. No production booking was created.

Preview folder:

```text
C:\Users\ADMIN\Desktop\repo cwf\customer-app-v2-phase2c-preview
```

Preview ZIP:

```text
C:\Users\ADMIN\Desktop\repo cwf\customer-app-v2-phase2c-preview.zip
```

Screenshots included:

- `01-home.png`
- `02-booking-mode.png`
- `03-scheduled-input.png`
- `04-scheduled-final-review.png`
- `05-scheduled-success.png`
- `06-scheduled-error.png`
- `07-tracking.png`
- `08-profile.png`
- `09-urgent-waiting-room.png`

## Browser Smoke Result

Local mock server used:

```text
http://127.0.0.1:8080/customer-app/index.html
```

Observed:

- Home loaded.
- Booking mode loaded.
- Scheduled input loaded.
- Scheduled final review became submittable only after required data, pricing preview, availability, and selected slot were present.
- Scheduled success showed mock `booking_code`.
- Scheduled success did not include an old `track.html` link.
- Scheduled error preserved entered customer data.
- Tracking screen loaded and read mock tracking data.
- Profile screen loaded guest state.
- Urgent waiting room loaded and preserved exact partner-first wording.
- No console errors were observed.
- Mobile viewport did not show horizontal overflow on checked routes.

## Command Results

Syntax checks passed:

```text
node --check customer-app/assets/customer-app.js
Get-ChildItem customer-app/modules/*.js | ForEach-Object { node --check $_.FullName }
node --check index.js
```

Protected diff checks returned no files:

```text
git diff --name-only origin/main..HEAD -- index.js customer.html track.html sw.js
git diff --name-only origin/main..HEAD -- track.html sw.js
```

## Recommendation

Phase 2C is ready for owner visual review.

Before any merge or deploy decision, owner should confirm:

- Scheduled submit copy is acceptable.
- Success state wording is acceptable.
- Error state wording is acceptable.
- Owner-approved safe booking data or a staging environment is available for one live `/public/book` test.
