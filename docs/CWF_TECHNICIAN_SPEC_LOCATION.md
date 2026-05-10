# CWF Technician Master Spec Location

The approved central technician specification now exists at the repository root:

```text
../CWF_Technician_App_Master_Spec.md
```

Future AI/code agents must read this master technician app spec before modifying technician app files or technician-related backend routes/services.

## Files And Areas Covered By This Rule

Do not modify these areas without reading the master spec and following a targeted task:

- `tech.html`
- `app.js`
- `sw.js`
- `index.js` routes used by the technician app
- `server/technicianIncome.js`
- `server/technicianJobIncomeDisplay.js`
- `server/technicianRework.js`
- `server/routes/technician/*`
- `server/services/technician/*`
- `server/services/jobs/*` close-job, evidence, and unit logic

## Required Workflow

Before changing technician behavior:

- Read `../CWF_Technician_App_Master_Spec.md`.
- Read `CODEX_INSTRUCTIONS.md` if present.
- Grep the exact route or frontend function before editing.
- Identify the exact frontend caller, backend route, database tables, cache/PWA impact, and regression checklist.
- Stop and document instead of editing if the spec conflicts with the requested change.
