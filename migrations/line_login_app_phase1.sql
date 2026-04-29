-- CWF App LINE Login Phase 1
-- Safe to run multiple times.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_picture_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_line_user_id
ON public.users(line_user_id)
WHERE line_user_id IS NOT NULL;

ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS line_id TEXT;
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS line_user_id TEXT;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  username_or_phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_created
ON public.password_reset_requests(status, created_at DESC);
