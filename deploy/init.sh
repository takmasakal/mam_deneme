#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
REALM_TEMPLATE="${DEPLOY_DIR}/keycloak/mam-realm.template.json"
ENV_OUT="${DEPLOY_DIR}/.env.easy"
SECRETS_DIR="${DEPLOY_DIR}/secrets"

detect_host() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}'
    return 0
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
    return 0
  fi
  echo ""
}

rand_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    date +%s%N | sha256sum | head -c $((bytes * 2))
  fi
}

rand_cookie_secret() {
  rand_hex 16
}

is_weak_secret() {
  local value="$1"
  shift || true
  [[ -z "${value}" ]] && return 0
  local weak
  for weak in "$@"; do
    [[ "${value}" == "${weak}" ]] && return 0
  done
  return 1
}

ensure_secret() {
  local name="$1"
  local candidate="$2"
  local generator="$3"
  shift 3 || true
  local path="${SECRETS_DIR}/${name}"
  local current=""
  if [[ -f "${path}" ]]; then
    current="$(cat "${path}")"
  fi
  if is_weak_secret "${current}" "$@"; then
    if is_weak_secret "${candidate}" "$@"; then
      case "${generator}" in
        cookie) candidate="$(rand_cookie_secret)" ;;
        *) candidate="$(rand_hex 24)" ;;
      esac
    fi
    printf '%s\n' "${candidate}" > "${path}"
    chmod 600 "${path}"
  fi
}

if [[ ! -f "${REALM_TEMPLATE}" ]]; then
  echo "Missing realm template: ${REALM_TEMPLATE}"
  exit 1
fi

mkdir -p "${ROOT_DIR}/uploads" "${ROOT_DIR}/keycloak-theme" "${DEPLOY_DIR}/keycloak" "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

REQUESTED_PUBLIC_HOST="${1:-${PUBLIC_HOST:-}}"
if [[ -f "${ENV_OUT}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_OUT}"
fi

PUBLIC_HOST="${REQUESTED_PUBLIC_HOST:-${PUBLIC_HOST:-}}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="$(detect_host)"
fi
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="localhost"
fi

KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"
MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_USER="${MAM_USER:-mamuser}"
MAM_TEXT_ADMIN_USER="${MAM_TEXT_ADMIN_USER:-yazici}"
OAUTH2_PROXY_CLIENT_ID="${OAUTH2_PROXY_CLIENT_ID:-mam-web}"

ensure_secret mam_postgres_password "${MAM_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}" hex "postgres"
ensure_secret keycloak_db_password "${KEYCLOAK_DB_PASSWORD:-}" hex "keycloak"
ensure_secret keycloak_admin_password "${KEYCLOAK_ADMIN_PASSWORD:-}" hex "admin"
ensure_secret oauth2_proxy_client_secret "${OAUTH2_PROXY_CLIENT_SECRET:-}" hex "change-me"
ensure_secret oauth2_proxy_cookie_secret "${OAUTH2_PROXY_COOKIE_SECRET:-}" cookie "0123456789abcdef0123456789abcdef" "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
ensure_secret mam_admin_password "${MAM_ADMIN_PASSWORD:-}" hex "mamadmin"
ensure_secret mam_user_password "${MAM_USER_PASSWORD:-}" hex "mamuser"
ensure_secret mam_text_admin_password "${MAM_TEXT_ADMIN_PASSWORD:-}" hex "yazici"

cat > "${ENV_OUT}" <<EOV
PUBLIC_HOST=${PUBLIC_HOST}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}
KEYCLOAK_DB_USER=${KEYCLOAK_DB_USER}
KEYCLOAK_DB_NAME=${KEYCLOAK_DB_NAME}
OAUTH2_PROXY_CLIENT_ID=${OAUTH2_PROXY_CLIENT_ID}
MAM_ADMIN_USER=${MAM_ADMIN_USER}
MAM_USER=${MAM_USER}
MAM_TEXT_ADMIN_USER=${MAM_TEXT_ADMIN_USER}
EOV
chmod 600 "${ENV_OUT}"

echo "Prepared turnkey deployment files:"
echo "  - ${ENV_OUT}"
echo "  - ${SECRETS_DIR}/ (Docker secrets, git ignored)"
echo
echo "Next:"
echo "  docker compose up -d"
echo
echo "Login URLs:"
echo "  - MAM: http://${PUBLIC_HOST}:3000"
echo "  - Keycloak Admin: http://${PUBLIC_HOST}:8081"
echo
echo "Users created in realm 'mam':"
echo "  - ${MAM_ADMIN_USER} (no permissions are granted automatically)"
echo "  - ${MAM_USER}"
echo "  - ${MAM_TEXT_ADMIN_USER} (no permissions are granted automatically)"
echo
echo "Passwords are stored only under ${SECRETS_DIR}."
