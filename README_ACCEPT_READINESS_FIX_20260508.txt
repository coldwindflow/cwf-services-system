CWF Accept Status + Daily Readiness Fix 2026-05-08

Changed files:
- index.js
- app.js
- tech.html
- sw.js

Fix summary:
1) รับงาน / หยุดรับงานด่วน
- Ready status is now treated as valid only when accept_status='ready' AND accept_status_expires_at > NOW().
- Expired ready status is auto-paused, including legacy rows with ready but no expiry.
- Pending urgent job offers for technicians auto-paused at midnight are also expired.
- Urgent offer target selection, dashboard open/closed summary, offer list, accept, decline, and time-proposal flows now sync expired accept status first.
- New technician profile default accept_status changed from ready to paused to prevent accidental open urgent status.

2) เช็คความพร้อมทำงานวันนี้
- Backend returns can_show only when technician has jobs today, Bangkok time is 05:00 or later, and readiness status is not ready.
- Technician UI hides the readiness card before 05:00 Bangkok time.
- After technician presses ready, the card hides immediately and remains hidden on reload because status is ready.

Manual production test checklist:
A. Urgent accept status
1. Login as technician.
2. Press รับงาน.
3. Confirm GET /technicians/:username/accept-status returns ready with accept_status_expires_at.
4. Force accept_status_expires_at to a past timestamp in DB, then refresh tech page.
5. Expected: status becomes paused, pending offers for that tech become expired, dashboard shows closed.
6. Fire urgent job. Expected: expired/paused technician is not included in offer targets.

B. Daily readiness
1. Technician has at least one job today.
2. Before 05:00 Bangkok time or by temporarily checking backend hour logic, card should not show.
3. At/after 05:00 Bangkok time, card shows if status is pending or not_ready.
4. Press พร้อมทำงาน.
5. Expected: card disappears immediately; refresh page and card remains hidden.
6. Admin readiness page should still see the recorded ready status.
