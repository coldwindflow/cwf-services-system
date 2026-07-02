-- Customer product orders — payment columns (buy flow, Omise online payment).
-- Additive only: adds nullable payment_* columns to customer_orders. It never
-- drops, rewrites, or backfills existing rows, so it is safe to run on a live
-- database and safe to re-run (ADD COLUMN IF NOT EXISTS is idempotent).
--
-- Existing orders keep their status ('pending_payment'); nothing is migrated.

ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS payment_provider   TEXT;      -- e.g. 'omise'
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS payment_method     TEXT;      -- 'card' | 'promptpay'
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS payment_charge_id  TEXT;      -- Omise charge id (chrg_...)
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS payment_status     TEXT;      -- raw Omise charge status
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ;

-- Look up an order by its Omise charge id from the webhook (one charge per order).
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_orders_charge
  ON public.customer_orders (payment_charge_id)
  WHERE payment_charge_id IS NOT NULL;
