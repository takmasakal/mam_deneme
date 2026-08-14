#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WEB_ROOT="${BELGELIK_MAINTENANCE_WEB_ROOT:-/var/www/belgelik-maintenance}"
NGINX_SNIPPET_DIR="${BELGELIK_NGINX_SNIPPET_DIR:-/etc/nginx/snippets}"
FLAG_FILE="${WEB_ROOT}/MAINTENANCE_ON"
APP_CONTAINER="${BELGELIK_APP_CONTAINER:-kaisha-app}"
HEALTH_URL="${BELGELIK_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_TIMEOUT="${BELGELIK_HEALTH_TIMEOUT:-300}"

detect_docker_cmd() {
  if docker info >/dev/null 2>&1; then echo docker; return; fi
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then echo "sudo docker"; return; fi
  echo ""
}

DOCKER_CMD="${DOCKER_CMD:-$(detect_docker_cmd)}"

run_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

reload_nginx() {
  run_root nginx -t
  run_root nginx -s reload
}

install_assets() {
  run_root mkdir -p "${WEB_ROOT}" "${NGINX_SNIPPET_DIR}"
  run_root cp "${ROOT_DIR}/deploy/maintenance/maintenance.html" "${WEB_ROOT}/maintenance.html"
  run_root cp "${ROOT_DIR}/deploy/maintenance/belgelik-maintenance.png" "${WEB_ROOT}/belgelik-maintenance.png"
  run_root cp "${ROOT_DIR}/deploy/nginx/belgelik-maintenance-server.conf" "${NGINX_SNIPPET_DIR}/belgelik-maintenance-server.conf"
  run_root cp "${ROOT_DIR}/deploy/nginx/belgelik-maintenance-location.conf" "${NGINX_SNIPPET_DIR}/belgelik-maintenance-location.conf"
  echo "Installed maintenance assets to ${WEB_ROOT}"
  echo "Installed Nginx snippets to ${NGINX_SNIPPET_DIR}"
  echo
  echo "Add these includes to the existing belgelik.trt.net.tr server config once:"
  echo "  server { include ${NGINX_SNIPPET_DIR}/belgelik-maintenance-server.conf; ... }"
  echo "  location / { include ${NGINX_SNIPPET_DIR}/belgelik-maintenance-location.conf; proxy_pass ...; }"
}

enable_maintenance() {
  install_assets
  run_root touch "${FLAG_FILE}"
  reload_nginx
  echo "Belgelik maintenance mode is ON."
}

disable_maintenance() {
  run_root rm -f "${FLAG_FILE}"
  reload_nginx
  echo "Belgelik maintenance mode is OFF."
}

status_maintenance() {
  if [[ -f "${FLAG_FILE}" ]]; then
    echo "ON"
  else
    echo "OFF"
  fi
}

wait_health() {
  if [[ -z "${DOCKER_CMD}" ]]; then
    echo "Docker daemon is not reachable. Cannot verify ${APP_CONTAINER} health."
    return 1
  fi

  local start now state body ok
  start="$(date +%s)"
  while true; do
    state="$(${DOCKER_CMD} inspect -f '{{.State.Status}}' "${APP_CONTAINER}" 2>/dev/null || true)"
    if [[ "${state}" == "running" ]]; then
      body="$(${DOCKER_CMD} exec "${APP_CONTAINER}" node -e "fetch('${HEALTH_URL}').then(async r => { const t = await r.text(); console.log(JSON.stringify({status:r.status, body:t})); }).catch(e => { console.error(e.message); process.exit(2); })" 2>/dev/null || true)"
      ok="$(printf '%s' "${body}" | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{try{const x=JSON.parse(s); const b=JSON.parse(x.body||'{}'); process.stdout.write(String(x.status===200 && b.ok===true));}catch{process.stdout.write('false')}})" 2>/dev/null || true)"
      if [[ "${ok}" == "true" ]]; then
        echo "Belgelik app is healthy: ${HEALTH_URL}"
        return 0
      fi
    fi

    now="$(date +%s)"
    if (( now - start >= HEALTH_TIMEOUT )); then
      echo "Timed out waiting for healthy Belgelik app. Container state: ${state:-missing}"
      return 1
    fi
    sleep 3
  done
}

with_maintenance() {
  if [[ "$#" -lt 1 ]]; then
    echo "Usage: $0 with-maintenance -- command [args...]"
    return 2
  fi
  if [[ "${1:-}" == "--" ]]; then shift; fi
  enable_maintenance
  if ! "$@"; then
    echo "Deployment command failed. Maintenance mode remains ON."
    return 1
  fi
  if wait_health; then
    disable_maintenance
  else
    echo "Health check failed. Maintenance mode remains ON."
    return 1
  fi
}

usage() {
  cat <<'EOF'
Usage:
  ./deploy/belgelik-maintenance.sh install
  ./deploy/belgelik-maintenance.sh on
  ./deploy/belgelik-maintenance.sh off
  ./deploy/belgelik-maintenance.sh status
  ./deploy/belgelik-maintenance.sh wait-health
  ./deploy/belgelik-maintenance.sh with-maintenance -- ./deploy/mam-kaisha.sh restart

Environment overrides:
  BELGELIK_MAINTENANCE_WEB_ROOT=/var/www/belgelik-maintenance
  BELGELIK_NGINX_SNIPPET_DIR=/etc/nginx/snippets
  BELGELIK_APP_CONTAINER=kaisha-app
  BELGELIK_HEALTH_URL=http://127.0.0.1:3000/api/health
  BELGELIK_HEALTH_TIMEOUT=300
EOF
}

case "${1:-}" in
  install) install_assets ;;
  on|enable) enable_maintenance ;;
  off|disable) disable_maintenance ;;
  status) status_maintenance ;;
  wait-health) wait_health ;;
  with-maintenance) shift; with_maintenance "$@" ;;
  ""|-h|--help|help) usage ;;
  *)
    echo "Unknown command: ${1:-}"
    usage
    exit 2
    ;;
esac
