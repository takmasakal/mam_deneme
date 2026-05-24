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

container_id="$("${docker_cmd_parts[@]}" compose "${compose_args[@]}" ps -q postgres)"
if [[ -z "${container_id}" ]]; then
  echo "Postgres container is not running; start postgres before syncing the password."
  exit 1
fi

echo "Syncing PostgreSQL password with Docker secret..."
"${docker_cmd_parts[@]}" exec "${container_id}" bash -lc '
set -euo pipefail
for attempt in $(seq 1 60); do
  if pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
pg_isready -U postgres -d postgres >/dev/null
password="$(cat /run/secrets/mam_postgres_password)"
psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '\''${password}'\'';" >/dev/null
'
echo "PostgreSQL password is in sync."
