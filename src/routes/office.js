const express = require('express');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

function registerOfficeRoutes(app, deps) {
  const {
    pool,
    officeService,
    isOfficeDocumentCandidate,
    publicUploadUrlToAbsolutePath,
    indexAssetToElastic,
    mapAssetRow,
    findOriginalVersionSnapshot,
    sendSnapshotDownload,
    getFileExtension,
    officeEditorProvider,
    uploadsDir,
    runCommandCapture,
    sanitizeFileName,
    assetAccessService,
    assetEditLockService,
    resolveEffectivePermissions
  } = deps;

  async function loadVisibleAssetRow(req, assetId) {
    const accessContext = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = assetResult.rows[0] || null;
    if (!row) return { status: 404, error: 'Asset not found', row: null, accessContext };
    if (!assetAccessService.canViewAsset(row, accessContext)) {
      return { status: 404, error: 'Asset not found', row: null, accessContext };
    }
    return { status: 200, row, accessContext };
  }

  app.get('/api/assets/:id/office-config', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      const row = loaded.row;
      const canEditAsset = assetAccessService.canEditAssetOffice(row, loaded.accessContext);
      let canEditOffice = canEditAsset;
      let editLock = null;
      let readOnlyReason = '';
      if (canEditOffice && assetEditLockService) {
        const lockResult = await assetEditLockService.acquire(req, req.params.id, 'office');
        if (!lockResult.ok) {
          canEditOffice = false;
          readOnlyReason = String(lockResult.error || 'This document is being edited by another user; opened read-only.');
          editLock = lockResult.lock || null;
        }
      }
      const effective = canEditOffice
        ? { ...loaded.accessContext, canEditOffice: true }
        : loaded.accessContext;
      const payload = await officeService.buildOnlyOfficeConfig({
        row,
        effective,
        lang: req.query.lang
      });
      if (readOnlyReason) payload.readOnlyReason = readOnlyReason;
      if (editLock) payload.conflictingEditLock = editLock;
      if (canEditOffice && assetEditLockService) {
        const activeLock = await assetEditLockService.getActiveLock(req.params.id);
        payload.editLock = activeLock ? {
          lockedBy: String(activeLock.locked_by || ''),
          lockedByName: String(activeLock.locked_by_name || ''),
          expiresAt: activeLock.expires_at
        } : null;
      }
      return res.json(payload);
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400 && Number(error?.statusCode || 0) < 500) {
        return res.status(error.statusCode).json({ error: String(error.message || 'Invalid ONLYOFFICE request') });
      }
      return res.status(500).json({ error: 'Failed to build ONLYOFFICE config' });
    }
  });

  app.get('/api/assets/:id/office-document', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const token = String(req.query.token || '').trim();
      if (!assetId || !token) return res.status(404).json({ error: 'Document not found' });
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const row = assetResult.rows[0] || null;
      if (!row || !officeService.isValidOfficeDocumentToken(row, token)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        return res.status(400).json({ error: 'Asset is not an Office document' });
      }
      let inputPath = String(row.source_path || '').trim();
      if (!inputPath || !fs.existsSync(inputPath)) {
        const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
        if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
      }
      if (!inputPath || !fs.existsSync(inputPath)) {
        return res.status(404).json({ error: 'Office source file not found' });
      }
      res.set('Cache-Control', 'private, max-age=60');
      res.set('Content-Type', String(row.mime_type || '').trim() || 'application/octet-stream');
      const downloadName = sanitizeFileName(row.file_name || row.title || `${assetId}.${getFileExtension(inputPath) || 'docx'}`);
      res.set('Content-Disposition', `inline; filename="${downloadName}"`);
      return res.sendFile(inputPath);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to serve Office document' });
    }
  });

  app.post('/api/assets/:id/office-callback', express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.json({ error: 0 });
      const result = await officeService.saveOnlyofficeCallbackVersion(assetId, req.body || {});
      if ([2, 4].includes(Number(req.body?.status || 0))) {
        await assetEditLockService?.releaseAsset(assetId).catch(() => {});
      }
      console.log(JSON.stringify({
        event: 'onlyoffice-callback',
        assetId,
        status: Number(req.body?.status || 0),
        saved: Boolean(result.saved),
        unchanged: Boolean(result.unchanged),
        ignored: Boolean(result.ignored),
        versionId: String(result.versionId || ''),
        error: String(result.error || '')
      }));
      return res.json({ error: 0 });
    } catch (error) {
      console.error('ONLYOFFICE callback save failed', {
        assetId: String(req.params.id || '').trim(),
        status: Number(req.body?.status || 0),
        error: String(error?.message || error)
      });
      return res.json({ error: 1 });
    }
  });

  async function sendLibreOfficePreviewPdf(req, res) {
    try {
      const assetId = String(req.params.id || '').trim();
      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const row = loaded.row;
      if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        return res.status(400).json({ error: 'LibreOffice preview is supported only for Office assets' });
      }

      const pdfPath = await officeService.ensureOfficePreviewPdf(row);
      res.set('Cache-Control', 'private, max-age=60');
      return res.sendFile(pdfPath);
    } catch (error) {
      return res.status(Number(error?.statusCode || 0) || 500).json({
        error: `Failed to build LibreOffice preview: ${String(error?.message || 'unknown error').slice(0, 500)}`
      });
    }
  }

  app.get('/api/assets/:id/libreoffice-preview.pdf', async (req, res) => {
    return sendLibreOfficePreviewPdf(req, res);
  });

  app.get('/api/assets/:id/office-preview.pdf', async (req, res) => {
    return sendLibreOfficePreviewPdf(req, res);
  });

  app.post('/api/assets/:id/office-restore', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.body?.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const currentRow = loaded.row;
      if (!assetAccessService.canDownloadAsset(currentRow, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (assetEditLockService) {
        const lockResult = await assetEditLockService.assertWritable(req, assetId);
        if (!lockResult.ok) return assetEditLockService.sendLocked(res, lockResult);
      }
      if (!isOfficeDocumentCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
        return res.status(400).json({ error: 'Office restore is only supported for Office assets' });
      }

      const versionResult = await pool.query(
        'SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2',
        [assetId, versionId]
      );
      const target = versionResult.rows[0];
      if (!target) return res.status(404).json({ error: 'Version not found' });

      const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
      const snapshotSourcePath = String(target.snapshot_source_path || '').trim();
      const snapshotFileName = String(target.snapshot_file_name || '').trim() || String(currentRow.file_name || '').trim();
      const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || String(currentRow.mime_type || '').trim();
      const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim() || String(currentRow.thumbnail_url || '').trim();

      if (!snapshotMediaUrl.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'Selected version has no restorable Office snapshot' });
      }
      const resolvedSnapshotPath = (() => {
        if (snapshotSourcePath && fs.existsSync(snapshotSourcePath)) return snapshotSourcePath;
        const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
        return resolved && fs.existsSync(resolved) ? resolved : '';
      })();
      if (!resolvedSnapshotPath) {
        return res.status(400).json({ error: 'Snapshot file for selected version is missing on disk' });
      }

      const nowIso = new Date().toISOString();
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || currentRow.owner || 'admin').trim() || 'admin';
      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
      const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
      const restoreVersion = {
        versionId: nanoid(),
        label: `Office Restore ${nextVersion}`,
        note: `Restored to ${String(target.label || target.version_id)} by ${actor}`,
        snapshot: {
          snapshotMediaUrl,
          snapshotSourcePath: resolvedSnapshotPath,
          snapshotFileName,
          snapshotMimeType,
          snapshotThumbnailUrl
        },
        actorUsername: String(req.userPermissions?.username || actor).trim() || actor,
        actionType: 'office_restore',
        restoredFromVersionId: target.version_id,
        createdAt: nowIso
      };

      await pool.query('BEGIN');
      try {
        await pool.query(
          `
            UPDATE assets
            SET media_url = $2,
                source_path = $3,
                file_name = $4,
                mime_type = $5,
                thumbnail_url = $6,
                file_hash = '',
                updated_at = $7
            WHERE id = $1
          `,
          [assetId, snapshotMediaUrl, resolvedSnapshotPath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
        );
        await pool.query(
          `
            INSERT INTO asset_versions (
              version_id, asset_id, label, note,
              snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
              actor_username, action_type, restored_from_version_id,
              created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `,
          [
            restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
            restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
            restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
            restoreVersion.createdAt
          ]
        );
        await pool.query('COMMIT');
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }

      await indexAssetToElastic(assetId).catch(() => {});
      const refreshed = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      return res.json({
        restored: true,
        asset: mapAssetRow(refreshed.rows[0]),
        version: restoreVersion
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to restore Office version' });
    }
  });

  app.post('/api/assets/:id/office-restore-original', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'assetId is required' });

      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const currentRow = loaded.row;
      if (!assetAccessService.canEditAssetOffice(currentRow, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (assetEditLockService) {
        const lockResult = await assetEditLockService.assertWritable(req, assetId);
        if (!lockResult.ok) return assetEditLockService.sendLocked(res, lockResult);
      }
      if (!isOfficeDocumentCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
        return res.status(400).json({ error: 'Office restore is only supported for Office assets' });
      }

      let targetResult = await pool.query(
        `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'office_original' ORDER BY created_at ASC LIMIT 1`,
        [assetId]
      );
      if (!targetResult.rowCount) {
        targetResult = await pool.query(
          `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
          [assetId]
        );
      }
      const target = targetResult.rows[0];
      if (!target) return res.status(404).json({ error: 'Original Office snapshot not found' });

      const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
      const snapshotFileName = String(target.snapshot_file_name || '').trim() || currentRow.file_name;
      const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || String(currentRow.mime_type || '').trim();
      const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim();
      let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
      if (!snapshotMediaUrl.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'Original snapshot is not restorable' });
      }
      if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
        const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
        snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
      }
      if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
        return res.status(400).json({ error: 'Original snapshot file is missing on disk' });
      }

      const nowIso = new Date().toISOString();
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';

      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = $6,
              file_hash = '',
              updated_at = $7
          WHERE id = $1
        `,
        [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
      );

      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
      const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
      const restoreVersion = {
        versionId: nanoid(),
        label: `Office Original Restore ${nextVersion}`,
        note: `Restored to original snapshot by ${actor}`,
        snapshot: {
          snapshotMediaUrl,
          snapshotSourcePath,
          snapshotFileName,
          snapshotMimeType,
          snapshotThumbnailUrl
        },
        actorUsername: actor,
        actionType: 'office_restore_original',
        restoredFromVersionId: target.version_id,
        createdAt: nowIso
      };
      await pool.query(
        `
          INSERT INTO asset_versions (
            version_id, asset_id, label, note,
            snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
            actor_username, action_type, restored_from_version_id,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `,
        [
          restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
          restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
          restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
          restoreVersion.createdAt
        ]
      );

      await indexAssetToElastic(assetId).catch(() => {});
      const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      return res.json({ restored: true, original: true, asset: mapAssetRow(updatedResult.rows[0]), version: restoreVersion });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to restore original Office document' });
    }
  });

  app.get('/api/assets/:id/office-original/download', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'assetId is required' });

      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const currentRow = loaded.row;
      if (!assetAccessService.canEditAssetOffice(currentRow, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!isOfficeDocumentCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
        return res.status(400).json({ error: 'Office download is only supported for Office assets' });
      }

      const snapshot = await findOriginalVersionSnapshot(assetId, 'office_original');
      if (!snapshot) return res.status(404).json({ error: 'Original Office snapshot not found' });
      return sendSnapshotDownload(res, snapshot, currentRow.file_name || `${assetId}.${getFileExtension(currentRow.file_name) || 'docx'}`);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to download original Office document' });
    }
  });
}

module.exports = { registerOfficeRoutes };
