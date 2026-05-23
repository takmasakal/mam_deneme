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
MAM_ADMIN_USER="${MAM_ADMIN_USER:-mamadmin}"
MAM_TEXT_ADMIN_USER="${MAM_TEXT_ADMIN_USER:-yazici}"
ADMIN_PASSWORD_FILE="${SECRETS_DIR}/keycloak_admin_password"

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

json_find_id_by_name() {
  local wanted="$1"
  python3 -c '
import json, sys
wanted = sys.argv[1].strip().lower().lstrip("/")
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = []
for row in rows if isinstance(rows, list) else []:
    names = [
        str(row.get("name", "")).strip().lower().lstrip("/"),
        str(row.get("path", "")).strip().lower().lstrip("/"),
    ]
    if wanted in names:
        print(row.get("id", ""))
        break
' "$wanted"
}

admin_password="$(cat "${ADMIN_PASSWORD_FILE}")"

kcadm config credentials \
  --server http://localhost:8080 \
  --realm "${ADMIN_REALM}" \
  --user "${ADMIN_USER}" \
  --password "${admin_password}" >/dev/null

ensure_role() {
  local role="$1"
  if kcadm get "roles/${role}" -r "${REALM}" >/dev/null 2>&1; then
    echo "Role exists: ${role}"
    return
  fi
  kcadm create roles -r "${REALM}" -s "name=${role}" >/dev/null
  echo "Role created: ${role}"
}

group_id() {
  local group="$1"
  kcadm get groups -r "${REALM}" -q "search=${group}" | json_find_id_by_name "${group}"
}

ensure_group() {
  local group="$1"
  local id
  id="$(group_id "${group}")"
  if [[ -n "${id}" ]]; then
    echo "Group exists: ${group}"
    return
  fi
  kcadm create groups -r "${REALM}" -s "name=${group}" >/dev/null
  echo "Group created: ${group}"
}

add_group_role() {
  local group="$1"
  local role="$2"
  kcadm add-roles -r "${REALM}" --gname "${group}" --rolename "${role}" >/dev/null 2>&1 || true
}

user_id() {
  local username="$1"
  kcadm get users -r "${REALM}" -q "username=${username}" | json_find_id_by_name "${username}"
}

add_user_group() {
  local username="$1"
  local group="$2"
  local uid gid
  uid="$(user_id "${username}")"
  gid="$(group_id "${group}")"
  if [[ -z "${uid}" ]]; then
    echo "WARN: user not found, skipped group mapping: ${username} -> ${group}"
    return
  fi
  if [[ -z "${gid}" ]]; then
    echo "WARN: group not found, skipped user mapping: ${username} -> ${group}"
    return
  fi
  kcadm update "users/${uid}/groups/${gid}" -r "${REALM}" -s "realm=${REALM}" -s "userId=${uid}" -s "groupId=${gid}" -n >/dev/null 2>&1 || true
  echo "User group ensured: ${username} -> ${group}"
}

roles=(
  mam-super-admin
  mam-admin
  mam-admin-access
  mam-asset-delete
  mam-office-edit
  mam-metadata-edit
  mam-pdf-advanced
  mam-text-admin
  admin-access
  asset-delete
)

groups=(
  superadmin
  admin
  docadmin
  dokumancilar
  ocrtitle-admin
  yazicilar
  standard-users
)

for role in "${roles[@]}"; do
  ensure_role "${role}"
done

for group in "${groups[@]}"; do
  ensure_group "${group}"
done

for role in mam-super-admin mam-admin-access mam-asset-delete mam-office-edit mam-metadata-edit mam-pdf-advanced mam-text-admin admin-access asset-delete; do
  add_group_role superadmin "${role}"
done

for role in mam-admin-access mam-asset-delete mam-office-edit mam-metadata-edit mam-pdf-advanced admin-access asset-delete; do
  add_group_role admin "${role}"
done

for role in mam-office-edit mam-pdf-advanced; do
  add_group_role docadmin "${role}"
done

add_group_role ocrtitle-admin mam-text-admin

add_user_group "${MAM_ADMIN_USER}" superadmin
add_user_group "${MAM_TEXT_ADMIN_USER}" ocrtitle-admin
add_user_group "${MAM_TEXT_ADMIN_USER}" yazicilar

echo "Default Keycloak roles and groups are synchronized for realm: ${REALM}"
