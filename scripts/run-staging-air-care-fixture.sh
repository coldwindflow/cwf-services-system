#!/usr/bin/env bash
set -Eeuo pipefail

die(){ echo "[FAIL] $*" >&2; exit 1; }
docker_cmd() {
  if /usr/bin/docker info >/dev/null 2>&1; then /usr/bin/docker "$@"; else sudo -n /usr/bin/docker "$@"; fi
}
[[ "${1:-}" == "staging" ]] || die "fixture is staging-only"
[[ "${EXPECTED_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || die "exact EXPECTED_RELEASE_SHA required"
[[ "$(git rev-parse HEAD)" == "$EXPECTED_RELEASE_SHA" ]] || die "operator checkout differs from approved revision"
status_output="$(sudo -n /usr/local/sbin/cwf-deployctl staging status)"
grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" || die "deployed staging revision differs"

APP=cwf-staging-aircare-qa-app
DB=cwf-staging-aircare-qa-db
NETWORK=cwf-staging-aircare-qa-network
# Pin immutable images from the deployed staging containers, never a mutable tag.
APP_IMAGE="$(docker_cmd inspect -f '{{.Image}}' cwf-staging-app)"
DB_IMAGE="$(docker_cmd inspect -f '{{.Image}}' cwf-staging-db)"
[[ "$APP_IMAGE" =~ ^sha256:[0-9a-f]{64}$ && "$DB_IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] || die "invalid image identity"
for name in "$APP" "$DB"; do
  if docker_cmd container inspect "$name" >/dev/null 2>&1; then die "fixture container exists: $name; inspect it before retrying"; fi
done
if docker_cmd network inspect "$NETWORK" >/dev/null 2>&1; then die "fixture network already exists; inspect it before retrying"; fi

# Read-only real-catalog check before creating any synthetic data.
docker_cmd exec cwf-staging-app node scripts/probe-air-care-quotes.js staging-before-fixture

created_app=0 created_db=0 created_network=0
cleanup() {
  local result=$? cleanup_failed=0
  trap - EXIT INT TERM
  if [[ "$created_app" == 1 ]]; then docker_cmd rm -f -v "$APP" >/dev/null || cleanup_failed=1; fi
  if [[ "$created_db" == 1 ]]; then docker_cmd rm -f -v "$DB" >/dev/null || cleanup_failed=1; fi
  if [[ "$created_network" == 1 ]]; then docker_cmd network rm "$NETWORK" >/dev/null || cleanup_failed=1; fi
  echo "[QA_EVIDENCE] fixture_cleanup failed=$cleanup_failed"
  if [[ "$cleanup_failed" != 0 ]]; then result=1; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# No real credentials, env files, mounted application storage, database copy,
# published ports, or access to the staging/production Docker networks.
export POSTGRES_PASSWORD="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
export DB_PASSWORD="$POSTGRES_PASSWORD"
export CWF_STAGING_QA_SECRET="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
export CWF_JWT_SECRET="$CWF_STAGING_QA_SECRET"
docker_cmd network create --internal "$NETWORK" >/dev/null
created_network=1
docker_cmd create --name "$DB" --network "$NETWORK" \
  -e POSTGRES_USER=cwf_aircare_qa -e POSTGRES_DB=cwf_aircare_qa -e POSTGRES_PASSWORD \
  "$DB_IMAGE" >/dev/null
created_db=1
docker_cmd start "$DB" >/dev/null
ready=0
for _ in $(seq 1 45); do
  if docker_cmd exec "$DB" pg_isready -U cwf_aircare_qa -d cwf_aircare_qa >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || die "fixture PostgreSQL did not start"

docker_cmd create --name "$APP" --network "$NETWORK" \
  -e DB_HOST="$DB" -e DB_PORT=5432 -e DB_USER=cwf_aircare_qa -e DB_NAME=cwf_aircare_qa \
  -e DB_PASSWORD -e DB_SSL=false -e DATABASE_URL= -e USER_DB_URL= -e ADMIN_DB_URL= -e TECH_DB_URL= \
  -e NODE_OPTIONS=--require=/app/scripts/staging-postgres-preload.js -e PORT=3000 \
  -e CWF_ENVIRONMENT=staging -e CWF_STAGING_QA_FIXTURE=1 -e CWF_STAGING_QA_CONTAINER="$APP" \
  -e CWF_STAGING_QA_SECRET -e CWF_JWT_SECRET -e TZ=Asia/Bangkok \
  "$APP_IMAGE" sleep infinity >/dev/null
created_app=1
docker_cmd start "$APP" >/dev/null
docker_cmd exec "$APP" node scripts/bootstrap-staging-database.js
docker_cmd exec "$APP" node scripts/stagingAirCareFixture.js
docker_cmd exec -d "$APP" sh -ceu 'exec node index.js >/tmp/cwf-fixture-app.log 2>&1'
ready=0
for _ in $(seq 1 45); do
  if docker_cmd exec "$APP" node -e "fetch('http://127.0.0.1:3000/catalog/items?customer=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || die "fixture application did not start"
echo "[QA_EVIDENCE] fixture_release sha=$EXPECTED_RELEASE_SHA app_image=$APP_IMAGE db_image=$DB_IMAGE network=internal ports=none"
docker_cmd exec "$APP" node scripts/run-staging-air-care-qa.js accept
docker_cmd exec cwf-staging-app node scripts/probe-air-care-quotes.js staging-after-fixture
echo "[QA_EVIDENCE] fixture_scope http_admin_customer=checked browser_customer_scheduling_technician_completion=still_required"
