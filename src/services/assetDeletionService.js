const fs = require('fs');
const path = require('path');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getSubtitleItemsFromDc(dcMetadata = {}) {
  const dc = asObject(dcMetadata);
  const items = Array.isArray(dc.subtitleItems) ? dc.subtitleItems : [];
  const normalized = items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      subtitleUrl: String(item.subtitleUrl || item.url || '').trim()
    }))
    .filter((item) => item.subtitleUrl);

  if (!normalized.length && String(dc.subtitleUrl || '').trim()) {
    normalized.push({ subtitleUrl: String(dc.subtitleUrl || '').trim() });
  }
  return normalized;
}

function getOcrItemsFromDc(dcMetadata = {}) {
  const dc = asObject(dcMetadata);
  const items = Array.isArray(dc.videoOcrItems) ? dc.videoOcrItems : [];
  const normalized = items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ocrUrl: String(item.ocrUrl || item.url || '').trim()
    }))
    .filter((item) => item.ocrUrl);

  if (!normalized.length && String(dc.videoOcrUrl || '').trim()) {
    normalized.push({ ocrUrl: String(dc.videoOcrUrl || '').trim() });
  }
  return normalized;
}

function createAssetDeletionService({
  pool,
  uploadRoots,
  isPathInsideRoot,
  resolveStoredUrl,
  publicUploadUrlToAbsolutePath,
  removeAssetFromElastic
}) {
  const roots = Object.values(uploadRoots || {}).filter(Boolean);

  function isSafeAssetCleanupPath(filePath) {
    return roots.some((rootDir) => isPathInsideRoot(filePath, rootDir));
  }

  function addPublicUploadPath(targetSet, publicUrl, defaultSubdir = '') {
    const resolved = defaultSubdir ? resolveStoredUrl(publicUrl, defaultSubdir) : String(publicUrl || '').trim();
    const absolute = publicUploadUrlToAbsolutePath(resolved);
    if (!absolute || !isSafeAssetCleanupPath(absolute)) return;
    targetSet.add(path.resolve(absolute));
  }

  function addAbsoluteCleanupPath(targetSet, filePath) {
    const safePath = String(filePath || '').trim();
    if (!safePath || !path.isAbsolute(safePath) || !isSafeAssetCleanupPath(safePath)) return;
    targetSet.add(path.resolve(safePath));
  }

  function collectAssetCleanupPaths(row, versionRows = []) {
    const paths = new Set();
    if (!row || typeof row !== 'object') return [];

    addPublicUploadPath(paths, row.media_url);
    addAbsoluteCleanupPath(paths, row.source_path);
    addPublicUploadPath(paths, row.proxy_url, 'proxies');
    addPublicUploadPath(paths, row.thumbnail_url, 'thumbnails');

    const dc = asObject(row.dc_metadata);
    getSubtitleItemsFromDc(dc).forEach((item) => {
      addPublicUploadPath(paths, item.subtitleUrl);
    });
    getOcrItemsFromDc(dc).forEach((item) => {
      addPublicUploadPath(paths, item.ocrUrl);
    });

    versionRows.forEach((versionRow) => {
      addPublicUploadPath(paths, versionRow.snapshot_media_url);
      addAbsoluteCleanupPath(paths, versionRow.snapshot_source_path);
      addPublicUploadPath(paths, versionRow.snapshot_thumbnail_url, 'thumbnails');
    });

    return Array.from(paths);
  }

  function cleanupAssetFiles(paths = []) {
    const removed = [];
    const failed = [];
    paths.forEach((filePath) => {
      const safePath = String(filePath || '').trim();
      if (!safePath || !isSafeAssetCleanupPath(safePath)) return;
      try {
        if (!fs.existsSync(safePath)) return;
        const stat = fs.statSync(safePath);
        if (!stat.isFile()) return;
        fs.unlinkSync(safePath);
        removed.push(safePath);
      } catch (error) {
        failed.push({
          path: safePath,
          message: error?.message || 'unlink failed'
        });
      }
    });
    return { removed, failed };
  }

  async function removeAssetFromCollections(assetId) {
    const safeAssetId = String(assetId || '').trim();
    if (!safeAssetId) return;
    const now = new Date().toISOString();
    await pool.query(
      `
        UPDATE collections
        SET asset_ids = array_remove(asset_ids, $1),
            updated_at = $2
        WHERE $1 = ANY(asset_ids)
      `,
      [safeAssetId, now]
    );
  }

  async function deleteAssetFromElastic(assetId) {
    return removeAssetFromElastic(assetId);
  }

  return {
    collectAssetCleanupPaths,
    cleanupAssetFiles,
    removeAssetFromCollections,
    deleteAssetFromElastic
  };
}

module.exports = {
  createAssetDeletionService
};
