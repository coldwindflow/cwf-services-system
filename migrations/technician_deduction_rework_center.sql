-- Technician Deduction & Warranty Rework Center
-- Backward-compatible schema. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.technician_deduction_cases (
  case_id BIGSERIAL PRIMARY KEY,
  case_code TEXT UNIQUE NOT NULL,
  technician_username TEXT NOT NULL,
  job_id BIGINT NULL REFERENCES public.jobs(job_id) ON DELETE SET NULL,
  deduction_type TEXT NOT NULL CHECK (deduction_type IN (
    'late_arrival','missing_status_update','missing_required_photos','poor_work_quality',
    'customer_complaint_valid','left_before_complete','no_show','same_day_cancel',
    'warranty_rework_minor','warranty_rework_major','rework_failed','replacement_technician_cost',
    'customer_property_damage','company_equipment_damage','off_platform_payment',
    'confidentiality_breach','fraud_or_false_report','deposit_installment',
    'deposit_damage_offset','manual_adjustment','overpayment_recovery'
  )),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  reason TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_approval','approved','applied','rejected','voided')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  voided_by TEXT,
  voided_at TIMESTAMPTZ,
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  applied_payout_id TEXT NULL,
  applied_adjustment_id BIGINT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tdc_technician_created ON public.technician_deduction_cases(technician_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdc_job_id ON public.technician_deduction_cases(job_id);
CREATE INDEX IF NOT EXISTS idx_tdc_status_created ON public.technician_deduction_cases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdc_deduction_type ON public.technician_deduction_cases(deduction_type);
CREATE INDEX IF NOT EXISTS idx_tdc_severity ON public.technician_deduction_cases(severity);

CREATE TABLE IF NOT EXISTS public.technician_rework_cases (
  rework_case_id BIGSERIAL PRIMARY KEY,
  case_code TEXT UNIQUE NOT NULL,
  job_id BIGINT NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
  technician_username TEXT,
  reason_type TEXT NOT NULL CHECK (reason_type IN (
    'water_leak','not_clean','customer_complaint','missing_photos',
    'same_issue_not_fixed','poor_work_standard','other'
  )),
  reason_note TEXT,
  warranty_checked BOOLEAN NOT NULL DEFAULT FALSE,
  warranty_end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','voided')),
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('fixed','failed','changed_technician','company_absorbed','deduction_required')),
  revisit_result TEXT,
  revisit_note TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_deduction_case_id BIGINT NULL REFERENCES public.technician_deduction_cases(case_id) ON DELETE SET NULL,
  created_by TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trc_job_id ON public.technician_rework_cases(job_id);
CREATE INDEX IF NOT EXISTS idx_trc_technician_created ON public.technician_rework_cases(technician_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trc_status_created ON public.technician_rework_cases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trc_resolution ON public.technician_rework_cases(resolution);

CREATE TABLE IF NOT EXISTS public.technician_deduction_audit_logs (
  audit_id BIGSERIAL PRIMARY KEY,
  actor_username TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json JSONB,
  after_json JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tdal_created ON public.technician_deduction_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdal_entity ON public.technician_deduction_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tdal_actor ON public.technician_deduction_audit_logs(actor_username, created_at DESC);
