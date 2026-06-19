-- Customer App V2 provider identity support for LINE + Google.
-- Apply during a planned deployment window. Do not run against production until reviewed.

BEGIN;

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.customer_identities (
  identity_id BIGSERIAL PRIMARY KEY,
  customer_sub TEXT NOT NULL REFERENCES public.customer_profiles(sub) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  display_name TEXT,
  picture_url TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_customer_identities_customer_sub
  ON public.customer_identities(customer_sub);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_verified_email
  ON public.customer_profiles(lower(email))
  WHERE email_verified = TRUE;

-- Optional backfill for existing LINE customers after review:
-- INSERT INTO public.customer_identities
--   (customer_sub, provider, provider_subject, email, email_verified, display_name, picture_url)
-- SELECT
--   sub,
--   'line',
--   regexp_replace(sub, '^line:', ''),
--   email,
--   COALESCE(email_verified, FALSE),
--   display_name,
--   picture_url
-- FROM public.customer_profiles
-- WHERE sub LIKE 'line:%'
-- ON CONFLICT (provider, provider_subject) DO NOTHING;

COMMIT;

-- Rollback plan:
-- DROP TABLE IF EXISTS public.customer_identities;
-- DROP INDEX IF EXISTS public.idx_customer_profiles_verified_email;
-- ALTER TABLE public.customer_profiles DROP COLUMN IF EXISTS email_verified;
-- ALTER TABLE public.customer_profiles DROP COLUMN IF EXISTS email;
