-- Partner Apply bank account + submission support fix
-- Safe to run multiple times.

ALTER TABLE public.partner_applications
ADD COLUMN IF NOT EXISTS bank_account_number TEXT;

ALTER TABLE public.technician_profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.technician_profiles
SET updated_at = NOW()
WHERE updated_at IS NULL;
