-- Technician Base Status / Team Status Forge (Phase 1)
-- New table only. Does not alter existing tables.
CREATE TABLE IF NOT EXISTS public.technician_base_status_assessments (
  id BIGSERIAL PRIMARY KEY,
  technician_username TEXT NOT NULL,
  assessed_by TEXT,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  level INT NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'C',
  suitable_jobs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  restricted_jobs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  development_plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tech_base_status_tech_created ON public.technician_base_status_assessments(technician_username, created_at DESC);
