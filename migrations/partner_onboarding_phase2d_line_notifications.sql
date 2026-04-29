-- CWF Partner Onboarding Phase 2D
-- LINE Notification logs for partner onboarding
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.partner_notification_logs (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT REFERENCES public.partner_applications(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'line',
  target TEXT,
  event_type TEXT,
  status TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_notification_logs_application
ON public.partner_notification_logs(application_id, created_at DESC);
