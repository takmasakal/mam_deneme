#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

TARGET_REMOTE_REF="origin/main"
TARGET_BRANCH="main"

print_step() {
  printf '\n[%s] %s\n' "mam" "$1"
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

print_step "Building and starting containers"
docker compose up -d --build "$@"

print_step "Running revision"
git rev-parse --short HEAD
