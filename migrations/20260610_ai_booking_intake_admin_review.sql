CREATE TABLE IF NOT EXISTS public.ai_booking_intakes (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NULL,
  line_user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LINE_AI',
  customer_name TEXT NULL,
  customer_phone TEXT NULL,
  service_type TEXT NULL,
  unit_count INTEGER NULL,
  btu TEXT NULL,
  area_text TEXT NULL,
  address_text TEXT NULL,
  map_url TEXT NULL,
  preferred_date TEXT NULL,
  preferred_time TEXT NULL,
  quoted_price NUMERIC(12,2) NULL,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  readiness_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEED_INFO',
  risk_label TEXT NOT NULL DEFAULT 'LOW',
  latest_customer_message TEXT NULL,
  thread_context TEXT NULL,
  ai_summary TEXT NULL,
  admin_note TEXT NULL,
  last_message_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id BIGINT NULL,
  status_changed_at TIMESTAMPTZ NULL,
  waiting_since TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_booking_intakes'::regclass
      AND conname = 'ai_booking_intakes_line_user_id_key'
  ) THEN
    ALTER TABLE public.ai_booking_intakes DROP CONSTRAINT ai_booking_intakes_line_user_id_key;
  END IF;
END $$;

ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS thread_context TEXT NULL;
ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL;
ALTER TABLE public.ai_booking_intakes ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_status_updated
  ON public.ai_booking_intakes(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_conversation
  ON public.ai_booking_intakes(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_booking_intakes_line_user_status_updated
  ON public.ai_booking_intakes(line_user_id, status, updated_at DESC);
