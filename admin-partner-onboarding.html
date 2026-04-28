-- Partner Onboarding Phase 1C: launch readiness, account binding, structured screening,
-- Cloudinary document policy support, partner preferences, and availability.
-- Safe / backward-compatible only.

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
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ;
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS account_note TEXT;

ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS partner_status TEXT;
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS line_id TEXT;

ALTER TABLE public.agreement_templates ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE public.agreement_templates ADD COLUMN IF NOT EXISTS source_note TEXT;

CREATE TABLE IF NOT EXISTS public.technician_certification_preferences (
  id BIGSERIAL PRIMARY KEY,
  technician_username TEXT NOT NULL,
  certification_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(technician_username, certification_code)
);
CREATE INDEX IF NOT EXISTS idx_cert_prefs_username_enabled
  ON public.technician_certification_preferences(technician_username, enabled);

CREATE TABLE IF NOT EXISTS public.partner_availability_preferences (
  id BIGSERIAL PRIMARY KEY,
  technician_username TEXT NOT NULL UNIQUE,
  working_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_jobs_per_day INT,
  max_units_per_day INT,
  paused BOOLEAN NOT NULL DEFAULT TRUE,
  vacation_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
