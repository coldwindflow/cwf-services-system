-- Issue #349: additive job brand ownership.
-- Existing and stale-client rows remain CWF through the non-null default.
-- The application owns the supported-brand registry so Brand #3 can be added
-- without another schema migration or another brand-specific boolean column.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS brand_key TEXT NOT NULL DEFAULT 'cwf';

COMMENT ON COLUMN public.jobs.brand_key IS
  'Canonical extensible job brand key validated by the application brand registry; legacy/default is cwf.';
