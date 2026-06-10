-- CWF AI Office Control Center settings
-- Safe phase: settings/drafts only. No LINE auto-send is enabled by this migration.

CREATE TABLE IF NOT EXISTS public.ai_office_control_settings (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'main',
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  locked BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_office_control_events (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  action TEXT NOT NULL DEFAULT 'update',
  admin_user TEXT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_office_control_events_created ON public.ai_office_control_events(created_at DESC);
