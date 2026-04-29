-- CWF Partner Onboarding Phase 2C
-- Admin Interview / Screening Call
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.partner_interviews (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  interviewer_username TEXT,
  call_status TEXT NOT NULL DEFAULT 'not_called' CHECK (call_status IN ('not_called','no_answer','contacted','follow_up','passed','failed')),
  attitude_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  experience_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  communication_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  tool_readiness_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  availability_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT 'follow_up' CHECK (result IN ('passed','failed','follow_up')),
  admin_note TEXT,
  next_follow_up_at TIMESTAMPTZ,
  interviewed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_interviews_application
ON public.partner_interviews(application_id, interviewed_at DESC);
