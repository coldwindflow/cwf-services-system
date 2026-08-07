#!/usr/bin/env bash
set -Eeuo pipefail

readonly EXPECTED_PRODUCTION_REVISION="8093ad5db19c3da10642b248b47f74ae739272e6"
readonly MIGRATION_PATH="migrations/20260807_service_packages.sql"
readonly DB_CONTAINER="cwf-production-db"
readonly PRODUCTION_ORIGIN="https://app.cwf-air.com"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

validate_production_status() {
  local status_output="$1"
  grep -Fq "$EXPECTED_PRODUCTION_REVISION" <<<"$status_output" ||
    die "Production revision does not match the approved revision"
  grep -Eiq '(^|[^[:alpha:]])(healthy|running|ok)([^[:alpha:]]|$)' <<<"$status_output" ||
    die "Production status does not contain healthy/running evidence"
  grep -Eiq '(unhealthy|degraded|failed|stopped|exited)' <<<"$status_output" &&
    die "Production status contains unhealthy evidence"
}

db_query() {
  local sql="$1"
  docker exec "$DB_CONTAINER" sh -ceu \
    'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -Atqc "$1"' \
    sh "$sql"
}

assert_db_value() {
  local description="$1"
  local sql="$2"
  local expected="$3"
  local actual
  actual="$(db_query "$sql")" || die "database verification failed: $description"
  [[ "$actual" == "$expected" ]] ||
    die "$description: expected '$expected', got '$actual'"
}

[[ "$#" -eq 0 ]] || die "this operator accepts no arguments"
[[ -f "$MIGRATION_PATH" ]] || die "approved migration file is missing: $MIGRATION_PATH"
require_command cwf-deployctl
require_command docker
require_command curl

log "Running read-only Production preflight checks"
pre_status="$(cwf-deployctl production status)" || die "Production status preflight failed"
validate_production_status "$pre_status"

backup_evidence="$(cwf-deployctl production list-backups)" || die "Production backup listing failed"
[[ -n "${backup_evidence//[[:space:]]/}" ]] || die "Production backup listing was empty"
grep -Eiq '(no backups?|none found|0 backups?)' <<<"$backup_evidence" &&
  die "Production backup listing reported no usable backups"
grep -Eiq '(\.sql(\.gz)?|\.dump|\.tar|backup[-_][^[:space:]]*[0-9]{8})' <<<"$backup_evidence" ||
  die "Production backup listing did not contain recognizable backup evidence"

[[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" == "true" ]] ||
  die "Production database container is not running"
assert_db_value "Production database connectivity" "SELECT 1" "1"

job_items_before="$(db_query 'SELECT count(*) FROM public.job_items')" ||
  die "could not record the pre-migration job_items count"
[[ "$job_items_before" =~ ^[0-9]+$ ]] || die "invalid pre-migration job_items count"

log "Applying the single hard-pinned service-package migration"
docker exec -i "$DB_CONTAINER" sh -ceu \
  'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1' \
  < "$MIGRATION_PATH" || die "service-package migration failed"

assert_db_value "service_packages table" \
  "SELECT to_regclass('public.service_packages') IS NOT NULL" "t"
assert_db_value "service_package_tiers table" \
  "SELECT to_regclass('public.service_package_tiers') IS NOT NULL" "t"
assert_db_value "nullable job_items service-package columns" \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='job_items' AND is_nullable='YES' AND ((column_name='service_package_id' AND data_type='bigint') OR (column_name='service_package_tier_id' AND data_type='bigint') OR (column_name='service_package_snapshot' AND data_type='jsonb'))" "3"
assert_db_value "job_items_service_package_fk ON DELETE RESTRICT" \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.job_items'::regclass AND conname='job_items_service_package_fk' AND contype='f' AND confdeltype='r'" "1"
assert_db_value "job_items_service_package_tier_fk ON DELETE RESTRICT" \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.job_items'::regclass AND conname='job_items_service_package_tier_fk' AND contype='f' AND confdeltype='r'" "1"
assert_db_value "service_package_tiers parent FK ON DELETE RESTRICT" \
  "SELECT count(*) FROM pg_constraint WHERE conrelid='public.service_package_tiers'::regclass AND conname='service_package_tiers_service_package_id_fkey' AND contype='f' AND confrelid='public.service_packages'::regclass AND confdeltype='r'" "1"
assert_db_value "expected service-package indexes" \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_service_packages_customer_listing','idx_service_package_tiers_lookup','idx_job_items_service_package_id')" "3"
assert_db_value "service_packages remains unseeded" \
  "SELECT count(*) FROM public.service_packages" "0"
assert_db_value "service_package_tiers remains unseeded" \
  "SELECT count(*) FROM public.service_package_tiers" "0"

job_items_after="$(db_query 'SELECT count(*) FROM public.job_items')" ||
  die "could not record the post-migration job_items count"
[[ "$job_items_after" == "$job_items_before" ]] ||
  die "job_items count changed (before=$job_items_before, after=$job_items_after)"

log "Running read-only Production post-checks"
post_status="$(cwf-deployctl production status)" || die "Production status post-check failed"
validate_production_status "$post_status"

version_response="$(curl --fail --silent --show-error --max-time 15 "$PRODUCTION_ORIGIN/api/version")" ||
  die "Production version endpoint check failed"
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$version_response" ||
  die "Production version endpoint did not report ok=true"
curl --fail --silent --show-error --max-time 15 \
  "$PRODUCTION_ORIGIN/public/service-packages" >/dev/null ||
  die "Production public service-package read check failed"

log "Migration verified successfully; job_items count remained $job_items_after and package/tier counts remained zero"
