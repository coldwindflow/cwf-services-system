# Customer App V2 Phase 2B Proposal

Date: 2026-06-15
Branch: `feature/customer-app-v2-spec-and-skeleton`
PR: #38
Mode: Proposal / Risk Review only

This document proposes how to enable scheduled booking submission from Customer App V2 using the existing `POST /public/book` route. It does not implement submit, does not call `/public/book`, does not change backend behavior, and does not affect the existing `customer.html` flow.

## Current Route Located

The existing route is in `index.js`:

- `app.post("/public/book", async (req, res) => { ... })`

The legacy customer page submits from `customer.html`:

- `async function book()`
- `const payload = getPayloadV2()`
- `fetch(`${API}/public/book`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) })`

## Existing Request Contract

Method:

```text
POST
```

URL:

```text
/public/book
```

Headers:

```text
Content-Type: application/json
```

Legacy `customer.html` body shape:

```json
{
  "customer_name": "string",
  "customer_phone": "string",
  "job_type": "string",
  "appointment_datetime": "YYYY-MM-DDTHH:mm:00",
  "address_text": "string",
  "maps_url": "string",
  "customer_note": "string",
  "booking_mode": "scheduled",
  "promotion_id": "ignored by current backend",
  "job_type": "string",
  "ac_type": "string",
  "btu": 12000,
  "machine_count": 1,
  "wash_variant": "string",
  "repair_variant": "string",
  "services": [
    {
      "job_type": "string",
      "ac_type": "string",
      "btu": 12000,
      "machine_count": 1,
      "wash_variant": "string",
      "repair_variant": "string"
    }
  ],
  "items": [
    {
      "item_id": 123,
      "qty": 1
    }
  ],
  "job_zone": "string"
}
```

The route destructures these fields:

```text
customer_name
customer_phone
job_type
appointment_datetime
address_text
customer_note
maps_url
job_zone
items
booking_mode
ac_type
btu
machine_count
wash_variant
repair_variant
services
```

`promotion_id` is currently sent by `customer.html` but is not read by `/public/book`; customer promotion is selected server-side.

## Required Fields

Backend hard-required fields:

- `customer_name`
- `job_type`
- `appointment_datetime`
- `address_text`

Operationally required for safe scheduled booking:

- `customer_phone`, even though the current route allows empty phone.
- `booking_mode: "scheduled"`.
- `ac_type`.
- `btu`.
- `machine_count`.
- `wash_variant` when `job_type` is wash and `ac_type` is wall-mounted.
- `repair_variant` when `job_type` is repair.
- A selected slot from a recent `/public/availability_v2` response.

## Optional Fields

- `customer_note`
- `maps_url`
- `job_zone`
- `items`
- `services`
- `repair_variant` for non-repair work
- `wash_variant` for non-wall/non-wash work

## Existing Server Behavior

For scheduled bookings:

- Normalizes `booking_mode`; `urgent` falls back to `scheduled` if urgent is disabled.
- Computes conservative duration using `computeDurationMinMulti`.
- Recomputes customer pricing server-side.
- Applies eligible customer promotion server-side.
- Parses latitude/longitude from `maps_url` or `address_text` if available.
- Validates at least one available company technician for the selected time.
- Inserts into `public.jobs` with:
  - `job_source='customer'`
  - `booking_mode='scheduled'`
  - `dispatch_mode='normal'`
  - scheduled pending/review status
- Creates a random `booking_code`.
- Creates `booking_token`.
- Creates `job_items`.
- Creates `job_units`.
- Attaches promotion data if eligible.

For urgent bookings, the same route can create partner offers when enabled. Customer App V2 Phase 2B must not send `booking_mode: "urgent"`.

## Success Response Shape

On success, `/public/book` returns:

```json
{
  "success": true,
  "job_id": 123,
  "booking_code": "CWF...",
  "token": "random-token",
  "booking_mode": "scheduled",
  "duration_min": 120,
  "effective_block_min": 150,
  "travel_buffer_min": 30,
  "applied_promo": {
    "promo_id": 1,
    "promo_name": "string",
    "promo_type": "percent",
    "promo_value": 10,
    "discount": 100
  },
  "base_total": 1200
}
```

`applied_promo` can be `null`.

## Error Response Shape

Known error responses:

```json
{ "error": "missing required data message" }
```

```json
{ "error": "duration error message" }
```

```json
{ "error": "slot full message" }
```

Urgent-only branch, not for Phase 2B:

```json
{
  "error": "no urgent offer targets message",
  "code": "NO_URGENT_OFFER_TARGETS"
}
```

The catch block returns:

```json
{
  "error": "message",
  "code": "optional-code"
}
```

Status codes observed from route logic:

- `400` for missing fields, invalid duration, or unavailable selected slot.
- `409` for urgent no-offer-targets branch.
- `500` for unexpected booking failure.

## Customer App V2 Field Mapping

Current V2 scheduled state:

| V2 state | `/public/book` field | Status |
| --- | --- | --- |
| `draft.scheduled.job_type` | `job_type` | available |
| `draft.scheduled.ac_type` | `ac_type` | available |
| `draft.scheduled.wash_variant` | `wash_variant` | available |
| `draft.scheduled.btu` | `btu` | available |
| `draft.scheduled.machine_count` | `machine_count` | available |
| `draft.scheduled.date` | date part of `appointment_datetime` | available |
| selected availability slot start | time part of `appointment_datetime` | missing selected-slot state |
| fixed scheduled mode | `booking_mode: "scheduled"` | must be hard-coded |
| customer form name | `customer_name` | missing |
| customer form phone | `customer_phone` | missing |
| address form | `address_text` | missing |
| maps form | `maps_url` | missing |
| note form | `customer_note` | missing |
| selected service zone | `job_zone` | missing/optional |
| multi-service rows | `services` | not implemented in V2 |
| extras catalog choices | `items` | not implemented in V2 |

## Missing Fields Before Submit Can Be Enabled

Customer App V2 needs these UI/state pieces before any submit button can be enabled:

- Customer name input.
- Customer phone input.
- Address text input.
- Optional Google Maps URL input.
- Optional customer note input.
- Selected slot state from `/public/availability_v2`.
- Final review panel showing service, date/time, address, estimated price, and booking mode.
- Submit state lock to prevent double-click duplicate posts.
- Success state showing `booking_code`, tracking action, and copy/share behavior.
- Error state that preserves the filled form.
- Explicit scheduled-only guard: force `booking_mode: "scheduled"` and reject urgent mode in this flow.

## Required Validation Before Submit

Client-side validation should block submit unless:

- `customer_name` is non-empty after trim.
- `customer_phone` is present and looks like a Thai phone number or accepted contact number.
- `address_text` is non-empty and long enough to be useful.
- `job_type`, `ac_type`, `btu`, and `machine_count` are present.
- `wash_variant` is present for wall-mounted wash jobs.
- `repair_variant` is present for repair jobs.
- Date is present and not in the past.
- A slot was selected from the latest successful availability response.
- The selected slot still exists in current state and is marked `available`.
- Pricing preview was loaded for the same service payload.
- Availability was loaded for the same service payload/date/duration.
- `booking_mode` is exactly `scheduled`.
- Submit is not already in progress.

The server still remains authoritative and must be allowed to reject stale slots, bad duration, or unavailable technicians.

## Safety Risks

Duplicate booking:

- Risk: double click, back button resubmit, retry after network timeout.
- Mitigation: disable submit while pending, store a local pending marker, show one clear result, and do not auto-retry POST.

Bad customer phone/name/address:

- Risk: backend currently only hard-requires name, job type, appointment, and address.
- Mitigation: V2 should require phone and stronger address quality before submit.

Wrong price estimate:

- Risk: preview can become stale or server may recompute a different base total.
- Mitigation: submit must say estimated price only; success should display server `base_total` and applied promo if returned.

Wrong slot:

- Risk: availability can change between preview and submit.
- Mitigation: revalidate selected slot freshness in UI and accept backend 400 slot-full response as normal.

Auth/guest behavior:

- Risk: `/public/book` supports guest booking; profile state is optional.
- Mitigation: keep login secondary; if logged in, prefill only, but do not require login.

Tracking code exposure:

- Risk: success returns both `booking_code` and token; `/public/track` accepts booking code.
- Mitigation: prefer token for direct tracking links when available; display booking code for customer support but avoid overexposing it.

Service worker/cache issue:

- Risk: `sw.js` caches legacy customer pages and could confuse cutover testing later.
- Mitigation: do not route V2 through legacy cached paths; keep V2 separate and plan cache strategy before production cutover.

Urgent dispatch:

- Risk: `/public/book` can trigger urgent partner offers if `booking_mode` is urgent and urgent flow is enabled.
- Mitigation: Phase 2B scheduled submit must hard-code `booking_mode: "scheduled"` and must not expose urgent submit.

Existing `customer.html` regression:

- Risk: shared route behavior is production-critical.
- Mitigation: do not modify `/public/book`; only use its existing scheduled contract from V2.

## Proposed Phase 2B Implementation Plan

Small commit 1: scheduled form state only

- Add customer name, phone, address, maps URL, note, selected slot state.
- Add validation helpers in Customer App V2 only.
- No submit call.

Small commit 2: final review and stale preview guards

- Show selected service, price preview, selected slot, address, and warnings.
- Require pricing and availability previews before enabling final review.
- Still no submit call.

Small commit 3: guarded scheduled submit wrapper

- Add `api.submitScheduledBooking(payload)` that calls `POST /public/book`.
- Hard-code `booking_mode: "scheduled"`.
- Keep urgent submit disabled.
- Disable button while pending.
- Render success/error states.

Small commit 4: local/manual verification docs

- Update Phase 2B notes with test evidence.
- Confirm legacy `customer.html` still books using the same endpoint.

## Test Plan

Syntax checks:

```text
node --check customer-app/assets/customer-app.js
node --check customer-app/modules/*.js
node --check index.js
```

Static UI smoke:

- Open `customer-app/index.html`.
- Confirm scheduled submit is hidden/disabled until required fields and selected slot exist.
- Confirm urgent submit remains disabled.

Local API test:

- Run app locally with safe environment.
- Load price preview from `/public/pricing_preview`.
- Load availability from `/public/availability_v2`.
- Submit one scheduled booking with clearly marked safe test data only after owner approval.
- Confirm success shows `booking_code` and tracking link.
- Confirm `/public/track?q=...` can read the created test booking.

Legacy regression test:

- Open existing `customer.html`.
- Run pricing preview.
- Run availability.
- Submit a safe test scheduled booking.
- Confirm existing success UI and tracking link still work.

Urgent safety test:

- Verify Customer App V2 urgent button remains disabled.
- Search code for no V2 call sending `booking_mode: "urgent"`.
- Confirm no urgent offers are created during scheduled submit testing.

Protected file check:

```text
git diff --name-only HEAD~1..HEAD -- index.js customer.html track.html sw.js
```

Expected result: empty.

## Rollback Plan

If Phase 2B causes any issue:

- Revert only the Customer App V2 frontend commit that enabled submit.
- Keep `/public/book` untouched.
- Keep legacy `customer.html` as the working production booking path.
- Keep PR #38 draft until owner confirms behavior.
- If already pushed, push a revert commit to the PR branch; do not force-push unless explicitly approved.

## Recommendation

Proceed to Phase 2B only after owner approves:

- Required V2 customer fields.
- Scheduled-only submit scope.
- Whether success tracking links should prefer `booking_token` over `booking_code`.
- Safe test booking data and environment.
- Whether phone should be mandatory in V2 even though backend currently allows it to be blank.
