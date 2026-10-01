#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
ACTION="${2:-accept}"
APP_CONTAINER="cwf-staging-app"

die(){ echo "[FAIL] $*" >&2; exit 1; }
docker_cmd() {
  if /usr/bin/docker info >/dev/null 2>&1; then /usr/bin/docker "$@"; else sudo -n /usr/bin/docker "$@"; fi
}

[[ "$ENVIRONMENT" == "staging" ]] || die "staging QA is disabled outside staging"
[[ "$ACTION" =~ ^(provision|accept|cleanup)$ ]] || die "usage: $0 staging provision|accept|cleanup"
[[ ${#CWF_STAGING_QA_SECRET} -ge 32 ]] || die "CWF_STAGING_QA_SECRET is required"
docker_cmd inspect "$APP_CONTAINER" >/dev/null 2>&1 || die "staging app container is unavailable"
[[ "$(docker_cmd inspect -f '{{.Name}}' "$APP_CONTAINER")" == "/$APP_CONTAINER" ]] || die "unexpected app container"

if [[ -n "${EXPECTED_RELEASE_SHA:-}" ]]; then
  status_output="$(sudo -n /usr/local/sbin/cwf-deployctl staging status)" || die "cannot read deployed staging revision"
  grep -Fq "$EXPECTED_RELEASE_SHA" <<<"$status_output" || die "deployed staging revision does not match EXPECTED_RELEASE_SHA"
fi

if [[ "$ACTION" == "accept" ]]; then
  # Staging intentionally has no normal customer JWT secret. Run the exact
  # deployed application on an unpublished loopback-only port with the QA
  # secret as its existing CWF_JWT_SECRET, then drive the real HTTP routes and
  # staging DB through that process. No alternate auth implementation exists.
  docker_cmd exec \
    -e CWF_ENVIRONMENT=staging \
    -e CWF_STAGING_QA_CONTAINER="$APP_CONTAINER" \
    -e CWF_STAGING_QA_SECRET \
    "$APP_CONTAINER" \
    sh -ceu '
      export PORT=3901
      export CWF_JWT_SECRET="$CWF_STAGING_QA_SECRET"
      node index.js >/tmp/cwf-staging-qa-app.log 2>&1 &
      qa_app_pid=$!
      trap '\''kill "$qa_app_pid" >/dev/null 2>&1 || true; wait "$qa_app_pid" >/dev/null 2>&1 || true'\'' EXIT INT TERM
      qa_ready=0
      for _ in $(seq 1 45); do
        if node -e "fetch('\''http://127.0.0.1:3901/catalog/items?customer=1'\'').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
          qa_ready=1
          break
        fi
        sleep 1
      done
      if [ "$qa_ready" != "1" ]; then
        echo "[FAIL] loopback QA application did not become ready" >&2
        tail -n 80 /tmp/cwf-staging-qa-app.log >&2 || true
        exit 1
      fi
      set +e
      node scripts/run-staging-air-care-qa.js accept
      qa_status=$?
      set -e
      if [ "$qa_status" -ne 0 ]; then
        echo "[QA_DIAGNOSTIC] bounded loopback application log follows" >&2
        tail -n 120 /tmp/cwf-staging-qa-app.log >&2 || true
        exit "$qa_status"
      fi
    '
else
  docker_cmd exec \
    -e CWF_ENVIRONMENT=staging \
    -e CWF_STAGING_QA_CONTAINER="$APP_CONTAINER" \
    -e CWF_STAGING_QA_SECRET \
    "$APP_CONTAINER" \
    node scripts/run-staging-air-care-qa.js "$ACTION"
fi
