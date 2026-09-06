#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_PATH="$ROOT_DIR/data-seeds/20260906_air_reset_60_book_now.sql"
EXPECTED_SEED_SHA="bc82b1bdf995284ec8a37393ed22161363e6d0aec840dc8df31bda8f43d8ae55"

case "$ENVIRONMENT" in
  staging) DB_CONTAINER="cwf-staging-db" ;;
  production) DB_CONTAINER="cwf-production-db" ;;
  *) printf 'ERROR: environment must be staging or production\n' >&2; exit 2 ;;
esac

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

docker_cmd() {
  if /usr/bin/docker info >/dev/null 2>&1; then
    /usr/bin/docker "$@"
  else
    sudo -n /usr/bin/docker "$@"
  fi
}

db_query() {
  local sql="$1"
  docker_cmd exec "$DB_CONTAINER" sh -ceu \
    'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -Atqc "$1"' \
    sh "$sql"
}

verify_seed_shape() {
  local parents variants tiers
  parents="$(db_query "
    SELECT count(*)
    FROM public.catalog_items
    WHERE service_bundle_key IN ('air-reset-60-standard','air-reset-60-premium')
      AND service_package_pricing_strategy='total_quantity_tier_plus_unit_modifiers'
      AND service_package_selection_mode='multi_variant'
      AND service_package_maximum_total_quantity=4
      AND service_package_payment_mode='book_now'
      AND service_package_warranty_days=60
      AND service_package_sell_start_at='2026-09-05T00:00:00+07:00'::timestamptz
      AND service_package_sell_end_at='2026-09-12T23:59:59.999+07:00'::timestamptz
      AND service_package_redeem_until='2027-01-31T23:59:59.999+07:00'::timestamptz
  ")"
  [[ "$parents" == "2" ]] || die "AIR RESET parent verification failed: expected 2, got $parents"

  variants="$(db_query "
    SELECT count(*)
    FROM public.service_packages
    WHERE
      (package_key='air-reset-60-standard-small' AND job_type='ล้าง' AND ac_type='ผนัง'
       AND wash_variant='ล้างธรรมดา' AND btu_min IS NULL AND btu_max=12000
       AND service_unit_duration_minutes=60 AND unit_price_modifier=0)
      OR
      (package_key='air-reset-60-standard-large' AND job_type='ล้าง' AND ac_type='ผนัง'
       AND wash_variant='ล้างธรรมดา' AND btu_min=18000 AND btu_max IS NULL
       AND service_unit_duration_minutes=60 AND unit_price_modifier=100)
      OR
      (package_key='air-reset-60-premium-small' AND job_type='ล้าง' AND ac_type='ผนัง'
       AND wash_variant='ล้างพรีเมียม' AND btu_min IS NULL AND btu_max=12000
       AND service_unit_duration_minutes=80 AND unit_price_modifier=0)
      OR
      (package_key='air-reset-60-premium-large' AND job_type='ล้าง' AND ac_type='ผนัง'
       AND wash_variant='ล้างพรีเมียม' AND btu_min=18000 AND btu_max IS NULL
       AND service_unit_duration_minutes=80 AND unit_price_modifier=200)
  ")"
  [[ "$variants" == "4" ]] || die "AIR RESET variant verification failed: expected 4, got $variants"

  tiers="$(db_query "
    SELECT count(*)
    FROM public.service_package_tiers t
    JOIN public.service_packages p ON p.service_package_id=t.service_package_id
    WHERE
      (
        p.package_key IN ('air-reset-60-standard-small','air-reset-60-standard-large')
        AND (
          (t.tier_key='q1' AND t.service_quantity=1 AND t.fixed_total_price=550.00)
          OR (t.tier_key='q2' AND t.service_quantity=2 AND t.fixed_total_price=959.00)
          OR (t.tier_key='q3' AND t.service_quantity=3 AND t.fixed_total_price=1399.00)
          OR (t.tier_key='q4' AND t.service_quantity=4 AND t.fixed_total_price=1799.00)
        )
      )
      OR
      (
        p.package_key IN ('air-reset-60-premium-small','air-reset-60-premium-large')
        AND (
          (t.tier_key='q1' AND t.service_quantity=1 AND t.fixed_total_price=790.00)
          OR (t.tier_key='q2' AND t.service_quantity=2 AND t.fixed_total_price=1490.00)
          OR (t.tier_key='q3' AND t.service_quantity=3 AND t.fixed_total_price=2090.00)
          OR (t.tier_key='q4' AND t.service_quantity=4 AND t.fixed_total_price=2690.00)
        )
      )
  ")"
  [[ "$tiers" == "16" ]] || die "AIR RESET tier verification failed: expected 16, got $tiers"
}

[[ -f "$SEED_PATH" ]] || die "seed file is missing: $SEED_PATH"
actual_sha="$(sha256sum "$SEED_PATH" | awk '{print $1}')"
[[ "$actual_sha" == "$EXPECTED_SEED_SHA" ]] || die "seed SHA mismatch"

if [[ -n "${EXPECTED_RELEASE_SHA:-}" ]]; then
  status_output="$(sudo -n /usr/local/sbin/cwf-deployctl "$ENVIRONMENT" status)" ||
    die "could not read deployed $ENVIRONMENT status"
  grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" ||
    die "deployed $ENVIRONMENT revision does not match $EXPECTED_RELEASE_SHA"
fi

[[ "$(docker_cmd inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" == "true" ]] ||
  die "$DB_CONTAINER is not running"
[[ "$(db_query 'SELECT 1')" == "1" ]] || die "database connectivity check failed"

required_columns="$(db_query "
  SELECT count(*)
  FROM information_schema.columns
  WHERE table_schema='public'
    AND (
      (table_name='catalog_items' AND column_name IN (
        'service_package_pricing_strategy',
        'service_package_selection_mode',
        'service_package_maximum_total_quantity',
        'service_package_payment_mode',
        'service_package_warranty_days'
      ))
      OR
      (table_name='service_packages' AND column_name IN (
        'service_level_key',
        'service_level_label',
        'unit_price_modifier'
      ))
    )
")"
[[ "$required_columns" == "8" ]] || die "promotion policy schema is not ready"

existing_parents="$(db_query "
  SELECT count(*) FROM public.catalog_items
  WHERE service_bundle_key IN ('air-reset-60-standard','air-reset-60-premium')
")"
existing_variants="$(db_query "
  SELECT count(*) FROM public.service_packages
  WHERE package_key IN (
    'air-reset-60-standard-small','air-reset-60-standard-large',
    'air-reset-60-premium-small','air-reset-60-premium-large'
  )
")"
existing_tiers="$(db_query "
  SELECT count(*)
  FROM public.service_package_tiers t
  JOIN public.service_packages p ON p.service_package_id=t.service_package_id
  WHERE p.package_key IN (
    'air-reset-60-standard-small','air-reset-60-standard-large',
    'air-reset-60-premium-small','air-reset-60-premium-large'
  )
")"

if [[ "$existing_parents" == "2" && "$existing_variants" == "4" && "$existing_tiers" == "16" ]]; then
  verify_seed_shape
  printf 'AIR_RESET_SEED_ALREADY_APPLIED environment=%s\n' "$ENVIRONMENT"
  exit 0
fi

if [[ "$existing_parents" != "0" || "$existing_variants" != "0" || "$existing_tiers" != "0" ]]; then
  die "partial or unexpected AIR RESET data exists; refusing to overwrite it"
fi

docker_cmd exec -i "$DB_CONTAINER" sh -ceu \
  'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 --single-transaction' \
  < "$SEED_PATH"

verify_seed_shape
printf 'AIR_RESET_SEED_OK environment=%s parents=2 variants=4 tiers=16\n' "$ENVIRONMENT"
