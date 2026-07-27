#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

RUNTIME_IMAGE="${MAM_RUNTIME_IMAGE:-mam_deneme-runtime:latest}"

docker build \
  --file Dockerfile.runtime \
  --tag "${RUNTIME_IMAGE}" \
  --build-arg INSTALL_LIBREOFFICE="${INSTALL_LIBREOFFICE:-false}" \
  --build-arg PRELOAD_ML_MODELS="${PRELOAD_ML_MODELS:-true}" \
  --build-arg PRELOAD_PADDLE_OCR="${PRELOAD_PADDLE_OCR:-true}" \
  --build-arg WHISPER_MODEL="${WHISPER_MODEL:-small}" \
  .

echo "Runtime image ready: ${RUNTIME_IMAGE}"
