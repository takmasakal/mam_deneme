#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

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
  echo "Docker daemon is not reachable. Start Docker or use sudo."
  exit 1
fi
read -r -a docker_cmd_parts <<< "${DOCKER_CMD}"

compose_args=("$@")
if [[ "${#compose_args[@]}" -eq 0 ]]; then
  compose_args=(-f docker-compose.yml)
fi

container_id="$("${docker_cmd_parts[@]}" compose "${compose_args[@]}" ps -q keycloak-postgres)"
if [[ -z "${container_id}" ]]; then
  echo "Keycloak PostgreSQL container is not running; start keycloak-postgres before syncing the password."
  exit 1
fi

echo "Syncing Keycloak PostgreSQL password with Docker secret..."
"${docker_cmd_parts[@]}" exec "${container_id}" bash -lc '
set -euo pipefail
password="$(cat /run/secrets/keycloak_db_password)"
psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-keycloak}" -d "${POSTGRES_DB:-keycloak}" -c "ALTER USER ${POSTGRES_USER:-keycloak} WITH PASSWORD '\''${password}'\'';" >/dev/null
'
echo "Keycloak PostgreSQL password is in sync."
