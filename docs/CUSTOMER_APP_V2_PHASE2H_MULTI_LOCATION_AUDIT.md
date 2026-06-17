# Customer App V2 Phase 2H-1: Multi-location Customer Address Book Audit

Date: 2026-06-17
Repo: `coldwindflow/cwf-services-system`
Baseline: latest `main` at `5e64e67be9c4348bba36fe0e832d184852afd099`

This phase is an audit and architecture proposal only. No production code, database schema, backend behavior, auth, payment, tax, receipt, LINE/OAuth, booking, tracking, admin UI, or customer UI behavior was changed.

## 1. Current Findings

### Files inspected

- `index.js`
- `server/customerLookup.js`
- `admin-add-v2.js`
- `customer.html`
- `track.html`
- `customer-app/index.html`
- `customer-app/modules/api.js`
- `customer-app/modules/state.js`
- `customer-app/modules/profile.js`
- `customer-app/modules/bookingScheduled.js`
- `customer-app/modules/bookingUrgent.js`
- `customer-app/modules/tracking.js`
- `customer-app/modules/services.js`
- `docs/CUSTOMER_APP_V2_*.md`
- `docs/CWF_PROJECT_INSTRUCTIONS_CUSTOMER_APP_V2_ADDENDUM.md`
- Migration-like/schema bootstrap SQL embedded in `index.js`
- Existing migration-like files under `migrations/`

### Routes inspected

- `GET /public/me`
- `PATCH /public/profile/address`
- `POST /public/register`
- `POST /public/book`
- `GET /public/track`
- `POST /public/review`
- `GET /admin/customer_lookup_by_phone_v2`
- Receipt/document usage through `/docs/receipt/:job_id`

### Current data model and one-address limitation

Current customer profile storage is `public.customer_profiles`, created in `index.js` bootstrap with:

- `sub` primary key
- `provider`
- `display_name`
- `picture_url`
- `phone`
- `address`
- `maps_url`
- timestamps

`GET /public/me` returns only one saved profile address and one saved map URL from `customer_profiles`. `PATCH /public/profile/address` overwrites the single `address` and `maps_url` for the logged-in customer profile. There is no location list, no location label, no place type, no per-location access notes, no unit list, and no archive/default-location model.

`server/customerLookup.js` first looks up `customer_profiles` by phone and returns one `address_text`/`maps_url`. If no profile row is found, it falls back to the latest matching `jobs` row by phone and again returns one latest `address_text`/`maps_url`. This is convenient for a one-home customer, but unsafe once one phone number maps to multiple homes, condos, offices, or branches.

Jobs already behave like operational address snapshots. `POST /public/book` writes `customer_name`, `customer_phone`, `address_text`, `maps_url`, `job_zone`, and booking details into `public.jobs`. `GET /public/track` reads these job-level fields back to the customer. Admin job creation also sends `address_text`, `maps_url`, `job_zone`, `gps_latitude`, and `gps_longitude` into job records. This means old jobs can keep their address at booking time if future saved locations are edited later, as long as the job-level fields remain authoritative for dispatch/tracking/receipt.

### Current frontend flows

Customer App V2 scheduled booking stores free-text address fields in `root.state.draft.scheduled`: `address_text`, `maps_url`, and `job_zone`. The scheduled booking payload sends those fields directly to `/public/book`.

Customer App V2 urgent booking stores free-text address fields in `root.state.draft.urgent`: `address_text`, `maps_url`, and `job_zone`. The urgent payload also sends those fields directly to `/public/book`.

Customer App V2 profile page displays one saved address from `/public/me`. It does not currently provide a multi-location picker, add-location form, or saved air-unit inventory per location.

Customer App V2 tracking reads job-level address fields from `/public/track`, including `address_text`, `maps_url`, `job_zone`, `gps_latitude`, and `gps_longitude`.

Legacy `customer.html` has a one-address profile edit modal backed by `/public/profile/address`, and booking submits `address_text` and `maps_url` directly to `/public/book`.

Legacy `track.html` reads job-level tracking data from `/public/track` and uses the job's `address_text`, `gps_latitude`, `gps_longitude`, `maps_url`, photos, review, and receipt URL. It does not need customer profile address for tracking.

### Admin and technician impact today

`admin-add-v2.js` can look up a customer by phone. The lookup fills one latest customer/profile address into the admin add-job form. It does not show a list of locations or require admin selection when multiple locations exist. Admin job creation then writes the selected/free-text address into the job.

Technician-facing and tracking flows rely on `jobs.address_text`, `jobs.maps_url`, `jobs.gps_latitude`, `jobs.gps_longitude`, and `jobs.job_zone`. This is good for a job snapshot strategy, but dangerous if the wrong address is auto-filled into the job before dispatch.

Search/reporting queries in `index.js` filter by job-level `customer_name`, `customer_phone`, `address_text`, `job_zone`, and `booking_code`. They currently do not have a normalized customer location dimension.

### AI/LINE impact today

AI/admin reply templates include `address_text`, `customer_name`, and `customer_phone`. If a customer with multiple locations says "same as before", the system currently has no normalized location set to disambiguate. Any AI flow that pulls "latest job" or profile address by phone can silently choose the wrong location.

## 2. Risk Analysis

### Wrong address risk

If one customer has a home, condo, office, and branch under the same phone number, the single `customer_profiles.address` can be overwritten by the latest profile edit. Admin lookup can also pull the latest job address rather than the intended address. A customer saying "ที่เดิม" or an admin clicking "Use latest customer data" can produce a booking for the wrong site.

### Wrong technician dispatch risk

Dispatch and availability depend on location-sensitive fields: `address_text`, `maps_url`, `gps_latitude`, `gps_longitude`, `job_zone`, and service zone detection. If the wrong location is attached to the job, the system may notify or assign the wrong technician pool, calculate the wrong route, or send a technician to the wrong branch.

### Wrong tracking address risk

Tracking displays the job-level address snapshot. That is correct after a job is created, but if the job was created from the wrong saved/latest address, tracking will confidently show the wrong address to the customer and technician.

### Wrong receipt/history risk

Receipts and historical job views typically use job-level customer/address fields. Old job history should remain stable. The risk is not that old jobs change when a profile changes; the greater risk is that new jobs inherit the wrong current/latest address and then receipts/history preserve the wrong address forever.

### AI/admin wrong assumption risk

AI or admin helpers must not infer that "เหมือนเดิม" means the latest job location when multiple saved locations exist. If multiple locations are available, the safe behavior is to ask which location. If exactly one active location exists, it is safe to offer reuse.

## 3. Proposed Data Model

No migration is proposed in this phase. Future migration should add normalized saved locations while keeping job-level snapshots authoritative.

### `customer_locations`

Recommended fields:

- `location_id BIGSERIAL PRIMARY KEY`
- `customer_id TEXT NULL` or `customer_sub TEXT NULL` for logged-in customer linkage
- `customer_phone TEXT NULL` normalized lookup key for guest/LINE/admin flows
- `label TEXT NOT NULL`, examples: `บ้านอ่อนนุช`, `คอนโดพระราม 3`, `ออฟฟิศบางนา`
- `place_type TEXT NULL`, examples: `home`, `condo`, `office`, `branch`, `other`
- `address_text TEXT NOT NULL`
- `maps_url TEXT NULL`
- `gps_latitude NUMERIC NULL`
- `gps_longitude NUMERIC NULL`
- `job_zone TEXT NULL`
- `service_zone_code TEXT NULL`
- `building_name TEXT NULL`
- `tower TEXT NULL`
- `floor TEXT NULL`
- `room TEXT NULL`
- `parking_note TEXT NULL`
- `access_note TEXT NULL`
- `juristic_time_note TEXT NULL`
- `site_contact_name TEXT NULL`
- `site_contact_phone TEXT NULL`
- `is_default BOOLEAN NOT NULL DEFAULT FALSE`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `archived_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Recommended constraints/indexes:

- Index on `customer_id`/`customer_sub`
- Index on normalized `customer_phone`
- Partial unique default per customer, for example one active default location per `customer_id`
- Optional uniqueness guard on customer + label for active locations, but do not block duplicate real-world branch names without a clear UX

### `customer_location_units`

Recommended fields:

- `unit_id BIGSERIAL PRIMARY KEY`
- `location_id BIGINT NOT NULL REFERENCES customer_locations(location_id)`
- `unit_label TEXT NULL`, examples: `ห้องนอนใหญ่`, `ห้องประชุม`, `ชั้น 2 โซนหน้า`
- `ac_type TEXT NULL`
- `btu INTEGER NULL`
- `brand TEXT NULL`
- `model TEXT NULL`
- `serial_no TEXT NULL`
- `install_position TEXT NULL`
- `last_service_job_id BIGINT NULL`
- `last_service_at TIMESTAMPTZ NULL`
- `notes TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### Job-level location snapshot fields

Future jobs should have `location_id` when a saved location is selected, but must still keep snapshot fields. Existing fields already cover part of this:

- `jobs.address_text`
- `jobs.maps_url`
- `jobs.gps_latitude`
- `jobs.gps_longitude`
- `jobs.job_zone`

Recommended additional snapshot fields for future migration/API design:

- `jobs.location_id BIGINT NULL`
- `jobs.location_label_snapshot TEXT NULL`
- `jobs.place_type_snapshot TEXT NULL`
- `jobs.building_name_snapshot TEXT NULL`
- `jobs.tower_snapshot TEXT NULL`
- `jobs.floor_snapshot TEXT NULL`
- `jobs.room_snapshot TEXT NULL`
- `jobs.parking_note_snapshot TEXT NULL`
- `jobs.access_note_snapshot TEXT NULL`
- `jobs.juristic_time_note_snapshot TEXT NULL`
- `jobs.site_contact_name_snapshot TEXT NULL`
- `jobs.site_contact_phone_snapshot TEXT NULL`
- Optional `jobs.address_snapshot JSONB NULL` if the team wants a single immutable structured object instead of many columns.

## 4. Job Snapshot Strategy

`jobs.location_id` should reference the saved location used at booking time when the customer/admin selects a saved location. However, tracking, technician dispatch, receipts, admin job detail, and history must continue to read the job snapshot, not live mutable location records.

The rule should be:

- Saved location is the source for prefill and selection.
- Job snapshot is the source for operational truth after booking.
- Editing a saved location later must not change old jobs.
- Archiving a saved location must not break old tracking/receipts/history.
- If a customer books with free-text address and no saved location, `jobs.location_id` remains null and snapshot fields still preserve the booking address.

Existing `jobs.address_text` already acts as a snapshot. Future changes should extend, not replace, that behavior.

## 5. API Proposal

No endpoints should be added in Phase 2H-1. Future endpoints:

- `GET /public/locations`
  - Return active saved locations for the logged-in customer or phone-verified customer context.
  - Include location labels, place type, address summary, maps URL, GPS, job zone, notes, default flag, and optional unit counts.
- `POST /public/locations`
  - Create a location with label, place type, address, maps, GPS, zone, building/access/site-contact details.
  - Validate label/address length and map URL length.
- `PATCH /public/locations/:id`
  - Update saved location details.
  - Must not update existing jobs.
- `POST /public/locations/:id/archive` or `DELETE /public/locations/:id`
  - Prefer archive/soft-delete over hard delete.
  - Must fail safely if location is referenced by jobs, or simply archive while jobs keep snapshots.
- `GET /public/locations/:id/units`
  - Return active air units at that location.
- `POST /public/locations/:id/units`
  - Add an AC/unit record for future rebooking and maintenance history.

`POST /public/book` should remain backward-compatible:

- Existing payload with `address_text`, `maps_url`, and `job_zone` must keep working.
- New payload may include `location_id`.
- If `location_id` is provided, backend loads the active saved location, copies it into job snapshot fields, and also stores `jobs.location_id`.
- If `location_id` and manual `address_text` are both provided, define explicit precedence. Recommended: `location_id` wins for saved-location booking; manual address is allowed only when `location_id` is absent or when an explicit `address_override_confirmed` flag exists for admin use.
- Reject archived/inactive locations for new bookings.
- If multiple locations exist and no `location_id` is provided in logged-in/AI flow, frontend/AI should ask for selection instead of guessing.

## 6. Customer App V2 UX Proposal

Recommended flow:

1. Customer opens booking.
2. If logged in and active locations exist, show saved location picker first.
3. Picker cards show label and short address:
   - `บ้านอ่อนนุช`
   - `คอนโดพระราม 3`
   - `ออฟฟิศบางนา`
4. Customer can choose a saved location or add a new location.
5. Add-location flow captures:
   - label
   - place type
   - full address
   - maps URL / GPS
   - zone
   - building/condo name
   - tower/floor/room
   - parking/access/juristic time notes
   - site contact name/phone
6. If location has saved units, customer selects one or more AC units at that location.
7. Booking payload sends `location_id` plus selected `unit_id` values where available.
8. Backend creates job snapshots from the selected location and units.
9. Rebook from previous job should offer "use same job location snapshot" and optionally "save/update this as a location", but must not silently mutate old jobs.

Guest mode should continue supporting manual `address_text` entry. A later phase can offer "save this location" after login/phone verification.

## 7. Admin UX Proposal

Admin phone lookup must show all matching customer locations, not just one latest profile/job address.

Rules:

- If zero saved locations: allow manual address entry and optionally show latest job address as a clearly labeled suggestion.
- If one saved location: show it as selected but still visible.
- If multiple saved locations: require admin to choose one before creating the job.
- Do not auto-fill latest address silently when multiple active locations exist.
- Show labels and address summaries clearly:
  - `บ้านอ่อนนุช`
  - `คอนโดพระราม 3`
  - `ออฟฟิศบางนา`
- Show access notes/site contact for dispatch readiness.
- Allow admin override/manual address only as an explicit action with a visible reason.

Admin job creation should store both `location_id` and job snapshot fields. Admin search/history can later filter by location label, area, branch, or `location_id`.

## 8. AI/LINE Rules

AI/LINE must follow deterministic location rules:

- If no saved locations exist, ask for address and optionally save it after confirmation.
- If one active saved location exists, AI may ask "ใช้ที่อยู่ X ใช่ไหม" or reuse it when the user clearly says same as saved/default.
- If multiple active saved locations exist, AI must ask which location.
- Do not assume "เหมือนเดิม", "ที่เดิม", "บ้านเดิม", or "สาขาเดิม" when multiple locations exist.
- Do not ask the customer to retype a full address after a saved location is selected.
- Confirm label/address before booking if the selection came from ambiguous text.
- AI/admin replies must use the job snapshot after booking, not the mutable saved location.
- If the customer mentions a new branch/home/condo, AI should create a draft location candidate and ask for confirmation before saving/booking.

## 9. Migration Plan

### Phase 2H-2 DB migration

- Add `customer_locations`.
- Add `customer_location_units`.
- Add nullable `jobs.location_id` and optional snapshot columns or `address_snapshot JSONB`.
- Backfill candidate locations from `customer_profiles` and optionally from recent distinct job addresses, but only as inactive/draft or low-confidence rows unless reviewed.
- Rollback: migration should be additive. Dropping new tables/columns should not affect existing booking/tracking because existing job fields remain.

### Phase 2H-3 backend APIs

- Add location CRUD endpoints.
- Add units endpoints.
- Extend `/public/book` to accept `location_id` while preserving `address_text` behavior.
- Extend admin lookup to return all locations and latest job suggestions separately.
- Add server-side safety: multiple locations require explicit `location_id` in saved-location flows.
- Rollback: feature-flag new endpoints and keep current `/public/book` payload path unchanged.

### Phase 2H-4 customer app UI

- Add saved location picker to scheduled and urgent flows.
- Add new-location form.
- Add location/unit selection to booking payload.
- Add profile address book management.
- Keep guest/manual address flow.
- Rollback: hide UI behind a feature flag and keep manual fields as fallback.

### Phase 2H-5 admin/AI integration

- Update admin phone lookup to show all locations.
- Update admin add-job form to require location selection when multiple active locations exist.
- Update AI/LINE memory/reply rules to ask for location disambiguation.
- Update technician/admin display to show location label and access notes from job snapshot.
- Rollback: disable multi-location lookup UI and fall back to manual job snapshot entry.

## 10. File Scope Proposal for Next Phase

### Phase 2H-2 backend/migrations

- `migrations/<new_phase2h_customer_locations>.sql`
- `index.js` only for schema bootstrap if the project continues the existing embedded bootstrap pattern
- Potential helper under `server/` for location validation/normalization, for example `server/customerLocations.js`
- Docs update under `docs/`

### Phase 2H-3 backend APIs

- `index.js`
- `server/customerLookup.js`
- New `server/customerLocations.js` helper if approved
- Tests/scripts if this repo adds a route test harness later
- Docs update under `docs/`

### Phase 2H-4 frontend

- `customer-app/modules/api.js`
- `customer-app/modules/state.js`
- `customer-app/modules/profile.js`
- `customer-app/modules/bookingScheduled.js`
- `customer-app/modules/bookingUrgent.js`
- `customer-app/modules/ui.js` if shared components are needed
- `customer-app/assets/customer-app.css`
- Possibly `customer-app/modules/tracking.js` only if location label/snapshot display needs a customer-facing update

### Phase 2H-5 admin/AI

- `admin-add-v2.js`
- Related admin HTML/CSS only if the location picker requires markup changes
- `server/customerLookup.js`
- AI/LINE route or prompt/memory files identified in the implementation phase
- Docs update under `docs/`

## Definition of Done Check

- Production code changed: no.
- Database changed: no.
- Backend behavior changed: no.
- Customer/admin UI changed: no.
- New file created: `docs/CUSTOMER_APP_V2_PHASE2H_MULTI_LOCATION_AUDIT.md`.

## Next Recommended Authorization

Recommended next phase is Phase 2H-2 with explicit authorization for:

- One additive migration file creating `customer_locations`, `customer_location_units`, and nullable job reference/snapshot fields.
- Optional read-only backfill audit query/script, not automatic production data mutation.
- No changes to `/public/book` until Phase 2H-3.
