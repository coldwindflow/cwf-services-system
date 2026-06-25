-- Technician Rework Income Hold/Release
-- Backward-compatible schema. Safe to run repeatedly (CREATE IF NOT EXISTS /
-- guarded ALTER only — never drops or rewrites existing rows).
--
-- Purpose: when a job is sent back for rework, the *original* technician's
-- earned amount for that job must ALWAYS be held — even if that income was
-- already disbursed in a 'paid' payout period — and, once the rework closes
-- successfully, released into the correct future payout period exactly once.
-- This table is the immutable audit/idempotency ledger for that hold ->
-- release lifecycle. Money movement itself happens via normal rows in
-- public.technician_payout_adjustments; this table never holds money on its
-- own, it only records what happened and guards re-entry.
--
-- Business rule (corrected from the original version of this migration):
--   - We never retroactively rewrite a 'paid' period's own rows.
--   - If the original income already landed in a 'paid' period, we instead
--     carry the hold forward as a NEGATIVE adjustment in the next period that
--     is still open (status != 'paid'), so the technician's payable income
--     still ends up correctly reduced — hold_status='paid_then_carried_forward_hold'.
--   - The release later still credits the full held_amount back via a
--     POSITIVE adjustment in the period matching the rework's own close date,
--     rolling forward past any 'paid' period. Both the negative carry-forward
--     adjustment and the positive release adjustment remain in the ledger as
--     separate audit rows even if they land in the same period and net to zero.

CREATE TABLE IF NOT EXISTS public.technician_rework_income_holds (
  hold_id BIGSERIAL PRIMARY KEY,
  -- Financial ledger: never cascade-delete a hold/release record just because
  -- the rework case or job row it references gets deleted. Deletion of a case
  -- or job with ledger history must fail loudly (RESTRICT), not silently wipe
  -- money-movement audit trail.
  rework_case_id BIGINT NOT NULL REFERENCES public.technician_rework_cases(rework_case_id) ON DELETE RESTRICT,
  technician_username TEXT NOT NULL,
  job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE RESTRICT,

  held_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (held_amount >= 0),
  source_payout_id TEXT,
  source_period_status_at_hold TEXT,
  hold_adjustment_id BIGINT REFERENCES public.technician_payout_adjustments(adj_id) ON DELETE SET NULL,
  -- Where the carried-forward negative adjustment actually landed, when the
  -- original income's period was already 'paid' at hold time. NULL for the
  -- normal (not-yet-paid) hold path.
  hold_carried_forward_payout_id TEXT,

  hold_status TEXT NOT NULL DEFAULT 'held' CHECK (hold_status IN (
    'held',                          -- original income paused, awaiting rework outcome
    'already_paid_no_action',        -- zero-amount original income (nothing to hold/carry)
    'paid_then_carried_forward_hold', -- original income was already in a paid period; a
                                       -- negative adjustment carried the hold into the next
                                       -- open period instead of touching the paid period
    'released',                      -- successfully credited back in a payout period
    'voided'                         -- rework failed / cancelled, nothing to release
  )),

  released_amount NUMERIC(12,2) CHECK (released_amount IS NULL OR released_amount >= 0),
  release_payout_id TEXT,
  release_adjustment_id BIGINT REFERENCES public.technician_payout_adjustments(adj_id) ON DELETE SET NULL,
  release_idempotency_key TEXT,
  released_at TIMESTAMPTZ,

  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariant: one hold record per rework case + original technician (no duplicate holds).
  UNIQUE (rework_case_id, technician_username),
  -- Invariant: released_amount can never exceed held_amount.
  CHECK (released_amount IS NULL OR released_amount <= held_amount)
);

-- Guarded upgrade path for any environment where this table was already
-- created by an earlier version of this migration (CASCADE FKs / narrower
-- hold_status list / missing hold_carried_forward_payout_id column).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema='public' AND table_name='technician_rework_income_holds'
       AND constraint_name='technician_rework_income_holds_rework_case_id_fkey'
       AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE public.technician_rework_income_holds
      DROP CONSTRAINT technician_rework_income_holds_rework_case_id_fkey;
    ALTER TABLE public.technician_rework_income_holds
      ADD CONSTRAINT technician_rework_income_holds_rework_case_id_fkey
      FOREIGN KEY (rework_case_id) REFERENCES public.technician_rework_cases(rework_case_id) ON DELETE RESTRICT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema='public' AND table_name='technician_rework_income_holds'
       AND constraint_name='technician_rework_income_holds_job_id_fkey'
       AND constraint_type='FOREIGN KEY'
  ) THEN
    ALTER TABLE public.technician_rework_income_holds
      DROP CONSTRAINT technician_rework_income_holds_job_id_fkey;
    ALTER TABLE public.technician_rework_income_holds
      ADD CONSTRAINT technician_rework_income_holds_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(job_id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.technician_rework_income_holds
  ADD COLUMN IF NOT EXISTS hold_carried_forward_payout_id TEXT;

ALTER TABLE public.technician_rework_income_holds
  DROP CONSTRAINT IF EXISTS technician_rework_income_holds_hold_status_check;
ALTER TABLE public.technician_rework_income_holds
  ADD CONSTRAINT technician_rework_income_holds_hold_status_check CHECK (hold_status IN (
    'held','already_paid_no_action','paid_then_carried_forward_hold','released','voided'
  ));

-- Invariant: a release can only ever happen once per case+technician.
-- "rework_release:<rework_case_id>:<technician_username>" is computed by the
-- application and stored here; the unique index makes double-release
-- impossible even under concurrent retries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trih_release_idempotency_key
  ON public.technician_rework_income_holds(release_idempotency_key)
  WHERE release_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trih_job_id ON public.technician_rework_income_holds(job_id);
CREATE INDEX IF NOT EXISTS idx_trih_technician ON public.technician_rework_income_holds(technician_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trih_status ON public.technician_rework_income_holds(hold_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trih_rework_case ON public.technician_rework_income_holds(rework_case_id);
