#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

TARGET_REMOTE_REF="origin/main"
TARGET_BRANCH="main"
POSTGRES_VOLUME_NAME="codex_deneme_pg_data"

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

print_step "Ensuring external postgres volume exists"
docker volume create "$POSTGRES_VOLUME_NAME" >/dev/null

PUBLIC_HOST="${PUBLIC_HOST:-$(hostname -I | awk '{print $1}')}"
export PUBLIC_HOST
export ONLYOFFICE_PUBLIC_URL="${ONLYOFFICE_PUBLIC_URL:-http://${PUBLIC_HOST}:8082}"
export OAUTH2_PROXY_OIDC_ISSUER_URL="${OAUTH2_PROXY_OIDC_ISSUER_URL:-http://${PUBLIC_HOST}:8081/realms/mam}"
export OAUTH2_PROXY_LOGIN_URL="${OAUTH2_PROXY_LOGIN_URL:-http://${PUBLIC_HOST}:8081/realms/mam/protocol/openid-connect/auth}"
export OAUTH2_PROXY_REDIRECT_URL="${OAUTH2_PROXY_REDIRECT_URL:-http://${PUBLIC_HOST}:3001/oauth2/callback}"
export OAUTH2_PROXY_BACKEND_LOGOUT_URL="${OAUTH2_PROXY_BACKEND_LOGOUT_URL:-http://keycloak:8080/realms/mam/protocol/openid-connect/logout?id_token_hint={id_token}&post_logout_redirect_uri=http%3A%2F%2F${PUBLIC_HOST}%3A3001%2Foauth2%2Fstart%3Frd%3D%252F}"
export OAUTH2_PROXY_WHITELIST_DOMAINS="${OAUTH2_PROXY_WHITELIST_DOMAINS:-${PUBLIC_HOST},${PUBLIC_HOST}:*}"
print_step "Using PUBLIC_HOST=$PUBLIC_HOST"

print_step "Building and starting containers"
docker compose up -d --build "$@"

print_step "Running revision"
git rev-parse --short HEAD
