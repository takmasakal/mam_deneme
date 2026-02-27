# Dalet-Like MAM MVP

A lightweight Media Asset Management starter app inspired by Dalet workflows.

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
   docker compose up --build
   ```
2. Open:
   `http://localhost:3000`

Compose starts:
- `postgres` on `localhost:5432` (persistent `pg_data` volume)
- `elasticsearch` on `localhost:9200` (persistent `es_data` volume)
- `keycloak` admin on `localhost:8081`
- `oauth2-proxy` on `localhost:3000` (protects `app` with Keycloak login)
- `app` is internal (project `./uploads` mounted to `/app/uploads`)

Useful commands:
```bash
docker compose down
docker compose down -v
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f elasticsearch
```

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
   - default admin: `admin / admin` (change in compose env vars for production)
3. Create realm: `mam`
4. Create client: `mam-web`
   - Protocol: `openid-connect`
   - Client authentication: `ON` (confidential client)
   - Valid redirect URI: `http://localhost:3000/oauth2/callback`
   - Web origins: `http://localhost:3000`
5. Copy generated client secret and set in compose env:
   - `OAUTH2_PROXY_CLIENT_SECRET`
6. Add LDAP user federation in Keycloak:
   - Realm `mam` -> User federation -> Add provider `ldap`
   - Enter your LDAP server URL, bind DN/password, user DN, and mapper settings
7. Restart auth proxy after secret/env changes:
   ```bash
   docker compose up -d oauth2-proxy
   ```

After this, open `http://localhost:3000`. You will be redirected to Keycloak login (which authenticates against LDAP once federation is configured).

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
