# MAM Project

A lightweight Media Asset Management starter app.

## Included features
- Asset ingest with file upload (video/audio/image)
- Automatic low-res proxy generation for uploaded videos (`ffmpeg`)
- Metadata editing
- Search/filter by text, tag, type, status
- Elasticsearch-backed query search with operators (`+term`, `-term`, quoted phrases)
- Asset table with resizable and hideable columns
- 3 main panels (Ingest/Assets/Detail) are hideable and resizable
- Workflow transitions (`Ingested -> QC -> Approved -> Published -> Archived`)
- Soft delete flow with Trash, Restore, and Permanent Delete
- Asset version history
- Collection API (basic)
- Browser dashboard
- Asset viewer (video player, audio player, image preview)
- Frame-by-frame stepping for video
- Video timecode display (`HH:MM:SS:FF`)
- `IN` / `OUT` cut buttons with segment duration preview
- Per-channel audio monitoring with grouped/individual channel listening
- Audio channel graph (toggle show/hide)

## Tech
- Node.js + Express
- PostgreSQL
- Vanilla HTML/CSS/JS frontend

## Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create PostgreSQL database (example):
   ```sql
   CREATE DATABASE mam_mvp;
   ```
3. Set database connection:
   ```bash
   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mam_mvp"
   ```
4. Ensure `ffmpeg` is installed and available in PATH (required for video proxy generation).
5. Start:
   ```bash
   npm start
   ```
6. Open:
   `http://localhost:3000`

## Run With Docker Compose
1. Start everything:
   ```bash
   ./scripts/up_latest_main.sh
   ```
2. Open:
   `http://localhost:3000`

`up_latest_main.sh` behavior:
- Fetches the current branch before starting, or `MAM_DEPLOY_BRANCH` when set.
- Prevents rebuilding an older checked-out revision by mistake.
- Starts the stack and lets Docker create the named PostgreSQL volume `mam_deneme_pg_data` automatically when missing.

First-time manual alternative:
```bash
docker compose build app oauth2-proxy
docker compose up -d
```

`up-fast.sh` behavior:
- Uses Docker layer cache in a multi-stage Dockerfile.
- Heavy OCR/ASR dependency layer is reused automatically when unchanged.
- Typical runs rebuild only app code layers (fast).

Compose starts:
- `postgres` on `localhost:5432` (persistent `pg_data` volume)
- `elasticsearch` on `localhost:9200` (persistent `es_data` volume)
- `keycloak` admin on `localhost:8081`
- `oauth2-proxy` on `localhost:3000` (protects `app` with Keycloak login)
- `app` is internal (project `./uploads` mounted to `/app/uploads`)

Office editor mode:
- Default is ONLYOFFICE mode: `OFFICE_EDITOR_PROVIDER=onlyoffice`.
- DOCX/XLSX/PPTX files are opened through ONLYOFFICE by default; document viewing does not silently fall back to extracted text or thumbnail previews.
- Raspberry Pi can use an offline read-only LibreOffice preview mode without running ONLYOFFICE:

  ```bash
  OFFICE_EDITOR_PROVIDER=libreoffice INSTALL_LIBREOFFICE=true docker compose -f docker-compose.rpi.yml up -d --build
  docker compose -f docker-compose.rpi.yml stop onlyoffice
  ```

  LibreOffice mode keeps the original Office file unchanged and generates a cached PDF preview under `uploads/previews/libreoffice`.
- Start normally with:
  ```bash
  docker compose up -d
  ```
- To return to lightweight mode:
  ```bash
  OFFICE_EDITOR_PROVIDER=none docker compose up -d
  docker compose stop onlyoffice
  ```

Useful commands:
```bash
docker compose down
docker compose down -v
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f elasticsearch
```

## Docker Hub Release (Multi-Arch, Media-Free)
This project now includes a release flow for:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM)

Image build context excludes local media/metadata paths via `.dockerignore` (`uploads/`, `data/`, `.env`, etc.).

1. Sign in to Docker Hub:
   ```bash
   docker login
   ```
2. (Optional) Build locally without push:
   ```bash
   PUSH=0 DOCKERHUB_NAMESPACE=takmasakal IMAGE_NAME=mam IMAGE_TAG=latest ./scripts/publish-dockerhub.sh
   ```
3. Verify image does not contain local media/data:
   ```bash
   ./scripts/verify-image-clean.sh takmasakal/mam:latest
   ```
4. Publish multi-arch image:
   ```bash
   DOCKERHUB_NAMESPACE=takmasakal IMAGE_NAME=mam IMAGE_TAG=latest ./scripts/publish-dockerhub.sh
   ```

## Quick Start (Docker + Keycloak)
Security note:
- Default passwords are not stored in Compose or `.env` files anymore.
- Run `./deploy/init.sh` first; generated secrets are stored under `deploy/secrets/`.
- See [Docker secrets documentation](docs/docker-secrets.md).

### EN
1. Start full stack:
   ```bash
   ./deploy/init.sh localhost
   docker compose up -d
   ```
2. Open MAM login: `http://localhost:3000`
3. Open Keycloak admin: `http://localhost:8081`
4. Login to Keycloak admin with username from `deploy/.env.easy` and password from `deploy/secrets/keycloak_admin_password`.
5. In Keycloak, create/select realm `mam`, then create user and set password:
   - Users -> Add user
   - Credentials -> Set password (`Temporary = OFF`)
6. (Optional) Assign roles:
   - `mam-admin-access`
   - `mam-asset-delete`
   - `mam-office-edit`
   - `mam-metadata-edit`
   - `mam-pdf-advanced`
7. Login to MAM with that user.

### TR
1. Tüm servisi başlat:
   ```bash
   ./deploy/init.sh localhost
   docker compose up -d
   ```
2. MAM giriş sayfasını aç: `http://localhost:3000`
3. Keycloak admin panelini aç: `http://localhost:8081`
4. Keycloak admin kullanıcı adı `deploy/.env.easy`, parola ise `deploy/secrets/keycloak_admin_password` içinden alınır.
5. Keycloak'ta `mam` realm'ini seç/oluştur, kullanıcı oluştur ve şifre ver:
   - Users -> Add user
   - Credentials -> Şifre belirle (`Temporary = OFF`)
6. (Opsiyonel) Rol ata:
   - `mam-admin-access`
   - `mam-asset-delete`
   - `mam-office-edit`
   - `mam-metadata-edit`
   - `mam-pdf-advanced`
7. Bu kullanıcı ile MAM'e giriş yap.

## One-Command VM Setup (Turnkey)
Use this when you want a ready stack (app + postgres + elasticsearch + keycloak + oauth2-proxy) with minimal manual Keycloak work.

1. Prepare generated non-secret env + Docker secrets (IP/domain optional):
   ```bash
   ./deploy/init.sh
   ```
   Optional explicit host:
   ```bash
   ./deploy/init.sh VM_IP_OR_DOMAIN
   ```
2. Start turnkey stack:
   ```bash
   docker compose up -d
   ```
3. Open:
   - MAM login: `http://<detected-host>:3000`
   - Keycloak admin: `http://<detected-host>:8081`

Generated default users in realm `mam`:
- `mamadmin` password: `deploy/secrets/mam_admin_password` (roles: `mam-admin-access`, `mam-asset-delete`)
- `mamuser` password: `deploy/secrets/mam_user_password`
- `yazici` password: `deploy/secrets/mam_text_admin_password` (role: `mam-text-admin`)

Note:
- Keycloak admin console username comes from `deploy/.env.easy` (`KEYCLOAK_ADMIN`); password comes from `deploy/secrets/keycloak_admin_password`.
- If you re-run `./deploy/init.sh`, weak/default secrets are rotated and `.env.easy` is rewritten without passwords.
- Full secret procedure: [docs/docker-secrets.md](docs/docker-secrets.md).

## Login + LDAP (Keycloak)
Keycloak is a good fit here because it gives you:
- A ready login page and MFA/session management
- LDAP/Active Directory federation
- OIDC tokens for app integration

This Compose setup uses:
- `keycloak` + `keycloak-postgres`
- `oauth2-proxy` in front of MAM app (so the app is not public without login)

### First-time setup
1. Start stack:
   ```bash
   docker compose up --build -d
   ```
2. Open Keycloak admin:
   - `http://localhost:8081`
   - username: `KEYCLOAK_ADMIN` from `deploy/.env.easy`
   - password: `deploy/secrets/keycloak_admin_password`
3. Create realm: `mam`
4. Create client: `mam-web`
   - Protocol: `openid-connect`
   - Client authentication: `ON` (confidential client)
   - Valid redirect URI: `http://localhost:3000/oauth2/callback`
   - Web origins: `http://localhost:3000`
5. Copy generated client secret into the Docker secret file if doing manual setup:
   - `deploy/secrets/oauth2_proxy_client_secret`
6. Add LDAP user federation in Keycloak:
   - Realm `mam` -> User federation -> Add provider `ldap`
   - Enter your LDAP server URL, bind DN/password, user DN, and mapper settings
7. Restart auth proxy after secret/env changes:
   ```bash
   docker compose up -d oauth2-proxy
   ```

After this, open `http://localhost:3000`. You will be redirected to Keycloak login (which authenticates against LDAP once federation is configured).

### Keycloak admin quick summary (EN)
Use this checklist when preparing a fresh Docker deployment:

1. Open admin console: `http://localhost:8081` and login with admin user.
2. Create/select realm `mam` (do not stay on `master` for app users).
3. Create or verify client `mam-web`:
   - Redirect URI: `http://localhost:3000/oauth2/callback`
   - Web origin: `http://localhost:3000`
4. Create roles (recommended):
   - `mam-admin-access` (admin page access)
   - `mam-asset-delete` (delete permission)
   - `mam-office-edit` (Office editing)
   - `mam-metadata-edit` (metadata editing)
   - `mam-pdf-advanced` (advanced PDF tools)
5. Create user:
   - Users -> Add user
   - Set username/email and save
   - Credentials -> Set password (turn Temporary OFF)
6. Assign roles to user:
   - Role mapping -> add needed roles (`mam-admin-access`, `mam-asset-delete`, `mam-office-edit`, `mam-metadata-edit`, `mam-pdf-advanced`, or basic user only)
7. (Optional) Configure LDAP:
   - User federation -> LDAP
   - Set LDAP URL, bind DN/password, users DN, and sync settings
8. Restart auth proxy if client secret/env changed:
   ```bash
   docker compose up -d oauth2-proxy
   ```
9. Test login from `http://localhost:3000`.

### Keycloak admin hızlı özet (TR)
Yeni bir Docker kurulumu için kısa kontrol listesi:

1. Admin panelini aç: `http://localhost:8081` ve admin hesabı ile giriş yap.
2. `mam` realm'ini oluştur/seç (`master` realm üzerinde uygulama kullanıcılarını yönetme).
3. `mam-web` client'ını oluştur veya doğrula:
   - Redirect URI: `http://localhost:3000/oauth2/callback`
   - Web origin: `http://localhost:3000`
4. Rolleri oluştur (önerilir):
   - `mam-admin-access` (yönetim sayfası erişimi)
   - `mam-asset-delete` (silme yetkisi)
   - `mam-office-edit` (Office düzenleme)
   - `mam-metadata-edit` (metadata düzenleme)
   - `mam-pdf-advanced` (gelişmiş PDF araçları)
5. Kullanıcı oluştur:
   - Users -> Add user
   - Kullanıcı adı/e-posta gir ve kaydet
   - Credentials -> Şifre belirle (Temporary kapalı)
6. Kullanıcıya rol ata:
   - Role mapping -> gerekli rolleri ekle (`mam-admin-access`, `mam-asset-delete`, `mam-office-edit`, `mam-metadata-edit`, `mam-pdf-advanced` veya sadece normal kullanıcı)
7. (Opsiyonel) LDAP bağla:
   - User federation -> LDAP
   - LDAP URL, bind DN/şifre, users DN ve senkron ayarlarını gir
8. Client secret/env değiştiyse auth proxy'yi yeniden başlat:
   ```bash
   docker compose up -d oauth2-proxy
   ```
9. `http://localhost:3000` üzerinden giriş testi yap.

## API quick reference
- `GET /api/workflow`
- `GET /api/assets?q=&tag=&type=&status=`
- `POST /api/admin/search/reindex`
- `POST /api/assets`
- `POST /api/assets/upload`
- `GET /api/assets/:id`
- `PATCH /api/assets/:id`
- `POST /api/assets/:id/versions`
- `POST /api/assets/:id/transition`
- `GET /api/collections`
- `POST /api/collections`

## Next improvements (production path)
- Real object storage (S3/MinIO) and proxy streaming
- PostgreSQL + full-text search (or Elasticsearch/OpenSearch)
- AuthN/AuthZ (SSO, RBAC)
- Proxy/transcode jobs and QC integrations
- Audit trail, soft-delete, retention policies
- Kafka/event bus for newsroom/planning integration

## Safe update

To avoid accidentally building an older Git checkout, use:

```bash
./scripts/up_latest_main.sh
```

This script fetches the current branch, fast-forwards it from `origin`, then starts the existing stack. Set `MAM_DEPLOY_BRANCH` to deploy a specific branch.
