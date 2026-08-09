-- Store service-package bundles. A catalog item owns presentation/media and
-- sale/redeem windows; linked service_packages are selectable BTU variants.
-- Existing unlinked service packages remain valid and keep their own windows.

ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_booking_mode_check;
ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_booking_mode_check
  CHECK (booking_mode IN ('bookable', 'contact_admin', 'purchase', 'service_package'));

ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS service_bundle_key TEXT;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS service_package_sell_start_at TIMESTAMPTZ;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS service_package_sell_end_at TIMESTAMPTZ;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS service_package_redeem_until TIMESTAMPTZ;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS promotion_badge_text VARCHAR(80);
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS promotion_theme_preset TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS promotion_effect_preset TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS show_sale_countdown BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS promotion_supporting_text VARCHAR(200);
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS booking_flow_policy TEXT NOT NULL DEFAULT 'scheduled_only';

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_items_service_bundle_key
  ON public.catalog_items (service_bundle_key)
  WHERE service_bundle_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'catalog_items_service_bundle_key_nonempty'
       AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_bundle_key_nonempty
      CHECK (service_bundle_key IS NULL OR btrim(service_bundle_key) <> '');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'catalog_items_service_package_window_valid'
       AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_window_valid
      CHECK (service_package_sell_end_at IS NULL OR service_package_sell_start_at IS NULL
        OR service_package_sell_end_at >= service_package_sell_start_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'catalog_items_service_package_redeem_valid'
       AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_redeem_valid
      CHECK (service_package_redeem_until IS NULL OR service_package_sell_end_at IS NULL
        OR service_package_redeem_until >= service_package_sell_end_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_promotion_theme_check'
      AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_promotion_theme_check
      CHECK (promotion_theme_preset IN ('default','premium','limited_time','new'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_promotion_effect_check'
      AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_promotion_effect_check
      CHECK (promotion_effect_preset IN ('none','soft_glow','shimmer_border','badge_pulse'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_booking_flow_policy_check'
      AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_booking_flow_policy_check
      CHECK (booking_flow_policy IN ('scheduled_only','scheduled_and_urgent'));
  END IF;
END $$;

ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS catalog_item_id BIGINT;
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_packages_catalog_item_fk'
       AND conrelid = 'public.service_packages'::regclass
  ) THEN
    ALTER TABLE public.service_packages ADD CONSTRAINT service_packages_catalog_item_fk
      FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(item_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_packages_catalog_item
  ON public.service_packages (catalog_item_id, sort_order, service_package_id)
  WHERE catalog_item_id IS NOT NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS admin_request_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS admin_request_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS booking_request_fingerprint CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_admin_request_key
  ON public.jobs(admin_request_key) WHERE admin_request_key IS NOT NULL;

-- Future pre-data rollback only. Do not execute after a linked bundle booking:
-- DROP INDEX IF EXISTS public.idx_service_packages_catalog_item;
-- ALTER TABLE public.service_packages DROP CONSTRAINT IF EXISTS service_packages_catalog_item_fk;
-- ALTER TABLE public.service_packages DROP COLUMN IF EXISTS sort_order;
-- ALTER TABLE public.service_packages DROP COLUMN IF EXISTS catalog_item_id;
-- DROP INDEX IF EXISTS public.uq_catalog_items_service_bundle_key;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_redeem_until;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_sell_end_at;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_sell_start_at;
-- ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_bundle_key;
