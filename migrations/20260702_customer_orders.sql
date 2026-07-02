-- Customer product orders (buy flow — Phase 2).
-- Stores an order placed from the customer app's purchase sheet. Payment is
-- handled in a later phase (Omise); an order starts as 'pending_payment'.
-- This table is self-contained and does not touch existing booking/accounting
-- tables.

CREATE TABLE IF NOT EXISTS public.customer_orders (
  order_id        BIGSERIAL PRIMARY KEY,
  order_code      TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'pickup',   -- 'pickup' | 'ship'
  install_option  TEXT NOT NULL DEFAULT 'none',     -- 'none' | 'cwf'
  address         TEXT,
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending_payment',
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_phone ON public.customer_orders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_orders_created ON public.customer_orders (created_at DESC);
