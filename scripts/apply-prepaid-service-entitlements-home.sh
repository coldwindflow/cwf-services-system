#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_PATH="$ROOT_DIR/migrations/20260906_prepaid_service_entitlements.sql"

case "$ENVIRONMENT" in
  staging) DB_CONTAINER="cwf-staging-db" ;;
  production) DB_CONTAINER="cwf-production-db" ;;
  *) printf 'ERROR: environment must be staging or production\n' >&2; exit 2 ;;
esac

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

docker_cmd() {
  if /usr/bin/docker info >/dev/null 2>&1; then /usr/bin/docker "$@"; else sudo -n /usr/bin/docker "$@"; fi
}

db_query() {
  local sql="$1"
  docker_cmd exec "$DB_CONTAINER" sh -ceu \
    'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -Atqc "$1"' \
    sh "$sql"
}

verify_schema() {
  local entitlements order_columns job_columns triggers
  entitlements="$(db_query "SELECT CASE WHEN to_regclass('public.customer_service_entitlements') IS NULL THEN 0 ELSE 1 END")"
  order_columns="$(db_query "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_orders'
      AND column_name IN (
        'order_kind','customer_sub','service_entitlement_snapshot','prepaid_entitlement_code',
        'prepaid_claim_token_hash','prepaid_redeem_until','prepaid_warranty_days',
        'manual_payment_reference','payment_verified_by','prepaid_purchase_request_key',
        'prepaid_purchase_fingerprint'
      )
  ")"
  job_columns="$(db_query "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='jobs'
      AND column_name IN ('customer_due','payment_source','prepaid_entitlement_id')
  ")"
  triggers="$(db_query "
    SELECT count(*) FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid IN ('public.customer_orders'::regclass,'public.jobs'::regclass)
      AND tgname IN (
        'trg_issue_prepaid_entitlement_from_paid_order',
        'trg_guard_prepaid_job_redemption',
        'trg_consume_prepaid_entitlement_after_job_insert',
        'trg_restore_prepaid_entitlement_after_job_cancel'
      )
  ")"
  [[ "$entitlements" == "1" ]] || die "customer_service_entitlements table missing"
  [[ "$order_columns" == "11" ]] || die "prepaid customer_orders columns incomplete: $order_columns/11"
  [[ "$job_columns" == "3" ]] || die "prepaid jobs columns incomplete: $job_columns/3"
  [[ "$triggers" == "4" ]] || die "prepaid lifecycle triggers incomplete: $triggers/4"
}

[[ -f "$MIGRATION_PATH" ]] || die "migration file missing: $MIGRATION_PATH"
grep -Fq 'guard_prepaid_job_redemption' "$MIGRATION_PATH" || die "unexpected migration content"
grep -Fq 'restore_prepaid_entitlement_after_job_cancel' "$MIGRATION_PATH" || die "cancellation restore trigger missing"

if [[ -n "${EXPECTED_RELEASE_SHA:-}" ]]; then
  status_output="$(sudo -n /usr/local/sbin/cwf-deployctl "$ENVIRONMENT" status)" || die "could not read deployed $ENVIRONMENT status"
  grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" || die "deployed $ENVIRONMENT revision does not match $EXPECTED_RELEASE_SHA"
fi

[[ "$(docker_cmd inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" == "true" ]] || die "$DB_CONTAINER is not running"
[[ "$(db_query 'SELECT 1')" == "1" ]] || die "database connectivity check failed"

# The SQL is additive/idempotent and wraps itself in one transaction. Advisory
# lock prevents two release-gate jobs from applying the same lifecycle migration
# concurrently on one database.
LOCK_KEY="202609060329"
docker_cmd exec "$DB_CONTAINER" sh -ceu \
  'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_lock('$LOCK_KEY'::bigint)"' >/dev/null
trap 'docker_cmd exec "$DB_CONTAINER" sh -ceu '\''exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_unlock('"$LOCK_KEY"'::bigint)"'\'' >/dev/null 2>&1 || true' EXIT

docker_cmd exec -i "$DB_CONTAINER" sh -ceu \
  'exec psql -X -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}" -v ON_ERROR_STOP=1' \
  < "$MIGRATION_PATH"

verify_schema
printf 'PREPAID_SERVICE_ENTITLEMENTS_MIGRATION_OK environment=%s triggers=4\n' "$ENVIRONMENT"
