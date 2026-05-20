#!/bin/sh
set -eu

read_secret() {
  secret_file="$1"
  if [ ! -f "$secret_file" ]; then
    echo "Missing Docker secret file: $secret_file" >&2
    exit 1
  fi
  cat "$secret_file"
}

export OAUTH2_PROXY_CLIENT_SECRET="$(read_secret /run/secrets/oauth2_proxy_client_secret)"
export OAUTH2_PROXY_COOKIE_SECRET="$(read_secret /run/secrets/oauth2_proxy_cookie_secret)"

exec /bin/oauth2-proxy "$@"
