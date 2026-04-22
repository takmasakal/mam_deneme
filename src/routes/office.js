const express = require('express');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

function registerOfficeRoutes(app, deps) {
  const {
    pool,
    officeService,
    requireOfficeEdit,
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
    sanitizeFileName
  } = deps;

  async function convertOfficeToLibreOfficePdf(row, inputPath) {
    const stat = fs.statSync(inputPath);
    const assetId = String(row.id || '').trim();
    const revision = `${Math.round(Number(stat.mtimeMs || 0))}-${Math.max(0, Number(stat.size || 0))}`;
    const outputDir = path.join(uploadsDir, 'previews', 'libreoffice');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputName = `${sanitizeFileName(assetId || 'asset')}-${revision}.pdf`;
    const outputPath = path.join(outputDir, outputName);
    if (fs.existsSync(outputPath)) return outputPath;

    const tempDir = path.join('/tmp', `mam-lo-${Date.now()}-${nanoid()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const sourceExt = getFileExtension(row.file_name) || getFileExtension(inputPath) || 'docx';
    const sourceBase = sanitizeFileName(path.basename(String(row.file_name || assetId || 'document'), path.extname(String(row.file_name || '')))) || 'document';
    const tempInput = path.join(tempDir, `${sourceBase}.${sourceExt}`);
    fs.copyFileSync(inputPath, tempInput);

    const args = [
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--nodefault',
      '--norestore',
      '--convert-to',
      'pdf',
      '--outdir',
      tempDir,
      tempInput
    ];
    let result = await runCommandCapture('libreoffice', args, { env: { HOME: tempDir } });
    if (!result.ok) {
      result = await runCommandCapture('soffice', args, { env: { HOME: tempDir } });
    }
    const convertedPath = path.join(tempDir, `${sourceBase}.pdf`);
    if (!result.ok || !fs.existsSync(convertedPath)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_cleanupError) {}
      const message = String(result.stderr || result.stdout || 'LibreOffice conversion failed').slice(0, 500);
      const error = new Error(message);
      error.statusCode = 503;
      throw error;
    }
    fs.copyFileSync(convertedPath, outputPath);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_cleanupError) {}
    return outputPath;
  }

  app.get('/api/assets/:id/office-config', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      const row = assetResult.rows[0];
      const effective = await deps.resolveEffectivePermissions(req).catch(() => null);
      const payload = await officeService.buildOnlyOfficeConfig({
        row,
        effective,
        lang: req.query.lang
      });
      return res.json(payload);
    } catch (error) {
      if (Number(error?.statusCode || 0) >= 400 && Number(error?.statusCode || 0) < 500) {
        return res.status(error.statusCode).json({ error: String(error.message || 'Invalid ONLYOFFICE request') });
      }
      return res.status(500).json({ error: 'Failed to build ONLYOFFICE config' });
    }
  });

  app.post('/api/assets/:id/office-callback', express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.json({ error: 0 });
      const result = await officeService.saveOnlyofficeCallbackVersion(assetId, req.body || {});
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

  app.get('/api/assets/:id/libreoffice-preview.pdf', async (req, res) => {
    try {
      if (officeEditorProvider !== 'libreoffice') {
        return res.status(404).json({ error: 'LibreOffice preview is not enabled' });
      }
      const assetId = String(req.params.id || '').trim();
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const row = assetResult.rows[0];
      if (!row) return res.status(404).json({ error: 'Asset not found' });
      if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        return res.status(400).json({ error: 'LibreOffice preview is supported only for Office assets' });
      }

      let inputPath = String(row.source_path || '').trim();
      if (!inputPath || !fs.existsSync(inputPath)) {
        const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
        if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
      }
      if (!inputPath || !fs.existsSync(inputPath)) {
        return res.status(404).json({ error: 'Office source file not found' });
      }
      const pdfPath = await convertOfficeToLibreOfficePdf(row, inputPath);
      res.set('Cache-Control', 'private, max-age=60');
      return res.sendFile(pdfPath);
    } catch (error) {
      return res.status(Number(error?.statusCode || 0) || 500).json({
        error: `Failed to build LibreOffice preview: ${String(error?.message || 'unknown error').slice(0, 500)}`
      });
    }
  });

  app.post('/api/assets/:id/office-restore', requireOfficeEdit, async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.body?.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const currentRow = assetResult.rows[0];
      if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
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

  app.post('/api/assets/:id/office-restore-original', requireOfficeEdit, async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'assetId is required' });

      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const currentRow = assetResult.rows[0];
      if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
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

  app.get('/api/assets/:id/office-original/download', requireOfficeEdit, async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      if (!assetId) return res.status(400).json({ error: 'assetId is required' });

      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const currentRow = assetResult.rows[0];
      if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
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
