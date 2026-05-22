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

DOCKER_CMD="${DOCKER_CMD:-$(detect_docker_cmd)}"
if [[ -z "${DOCKER_CMD}" ]]; then
  echo "Docker daemon is not reachable. Start Docker or use sudo."
  exit 1
fi

dc() {
  # shellcheck disable=SC2086
  ${DOCKER_CMD} compose --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}" "$@"
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
  ./deploy/mam-kaisha.sh up
  ./deploy/mam-kaisha.sh down
  ./deploy/mam-kaisha.sh restart
  ./deploy/mam-kaisha.sh ps
  ./deploy/mam-kaisha.sh logs [SERVICE...]
  ./deploy/mam-kaisha.sh urls
HELP
}

cmd="${1:-}"
case "${cmd}" in
  init)
    ./deploy/init-kaisha.sh "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    ;;
  up)
    ensure_init
    dc up -d
    ;;
  down)
    dc down
    ;;
  restart)
    ensure_init
    dc down
    dc up -d
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
  urls)
    ensure_init
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    echo "MAM: ${PUBLIC_MAM_URL}"
    echo "Keycloak: ${PUBLIC_KEYCLOAK_URL}"
    echo "OnlyOffice: ${PUBLIC_OFFICE_URL}"
    echo "Reverse proxy: company-managed external HTTPS layer"
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
