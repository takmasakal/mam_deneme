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

escape_sed_file() {
  sed -e 's/[\/&]/\\&/g' "$1"
}

export KC_DB_PASSWORD="$(read_secret /run/secrets/keycloak_db_password)"
export KEYCLOAK_ADMIN_PASSWORD="$(read_secret /run/secrets/keycloak_admin_password)"

template_path="/opt/keycloak/mam-realm.template.json"
import_dir="/opt/keycloak/data/import"
import_path="${import_dir}/mam-realm.json"

if [ -f "$template_path" ]; then
  mkdir -p "$import_dir"
  client_secret="$(escape_sed_file /run/secrets/oauth2_proxy_client_secret)"
  mam_admin_password="$(escape_sed_file /run/secrets/mam_admin_password)"
  mam_user_password="$(escape_sed_file /run/secrets/mam_user_password)"
  mam_text_admin_password="$(escape_sed_file /run/secrets/mam_text_admin_password)"
  public_host_escaped="$(printf '%s' "${PUBLIC_HOST:-localhost}" | sed -e 's/[\/&]/\\&/g')"
  mam_admin_user_escaped="$(printf '%s' "${MAM_ADMIN_USER:-mamadmin}" | sed -e 's/[\/&]/\\&/g')"
  mam_user_escaped="$(printf '%s' "${MAM_USER:-mamuser}" | sed -e 's/[\/&]/\\&/g')"
  mam_text_admin_user_escaped="$(printf '%s' "${MAM_TEXT_ADMIN_USER:-yazici}" | sed -e 's/[\/&]/\\&/g')"

  sed \
    -e "s|__PUBLIC_HOST__|${public_host_escaped}|g" \
    -e "s|__CLIENT_SECRET__|${client_secret}|g" \
    -e "s|__MAM_ADMIN_USER__|${mam_admin_user_escaped}|g" \
    -e "s|__MAM_ADMIN_PASSWORD__|${mam_admin_password}|g" \
    -e "s|__MAM_USER__|${mam_user_escaped}|g" \
    -e "s|__MAM_USER_PASSWORD__|${mam_user_password}|g" \
    -e "s|__MAM_TEXT_ADMIN_USER__|${mam_text_admin_user_escaped}|g" \
    -e "s|__MAM_TEXT_ADMIN_PASSWORD__|${mam_text_admin_password}|g" \
    "$template_path" > "$import_path"
fi

exec /opt/keycloak/bin/kc.sh "$@"
