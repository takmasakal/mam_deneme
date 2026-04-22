const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

function registerPdfRoutes(app, deps) {
  const {
    pool,
    requirePdfAdvancedTools,
    requireAdminAccess,
    isPdfCandidate,
    extractPdfPagesText,
    getPdfPageCount,
    renderPdfPageJpegBuffer,
    buildPdfSearchSnippet,
    computeBufferSha256,
    getAssetStoredFileHash,
    findDuplicateAssetByHash,
    buildDuplicateAssetPayload,
    sanitizeFileName,
    getIngestStoragePath,
    publicUploadUrlToAbsolutePath,
    indexAssetToElastic,
    ensurePdfThumbnailForRow,
    mapAssetRow,
    findOriginalVersionSnapshot,
    sendSnapshotDownload
  } = deps;

app.get('/api/assets/:id/pdf-search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const pages = await extractPdfPagesText(inputPath);
    if (!pages.length) {
      return res.json({ query, totalPages: 0, matches: [] });
    }

    const queryLower = query.toLowerCase();
    const matches = [];
    for (let i = 0; i < pages.length; i += 1) {
      const pageText = String(pages[i] || '');
      const lowered = pageText.toLowerCase();
      let from = 0;
      let count = 0;
      while (true) {
        const hit = lowered.indexOf(queryLower, from);
        if (hit < 0) break;
        count += 1;
        from = hit + queryLower.length;
      }
      if (count > 0) {
        matches.push({
          page: i + 1,
          count,
          snippet: buildPdfSearchSnippet(pageText, query)
        });
      }
    }

    return res.json({ query, totalPages: pages.length, matches: matches.slice(0, 200) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to search PDF' });
  }
});

app.get('/api/assets/:id/pdf-search-ocr', async (_req, res) => {
  return res.status(410).json({ error: 'PDF OCR search is disabled.' });
});

app.get('/api/assets/:id/pdf-page-text', async (req, res) => {
  try {
    const requestedPage = Math.max(1, Number(req.query.page) || 1);

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const pages = await extractPdfPagesText(inputPath);
    if (!pages.length) {
      return res.json({ page: requestedPage, totalPages: 0, text: '' });
    }

    const safePage = Math.min(Math.max(1, requestedPage), pages.length);
    return res.json({
      page: safePage,
      totalPages: pages.length,
      text: String(pages[safePage - 1] || ''),
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF page text' });
  }
});

app.get('/api/assets/:id/pdf-meta', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const totalPages = await getPdfPageCount(inputPath);
    return res.json({ totalPages });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF metadata' });
  }
});

app.get('/api/assets/:id/pdf-page-image', async (req, res) => {
  try {
    const requestedPage = Math.max(1, Number(req.query.page) || 1);
    const requestedWidth = Math.max(320, Math.min(2200, Number(req.query.width) || 1200));

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const totalPages = await getPdfPageCount(inputPath);
    const safePage = totalPages > 0 ? Math.min(requestedPage, totalPages) : requestedPage;
    const imageBuffer = await renderPdfPageJpegBuffer(inputPath, safePage, requestedWidth);
    if (!imageBuffer) return res.status(500).json({ error: 'Failed to render PDF page image' });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(imageBuffer);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF page image' });
  }
});

app.post('/api/assets/:id/pdf/save', requirePdfAdvancedTools, async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'Invalid asset id' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = rowResult.rows[0];
    if (!row) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'PDF save is only supported for PDF assets' });
    }

    const rawBase64 = String(req.body?.pdfBase64 || '').trim();
    if (!rawBase64) return res.status(400).json({ error: 'pdfBase64 is required' });
    const sanitizedBase64 = rawBase64.replace(/^data:application\/pdf;base64,/i, '');
    let pdfBuffer = null;
    try {
      pdfBuffer = Buffer.from(sanitizedBase64, 'base64');
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid base64 payload' });
    }
    if (!pdfBuffer || pdfBuffer.length < 16) {
      return res.status(400).json({ error: 'Decoded PDF content is empty' });
    }
    const isPdfHeader = String(pdfBuffer.slice(0, 5).toString('utf8') || '').startsWith('%PDF-');
    if (!isPdfHeader) {
      return res.status(400).json({ error: 'Decoded content is not a valid PDF' });
    }
    const pdfHash = computeBufferSha256(pdfBuffer);
    const currentHash = await getAssetStoredFileHash(row, { persist: true });
    if (pdfHash && currentHash && pdfHash === currentHash) {
      return res.json({ saved: false, unchanged: true, asset: mapAssetRow(row) });
    }
    const duplicateAsset = await findDuplicateAssetByHash(pdfHash, { excludeAssetId: assetId });
    if (duplicateAsset) {
      return res.status(409).json({
        error: 'An identical asset file already exists',
        code: 'duplicate_asset_content',
        existingAsset: buildDuplicateAssetPayload(duplicateAsset)
      });
    }

    const inputFileName = String(req.body?.fileName || row.file_name || `${assetId}.pdf`).trim();
    const safeBase = sanitizeFileName(path.basename(inputFileName, path.extname(inputFileName)) || `asset-${assetId}`);
    const storage = getIngestStoragePath({ type: 'document', mimeType: 'application/pdf', fileName: `${safeBase}.pdf` });
    const storedName = `${Date.now()}-${nanoid()}-${safeBase}-edited.pdf`;
    const absPath = path.join(storage.absoluteDir, storedName);
    const relativePath = path.join(storage.relativeDir, storedName);
    const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
    fs.writeFileSync(absPath, pdfBuffer);

    const nowIso = new Date().toISOString();
    const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
    const rawKinds = Array.isArray(req.body?.changeKinds) ? req.body.changeKinds : [];
    const normalizedKinds = Array.from(new Set(rawKinds.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)));
    let effectiveKind = 'unknown';
    if (normalizedKinds.includes('redaction') && normalizedKinds.includes('text_insert')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('redaction') && normalizedKinds.includes('annotation')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('text_insert') && normalizedKinds.includes('annotation')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('redaction')) effectiveKind = 'redaction';
    else if (normalizedKinds.includes('text_insert')) effectiveKind = 'text_insert';
    else if (normalizedKinds.includes('annotation')) effectiveKind = 'annotation';
    const nextFileName = `${safeBase}-edited.pdf`;
    const version = {
      versionId: nanoid(),
      label: `PDF Edit ${nextVersion}`,
      note: `Saved from PDF viewer by ${actor} [change:${effectiveKind}]`,
      snapshot: {
        snapshotMediaUrl: mediaUrl,
        snapshotSourcePath: absPath,
        snapshotFileName: nextFileName,
        snapshotMimeType: 'application/pdf',
        snapshotThumbnailUrl: ''
      },
      actorUsername: actor,
      actionType: 'pdf_save',
      createdAt: nowIso
    };
    await pool.query('BEGIN');
    try {
      const originalExists = await pool.query(
        `SELECT 1 FROM asset_versions WHERE asset_id = $1 AND action_type = 'pdf_original' LIMIT 1`,
        [assetId]
      );
      if (!originalExists.rowCount) {
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
            nanoid(),
            assetId,
            'PDF Original',
            'Hidden original snapshot before first PDF edit',
            String(row.media_url || '').trim(),
            String(row.source_path || '').trim(),
            String(row.file_name || '').trim(),
            String(row.mime_type || '').trim() || 'application/pdf',
            String(row.thumbnail_url || '').trim(),
            actor,
            'pdf_original',
            null,
            nowIso
          ]
        );
      }

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
          version.versionId, assetId, version.label, version.note,
          version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
          version.actorUsername, version.actionType, null,
          version.createdAt
        ]
      );
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = '',
              file_hash = $6,
              updated_at = $7
          WHERE id = $1
        `,
        [assetId, mediaUrl, absPath, nextFileName, 'application/pdf', pdfHash, nowIso]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    let updatedRow = updatedResult.rows[0];
    updatedRow = await ensurePdfThumbnailForRow(updatedRow);

    return res.json({
      saved: true,
      asset: mapAssetRow(updatedRow),
      changeKind: effectiveKind,
      version
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save PDF edits' });
  }
});

app.post('/api/assets/:id/pdf-restore-original', requireAdminAccess, async (req, res) => {
  try {
    if (!req.userPermissions?.canUsePdfAdvancedTools) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'PDF restore is only supported for PDF assets' });
    }

    let targetResult = await pool.query(
      `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'pdf_original' ORDER BY created_at ASC LIMIT 1`,
      [assetId]
    );
    if (!targetResult.rowCount) {
      targetResult = await pool.query(
        `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
        [assetId]
      );
    }
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Original PDF snapshot not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim() || currentRow.file_name;
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || 'application/pdf';
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
            updated_at = $7
        WHERE id = $1
      `,
      [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
    );

    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const restoreVersion = {
      versionId: nanoid(),
      label: `PDF Original Restore ${nextVersion}`,
      note: `Restored to original snapshot by ${actor}`,
      snapshot: {
        snapshotMediaUrl,
        snapshotSourcePath,
        snapshotFileName,
        snapshotMimeType,
        snapshotThumbnailUrl
      },
      actorUsername: actor,
      actionType: 'pdf_restore_original',
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

    const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    let updatedRow = updatedResult.rows[0];
    updatedRow = await ensurePdfThumbnailForRow(updatedRow);
    await indexAssetToElastic(assetId).catch(() => {});

    return res.json({ restored: true, original: true, asset: mapAssetRow(updatedRow), version: restoreVersion });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore original PDF' });
  }
});

app.get('/api/assets/:id/pdf-original/download', requireAdminAccess, async (req, res) => {
  try {
    if (!req.userPermissions?.canUsePdfAdvancedTools) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'PDF download is only supported for PDF assets' });
    }

    const snapshot = await findOriginalVersionSnapshot(assetId, 'pdf_original');
    if (!snapshot) return res.status(404).json({ error: 'Original PDF snapshot not found' });
    return sendSnapshotDownload(res, snapshot, currentRow.file_name || `${assetId}.pdf`);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to download original PDF' });
  }
});

app.post('/api/assets/:id/pdf-restore', requireAdminAccess, async (req, res) => {
  try {
    if (!req.userPermissions?.canUsePdfAdvancedTools) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const assetId = String(req.params.id || '').trim();
    const versionId = String(req.body?.versionId || '').trim();
    if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'PDF restore is only supported for PDF assets' });
    }

    const versionResult = await pool.query(
      'SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2',
      [assetId, versionId]
    );
    const target = versionResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Version not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim();
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || 'application/pdf';
    const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim();
    let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    if (!snapshotMediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Selected version has no restorable PDF snapshot' });
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
      snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      return res.status(400).json({ error: 'Snapshot file for selected version is missing on disk' });
    }

    const nowIso = new Date().toISOString();
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';

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
        [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName || currentRow.file_name, snapshotMimeType, snapshotThumbnailUrl, nowIso]
      );

      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
      const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
      const restoreVersion = {
        versionId: nanoid(),
        label: `PDF Restore ${nextVersion}`,
        note: `Restored to ${String(target.label || target.version_id)} by ${actor}`,
        snapshot: {
          snapshotMediaUrl,
          snapshotSourcePath,
          snapshotFileName: snapshotFileName || currentRow.file_name,
          snapshotMimeType,
          snapshotThumbnailUrl
        },
        actorUsername: actor,
        actionType: 'pdf_restore',
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
      await pool.query('COMMIT');

      const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      let updatedRow = updatedResult.rows[0];
      updatedRow = await ensurePdfThumbnailForRow(updatedRow);
      return res.json({
        restored: true,
        asset: mapAssetRow(updatedRow),
        version: restoreVersion
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore PDF version' });
  }
});

}

module.exports = { registerPdfRoutes };
