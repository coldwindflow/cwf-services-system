-- Issue #329: generic promotion pricing policy fields used by Store service-package bookings.
-- Expand-only schema. Existing catalog/package behavior remains the default.

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS service_package_pricing_strategy TEXT NOT NULL DEFAULT 'per_variant_tier',
  ADD COLUMN IF NOT EXISTS service_package_selection_mode TEXT NOT NULL DEFAULT 'multi_variant',
  ADD COLUMN IF NOT EXISTS service_package_maximum_total_quantity SMALLINT,
  ADD COLUMN IF NOT EXISTS service_package_payment_mode TEXT NOT NULL DEFAULT 'book_now',
  ADD COLUMN IF NOT EXISTS service_package_warranty_days SMALLINT;

ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS service_level_key TEXT,
  ADD COLUMN IF NOT EXISTS service_level_label TEXT,
  ADD COLUMN IF NOT EXISTS unit_price_modifier NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_pricing_strategy_chk
  CHECK (service_package_pricing_strategy IN ('per_variant_tier','total_quantity_tier_plus_unit_modifiers'));

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_selection_mode_chk
  CHECK (service_package_selection_mode IN ('multi_variant','exclusive_level'));

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_max_qty_chk
  CHECK (service_package_maximum_total_quantity IS NULL OR service_package_maximum_total_quantity BETWEEN 1 AND 99);

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_payment_mode_chk
  CHECK (service_package_payment_mode IN ('book_now','prepaid_full'));

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_warranty_days_chk
  CHECK (service_package_warranty_days IS NULL OR service_package_warranty_days BETWEEN 1 AND 3650);

ALTER TABLE public.service_packages
  ADD CONSTRAINT service_packages_unit_price_modifier_chk
  CHECK (unit_price_modifier >= 0);
