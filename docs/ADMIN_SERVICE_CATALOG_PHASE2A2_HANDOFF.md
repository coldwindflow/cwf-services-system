# Admin Service Catalog — Phase 2A.2 Handoff (Service Media, Real Pricing, Mobile Admin UX)

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
- The runner takes a Postgres advisory lock (`ADVISORY_LOCK_KEY`, distinct from the customer-auth migration's lock key) before running, rolls back and unlocks on any failure, and verifies the new columns/index/FK exist afterward — non-zero exit if verification fails.

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

## Remaining risks / follow-ups

- Browser QA at 320/360/390/430/1280px was **not performed with an actual browser** in this environment — no browser is available here. The CSS includes a `@media (max-width: 360px)` rule collapsing the two-column modal grid and shrinking the thumbnail, and the card layout was built mobile-first with `flex`/`min-width:0`/`overflow:hidden` ellipsis to avoid known overflow patterns, but this has only been verified by reading the rendered HTML/CSS, not by visually testing in a real viewport. This should be done before considering the UX fully verified.
- The Add/Edit modal currently treats pricing as optional unless at least one pricing field is filled in (rather than hard-requiring all pricing fields on every save) — this avoids forcing every catalog item to carry a price rule, but means the "required fields" list in the spec is enforced as "required if you're setting a price," not "required unconditionally." Revisit if stricter enforcement is wanted.
- Cloudinary image cleanup on replace/delete is fire-and-forget on the server (errors are logged, not surfaced) for the old-image-cleanup path specifically — this was pre-existing behavior, not changed in this phase.
