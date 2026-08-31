# MetMAM Database ERD

Kaynak: [src/db.js](/Users/erinc/OyunAlanım/mam_deneme/src/db.js)

Bu doküman mevcut PostgreSQL şemasının okunabilir ER diagramıdır. Canlı Docker veritabanına erişim olmadığında `src/db.js` içindeki `initDb()` tanımı kaynak alınmıştır. Profesyonel kullanımda kaynak gerçek veritabanı introspection çıktısı veya migration dosyaları olmalıdır; elle çizilen diagramlar zamanla hızla eskir.

## Core ERD

```mermaid
erDiagram
  assets ||--o{ asset_versions : versions
  assets ||--o{ asset_cuts : cuts
  assets ||--o{ asset_subtitle_cues : subtitles
  assets ||--o{ asset_ocr_segments : ocr
  assets ||--o{ media_processing_jobs : jobs
  assets ||--o| asset_edit_locks : lock

  assets {
    text id PK
    text title
    text description
    text type
    text_array tags
    text owner
    integer duration_seconds
    text source_path
    text media_url
    text proxy_url
    text proxy_status
    text thumbnail_url
    text file_name
    text mime_type
    jsonb dc_metadata
    text file_hash
    text status
    text visibility
    text owner_user
    text_array owner_groups
    text_array allowed_users
    text_array allowed_groups
    text_array denied_users
    text_array denied_groups
    text_array edit_allowed_users
    text_array edit_allowed_groups
    text_array edit_denied_users
    text_array edit_denied_groups
    text_array download_allowed_users
    text_array download_allowed_groups
    text_array download_denied_users
    text_array download_denied_groups
    timestamptz deleted_at
    timestamptz created_at
    timestamptz updated_at
  }

  asset_versions {
    text version_id PK
    text asset_id FK
    text label
    text note
    text snapshot_media_url
    text snapshot_source_path
    text snapshot_file_name
    text snapshot_mime_type
    text snapshot_thumbnail_url
    text actor_username
    text action_type
    text restored_from_version_id
    timestamptz created_at
  }

  asset_cuts {
    text cut_id PK
    text asset_id FK
    text label
    double in_point_seconds
    double out_point_seconds
    timestamptz created_at
  }

  asset_subtitle_cues {
    text asset_id PK,FK
    text subtitle_url
    integer seq PK
    double start_sec
    double end_sec
    text cue_text
    text norm_text
    double confidence
    text source_engine
    text lang
    timestamptz created_at
  }

  asset_ocr_segments {
    text asset_id PK,FK
    text ocr_url PK
    integer seq PK
    double start_sec
    double end_sec
    text segment_text
    text norm_text
    double confidence
    text source_engine
    text lang
    timestamptz created_at
  }

  media_processing_jobs {
    text job_id PK
    text asset_id FK
    text job_type
    text status
    jsonb request_payload
    jsonb result_payload
    text error_text
    integer progress
    timestamptz created_at
    timestamptz updated_at
    timestamptz started_at
    timestamptz finished_at
  }

  asset_edit_locks {
    text asset_id PK,FK
    text lock_id
    text locked_by
    text locked_by_name
    text purpose
    timestamptz created_at
    timestamptz updated_at
    timestamptz expires_at
  }
```

## Authorization And Settings

```mermaid
erDiagram
  asset_type_access {
    text type_group PK
    text visibility
    text_array owner_groups
    text_array allowed_users
    text_array allowed_groups
    text_array denied_users
    text_array denied_groups
    text_array edit_allowed_users
    text_array edit_allowed_groups
    text_array edit_denied_users
    text_array edit_denied_groups
    text_array download_allowed_users
    text_array download_allowed_groups
    text_array download_denied_users
    text_array download_denied_groups
    text_array upload_allowed_users
    text_array upload_allowed_groups
    text_array upload_denied_users
    text_array upload_denied_groups
    timestamptz updated_at
    text updated_by
  }

  group_admins {
    text id PK
    text group_name
    text username
    text_array admin_scopes
    text_array asset_type_groups
    timestamptz created_at
    text created_by
  }

  admin_settings {
    text key PK
    jsonb value
    timestamptz updated_at
  }

  user_preferences {
    text username PK
    text key PK
    jsonb value
    timestamptz updated_at
  }

  audit_events {
    text id PK
    timestamptz created_at
    text actor
    text action
    text target_type
    text target_id
    text target_title
    text client_medium
    jsonb details
    text ip
    text user_agent
  }

  collections {
    text id PK
    text name
    text_array asset_ids
    timestamptz created_at
    timestamptz updated_at
  }

  learned_turkish_corrections {
    text wrong_key PK
    text wrong
    text correct
    timestamptz created_at
    timestamptz updated_at
  }
```

## Notable Design Notes

- `assets` uygulamanın merkez tablosudur; medya dosyası, görünürlük, sahiplik, indirme/düzenleme izinleri ve Dublin Core metadata aynı satırdadır.
- `asset_versions`, `asset_cuts`, `asset_subtitle_cues`, `asset_ocr_segments`, `media_processing_jobs` ve `asset_edit_locks` gerçek FK ile `assets(id)` alanına bağlıdır ve `ON DELETE CASCADE` kullanır.
- `collections.asset_ids` FK olmayan `TEXT[]` tutar. Profesyonel ilişkisel modelde bunun yerine `collection_assets(collection_id, asset_id)` gibi join table daha doğru olur.
- Yetki tabloları Keycloak kullanıcı/grup adlarını `TEXT` veya `TEXT[]` olarak tutar; Keycloak tarafına FK yoktur.
- `admin_settings`, `user_preferences`, `audit_events.details`, `media_processing_jobs.request_payload/result_payload` JSONB olduğu için esnek ama şema dışı veri taşır. Bu alanların formatı kod ve dokümantasyonla korunmalıdır.
- Arama performansı için `pg_trgm` extension ve GIN/trigram indexleri kullanılır.

## Important Indexes

- `assets`: `updated_at`, `deleted_at + updated_at`, `status`, `type`, `visibility`, `owner_user`, `file_hash`
- `assets`: `owner_groups`, `allowed_users`, `allowed_groups`, `download_allowed_users`, `download_allowed_groups`, `tags` için GIN index
- `assets`: `title`, `file_name`, `owner`, normalize edilmiş `title/file_name/owner/description` için trigram index
- `asset_cuts`: `asset_id + created_at`, normalize edilmiş `label` trigram index
- `asset_subtitle_cues`: `asset_id`, `asset_id + subtitle_url`, `asset_id + subtitle_url + start_sec`, `norm_text`, `norm_text` trigram
- `asset_ocr_segments`: `asset_id`, `asset_id + ocr_url`, `asset_id + ocr_url + start_sec`, `norm_text`, `norm_text` trigram
- `media_processing_jobs`: `asset_id + job_type + updated_at`, `status`, `updated_at`
- `audit_events`: `created_at`, `action`, `actor`, `client_medium`, `target_type + target_id`

## Professional Workflow

Profesyonel yaklaşımda diagram elle çizilmez; şema kaynağından otomatik üretilir.

1. Kaynak belirlenir:
   - En iyisi migration dosyalarıdır.
   - Migration yoksa canlı PostgreSQL introspection kullanılır.
   - Bu projede tablo yaratımı `src/db.js` içindeki `initDb()` fonksiyonunda olduğu için mevcut doküman buradan çıkarılmıştır.

2. Diagram formatı seçilir:
   - `Mermaid ERD`: GitHub ve Markdown içinde hızlı okunur.
   - `DBML`: dbdiagram.io gibi araçlarda daha iyi görsel çıktı verir.
   - `Graphviz`: büyük şemalarda otomatik layout için güçlüdür.
   - `PlantUML`: ekip dokümantasyonlarında ve CI çıktılarında kullanılabilir.

3. Tek büyük diagram yerine alanlara bölünür:
   - Core asset/media
   - Yetkilendirme
   - OCR/altyazı/iş kuyruğu
   - Audit/settings

4. Doküman güncel tutulur:
   - Migration veya `src/db.js` değiştiğinde ERD güncellenir.
   - İdeal durumda CI içinde diagram üretim scripti çalışır.

## Live Database Introspection Commands

Docker açıkken tablo listesini almak:

```bash
docker exec mam-postgres psql -U postgres -d mam_mvp -Atc "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"
```

Foreign key listesini almak:

```bash
docker exec mam-postgres psql -U postgres -d mam_mvp -c "
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY child_table, child_column;
"
```

Kolonları JSON olarak almak:

```bash
docker exec mam-postgres psql -U postgres -d mam_mvp -Atc "
SELECT jsonb_pretty(jsonb_agg(row_to_json(cols)::jsonb ORDER BY table_name, ordinal_position))
FROM (
  SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public'
) cols;
"
```

Kaisha/Belgelik sunucusunda container adları farklıysa `mam-postgres` yerine `kaisha-postgres` kullanılmalıdır.
