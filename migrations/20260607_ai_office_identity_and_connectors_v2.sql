-- CWF AI Office Production Connectors + LINE customer identity resolver v2
-- Read-only/draft-only support tables. No mutation to jobs/customer production tables.

BEGIN;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_messages_message_id_unique ON public.line_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_conversations_last_message_at ON public.line_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_line_messages_conversation_created ON public.line_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_messages_line_user_created ON public.line_messages(line_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.line_customer_links (
  id BIGSERIAL PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  conversation_id BIGINT REFERENCES public.line_conversations(id) ON DELETE SET NULL,
  customer_phone TEXT NULL,
  customer_name TEXT NULL,
  last_job_id TEXT NULL,
  match_source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by TEXT NULL,
  verified_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_customer_links_phone ON public.line_customer_links(customer_phone);
CREATE INDEX IF NOT EXISTS idx_line_customer_links_conversation ON public.line_customer_links(conversation_id);

CREATE TABLE IF NOT EXISTS public.ai_office_oauth_tokens (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_type TEXT NULL,
  scope TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_office_google_ads_daily (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  campaign_id TEXT NULL,
  campaign_name TEXT NULL,
  ad_group_id TEXT NULL,
  ad_group_name TEXT NULL,
  search_term TEXT NULL,
  keyword_text TEXT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(18,4) NOT NULL DEFAULT 0,
  source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, report_date, campaign_id, ad_group_id, search_term, keyword_text)
);

CREATE INDEX IF NOT EXISTS idx_ai_office_google_ads_daily_date ON public.ai_office_google_ads_daily(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_office_google_ads_daily_search_term ON public.ai_office_google_ads_daily(search_term);

COMMIT;
