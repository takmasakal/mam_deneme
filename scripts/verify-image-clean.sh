#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-takmasakal/mam:latest}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found"
  exit 1
fi

echo "Checking image content: ${IMAGE_REF}"

docker run --rm --entrypoint sh "${IMAGE_REF}" -lc '
set -e

test ! -f /app/.env
test ! -d /app/data
test ! -d /app/Bilgiler
test ! -d /app/keycloak-theme

if [ -d /app/uploads ]; then
  if find /app/uploads -type f | grep -q .; then
    echo "Found uploaded file(s) inside image:"
    find /app/uploads -type f
    exit 1
  fi
fi

echo "OK: image does not contain media/data metadata folders or files."
'
