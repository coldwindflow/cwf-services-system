# CWF Technician Master Spec Missing

The expected central technician specification file is not present in this repository:

```text
CWF_Technician_App_Master_Spec.md
```

Future AI/code agents must be given the master technician app spec before modifying technician app files or technician backend routes.

## Files And Areas Covered By This Warning

Do not modify these areas without the master spec and a targeted task:

- `tech.html`
- technician-facing JavaScript and preload files
- technician route handlers in `index.js`
- technician income display routes
- technician payout routes
- technician close-job/finalize routes
- technician photos, `job_units`, and evidence routes
- technician work calendar/readiness routes
- technician LINE/session behavior

## Required Future Workflow

Before changing technician behavior:

- Provide or restore `CWF_Technician_App_Master_Spec.md`.
- Read `CODEX_INSTRUCTIONS.md`.
- Grep the exact route or frontend function before editing.
- Identify the exact frontend caller, backend route, database tables, cache/PWA impact, and regression checklist.
- Stop and document instead of editing if the spec is unavailable or conflicts with the requested change.

