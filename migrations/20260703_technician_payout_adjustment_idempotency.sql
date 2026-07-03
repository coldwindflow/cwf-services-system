-- Add durable idempotency for accounting-created payout adjustments.
-- Additive only, safe to re-run, and intentionally does not backfill legacy rows.

ALTER TABLE public.technician_payout_adjustments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tpa_idempotency_key
  ON public.technician_payout_adjustments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
