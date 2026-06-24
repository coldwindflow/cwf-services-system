-- Catalog Store HOT badge + verified customer reviews.
-- Additive only:
--   - catalog_items.is_hot (admin-controlled HOT badge toggle)
--   - jobs.catalog_item_id (links a Store-originated booking to the catalog
--     item it was booked for; NULL for every existing/legacy job, and never
--     backfilled/guessed)
--   - jobs.customer_sub (links a Store-originated booking to the logged-in
--     customer identity (LINE sub) that placed it, when one was present at
--     booking time; NULL for every existing/legacy job and for guest bookings)
--   - public.catalog_item_reviews (new table; one verified review per
--     completed job)
-- No existing data is touched. Apply during a planned deployment window.
-- Do not run against production until reviewed.

BEGIN;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS catalog_item_id BIGINT NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS customer_sub TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'jobs'
      AND con.contype = 'f'
      AND con.conname = 'jobs_catalog_item_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_catalog_item_id_fkey
      FOREIGN KEY (catalog_item_id)
      REFERENCES public.catalog_items(item_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_jobs_catalog_item_id
  ON public.jobs(catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_customer_sub
  ON public.jobs(customer_sub)
  WHERE customer_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.catalog_item_reviews (
  review_id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL,
  completed_job_id BIGINT NOT NULL,
  customer_identity TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderated_at TIMESTAMPTZ,
  moderated_by TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'catalog_item_reviews'
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_rating_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_rating_check
      CHECK (rating BETWEEN 1 AND 5);
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
      AND con.contype = 'c' AND con.conname = 'catalog_item_reviews_status_check'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_status_check
      CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'hidden'));
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
      AND con.contype = 'f' AND con.conname = 'catalog_item_reviews_item_id_fkey'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.catalog_items(item_id) ON DELETE CASCADE;
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
      AND con.contype = 'f' AND con.conname = 'catalog_item_reviews_job_id_fkey'
  ) THEN
    ALTER TABLE public.catalog_item_reviews
      ADD CONSTRAINT catalog_item_reviews_job_id_fkey
      FOREIGN KEY (completed_job_id) REFERENCES public.jobs(job_id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Exactly one review per completed job, enforced at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_reviews_job
  ON public.catalog_item_reviews(completed_job_id);

CREATE INDEX IF NOT EXISTS idx_catalog_item_reviews_item_status
  ON public.catalog_item_reviews(item_id, moderation_status);

CREATE INDEX IF NOT EXISTS idx_catalog_item_reviews_created_at
  ON public.catalog_item_reviews(created_at DESC);

COMMIT;

-- Rollback plan:
-- DROP INDEX IF EXISTS public.idx_catalog_item_reviews_created_at;
-- DROP INDEX IF EXISTS public.idx_catalog_item_reviews_item_status;
-- DROP INDEX IF EXISTS public.uq_catalog_item_reviews_job;
-- DROP TABLE IF EXISTS public.catalog_item_reviews;
-- DROP INDEX IF EXISTS public.idx_jobs_customer_sub;
-- DROP INDEX IF EXISTS public.idx_jobs_catalog_item_id;
-- ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_catalog_item_id_fkey;
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS customer_sub;
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS catalog_item_id;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS is_hot;
