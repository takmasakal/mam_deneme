#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pool, initDb } = require('../src/db');

const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const RESERVED_ROOTS = new Set(['proxies', 'thumbnails', 'subtitles', 'ocr', '_config', '.paddlex']);
const IGNORE_PREFIXES = [
  path.join(UPLOADS_DIR, '_config'),
  path.join(UPLOADS_DIR, '.paddlex'),
  path.join(UPLOADS_DIR, 'ocr', '_frames')
];

function shouldIgnorePath(filePath) {
  const resolved = path.resolve(filePath);
  return IGNORE_PREFIXES.some((prefix) => resolved === prefix || resolved.startsWith(`${path.resolve(prefix)}${path.sep}`));
}

function publicUploadUrlToAbsolutePath(publicUrl) {
  const value = String(publicUrl || '').trim();
  if (!value.startsWith('/uploads/')) return '';
  return path.join(UPLOADS_DIR, value.replace(/^\/uploads\//, ''));
}

function addPublicUploadPath(target, value) {
  const abs = publicUploadUrlToAbsolutePath(value);
  if (!abs || shouldIgnorePath(abs)) return;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    target.add(path.resolve(abs));
  }
}

function addAbsoluteUploadPath(target, value) {
  const safe = String(value || '').trim();
  if (!safe || !path.isAbsolute(safe)) return;
  const resolved = path.resolve(safe);
  if (!resolved.startsWith(`${path.resolve(UPLOADS_DIR)}${path.sep}`) && resolved !== path.resolve(UPLOADS_DIR)) return;
  if (shouldIgnorePath(resolved)) return;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    target.add(resolved);
  }
}

function getSubtitleItems(dc) {
  if (!dc || typeof dc !== 'object') return [];
  if (Array.isArray(dc.subtitleItems)) return dc.subtitleItems.filter(Boolean);
  if (dc.subtitleUrl) return [{ subtitleUrl: dc.subtitleUrl }];
  return [];
}

function getOcrItems(dc) {
  if (!dc || typeof dc !== 'object') return [];
  if (Array.isArray(dc.videoOcrItems)) return dc.videoOcrItems.filter(Boolean);
  if (dc.videoOcrUrl) return [{ ocrUrl: dc.videoOcrUrl }];
  return [];
}

function walkFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnorePath(fullPath)) continue;
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
    } else if (entry.isFile()) {
      out.push(path.resolve(fullPath));
    }
  }
}

function collectFilesystemFiles() {
  const files = [];
  if (!fs.existsSync(UPLOADS_DIR)) return files;
  for (const entry of fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })) {
    const fullPath = path.join(UPLOADS_DIR, entry.name);
    if (shouldIgnorePath(fullPath)) continue;
    if (!entry.isDirectory()) continue;
    if (!RESERVED_ROOTS.has(entry.name) || ['proxies', 'thumbnails', 'subtitles', 'ocr'].includes(entry.name)) {
      walkFiles(fullPath, files);
    }
  }
  return files;
}

async function collectReferencedFiles() {
  const referenced = new Set();
  const [assetsResult, versionsResult, subtitleCuesResult, ocrSegmentsResult] = await Promise.all([
    pool.query('SELECT media_url, source_path, proxy_url, thumbnail_url, dc_metadata FROM assets'),
    pool.query('SELECT snapshot_media_url, snapshot_source_path, snapshot_thumbnail_url FROM asset_versions'),
    pool.query('SELECT subtitle_url FROM asset_subtitle_cues'),
    pool.query('SELECT ocr_url FROM asset_ocr_segments')
  ]);

  for (const row of assetsResult.rows) {
    addPublicUploadPath(referenced, row.media_url);
    addAbsoluteUploadPath(referenced, row.source_path);
    addPublicUploadPath(referenced, row.proxy_url);
    addPublicUploadPath(referenced, row.thumbnail_url);
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    for (const item of getSubtitleItems(dc)) addPublicUploadPath(referenced, item.subtitleUrl);
    for (const item of getOcrItems(dc)) addPublicUploadPath(referenced, item.ocrUrl);
  }

  for (const row of versionsResult.rows) {
    addPublicUploadPath(referenced, row.snapshot_media_url);
    addAbsoluteUploadPath(referenced, row.snapshot_source_path);
    addPublicUploadPath(referenced, row.snapshot_thumbnail_url);
  }

  for (const row of subtitleCuesResult.rows) addPublicUploadPath(referenced, row.subtitle_url);
  for (const row of ocrSegmentsResult.rows) addPublicUploadPath(referenced, row.ocr_url);

  return referenced;
}

function summarizeByDir(files) {
  const counts = new Map();
  for (const filePath of files) {
    const rel = path.relative(UPLOADS_DIR, filePath);
    const top = rel.split(path.sep)[0] || '.';
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  await initDb();
  const filesystemFiles = collectFilesystemFiles();
  const referenced = await collectReferencedFiles();
  const orphanFiles = filesystemFiles.filter((filePath) => !referenced.has(path.resolve(filePath)));
  const totalBytes = orphanFiles.reduce((sum, filePath) => {
    try {
      return sum + fs.statSync(filePath).size;
    } catch (_error) {
      return sum;
    }
  }, 0);

  console.log(`Scanned files: ${filesystemFiles.length}`);
  console.log(`Referenced files: ${referenced.size}`);
  console.log(`Orphan files: ${orphanFiles.length}`);
  console.log(`Orphan bytes: ${totalBytes}`);
  console.log('');
  for (const [dir, count] of summarizeByDir(orphanFiles)) {
    console.log(`${dir}: ${count}`);
  }
  if (orphanFiles.length) {
    console.log('');
    orphanFiles.slice(0, 200).forEach((filePath) => {
      console.log(path.relative(ROOT_DIR, filePath));
    });
    if (orphanFiles.length > 200) {
      console.log(`... and ${orphanFiles.length - 200} more`);
    }
  }

  if (shouldDelete && orphanFiles.length) {
    let deletedCount = 0;
    for (const filePath of orphanFiles) {
      fs.unlinkSync(filePath);
      deletedCount += 1;
    }
    console.log('');
    console.log(`Deleted orphan files: ${deletedCount}`);
  }
}

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
