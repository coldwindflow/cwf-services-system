# Admin Service Catalog Manager — Phase 2A Handoff

## Scope

Admin-only CRUD tool for `public.catalog_items`, the same table the Customer App Store reads from. No database migration, no schema change, no seeded/mock data, no Air Conditioner Product Phase work.

## Existing contract confirmed before changes (read-only verification)

1. **Route factory mounting**: `server/routes/catalog/items.js` exports `createCatalogItemRoutes(deps)`, mounted in `index.js` via `app.use(createCatalogItemRoutes({ pool }))` at the `📦 CATALOG` section (originally line ~12959).
2. **Admin middleware**: the real middleware is `requireAdminSession` (defined in `index.js`, function declaration around line 1471). It is already injected into other route factories the same way (e.g. `createAdminAiOfficeControlCenterRoutes({ pool, requireAdminSession })`), and all `/admin/*` paths are additionally guarded globally via `app.use("/admin", requireAdminSession)` (line ~4399), which runs before the catalog routes are mounted.
3. **Existing write route**: `index.js` already had an **unauthenticated** `app.post("/catalog/items", ...)` (legacy, restricted to `item_category` enum `service`/`product`, no validation of `job_category`/`ac_type`/BTU/visibility). It was left untouched — modifying or removing it was outside the authorized scope for this phase and touches "Auth behavior", which is forbidden. It is noted here as a pre-existing condition, not introduced by this work.
4. **Columns actually used**: `item_id, item_name, item_category, base_price, unit_label, is_active, job_category, ac_type, btu_min, btu_max, is_customer_visible` — confirmed from the existing public `SELECT` in `server/routes/catalog/items.js`. No other columns assumed.
5. **Constraints**: none enforced in SQL beyond what the existing public route already relied on (`is_active`, `is_customer_visible` as booleans). No CHECK constraints were discovered in-repo (no migration file defines `catalog_items`, so the table predates this repo's migration history).

No scope mismatch was found — the existing structure supports this phase safely without any schema change.

## What was built

- **`server/routes/catalog/items.js`** (existing file, edited):
  - Public `GET /catalog/items` is **unchanged byte-for-byte** in behavior (same WHERE clause construction, same filters, same response shape).
  - Added three new admin endpoints, all requiring the injected `requireAdminSession` middleware:
    - `GET /admin/catalog/items` — returns all rows (active + inactive), no filtering server-side (search/status filtering is done client-side in the admin UI).
    - `POST /admin/catalog/items` — creates a new row. Defaults: `is_active=true`, `is_customer_visible=false` (a new item is never silently customer-visible).
    - `PATCH /admin/catalog/items/:itemId` — partial update. Fetches the existing row, merges only the fields present in the request body onto it, validates the merged result, then writes all columns back (this guarantees fields the client didn't send are never changed, without building dynamic SQL column lists from client input).
  - The route factory now **requires** `deps.requireAdminSession` to be a function and throws at construction time if it's missing — this makes it impossible to accidentally mount the admin routes without real auth.
  - Validation (`validateMergedCatalogItem`): name required, price optional but must be `>= 0` if given, BTU fields optional positive numbers, `btu_min <= btu_max` when both present, booleans normalized safely from string/boolean/number input. Error responses return a short Thai message only — never SQL text or stack traces (errors are logged server-side via `console.error`, matching the existing pattern in this file).
  - Hard delete is never used; deactivation is `PATCH { is_active: false }`.
  - All SQL is parameterized (`$1, $2, ...`); no client input is ever used to build a column name or table name.

- **`index.js`** (one-line change only): `app.use(createCatalogItemRoutes({ pool }))` → `app.use(createCatalogItemRoutes({ pool, requireAdminSession }))`, the minimum change needed to wire the real admin middleware into the route factory.

- **`admin-store-catalog.html`** (new): admin page following the existing `admin-promotions-v2.html` convention (same `/style.css`, same `/admin-v2-common.js` shared script for `apiFetch`/`el`/`showToast`, same `.card`/`.svc-row`/button class conventions). Contains: create/edit form, search box, Active/Inactive filter, Customer-Visible/Hidden filter, item list with per-row Edit / Toggle Active / Toggle Visible buttons, and a read-only Store Preview section.

- **`admin-store-catalog.js`** (new): all client logic — loads from `/admin/catalog/items` via the shared `apiFetch` helper (which already attaches the admin session cookie/token), client-side search/filter, form validation mirroring the server, a double-submit guard (`isSaving` flag + disabling the save button while a request is in flight), a `confirm()` prompt before deactivating an item that is currently both active and customer-visible, and a live hint ("✅ รายการนี้จะแสดงในร้านค้าลูกค้า") shown whenever the form's Active + Customer-Visible selects are both "on". The Store Preview section only lists items where `is_active && is_customer_visible`, computed from the same data just loaded from the real API — no separate/mock data source.

- **`test/catalogItemsRoutes.test.js`** (new): 16 tests using an in-memory fake `pool` (same style as `test/customerAuth.test.js`) plus a real `express` + `http` server per test (no mocked HTTP layer). Covers public filtering behavior, admin auth rejection/acceptance, create/update validation (including `btu_min > btu_max`), partial-update field preservation, deactivate-via-update (not delete), and a SQL-injection attempt that is asserted to never appear in the literal SQL text sent to `pool.query` (only ever passed as a bound parameter). Also asserts the exact `index.js` wiring line via source-text match.

## Not touched (forbidden / out of scope)

Database schema, migrations, seed/production data, Air Conditioner product tables, payment, auth behavior (beyond the one DI wire-up), pricing calculation, booking, availability, urgent flow, tracking, technician app, customer app runtime/UI, promotions, production configuration. The Customer App Store (`customer-app/modules/store.js`) was read for reference only and was not modified in this phase.

## Tests run

```
node --check server/routes/catalog/items.js     -> OK
node --check admin-store-catalog.js             -> OK
node --test test/catalogItemsRoutes.test.js     -> 16/16 pass
node --test test/customerAppRecovery.test.js    -> 25/25 pass (unchanged, regression check)
npm test                                        -> 198 pass / 10 skipped / 0 fail
git diff --check                                -> clean
```

## Remaining risks / what Phase 2B should pick up

- **Browser QA not performed** for `admin-store-catalog.html` at any breakpoint — no headless browser tooling is available in this sandbox. The mobile-usable CSS follows the same classes already used by `admin-promotions-v2.html`, but visual verification in a real browser (320/360/390/430px and desktop) is still outstanding.
- The pre-existing unauthenticated `POST /catalog/items` legacy route in `index.js` was deliberately left as-is (out of scope for this phase) — worth flagging to whoever owns Auth/Production routes, since it currently allows creating catalog rows without any admin session.
- No server-side search/pagination was added to `GET /admin/catalog/items` — fine for the current catalog size, but if the catalog grows large this endpoint should add filtering/pagination in a later phase.
- Phase 2B (Air Conditioner Product Phase) was explicitly not started, per scope.
