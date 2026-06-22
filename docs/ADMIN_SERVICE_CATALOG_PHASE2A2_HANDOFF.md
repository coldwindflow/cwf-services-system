# Admin Service Catalog — Phase 2A.2 Handoff (Service Media, Real Pricing, Mobile Admin UX)

## Production-blocker fixes (post PR #84 review)

A review of PR #84 found several production blockers, all fixed on the same branch (no new branch, no new PR):

1. **No DDL in any request path.** `ensureCatalogMediaPricingSchema()` (which ran `ALTER TABLE`/`CREATE INDEX`/`ADD CONSTRAINT` on first request) has been removed entirely from `server/routes/catalog/items.js`. Routes now call a read-only `isMediaPricingSchemaReady()` capability check (`information_schema.columns`) and pick between `CATALOG_SELECT_WITH_PRICING` and a column-minimal `CATALOG_SELECT_LEGACY` fallback. The additive migration is the only thing that ever adds the columns/index/FK — see "Run command" below.
2. **Client lifecycle correctness.** All request validation (and, for PATCH, the pre-existing-row read) now happens via `pool.query()` *before* `pool.connect()` is ever called. `pool.connect()` is called at most once per request, immediately followed by a single `try/catch/finally { client.release(); }` — eliminating any double-release or release-skipped-on-early-return risk.
3. **Stricter pricing validation.** `normal_price`/`active_price` must be present and `> 0` (empty string no longer silently coerces to `0` and passes); `active_price` must not exceed `normal_price`; `effective_from`/`effective_to` are validated as real dates and `effective_from` must not be after `effective_to`. Any failure returns `400` with no partial DB write.
4. **`pricing: null` no longer unlinks the existing price rule.** Tri-state semantics: `pricing` omitted → leave untouched; `pricing: null` → no-op, the existing linked rule (if any) is preserved as-is; `pricing: {...}` → create/update the linked rule.
5. **Admin Edit no longer corrupts promo data.** The admin pricing-input contract field is now `pricing_is_active` (renamed from the ambiguous `is_active`, which collided with the catalog item's own `is_active`). The server now returns a raw `pricing_is_active` flag (the rule's stored `is_active`, independent of the effective-date window) plus `effective_from`/`effective_to`, so `admin-store-catalog.js`'s edit modal can populate all pricing fields instead of guessing — `cm_effective_from`/`cm_effective_to` were previously left blank on every edit, and `cm_pricing_is_active` was hardcoded to `"1"` regardless of the rule's real state. Both are fixed.
6. **Image delete is DB-first, Cloudinary-cleanup-best-effort.** `DELETE /admin/catalog/items/:itemId/image` now clears `image_url`/`image_public_id` in the database unconditionally first, then attempts the Cloudinary delete in a separate `try/catch` that only logs (with secrets redacted) and never affects the HTTP response — a Cloudinary outage can no longer block clearing a broken/stale image reference.
7. **Public API contract corrected.** `GET /catalog/items` (and the admin GET) now emit `active_price`, `has_active_promotion`, `effective_from`, `effective_to` as the primary/canonical field names. The previous names `sale_price`/`has_promo` are kept as additive backward-compatible aliases. `customer-app/modules/store.js`'s `hasPromo()` was updated to read the new primary names.
8. **Migration runner rollback claim corrected (see below).**

## Status: production migration has **NOT** been run

This branch's migration file (`migrations/20260622_catalog_store_media_pricing.sql`) has only ever been executed against the Node-driven test suite (an in-memory fake client) and, when available locally, a disposable `cwf_test` Postgres database used by the integration test in `test/catalogStoreMediaPricingMigration.test.js`. **It has never been run against staging or production.** Do not run `scripts/run-catalog-store-media-pricing-migration.js` against a real environment until this PR has been reviewed and a deployment window is scheduled.

## Scope of this phase

1. Replace the always-open long admin form with a compact mobile-first card list + Add/Edit modal (5 sections).
2. Wire Cloudinary image upload (create-item-first, then upload) to the existing `/admin/catalog/items/:itemId/image` endpoints.
3. Show real images and real (rule-based or base) prices on the Customer Store cards.
4. Fix two correctness issues found while resuming: the Cloudinary folder path/env handling, and the migration's FK-idempotency check being scoped only by `conname` (a false positive risk if an unrelated table reused the same constraint name).

## Migration

- File: `migrations/20260622_catalog_store_media_pricing.sql`
- Additive only: 3 nullable columns on `public.catalog_items` (`image_url`, `image_public_id`, `price_rule_id`), 1 index, 1 idempotent FK to `public.customer_service_price_rules(rule_id)` with `ON DELETE SET NULL`.
- The FK-existence check is scoped by joining `pg_constraint` → `pg_class` → `pg_namespace`, filtering on `nsp.nspname = 'public'`, `rel.relname = 'catalog_items'`, `con.contype = 'f'`, and the constraint name — not just the constraint name alone. This avoids a false "already exists" positive if a different table happens to have an identically-named constraint. `server/routes/catalog/items.js`'s own boot-time `ensureCatalogMediaPricingSchema()` runtime guard was updated with the identical scoped check, so the inline runtime DDL and the standalone migration file never drift apart.
- Run command (staging/production, when authorized):
  ```
  DATABASE_URL=... node scripts/run-catalog-store-media-pricing-migration.js
  ```
- The runner takes a Postgres advisory lock (`ADVISORY_LOCK_KEY`, distinct from the customer-auth migration's lock key) before running, and verifies the new columns/index/FK exist afterward — non-zero exit if verification fails.
- **Rollback scope, precisely stated:** the migration SQL file itself contains its own internal `BEGIN; ... COMMIT;`. If `client.query(sql)` throws (the migration statement itself fails), the runner rolls back *that* transaction before releasing the advisory lock. However, if the migration SQL succeeds (and therefore already committed) and only the *post-commit* `verifySchema()` check fails, there is nothing left to roll back — the runner does not attempt a `ROLLBACK` in that case, since one would be a no-op at best and misleading at worst. A non-zero exit code on verification failure means "the columns/index/FK could not be confirmed afterward," not "the migration was undone."

## Required environment variables

- `DATABASE_URL` — required by the migration runner.
- Cloudinary, one of:
  - `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>` (preferred, takes precedence if present and complete), or
  - the discrete trio: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- If Cloudinary is not configured, image upload/delete fail fast with `CLOUDINARY_NOT_CONFIGURED` (mapped to HTTP 503) — the rest of the catalog (text fields, pricing) still works without it.
- Cloudinary images are stored under `cwf/catalog/services/{itemId}` where `{itemId}` is sanitized to a positive integer before being used in any folder path (rejects path traversal / non-numeric input before any network call).

## Schema verification steps (after running the migration)

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='catalog_items'
   AND column_name IN ('image_url','image_public_id','price_rule_id');

SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='catalog_items'
   AND indexname='idx_catalog_items_price_rule_id';

SELECT con.conname FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname='public' AND rel.relname='catalog_items'
   AND con.contype='f' AND con.conname='catalog_items_price_rule_id_fkey';
```
All three queries must return rows. `scripts/run-catalog-store-media-pricing-migration.js` already runs this verification automatically and exits non-zero if anything is missing.

## Deploy order

1. Confirm `CLOUDINARY_URL` (or the discrete trio) is set in the target environment's secrets — without it, image upload returns 503 but nothing else breaks.
2. Run the migration during a planned deployment window (advisory-locked, so it is safe to run once even if a deploy retries).
3. Deploy the application code (this PR). The route layer's `ensureCatalogMediaPricingSchema()` is a defensive idempotent guard, not a substitute for running the real migration — it exists only so the app doesn't crash if it boots before the migration has run, not as the primary migration path.
4. Smoke test (see below) in the target environment before announcing the feature.

## Smoke test (after deploy)

1. Open `/admin-store-catalog.html`, click "+ เพิ่มบริการ", fill the 5 sections, save. Confirm the card appears in the list with the right name/category/badges.
2. Edit the same item, upload a JPEG/PNG/WebP under 5MB. Confirm the thumbnail appears in the card list and the Customer Store preview.
3. Edit again, click "ลบรูปภาพ", confirm. Confirm the image is cleared and the card falls back to the placeholder.
4. Set a discounted price rule (normal_price > active_price) and confirm: Customer Store shows the active price prominently with the normal price struck through, plus the campaign/label badge.
5. Confirm an item with no price rule and `base_price = 0` shows "สอบถามราคา" everywhere (admin card and Customer Store), and no mock/placeholder data ever appears.

## Rollback plan (application-only — never drop columns once they hold data)

If this needs to be rolled back after data has been written to the new columns:

- **Do not** run the SQL rollback comment block at the bottom of the migration file (`DROP COLUMN ...`) once `image_url`/`image_public_id`/`price_rule_id` hold real data — that is destructive and irreversible.
- Instead, roll back at the **application layer only**:
  1. Revert `admin-store-catalog.html`/`.js`/`.css` and `customer-app/modules/store.js` to the previous commit (the old long-form admin UI and the old plain-price Store cards). The underlying columns being present but unused is harmless.
  2. Leave the migration's additive columns, index, and FK in place — they are nullable and additive, so older application code that doesn't reference them continues to work unchanged.
  3. Only consider dropping the columns/index/FK (using the commented rollback SQL in the migration file) in a separate, explicitly-reviewed change, and only after confirming no production row depends on them.

## Files changed in this phase

- `migrations/20260622_catalog_store_media_pricing.sql` — FK-idempotency scoping fix.
- `server/routes/catalog/items.js` — same FK-idempotency fix applied to the inline `ensureCatalogMediaPricingSchema()` runtime guard; `wash_variant`/`label`/`priority` now read/written on the existing `customer_service_price_rules` columns (no new migration — these columns already existed via `ensureCustomerPriceBookSchema` in `server/customerPricing.js`).
- `server/lib/cloudinaryImageUpload.js` — folder path changed to `cwf/catalog/services/{itemId}` with strict positive-integer sanitization; added `CLOUDINARY_URL` parsing with fallback to the discrete env trio; secrets are never logged.
- `test/cloudinaryImageUpload.test.js` (new) — covers URL parsing/precedence, incomplete-value rejection, secret-never-leaks, folder structure, itemId sanitization.
- `test/catalogStoreMediaPricingMigration.test.js` — added a scoped-FK regex assertion and a real-Postgres integration test proving the migration still adds the FK to `catalog_items` even when an identically-named constraint already exists on a different table.
- `admin-store-catalog.html` / `admin-store-catalog.js` / `admin-store-catalog.css` (new) — compact card list, Add/Edit modal (5 sections: ข้อมูลบริการ, รูปบริการ, ราคาและโปรโมชั่น, การแสดงผล, ขั้นสูง), save-item-then-upload-image flow with local preview, delete-image confirmation, double-submit guard. `style.css` was not modified.
- `customer-app/modules/store.js` / `customer-app/assets/customer-app.css` — real image rendering with placeholder/lazy-load/error-fallback, real sale price with strikethrough normal price and a promo/label badge, base_price fallback, "สอบถามราคา" when there is no price at all. No mock data, no change to booking draft mapping.
- `customer-app/index.html`, `customer-app/assets/customer-app.js`, `customer-app/sw.js`, `customer-app/manifest.webmanifest` — build ID bumped to `20260622_catalog_media_pricing_v1` consistently (template-based `${BUILD_ID}` substitutions, no cache strategy change).
- `test/adminStoreCatalogUi.test.js`, `test/customerAppRecovery.test.js`, `test/customerSameDayTiming.test.js` — expanded/updated to cover the new UI and the new build ID.

### Production-blocker fix pass (post PR #84 review, same branch)

- `server/routes/catalog/items.js` — removed `ensureCatalogMediaPricingSchema()` (and all DDL) from every request path, replaced with read-only `isMediaPricingSchemaReady()` capability detection and a `CATALOG_SELECT_LEGACY` fallback; restructured POST/PATCH so all validation happens before `pool.connect()` and `client.release()` is called exactly once via a single `finally`; rewrote `validatePricingInput` (required positive prices, active<=normal, valid/ordered effective dates, no empty-string-as-zero); removed the `pricing: null` unlink branch from PATCH (now a pure no-op); renamed the pricing input field to `pricing_is_active`; added `active_price`/`has_active_promotion`/`effective_from`/`effective_to` as primary public-contract output fields (keeping `sale_price`/`has_promo` as aliases) and a raw `pricing_is_active` output field; reordered `DELETE .../image` to clear the DB first and treat Cloudinary cleanup as best-effort; added `safeImageErrorMessage()` to redact secrets from logged Cloudinary errors.
- `admin-store-catalog.js` — `openCatalogModalForEdit()` now populates `cm_effective_from`/`cm_effective_to` (previously left blank) via a new `toDateInputValue()` helper, and reads the item's real `pricing_is_active` instead of hardcoding `"1"`; `catalogModalPayload()` renamed the pricing payload key from `is_active` to `pricing_is_active` to match the server contract.
- `customer-app/modules/store.js` — `hasPromo()` now reads `item.has_active_promotion`/`item.active_price` (the new primary contract names) instead of `item.has_promo`/`item.sale_price`; no other behavior changed.
- `test/catalogItemsRoutes.test.js` — fake pool now answers the `information_schema.columns` capability check and tracks `connectCount`/`releaseCount`; renamed `pricing.is_active` to `pricing.pricing_is_active` in existing pricing-bearing test payloads; inverted the Cloudinary-delete-failure test to assert the DB is cleared and the response is `200` (DB-first semantics); added regression tests for no-DDL-in-request-path, schema-not-ready fallback, `pricing: null` preserving the existing rule, the new pricing validation rules, and client-lifecycle correctness (connect/release counts across success and validation-failure paths).
- `test/adminStoreCatalogUi.test.js` — added tests asserting `cm_effective_from`/`cm_effective_to` population, the no-longer-hardcoded `cm_pricing_is_active`, and the renamed `pricing_is_active` payload key.
- `test/catalogStoreMediaPricingMigration.test.js` — added a regression test confirming no `ROLLBACK` is issued when post-commit verification fails.
- `docs/ADMIN_SERVICE_CATALOG_PHASE2A2_HANDOFF.md` — this section, plus the corrected rollback-scope wording above.
- `migrations/20260622_catalog_store_media_pricing.sql`, `scripts/run-catalog-store-media-pricing-migration.js`, `server/lib/cloudinaryImageUpload.js` — reviewed, no code changes required (the migration runner's transaction/verification ordering was already correct; only the documentation overstated it).

## Remaining risks / follow-ups

- Browser QA at 320/360/390/430/1280px was **not performed with an actual browser** in this environment — no browser is available here. The CSS includes a `@media (max-width: 360px)` rule collapsing the two-column modal grid and shrinking the thumbnail, and the card layout was built mobile-first with `flex`/`min-width:0`/`overflow:hidden` ellipsis to avoid known overflow patterns, but this has only been verified by reading the rendered HTML/CSS, not by visually testing in a real viewport. This should be done before considering the UX fully verified.
- The Add/Edit modal currently treats pricing as optional unless at least one pricing field is filled in (rather than hard-requiring all pricing fields on every save) — this avoids forcing every catalog item to carry a price rule, but means the "required fields" list in the spec is enforced as "required if you're setting a price," not "required unconditionally." Revisit if stricter enforcement is wanted.
- Cloudinary image cleanup on replace/delete is fire-and-forget on the server (errors are logged, not surfaced) for the old-image-cleanup path specifically — this was pre-existing behavior, not changed in this phase.
