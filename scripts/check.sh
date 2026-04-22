#!/usr/bin/env sh
set -eu

node --check src/server.js
node --check src/routes/office.js
node --check src/routes/pdf.js
node --check src/services/officeService.js
node --check src/services/searchService.js
node --check src/services/mediaJobs.js
node --check src/utils/files.js
node --check public/main.js
node --check public/admin.js

docker compose config >/tmp/mam_deneme_compose_check.yml
PUBLIC_HOST=127.0.0.1 docker compose -f docker-compose.rpi.yml config >/tmp/mam_deneme_rpi_compose_check.yml
