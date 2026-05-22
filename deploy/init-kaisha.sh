#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_OUT="${DEPLOY_DIR}/.env.kaisha"
SECRETS_DIR="${DEPLOY_DIR}/secrets"

urlencode() {
  local raw="$1"
  python3 - "$raw" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1].rstrip('/'), safe=''))
PY
}

mam_host="${1:-${PUBLIC_MAM_HOST:-mam.company.local}}"
keycloak_host="${2:-${PUBLIC_KEYCLOAK_HOST:-auth.company.local}}"
office_host="${3:-${PUBLIC_OFFICE_HOST:-office.company.local}}"
company_domain="${4:-${OAUTH2_PROXY_WHITELIST_DOMAINS:-.company.local}}"

if [[ ! -d "${SECRETS_DIR}" ]]; then
  "${DEPLOY_DIR}/init.sh" "${mam_host}"
fi

mam_url="https://${mam_host}"
keycloak_url="https://${keycloak_host}"
office_url="https://${office_host}"
encoded_mam_url="$(urlencode "${mam_url}")"

cat > "${ENV_OUT}" <<EOV
PUBLIC_HOST=${mam_host}
PUBLIC_MAM_HOST=${mam_host}
PUBLIC_KEYCLOAK_HOST=${keycloak_host}
PUBLIC_OFFICE_HOST=${office_host}
PUBLIC_MAM_URL=${mam_url}
PUBLIC_KEYCLOAK_URL=${keycloak_url}
PUBLIC_OFFICE_URL=${office_url}
PUBLIC_MAM_URL_ENCODED=${encoded_mam_url}

KEYCLOAK_REALM=mam
KEYCLOAK_REALMS=mam
KEYCLOAK_ADMIN_REALM=master
KEYCLOAK_ADMIN=
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_NAME=keycloak
OAUTH2_PROXY_CLIENT_ID=mam-web
OAUTH2_PROXY_WHITELIST_DOMAINS=${company_domain}

OFFICE_EDITOR_PROVIDER=onlyoffice
ONLYOFFICE_PUBLIC_URL=${office_url}
ONLYOFFICE_INTERNAL_URL=http://onlyoffice
APP_INTERNAL_URL=http://app:3000

MAM_OFFLINE_MODE=true
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
PADDLE_OCR_ALLOW_FALLBACK=false
EOV
chmod 600 "${ENV_OUT}"

cat <<MSG
Prepared company deployment env:
  - ${ENV_OUT}

This repository no longer starts an internal Nginx/HTTPS reverse proxy.
Company reverse proxy must route public HTTPS traffic to these host ports:
  - ${mam_url}       -> http://SERVER_IP:3000
  - ${keycloak_url}  -> http://SERVER_IP:8081
  - ${office_url}    -> http://SERVER_IP:8082  (OnlyOffice kullaniliyorsa)

Start with:
  docker compose --env-file ${ENV_OUT} -f docker-compose.yml -f docker-compose.kaisha.yml up -d

Public URLs:
  MAM:        ${mam_url}
  Keycloak:   ${keycloak_url}
  OnlyOffice: ${office_url}
MSG
