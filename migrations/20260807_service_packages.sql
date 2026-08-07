-- Phase 1 service-package foundation. Additive and intentionally not wired to
-- either booking path. Package prices are independent of normal price rules and
-- promotions.

CREATE TABLE IF NOT EXISTS public.service_packages (
  service_package_id BIGSERIAL PRIMARY KEY,
  package_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  ac_type TEXT NOT NULL,
  wash_variant TEXT,
  btu_min INTEGER,
  btu_max INTEGER,
  service_unit_duration_minutes INTEGER NOT NULL,
  sell_start_at TIMESTAMPTZ,
  sell_end_at TIMESTAMPTZ,
  redeem_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_packages_key_nonempty CHECK (btrim(package_key) <> ''),
  CONSTRAINT service_packages_service_key_nonempty CHECK (btrim(service_key) <> ''),
  CONSTRAINT service_packages_job_type_nonempty CHECK (btrim(job_type) <> ''),
  CONSTRAINT service_packages_ac_type_nonempty CHECK (btrim(ac_type) <> ''),
  CONSTRAINT service_packages_wash_variant_nonempty CHECK (wash_variant IS NULL OR btrim(wash_variant) <> ''),
  CONSTRAINT service_packages_btu_min_positive CHECK (btu_min IS NULL OR btu_min > 0),
  CONSTRAINT service_packages_btu_max_positive CHECK (btu_max IS NULL OR btu_max > 0),
  CONSTRAINT service_packages_btu_range_valid CHECK (btu_min IS NULL OR btu_max IS NULL OR btu_max >= btu_min),
  CONSTRAINT service_packages_duration_positive CHECK (service_unit_duration_minutes > 0),
  CONSTRAINT service_packages_sell_window_valid CHECK (sell_end_at IS NULL OR sell_start_at IS NULL OR sell_end_at >= sell_start_at),
  CONSTRAINT service_packages_redeem_after_start CHECK (redeem_until IS NULL OR sell_start_at IS NULL OR redeem_until >= sell_start_at),
  CONSTRAINT service_packages_redeem_after_end CHECK (redeem_until IS NULL OR sell_end_at IS NULL OR redeem_until >= sell_end_at)
);

CREATE TABLE IF NOT EXISTS public.service_package_tiers (
  service_package_tier_id BIGSERIAL PRIMARY KEY,
  service_package_id BIGINT NOT NULL REFERENCES public.service_packages(service_package_id) ON DELETE RESTRICT,
  tier_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  service_quantity INTEGER NOT NULL,
  fixed_total_price NUMERIC(12,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_package_tiers_key_nonempty CHECK (btrim(tier_key) <> ''),
  CONSTRAINT service_package_tiers_quantity_positive CHECK (service_quantity > 0),
  CONSTRAINT service_package_tiers_price_positive CHECK (fixed_total_price > 0),
  CONSTRAINT service_package_tiers_package_key_unique UNIQUE (service_package_id, tier_key),
  CONSTRAINT service_package_tiers_package_id_unique UNIQUE (service_package_id, service_package_tier_id)
);

CREATE INDEX IF NOT EXISTS idx_service_packages_customer_listing
  ON public.service_packages (sell_start_at, sell_end_at, service_package_id)
  WHERE is_active AND is_customer_visible;

CREATE INDEX IF NOT EXISTS idx_service_package_tiers_lookup
  ON public.service_package_tiers (service_package_id, sort_order, service_package_tier_id)
  WHERE is_active;

ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS service_package_id BIGINT;
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS service_package_tier_id BIGINT;
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS service_package_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_items_service_package_fk' AND conrelid = 'public.job_items'::regclass) THEN
    ALTER TABLE public.job_items ADD CONSTRAINT job_items_service_package_fk
      FOREIGN KEY (service_package_id) REFERENCES public.service_packages(service_package_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_items_service_package_tier_fk' AND conrelid = 'public.job_items'::regclass) THEN
    ALTER TABLE public.job_items ADD CONSTRAINT job_items_service_package_tier_fk
      FOREIGN KEY (service_package_id, service_package_tier_id)
      REFERENCES public.service_package_tiers(service_package_id, service_package_tier_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_items_service_package_id
  ON public.job_items (service_package_id) WHERE service_package_id IS NOT NULL;

-- Future pre-data rollback only (do not execute after real package bookings):
-- DROP INDEX IF EXISTS public.idx_job_items_service_package_id;
-- ALTER TABLE public.job_items DROP CONSTRAINT IF EXISTS job_items_service_package_tier_fk;
-- ALTER TABLE public.job_items DROP CONSTRAINT IF EXISTS job_items_service_package_fk;
-- ALTER TABLE public.job_items DROP COLUMN IF EXISTS service_package_snapshot;
-- ALTER TABLE public.job_items DROP COLUMN IF EXISTS service_package_tier_id;
-- ALTER TABLE public.job_items DROP COLUMN IF EXISTS service_package_id;
-- DROP TABLE IF EXISTS public.service_package_tiers;
-- DROP TABLE IF EXISTS public.service_packages;
