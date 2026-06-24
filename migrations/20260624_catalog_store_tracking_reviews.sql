-- Follow-up to migrations/20260623_catalog_store_hot_sale_reviews.sql.
-- Does NOT edit that file. Purely additive, extends public.catalog_item_reviews
-- (no duplicate review table) to support:
--   - Reviews submitted from the Tracking page via a hashed booking/tracking
--     token instead of a Customer App JWT session (review_source, tracking_token_hash)
--   - Reviews that cannot be tied to one specific catalog item: scoped to a
--     named service_type bucket, or to "overall" CWF service
--     (review_scope, service_type)
--   - Admin assignment/reassignment of an ambiguous review's target item,
--     fully audited (assigned_item_id, assigned_by, assigned_at)
-- No existing data is touched. Apply during a planned deployment window.
-- Do not run against production until reviewed.

BEGIN;

-- item_id must become nullable: a service_type/overall-scoped review has no
-- single catalog item yet (it may get one later via admin assignment).
ALTER TABLE public.catalog_item_reviews
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS review_source TEXT NOT NULL DEFAULT 'customer_app';

ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS review_scope TEXT NOT NULL DEFAULT 'item';

ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS service_type TEXT NULL;

-- SHA-256 hex digest of the booking/tracking token used to authorize a
-- tracking-sourced review. The plaintext token is never stored.
ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS tracking_token_hash TEXT NULL;

-- Audit trail for admin assignment/reassignment of a review's catalog item
-- target (relevant for review_scope IN ('service_type','overall') reviews
-- that an admin later ties to one specific item).
ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS assigned_item_id BIGINT NULL;

ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS assigned_by TEXT NULL;

ALTER TABLE public.catalog_item_reviews
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_source_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_source_check
      CHECK (review_source IN ('customer_app', 'tracking'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_scope_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_scope_check
      CHECK (review_scope IN ('item', 'service_type', 'overall'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_service_type_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_service_type_check
      CHECK (service_type IS NULL OR service_type IN ('ล้างแอร์', 'ซ่อมแอร์', 'ติดตั้งแอร์', 'ตรวจเช็คแอร์'));
  END IF;
END
$$;

-- Scope-consistency: an 'item' scoped review must carry item_id; a
-- 'service_type' scoped review must carry service_type. Deliberately keyed
-- only off review_scope (not off whether item_id happens to be populated) so
-- admin assignment can later set item_id on an originally ambiguous
-- ('service_type'/'overall') review without ever violating this constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_scope_target_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_scope_target_check
      CHECK (
        (review_scope <> 'item' OR item_id IS NOT NULL)
        AND (review_scope <> 'service_type' OR service_type IS NOT NULL)
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'f' AND con.conname = 'catalog_item_reviews_assigned_item_id_fkey'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_assigned_item_id_fkey
      FOREIGN KEY (assigned_item_id) REFERENCES public.catalog_items(item_id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Supports admin filtering by source, and the rating aggregation query's
-- "assigned_item_id takes effect when set" lookup pattern.
CREATE INDEX IF NOT EXISTS idx_catalog_item_reviews_source
  ON public.catalog_item_reviews(review_source);

CREATE INDEX IF NOT EXISTS idx_catalog_item_reviews_assigned_item
  ON public.catalog_item_reviews(assigned_item_id)
  WHERE assigned_item_id IS NOT NULL;

-- Supports booking-count aggregation needing to read job_units rows by job_id
-- in bulk for the historical-service resolver (a non-unique covering index;
-- job_units already has its own primary key).
CREATE INDEX IF NOT EXISTS idx_job_units_job_id_resolver
  ON public.job_units(job_id);

COMMIT;

-- Rollback plan:
-- DROP INDEX IF EXISTS public.idx_job_units_job_id_resolver;
-- DROP INDEX IF EXISTS public.idx_catalog_item_reviews_assigned_item;
-- DROP INDEX IF EXISTS public.idx_catalog_item_reviews_source;
-- ALTER TABLE public.catalog_item_reviews DROP CONSTRAINT IF EXISTS catalog_item_reviews_assigned_item_id_fkey;
-- ALTER TABLE public.catalog_item_reviews DROP CONSTRAINT IF EXISTS catalog_item_reviews_scope_target_check;
-- ALTER TABLE public.catalog_item_reviews DROP CONSTRAINT IF EXISTS catalog_item_reviews_service_type_check;
-- ALTER TABLE public.catalog_item_reviews DROP CONSTRAINT IF EXISTS catalog_item_reviews_scope_check;
-- ALTER TABLE public.catalog_item_reviews DROP CONSTRAINT IF EXISTS catalog_item_reviews_source_check;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS assigned_at;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS assigned_by;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS assigned_item_id;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS tracking_token_hash;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS service_type;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS review_scope;
-- ALTER TABLE public.catalog_item_reviews DROP COLUMN IF EXISTS review_source;
-- UPDATE public.catalog_item_reviews SET item_id = assigned_item_id WHERE item_id IS NULL; -- review before running
-- ALTER TABLE public.catalog_item_reviews ALTER COLUMN item_id SET NOT NULL; -- only safe once no NULLs remain
