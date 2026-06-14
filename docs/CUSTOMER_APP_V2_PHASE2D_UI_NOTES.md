# Customer App V2 Phase 2D UI Notes

## Scope

Phase 2D polished the Customer App V2 static frontend so the app feels closer to a premium mobile customer service experience.

No backend routes, booking payload contract, urgent dispatch, existing tracking behavior, service worker behavior, payment, tax, receipt, accounting, merge, or deploy behavior was changed.

## UI / UX Improvements

### Overall App Feel

- Refined the mobile app shell with stronger CWF navy/blue/yellow branding.
- Improved hero cards, soft shadows, spacing, touch targets, and card hierarchy.
- Kept the bottom navigation to exactly four tabs:
  - หน้าแรก
  - จองคิว
  - ติดตาม
  - บัญชี
- Removed viewport-scaled heading sizes that could create awkward Thai wrapping.
- Preserved horizontal overflow guards for 390px mobile viewport.

### Home

- Reworked the home hero into a clearer CWF service entry point.
- Strengthened primary CTAs:
  - จองคิวบริการ
  - ติดตามงาน
  - โทร / LINE หา CWF
- Added stronger trust cues:
  - ราคาชัดเจน
  - ช่างผ่านการทดสอบ
  - รับประกันงานล้าง
- Improved catalog, promotion, coverage, and trust sections with clearer labels.

### Booking Mode

- Made `จองล่วงหน้า` and `คิวด่วน` visually distinct.
- Added short customer-facing explanations so the difference is understandable quickly:
  - Scheduled booking = customer chooses preferred date/time.
  - Urgent booking = customer sends a request for ready partner technicians to accept.
- Preserved the warning that urgent is not confirmed until partner acceptance or admin confirmation.

### Scheduled Booking

- Turned the scheduled flow into a more guided booking wizard.
- Improved customer input placeholders and section structure.
- Improved price preview cards, promo message, and available slot chips.
- Improved final review card and final price warning.
- Improved success card with a stronger confirmation surface.
- Improved error state presentation while preserving entered data behavior.
- Did not change the `/public/book` payload contract.

### Urgent Waiting Room

- Kept urgent as skeleton-only.
- Kept urgent submit disabled.
- Made the waiting room feel more active and customer-friendly.
- Preserved exact urgent wording:

> ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน

### Tracking

- Improved tracking lookup layout.
- Improved tracking result visual hierarchy.
- Improved scheduled and urgent timeline headers.
- No old `track.html` redirect was added.
- Existing `/public/track` behavior remains untouched.

### Profile

- Improved guest/profile framing.
- Made saved address and history/rebook areas feel more intentional.
- Login remains secondary.

## Preview Package

Screenshots were generated through a local mock preview server only. No production booking was created.

Preview folder:

```text
C:\Users\ADMIN\Desktop\repo cwf\customer-app-v2-phase2d-preview
```

Preview ZIP:

```text
C:\Users\ADMIN\Desktop\repo cwf\customer-app-v2-phase2d-preview.zip
```

Screenshots included:

- `01-home.png`
- `02-booking-mode.png`
- `03-scheduled-input.png`
- `04-scheduled-review.png`
- `05-scheduled-success.png`
- `06-scheduled-error.png`
- `07-tracking.png`
- `08-profile.png`
- `09-urgent-waiting-room.png`

## Visual QA Notes

Checked in a 390px mobile viewport using a local mock preview server:

- Home loaded with no horizontal overflow.
- Booking mode loaded with no horizontal overflow.
- Scheduled input loaded with no horizontal overflow.
- Scheduled review, success, and error states rendered from preview-only state injection.
- Tracking loaded with mock read data.
- Profile loaded in guest mode.
- Urgent waiting room loaded, preserved exact urgent wording, and kept urgent submit disabled.
- Browser console had no errors during screenshot generation.

## Safety Notes

- `index.js` unchanged.
- `customer.html` unchanged.
- `track.html` unchanged.
- `sw.js` unchanged.
- `/public/track` behavior unchanged.
- `/public/book` payload contract unchanged.
- Urgent submit and urgent dispatch remain disabled.
- No real production booking was created.
- No merge or deploy was performed.

## Remaining UI Limitations

- Final visual sign-off still needs owner review on real device sizes.
- Thai copy is improved but may need brand-tone review from CWF owner.
- Login buttons are still disabled because Google/LINE auth is not in this phase.
- Some preview states use local mock data only; one safe scheduled booking test still needs staging or owner-approved test data.
