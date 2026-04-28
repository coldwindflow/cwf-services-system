-- Partner Onboarding Phase 1D: application form / submit hotfix
-- Safe / backward-compatible only.

ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Keep structured partner screening columns ready even if this migration is run independently.
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS work_intent TEXT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS available_days_per_week INT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS preferred_work_days JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS max_jobs_per_day INT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS max_units_per_day INT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_accept_urgent_jobs BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_work_condo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS can_issue_tax_invoice BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS has_helper_team BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS team_size INT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS travel_method TEXT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(8,2);
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS equipment_json JSONB NOT NULL DEFAULT '[]'::jsonb;
