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

CREATE INDEX IF NOT EXISTS idx_ai_memory_events_context
  ON public.ai_memory_events(conversation_id, agent_key, situation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_memory_events_source_time
  ON public.ai_memory_events(source, event_type, created_at DESC);
