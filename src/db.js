const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mam_mvp';

const pool = new Pool({ connectionString });

async function initDb() {
  await pool.query(`
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

    CREATE TABLE IF NOT EXISTS asset_versions (
      version_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_updated_at ON assets(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_tags_gin ON assets USING GIN(tags);
    CREATE INDEX IF NOT EXISTS idx_asset_cuts_asset_id ON asset_cuts(asset_id, created_at DESC);
  `);
}

module.exports = {
  pool,
  initDb
};
