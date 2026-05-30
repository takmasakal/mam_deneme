#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-deploy/.env.kaisha}"
SECRETS_DIR="${SECRETS_DIR:-deploy/secrets}"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-mam-keycloak}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

REALM="${KEYCLOAK_REALM:-mam}"
ADMIN_REALM="${KEYCLOAK_ADMIN_REALM:-master}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
OAUTH2_PROXY_CLIENT_ID="${OAUTH2_PROXY_CLIENT_ID:-mam-web}"
PUBLIC_MAM_URL="${PUBLIC_MAM_URL:-}"
ADMIN_PASSWORD_FILE="${SECRETS_DIR}/keycloak_admin_password"
MAM_SUPERADMIN_USER="${MAM_SUPERADMIN_USER:-mamsup}"
MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_USER="${MAM_USER:-mamuser}"
KEYCLOAK_SYNC_RESET_DEFAULT_PASSWORDS="${KEYCLOAK_SYNC_RESET_DEFAULT_PASSWORDS:-false}"
KEYCLOAK_SYNC_SESSION_SETTINGS="${KEYCLOAK_SYNC_SESSION_SETTINGS:-false}"
KEYCLOAK_SSO_IDLE_SECONDS="${KEYCLOAK_SSO_IDLE_SECONDS:-1800}"
KEYCLOAK_SSO_MAX_SECONDS="${KEYCLOAK_SSO_MAX_SECONDS:-28800}"
KEYCLOAK_CLIENT_IDLE_SECONDS="${KEYCLOAK_CLIENT_IDLE_SECONDS:-1800}"
KEYCLOAK_CLIENT_MAX_SECONDS="${KEYCLOAK_CLIENT_MAX_SECONDS:-28800}"
KEYCLOAK_REMEMBER_ME="${KEYCLOAK_REMEMBER_ME:-false}"
MAM_GROUPS=(
  "dokyonet"
  "dokkullan"
  "fotokullan"
  "fotoyonet"
  "superadmin"
  "altyazı_ocr_operator"
  "standart yönetici"
)

if [[ ! -f "${ADMIN_PASSWORD_FILE}" ]]; then
  echo "Missing Keycloak admin secret: ${ADMIN_PASSWORD_FILE}"
  exit 1
fi

detect_docker_cmd() {
  if docker info >/dev/null 2>&1; then echo docker; return; fi
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then echo "sudo docker"; return; fi
  echo ""
}

DOCKER_CMD="${DOCKER_CMD:-$(detect_docker_cmd)}"
if [[ -z "${DOCKER_CMD}" ]]; then
  echo "Docker daemon is not reachable. Start Docker or use sudo."
  exit 1
fi

kcadm() {
  # shellcheck disable=SC2086
  ${DOCKER_CMD} exec "${KEYCLOAK_CONTAINER}" /opt/keycloak/bin/kcadm.sh "$@"
}

container_running() {
  local state
  # shellcheck disable=SC2086
  state="$(${DOCKER_CMD} inspect -f '{{.State.Running}}' "${KEYCLOAK_CONTAINER}" 2>/dev/null || true)"
  [[ "${state}" == "true" ]]
}

wait_for_keycloak() {
  if ! container_running; then
    echo "Keycloak container is not running: ${KEYCLOAK_CONTAINER}"
    echo "Start it first: ./deploy/mam-kaisha.sh up"
    exit 1
  fi

  local attempt max_attempts
  max_attempts="${KEYCLOAK_SYNC_WAIT_ATTEMPTS:-60}"
  for attempt in $(seq 1 "${max_attempts}"); do
    if kcadm config credentials \
      --server http://localhost:8080 \
      --realm "${ADMIN_REALM}" \
      --user "${ADMIN_USER}" \
      --password "${admin_password}" >/dev/null 2>&1; then
      return 0
    fi
    if [[ "${attempt}" == "1" ]]; then
      echo "Waiting for Keycloak admin API in ${KEYCLOAK_CONTAINER}..."
    fi
    sleep 5
  done

  echo "Keycloak admin API did not become ready."
  echo "Check logs: ./deploy/mam-kaisha.sh logs keycloak"
  exit 1
}

json_find_client_id() {
  local wanted="$1"
  python3 -c '
import json, sys
wanted = sys.argv[1].strip().lower()
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = []
for row in rows if isinstance(rows, list) else []:
    client_id = str(row.get("clientId", "")).strip().lower()
    if client_id == wanted:
        print(row.get("id", ""))
        break
' "$wanted"
}

json_find_user_id() {
  local wanted="$1"
  python3 -c '
import json, sys
wanted = sys.argv[1].strip().lower()
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = []
for row in rows if isinstance(rows, list) else []:
    username = str(row.get("username", "")).strip().lower()
    if username == wanted:
        print(row.get("id", ""))
        break
' "$wanted"
}

json_find_group_id() {
  local wanted="$1"
  python3 -c '
import json, sys
wanted = sys.argv[1].strip().lower().lstrip("/")
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = []
stack = list(rows if isinstance(rows, list) else [])
while stack:
    row = stack.pop(0)
    name = str(row.get("name", "")).strip().lower()
    path = str(row.get("path", "")).strip().lower().lstrip("/")
    if name == wanted or path == wanted:
        print(row.get("id", ""))
        break
    stack.extend(row.get("subGroups") or [])
' "$wanted"
}

admin_password="$(cat "${ADMIN_PASSWORD_FILE}")"

wait_for_keycloak

ensure_web_client_urls() {
  if [[ -z "${PUBLIC_MAM_URL}" ]]; then
    echo "WARN: PUBLIC_MAM_URL is empty; skipped ${OAUTH2_PROXY_CLIENT_ID} URL sync"
    return
  fi
  local client_uuid mam_url callback_url start_url client_rows
  mam_url="${PUBLIC_MAM_URL%/}"
  callback_url="${mam_url}/oauth2/callback"
  start_url="${mam_url}/oauth2/start?rd=%2F"
  client_rows="$(kcadm get clients -r "${REALM}" -q "clientId=${OAUTH2_PROXY_CLIENT_ID}")"
  client_uuid="$(printf '%s' "${client_rows}" | json_find_client_id "${OAUTH2_PROXY_CLIENT_ID}")"
  if [[ -z "${client_uuid}" ]]; then
    echo "WARN: Keycloak client not found, skipped URL sync: ${OAUTH2_PROXY_CLIENT_ID}"
    return
  fi
  kcadm update "clients/${client_uuid}" -r "${REALM}" \
    -s "baseUrl=${mam_url}" \
    -s "redirectUris=[\"${callback_url}\"]" \
    -s "webOrigins=[\"${mam_url}\"]" \
    -s "attributes.\"post.logout.redirect.uris\"=\"${start_url}\"" >/dev/null
  echo "Client URLs ensured: ${OAUTH2_PROXY_CLIENT_ID}"
}

ensure_realm_session_settings() {
  kcadm update "realms/${REALM}" \
    -s "rememberMe=${KEYCLOAK_REMEMBER_ME}" \
    -s "ssoSessionIdleTimeout=${KEYCLOAK_SSO_IDLE_SECONDS}" \
    -s "ssoSessionMaxLifespan=${KEYCLOAK_SSO_MAX_SECONDS}" \
    -s "clientSessionIdleTimeout=${KEYCLOAK_CLIENT_IDLE_SECONDS}" \
    -s "clientSessionMaxLifespan=${KEYCLOAK_CLIENT_MAX_SECONDS}" >/dev/null
  echo "Realm session settings ensured: ${REALM}"
}

ensure_group() {
  local group_name="$1"
  local group_rows group_uuid
  group_rows="$(kcadm get groups -r "${REALM}")"
  group_uuid="$(printf '%s' "${group_rows}" | json_find_group_id "${group_name}")"
  if [[ -z "${group_uuid}" ]]; then
    kcadm create groups -r "${REALM}" -s "name=${group_name}" >/dev/null
    echo "Group ensured: ${group_name}"
  fi
}

ensure_user() {
  local username="$1"
  local password_file="$2"
  local group_name="${3:-}"
  local password user_rows user_uuid group_rows group_uuid
  if [[ ! -f "${password_file}" ]]; then
    echo "WARN: missing password secret for ${username}: ${password_file}"
    return
  fi
  password="$(cat "${password_file}")"
  user_rows="$(kcadm get users -r "${REALM}" -q "username=${username}")"
  user_uuid="$(printf '%s' "${user_rows}" | json_find_user_id "${username}")"
  local created=false
  if [[ -z "${user_uuid}" ]]; then
    kcadm create users -r "${REALM}" \
      -s "username=${username}" \
      -s enabled=true \
      -s emailVerified=true >/dev/null
    user_rows="$(kcadm get users -r "${REALM}" -q "username=${username}")"
    user_uuid="$(printf '%s' "${user_rows}" | json_find_user_id "${username}")"
    created=true
    echo "User ensured: ${username}"
  fi
  if [[ -n "${user_uuid}" && ( "${created}" == "true" || "${KEYCLOAK_SYNC_RESET_DEFAULT_PASSWORDS}" == "true" ) ]]; then
    kcadm set-password -r "${REALM}" --userid "${user_uuid}" --new-password "${password}" >/dev/null
  fi
  if [[ -n "${group_name}" && -n "${user_uuid}" ]]; then
    group_rows="$(kcadm get groups -r "${REALM}")"
    group_uuid="$(printf '%s' "${group_rows}" | json_find_group_id "${group_name}")"
    if [[ -n "${group_uuid}" ]]; then
      kcadm update "users/${user_uuid}/groups/${group_uuid}" -r "${REALM}" -n >/dev/null
      echo "User group ensured: ${username} -> ${group_name}"
    else
      echo "WARN: group not found for ${username}: ${group_name}"
    fi
  fi
}

for group_name in "${MAM_GROUPS[@]}"; do
  ensure_group "${group_name}"
done

if [[ "${KEYCLOAK_SYNC_SESSION_SETTINGS}" == "true" ]]; then
  ensure_realm_session_settings
fi
ensure_user "${MAM_SUPERADMIN_USER}" "${SECRETS_DIR}/mam_superadmin_password" "superadmin"
ensure_user "${MAM_ADMIN_USER}" "${SECRETS_DIR}/mam_admin_password" "standart yönetici"
ensure_user "${MAM_USER}" "${SECRETS_DIR}/mam_user_password"
ensure_web_client_urls

echo "Keycloak defaults are synchronized for realm: ${REALM}"
