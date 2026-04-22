#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="deploy/.env.rpi"
COMPOSE_FILE="docker-compose.rpi.yml"

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
  local profile_args=()
  local provider=""
  if [[ -f "${ENV_FILE}" ]]; then
    provider="$(grep -E '^OFFICE_EDITOR_PROVIDER=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]' || true)"
  fi
  if [[ "${provider}" == "onlyoffice" ]]; then
    profile_args=(--profile onlyoffice)
  fi
  # shellcheck disable=SC2086
  ${DOCKER_CMD} compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "${profile_args[@]}" "$@"
}

env_value() {
  local key="$1"
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo ""
    return
  fi
  grep -E "^${key}=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

should_build_app() {
  local provider install_libreoffice
  provider="$(env_value OFFICE_EDITOR_PROVIDER | tr '[:upper:]' '[:lower:]')"
  install_libreoffice="$(env_value INSTALL_LIBREOFFICE | tr '[:upper:]' '[:lower:]')"
  [[ "${provider}" == "libreoffice" || "${install_libreoffice}" == "true" ]]
}

warn_office_config() {
  local provider install_libreoffice
  provider="$(env_value OFFICE_EDITOR_PROVIDER | tr '[:upper:]' '[:lower:]')"
  install_libreoffice="$(env_value INSTALL_LIBREOFFICE | tr '[:upper:]' '[:lower:]')"
  if [[ "${provider}" == "libreoffice" && "${install_libreoffice}" != "true" ]]; then
    echo "WARN: OFFICE_EDITOR_PROVIDER=libreoffice but INSTALL_LIBREOFFICE is not true."
    echo "      Set INSTALL_LIBREOFFICE=true in ${ENV_FILE}, then run ./deploy/mam-rpi.sh restart."
  fi
}

init_if_needed() {
  ./deploy/init-rpi.sh "${1:-}"
}

usage() {
  cat <<'EOF'
Usage:
  ./deploy/mam-rpi.sh init [HOST]
  ./deploy/mam-rpi.sh up [HOST]
  ./deploy/mam-rpi.sh down
  ./deploy/mam-rpi.sh restart [HOST]
  ./deploy/mam-rpi.sh ps
  ./deploy/mam-rpi.sh logs [SERVICE...]
  ./deploy/mam-rpi.sh urls
  ./deploy/mam-rpi.sh reset
EOF
}

cmd="${1:-}"
case "${cmd}" in
  init)
    init_if_needed "${2:-}"
    ;;
  up)
    init_if_needed "${2:-}"
    warn_office_config
    if should_build_app; then
      dc up -d --build
    else
      dc up -d
    fi
    ;;
  down)
    dc down
    ;;
  restart)
    init_if_needed "${2:-}"
    warn_office_config
    dc down
    if should_build_app; then
      dc up -d --build
    else
      dc up -d
    fi
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
      echo "MAM: http://${PUBLIC_HOST}:3000"
      echo "Keycloak: http://${PUBLIC_HOST}:8081"
      echo "Direct app is intentionally not exposed."
    else
      echo "Run ./deploy/mam-rpi.sh init first."
    fi
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
