const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mam_mvp';

const pool = new Pool({ connectionString });

async function initDb() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      owner TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      source_path TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      proxy_url TEXT NOT NULL DEFAULT '',
      proxy_status TEXT NOT NULL DEFAULT 'not_applicable',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      dc_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      file_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';

    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS dc_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS file_hash TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS asset_versions (
      version_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      note TEXT NOT NULL,
      snapshot_media_url TEXT NOT NULL DEFAULT '',
      snapshot_source_path TEXT NOT NULL DEFAULT '',
      snapshot_file_name TEXT NOT NULL DEFAULT '',
      snapshot_mime_type TEXT NOT NULL DEFAULT '',
      snapshot_thumbnail_url TEXT NOT NULL DEFAULT '',
      actor_username TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL DEFAULT 'manual',
      restored_from_version_id TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS snapshot_media_url TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS snapshot_source_path TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS snapshot_file_name TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS snapshot_mime_type TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS snapshot_thumbnail_url TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS actor_username TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'manual';

    ALTER TABLE asset_versions
    ADD COLUMN IF NOT EXISTS restored_from_version_id TEXT;

    CREATE TABLE IF NOT EXISTS asset_cuts (
      cut_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      in_point_seconds DOUBLE PRECISION NOT NULL,
      out_point_seconds DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      asset_ids TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_subtitle_cues (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      subtitle_url TEXT NOT NULL,
      seq INTEGER NOT NULL,
      start_sec DOUBLE PRECISION NOT NULL,
      end_sec DOUBLE PRECISION NOT NULL,
      cue_text TEXT NOT NULL,
      norm_text TEXT NOT NULL DEFAULT '',
      confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
      source_engine TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (asset_id, seq)
    );

    ALTER TABLE asset_subtitle_cues
    ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 1;

    ALTER TABLE asset_subtitle_cues
    ADD COLUMN IF NOT EXISTS source_engine TEXT NOT NULL DEFAULT '';

    ALTER TABLE asset_subtitle_cues
    ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS asset_ocr_segments (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      ocr_url TEXT NOT NULL,
      seq INTEGER NOT NULL,
      start_sec DOUBLE PRECISION NOT NULL,
      end_sec DOUBLE PRECISION NOT NULL,
      segment_text TEXT NOT NULL,
      norm_text TEXT NOT NULL DEFAULT '',
      confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
      source_engine TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (asset_id, ocr_url, seq)
    );

    CREATE TABLE IF NOT EXISTS media_processing_jobs (
      job_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_text TEXT NOT NULL DEFAULT '',
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      target_title TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS learned_turkish_corrections (
      wrong_key TEXT PRIMARY KEY,
      wrong TEXT NOT NULL,
      correct TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_updated_at ON assets(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_deleted_updated ON assets(deleted_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_tags_gin ON assets USING GIN(tags);
    CREATE INDEX IF NOT EXISTS idx_assets_file_hash ON assets(file_hash);
    CREATE INDEX IF NOT EXISTS idx_assets_title_trgm ON assets USING GIN (LOWER(title) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_file_name_trgm ON assets USING GIN (LOWER(file_name) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_owner_trgm ON assets USING GIN (LOWER(owner) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_title_fold_trgm ON assets USING GIN ((REPLACE(LOWER(TRANSLATE(COALESCE(title, ''), 'İIı', 'iii')), U&'\\0307', '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_file_name_fold_trgm ON assets USING GIN ((REPLACE(LOWER(TRANSLATE(COALESCE(file_name, ''), 'İIı', 'iii')), U&'\\0307', '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_owner_fold_trgm ON assets USING GIN ((REPLACE(LOWER(TRANSLATE(COALESCE(owner, ''), 'İIı', 'iii')), U&'\\0307', '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_assets_description_fold_trgm ON assets USING GIN ((REPLACE(LOWER(TRANSLATE(COALESCE(description, ''), 'İIı', 'iii')), U&'\\0307', '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_asset_cuts_label_fold_trgm ON asset_cuts USING GIN ((REPLACE(LOWER(TRANSLATE(COALESCE(label, ''), 'İIı', 'iii')), U&'\\0307', '')) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_asset_cuts_asset_id ON asset_cuts(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_versions_asset_created ON asset_versions(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_versions_action ON asset_versions(action_type);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_asset ON asset_subtitle_cues(asset_id);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_asset_url ON asset_subtitle_cues(asset_id, subtitle_url);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_asset_url_start ON asset_subtitle_cues(asset_id, subtitle_url, start_sec);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_norm ON asset_subtitle_cues(norm_text);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_norm_trgm ON asset_subtitle_cues USING GIN (norm_text gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_ocr_segments_asset ON asset_ocr_segments(asset_id);
    CREATE INDEX IF NOT EXISTS idx_ocr_segments_asset_url ON asset_ocr_segments(asset_id, ocr_url);
    CREATE INDEX IF NOT EXISTS idx_ocr_segments_asset_url_start ON asset_ocr_segments(asset_id, ocr_url, start_sec);
    CREATE INDEX IF NOT EXISTS idx_ocr_segments_norm ON asset_ocr_segments(norm_text);
    CREATE INDEX IF NOT EXISTS idx_ocr_segments_norm_trgm ON asset_ocr_segments USING GIN (norm_text gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_media_jobs_asset_type_updated ON media_processing_jobs(asset_id, job_type, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON media_processing_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_learned_turkish_corrections_updated ON learned_turkish_corrections(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_type, target_id);
  `);
}

module.exports = {
  pool,
  initDb
};
