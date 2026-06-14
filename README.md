# CWF Services System

CWF Services System is the production web application for Coldwindflow air-service operations. It supports customer booking and tracking, admin job management, technician workflows, partner onboarding, promotions, accounting documents, payout support, and the AI Office admin workspace.

## Production Entry Points

- Backend: `index.js`
- Start command: `npm start` or `node index.js`
- Package manifest: `package.json`
- PWA service worker: `sw.js`
- PWA manifests: `manifest.json` and legacy `mainfest.json`
- AI Office admin workspace: lightweight CSS/card UI backed by `admin-ai-office.*` and `/admin/ai-office/*` APIs.

## Repository Map

- `server/`: extracted backend modules and route helpers.
- `server/routes/`: route modules used by the production app.
- `migrations/`: database migration history. Do not rewrite, reorder, or delete existing migrations.
- `docs/`: architecture notes, source-of-truth docs, route audits, and archived historical patch notes.
- `assets/`: static application assets and generated documents/media support assets.
- Root `admin-*.html/js`, `tech.html`, `customer.html`, `partner-*.html/js`: production frontend screens served by Express.

## Safety Rules

This repo runs production workflows. Keep changes narrow and trace the current flow before editing:

- Do not change auth, session, payment, accounting, tax, payout, or migration behavior without a dedicated task.
- Do not delete `migrations/`, `sw.js`, `manifest.json`, or `mainfest.json` without a focused reference audit and cache test.
- Keep historical patch notes under `docs/archive/patch-notes-legacy/` instead of the repository root.
- Update service-worker cache entries only when the referenced static files are intentionally changed.

## Local Verification

Install dependencies once:

```bash
npm install
```

Run syntax checks for touched JavaScript files:

```bash
node --check index.js
node --check sw.js
```

Start the production app locally:

```bash
npm start
```

## Documentation

Start with:

- `CODEX_INSTRUCTIONS.md`
- `docs/CWF_SOURCE_OF_TRUTH.md`
- `docs/CWF_SERVICE_AND_PRICING_RULES.md`
- `docs/REPO_ARCHITECTURE_AUDIT.md`
- `docs/archive/patch-notes-legacy/`
