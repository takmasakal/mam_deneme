#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOCKERHUB_NAMESPACE="${DOCKERHUB_NAMESPACE:-takmasakal}"
IMAGE_NAME="${IMAGE_NAME:-mam}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-1}"

IMAGE_REPO="${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found"
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required"
  exit 1
fi

if ! docker buildx inspect mam-multiarch-builder >/dev/null 2>&1; then
  docker buildx create --name mam-multiarch-builder --driver docker-container --use >/dev/null
else
  docker buildx use mam-multiarch-builder >/dev/null
fi
docker buildx inspect --bootstrap >/dev/null

echo "Building image: ${IMAGE_REPO}:${IMAGE_TAG}"
echo "Platforms: ${PLATFORMS}"
echo "Media/metadata folders are excluded from build context via .dockerignore"

if [[ "$PUSH" == "1" ]]; then
  docker buildx build \
    --platform "${PLATFORMS}" \
    -t "${IMAGE_REPO}:${IMAGE_TAG}" \
    -t "${IMAGE_REPO}:${GIT_SHA}" \
    --provenance=false \
    --sbom=false \
    --push \
    .
  echo "Pushed:"
  echo "  - ${IMAGE_REPO}:${IMAGE_TAG}"
  echo "  - ${IMAGE_REPO}:${GIT_SHA}"
else
  LOAD_PLATFORM="${PLATFORMS%%,*}"
  docker buildx build \
    --platform "${LOAD_PLATFORM}" \
    -t "${IMAGE_REPO}:${IMAGE_TAG}" \
    --provenance=false \
    --sbom=false \
    --load \
    .
  echo "Built locally (no push): ${IMAGE_REPO}:${IMAGE_TAG} (${LOAD_PLATFORM})"
fi
