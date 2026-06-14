# CWF Technician Base Status Patch

## Change Summary
- Added isolated internal module: Technician Base Status / Team Status Forge.
- Added admin-only page: `/admin/team-status` and `/admin-team-status.html`.
- Added admin APIs under `/admin/api/team-status` and `/admin/api/technicians/:username/...`.
- Added deterministic scoring engine for Base Status, Rank, Level, suitable jobs, risk warnings, development plan, and RPG image prompt.
- Uses existing technician profile image only for identity/display and prompt reference. It does not judge ability from face/photo.
- Added new table only: `public.technician_base_status_assessments`.
- Added Team Status menu link in Admin v2 menu.

## Files Changed / Added
- `index.js`
- `admin-v2-common.js`
- `admin-team-status.html`
- `admin-team-status.js`
- `migrations/technician_base_status_assessments.sql`

## Database
The app auto-creates the new table at startup via `index.js`.
Manual SQL is also provided in `migrations/technician_base_status_assessments.sql`.
No existing tables are altered.

## Manual Test Checklist
1. Deploy/start app normally.
2. Login as Admin/Super Admin.
3. Open `/admin/team-status` or Admin menu → Team Status.
4. Confirm technician list loads with existing profile images.
5. Click `ประเมิน` for a technician.
6. Fill questionnaire or use `เติมตัวอย่างทดสอบ`.
7. Submit and confirm Base Level, Rank, stats, suitable jobs, risk warnings, development plan display.
8. Confirm copy RPG prompt button works.
9. Confirm non-admin access is blocked by existing admin session guard.
10. Check existing flows still work: booking, technician app, tracking, E-Slip, pricing, Admin v2 pages.
11. Confirm there are no console errors on Team Status page.

## Rollback
- Remove the new route/helper block from `index.js`.
- Remove the Team Status link from `admin-v2-common.js`.
- Delete `admin-team-status.html` and `admin-team-status.js`.
- Optional DB rollback: `DROP TABLE IF EXISTS public.technician_base_status_assessments;`
