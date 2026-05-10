# AI Editing Guide For CWF

CWF is a production app. Future Codex tasks must treat this repository as high risk unless the requested change is narrow and fully traced.

## Required Before Editing

- Always pull/read the latest repo files directly.
- Always read `CODEX_INSTRUCTIONS.md`, `README.md`, `package.json`, and relevant docs.
- Always grep the route before editing.
- Always identify the exact route and function.
- Always identify frontend callers if the change touches an API.
- Always state files to edit before editing.
- Always inspect `git diff` before finishing.

## Hard Rules

- Never rewrite `index.js`.
- Never do broad cleanup in the same patch as a behavior fix.
- Never create duplicate logic.
- Never change route paths during extraction.
- Never change DB queries unless the task explicitly requires it.
- Never change auth/session as a side effect.
- Never change pricing, booking, availability, LINE login, accounting, tax/VAT, technician income, payout, close-job, or tracking behavior during unrelated work.
- Preserve CommonJS style.
- Production must still start with `node index.js`.

## Preferred Extraction Pattern

Prefer route factory modules:

```js
module.exports = function createXRoutes(deps) {
  const router = deps.express.Router();

  router.get("/existing/path", deps.requireAdminSession, async (req, res) => {
    // moved handler only after tests pass
  });

  return router;
};
```

Guidelines:

- Pass dependencies explicitly.
- Keep route paths exactly the same.
- Keep response shapes exactly the same.
- Keep middleware order exactly the same.
- Keep SQL text and parameters exactly the same unless the task is a DB fix.
- If extracting, delete the old duplicate route from `index.js` in the same patch only after tests pass.
- If unsure, stop and document instead of editing.

## How To Work With index.js

1. Search for the exact route path:

```bash
rg -n "route_or_function_name" index.js
```

2. Read enough surrounding context to understand:

- middleware
- shared helpers
- DB tables
- request payload
- response shape
- frontend caller
- cache/PWA impact

3. Make the smallest patch possible.

4. Run syntax checks:

```bash
node --check index.js
```

5. If any JS file changed, run `node --check` on it.

6. Re-open `git diff` and confirm only intended files changed.

## High-Risk Frozen Areas

DO NOT MOVE YET:

- `/public/book`
- `/public/availability_v2`
- `/public/pricing_preview`
- `/admin/book_v2`
- `/admin/job_v2` edit logic
- auth/session routes
- LINE login routes
- payout calculation
- technician finalize/close job
- accounting documents and tax routes
- customer tracking

## Manual Test Checklist For Future Phases

Run the relevant checks for the phase being changed:

- App starts with `node index.js`.
- Login works.
- Technician page loads.
- Technician current job tab loads.
- Technician history tab loads.
- Technician income tab loads.
- Admin add job still works.
- Admin job edit still works if touched.
- Public booking still works.
- Public availability still returns correct slots.
- Public tracking still works.
- Close job still works.
- Photos and per-unit evidence still work.
- Payout and technician income displays still match prior behavior.
- Accounting/tax documents still render if touched.
- PWA cache refreshed when frontend JS changes.

