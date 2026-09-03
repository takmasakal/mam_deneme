#!/usr/bin/env bash
set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}" || exit 1

ENV_FILE="${ENV_FILE:-deploy/.env.kaisha}"
BASE_URL="${BASE_URL:-https://belgelik.trt.net.tr}"
AUTH_URL="${AUTH_URL:-https://authbelgelik.trt.net.tr}"
OFFICE_URL="${OFFICE_URL:-https://officebelgelik.trt.net.tr}"
DIRECT_APP_URL="${DIRECT_APP_URL:-http://127.0.0.1:3000}"
DIRECT_OFFICE_URL="${DIRECT_OFFICE_URL:-http://127.0.0.1:8082}"
DIRECT_KEYCLOAK_URL="${DIRECT_KEYCLOAK_URL:-http://127.0.0.1:8081}"
ELASTIC_URL="${ELASTIC_URL:-http://127.0.0.1:9200}"
REPORT_DIR="${REPORT_DIR:-deploy/reports}"
TIMING_RUNS="${TIMING_RUNS:-5}"
LOG_TAIL="${LOG_TAIL:-160}"
API_TOKEN="${MAM_API_TOKEN:-${API_TOKEN:-}}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${REPORT_DIR}/kaisha-health-${STAMP}"
REPORT="${OUT_DIR}/report.md"
RAW_DIR="${OUT_DIR}/raw"

mkdir -p "${RAW_DIR}"

pass_count=0
warn_count=0
fail_count=0
skip_count=0

section() {
  printf '\n## %s\n\n' "$1" >> "${REPORT}"
}

subsection() {
  printf '\n### %s\n\n' "$1" >> "${REPORT}"
}

code_block() {
  local file="$1"
  printf '```text\n' >> "${REPORT}"
  if [[ -s "${file}" ]]; then
    sed -e 's/\x1b\[[0-9;]*m//g' "${file}" >> "${REPORT}"
  else
    printf '(empty)\n' >> "${REPORT}"
  fi
  printf '```\n\n' >> "${REPORT}"
}

record() {
  local level="$1"
  local title="$2"
  local detail="${3:-}"
  case "${level}" in
    PASS) pass_count=$((pass_count + 1)) ;;
    WARN) warn_count=$((warn_count + 1)) ;;
    FAIL) fail_count=$((fail_count + 1)) ;;
    SKIP) skip_count=$((skip_count + 1)) ;;
  esac
  printf -- '- **%s** %s' "${level}" "${title}" >> "${REPORT}"
  if [[ -n "${detail}" ]]; then
    printf ' - %s' "${detail}" >> "${REPORT}"
  fi
  printf '\n' >> "${REPORT}"
}

run_capture() {
  local name="$1"
  shift
  local file="${RAW_DIR}/${name}.txt"
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@"
  } >"${file}" 2>&1
  local rc=$?
  printf '%s' "${file}"
  return "${rc}"
}

run_shell_capture() {
  local name="$1"
  local script="$2"
  local file="${RAW_DIR}/${name}.txt"
  {
    printf '$ bash -lc %q\n\n' "${script}"
    bash -lc "${script}"
  } >"${file}" 2>&1
  local rc=$?
  printf '%s' "${file}"
  return "${rc}"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

docker_ok() {
  docker info >/dev/null 2>&1
}

iso_now() {
  date -Is 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z'
}

compose_cmd=(docker compose --env-file "${ENV_FILE}" -f docker-compose.yml -f docker-compose.kaisha.yml)

curl_headers=()
if [[ -n "${API_TOKEN}" ]]; then
  curl_headers=(-H "X-API-Token: ${API_TOKEN}")
fi

curl_timing() {
  local name="$1"
  local url="$2"
  local file="${RAW_DIR}/curl-${name}.txt"
  {
    printf 'URL=%s\n' "${url}"
    if [[ -n "${API_TOKEN}" ]]; then
      curl -k -sS -L -o /tmp/kaisha-health-body-"${name}".tmp \
        -w 'status=%{http_code} total=%{time_total}s dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s starttransfer=%{time_starttransfer}s size=%{size_download} redirect=%{time_redirect}s\n' \
        "${curl_headers[@]}" \
        "${url}"
    else
      curl -k -sS -L -o /tmp/kaisha-health-body-"${name}".tmp \
        -w 'status=%{http_code} total=%{time_total}s dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s starttransfer=%{time_starttransfer}s size=%{size_download} redirect=%{time_redirect}s\n' \
        "${url}"
    fi
    printf '\n--- body head ---\n'
    head -c 1600 /tmp/kaisha-health-body-"${name}".tmp 2>/dev/null || true
    printf '\n'
  } >"${file}" 2>&1
  printf '%s' "${file}"
}

json_value() {
  local file="$1"
  local expr="$2"
  if have jq; then
    jq -r "${expr}" "${file}" 2>/dev/null
  else
    printf ''
  fi
}

cat > "${REPORT}" <<EOF
# Kaisha / Belgelik Sağlık ve Performans Raporu

- Tarih: $(iso_now)
- Host: $(hostname 2>/dev/null || echo unknown)
- Çalışma dizini: ${ROOT_DIR}
- Base URL: ${BASE_URL}
- Direct app URL: ${DIRECT_APP_URL}
- API token: $(if [[ -n "${API_TOKEN}" ]]; then echo "var"; else echo "yok"; fi)

EOF

section "Özet"
record "PASS" "Rapor dizini oluşturuldu" "${OUT_DIR}"

section "Host Kaynakları"
file="$(run_shell_capture host-basics 'date; uptime; uname -a; printf "\n--- memory ---\n"; free -h 2>/dev/null || vm_stat 2>/dev/null || true; printf "\n--- disk ---\n"; df -h / /tmp . 2>/dev/null || df -h; printf "\n--- load/process ---\n"; ps -eo pid,ppid,stat,pcpu,pmem,comm 2>/dev/null | sort -k4 -nr | head -20 || true')"
code_block "${file}"

if have vmstat; then
  file="$(run_shell_capture vmstat 'vmstat 1 5')"
  subsection "vmstat"
  code_block "${file}"
else
  record "SKIP" "vmstat bulunamadı"
fi

if have iostat; then
  file="$(run_shell_capture iostat 'iostat -xz 1 3')"
  subsection "iostat"
  code_block "${file}"
else
  record "SKIP" "iostat bulunamadı"
fi

section "Docker ve Compose"
if docker_ok; then
  record "PASS" "Docker daemon erişilebilir"
  file="$(run_capture docker-ps docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}')"
  code_block "${file}"

  file="$(run_capture docker-stats docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}')"
  code_block "${file}"

  file="$(run_capture compose-ps "${compose_cmd[@]}" ps)"
  code_block "${file}"

  if "${compose_cmd[@]}" config >"${RAW_DIR}/compose-config.yml" 2>"${RAW_DIR}/compose-config.err"; then
    record "PASS" "Compose config render edildi" "${RAW_DIR}/compose-config.yml"
  else
    record "FAIL" "Compose config render edilemedi" "${RAW_DIR}/compose-config.err"
    code_block "${RAW_DIR}/compose-config.err"
  fi
else
  record "FAIL" "Docker daemon erişilemiyor"
fi

section "Container Sağlığı"
expected_containers=(
  kaisha-oauth2-proxy
  kaisha-app
  kaisha-onlyoffice
  kaisha-elasticsearch
  kaisha-keycloak
  kaisha-postgres
  kaisha-keycloak-postgres
)

if docker_ok; then
  for c in "${expected_containers[@]}"; do
    inspect_file="${RAW_DIR}/inspect-${c}.json"
    if docker inspect "${c}" >"${inspect_file}" 2>"${RAW_DIR}/inspect-${c}.err"; then
      status="$(docker inspect -f '{{.State.Status}}' "${c}" 2>/dev/null || echo unknown)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${c}" 2>/dev/null || echo unknown)"
      if [[ "${status}" == "running" && "${health}" != "unhealthy" ]]; then
        record "PASS" "${c}" "status=${status}, health=${health}"
      else
        record "FAIL" "${c}" "status=${status}, health=${health}"
      fi
    else
      record "FAIL" "${c}" "container bulunamadı"
      code_block "${RAW_DIR}/inspect-${c}.err"
    fi
  done
fi

section "HTTP Health ve Yanıt Süreleri"
endpoints=(
  "public-root|${BASE_URL}/"
  "public-health|${BASE_URL}/api/health"
  "direct-health|${DIRECT_APP_URL}/api/health"
  "public-ui-settings|${BASE_URL}/api/ui-settings"
  "public-workflow|${BASE_URL}/api/workflow"
  "public-assets-page1|${BASE_URL}/api/assets?limit=20&offset=0"
  "public-assets-page2|${BASE_URL}/api/assets?limit=20&offset=20"
  "search-q-istanbul|${BASE_URL}/api/assets?limit=20&offset=0&q=istanbul"
  "search-ocr-istanbul|${BASE_URL}/api/assets?limit=20&offset=0&ocr=istanbul"
  "search-subtitle-istanbul|${BASE_URL}/api/assets?limit=20&offset=0&subtitle=istanbul"
  "search-tag-istanbul|${BASE_URL}/api/assets?limit=20&offset=0&tag=istanbul"
  "search-clip-istanbul|${BASE_URL}/api/assets?limit=20&offset=0&clip=istanbul"
)

if [[ -z "${API_TOKEN}" ]]; then
  record "WARN" "API token verilmedi" "Auth gereken endpointler 401 dönebilir. MAM_API_TOKEN ile tekrar çalıştır."
fi

for item in "${endpoints[@]}"; do
  name="${item%%|*}"
  url="${item#*|}"
  file="$(curl_timing "${name}" "${url}")"
  line="$(grep -E '^status=' "${file}" | tail -1 || true)"
  status="$(printf '%s' "${line}" | sed -n 's/^status=\([0-9][0-9][0-9]\).*/\1/p')"
  total="$(printf '%s' "${line}" | sed -n 's/.*total=\([^ ]*\).*/\1/p')"
  if [[ "${status}" =~ ^(2|3) ]]; then
    record "PASS" "${name}" "status=${status}, total=${total}"
  elif [[ "${status}" == "401" || "${status}" == "403" ]]; then
    record "WARN" "${name}" "status=${status}, total=${total}"
  else
    record "FAIL" "${name}" "status=${status:-unknown}, total=${total:-unknown}"
  fi
  code_block "${file}"
done

section "Tekrarlı Assets Performans Ölçümü"
assets_perf="${RAW_DIR}/assets-repeat.txt"
{
  printf 'Runs: %s\n' "${TIMING_RUNS}"
  for i in $(seq 1 "${TIMING_RUNS}"); do
    if [[ -n "${API_TOKEN}" ]]; then
      curl -k -sS -L -o /tmp/kaisha-assets-repeat.json \
        -w "run=${i} status=%{http_code} total=%{time_total}s starttransfer=%{time_starttransfer}s size=%{size_download}\n" \
        "${curl_headers[@]}" \
        "${BASE_URL}/api/assets?limit=20&offset=0"
    else
      curl -k -sS -L -o /tmp/kaisha-assets-repeat.json \
        -w "run=${i} status=%{http_code} total=%{time_total}s starttransfer=%{time_starttransfer}s size=%{size_download}\n" \
        "${BASE_URL}/api/assets?limit=20&offset=0"
    fi
  done
} >"${assets_perf}" 2>&1
code_block "${assets_perf}"

section "PostgreSQL"
if docker_ok && docker ps --format '{{.Names}}' | grep -qx kaisha-postgres; then
  pg_script='
set -u
psql -U postgres -d mam_mvp -v ON_ERROR_STOP=0 <<SQL
\timing on
SELECT now() AS db_now, current_database() AS db, pg_size_pretty(pg_database_size(current_database())) AS db_size;
SELECT count(*) AS asset_count FROM assets;
SELECT type, count(*) AS count FROM assets GROUP BY type ORDER BY count DESC, type;
SELECT status, count(*) AS count FROM media_processing_jobs GROUP BY status ORDER BY count DESC, status;
SELECT job_type, status, count(*) AS count FROM media_processing_jobs GROUP BY job_type, status ORDER BY job_type, status;
SELECT pid, now() - query_start AS age, state, wait_event_type, wait_event, left(query, 220) AS query
FROM pg_stat_activity
WHERE state <> '\''idle'\''
ORDER BY age DESC
LIMIT 20;
SELECT schemaname, relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
SQL
'
  file="$(run_capture postgres-summary docker exec kaisha-postgres bash -lc "${pg_script}")"
  code_block "${file}"
else
  record "FAIL" "kaisha-postgres çalışmıyor veya Docker erişilemiyor"
fi

section "Elasticsearch"
file="$(curl_timing elastic-health "${ELASTIC_URL}/_cluster/health?pretty")"
code_block "${file}"
file="$(curl_timing elastic-indices "${ELASTIC_URL}/_cat/indices?v")"
code_block "${file}"
file="$(curl_timing elastic-assets-search "${ELASTIC_URL}/mam_assets/_search?size=0&pretty")"
code_block "${file}"

section "OnlyOffice"
file="$(curl_timing office-root "${DIRECT_OFFICE_URL}/")"
code_block "${file}"
file="$(curl_timing office-api-js "${DIRECT_OFFICE_URL}/web-apps/apps/api/documents/api.js")"
code_block "${file}"
if docker_ok && docker ps --format '{{.Names}}' | grep -qx kaisha-onlyoffice; then
  file="$(run_capture onlyoffice-internal docker exec kaisha-onlyoffice bash -lc 'echo "PATH=$PATH"; for d in /usr/local/sbin /usr/local/bin /usr/sbin /usr/bin /sbin /bin /etc/ssl/private; do ls -ld "$d" 2>/dev/null || true; done; ls -l /etc/ssl/private/ssl-cert-snakeoil.key 2>/dev/null || true; pg_lsclusters || true; service postgresql status || true; ss -ltnp | grep -E ":5432|:80|:8000" || true')"
  code_block "${file}"
  file="$(run_capture onlyoffice-logs docker logs --tail "${LOG_TAIL}" kaisha-onlyoffice)"
  code_block "${file}"
else
  record "FAIL" "kaisha-onlyoffice çalışmıyor veya Docker erişilemiyor"
fi

section "Keycloak ve OAuth2 Proxy"
file="$(curl_timing keycloak-public "${AUTH_URL}/realms/mam/.well-known/openid-configuration")"
code_block "${file}"
file="$(curl_timing keycloak-direct "${DIRECT_KEYCLOAK_URL}/realms/mam/.well-known/openid-configuration")"
code_block "${file}"
if docker_ok; then
  file="$(run_capture oauth-env docker exec kaisha-oauth2-proxy printenv)"
  subsection "oauth2-proxy env"
  grep -E '^(OAUTH2_PROXY_|KEYCLOAK_|KC_|PUBLIC_)' "${file}" >"${RAW_DIR}/oauth-env-filtered.txt" 2>/dev/null || true
  code_block "${RAW_DIR}/oauth-env-filtered.txt"
  file="$(run_capture oauth-logs docker logs --tail "${LOG_TAIL}" kaisha-oauth2-proxy)"
  grep -Ei 'csrf|callback|invalid_grant|invalid token issuer|unable to refresh|/api/me|/api/logout-url|401|403|error|expired|session' "${file}" >"${RAW_DIR}/oauth-logs-filtered.txt" 2>/dev/null || true
  code_block "${RAW_DIR}/oauth-logs-filtered.txt"
  file="$(run_capture keycloak-logs docker logs --tail "${LOG_TAIL}" kaisha-keycloak)"
  grep -Ei 'error|warn|ldap|federation|login|token|timeout|exception' "${file}" >"${RAW_DIR}/keycloak-logs-filtered.txt" 2>/dev/null || true
  code_block "${RAW_DIR}/keycloak-logs-filtered.txt"
fi

section "Uygulama Logları"
if docker_ok; then
  file="$(run_capture app-logs docker logs --tail "${LOG_TAIL}" kaisha-app)"
  grep -Ei 'error|warn|failed|timeout|video-ocr|subtitle|metadata|ffmpeg|health|unknown' "${file}" >"${RAW_DIR}/app-logs-filtered.txt" 2>/dev/null || true
  code_block "${RAW_DIR}/app-logs-filtered.txt"
fi

section "Nginx"
if have nginx; then
  file="$(run_shell_capture nginx-version 'nginx -v')"
  code_block "${file}"
else
  record "SKIP" "nginx komutu mevcut kullanıcı PATH içinde yok"
fi

if have sudo && sudo -n true >/dev/null 2>&1; then
  file="$(run_shell_capture nginx-config 'sudo nginx -T 2>/dev/null | grep -n -B8 -A12 -Ei "server_name belgelik|server_name authbelgelik|server_name officebelgelik|client_max_body_size|proxy_request_buffering|belgelik-maintenance"')"
  code_block "${file}"
  if [[ -f /var/log/nginx/access.log ]]; then
    file="$(run_shell_capture nginx-access 'sudo tail -n 500 /var/log/nginx/access.log | grep -Ei "/api/health|/api/assets|/api/me|/onlyoffice|401|403|499|500|502|503|504" | tail -120')"
    code_block "${file}"
  fi
else
  record "SKIP" "sudo parolasız kullanılamıyor" "Nginx config/access log bölümü atlandı."
fi

section "Admin API Sağlık Endpointleri"
if [[ -n "${API_TOKEN}" ]]; then
  admin_endpoints=(
    "admin-system-health|${BASE_URL}/api/admin/system-health?refresh=1&mediaJobDays=5"
    "admin-ffmpeg-health|${BASE_URL}/api/admin/ffmpeg-health"
    "admin-runtime-diagnostics|${BASE_URL}/api/admin/runtime-diagnostics?limit=100"
  )
  for item in "${admin_endpoints[@]}"; do
    name="${item%%|*}"
    url="${item#*|}"
    file="$(curl_timing "${name}" "${url}")"
    code_block "${file}"
  done
else
  record "SKIP" "Admin API ölçümü atlandı" "MAM_API_TOKEN verilmedi."
fi

section "Sonuç"
cat >> "${REPORT}" <<EOF

- PASS: ${pass_count}
- WARN: ${warn_count}
- FAIL: ${fail_count}
- SKIP: ${skip_count}

Ham çıktılar:

\`\`\`text
${RAW_DIR}
\`\`\`

EOF

printf 'Report written: %s\n' "${REPORT}"
printf 'Raw outputs: %s\n' "${RAW_DIR}"
printf 'Summary: PASS=%s WARN=%s FAIL=%s SKIP=%s\n' "${pass_count}" "${warn_count}" "${fail_count}" "${skip_count}"

if [[ "${fail_count}" -gt 0 ]]; then
  exit 1
fi
