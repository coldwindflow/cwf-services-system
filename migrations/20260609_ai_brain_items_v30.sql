-- CWF AI Office Brain Manager v30
-- Additive-only migration. Does not touch jobs/customers/payments/payouts.

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
  source TEXT NOT NULL DEFAULT 'cwf_brain_v2',
  source_file TEXT NOT NULL DEFAULT '',
  source_version TEXT NOT NULL DEFAULT '',
  risk_label TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_brain_items_priority_range CHECK (priority BETWEEN 1 AND 100),
  CONSTRAINT ai_brain_items_confidence_range CHECK (confidence BETWEEN 1 AND 100),
  CONSTRAINT ai_brain_items_type_allowed CHECK (item_type IN (
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
    'customer_stage_rule',
    'error_code_rule',
    'style_rule'
  ))
);

CREATE INDEX IF NOT EXISTS idx_ai_brain_items_active ON public.ai_brain_items(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_type ON public.ai_brain_items(item_type);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_agent ON public.ai_brain_items(agent_key);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_intent ON public.ai_brain_items(intent);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_service ON public.ai_brain_items(service_type);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_stage ON public.ai_brain_items(customer_stage);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_source ON public.ai_brain_items(source);
CREATE INDEX IF NOT EXISTS idx_ai_brain_items_priority ON public.ai_brain_items(priority DESC, updated_at DESC);
