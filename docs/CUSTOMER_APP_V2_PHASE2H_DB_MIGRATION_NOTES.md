# Customer App V2 Phase 2H-2 DB Migration Notes

Date: 2026-06-17
Baseline main SHA inspected: `d347b5458fa6b4cd6be2d1ba5fdda16fc90e18ce`

## Scope

This phase drafts the additive database schema for customer multi-location support only.

Changed files:

- `migrations/20260617_phase2h_customer_locations.sql`
- `docs/CUSTOMER_APP_V2_PHASE2H_DB_MIGRATION_NOTES.md`

No runtime code was changed. No backend route, frontend UI, admin UI, auth/OAuth/LINE, payment, tax, receipt, booking, tracking, or production data behavior is changed by this PR.

## Migration Summary

The migration creates:

- `public.customer_locations`
- `public.customer_location_units`

The migration adds nullable fields to `public.jobs`:

- `location_id`
- location label/place/building/access/site contact snapshot columns
- optional `address_snapshot JSONB`

The migration also adds safe indexes and a nullable `jobs.location_id` foreign key to `customer_locations(location_id)` with `ON DELETE SET NULL`.

## Additive / Backward-compatible Design

Existing production behavior remains based on current job snapshot fields:

- `jobs.address_text`
- `jobs.maps_url`
- `jobs.job_zone`
- `jobs.gps_latitude`
- `jobs.gps_longitude`

The migration does not replace or rewrite any of those fields. No API uses `location_id` until Phase 2H-3. No UI uses saved locations until Phase 2H-4.

## Backfill Policy

No automatic backfill is included.

The migration contains commented audit queries only, clearly marked:

- `DO NOT RUN AUTOMATICALLY IN PRODUCTION`
- `Manual review required`

Any future backfill from `customer_profiles` or `jobs` should be reviewed, staged, and run separately after owner approval.

## Rollback Summary

Rollback should be reviewed before use. The migration includes a commented rollback outline:

1. Drop new indexes.
2. Drop `jobs.location_id` foreign key.
3. Drop new nullable `jobs` location/snapshot columns.
4. Drop `customer_location_units`.
5. Drop `customer_locations`.

Because the schema is additive and current runtime code does not use these columns/tables yet, rollback should not affect current booking, tracking, dispatch, receipt, or admin behavior if no later phase has started using the new schema.

## Production Deployment Warning

Before applying to production:

- Backup the database.
- Test the migration on staging or a Render preview database.
- Inspect lock risk for `ALTER TABLE public.jobs`.
- Treat the `public.jobs` index/FK work as the only lock-sensitive part of this draft.
- Create `idx_jobs_location_id` with `CREATE INDEX CONCURRENTLY` outside a transaction, or schedule a manual maintenance window if the migration runner cannot run non-transactional statements.
- The `jobs.location_id` foreign key is added as `NOT VALID` first; validate it later during a maintenance window with `ALTER TABLE public.jobs VALIDATE CONSTRAINT jobs_location_id_customer_locations_fk`.
- Confirm the production PostgreSQL version supports all used `IF NOT EXISTS` patterns.
- Do not run the commented audit/backfill queries automatically.

## Remaining Risks

- `ALTER TABLE public.jobs ADD COLUMN` and foreign key creation can take locks. Test on a copy of production-sized data first.
- `public.jobs` FK validation and `jobs(location_id)` index creation must be planned separately for production-scale data.
- Partial unique default-location indexes enforce one active default by `customer_sub` or guest phone key. Existing data is not backfilled in this phase, so this should not conflict at apply time.
- Future APIs must explicitly decide precedence when both `location_id` and manual address fields are sent.
- Future AI/admin flows must not infer "same as before" when multiple active locations exist.

## Recommended Next Phase

Phase 2H-3 should implement backend APIs behind a conservative rollout plan:

- `GET /public/locations`
- `POST /public/locations`
- `PATCH /public/locations/:id`
- archive/delete endpoint
- unit list/create endpoints
- backward-compatible `/public/book` support for `location_id`
- admin/customer lookup responses that return multiple locations instead of one silent latest address
