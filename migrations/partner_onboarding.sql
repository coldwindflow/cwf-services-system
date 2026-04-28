-- Partner Onboarding Phase 1A
-- Application + document upload + status timeline only.

CREATE TABLE IF NOT EXISTS public.partner_applications (
  id BIGSERIAL PRIMARY KEY,
  application_code TEXT NOT NULL UNIQUE,
  user_id TEXT,
  technician_username TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line_id TEXT,
  email TEXT,
  address_text TEXT,
  service_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_job_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_years NUMERIC(6,2),
  has_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_type TEXT,
  equipment_notes TEXT,
  bank_account_name TEXT,
  bank_name TEXT,
  bank_account_last4 TEXT,
  notes TEXT,
  consent_pdpa BOOLEAN NOT NULL DEFAULT FALSE,
  consent_terms BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','need_more_documents','rejected','approved_for_training')),
  admin_note TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_applications_status_created
  ON public.partner_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_applications_phone
  ON public.partner_applications(phone);

CREATE TABLE IF NOT EXISTS public.partner_application_documents (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('id_card','profile_photo','bank_book','tools_photo','vehicle_photo','certificate_or_portfolio','other')),
  original_filename TEXT,
  mime_type TEXT,
  file_size BIGINT,
  public_url TEXT,
  storage_path TEXT,
  cloud_public_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','approved','rejected','need_reupload')),
  admin_note TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_docs_application
  ON public.partner_application_documents(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_docs_status
  ON public.partner_application_documents(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_onboarding_events (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  actor_type TEXT,
  actor_username TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_events_application_created
  ON public.partner_onboarding_events(application_id, created_at DESC);
