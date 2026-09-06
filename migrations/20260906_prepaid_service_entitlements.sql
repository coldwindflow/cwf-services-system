BEGIN;

-- PREPAID service lifecycle is additive. Existing product orders and normal jobs
-- keep their current semantics. The columns below are populated only for
-- order_kind='service_prepaid' / jobs redeemed from a service entitlement.
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS customer_sub TEXT,
  ADD COLUMN IF NOT EXISTS service_entitlement_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS prepaid_entitlement_code TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_claim_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_redeem_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepaid_warranty_days INTEGER,
  ADD COLUMN IF NOT EXISTS manual_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified_by TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_purchase_request_key TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_purchase_fingerprint TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='customer_orders_order_kind_check'
      AND conrelid='public.customer_orders'::regclass
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_order_kind_check
      CHECK (order_kind IN ('product','service_prepaid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='customer_orders_prepaid_warranty_days_check'
      AND conrelid='public.customer_orders'::regclass
  ) THEN
    ALTER TABLE public.customer_orders
      ADD CONSTRAINT customer_orders_prepaid_warranty_days_check
      CHECK (prepaid_warranty_days IS NULL OR prepaid_warranty_days BETWEEN 0 AND 3650);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_orders_prepaid_entitlement_code
  ON public.customer_orders(prepaid_entitlement_code)
  WHERE prepaid_entitlement_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_orders_prepaid_purchase_request
  ON public.customer_orders(prepaid_purchase_request_key)
  WHERE order_kind='service_prepaid' AND prepaid_purchase_request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_service_entitlements (
  entitlement_id BIGSERIAL PRIMARY KEY,
  entitlement_code TEXT NOT NULL UNIQUE,
  order_id BIGINT NOT NULL UNIQUE REFERENCES public.customer_orders(order_id),
  customer_sub TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_snapshot JSONB NOT NULL,
  purchased_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  redeem_until TIMESTAMPTZ NOT NULL,
  warranty_days INTEGER NOT NULL DEFAULT 0,
  claim_token_hash TEXT,
  redemption_request_key TEXT,
  redemption_token_hash TEXT,
  redemption_booking_token TEXT,
  redemption_expires_at TIMESTAMPTZ,
  redeemed_job_id BIGINT,
  redeemed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_service_entitlements_status_check
    CHECK (status IN ('unclaimed','active','redeeming','redeemed','expired','cancelled')),
  CONSTRAINT customer_service_entitlements_amount_check CHECK (purchased_amount > 0),
  CONSTRAINT customer_service_entitlements_warranty_days_check CHECK (warranty_days BETWEEN 0 AND 3650)
);

CREATE INDEX IF NOT EXISTS idx_customer_service_entitlements_customer_status
  ON public.customer_service_entitlements(customer_sub, status, redeem_until DESC);
CREATE INDEX IF NOT EXISTS idx_customer_service_entitlements_redeem_until
  ON public.customer_service_entitlements(redeem_until)
  WHERE status IN ('active','redeeming');
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_service_entitlements_claim_token
  ON public.customer_service_entitlements(claim_token_hash)
  WHERE claim_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_service_entitlements_redemption_token
  ON public.customer_service_entitlements(redemption_token_hash)
  WHERE redemption_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_service_entitlements_redemption_booking_token
  ON public.customer_service_entitlements(redemption_booking_token)
  WHERE redemption_booking_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_service_entitlements_redeemed_job
  ON public.customer_service_entitlements(redeemed_job_id)
  WHERE redeemed_job_id IS NOT NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS customer_due NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_source TEXT,
  ADD COLUMN IF NOT EXISTS prepaid_entitlement_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='jobs_prepaid_entitlement_fk'
      AND conrelid='public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_prepaid_entitlement_fk
      FOREIGN KEY (prepaid_entitlement_id)
      REFERENCES public.customer_service_entitlements(entitlement_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='customer_service_entitlements_redeemed_job_fk'
      AND conrelid='public.customer_service_entitlements'::regclass
  ) THEN
    ALTER TABLE public.customer_service_entitlements
      ADD CONSTRAINT customer_service_entitlements_redeemed_job_fk
      FOREIGN KEY (redeemed_job_id)
      REFERENCES public.jobs(job_id);
  END IF;
END $$;

-- A cancelled, unfinished prepaid job remains linked for audit, but must not
-- permanently burn the customer's right. Excluding cancelled jobs lets the same
-- entitlement create one new live replacement job after the cancellation trigger
-- restores the right to active.
DROP INDEX IF EXISTS public.uq_jobs_prepaid_entitlement;
CREATE UNIQUE INDEX uq_jobs_prepaid_entitlement
  ON public.jobs(prepaid_entitlement_id)
  WHERE prepaid_entitlement_id IS NOT NULL AND canceled_at IS NULL;

-- Once a verified payment moves a prepaid order to PAID, create exactly one
-- service entitlement in the same database transaction. Any malformed prepaid
-- order makes the payment mutation fail instead of silently losing the right.
CREATE OR REPLACE FUNCTION public.issue_prepaid_entitlement_from_paid_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_kind <> 'service_prepaid' OR NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.prepaid_entitlement_code IS NULL
     OR btrim(NEW.prepaid_entitlement_code) = ''
     OR NEW.service_entitlement_snapshot IS NULL
     OR NEW.prepaid_redeem_until IS NULL
     OR NEW.prepaid_warranty_days IS NULL
     OR NEW.subtotal IS NULL
     OR NEW.subtotal <= 0 THEN
    RAISE EXCEPTION 'PREPAID_ORDER_NOT_ENTITLEMENT_READY'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.customer_service_entitlements (
    entitlement_code, order_id, customer_sub, customer_name, customer_phone,
    service_snapshot, purchased_amount, status, redeem_until, warranty_days,
    claim_token_hash, created_at, updated_at
  ) VALUES (
    NEW.prepaid_entitlement_code,
    NEW.order_id,
    NULLIF(btrim(NEW.customer_sub), ''),
    NEW.customer_name,
    NEW.customer_phone,
    NEW.service_entitlement_snapshot,
    NEW.subtotal,
    CASE WHEN NULLIF(btrim(NEW.customer_sub), '') IS NULL THEN 'unclaimed' ELSE 'active' END,
    NEW.prepaid_redeem_until,
    NEW.prepaid_warranty_days,
    NEW.prepaid_claim_token_hash,
    NOW(),
    NOW()
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_prepaid_entitlement_from_paid_order ON public.customer_orders;
CREATE TRIGGER trg_issue_prepaid_entitlement_from_paid_order
AFTER INSERT OR UPDATE OF status ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION public.issue_prepaid_entitlement_from_paid_order();

-- A normal booking token is ignored. A token reserved by begin-redemption is a
-- database capability: lock its entitlement and attach prepaid settlement before
-- the job is inserted. This makes double redemption impossible even across app
-- instances and preserves jobs.job_price/job_items for technician income.
CREATE OR REPLACE FUNCTION public.guard_prepaid_job_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ent public.customer_service_entitlements%ROWTYPE;
BEGIN
  IF NEW.booking_token IS NULL OR btrim(NEW.booking_token) = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO ent
    FROM public.customer_service_entitlements
   WHERE redemption_booking_token = NEW.booking_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF ent.status <> 'redeeming'
     OR ent.customer_sub IS NULL
     OR NEW.customer_sub IS NULL
     OR ent.customer_sub <> NEW.customer_sub
     OR ent.redemption_expires_at IS NULL
     OR ent.redemption_expires_at <= NOW()
     OR ent.redeem_until < NOW()
     OR NEW.appointment_datetime IS NULL
     OR NEW.appointment_datetime > ent.redeem_until
     OR COALESCE(NEW.booking_mode, '') <> 'scheduled'
     OR ent.redeemed_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'PREPAID_REDEMPTION_NOT_ALLOWED'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.prepaid_entitlement_id := ent.entitlement_id;
  NEW.payment_source := 'prepaid_entitlement';
  NEW.customer_due := 0.00;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_prepaid_job_redemption ON public.jobs;
CREATE TRIGGER trg_guard_prepaid_job_redemption
BEFORE INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.guard_prepaid_job_redemption();

CREATE OR REPLACE FUNCTION public.consume_prepaid_entitlement_after_job_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed INTEGER;
BEGIN
  IF NEW.prepaid_entitlement_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customer_service_entitlements
     SET status='redeemed',
         redeemed_job_id=NEW.job_id,
         redeemed_at=NOW(),
         redemption_token_hash=NULL,
         redemption_request_key=NULL,
         redemption_booking_token=NULL,
         redemption_expires_at=NULL,
         updated_at=NOW()
   WHERE entitlement_id=NEW.prepaid_entitlement_id
     AND status='redeeming'
     AND redeemed_job_id IS NULL;

  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'PREPAID_REDEMPTION_CONCURRENT_CONFLICT'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consume_prepaid_entitlement_after_job_insert ON public.jobs;
CREATE TRIGGER trg_consume_prepaid_entitlement_after_job_insert
AFTER INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.consume_prepaid_entitlement_after_job_insert();

-- Cancellation before completion restores the purchased right. The cancelled job
-- stays linked to prepaid_entitlement_id as immutable audit history; only the
-- entitlement's live redemption pointer is cleared. Finished jobs never restore.
CREATE OR REPLACE FUNCTION public.restore_prepaid_entitlement_after_job_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.canceled_at IS NULL
     AND NEW.canceled_at IS NOT NULL
     AND NEW.prepaid_entitlement_id IS NOT NULL
     AND NEW.finished_at IS NULL THEN
    UPDATE public.customer_service_entitlements
       SET status = CASE WHEN redeem_until < NOW() THEN 'expired' ELSE 'active' END,
           redeemed_job_id=NULL,
           redeemed_at=NULL,
           redemption_token_hash=NULL,
           redemption_request_key=NULL,
           redemption_booking_token=NULL,
           redemption_expires_at=NULL,
           updated_at=NOW()
     WHERE entitlement_id=NEW.prepaid_entitlement_id
       AND redeemed_job_id=NEW.job_id
       AND status='redeemed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_prepaid_entitlement_after_job_cancel ON public.jobs;
CREATE TRIGGER trg_restore_prepaid_entitlement_after_job_cancel
AFTER UPDATE OF canceled_at ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.restore_prepaid_entitlement_after_job_cancel();

COMMIT;