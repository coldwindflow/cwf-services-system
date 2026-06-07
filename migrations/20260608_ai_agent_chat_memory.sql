CREATE TABLE IF NOT EXISTS public.ai_agent_messages (
  id BIGSERIAL PRIMARY KEY,
  agent_key TEXT NOT NULL DEFAULT 'admin',
  admin_user TEXT NOT NULL DEFAULT '',
  message_role TEXT NOT NULL CHECK (message_role IN ('user','assistant','system')),
  message_text TEXT NOT NULL DEFAULT '',
  source_page TEXT NOT NULL DEFAULT 'admin-ai-office',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_messages_agent_user_time
  ON public.ai_agent_messages(agent_key, admin_user, created_at DESC);
