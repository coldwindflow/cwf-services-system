CREATE TABLE IF NOT EXISTS public.ai_line_chat_drafts (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  selected_customer_message TEXT NOT NULL DEFAULT '',
  admin_instruction TEXT NOT NULL DEFAULT '',
  ai_draft TEXT NOT NULL DEFAULT '',
  final_admin_reply TEXT NOT NULL DEFAULT '',
  action_status TEXT NOT NULL DEFAULT 'drafted',
  created_by TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_line_chat_drafts_conversation_time
  ON public.ai_line_chat_drafts(conversation_id, created_at DESC);
