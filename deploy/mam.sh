#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="deploy/.env.easy"
COMPOSE_FILE="docker-compose.easy.yml"

detect_docker_cmd() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
    return
  fi
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    echo "sudo docker"
    return
  fi
  echo ""
}

DOCKER_CMD="${DOCKER_CMD:-$(detect_docker_cmd)}"
if [[ -z "${DOCKER_CMD}" ]]; then
  echo "Docker daemon is not reachable. Start Docker (or use sudo)."
  exit 1
fi

dc() {
  # shellcheck disable=SC2086
  ${DOCKER_CMD} compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

ensure_init() {
  if [[ ! -f "${ENV_FILE}" || ! -f "deploy/keycloak/mam-realm.json" ]]; then
    echo "Initializing deployment files..."
    ./deploy/init.sh "${1:-}"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  ./deploy/mam.sh init [HOST]
  ./deploy/mam.sh up [HOST]
  ./deploy/mam.sh down
  ./deploy/mam.sh restart
  ./deploy/mam.sh ps
  ./deploy/mam.sh logs [SERVICE...]
  ./deploy/mam.sh urls
  ./deploy/mam.sh reset

Examples:
  ./deploy/mam.sh up
  ./deploy/mam.sh up 192.168.1.50
  ./deploy/mam.sh logs oauth2-proxy keycloak
EOF
}

cmd="${1:-}"
case "${cmd}" in
  init)
    ./deploy/init.sh "${2:-}"
    ;;
  up)
    ensure_init "${2:-}"
    dc up -d
    ;;
  down)
    dc down
    ;;
  restart)
    dc down
    dc up -d
    ;;
  ps)
    dc ps
    ;;
  logs)
    shift || true
    if [[ "$#" -gt 0 ]]; then
      dc logs -f "$@"
    else
      dc logs -f
    fi
    ;;
  urls)
    if [[ -f "${ENV_FILE}" ]]; then
      # shellcheck disable=SC1090
      source "${ENV_FILE}"
      host="${PUBLIC_HOST:-localhost}"
    else
      host="localhost"
    fi
    echo "MAM: http://${host}:3000"
    echo "Keycloak Admin: http://${host}:8081"
    ;;
  reset)
    dc down -v --remove-orphans
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
