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

current_git_branch() {
  local branch
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  if [[ -z "${branch}" ]]; then
    branch="$(git branch --show-current 2>/dev/null || true)"
  fi
  if [[ -z "${branch}" ]]; then
    branch="$(git name-rev --name-only HEAD 2>/dev/null \
      | sed -E 's#^remotes/origin/##; s#^origin/##; s#~[0-9]+$##' || true)"
  fi
  if [[ -z "${branch}" || "${branch}" == "undefined" ]]; then
    branch="unknown"
  fi
  echo "${branch}"
}

export_build_metadata() {
  MAM_GIT_COMMIT="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  MAM_GIT_BRANCH="$(current_git_branch)"
  MAM_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export MAM_GIT_COMMIT MAM_GIT_BRANCH MAM_BUILD_DATE
}

dc() {
  # shellcheck disable=SC2086
  ${DOCKER_CMD} compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

sync_keycloak_remember_me() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  # shellcheck disable=SC1090
  source "${ENV_FILE}"

  local admin_user admin_password admin_password_file
  admin_user="${KEYCLOAK_ADMIN:-admin}"
  admin_password_file="${KEYCLOAK_ADMIN_PASSWORD_FILE:-deploy/secrets/keycloak_admin_password}"
  admin_password="${KEYCLOAK_ADMIN_PASSWORD:-}"
  if [[ -z "${admin_password}" && -f "${admin_password_file}" ]]; then
    admin_password="$(<"${admin_password_file}")"
  fi
  admin_password="${admin_password:-admin}"

  # Existing local realms are not re-imported after first init; keep the login
  # remember-me switch in sync without overwriting session lifetime settings.
  local attempt authenticated
  authenticated=false
  for attempt in $(seq 1 24); do
    if ${DOCKER_CMD} exec mam-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
      --server http://localhost:8080 \
      --realm master \
      --user "${admin_user}" \
      --password "${admin_password}" >/dev/null 2>&1; then
      authenticated=true
      break
    fi
    sleep 5
  done

  if [[ "${authenticated}" != "true" ]]; then
    echo "WARN: Keycloak remember-me sync skipped; admin credentials were not accepted."
    return 0
  fi

  if ! ${DOCKER_CMD} exec mam-keycloak /opt/keycloak/bin/kcadm.sh update realms/mam \
    -s rememberMe=true \
    -s ssoSessionIdleTimeoutRememberMe=2592000 \
    -s ssoSessionMaxLifespanRememberMe=7776000 >/dev/null 2>&1; then
    echo "WARN: Keycloak remember-me sync failed."
  fi
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
  ./deploy/mam.sh sync-keycloak
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
    export_build_metadata
    dc up -d --no-build
    sync_keycloak_remember_me
    ;;
  down)
    dc down
    ;;
  restart)
    export_build_metadata
    dc down
    dc up -d --no-build
    sync_keycloak_remember_me
    ;;
  ps)
    dc ps
    ;;
  sync-keycloak)
    sync_keycloak_remember_me
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
