#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_PATH="$ROOT_DIR/data-seeds/20260930_cwf_air_care.sql"

case "$ENVIRONMENT" in
  staging) DB_CONTAINER="cwf-staging-db" ;;
  production) DB_CONTAINER="cwf-production-db" ;;
  *) echo "[FAIL] usage: $0 staging|production" >&2; exit 2 ;;
esac

die(){ echo "[FAIL] $*" >&2; exit 1; }
docker_cmd() {
  if /usr/bin/docker info >/dev/null 2>&1; then /usr/bin/docker "$@"; else sudo -n /usr/bin/docker "$@"; fi
}
db_query() {
  local sql="$1"
  docker_cmd exec "$DB_CONTAINER" sh -ceu 'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -Atqc "$1"' sh "$sql"
}
db_file() {
  docker_cmd exec -i "$DB_CONTAINER" sh -ceu 'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1'
}

[[ -f "$SEED_PATH" ]] || die "AIR CARE seed file missing"
if [[ -n "${EXPECTED_RELEASE_SHA:-}" ]]; then
  status_output="$(sudo -n /usr/local/sbin/cwf-deployctl "$ENVIRONMENT" status)" || die "cannot read deployed revision"
  grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" || die "deployed $ENVIRONMENT revision does not match EXPECTED_RELEASE_SHA"
fi
docker_cmd exec "$DB_CONTAINER" sh -ceu 'exec pg_isready -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}"' >/dev/null || die "database unavailable"

schema_ready="$(db_query "SELECT (to_regclass('public.customer_service_entitlements') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='service_package_payment_mode'))::int")"
[[ "$schema_ready" == "1" ]] || die "PREPAID schema not ready"

db_file < "$SEED_PATH" >/tmp/cwf-air-care-seed.out

count="$(db_query "SELECT count(*) FROM public.catalog_items WHERE service_bundle_key='cwf-air-care' AND booking_mode='contact_admin' AND is_active=TRUE AND is_customer_visible=TRUE AND service_package_payment_mode='prepaid_full' AND service_package_warranty_days=60 AND service_package_sell_start_at='2026-09-30T00:00:00+07:00'::timestamptz AND service_package_sell_end_at='2026-10-06T23:59:59.999+07:00'::timestamptz")"
[[ "$count" == "1" ]] || die "AIR CARE parent verification failed"
variants="$(db_query "SELECT count(*) FROM public.service_packages WHERE package_key IN ('cwf-air-care-small','cwf-air-care-large') AND is_active=TRUE AND is_customer_visible=TRUE")"
[[ "$variants" == "2" ]] || die "AIR CARE variant verification failed"
tiers="$(db_query "SELECT count(*) FROM public.service_package_tiers t JOIN public.service_packages p ON p.service_package_id=t.service_package_id WHERE p.package_key IN ('cwf-air-care-small','cwf-air-care-large') AND t.tier_key IN ('q1','q2','q3','q4') AND t.is_active=TRUE")"
[[ "$tiers" == "8" ]] || die "AIR CARE tier verification failed"
echo "CWF_AIR_CARE_READY environment=$ENVIRONMENT parents=1 variants=2 tiers=8 manual_payment=admin_verified redeem_days=60 warranty_days=60"
