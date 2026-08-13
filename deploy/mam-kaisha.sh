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

APP_IMAGE_INPUTS=(
  Dockerfile
  package.json
  package-lock.json
  src
  public
  scripts
)

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

ensure_external_volumes() {
  if [[ -z "${DOCKER_CMD}" ]]; then
    DOCKER_CMD="$(detect_docker_cmd)"
  fi
  if [[ -z "${DOCKER_CMD}" ]]; then
    echo "Docker daemon is not reachable. Start Docker or use sudo."
    exit 1
  fi
  local volume
  for volume in mam_kaisha_pg_data mam_kaisha_keycloak_pg_data mam_kaisha_es_data; do
    # shellcheck disable=SC2086
    ${DOCKER_CMD} volume inspect "${volume}" >/dev/null 2>&1 || ${DOCKER_CMD} volume create "${volume}" >/dev/null
  done
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

app_image_inputs_are_dirty() {
  ! git diff --quiet --ignore-submodules -- "${APP_IMAGE_INPUTS[@]}" 2>/dev/null \
    || ! git diff --cached --quiet --ignore-submodules -- "${APP_IMAGE_INPUTS[@]}" 2>/dev/null
}

app_image_matches_current_commit() {
  if app_image_inputs_are_dirty; then
    echo "App image input changes detected; app image rebuild is required."
    return 1
  fi

  local image_id image_commit
  image_id="$(dc images -q app 2>/dev/null | tail -n1 || true)"
  if [[ -z "${image_id}" ]]; then
    return 1
  fi

  # shellcheck disable=SC2086
  image_commit="$(${DOCKER_CMD} image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${image_id}" 2>/dev/null || true)"
  if [[ -z "${image_commit}" || "${image_commit}" == "<no value>" || "${image_commit}" == "unknown" ]]; then
    return 1
  fi

  git cat-file -e "${image_commit}^{commit}" 2>/dev/null \
    && git diff --quiet "${image_commit}" -- "${APP_IMAGE_INPUTS[@]}"
}

up_stack_with_current_image_cache() {
  if app_image_matches_current_commit; then
    echo "App image already matches app sources for ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT}; starting without rebuild."
    dc up -d
  else
    echo "Building app image for ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT}."
    dc up -d --build
  fi
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
  ./deploy/mam-kaisha.sh restart        # restart and rebuild app image when current commit changed
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
    ensure_external_volumes
    export_build_metadata
    echo "Building MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc build app oauth2-proxy
    ;;
  up)
    ensure_init
    ensure_external_volumes
    export_build_metadata
    echo "Starting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc up -d postgres keycloak-postgres
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    up_stack_with_current_image_cache
    KEYCLOAK_CONTAINER=kaisha-keycloak ENV_FILE="${ENV_FILE}" ./deploy/keycloak-sync-defaults.sh
    print_running_version
    ;;
  down)
    dc down
    ;;
  restart)
    ensure_init
    ensure_external_volumes
    export_build_metadata
    echo "Restarting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"
    dc down
    dc up -d postgres keycloak-postgres
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${KAISHA_COMPOSE}"
    up_stack_with_current_image_cache
    KEYCLOAK_CONTAINER=kaisha-keycloak ENV_FILE="${ENV_FILE}" ./deploy/keycloak-sync-defaults.sh
    print_running_version
    ;;
  ps)
    ensure_init
    ensure_external_volumes
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
