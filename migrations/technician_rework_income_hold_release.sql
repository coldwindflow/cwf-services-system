-- Technician Rework Income Hold/Release
-- Backward-compatible schema. Safe to run repeatedly (CREATE IF NOT EXISTS only).
--
-- Purpose: when a job is sent back for rework, the *original* technician's
-- earned amount for that job must be held (not silently dropped) and, once
-- the rework closes successfully, released into the correct future payout
-- period exactly once. This table is the immutable audit/idempotency ledger
-- for that hold -> release lifecycle. Money movement itself happens via
-- normal rows in public.technician_payout_adjustments; this table never
-- holds money on its own, it only records what happened and guards re-entry.

CREATE TABLE IF NOT EXISTS public.technician_rework_income_holds (
  hold_id BIGSERIAL PRIMARY KEY,
  rework_case_id BIGINT NOT NULL REFERENCES public.technician_rework_cases(rework_case_id) ON DELETE CASCADE,
  technician_username TEXT NOT NULL,
  job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,

  held_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (held_amount >= 0),
  source_payout_id TEXT,
  source_period_status_at_hold TEXT,
  hold_adjustment_id BIGINT REFERENCES public.technician_payout_adjustments(adj_id) ON DELETE SET NULL,

  hold_status TEXT NOT NULL DEFAULT 'held' CHECK (hold_status IN (
    'held',                 -- original income paused, awaiting rework outcome
    'already_paid_no_action', -- original income was already in a paid period; nothing was touched
    'released',             -- successfully credited back in a payout period
    'voided'                -- rework failed / cancelled, nothing to release
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
