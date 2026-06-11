BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_office_work_action_logs (
  id BIGSERIAL PRIMARY KEY,
  page TEXT,
  action TEXT NOT NULL,
  job_id BIGINT,
  booking_code TEXT,
  customer_phone TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_office_work_action_logs_created_at
  ON public.ai_office_work_action_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_office_work_action_logs_job_id
  ON public.ai_office_work_action_logs (job_id)
  WHERE job_id IS NOT NULL;

COMMIT;
