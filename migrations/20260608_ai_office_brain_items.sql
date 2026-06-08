CREATE TABLE IF NOT EXISTS public.ai_brain_items (
  id BIGSERIAL PRIMARY KEY,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  customer_stage TEXT NOT NULL DEFAULT '',
  agent_key TEXT NOT NULL DEFAULT 'all',
  language TEXT NOT NULL DEFAULT 'th',
  priority INTEGER NOT NULL DEFAULT 50,
  confidence INTEGER NOT NULL DEFAULT 80,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_brain_items_item_type_check CHECK (item_type IN (
    'service_fact',
    'pricing_rule',
    'sales_playbook',
    'objection_handler',
    'approved_reply',
    'bad_reply_pattern',
    'admin_correction',
    'policy_rule',
    'workflow_rule',
    'technician_rule',
    'customer_stage_rule'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ai_brain_items_active_lookup
  ON public.ai_brain_items(is_active, agent_key, item_type, intent, service_type, customer_stage, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_brain_items_source_active
  ON public.ai_brain_items(source, is_active, updated_at DESC);
