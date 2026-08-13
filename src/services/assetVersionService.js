function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function createAssetVersionService(deps = {}) {
  const {
    pool,
    fs,
    path,
    sanitizeFileName,
    publicUploadUrlToAbsolutePath,
    isPdfCandidate,
    isOfficeDocumentCandidate
  } = deps;

  function mapVersionRow(row) {
    return {
      versionId: row.version_id,
      label: row.label,
      note: row.note,
      snapshotMediaUrl: row.snapshot_media_url || '',
      snapshotSourcePath: row.snapshot_source_path || '',
      snapshotFileName: row.snapshot_file_name || '',
      snapshotMimeType: row.snapshot_mime_type || '',
      snapshotThumbnailUrl: row.snapshot_thumbnail_url || '',
      actorUsername: row.actor_username || '',
      actionType: row.action_type || 'manual',
      restoredFromVersionId: row.restored_from_version_id || '',
      createdAt: row.created_at
    };
  }

  function buildVersionSnapshotFromRow(row) {
    return {
      snapshotMediaUrl: String(row?.media_url || '').trim(),
      snapshotSourcePath: String(row?.source_path || '').trim(),
      snapshotFileName: String(row?.file_name || '').trim(),
      snapshotMimeType: String(row?.mime_type || '').trim(),
      snapshotThumbnailUrl: String(row?.thumbnail_url || '').trim()
    };
  }

  function canManagePdfVersionRow(userPermissions, versionRow) {
    if (!userPermissions?.canUsePdfAdvancedTools || !versionRow) return false;
    if (userPermissions?.canAccessAdmin) return true;
    const actorUsername = normalizeUsername(versionRow.actor_username);
    const currentUsername = normalizeUsername(userPermissions?.username);
    return Boolean(actorUsername && currentUsername && actorUsername === currentUsername);
  }

  function canManageVersionRow(userPermissions, assetRow, versionRow) {
    if (!userPermissions || !assetRow || !versionRow) return false;
    if (userPermissions.canAccessAdmin) return true;
    const actorUsername = normalizeUsername(versionRow.actor_username);
    const currentUsername = normalizeUsername(userPermissions.username);
    const isOwnVersion = Boolean(actorUsername && currentUsername && actorUsername === currentUsername);
    if (isPdfCandidate?.({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
      return Boolean(userPermissions.canUsePdfAdvancedTools && isOwnVersion);
    }
    if (isOfficeDocumentCandidate?.({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
      return Boolean(userPermissions.canEditOffice);
    }
    return false;
  }

  function canCreateVersionForAsset(userPermissions, assetRow) {
    if (!userPermissions || !assetRow) return false;
    if (userPermissions.canAccessAdmin) return true;
    if (isPdfCandidate?.({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
      return Boolean(userPermissions.canUsePdfAdvancedTools);
    }
    if (isOfficeDocumentCandidate?.({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
      return Boolean(userPermissions.canEditOffice);
    }
    return false;
  }

  async function findOriginalVersionSnapshot(assetId, actionType) {
    const safeAssetId = String(assetId || '').trim();
    const safeActionType = String(actionType || '').trim();
    if (!safeAssetId || !safeActionType || !pool) return null;

    let targetResult = await pool.query(
      `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = $2 ORDER BY created_at ASC LIMIT 1`,
      [safeAssetId, safeActionType]
    );
    if (!targetResult.rowCount) {
      targetResult = await pool.query(
        `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
        [safeAssetId]
      );
    }
    const target = targetResult.rows[0];
    if (!target) return null;

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    if (!snapshotMediaUrl.startsWith('/uploads/')) return null;
    let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      const resolved = publicUploadUrlToAbsolutePath?.(snapshotMediaUrl);
      snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) return null;

    return {
      row: target,
      snapshotMediaUrl,
      snapshotSourcePath,
      snapshotFileName: String(target.snapshot_file_name || '').trim(),
      snapshotMimeType: String(target.snapshot_mime_type || '').trim(),
      snapshotThumbnailUrl: String(target.snapshot_thumbnail_url || '').trim()
    };
  }

  function sendSnapshotDownload(res, snapshot, fallbackFileName) {
    const filePath = String(snapshot?.snapshotSourcePath || '').trim();
    const fileName = sanitizeFileName(String(snapshot?.snapshotFileName || fallbackFileName || path.basename(filePath) || 'original.bin'));
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Original snapshot file is missing on disk' });
    }
    return res.download(filePath, fileName, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download original snapshot' });
      }
    });
  }

  return {
    mapVersionRow,
    buildVersionSnapshotFromRow,
    canManagePdfVersionRow,
    canManageVersionRow,
    canCreateVersionForAsset,
    findOriginalVersionSnapshot,
    sendSnapshotDownload
  };
}

module.exports = {
  createAssetVersionService
};
