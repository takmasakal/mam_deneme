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
  local enable_onlyoffice=""
  if [[ -f "${ENV_FILE}" ]]; then
    provider="$(grep -E '^OFFICE_EDITOR_PROVIDER=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]' || true)"
    enable_onlyoffice="$(grep -E '^ENABLE_ONLYOFFICE=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]' || true)"
  fi
  if [[ "${provider}" == "onlyoffice" && "${enable_onlyoffice}" == "true" ]]; then
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
  local provider install_libreoffice build_local
  build_local="$(env_value MAM_BUILD_LOCAL | tr '[:upper:]' '[:lower:]')"
  if [[ -z "${build_local}" || "${build_local}" == "true" || "${build_local}" == "1" || "${build_local}" == "yes" ]]; then
    return 0
  fi
  provider="$(env_value OFFICE_EDITOR_PROVIDER | tr '[:upper:]' '[:lower:]')"
  install_libreoffice="$(env_value INSTALL_LIBREOFFICE | tr '[:upper:]' '[:lower:]')"
  [[ "${provider}" == "libreoffice" || "${install_libreoffice}" == "true" ]]
}

warn_office_config() {
  local provider install_libreoffice enable_onlyoffice
  provider="$(env_value OFFICE_EDITOR_PROVIDER | tr '[:upper:]' '[:lower:]')"
  install_libreoffice="$(env_value INSTALL_LIBREOFFICE | tr '[:upper:]' '[:lower:]')"
  enable_onlyoffice="$(env_value ENABLE_ONLYOFFICE | tr '[:upper:]' '[:lower:]')"
  if [[ "${provider}" == "onlyoffice" && "${enable_onlyoffice}" != "true" ]]; then
    echo "WARN: OFFICE_EDITOR_PROVIDER=onlyoffice is ignored on Raspberry Pi unless ENABLE_ONLYOFFICE=true."
    echo "      Run ./deploy/init-rpi.sh to rewrite ${ENV_FILE} with the Raspberry Pi default."
  fi
  if [[ "${provider}" == "libreoffice" && "${install_libreoffice}" != "true" ]]; then
    echo "WARN: OFFICE_EDITOR_PROVIDER=libreoffice but INSTALL_LIBREOFFICE is not true."
    echo "      Set INSTALL_LIBREOFFICE=true in ${ENV_FILE}, then run ./deploy/mam-rpi.sh restart."
  fi
}

print_urls() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Run ./deploy/mam-rpi.sh init first."
    return
  fi
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  local provider="${OFFICE_EDITOR_PROVIDER:-libreoffice}"
  local enable_onlyoffice="${ENABLE_ONLYOFFICE:-false}"
  local offline_mode="${MAM_OFFLINE_MODE:-true}"
  local preload_models="${PRELOAD_ML_MODELS:-true}"
  echo
  echo "Raspberry Pi endpoints:"
  echo "  MAM browser:      http://${PUBLIC_HOST}:3000"
  echo "  Mobile/API:       http://${PUBLIC_HOST}:3001"
  echo "  Keycloak:         http://${PUBLIC_HOST}:8081"
  echo "  Elasticsearch:    http://${PUBLIC_HOST}:9200"
  echo "  Postgres:         ${PUBLIC_HOST}:5432"
  if [[ "${provider,,}" == "onlyoffice" && "${enable_onlyoffice,,}" == "true" ]]; then
    echo "  OnlyOffice:       http://${PUBLIC_HOST}:8082"
  else
    echo "  Office provider:  ${provider} (OnlyOffice disabled)"
  fi
  echo "  Offline ML mode:  ${offline_mode} (build preload: ${preload_models})"
  echo
  echo "Published Docker ports:"
  dc ps --format "table {{.Service}}\t{{.State}}\t{{.Ports}}" || true
  echo
  echo "Browser login uses MAM browser URL; mobile/direct API uses Mobile/API URL."
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
    print_urls
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
    print_urls
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
    print_urls
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
