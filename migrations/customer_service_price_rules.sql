CREATE TABLE IF NOT EXISTS public.customer_service_price_rules (
  rule_id BIGSERIAL PRIMARY KEY,
  job_type TEXT,
  ac_type TEXT,
  wash_variant TEXT,
  btu_min INT,
  btu_max INT,
  machine_min INT,
  machine_max INT,
  normal_price NUMERIC(12,2) DEFAULT 0,
  active_price NUMERIC(12,2) DEFAULT 0,
  label TEXT,
  campaign_name TEXT,
  campaign_copy TEXT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_price_rules_lookup
  ON public.customer_service_price_rules(is_active, job_type, ac_type, wash_variant, priority);

CREATE INDEX IF NOT EXISTS idx_customer_price_rules_dates
  ON public.customer_service_price_rules(effective_from, effective_to);

ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_rule_id BIGINT;
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS normal_unit_price NUMERIC(12,2);
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_label TEXT;
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_campaign_name TEXT;
ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_source TEXT;
