-- Legacy Customer Claim + Phone-Verified History.
-- Additive only. Do not run against production until reviewed and approved.
-- This migration stores durable ownership of a normalized phone after a logged-in
-- customer proves one legacy job with full phone + booking code. Raw booking
-- codes and raw claim input are intentionally not persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_history_claims (
  claim_id BIGSERIAL PRIMARY KEY,
  customer_sub TEXT NOT NULL REFERENCES public.customer_profiles(sub) ON DELETE CASCADE,
  phone_norm TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,
  proof_job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE RESTRICT,
  claim_method TEXT NOT NULL DEFAULT 'booking_code_phone',
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  revoke_reason TEXT NULL,
  CONSTRAINT customer_history_claims_method_check
    CHECK (claim_method IN ('booking_code_phone')),
  CONSTRAINT customer_history_claims_phone_norm_not_blank
    CHECK (length(btrim(phone_norm)) > 0),
  CONSTRAINT customer_history_claims_phone_last4_check
    CHECK (phone_last4 ~ '^[0-9]{4}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_history_claims_active_phone
  ON public.customer_history_claims(phone_norm)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_history_claims_active_proof_job
  ON public.customer_history_claims(proof_job_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_history_claims_customer_sub
  ON public.customer_history_claims(customer_sub)
  WHERE revoked_at IS NULL;

COMMIT;

-- Rollback outline, review before use:
-- DROP INDEX IF EXISTS idx_customer_history_claims_customer_sub;
-- DROP INDEX IF EXISTS ux_customer_history_claims_active_proof_job;
-- DROP INDEX IF EXISTS ux_customer_history_claims_active_phone;
-- DROP TABLE IF EXISTS public.customer_history_claims;
