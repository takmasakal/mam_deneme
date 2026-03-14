#!/usr/bin/env bash
set -euo pipefail

echo "Starting stack (multi-stage Dockerfile cache enabled)..."
docker compose up -d --build
