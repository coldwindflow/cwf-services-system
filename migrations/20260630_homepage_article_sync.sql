-- Customer App Homepage CMS: synced articles cache for the "articles"
-- section's auto-sync mode (pulls posts from an external site, e.g. the
-- main cwf-air.com marketing site).
-- Additive only. Review before running against production.

BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_synced_articles (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  image_url TEXT,
  link TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_url, external_id)
);

CREATE INDEX IF NOT EXISTS idx_homepage_synced_articles_source
  ON public.homepage_synced_articles(source_url, published_at DESC NULLS LAST);

COMMIT;

-- Rollback plan:
-- DROP INDEX IF EXISTS public.idx_homepage_synced_articles_source;
-- DROP TABLE IF EXISTS public.homepage_synced_articles;
