#!/usr/bin/env bash
set -euo pipefail

EXPECTED_CONTAINERS=(
  "kaisha-oauth2-proxy"
  "kaisha-app"
  "kaisha-onlyoffice"
  "kaisha-keycloak"
  "kaisha-elasticsearch"
  "kaisha-keycloak-postgres"
  "kaisha-postgres"
)

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-3}"

elapsed=0

echo "Waiting for Kaisha containers to become ready..."

while (( elapsed < TIMEOUT_SECONDS )); do
  all_ready=true

  for container in "${EXPECTED_CONTAINERS[@]}"; do
    status="$(docker inspect \
      --format '{{.State.Status}}' \
      "${container}" 2>/dev/null || echo "missing")"

    if [[ "${status}" != "running" ]]; then
      echo "${container}: ${status}"
      all_ready=false
      continue
    fi

    health="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      "${container}" 2>/dev/null || echo "unknown")"

    case "${health}" in
      healthy|none)
        echo "${container}: running (${health})"
        ;;
      starting)
        echo "${container}: running (health starting)"
        all_ready=false
        ;;
      unhealthy)
        echo "${container}: running (UNHEALTHY)"
        all_ready=false
        ;;
      *)
        echo "${container}: running (${health})"
        all_ready=false
        ;;
    esac
  done

  if [[ "${all_ready}" == "true" ]]; then
    echo
    echo "All Kaisha containers are ready."

    ./deploy/belgelik-maintenance.sh off

    echo "Maintenance mode is OFF."
    exit 0
  fi

  echo
  echo "Waiting... ${elapsed}/${TIMEOUT_SECONDS}s"
  echo

  sleep "${INTERVAL_SECONDS}"
  elapsed=$((elapsed + INTERVAL_SECONDS))
done

echo
echo "ERROR: Kaisha stack did not become ready within ${TIMEOUT_SECONDS} seconds."
echo "Maintenance mode remains ON."
exit 1