#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_PATH="$ROOT_DIR/data-seeds/20260930_cwf_air_care.sql"

case "$ENVIRONMENT" in
  staging) DB_CONTAINER="cwf-staging-db"; APP_CONTAINER="cwf-staging-app" ;;
  production) DB_CONTAINER="cwf-production-db"; APP_CONTAINER="cwf-production-app" ;;
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
quote_probe() {
  local phase="$1"
  docker_cmd exec -e CWF_ENVIRONMENT="$ENVIRONMENT" "$APP_CONTAINER" node scripts/probe-air-care-quotes.js "$phase"
}

[[ -f "$SEED_PATH" ]] || die "AIR CARE seed file missing"
if [[ -n "${EXPECTED_RELEASE_SHA:-}" ]]; then
  status_output="$(sudo -n /usr/local/sbin/cwf-deployctl "$ENVIRONMENT" status)" || die "cannot read deployed revision"
  grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" || die "deployed $ENVIRONMENT revision does not match EXPECTED_RELEASE_SHA"
fi
docker_cmd exec "$DB_CONTAINER" sh -ceu 'exec pg_isready -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}"' >/dev/null || die "database unavailable"
docker_cmd inspect "$APP_CONTAINER" >/dev/null 2>&1 || die "application container unavailable"

schema_ready="$(db_query "SELECT (to_regclass('public.customer_service_entitlements') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_items' AND column_name='service_package_payment_mode'))::int")"
[[ "$schema_ready" == "1" ]] || die "PREPAID schema not ready"

if quote_probe preseed; then
  echo "CWF_AIR_CARE_PRESEED_QUOTE environment=$ENVIRONMENT status=passed"
else
  echo "CWF_AIR_CARE_PRESEED_QUOTE environment=$ENVIRONMENT status=failed action=repairing"
fi

db_file < "$SEED_PATH" >/tmp/cwf-air-care-seed.out

count="$(db_query "WITH desired(bundle_key,pricing_strategy,selection_mode) AS (VALUES ('coldwindflow-air-care-standard','total_quantity_tier_plus_unit_modifiers','multi_variant'),('coldwindflow-air-care-premium','per_variant_tier','exclusive_level')) SELECT count(*) FROM desired d JOIN public.catalog_items c ON c.service_bundle_key=d.bundle_key WHERE c.booking_mode='contact_admin' AND c.booking_flow_policy='scheduled_only' AND c.is_active=TRUE AND c.is_customer_visible=TRUE AND c.service_package_payment_mode='prepaid_full' AND c.service_package_pricing_strategy=d.pricing_strategy AND c.service_package_selection_mode=d.selection_mode AND c.service_package_warranty_days=60 AND c.service_package_minimum_total_quantity IS NULL AND c.service_package_maximum_total_quantity IS NULL AND c.service_package_sell_start_at='2026-09-29T00:00:00+07:00'::timestamptz AND c.service_package_sell_end_at='2026-10-06T23:59:59.999+07:00'::timestamptz AND c.service_package_redeem_until='2026-12-05T23:59:59.999+07:00'::timestamptz")"
[[ "$count" == "2" ]] || die "AIR CARE parent verification failed"
variants="$(db_query "WITH desired(bundle_key,package_key,btu_min,btu_max,duration_min,sort_order,level_key,modifier) AS (VALUES ('coldwindflow-air-care-standard','coldwindflow-air-care-standard-small',NULL::integer,12000::integer,60,0,'standard',0.00::numeric),('coldwindflow-air-care-standard','coldwindflow-air-care-standard-large',18000::integer,NULL::integer,60,1,'standard',100.00::numeric),('coldwindflow-air-care-premium','coldwindflow-air-care-premium-small',NULL::integer,12000::integer,80,0,'premium',0.00::numeric),('coldwindflow-air-care-premium','coldwindflow-air-care-premium-large',18000::integer,NULL::integer,80,1,'premium',0.00::numeric)) SELECT count(*) FROM desired d JOIN public.catalog_items c ON c.service_bundle_key=d.bundle_key JOIN public.service_packages p ON p.package_key=d.package_key AND p.catalog_item_id=c.item_id WHERE p.service_key=d.bundle_key AND p.job_type='ล้าง' AND p.ac_type='ผนัง' AND p.btu_min IS NOT DISTINCT FROM d.btu_min AND p.btu_max IS NOT DISTINCT FROM d.btu_max AND p.service_unit_duration_minutes=d.duration_min AND p.sort_order=d.sort_order AND p.service_level_key=d.level_key AND p.unit_price_modifier=d.modifier AND p.is_active=TRUE AND p.is_customer_visible=TRUE")"
[[ "$variants" == "4" ]] || die "AIR CARE variant verification failed"
tiers="$(db_query "WITH desired(package_key,tier_key,qty,price,sort_order) AS (VALUES ('coldwindflow-air-care-standard-small','q1',1,499.00::numeric,0),('coldwindflow-air-care-standard-small','q2',2,899.00::numeric,1),('coldwindflow-air-care-standard-small','q3',3,1299.00::numeric,2),('coldwindflow-air-care-standard-small','q4',4,1699.00::numeric,3),('coldwindflow-air-care-standard-large','q1',1,499.00::numeric,0),('coldwindflow-air-care-standard-large','q2',2,899.00::numeric,1),('coldwindflow-air-care-standard-large','q3',3,1299.00::numeric,2),('coldwindflow-air-care-standard-large','q4',4,1699.00::numeric,3),('coldwindflow-air-care-premium-small','q1',1,699.00::numeric,0),('coldwindflow-air-care-premium-small','q2',2,1399.00::numeric,1),('coldwindflow-air-care-premium-small','q3',3,1899.00::numeric,2),('coldwindflow-air-care-premium-small','q4',4,2489.00::numeric,3),('coldwindflow-air-care-premium-large','q1',1,899.00::numeric,0),('coldwindflow-air-care-premium-large','q2',2,1799.00::numeric,1),('coldwindflow-air-care-premium-large','q3',3,2599.00::numeric,2),('coldwindflow-air-care-premium-large','q4',4,3399.00::numeric,3)) SELECT count(*) FROM desired d JOIN public.service_packages p ON p.package_key=d.package_key JOIN public.service_package_tiers t ON t.service_package_id=p.service_package_id AND t.tier_key=d.tier_key WHERE t.service_quantity=d.qty AND t.fixed_total_price=d.price AND t.sort_order=d.sort_order AND t.is_active=TRUE")"
[[ "$tiers" == "16" ]] || die "AIR CARE tier verification failed"
quote_probe postseed || die "AIR CARE server quote verification failed"
echo "CWF_AIR_CARE_READY environment=$ENVIRONMENT parents=2 variants=4 tiers=16 quotes=17 quantities=q1,q4,q5,q6,premium-mixed manual_payment=admin_verified redeem_days=60 warranty_days=60"
