-- CWF AI Office V8: reply safety decision logs
CREATE TABLE IF NOT EXISTS public.ai_reply_decision_logs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NULL,
  line_user_id TEXT NULL,
  line_display_name TEXT NULL,
  customer_message TEXT NOT NULL DEFAULT '',
  normalized_intent TEXT NOT NULL DEFAULT 'unknown',
  decision TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  risk_label TEXT NOT NULL DEFAULT 'MEDIUM',
  confidence INTEGER NOT NULL DEFAULT 0,
  decision_reason TEXT NULL,
  recommended_reply TEXT NULL,
  approval_id BIGINT NULL,
  source TEXT NOT NULL DEFAULT 'control_center',
  created_by TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_created ON public.ai_reply_decision_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_decision ON public.ai_reply_decision_logs(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_conversation ON public.ai_reply_decision_logs(conversation_id);
