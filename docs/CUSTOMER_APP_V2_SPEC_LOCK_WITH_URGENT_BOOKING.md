# Customer App V2 Spec Lock With Urgent Booking

Status: Locked planning reference for Customer App V2.

This file was added from the project prompt because the named source artifacts were not present in the workspace at audit time:

- `CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`
- `CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`
- `CWF_CUSTOMER_APP_V2_SPEC_AND_PROJECT_PROMPT.zip`

If the owner provides the original source files later, compare them against this file before implementation.

## Purpose

CWF needs a premium, mobile-first Customer App V2 separated from legacy `customer.html`, `track.html`, and `index.js` business logic.

Customer App V2 must start by using current production APIs safely, then move toward extracted backend route modules only after route maps, regression checks, and owner decisions are complete.

## Booking Modes

### Scheduled Booking / จองล่วงหน้า

- Customer selects date and time from real technician availability.
- Suitable for normal air cleaning, planned jobs, condos, and multi-unit jobs.
- Scheduled booking may enter the existing admin review or assignment flow depending on current production policy.
- Do not change production availability, pricing, booking, payment, tax, accounting, payout, or receipt logic during V2 skeleton work.

### Urgent Booking / จองคิวด่วน

- Customer sends an urgent job request.
- Technicians may accept or decline.
- Urgent dispatch is partner-first.
- Ready approved partner technicians may accept or decline.
- Urgent booking is not confirmed until a partner technician accepts or admin confirms.
- If no technician accepts, the system must offer admin fallback or conversion to scheduled booking.
- Company technicians must not be automatic first-round urgent dispatch unless the owner explicitly approves later.

## Locked Urgent Booking Rules

- Customer must clearly understand this is only an urgent request until accepted.
- Use wording like: `ส่งคำขอคิวด่วนแล้ว กำลังรอช่างกดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับ`.
- Do not say `จองสำเร็จแล้ว`, `ยืนยันคิวแล้ว`, or `booking confirmed` before partner technician acceptance or admin confirmation.
- Urgent booking must have a Waiting Room.
- Urgent booking must show timeout.
- Urgent booking must show that technicians can accept or decline.
- Urgent booking must support Admin Fallback.
- Urgent booking must allow conversion to Scheduled Booking.
- Technicians may decline and should provide a decline reason if possible.
- Urgent offers should be sent in rounds:
  1. Ready approved partner technicians in the customer area.
  2. Ready approved partner technicians in nearby or adjacent zones.
  3. Admin fallback.
  4. Optional company technician assignment by admin decision only.
- Only one technician can accept later; backend must use transaction or conditional update when implemented.
- Partner technician acceptance may confirm directly or may require admin confirmation depending on CWF policy.
- Company technician assignment is an admin fallback decision only unless the owner explicitly approves automatic company urgent dispatch later.

## Separation Rule

Customer App V2 must not add new business logic into `index.js`. It should start as a separate frontend surface and use existing APIs until backend extraction is explicitly authorized.

Legacy `customer.html` and `track.html` must remain available during the V2 build. Do not delete or replace them until cutover is approved and rollback is documented.

## Forbidden For Initial Work

- Do not modify `/public/book`.
- Do not modify `/public/availability_v2`.
- Do not modify `/public/pricing_preview`.
- Do not modify `/public/track`.
- Do not change payment, tax, accounting, payout, receipt mutation, technician payout, or production data logic.
- Do not run or create database migrations.
- Do not delete `customer.html` or `track.html`.
- Do not add secrets or env values.
- Do not add new business logic into `index.js`.
- Do not implement Google Login yet.
- Do not implement true urgent dispatch yet.
- Do not modify service worker cache unless only documenting risk.

## Initial Authorized Files

- `docs/CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`
- `docs/CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`
- `CLAUDE.md` only to add a short reference rule to the new spec
- `docs/CUSTOMER_APP_V2_CURRENT_AUDIT.md`
- `docs/CUSTOMER_APP_V2_IMPLEMENTATION_PLAN.md`
- `docs/CUSTOMER_APP_V2_CODEX_REPO_AUDIT.md`

## Implementation Gate

Before any Customer App V2 runtime code is implemented:

- Read this spec first.
- Read `docs/CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`.
- Read the current audit and implementation plan docs.
- Confirm the authorized file list for the phase.
- Confirm owner decisions for partner acceptance confirmation policy, timeout behavior, customer messaging, adjacent-zone definition, and fallback ownership.
