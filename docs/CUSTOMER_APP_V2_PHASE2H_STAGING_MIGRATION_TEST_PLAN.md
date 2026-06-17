# Customer App V2 Phase 2H-2.1 Staging Migration Test Plan

Date: 2026-06-17
Repo: `coldwindflow/cwf-services-system`
Baseline main SHA inspected: `548b5f48957e668500f492668cf50e5078256714`

## 1. Purpose

This plan verifies the Phase 2H-2 additive multi-location schema migration on a staging or preview database before any production database migration is applied.

The goal is to confirm that the migration can be applied safely without breaking current booking, tracking, dispatch, admin, technician, receipt, payment, auth, or AI/LINE flows. This phase is a test plan only. It does not change runtime code, SQL migration files, backend routes, frontend UI, admin UI, or production data.

## 2. Preconditions

- Latest GitHub `main` has been pulled before testing.
- A staging or Render preview database is available and isolated from production.
- The database connection string points to staging/preview only.
- Production database backup plan is prepared, but no production migration is run in this phase.
- The PostgreSQL version is confirmed and compatible with the migration syntax, including `IF NOT EXISTS`, partial indexes, `JSONB`, and `NOT VALID` foreign keys.
- The tester has read `migrations/20260617_phase2h_customer_locations.sql` and `docs/CUSTOMER_APP_V2_PHASE2H_DB_MIGRATION_NOTES.md`.
- Current app runtime is deployed or runnable against the staging/preview DB for smoke testing.

Confirm the connected database before running anything:

```sql
SELECT
  current_database() AS database_name,
  current_user AS connected_user,
  inet_server_addr() AS server_address,
  version() AS postgres_version;
```

## 3. Safety Rules

- Never run this migration on production first.
- Do not run the commented audit/backfill queries in the migration.
- Do not run `CREATE INDEX CONCURRENTLY` inside a transaction.
- Defer `ALTER TABLE public.jobs VALIDATE CONSTRAINT jobs_location_id_customer_locations_fk` to a maintenance window after the initial migration apply.
- Current runtime code does not use `customer_locations`, `customer_location_units`, or `jobs.location_id` yet.
- Existing operational address fields remain the current app source of truth: `jobs.address_text`, `jobs.maps_url`, `jobs.job_zone`, `jobs.gps_latitude`, and `jobs.gps_longitude`.
- Stop immediately if the database connection, host, or database name appears to be production.

## 4. Migration Apply Test

1. Connect to the staging/preview database only.
2. Record the database name, PostgreSQL version, and current `public.jobs` row count.
3. Record migration start time.
4. Run `migrations/20260617_phase2h_customer_locations.sql` against staging/preview.
5. Capture all output, warnings, errors, and duration.
6. Record migration end time.
7. Run the schema verification queries in this document.
8. If the first run succeeds, run the migration a second time on staging/preview to confirm idempotency.
9. Confirm the second run does not create duplicate objects, fail on existing columns, or change current app runtime behavior.
10. Run the smoke tests in this document against the app connected to the migrated staging/preview DB.

Suggested timing wrapper:

```sql
SELECT clock_timestamp() AS migration_test_started_at;
-- Run migrations/20260617_phase2h_customer_locations.sql here.
SELECT clock_timestamp() AS migration_test_finished_at;
```

## 5. Schema Verification Queries

Confirm the new tables exist:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customer_locations', 'customer_location_units')
ORDER BY table_name;
```

Confirm required new `public.jobs` columns exist:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jobs'
  AND column_name IN (
    'location_id',
    'location_label_snapshot',
    'place_type_snapshot',
    'building_name_snapshot',
    'tower_snapshot',
    'floor_snapshot',
    'room_snapshot',
    'parking_note_snapshot',
    'access_note_snapshot',
    'juristic_time_note_snapshot',
    'site_contact_name_snapshot',
    'site_contact_phone_snapshot',
    'address_snapshot'
  )
ORDER BY ordinal_position;
```

Confirm the `jobs.location_id` FK exists and is still `NOT VALID`:

```sql
SELECT
  conname,
  convalidated,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.jobs'::regclass
  AND conname = 'jobs_location_id_customer_locations_fk';
```

Expected result: `convalidated = false`.

Confirm `idx_jobs_location_id` was not created by the migration:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'jobs'
  AND indexname = 'idx_jobs_location_id';
```

Expected result before the manual index step: zero rows.

Confirm the default-location indexes exist:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'customer_locations'
  AND indexname IN (
    'ux_customer_locations_default_by_sub',
    'ux_customer_locations_default_by_phone_guest'
  )
ORDER BY indexname;
```

Confirm no rows were automatically backfilled:

```sql
SELECT
  (SELECT COUNT(*) FROM public.customer_locations) AS customer_locations_count,
  (SELECT COUNT(*) FROM public.customer_location_units) AS customer_location_units_count,
  (SELECT COUNT(*) FROM public.jobs WHERE location_id IS NOT NULL) AS jobs_with_location_id_count;
```

Expected result after migration only: all counts are `0`, unless staging/preview already contained manual test data from a previous run.

## 6. Lock-risk / Performance Checks

Measure `public.jobs` row count:

```sql
SELECT COUNT(*) AS jobs_row_count
FROM public.jobs;
```

Check approximate `public.jobs` table and index size:

```sql
SELECT
  pg_size_pretty(pg_relation_size('public.jobs')) AS jobs_table_size,
  pg_size_pretty(pg_indexes_size('public.jobs')) AS jobs_indexes_size,
  pg_size_pretty(pg_total_relation_size('public.jobs')) AS jobs_total_size;
```

Lock-sensitive migration parts:

- `ALTER TABLE public.jobs ADD COLUMN`
- `ALTER TABLE public.jobs ADD CONSTRAINT ... NOT VALID`
- Later `ALTER TABLE public.jobs VALIDATE CONSTRAINT jobs_location_id_customer_locations_fk`
- Manual `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_location_id ON public.jobs(location_id)`

Production may require a maintenance window depending on staging duration, `public.jobs` size, lock observations, and owner risk tolerance.

Optional lock observation during staging apply from a second SQL session:

```sql
SELECT
  a.pid,
  a.state,
  l.locktype,
  l.mode,
  l.granted,
  a.query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation = 'public.jobs'::regclass
ORDER BY l.granted, l.mode;
```

## 7. Manual Index Step Test

The `idx_jobs_location_id` index should be created manually outside a transaction after `jobs.location_id` exists.

Run this separately on staging/preview:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_location_id
  ON public.jobs(location_id);
```

Record:

- Start time
- End time
- Duration
- Any lock waits, warnings, or errors

Confirm the index exists:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'jobs'
  AND indexname = 'idx_jobs_location_id';
```

Do not run this statement inside a transaction. In production, run it as a separate manual step or through a migration runner that explicitly supports non-transactional concurrent index creation.

## 8. Optional FK Validation Test

Only test FK validation on staging/preview:

```sql
ALTER TABLE public.jobs
  VALIDATE CONSTRAINT jobs_location_id_customer_locations_fk;
```

Record:

- Start time
- End time
- Duration
- Any validation errors
- Any observed lock waits

Confirm validation state:

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.jobs'::regclass
  AND conname = 'jobs_location_id_customer_locations_fk';
```

Expected result after this optional staging-only step: `convalidated = true`.

In production, perform validation later only in an approved maintenance window.

## 9. Smoke Test Current App Behavior

After applying the staging migration, verify current app behavior still works without any UI/API code changes:

- Existing `POST /public/book` still works with `address_text`, `maps_url`, and `job_zone`.
- Existing `GET /public/track` still shows the job address from job snapshot fields.
- Admin add job still works with manual or lookup-filled address fields.
- Technician flow still works and can see the expected job address/map data.
- Receipt route still works for existing and newly created staging jobs.
- Login/profile still works.
- Payment/tax/receipt behavior is unchanged.
- LINE/auth behavior is unchanged.
- No current UI expects or requires `location_id`.

Suggested data checks after smoke testing:

```sql
SELECT job_id, address_text, maps_url, job_zone, gps_latitude, gps_longitude, location_id
FROM public.jobs
ORDER BY job_id DESC
LIMIT 10;
```

Expected result: new smoke-test jobs should still have normal snapshot address fields. `location_id` should remain `NULL` because Phase 2H-3 backend APIs do not exist yet.

## 10. Rollback Test Plan

Rollback must be tested on staging/preview before any production migration approval. Review the rollback outline in the migration comments before use.

Rollback outline:

1. Drop new indexes.
2. Drop the `jobs.location_id` foreign key.
3. Drop new nullable `public.jobs` location/snapshot columns.
4. Drop `public.customer_location_units`.
5. Drop `public.customer_locations`.

The `idx_jobs_location_id` rollback step must be run outside a transaction if it was created concurrently:

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_location_id;
```

After rollback on staging/preview:

- Confirm `customer_locations` and `customer_location_units` no longer exist.
- Confirm the added `jobs` location/snapshot columns no longer exist.
- Confirm current booking, tracking, dispatch, admin, technician, receipt, login/profile, payment, tax, auth, and LINE smoke tests still pass.

## 11. Production Go/No-go Checklist

Do not approve production apply unless all items are complete:

- Staging/preview migration succeeded.
- Idempotency was verified by a safe second run.
- No commented backfill/audit mutation was run.
- Schema verification queries passed.
- Manual concurrent `idx_jobs_location_id` index step was tested separately.
- Optional FK validation duration and lock risk were measured on staging/preview.
- Current app smoke tests passed after migration.
- Rollback was rehearsed on staging/preview.
- Production backup is ready.
- Production PostgreSQL version and migration runner behavior are confirmed.
- Maintenance window is approved if needed for `public.jobs` work.
- Owner approval is explicitly given before production DB apply.

## 12. Next Phase Gate

Do not begin Phase 2H-3 backend APIs until the staging/preview migration test passes.

Do not apply the production DB migration until the owner explicitly approves it after reviewing staging results, lock/performance measurements, rollback rehearsal, and smoke test outcomes.
