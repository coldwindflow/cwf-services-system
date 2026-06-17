-- Phase 2H-2: Customer multi-location address book schema draft
-- Repo: coldwindflow/cwf-services-system
--
-- Purpose:
--   Add an additive, backward-compatible schema foundation for customers with
--   multiple homes/condos/offices/branches.
--
-- Production safety:
--   - Do not run against production until reviewed and approved.
--   - Take a database backup before applying.
--   - Test on staging / preview DB first.
--   - Inspect lock risk for ALTER TABLE public.jobs before production apply.
--   - No automatic data backfill is included in this migration.
--
-- Current behavior remains unchanged:
--   Existing booking/tracking/dispatch/receipt flows continue using
--   jobs.address_text, jobs.maps_url, jobs.job_zone, jobs.gps_latitude,
--   and jobs.gps_longitude as operational job snapshots.

CREATE TABLE IF NOT EXISTS public.customer_locations (
  location_id BIGSERIAL PRIMARY KEY,
  customer_sub TEXT NULL,
  customer_phone TEXT NULL,
  customer_phone_norm TEXT NULL,
  label TEXT NOT NULL,
  place_type TEXT NULL,
  address_text TEXT NOT NULL,
  maps_url TEXT NULL,
  gps_latitude NUMERIC(10,7) NULL,
  gps_longitude NUMERIC(10,7) NULL,
  job_zone TEXT NULL,
  service_zone_code TEXT NULL,
  building_name TEXT NULL,
  tower TEXT NULL,
  floor_no TEXT NULL,
  room_no TEXT NULL,
  parking_note TEXT NULL,
  access_note TEXT NULL,
  juristic_time_note TEXT NULL,
  site_contact_name TEXT NULL,
  site_contact_phone TEXT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_locations_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT customer_locations_address_not_blank CHECK (length(btrim(address_text)) > 0),
  CONSTRAINT customer_locations_lat_range CHECK (gps_latitude IS NULL OR (gps_latitude >= -90 AND gps_latitude <= 90)),
  CONSTRAINT customer_locations_lng_range CHECK (gps_longitude IS NULL OR (gps_longitude >= -180 AND gps_longitude <= 180))
);

CREATE TABLE IF NOT EXISTS public.customer_location_units (
  unit_id BIGSERIAL PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES public.customer_locations(location_id) ON DELETE RESTRICT,
  unit_label TEXT NULL,
  room_label TEXT NULL,
  ac_type TEXT NULL,
  btu INTEGER NULL,
  brand TEXT NULL,
  model TEXT NULL,
  serial_no TEXT NULL,
  install_position TEXT NULL,
  last_service_job_id BIGINT NULL,
  last_service_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_location_units_btu_positive CHECK (btu IS NULL OR btu > 0)
);

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location_id BIGINT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location_label_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS place_type_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS building_name_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tower_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS floor_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS room_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS parking_note_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS access_note_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS juristic_time_note_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS site_contact_name_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS site_contact_phone_snapshot TEXT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS address_snapshot JSONB NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_location_id_customer_locations_fk'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_location_id_customer_locations_fk
      FOREIGN KEY (location_id)
      REFERENCES public.customer_locations(location_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Later maintenance-window validation after production apply:
-- ALTER TABLE public.jobs VALIDATE CONSTRAINT jobs_location_id_customer_locations_fk;

CREATE INDEX IF NOT EXISTS idx_customer_locations_customer_sub
  ON public.customer_locations(customer_sub)
  WHERE customer_sub IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_locations_customer_phone_norm
  ON public.customer_locations(customer_phone_norm)
  WHERE customer_phone_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_locations_is_active
  ON public.customer_locations(is_active);

CREATE INDEX IF NOT EXISTS idx_customer_locations_job_zone
  ON public.customer_locations(job_zone);

CREATE INDEX IF NOT EXISTS idx_customer_location_units_location_id
  ON public.customer_location_units(location_id);

-- Production lock-sensitive index:
-- If this migration is run by a tool that wraps statements in a transaction,
-- do not put CREATE INDEX CONCURRENTLY in this file. Create this index manually
-- outside a transaction after the nullable jobs.location_id column exists.
--
-- Recommended production step:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_location_id
--   ON public.jobs(location_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_locations_default_by_sub
  ON public.customer_locations(customer_sub)
  WHERE is_active = TRUE
    AND is_default = TRUE
    AND customer_sub IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_locations_default_by_phone_guest
  ON public.customer_locations(customer_phone_norm)
  WHERE is_active = TRUE
    AND is_default = TRUE
    AND customer_sub IS NULL
    AND customer_phone_norm IS NOT NULL;

COMMENT ON TABLE public.customer_locations IS
  'Phase 2H additive saved customer service locations. Runtime APIs do not use this table until Phase 2H-3.';
COMMENT ON TABLE public.customer_location_units IS
  'Phase 2H additive AC/unit inventory per customer location. Runtime APIs do not use this table until Phase 2H-3/2H-4.';
COMMENT ON COLUMN public.jobs.location_id IS
  'Nullable reference to saved customer location. Existing job address/map/zone/GPS fields remain operational snapshots.';
COMMENT ON COLUMN public.jobs.address_snapshot IS
  'Optional immutable JSON snapshot of selected saved location details at booking time.';

-- ---------------------------------------------------------------------------
-- Manual audit/backfill ideas only.
-- DO NOT RUN AUTOMATICALLY IN PRODUCTION.
-- Manual review required before any insert/update of production data.
-- ---------------------------------------------------------------------------

-- Example: inspect candidate saved profile locations by phone/sub.
-- SELECT
--   sub AS customer_sub,
--   phone AS customer_phone,
--   regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS customer_phone_norm,
--   address,
--   maps_url,
--   updated_at
-- FROM public.customer_profiles
-- WHERE COALESCE(address, '') <> ''
-- ORDER BY updated_at DESC NULLS LAST;

-- Example: inspect recent distinct job address candidates by customer phone.
-- SELECT
--   regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') AS customer_phone_norm,
--   customer_name,
--   address_text,
--   maps_url,
--   job_zone,
--   COUNT(*) AS job_count,
--   MAX(COALESCE(finished_at, appointment_datetime, created_at)) AS last_seen_at
-- FROM public.jobs
-- WHERE COALESCE(customer_phone, '') <> ''
--   AND COALESCE(address_text, '') <> ''
-- GROUP BY 1, 2, 3, 4, 5
-- ORDER BY last_seen_at DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- Rollback outline (review before use):
--   DROP INDEX IF EXISTS ux_customer_locations_default_by_phone_guest;
--   DROP INDEX IF EXISTS ux_customer_locations_default_by_sub;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_location_id; -- run outside transaction
--   DROP INDEX IF EXISTS idx_customer_location_units_location_id;
--   DROP INDEX IF EXISTS idx_customer_locations_job_zone;
--   DROP INDEX IF EXISTS idx_customer_locations_is_active;
--   DROP INDEX IF EXISTS idx_customer_locations_customer_phone_norm;
--   DROP INDEX IF EXISTS idx_customer_locations_customer_sub;
--   ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_location_id_customer_locations_fk;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS address_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS site_contact_phone_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS site_contact_name_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS juristic_time_note_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS access_note_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS parking_note_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS room_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS floor_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS tower_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS building_name_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS place_type_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS location_label_snapshot;
--   ALTER TABLE public.jobs DROP COLUMN IF EXISTS location_id;
--   DROP TABLE IF EXISTS public.customer_location_units;
--   DROP TABLE IF EXISTS public.customer_locations;
-- ---------------------------------------------------------------------------
