-- Issue #329: generic promotion policies + prepaid service entitlements.
-- Expand-only migration. Existing catalog/package/order/job behavior remains the default.

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

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS customer_sub TEXT,
  ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS catalog_item_id BIGINT,
  ADD COLUMN IF NOT EXISTS service_purchase_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_service_package_pricing_strategy_chk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_pricing_strategy_chk
      CHECK (service_package_pricing_strategy IN ('per_variant_tier','total_quantity_tier_plus_unit_modifiers'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_service_package_selection_mode_chk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_selection_mode_chk
      CHECK (service_package_selection_mode IN ('multi_variant','exclusive_level'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_service_package_max_qty_chk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_max_qty_chk
      CHECK (service_package_maximum_total_quantity IS NULL OR service_package_maximum_total_quantity BETWEEN 1 AND 99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_service_package_payment_mode_chk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_payment_mode_chk
      CHECK (service_package_payment_mode IN ('book_now','prepaid_full'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalog_items_service_package_warranty_days_chk') THEN
    ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_service_package_warranty_days_chk
      CHECK (service_package_warranty_days IS NULL OR service_package_warranty_days BETWEEN 1 AND 3650);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_packages_unit_price_modifier_chk') THEN
    ALTER TABLE public.service_packages ADD CONSTRAINT service_packages_unit_price_modifier_chk
      CHECK (unit_price_modifier >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customer_orders_order_kind_chk') THEN
    ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_order_kind_chk
      CHECK (order_kind IN ('product','service_entitlement'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.service_entitlements (
  entitlement_id BIGSERIAL PRIMARY KEY,
  entitlement_code TEXT NOT NULL UNIQUE,
  customer_sub TEXT NOT NULL,
  source_order_id BIGINT NOT NULL UNIQUE REFERENCES public.customer_orders(order_id) ON DELETE RESTRICT,
  catalog_item_id BIGINT NOT NULL REFERENCES public.catalog_items(item_id) ON DELETE RESTRICT,
  service_snapshot JSONB NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL CHECK (amount_paid >= 0),
  currency TEXT NOT NULL DEFAULT 'THB' CHECK (currency='THB'),
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','refunded')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','booked','redeemed','expired','cancelled','refunded')),
  purchased_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  booked_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  related_job_id BIGINT UNIQUE REFERENCES public.jobs(job_id) ON DELETE RESTRICT,
  warranty_days SMALLINT CHECK (warranty_days IS NULL OR warranty_days BETWEEN 1 AND 3650),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at >= activated_at)
);

CREATE INDEX IF NOT EXISTS service_entitlements_customer_status_idx
  ON public.service_entitlements(customer_sub, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS service_entitlements_catalog_idx
  ON public.service_entitlements(catalog_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_orders_customer_kind_idx
  ON public.customer_orders(customer_sub, order_kind, created_at DESC);
