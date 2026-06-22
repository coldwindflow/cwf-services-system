-- Catalog Store Phase 2A.2 — service media (Cloudinary image) and a Price Rule link.
-- Additive only: 3 nullable columns + 1 index + 1 idempotent FK. No data is touched.
-- Apply during a planned deployment window. Do not run against production until reviewed.

BEGIN;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS image_public_id TEXT;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS price_rule_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_catalog_items_price_rule_id
  ON public.catalog_items(price_rule_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'catalog_items'
      AND con.contype = 'f'
      AND con.conname = 'catalog_items_price_rule_id_fkey'
  ) THEN
    ALTER TABLE public.catalog_items
      ADD CONSTRAINT catalog_items_price_rule_id_fkey
      FOREIGN KEY (price_rule_id)
      REFERENCES public.customer_service_price_rules(rule_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;

-- Rollback plan:
-- ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_price_rule_id_fkey;
-- DROP INDEX IF EXISTS public.idx_catalog_items_price_rule_id;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS price_rule_id;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS image_public_id;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS image_url;
