-- Widen Customer History claim audit methods without changing existing rows.
-- Owner-operated only. The application never runs this migration at startup.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Transaction-scoped and distinct from the original Customer History migration.
SELECT pg_advisory_xact_lock(202607170177);

DO $$
DECLARE
  current_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
    INTO current_definition
    FROM pg_constraint con
   WHERE con.conrelid = 'public.customer_history_claims'::regclass
     AND con.conname = 'customer_history_claims_method_check'
     AND con.contype = 'c';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'customer_history_claims_method_check is missing';
  END IF;

  IF regexp_replace(lower(current_definition), '[[:space:]]+', '', 'g')
       <> 'check((claim_method=''booking_code_phone''::text))' THEN
    RAISE EXCEPTION 'customer_history_claims_method_check is not the approved legacy shape';
  END IF;
END
$$;

CREATE TEMP TABLE cwf_customer_history_claim_methods_snapshot
ON COMMIT DROP
AS
SELECT COUNT(*)::BIGINT AS row_count,
       md5(COALESCE(string_agg(md5(to_jsonb(c)::TEXT), '' ORDER BY c.claim_id), '')) AS row_fingerprint
  FROM public.customer_history_claims c;

ALTER TABLE public.customer_history_claims
  DROP CONSTRAINT customer_history_claims_method_check;

ALTER TABLE public.customer_history_claims
  ADD CONSTRAINT customer_history_claims_method_check
  CHECK (
    claim_method IN (
      'phone',
      'booking_code',
      'booking_code_phone'
    )
  )
  NOT VALID;

ALTER TABLE public.customer_history_claims
  VALIDATE CONSTRAINT customer_history_claims_method_check;

DO $$
DECLARE
  before_count BIGINT;
  before_fingerprint TEXT;
  after_count BIGINT;
  after_fingerprint TEXT;
  widened_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
    INTO widened_definition
    FROM pg_constraint con
   WHERE con.conrelid = 'public.customer_history_claims'::regclass
     AND con.conname = 'customer_history_claims_method_check'
     AND con.contype = 'c';

  IF regexp_replace(lower(COALESCE(widened_definition, '')), '[[:space:]]+', '', 'g')
       <> 'check((claim_method=any(array[''phone''::text,''booking_code''::text,''booking_code_phone''::text])))' THEN
    RAISE EXCEPTION 'customer_history_claims_method_check did not reach the approved widened shape';
  END IF;

  SELECT row_count, row_fingerprint
    INTO before_count, before_fingerprint
    FROM cwf_customer_history_claim_methods_snapshot;

  SELECT COUNT(*)::BIGINT,
         md5(COALESCE(string_agg(md5(to_jsonb(c)::TEXT), '' ORDER BY c.claim_id), ''))
    INTO after_count, after_fingerprint
    FROM public.customer_history_claims c;

  IF before_count IS DISTINCT FROM after_count
     OR before_fingerprint IS DISTINCT FROM after_fingerprint THEN
    RAISE EXCEPTION 'customer_history_claims data changed during method migration';
  END IF;
END
$$;

COMMIT;
