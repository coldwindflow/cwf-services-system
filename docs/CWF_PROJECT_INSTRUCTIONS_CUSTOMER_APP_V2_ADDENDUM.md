# CWF Project Instructions Addendum: Customer App V2

Status: Project instruction addendum for Customer App V2 planning and future implementation.

This file was added from the project prompt because the named source artifacts were not present in the workspace at audit time. If the owner supplies the original artifact later, compare before implementation.

## Required Reading

For any Customer App V2, customer booking, customer tracking, or urgent booking work, read:

1. `docs/CUSTOMER_APP_V2_SPEC_LOCK_WITH_URGENT_BOOKING.md`
2. `docs/CUSTOMER_APP_V2_CURRENT_AUDIT.md`
3. `docs/CUSTOMER_APP_V2_IMPLEMENTATION_PLAN.md`
4. `server/routes/public/README.md`
5. `docs/INDEX_JS_SPLIT_PLAN.md`

## Safety Rules

- Customer App V2 must be separated from legacy `customer.html`, `track.html`, and `index.js` business logic.
- Do not modify production public booking, availability, pricing preview, or tracking routes without an explicit implementation phase and rollback plan.
- Do not add new business logic into `index.js`.
- Do not create migrations in the skeleton or frontend-only phases.
- Do not touch payment, accounting, tax, payout, receipt mutation, or technician payout logic.
- Do not change service worker cache behavior during planning except to document risks.
- Keep legacy customer pages available until cutover is explicitly approved.

## Urgent Booking Language

Urgent booking must not be presented as confirmed before acceptance.

Required customer-facing concept:

`ส่งคำขอคิวด่วนแล้ว กำลังรอช่างกดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับ`

Avoid:

- `booking confirmed`
- `confirmed booking`
- `จองสำเร็จแล้ว`
- `ยืนยันคิวแล้ว`
- Thai wording that implies the technician is already assigned before acceptance

## Urgent Partner-First Rule

- Urgent booking is partner-first.
- Ready approved partner technicians should receive urgent offers before any company technician is considered.
- If no partner technician accepts within the timeout, route the job to Admin Fallback.
- Company technician assignment is allowed only by admin decision unless the owner explicitly approves automatic company urgent dispatch later.
- Existing public urgent behavior that sends offers to ready partner technicians is aligned with the owner intent and must not be treated as a bug.

## Recommended V2 Direction

- Phase 1 should create a frontend skeleton only.
- Phase 2 should use existing APIs without changing their behavior.
- Backend route extraction must wait until the frontend contract is understood and tests/checklists exist.
- Urgent lifecycle work must be a later explicit phase because current production logic already has partial urgent offer behavior and must not be destabilized.
