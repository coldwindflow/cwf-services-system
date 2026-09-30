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

docker_cmd exec \
  -e CWF_ENVIRONMENT=staging \
  -e CWF_STAGING_QA_CONTAINER="$APP_CONTAINER" \
  -e CWF_STAGING_QA_SECRET \
  "$APP_CONTAINER" \
  node scripts/run-staging-air-care-qa.js "$ACTION"
