-- Catalog Store Autoplay — adds a per-item toggle controlling whether the
-- customer Store card / product detail image gallery auto-slides.
-- Additive only: one new defaulted column on catalog_items. No existing
-- data is touched.
-- Apply during a planned deployment window. Do not run against production
-- until reviewed.

BEGIN;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS is_autoplay_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

-- Rollback plan:
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS is_autoplay_enabled;
