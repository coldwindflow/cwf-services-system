ALTER TABLE public.partner_applications
  ADD COLUMN IF NOT EXISTS admin_job_override_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_job_override_by TEXT,
  ADD COLUMN IF NOT EXISTS admin_job_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_job_override_note TEXT;

COMMENT ON COLUMN public.partner_applications.admin_job_override_enabled IS
  'Explicit admin-only override allowing this technician ID to receive real jobs despite incomplete onboarding. Suspended/revoked certification safety blocks still apply.';

