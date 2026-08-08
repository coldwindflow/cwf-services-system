-- PRE-DATA ROLLBACK ONLY. Never run after a service-package bundle or booking exists.
DROP INDEX IF EXISTS public.uq_jobs_admin_request_key;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS admin_request_fingerprint;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS admin_request_key;
DROP INDEX IF EXISTS public.idx_service_packages_catalog_item;
ALTER TABLE public.service_packages DROP CONSTRAINT IF EXISTS service_packages_catalog_item_fk;
ALTER TABLE public.service_packages DROP COLUMN IF EXISTS sort_order;
ALTER TABLE public.service_packages DROP COLUMN IF EXISTS catalog_item_id;
DROP INDEX IF EXISTS public.uq_catalog_items_service_bundle_key;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_booking_flow_policy_check;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_promotion_effect_check;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_promotion_theme_check;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS booking_flow_policy;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS promotion_supporting_text;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS show_sale_countdown;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS promotion_effect_preset;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS promotion_theme_preset;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS promotion_badge_text;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_service_package_redeem_valid;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_service_package_window_valid;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_service_bundle_key_nonempty;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_redeem_until;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_sell_end_at;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_package_sell_start_at;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS service_bundle_key;
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_booking_mode_check;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_booking_mode_check
  CHECK (booking_mode IN ('bookable', 'contact_admin', 'purchase'));
