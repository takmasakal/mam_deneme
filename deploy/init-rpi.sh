#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_OUT="${DEPLOY_DIR}/.env.rpi"
REALM_TEMPLATE="${DEPLOY_DIR}/keycloak/mam-realm.template.json"
SECRETS_DIR="${DEPLOY_DIR}/secrets"

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

rand_cookie_secret() {
  rand_hex 16
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
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

mkdir -p "${ROOT_DIR}/uploads" "${DEPLOY_DIR}/keycloak" "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

REQUESTED_OFFICE_EDITOR_PROVIDER="${OFFICE_EDITOR_PROVIDER:-}"
REQUESTED_ENABLE_ONLYOFFICE="${ENABLE_ONLYOFFICE:-}"
REQUESTED_PUBLIC_HOST="${1:-${PUBLIC_HOST:-}}"

if [[ -f "${ENV_OUT}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_OUT}"
fi

PUBLIC_HOST="${REQUESTED_PUBLIC_HOST:-$(detect_host)}"
if [[ -z "${PUBLIC_HOST}" ]]; then
  echo "Could not detect PUBLIC_HOST automatically."
  exit 1
fi

KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"
MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_USER="${MAM_USER:-mamuser}"
MAM_TEXT_ADMIN_USER="${MAM_TEXT_ADMIN_USER:-yazici}"
OAUTH2_PROXY_CLIENT_ID="${OAUTH2_PROXY_CLIENT_ID:-mam-web}"
UPLOADS_DIR="${UPLOADS_DIR:-${ROOT_DIR}/uploads}"
ENABLE_ONLYOFFICE="${REQUESTED_ENABLE_ONLYOFFICE:-${ENABLE_ONLYOFFICE:-false}}"
OFFICE_EDITOR_PROVIDER="${REQUESTED_OFFICE_EDITOR_PROVIDER:-${OFFICE_EDITOR_PROVIDER:-libreoffice}}"
if [[ "$(lower "${ENABLE_ONLYOFFICE}")" != "true" && "$(lower "${OFFICE_EDITOR_PROVIDER}")" == "onlyoffice" ]]; then
  OFFICE_EDITOR_PROVIDER="libreoffice"
fi
INSTALL_LIBREOFFICE="${INSTALL_LIBREOFFICE:-false}"
MAM_BUILD_LOCAL="${MAM_BUILD_LOCAL:-false}"
MAM_OFFLINE_MODE="${MAM_OFFLINE_MODE:-true}"
PRELOAD_ML_MODELS="${PRELOAD_ML_MODELS:-true}"
PRELOAD_PADDLE_OCR="${PRELOAD_PADDLE_OCR:-true}"
WHISPER_MODEL="${WHISPER_MODEL:-small}"
if [[ "$(lower "${OFFICE_EDITOR_PROVIDER}")" == "libreoffice" && "$(lower "${INSTALL_LIBREOFFICE}")" != "true" ]]; then
  INSTALL_LIBREOFFICE="true"
fi

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
UPLOADS_DIR=${UPLOADS_DIR}
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN}
KEYCLOAK_DB_USER=${KEYCLOAK_DB_USER}
KEYCLOAK_DB_NAME=${KEYCLOAK_DB_NAME}
MAM_ADMIN_USER=${MAM_ADMIN_USER}
MAM_USER=${MAM_USER}
MAM_TEXT_ADMIN_USER=${MAM_TEXT_ADMIN_USER}
OAUTH2_PROXY_CLIENT_ID=${OAUTH2_PROXY_CLIENT_ID}
ENABLE_ONLYOFFICE=${ENABLE_ONLYOFFICE}
OFFICE_EDITOR_PROVIDER=${OFFICE_EDITOR_PROVIDER}
INSTALL_LIBREOFFICE=${INSTALL_LIBREOFFICE}
MAM_BUILD_LOCAL=${MAM_BUILD_LOCAL}
MAM_OFFLINE_MODE=${MAM_OFFLINE_MODE}
PRELOAD_ML_MODELS=${PRELOAD_ML_MODELS}
PRELOAD_PADDLE_OCR=${PRELOAD_PADDLE_OCR}
WHISPER_MODEL=${WHISPER_MODEL}
EOV
chmod 600 "${ENV_OUT}"

echo "Prepared Raspberry Pi deployment files:"
echo "  - ${ENV_OUT}"
echo "  - ${SECRETS_DIR}/ (Docker secrets, git ignored)"
echo
echo "Detected host: ${PUBLIC_HOST}"
echo "MAM URL: http://${PUBLIC_HOST}:3000"
echo "Keycloak URL: http://${PUBLIC_HOST}:8081"
echo "Passwords are stored only under ${SECRETS_DIR}."
