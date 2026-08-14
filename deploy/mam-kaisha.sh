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

# ADDED:
# Beklenen tüm Kaisha container'larının çalışmasını bekler.
# Healthcheck tanımlı container'lar için ayrıca "healthy" durumu aranır.
# Tüm servisler hazır olduğunda maintenance modu kapatılır.
wait_for_kaisha_ready() {
  local timeout_seconds="${1:-180}"
  local interval_seconds="${2:-3}"
  local elapsed=0
  local all_ready
  local container
  local status
  local health

  local expected_containers=(
    "kaisha-oauth2-proxy"
    "kaisha-app"
    "kaisha-onlyoffice"
    "kaisha-keycloak"
    "kaisha-elasticsearch"
    "kaisha-keycloak-postgres"
    "kaisha-postgres"
  )

  if [[ -z "${DOCKER_CMD}" ]]; then
    DOCKER_CMD="$(detect_docker_cmd)"
  fi

  if [[ -z "${DOCKER_CMD}" ]]; then
    echo "Docker daemon is not reachable. Start Docker or use sudo."
    return 1
  fi

  echo
  echo "Waiting for Kaisha stack to become ready..."

  while (( elapsed < timeout_seconds )); do
    all_ready=true

    echo
    echo "Container status check (${elapsed}s/${timeout_seconds}s):"

    for container in "${expected_containers[@]}"; do

      # shellcheck disable=SC2086
      status="$(
        ${DOCKER_CMD} inspect \
          --format '{{.State.Status}}' \
          "${container}" 2>/dev/null || echo "missing"
      )"

      if [[ "${status}" != "running" ]]; then
        printf "  %-28s %s\n" "${container}" "${status}"
        all_ready=false
        continue
      fi

      # Healthcheck tanımlıysa healthy olmasını bekle.
      # Healthcheck yoksa "running" durumu yeterli kabul edilir.
      # shellcheck disable=SC2086
      health="$(
        ${DOCKER_CMD} inspect \
          --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
          "${container}" 2>/dev/null || echo "unknown"
      )"

      case "${health}" in
        healthy)
          printf "  %-28s running (healthy)\n" "${container}"
          ;;

        none)
          printf "  %-28s running\n" "${container}"
          ;;

        starting)
          printf "  %-28s running (health: starting)\n" "${container}"
          all_ready=false
          ;;

        unhealthy)
          printf "  %-28s running (health: UNHEALTHY)\n" "${container}"
          all_ready=false
          ;;

        *)
          printf "  %-28s running (health: %s)\n" "${container}" "${health}"
          all_ready=false
          ;;
      esac
    done

    if [[ "${all_ready}" == "true" ]]; then
      echo
      echo "All Kaisha containers are ready."

      # ADDED:
      # Maintenance sadece tüm container kontrolleri başarılı olduktan sonra kapatılır.
      ./deploy/belgelik-maintenance.sh off

      echo "Maintenance mode is OFF."
      return 0
    fi

    sleep "${interval_seconds}"
    elapsed=$((elapsed + interval_seconds))
  done

  echo
  echo "ERROR: Kaisha stack did not become ready within ${timeout_seconds} seconds."
  echo "Maintenance mode remains ON."
  return 1
}

usage() {
  cat <<'HELP'
Usage:
  ./deploy/mam-kaisha.sh init [MAM_HOST] [KEYCLOAK_HOST] [OFFICE_HOST] [WHITELIST_DOMAIN]
  ./deploy/mam-kaisha.sh build
  ./deploy/mam-kaisha.sh up
  ./deploy/mam-kaisha.sh down           # enable maintenance first, then stop containers
  ./deploy/mam-kaisha.sh restart        # restart and rebuild app image when current commit changed
  ./deploy/mam-kaisha.sh ps
  ./deploy/mam-kaisha.sh logs [SERVICE...]
  ./deploy/mam-kaisha.sh urls
  ./deploy/mam-kaisha.sh version
  ./deploy/mam-kaisha.sh sync-keycloak
  ./deploy/mam-kaisha.sh maintenance-on
  ./deploy/mam-kaisha.sh maintenance-off
  ./deploy/mam-kaisha.sh maintenance-status
  ./deploy/mam-kaisha.sh maintenance-restart
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

    # ADDED:
    # "up" sırasında kullanıcı trafiğinin erken açılmaması için
    # maintenance modu başlangıçta açık tutulur.
    ./deploy/belgelik-maintenance.sh on

    echo "Starting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"

    dc up -d postgres keycloak-postgres

    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh \
      --env-file "${ENV_FILE}" \
      -f "${BASE_COMPOSE}" \
      -f "${KAISHA_COMPOSE}"

    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh \
      --env-file "${ENV_FILE}" \
      -f "${BASE_COMPOSE}" \
      -f "${KAISHA_COMPOSE}"

    up_stack_with_current_image_cache

    KEYCLOAK_CONTAINER=kaisha-keycloak \
      ENV_FILE="${ENV_FILE}" \
      ./deploy/keycloak-sync-defaults.sh

    print_running_version

    # ADDED:
    # Tüm beklenen container'lar hazır olmadan maintenance kapatılmaz.
    # Başarısız olursa set -e nedeniyle script burada durur ve maintenance açık kalır.
    wait_for_kaisha_ready
    ;;

  down)
    ./deploy/belgelik-maintenance.sh on
    dc down
    echo "Belgelik stack is down. Maintenance mode remains ON."
    ;;

  restart)
    ensure_init
    ensure_external_volumes
    export_build_metadata

    # ADDED:
    # Restart başlamadan önce maintenance modunu aç.
    # Böylece dc down sırasında kullanıcı hata ekranı görmez.
    ./deploy/belgelik-maintenance.sh on

    echo "Restarting MAM app from ${MAM_GIT_BRANCH}@${MAM_GIT_COMMIT} (${MAM_BUILD_DATE})"

    dc down

    dc up -d postgres keycloak-postgres

    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-postgres-password.sh \
      --env-file "${ENV_FILE}" \
      -f "${BASE_COMPOSE}" \
      -f "${KAISHA_COMPOSE}"

    DOCKER_CMD="${DOCKER_CMD}" ./deploy/sync-keycloak-postgres-password.sh \
      --env-file "${ENV_FILE}" \
      -f "${BASE_COMPOSE}" \
      -f "${KAISHA_COMPOSE}"

    up_stack_with_current_image_cache

    KEYCLOAK_CONTAINER=kaisha-keycloak \
      ENV_FILE="${ENV_FILE}" \
      ./deploy/keycloak-sync-defaults.sh

    print_running_version

    # ADDED:
    # Restart sonrasında tüm container'ların gerçekten hazır olmasını bekle.
    # Hepsi hazır olduğunda fonksiyon maintenance modunu otomatik kapatır.
    wait_for_kaisha_ready
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

  maintenance-on)
    ./deploy/belgelik-maintenance.sh on
    ;;

  maintenance-off)
    ./deploy/belgelik-maintenance.sh off
    ;;

  maintenance-status)
    ./deploy/belgelik-maintenance.sh status
    ;;

  maintenance-restart)
    ./deploy/belgelik-maintenance.sh with-maintenance -- ./deploy/mam-kaisha.sh restart
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