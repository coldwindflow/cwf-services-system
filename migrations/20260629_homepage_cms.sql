-- Customer App Homepage CMS.
-- Additive only. Review before running against production.

BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_cms_configs (
  config_key TEXT PRIMARY KEY,
  draft_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_config JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.homepage_cms_media (
  media_id BIGSERIAL PRIMARY KEY,
  image_public_id TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS image_public_id TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS booking_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_homepage_cms_media_active
  ON public.homepage_cms_media(image_public_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_items_customer_featured
  ON public.catalog_items(item_category, item_name)
  WHERE is_active = TRUE AND is_customer_visible = TRUE AND is_featured = TRUE;

COMMIT;

-- Rollback plan:
-- DROP INDEX IF EXISTS public.idx_catalog_items_customer_featured;
-- DROP INDEX IF EXISTS public.idx_homepage_cms_media_active;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_metadata;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS image_public_id;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS image_url;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS is_featured;
-- DROP TABLE IF EXISTS public.homepage_cms_media;
-- DROP TABLE IF EXISTS public.homepage_cms_configs;
