# FindFix separated app shell patch

This patch intentionally adds only the `findfix/` folder.
It does not modify CWF Admin v2, `index.js`, database schema, booking routes, payout routes, pricing logic, or technician flows.

Entry link:

- `/findfix/`

What it includes:

- Separate FindFix login/demo entry
- Multi-workspace demo structure with tenant IDs
- Dashboard, workspaces, jobs, technicians, customers, finance, settings
- Demo CRUD for jobs, technicians, workspaces
- Data stored in browser localStorage under `findfix.v1.*`

Safe rollback:

- Delete the `findfix/` folder only.
