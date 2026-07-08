-- Core tables the app expects to pre-exist (production predates the boot-time
-- bootstrap style, so index.js does NOT create these). E2E-only — never run
-- against production. Everything else (job_offers, job_items, auth_sessions,
-- technician_service_matrix, technician_monthly_work_calendar, catalog_items,
-- customer_service_price_rules, ...) is created by index.js itself on boot.

CREATE TABLE IF NOT EXISTS public.users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'technician',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.technician_profiles (
  username             TEXT PRIMARY KEY,
  full_name            TEXT,
  phone                TEXT,
  photo_path           TEXT,
  rank_level           INT,
  rank_key             TEXT,
  rating               NUMERIC,
  grade                TEXT,
  employment_type      TEXT DEFAULT 'company',
  work_start           TEXT DEFAULT '09:00',
  work_end             TEXT DEFAULT '18:00',
  accept_status        TEXT DEFAULT 'ready',
  accept_status_expires_at TIMESTAMPTZ,
  weekly_off_days      TEXT DEFAULT '',
  customer_slot_visible BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  job_id               BIGSERIAL PRIMARY KEY,
  booking_code         TEXT UNIQUE,
  booking_token        TEXT,
  customer_name        TEXT,
  customer_phone       TEXT,
  job_type             TEXT,
  appointment_datetime TIMESTAMPTZ,
  job_price            NUMERIC(12,2),
  address_text         TEXT,
  technician_team      TEXT,
  technician_username  TEXT,
  job_status           TEXT,
  job_source           TEXT,
  dispatch_mode        TEXT,
  booking_mode         TEXT,
  allow_time_proposal  BOOLEAN,
  customer_note        TEXT,
  technician_note      TEXT,
  maps_url             TEXT,
  job_zone             TEXT,
  duration_min         INT,
  gps_latitude         DOUBLE PRECISION,
  gps_longitude        DOUBLE PRECISION,
  travel_started_at    TIMESTAMPTZ,
  checkin_at           TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  canceled_at          TIMESTAMPTZ,
  cancel_reason        TEXT,
  customer_rating      INT,
  customer_review      TEXT,
  customer_complaint   TEXT,
  reviewed_at          TIMESTAMPTZ,
  paid_at              TIMESTAMPTZ,
  paid_by              TEXT,
  payment_status       TEXT,
  final_signature_path TEXT,
  final_signature_at   TIMESTAMPTZ,
  catalog_item_id      BIGINT,
  customer_sub         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_e2e_jobs_token ON public.jobs (booking_token);
CREATE INDEX IF NOT EXISTS idx_e2e_jobs_appt ON public.jobs (appointment_datetime);
