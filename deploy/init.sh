#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
REALM_TEMPLATE="${DEPLOY_DIR}/keycloak/mam-realm.template.json"
REALM_OUT="${DEPLOY_DIR}/keycloak/mam-realm.json"
ENV_OUT="${DEPLOY_DIR}/.env.easy"

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

PUBLIC_HOST="${1:-${PUBLIC_HOST:-}}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="$(detect_host)"
fi
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="localhost"
fi

rand_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    date +%s%N | sha256sum | head -c $((bytes * 2))
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

if [[ ! -f "${REALM_TEMPLATE}" ]]; then
  echo "Missing realm template: ${REALM_TEMPLATE}"
  exit 1
fi

mkdir -p "${ROOT_DIR}/uploads" "${ROOT_DIR}/keycloak-theme" "${DEPLOY_DIR}/keycloak"

KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_ADMIN_PASSWORD="${MAM_ADMIN_PASSWORD:-mamadmin}"
MAM_USER="${MAM_USER:-mamuser}"
MAM_USER_PASSWORD="${MAM_USER_PASSWORD:-mamuser}"

OAUTH2_PROXY_CLIENT_ID="mam-web"
OAUTH2_PROXY_CLIENT_SECRET="${OAUTH2_PROXY_CLIENT_SECRET:-$(rand_hex 24)}"
OAUTH2_PROXY_COOKIE_SECRET="${OAUTH2_PROXY_COOKIE_SECRET:-$(rand_hex 16)}"

cat > "${ENV_OUT}" <<EOF
PUBLIC_HOST=${PUBLIC_HOST}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
KEYCLOAK_DB_USER=${KEYCLOAK_DB_USER}
KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD}
KEYCLOAK_DB_NAME=${KEYCLOAK_DB_NAME}
OAUTH2_PROXY_CLIENT_ID=${OAUTH2_PROXY_CLIENT_ID}
OAUTH2_PROXY_CLIENT_SECRET=${OAUTH2_PROXY_CLIENT_SECRET}
OAUTH2_PROXY_COOKIE_SECRET=${OAUTH2_PROXY_COOKIE_SECRET}
MAM_ADMIN_USER=${MAM_ADMIN_USER}
MAM_ADMIN_PASSWORD=${MAM_ADMIN_PASSWORD}
MAM_USER=${MAM_USER}
MAM_USER_PASSWORD=${MAM_USER_PASSWORD}
EOF

sed \
  -e "s|__PUBLIC_HOST__|$(escape_sed "${PUBLIC_HOST}")|g" \
  -e "s|__CLIENT_SECRET__|$(escape_sed "${OAUTH2_PROXY_CLIENT_SECRET}")|g" \
  -e "s|__MAM_ADMIN_USER__|$(escape_sed "${MAM_ADMIN_USER}")|g" \
  -e "s|__MAM_ADMIN_PASSWORD__|$(escape_sed "${MAM_ADMIN_PASSWORD}")|g" \
  -e "s|__MAM_USER__|$(escape_sed "${MAM_USER}")|g" \
  -e "s|__MAM_USER_PASSWORD__|$(escape_sed "${MAM_USER_PASSWORD}")|g" \
  "${REALM_TEMPLATE}" > "${REALM_OUT}"

chmod 600 "${ENV_OUT}"

echo "Prepared turnkey deployment files:"
echo "  - ${ENV_OUT}"
echo "  - ${REALM_OUT}"
echo
echo "Next:"
echo "  docker compose --env-file deploy/.env.easy -f docker-compose.easy.yml up -d"
echo
echo "Login URLs:"
echo "  - MAM: http://${PUBLIC_HOST}:3000"
echo "  - Keycloak Admin: http://${PUBLIC_HOST}:8081"
echo
echo "Users created in realm 'mam':"
echo "  - ${MAM_ADMIN_USER} / ${MAM_ADMIN_PASSWORD} (realm roles: admin-access, asset-delete)"
echo "  - ${MAM_USER} / ${MAM_USER_PASSWORD}"
