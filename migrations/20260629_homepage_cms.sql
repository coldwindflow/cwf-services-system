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

CREATE INDEX IF NOT EXISTS idx_homepage_cms_media_active
  ON public.homepage_cms_media(image_public_id)
  WHERE deleted_at IS NULL;

COMMIT;

-- Rollback plan:
-- DROP INDEX IF EXISTS public.idx_homepage_cms_media_active;
-- DROP TABLE IF EXISTS public.homepage_cms_media;
-- DROP TABLE IF EXISTS public.homepage_cms_configs;
