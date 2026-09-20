#!/usr/bin/env bash
set -Eeuo pipefail

readonly EXPECTED_MIGRATION_SHA256="99a280a2030aad01520d194f006bde469edd43dd70df417d1bb10b767a50a1c2"
readonly MIGRATION_PATH="migrations/20260920_job_brand_foundation.sql"
readonly DB_CONTAINER="cwf-production-db"
readonly PRODUCTION_ORIGIN="https://app.cwf-air.com"

die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log(){ printf '%s\n' "$*"; }
require_command(){ command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"; }

sha256_file(){
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; return; fi
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; return; fi
  die "sha256sum/shasum is unavailable"
}

db_query(){
  local sql="$1"
  docker exec "$DB_CONTAINER" sh -ceu 'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -Atqc "$1"' sh "$sql"
}

assert_db_value(){
  local description="$1" sql="$2" expected="$3" actual
  actual="$(db_query "$sql")" || die "database verification failed: $description"
  [[ "$actual" == "$expected" ]] || die "$description: expected '$expected', got '$actual'"
}

[[ "$#" -eq 0 ]] || die "this operator accepts no arguments"
[[ "${CWF_ENVIRONMENT:-}" == "production" ]] || die "CWF_ENVIRONMENT must be production"
[[ -f "$MIGRATION_PATH" ]] || die "approved migration file is missing: $MIGRATION_PATH"
require_command cwf-deployctl
require_command docker
require_command curl

actual_sha="$(sha256_file "$MIGRATION_PATH")"
[[ "$actual_sha" == "$EXPECTED_MIGRATION_SHA256" ]] || die "migration SHA256 mismatch"

log "Running Production preflight"
pre_status="$(cwf-deployctl production status)" || die "Production status preflight failed"
grep -Eiq '(^|[^[:alpha:]])(healthy|running|ok)([^[:alpha:]]|$)' <<<"$pre_status" || die "Production status lacks healthy/running evidence"
grep -Eiq '(unhealthy|degraded|failed|stopped|exited)' <<<"$pre_status" && die "Production status contains unhealthy evidence"

backup_evidence="$(cwf-deployctl production list-backups)" || die "Production backup listing failed"
[[ -n "${backup_evidence//[[:space:]]/}" ]] || die "Production backup listing is empty"
grep -Eiq '(no backups?|none found|0 backups?)' <<<"$backup_evidence" && die "Production backup listing reported no usable backups"
grep -Eiq '(\.sql(\.gz)?|\.dump|\.tar|backup[-_][^[:space:]]*[0-9]{8})' <<<"$backup_evidence" || die "Production backup listing did not contain recognizable backup evidence"

[[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" == "true" ]] || die "Production database container is not running"
assert_db_value "Production database connectivity" "SELECT 1" "1"
assert_db_value "jobs table exists" "SELECT to_regclass('public.jobs') IS NOT NULL" "t"

jobs_before="$(db_query 'SELECT count(*) FROM public.jobs')" || die "could not record pre-migration jobs count"
[[ "$jobs_before" =~ ^[0-9]+$ ]] || die "invalid pre-migration jobs count"

log "Applying exact checksum-pinned job-brand migration"
docker exec -i "$DB_CONTAINER" sh -ceu 'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1' < "$MIGRATION_PATH" || die "job-brand migration failed"

assert_db_value "jobs.brand_key TEXT NOT NULL" "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='brand_key' AND data_type='text' AND is_nullable='NO'" "1"
assert_db_value "jobs.brand_key default cwf" "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='brand_key' AND column_default IN ('''cwf''::text','''cwf''')" "1"
assert_db_value "jobs.brand_key contains no NULL" "SELECT count(*) FROM public.jobs WHERE brand_key IS NULL" "0"
assert_db_value "legacy jobs resolve to cwf" "SELECT count(*) FROM public.jobs WHERE brand_key <> 'cwf'" "0"

jobs_after="$(db_query 'SELECT count(*) FROM public.jobs')" || die "could not record post-migration jobs count"
[[ "$jobs_after" == "$jobs_before" ]] || die "jobs count changed (before=$jobs_before, after=$jobs_after)"

post_status="$(cwf-deployctl production status)" || die "Production status post-check failed"
grep -Eiq '(unhealthy|degraded|failed|stopped|exited)' <<<"$post_status" && die "Production status contains unhealthy evidence"
version_response="$(curl --fail --silent --show-error --max-time 15 "$PRODUCTION_ORIGIN/api/version")" || die "Production version endpoint check failed"
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$version_response" || die "Production version endpoint did not report ok=true"

log "Job-brand migration verified successfully; jobs count remained $jobs_after"
