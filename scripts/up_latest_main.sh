#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

TARGET_REMOTE_REF="origin/main"
TARGET_BRANCH="main"
POSTGRES_VOLUME_NAME="mam_deneme_pg_data"

print_step() {
  printf '\n[%s] %s\n' "mam" "$1"
}

current_git_branch() {
  local branch
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  if [[ -z "$branch" ]]; then
    branch="$(git branch --show-current 2>/dev/null || true)"
  fi
  if [[ -z "$branch" ]]; then
    branch="$(git name-rev --name-only HEAD 2>/dev/null \
      | sed -E 's#^remotes/origin/##; s#^origin/##; s#~[0-9]+$##' || true)"
  fi
  if [[ -z "$branch" || "$branch" == "undefined" ]]; then
    branch="unknown"
  fi
  echo "$branch"
}

export_build_metadata() {
  MAM_GIT_COMMIT="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  MAM_GIT_BRANCH="$(current_git_branch)"
  MAM_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export MAM_GIT_COMMIT MAM_GIT_BRANCH MAM_BUILD_DATE
}

print_step "Fetching latest remote branch"
git fetch origin "$TARGET_BRANCH"

current_branch="$(git branch --show-current || true)"
if [[ "$current_branch" == "$TARGET_BRANCH" ]]; then
  print_step "Updating local $TARGET_BRANCH"
  git pull --ff-only origin "$TARGET_BRANCH"
else
  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    print_step "Switching to local $TARGET_BRANCH"
    git checkout "$TARGET_BRANCH"
    git pull --ff-only origin "$TARGET_BRANCH"
  else
    print_step "Creating local tracking branch $TARGET_BRANCH"
    git checkout -b "$TARGET_BRANCH" --track "$TARGET_REMOTE_REF"
  fi
fi

print_step "Ensuring external postgres volume exists"
docker volume create "$POSTGRES_VOLUME_NAME" >/dev/null

print_step "Building and starting containers"
export_build_metadata
docker compose up -d --build "$@"

print_step "Running revision"
git rev-parse --short HEAD
