-- Customer product orders — fulfilment columns (buy flow, order lifecycle).
-- Additive only: adds two nullable columns to customer_orders so an admin can
-- move a paid order through fulfilment (confirmed → preparing → shipped/
-- installing → completed / cancelled) and leave a customer-visible note (e.g.
-- shipping details or a confirmed delivery/install fee). It never drops,
-- rewrites, or backfills existing rows, so it is safe on a live DB and safe to
-- re-run (ADD COLUMN IF NOT EXISTS is idempotent).
--
-- fulfilment is intentionally separate from `status` (the payment lifecycle):
-- a paid order has status='paid' and its own fulfilment_status.

ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;  -- confirmed|preparing|shipped|installing|completed|cancelled
ALTER TABLE public.customer_orders ADD COLUMN IF NOT EXISTS admin_note         TEXT;  -- admin → customer note (visible in tracking)
