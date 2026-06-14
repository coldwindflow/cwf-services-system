# CWF Repository Architecture Audit

Date: 2026-05-10

This document records the current production repository shape after pulling the latest `main` branch. It is a preparation artifact only. It does not authorize moving business logic, changing route paths, or editing production runtime behavior.

## Current Repo Summary

- Main backend entry: `index.js`
  - `package.json` points `main` to `index.js`.
  - Production start command remains `node index.js`.
  - The file currently contains Express setup, middleware, auth/session helpers, route handlers, database queries, PDF/document generation, pricing, availability, technician, admin, public booking, partner, accounting, and static page routing.
- Database pool entry: `db.js`
  - CommonJS module exporting a PostgreSQL pool.
- Frontend files:
  - Large shared/customer technician UI files include `app.js`, `tech.html`, `customer.html`, `track.html`, `install-quote.html`, and `style.css`.
  - Admin v2 screens are split into many `admin-*-v2.html` and `admin-*-v2.js` files.
  - Partner screens include `partner-apply`, `partner-status`, `partner-agreement`, `partner-academy`, and `partner-dashboard` HTML/JS pairs.
- PWA files:
  - `sw.js`
  - `manifest.json`
  - `mainfest.json` appears to be a legacy or misspelled manifest file and should not be removed without a separate audit.
  - `cwf-pwa.js`
  - `cwf-loader.js` and `cwf-loader.css`
  - icon assets in the repository root.
- Existing server modules:
  - `server/customerLookup.js`
  - `server/normalizers.js`
  - `server/pricing.js`
  - `server/technicianIncome.js`
  - `server/technicianJobIncomeDisplay.js`
  - `server/technicianJobMoneySummary.js`
  - `server/technicianRework.js`
- Migrations folder:
  - Contains partner onboarding, LINE login, technician base status, and deduction/rework center migrations.
  - Treat migrations as production history. Do not rewrite or reorder existing migrations.
- Existing docs:
  - `CODEX_INSTRUCTIONS.md`
  - `README.md`
  - `docs/CWF_SOURCE_OF_TRUTH.md`
  - `docs/CWF_SERVICE_AND_PRICING_RULES.md`
  - `docs/INDEX_SPLIT_NOTES.md`
  - Historical patch notes under `docs/archive/patch-notes-legacy/`.

Note: old snapshot copies under `docs/index.js`, `docs/app.js`, `docs/tech.html`, and `docs/sw.js` were removed during the 2026-06-14 safe cleanup after a reference audit found no runtime references.

## Risk Notes

This repo serves a production app with tightly coupled flows. Broad refactors are unsafe until route maps, dependency maps, and regression tests exist.

High-risk systems include:

- auth/session
- public booking
- availability/timezone
- customer pricing
- LINE login
- technician close job/finalize
- photos, `job_units`, and per-unit evidence
- payout and technician income
- accounting, tax, VAT, receipts, slips, and withholding documents
- customer tracking
- admin booking and job edit flows

## index.js Audit

- Approximate line count: 27,007 lines.
- Approximate route registration count: 348 `app.get/post/put/patch/delete/use` registrations.
- Route registration groups detected by path prefix:
  - `admin`: about 172
  - `tech`: about 59
  - `jobs`: about 29
  - static/html/other: about 20
  - `partner`: about 18
  - `public`: about 12
  - `api`: about 10
  - `auth`: about 7
  - smaller groups include `offers`, `docs`, `attendance`, `catalog`, `promotions`, `users`, `internal`, `uploads`, `login`, and `test-db`.

### Major Route Groups

- Auth and session:
  - LINE login and callbacks.
  - Public customer JWT helpers and logout/register/profile routes.
  - Admin/technician session guards.
- Partner onboarding:
  - Application submission, document upload, status, agreement, academy, certification, interview, and trial job routes.
- Admin:
  - Dashboard, profile, super admin, users, technician income rates, payouts, deductions, rework, job management, schedule, promotions, media retention, accounting, tax, reports, and debug routes.
- Technician:
  - Payouts, income summaries, work calendar, readiness, service matrix, base status, push notifications, offers, job status changes, photos, job units, finalize, and assignment completion.
- Public/customer:
  - Pricing preview, availability, public booking, tracking, review submission, and customer profile/session routes.
- Documents:
  - Quotes, receipts, e-slip, accounting documents, tax documents, and print routes.
- Static HTML:
  - Login/admin/technician/customer/partner/static page routing and redirects.

### Major Helper Groups

- Environment flags and feature gates.
- Service zone and map coordinate parsing.
- Cloudinary upload and deletion helpers.
- JWT/cookie helpers.
- Auth/session middleware.
- Pricing and normalizer helpers from `server/pricing.js` and `server/normalizers.js`.
- Technician income helpers from `server/technicianIncome.js`, `server/technicianJobIncomeDisplay.js`, and `server/technicianJobMoneySummary.js`.
- Technician rework helpers from `server/technicianRework.js`.
- Job item/unit/photo/evidence helpers.
- Payout period, payout generation, and technician money summary helpers.
- Accounting, tax, VAT, document, and PDF helpers.
- Public availability and booking helpers.

### Shared Dependencies

- Express app instance and middleware.
- `pool` from `./db`.
- `upload` from Multer.
- `path`, `fs`, `crypto`, and `https`.
- Environment variables and feature flags.
- Session helpers such as admin, super admin, technician, customer JWT, and internal API key guards.
- Pricing, income, rework, normalizer, and customer lookup modules under `server/`.

### Parts That Should Stay Frozen For Now

Do not move or rewrite these areas until tests and route maps exist:

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

## Current Structural Problem

The repository is difficult for AI and humans to safely edit because one very large `index.js` mixes app setup, shared dependencies, helpers, route definitions, business logic, SQL queries, and document generation. This makes context loading expensive and increases the risk of accidental duplicate logic or behavior changes.

The safe first step is not route extraction. The safe first step is documentation and empty folder boundaries so future tasks can target a small area with an explicit migration pattern.

