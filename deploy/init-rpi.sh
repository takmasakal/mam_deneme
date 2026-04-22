#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_OUT="${DEPLOY_DIR}/.env.rpi"
REALM_TEMPLATE="${DEPLOY_DIR}/keycloak/mam-realm.template.json"
REALM_OUT="${DEPLOY_DIR}/keycloak/mam-rpi-realm.json"

detect_host() {
  if command -v ip >/dev/null 2>&1; then
    local eth0_ip
    eth0_ip="$(ip -4 addr show dev eth0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n1)"
    if [[ -n "${eth0_ip}" ]]; then
      printf '%s\n' "${eth0_ip}"
      return 0
    fi
  fi
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}'
    return 0
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

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

mkdir -p "${ROOT_DIR}/uploads" "${DEPLOY_DIR}/keycloak"

PUBLIC_HOST="${1:-${PUBLIC_HOST:-}}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  PUBLIC_HOST="$(detect_host)"
fi
if [[ -z "${PUBLIC_HOST}" ]]; then
  echo "Could not detect PUBLIC_HOST automatically."
  exit 1
fi

if [[ -f "${ENV_OUT}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_OUT}"
fi

KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_ADMIN_PASSWORD="${MAM_ADMIN_PASSWORD:-mamadmin}"
MAM_USER="${MAM_USER:-mamuser}"
MAM_USER_PASSWORD="${MAM_USER_PASSWORD:-mamuser}"

OAUTH2_PROXY_CLIENT_ID="${OAUTH2_PROXY_CLIENT_ID:-mam-web}"
OAUTH2_PROXY_CLIENT_SECRET="${OAUTH2_PROXY_CLIENT_SECRET:-$(rand_hex 24)}"
OAUTH2_PROXY_COOKIE_SECRET="${OAUTH2_PROXY_COOKIE_SECRET:-$(rand_hex 16)}"
UPLOADS_DIR="${UPLOADS_DIR:-${ROOT_DIR}/uploads}"
OFFICE_EDITOR_PROVIDER="${OFFICE_EDITOR_PROVIDER:-onlyoffice}"
INSTALL_LIBREOFFICE="${INSTALL_LIBREOFFICE:-false}"
if [[ "${OFFICE_EDITOR_PROVIDER,,}" == "libreoffice" && "${INSTALL_LIBREOFFICE,,}" != "true" ]]; then
  INSTALL_LIBREOFFICE="true"
fi

cat > "${ENV_OUT}" <<EOF
PUBLIC_HOST=${PUBLIC_HOST}
UPLOADS_DIR=${UPLOADS_DIR}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
KEYCLOAK_DB_USER=${KEYCLOAK_DB_USER}
KEYCLOAK_DB_PASSWORD=${KEYCLOAK_DB_PASSWORD}
KEYCLOAK_DB_NAME=${KEYCLOAK_DB_NAME}
MAM_ADMIN_USER=${MAM_ADMIN_USER}
MAM_ADMIN_PASSWORD=${MAM_ADMIN_PASSWORD}
MAM_USER=${MAM_USER}
MAM_USER_PASSWORD=${MAM_USER_PASSWORD}
OAUTH2_PROXY_CLIENT_ID=${OAUTH2_PROXY_CLIENT_ID}
OAUTH2_PROXY_CLIENT_SECRET=${OAUTH2_PROXY_CLIENT_SECRET}
OAUTH2_PROXY_COOKIE_SECRET=${OAUTH2_PROXY_COOKIE_SECRET}
OFFICE_EDITOR_PROVIDER=${OFFICE_EDITOR_PROVIDER}
INSTALL_LIBREOFFICE=${INSTALL_LIBREOFFICE}
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

echo "Prepared Raspberry Pi deployment files:"
echo "  - ${ENV_OUT}"
echo "  - ${REALM_OUT}"
echo
echo "Detected host: ${PUBLIC_HOST}"
echo "MAM URL: http://${PUBLIC_HOST}:3000"
echo "Keycloak URL: http://${PUBLIC_HOST}:8081"
