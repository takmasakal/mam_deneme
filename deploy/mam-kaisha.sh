#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="deploy/.env.kaisha"
BASE_COMPOSE="docker-compose.yml"
KAISHA_COMPOSE="docker-compose.kaisha.yml"

detect_docker_cmd() {
  if docker info >/dev/null 2>&1; then echo docker; return; fi
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then echo "sudo docker"; return; fi
  echo ""
}

DOCKER_CMD="${DOCKER_CMD:-}"

export_build_metadata() {
  MAM_GIT_COMMIT="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  MAM_GIT_BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
  MAM_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export MAM_GIT_COMMIT MAM_GIT_BRANCH MAM_BUILD_DATE
}

dc() {
  if [[ -z "${DOCKER_CMD}" ]]; then
    DOCKER_CMD="$(detect_docker_cmd)"
  fi
  if [[ -z "${DOCKER_CMD}" ]]; then
    echo "Docker daemon is not reachable. Start Docker or use sudo."
    exit 1
  fi
  # shellcheck disable=SC2086
  ${DOCKER_CMD} compose --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}" "$@"
}

print_running_version() {
  if [[ -z "${DOCKER_CMD}" ]]; then
    DOCKER_CMD="$(detect_docker_cmd)"
  fi
  if [[ -z "${DOCKER_CMD}" ]]; then
    echo "Docker daemon is not reachable. Start Docker or use sudo."
    exit 1
  fi
  echo
  echo "Running MAM app build:"
  dc exec -T app node -e "console.log(JSON.stringify({gitCommit:process.env.MAM_GIT_COMMIT||'unknown',gitBranch:process.env.MAM_GIT_BRANCH||'unknown',buildDate:process.env.MAM_BUILD_DATE||'unknown'}, null, 2))" 2>/dev/null || echo "  app service is not running yet."
}

ensure_init() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    ./deploy/init-kaisha.sh "${1:-}"
  fi
}

usage() {
  cat <<'HELP'
Usage:
  ./deploy/mam-kaisha.sh init [MAM_HOST] [KEYCLOAK_HOST] [OFFICE_HOST] [WHITELIST_DOMAIN]
  ./deploy/mam-kaisha.sh build
  ./deploy/mam-kaisha.sh up
  ./deploy/mam-kaisha.sh down
  ./deploy/mam-kaisha.sh restart
  ./deploy/mam-kaisha.sh ps
  ./deploy/mam-kaisha.sh logs [SERVICE...]
  ./deploy/mam-kaisha.sh urls
  ./deploy/mam-kaisha.sh version
  ./deploy/mam-kaisha.sh sync-keycloak
HELP
}

cmd="${1:-}"
case "${cmd}" in
  init)
    shift || true
    ./deploy/init-kaisha.sh "$@"
    ;;
  build)
    ensure_init
    export_build_metadata
    echo "Building MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc build app oauth2-proxy
    ;;
  up)
    ensure_init
    export_build_metadata
    echo "Starting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc up -d postgres keycloak-postgres
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    dc up -d --build
    KEYCLOAK_CONTAINER=kaisha-keycloak ENV_FILE="${ENV_FILE}" ./deploy/keycloak-sync-defaults.sh
    print_running_version
    ;;
  down)
    dc down
    ;;
  restart)
    ensure_init
    export_build_metadata
    echo "Restarting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc down
    dc up -d postgres keycloak-postgres
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    dc up -d --build
    KEYCLOAK_CONTAINER=kaisha-keycloak ENV_FILE="${ENV_FILE}" ./deploy/keycloak-sync-defaults.sh
    print_running_version
    ;;
  ps)
    ensure_init
    dc ps
    ;;
  logs)
    ensure_init
    shift || true
    dc logs -f "$@"
    ;;
  sync-keycloak)
    ensure_init
    KEYCLOAK_CONTAINER=kaisha-keycloak ENV_FILE="${ENV_FILE}" ./deploy/keycloak-sync-defaults.sh
    ;;
  urls)
    ensure_init
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    echo "MAM: ${PUBLIC_MAM_URL}"
    echo "Keycloak: ${PUBLIC_KEYCLOAK_URL}"
    echo "OnlyOffice: ${PUBLIC_OFFICE_URL}"
    echo "Access mode: direct host ports"
    ;;
  version)
    ensure_init
    print_running_version
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: ${cmd}"
    usage
    exit 1
    ;;
esac
