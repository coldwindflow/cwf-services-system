# CWF Technician Payout Upcoming + Early Pay Patch

## What changed
- Added separated payout period services under `server/services/` instead of putting new period-calendar logic into `index.js`.
- Accounting/Admin payout page now shows stored periods plus virtual current/upcoming periods.
- Draft/virtual periods are calculated live from the contract payout engine, so Admin can see current accrued income by technician before the due date.
- Early payment is allowed only after the payout cutoff period has closed. When Admin records payment before the due date, the backend creates the payout period if missing, regenerates contract payout lines, snapshots them, and then locks the period before storing the real payment.
- UI now marks `preview`, `จ่ายก่อนได้`, `ยังไม่ปิดยอด`, and disables the pay button when the cutoff has not closed.

## Safety / No regression
- Locked or paid periods still use stored `technician_payout_lines` snapshots.
- Draft/virtual periods never trust old cached lines; they use live contract recompute.
- Payment still requires `confirm_paid=true` and still rejects overpayment.
- Periods whose cutoff has not closed return `PAYOUT_PERIOD_NOT_CLOSED` and are not payable yet.

## Test checklist
1. Open `/admin-accounting-v2.html`, tab `จ่ายเงินช่าง`.
2. Confirm the list shows both existing payout periods and upcoming preview periods.
3. Click an upcoming period whose cutoff is already closed and due date is still in the future; rows should show technician accrued totals and the pay button should be enabled.
4. Click an upcoming period whose cutoff has not closed; rows should show accrued totals so far, but the pay button should be disabled.
5. Record a payment on an early-payable period. Backend should create the period if missing, regenerate/snapshot payout lines, lock the period, and store the payment.
6. Re-open the same period and verify it now uses stored locked/paid snapshot totals, not live recalculation.

## Static checks run
- `node --check index.js`
- `node --check server/routes/accountingReadOnly.js`
- `node --check server/services/technicianPayoutPeriods.js`
- `node --check server/services/technicianPayoutPrepay.js`
- `node --check admin-accounting-v2.js`
