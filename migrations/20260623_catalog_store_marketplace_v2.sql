-- Catalog Store Marketplace v2 — multi-image gallery, product detail content,
-- and explicit booking-mode CTA routing for the customer storefront.
-- Additive only: new nullable/defaulted columns on catalog_items + a new
-- catalog_item_images table. No existing data is touched.
-- Apply during a planned deployment window. Do not run against production
-- until reviewed.

BEGIN;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS short_description TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS long_description TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS highlights JSONB;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS service_conditions TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_mode TEXT NOT NULL DEFAULT 'contact_admin';

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_service_key TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_ac_type TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_btu INTEGER;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_wash_variant TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_items'
      AND con.contype = 'c'
      AND con.conname = 'catalog_items_booking_mode_check'
  ) THEN
    ALTER TABLE public.catalog_items
      ADD CONSTRAINT catalog_items_booking_mode_check
      CHECK (booking_mode IN ('bookable', 'contact_admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.catalog_item_images (
  image_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL,
  image_url TEXT NOT NULL,
  image_public_id TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_images_item_id
  ON public.catalog_item_images(item_id, sort_order);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_item_images'
      AND con.contype = 'f'
      AND con.conname = 'catalog_item_images_item_id_fkey'
  ) THEN
    ALTER TABLE public.catalog_item_images
      ADD CONSTRAINT catalog_item_images_item_id_fkey
      FOREIGN KEY (item_id)
      REFERENCES public.catalog_items(item_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

COMMIT;

-- Rollback plan:
-- DROP TABLE IF EXISTS public.catalog_item_images;
-- ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_booking_mode_check;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS is_featured;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_wash_variant;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_btu;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_ac_type;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_service_key;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_mode;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_conditions;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS highlights;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS long_description;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS short_description;
