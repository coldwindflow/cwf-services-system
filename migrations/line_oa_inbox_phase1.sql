CREATE TABLE IF NOT EXISTS public.line_conversations (
  id BIGSERIAL PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NULL,
  picture_url TEXT NULL,
  last_message_text TEXT NULL,
  last_message_type TEXT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.line_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES public.line_conversations(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  message_id TEXT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  event_type TEXT NULL,
  message_type TEXT NULL,
  message_text TEXT NULL,
  raw_event_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_conversations_last_message_at
  ON public.line_conversations(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_line_messages_conversation_created
  ON public.line_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_messages_line_user_created
  ON public.line_messages(line_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_messages_message_id_unique
  ON public.line_messages(message_id)
  WHERE message_id IS NOT NULL;
