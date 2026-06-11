-- CWF AI Reply Control V12
-- Adds support tables / indexes for LINE thread copilot and reply feedback.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.ai_memory_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'unknown',
  event_type TEXT NOT NULL DEFAULT 'event',
  agent_key TEXT NOT NULL DEFAULT 'admin',
  conversation_id BIGINT NULL,
  selected_customer_question TEXT NOT NULL DEFAULT '',
  customer_message TEXT NOT NULL DEFAULT '',
  ai_reply TEXT NOT NULL DEFAULT '',
  final_admin_reply TEXT NOT NULL DEFAULT '',
  action_status TEXT NOT NULL DEFAULT '',
  situation_type TEXT NOT NULL DEFAULT 'general',
  service_type TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_events_conversation_created
  ON public.ai_memory_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_memory_events_event_status
  ON public.ai_memory_events(event_type, action_status, created_at DESC);

-- Compatibility: V12 no longer uses ai_office_enabled to stop customer-reply work.
-- Keep it true if the setting exists from V10/V11.
UPDATE public.ai_office_control_settings
   SET value='true'::jsonb,
       locked=true,
       label='สถานะระบบ AI Office ภายใน',
       description='ใช้เป็นค่า compatibility ภายในเท่านั้น ไม่ใช้ปิดงานตอบลูกค้า',
       updated_at=NOW()
 WHERE key='ai_office_enabled';
