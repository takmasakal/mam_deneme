const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

function registerAdminRoutes(app, deps) {
  const {
    pool,
    WORKFLOW,
    proxyJobs,
    requireScopedAdminAccess,
    publicUploadUrlToAbsolutePath,
    reloadLearnedTurkishCorrectionsFromDb,
    getLearnedTurkishCorrectionsList,
    normalizeLearnedCorrectionKey,
    learnedTurkishCorrections,
    turkishWordSet,
    sanitizeVideoOcrItems,
    normalizeOcrEngine,
    getCandidateOcrFilePathsForRow,
    sanitizeSubtitleItems,
    normalizeSubtitleLang,
    findSubtitleMatchesInText,
    resolveEffectivePermissions,
    getUserPermissionsSettings,
    fetchKeycloakUsers,
    isVisibleKeycloakUser,
    fetchKeycloakUserPermissionDefaults,
    resolvePermissionKeysFromPrincipals,
    normalizePermissionEntry,
    PERMISSION_KEYS,
    getPermissionDefinitionsPayload,
    saveUserPermissionsSettings,
    getAdminSettings,
    saveAdminSettings,
    getRuntimeErrorLogs,
    getActiveUsers,
    normalizePlayerUiMode,
    normalizeSubtitleStyle,
    normalizeAuditRetentionDays,
    cleanupAuditEvents,
    recordAuditEvent,
    generateApiToken,
    systemHealthCache,
    SYSTEM_HEALTH_CACHE_TTL_MS,
    normalizeMediaJobType,
    normalizeMediaJobStatus,
    mapSubtitleJobFromDbRow,
    mapVideoOcrJobFromDbRow,
    OCR_DIR,
    UPLOADS_DIR,
    SUBTITLES_DIR,
    normalizeVttContent,
    resolveStoredUrl,
    pickLatestVideoOcrUrlFromDc,
    runCommandCapture,
    backfillElasticIndex,
    createProxyJob,
    runProxyJob,
    queryAssetSuggestions,
    suggestAssetIdsElastic,
    hasStoredFile,
    collectAssetCleanupPaths,
    cleanupAssetFiles,
    deleteAssetFromElastic,
    removeAssetFromCollections,
    ensureVideoProxyAndThumbnail,
    isVideoCandidate,
    computeBufferSha256,
    getAssetStoredFileHash,
    findDuplicateAssetByHash,
    buildDuplicateAssetPayload,
    sanitizeFileName,
    inferMimeTypeFromFileName,
    inferAssetType,
    getIngestStoragePath,
    resolveAssetInputPath,
    buildArtifactPath,
    generateVideoThumbnail,
    regenerateVideoThumbnailForAsset,
    ensurePdfThumbnailForRow,
    isPdfCandidate,
    isDocumentCandidate,
    ensureDocumentThumbnailForRow,
    extractPreviewContentFromFile,
    indexAssetToElastic,
    mapAssetRow,
    buildOcrDisplayLabel,
    syncOcrSegmentIndexForAsset,
    syncSubtitleCueIndexForAssetRow,
    formatTimecode,
    getAssetFamily,
    assetAccessService,
    nanoid: providedNanoid,
    removeAssetFromElastic
  } = deps;
  const resolvedNanoid = typeof providedNanoid === 'function' ? providedNanoid : nanoid;
app.use('/api/admin', requireScopedAdminAccess);

async function requireSuperAdminRequest(req, res) {
  const effective = await resolveEffectivePermissions(req);
  if (!effective?.baseIsSuperAdmin) {
    res.status(403).json({ error: 'Super admin permission is required' });
    return null;
  }
  return effective;
}

app.get('/api/admin/group-admins', async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, group_name, username, created_at, created_by
        FROM group_admins
        ORDER BY group_name ASC, username ASC
      `
    );
    return res.json({
      groupAdmins: result.rows.map((row) => ({
        id: row.id,
        groupName: row.group_name,
        username: row.username,
        createdAt: row.created_at,
        createdBy: row.created_by || ''
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load group admins' });
  }
});

app.post('/api/admin/group-admins', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const groupName = assetAccessService.normalizeAccessName(req.body?.groupName || req.body?.group || '');
    const username = assetAccessService.normalizeAccessName(req.body?.username || req.body?.user || '');
    if (!groupName || !username) {
      return res.status(400).json({ error: 'groupName and username are required' });
    }
    const now = new Date().toISOString();
    const createdBy = String(effective.username || effective.displayName || '').trim();
    const result = await pool.query(
      `
        INSERT INTO group_admins (id, group_name, username, created_at, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (group_name, username)
        DO UPDATE SET created_by = EXCLUDED.created_by
        RETURNING *
      `,
      [resolvedNanoid(), groupName, username, now, createdBy]
    );
    await recordAuditEvent?.(req, {
      action: 'group_admin.saved',
      targetType: 'group_admin',
      targetId: result.rows[0].id,
      targetTitle: `${groupName}:${username}`,
      details: { groupName, username }
    });
    return res.status(201).json({ groupAdmin: result.rows[0] });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save group admin' });
  }
});

app.delete('/api/admin/group-admins/:id', async (req, res) => {
  try {
    const effective = await requireSuperAdminRequest(req, res);
    if (!effective) return null;
    const result = await pool.query('DELETE FROM group_admins WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group admin not found' });
    await recordAuditEvent?.(req, {
      action: 'group_admin.deleted',
      targetType: 'group_admin',
      targetId: result.rows[0].id,
      targetTitle: `${result.rows[0].group_name}:${result.rows[0].username}`,
      details: { groupName: result.rows[0].group_name, username: result.rows[0].username }
    });
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete group admin' });
  }
});

app.get('/api/admin/turkish-corrections', async (_req, res) => {
  try {
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({
      entries: getLearnedTurkishCorrectionsList(),
      wordSetSize: turkishWordSet.size
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load Turkish corrections' });
  }
});

app.post('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.body?.from ?? '');
    const correct = String(req.body?.correct ?? req.body?.to ?? '').trim();
    if (!wrong || !correct) {
      return res.status(400).json({ error: 'wrong and correct are required' });
    }
    const now = new Date().toISOString();
    await pool.query(
      `
        INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (wrong_key)
        DO UPDATE SET wrong = EXCLUDED.wrong, correct = EXCLUDED.correct, updated_at = EXCLUDED.updated_at
      `,
      [wrong, wrong, correct, now, now]
    );
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, entry: { wrong, correct }, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save Turkish correction' });
  }
});

app.put('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const sanitized = rows
      .map((row) => ({
        wrong: normalizeLearnedCorrectionKey(row?.wrong ?? row?.from ?? ''),
        correct: String(row?.correct ?? row?.to ?? '').trim()
      }))
      .filter((row) => row.wrong && row.correct);
    await pool.query('BEGIN');
    await pool.query('DELETE FROM learned_turkish_corrections');
    const now = new Date().toISOString();
    for (const row of sanitized) {
      await pool.query(
        `
          INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [row.wrong, row.wrong, row.correct, now, now]
      );
    }
    await pool.query('COMMIT');
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, total: learnedTurkishCorrections.size });
  } catch (_error) {
    await pool.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: 'Failed to replace Turkish corrections' });
  }
});

app.delete('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.query?.wrong ?? '');
    if (!wrong) return res.status(400).json({ error: 'wrong is required' });
    const delRes = await pool.query(
      'DELETE FROM learned_turkish_corrections WHERE wrong_key = $1',
      [wrong]
    );
    const removed = Number(delRes.rowCount || 0) > 0;
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, removed, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete Turkish correction' });
  }
});

function getOcrItemsFromDc(dcMetadata = {}, fallbackDate = '') {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let items = sanitizeVideoOcrItems(dc.videoOcrItems);
  if (!items.length && String(dc.videoOcrUrl || '').trim()) {
    items = [{
      id: '__legacy_active__',
      ocrUrl: String(dc.videoOcrUrl || '').trim(),
      ocrLabel: String(dc.videoOcrLabel || '').trim() || 'video-ocr',
      ocrEngine: normalizeOcrEngine(dc.videoOcrEngine || 'paddle'),
      lineCount: Math.max(0, Number(dc.videoOcrLineCount) || 0),
      segmentCount: Math.max(0, Number(dc.videoOcrSegmentCount) || 0),
      createdAt: String(fallbackDate || new Date().toISOString())
    }];
  }
  return items;
}

function ocrAbsolutePathToPublicUrl(absPath) {
  const safe = String(absPath || '');
  if (!safe) return '';
  const rel = path.relative(OCR_DIR, safe).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return '';
  return `/uploads/ocr/${rel}`;
}

function resolveAdminOcrItemForAssetRow(row, itemId) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const items = getOcrItemsFromDc(dc, row?.updated_at || row?.created_at || '');
  const direct = items.find((it) => String(it.id || '') === String(itemId || ''));
  if (direct) return { item: direct, inferred: false };

  const rawId = String(itemId || '').trim();
  if (!rawId.startsWith('__inferred__')) return { item: null, inferred: false };
  const inferredName = rawId.slice('__inferred__'.length);
  if (!inferredName) return { item: null, inferred: true };

  const inferredPaths = getCandidateOcrFilePathsForRow(row);
  const matched = inferredPaths.find((p) => path.basename(String(p || '')) === inferredName);
  if (!matched) return { item: null, inferred: true };
  const inferredUrl = ocrAbsolutePathToPublicUrl(matched);
  if (!inferredUrl) return { item: null, inferred: true };
  return {
    item: {
      id: rawId,
      ocrUrl: inferredUrl,
      ocrLabel: path.basename(matched),
      ocrEngine: '',
      lineCount: 0,
      segmentCount: 0,
      createdAt: String(row?.updated_at || row?.created_at || new Date().toISOString())
    },
    inferred: true
  };
}

app.get('/api/admin/ocr-records', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(20, Math.min(2000, Number(req.query.limit) || 500));
    const params = [limit];
    let whereSql = '';
    if (q) {
      params.push(`%${q}%`);
      whereSql = 'WHERE COALESCE(title, \'\') ILIKE $2 OR COALESCE(file_name, \'\') ILIKE $2';
    }
    const result = await pool.query(
      `
        SELECT id, title, file_name, type, owner, updated_at, dc_metadata
        FROM assets
        ${whereSql}
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      params
    );

    const records = [];
    result.rows.forEach((row) => {
      if (records.length >= limit) return;
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      let items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
      if (!items.length) {
        const inferredPaths = getCandidateOcrFilePathsForRow(row);
        if (inferredPaths.length) {
          const first = inferredPaths[0];
          const inferredUrl = ocrAbsolutePathToPublicUrl(first);
          if (inferredUrl) {
            items = [{
              id: `__inferred__${path.basename(first)}`,
              ocrUrl: inferredUrl,
              ocrLabel: path.basename(first),
              ocrEngine: '',
              lineCount: 0,
              segmentCount: 0,
              createdAt: String(row.updated_at || row.created_at || new Date().toISOString())
            }];
          }
        }
      }
      if (!items.length) return;
      const activeUrl = String(dc.videoOcrUrl || '').trim();
      items.forEach((item) => {
        if (records.length >= limit) return;
        const label = String(item.ocrLabel || '').trim();
        const url = String(item.ocrUrl || '').trim();
        const urlFileName = path.basename(url || '');
        const lineCount = Number(item.lineCount || 0);
        const segmentCount = Number(item.segmentCount || 0);
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          ocrLabel: label || 'video-ocr',
          ocrUrl: url,
          ocrEngine: String(item.ocrEngine || ''),
          lineCount: Number.isFinite(lineCount) ? lineCount : 0,
          segmentCount: Number.isFinite(segmentCount) ? segmentCount : 0,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json({ records });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load OCR records' });
  }
});

app.patch('/api/admin/ocr-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.ocrLabel || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'ocrLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'OCR record not found' });
    items[idx] = { ...items[idx], ocrLabel: nextLabel };
    const activeUrl = String(dc.videoOcrUrl || '').trim();
    const activeItem = items.find((it) => String(it.ocrUrl || '').trim() === activeUrl) || items[items.length - 1] || null;
    const updatedDc = {
      ...dc,
      videoOcrItems: items,
      videoOcrUrl: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
      videoOcrLabel: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
      videoOcrEngine: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
      videoOcrLineCount: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
      videoOcrSegmentCount: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update OCR record' });
  }
});

app.delete('/api/admin/ocr-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const nextItems = items.filter((item) => String(item.id || '') !== itemId);
    const prevActiveUrl = String(dc.videoOcrUrl || '').trim();
    let nextActive = nextItems.find((it) => String(it.ocrUrl || '').trim() === prevActiveUrl) || null;
    if (!nextActive && nextItems.length) nextActive = nextItems[nextItems.length - 1];
    const updatedDc = {
      ...dc,
      videoOcrItems: nextItems,
      videoOcrUrl: nextActive ? String(nextActive.ocrUrl || '').trim() : '',
      videoOcrLabel: nextActive ? String(nextActive.ocrLabel || '').trim() : '',
      videoOcrEngine: nextActive ? String(nextActive.ocrEngine || '').trim() : '',
      videoOcrLineCount: nextActive ? Math.max(0, Number(nextActive.lineCount) || 0) : 0,
      videoOcrSegmentCount: nextActive ? Math.max(0, Number(nextActive.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await pool.query(
      'DELETE FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2',
      [assetId, String(target.ocrUrl || '').trim()]
    );

    if (deleteFile) {
      const filePath = publicUploadUrlToAbsolutePath(String(target.ocrUrl || '').trim());
      if (filePath && filePath.startsWith(OCR_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_error) {}
      }
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete OCR record' });
  }
});

function computeOcrStatsFromContent(content) {
  const text = String(content || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^WEBVTT$/i.test(line));
  const segmentCount = (text.match(/\[[0-9:.]+\s*-->\s*[0-9:.]+\]/g) || []).length;
  return {
    lineCount: lines.length,
    segmentCount: segmentCount > 0 ? segmentCount : lines.length
  };
}

app.get('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const item = resolved.item;
    if (!item) return res.status(404).json({ error: 'OCR record not found' });
    const filePath = publicUploadUrlToAbsolutePath(String(item.ocrUrl || '').trim());
    if (!filePath || !filePath.startsWith(OCR_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, ocrUrl: item.ocrUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read OCR content' });
  }
});

app.patch('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const content = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const target = resolved.item;
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    let idx = items.findIndex((it) => String(it.id || '') === itemId);
    const filePath = publicUploadUrlToAbsolutePath(String(target.ocrUrl || '').trim());
    if (!filePath || !filePath.startsWith(OCR_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    const stats = computeOcrStatsFromContent(content);
    if (idx < 0) {
      // First edit of an inferred OCR file: persist it as a managed OCR item.
      items.push({
        id: nanoid(),
        ocrUrl: String(target.ocrUrl || '').trim(),
        ocrLabel: buildOcrDisplayLabel({
          assetTitle: String(row?.title || ''),
          fileName: String(row?.file_name || ''),
          createdAt: new Date().toISOString(),
          engine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
          version: items.length + 1
        }),
        ocrEngine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0),
        createdAt: new Date().toISOString()
      });
      idx = items.length - 1;
    } else {
      items[idx] = {
        ...target,
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0)
      };
    }
    const persistedItem = items[idx] || null;
    const activeUrl = String(dc.videoOcrUrl || '').trim();
    const activeItem = items.find((it) => String(it.ocrUrl || '').trim() === activeUrl) || persistedItem;
    const updatedDc = {
      ...dc,
      videoOcrItems: items,
      videoOcrUrl: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
      videoOcrLabel: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
      videoOcrEngine: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
      videoOcrLineCount: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
      videoOcrSegmentCount: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await syncOcrSegmentIndexForAsset(assetId, String(target.ocrUrl || '').trim(), {
      sourceEngine: String(target.ocrEngine || 'paddle').trim(),
      lang: ''
    });
    return res.json({ ok: true, lineCount: stats.lineCount, segmentCount: stats.segmentCount });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save OCR content' });
  }
});

function getSubtitleItemsFromDc(dcMetadata = {}) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let items = sanitizeSubtitleItems(dc.subtitleItems);
  if (!items.length && String(dc.subtitleUrl || '').trim()) {
    items = [{
      id: nanoid(),
      subtitleUrl: String(dc.subtitleUrl || '').trim(),
      subtitleLang: normalizeSubtitleLang(dc.subtitleLang),
      subtitleLabel: String(dc.subtitleLabel || '').trim() || 'subtitle',
      createdAt: new Date().toISOString()
    }];
  }
  return items;
}

function findSubtitleMatchInText(text, queryNorm) {
  return findSubtitleMatchesInText(text, queryNorm, 1)[0] || null;
}

app.get('/api/admin/subtitle-records', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLocaleLowerCase('tr');
    const limit = Math.max(20, Math.min(2000, Number(req.query.limit) || 500));
    const result = await pool.query(
      `
        SELECT id, title, file_name, type, owner, updated_at, dc_metadata
        FROM assets
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      [limit]
    );

    const records = [];
    result.rows.forEach((row) => {
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const items = getSubtitleItemsFromDc(dc);
      if (!items.length) return;
      const activeUrl = String(dc.subtitleUrl || '').trim();
      items.forEach((item) => {
        const label = String(item.subtitleLabel || '').trim();
        const lang = normalizeSubtitleLang(item.subtitleLang);
        const url = String(item.subtitleUrl || '').trim();
        const hitText = `${row.title || ''} ${row.file_name || ''} ${label} ${lang} ${url}`.toLocaleLowerCase('tr');
        if (q && !hitText.includes(q)) return;
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          subtitleLabel: label || 'subtitle',
          subtitleLang: lang,
          subtitleUrl: url,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json({ records });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load subtitle records' });
  }
});

app.patch('/api/admin/subtitle-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.subtitleLabel || '').trim();
    const nextLang = normalizeSubtitleLang(req.body?.subtitleLang || 'tr');
    const setActive = Boolean(req.body?.setActive);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'subtitleLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    items[idx] = { ...items[idx], subtitleLabel: nextLabel, subtitleLang: nextLang };

    const prevActive = String(dc.subtitleUrl || '').trim();
    const chosen = setActive
      ? items[idx]
      : (items.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || items[idx]);
    const updatedDc = {
      ...dc,
      subtitleItems: items,
      subtitleUrl: String(chosen.subtitleUrl || '').trim(),
      subtitleLabel: String(chosen.subtitleLabel || '').trim(),
      subtitleLang: normalizeSubtitleLang(chosen.subtitleLang)
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update subtitle record' });
  }
});

app.delete('/api/admin/subtitle-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'Subtitle record not found' });

    const nextItems = items.filter((item) => String(item.id || '') !== itemId);
    const prevActive = String(dc.subtitleUrl || '').trim();
    let nextActive = nextItems.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || null;
    if (!nextActive && nextItems.length) nextActive = nextItems[nextItems.length - 1];
    const updatedDc = {
      ...dc,
      subtitleItems: nextItems,
      subtitleUrl: nextActive ? String(nextActive.subtitleUrl || '').trim() : '',
      subtitleLabel: nextActive ? String(nextActive.subtitleLabel || '').trim() : '',
      subtitleLang: nextActive ? normalizeSubtitleLang(nextActive.subtitleLang) : ''
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}

    if (deleteFile) {
      const filePath = publicUploadUrlToAbsolutePath(String(target.subtitleUrl || '').trim());
      if (filePath && filePath.startsWith(SUBTITLES_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_error) {}
      }
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete subtitle record' });
  }
});

app.get('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const item = items.find((it) => String(it.id || '') === itemId);
    if (!item) return res.status(404).json({ error: 'Subtitle record not found' });
    const filePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
    if (!filePath || !filePath.startsWith(SUBTITLES_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, subtitleUrl: item.subtitleUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read subtitle content' });
  }
});

app.patch('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const rawContent = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((it) => String(it.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    const item = items[idx];
    const filePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
    if (!filePath || !filePath.startsWith(SUBTITLES_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const nextContent = ext === '.vtt'
      ? normalizeVttContent(rawContent)
      : String(rawContent || '').replace(/\r\n?/g, '\n');
    fs.writeFileSync(filePath, nextContent, 'utf8');
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify({ ...dc, subtitleItems: items }), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save subtitle content' });
  }
});

app.get('/api/admin/text-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
    const assetRes = await pool.query(
      `
        SELECT id, title, file_name, type, dc_metadata, updated_at
        FROM assets
        ORDER BY updated_at DESC
        LIMIT 800
      `
    );
    const out = [];
    for (const row of assetRes.rows) {
      const assetTitle = String(row.title || row.file_name || row.id || '');
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};

      const subtitleItems = getSubtitleItemsFromDc(dc);
      for (const item of subtitleItems) {
        const subtitlePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
        if (!subtitlePath || !fs.existsSync(subtitlePath)) continue;
        let raw = '';
        try { raw = fs.readFileSync(subtitlePath, 'utf8'); } catch (_error) { continue; }
        const subtitleMatches = findSubtitleMatchesInText(raw, q, Math.max(1, limit - out.length));
        for (const cue of subtitleMatches) {
          out.push({
            source: 'subtitle',
            assetId: row.id,
            assetTitle,
            label: String(item.subtitleLabel || item.subtitleLang || 'subtitle'),
            timecode: formatTimecode(Number(cue.startSec || 0)),
            startSec: Number(cue.startSec || 0),
            text: String(cue.cueText || '')
          });
          if (out.length >= limit) return res.json({ results: out });
        }
      }

      const ocrHit = await findOcrMatchForAssetRow(row, q);
      if (ocrHit) {
        out.push({
          source: 'ocr',
          assetId: row.id,
          assetTitle,
          label: String(dc.videoOcrLabel || 'video-ocr'),
          timecode: formatTimecode(Number(ocrHit.startSec || 0)),
          startSec: Number(ocrHit.startSec || 0),
          text: String(ocrHit.line || '')
        });
        if (out.length >= limit) return res.json({ results: out });
      }
    }
    return res.json({ results: out });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to run combined text search' });
  }
});

app.get('/api/admin/workflow-tracking', async (_req, res) => {
  try {
    const [statusCounts, typeCounts, totals, proxyRows] = await Promise.all([
      pool.query(
        `
          SELECT status, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY status
          ORDER BY status
        `
      ),
      pool.query(
        `
          SELECT type, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY type
          ORDER BY type
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_all,
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_active,
            COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS total_trash
          FROM assets
        `
      ),
      pool.query(
        `
          SELECT id, deleted_at, type, mime_type, file_name, proxy_url
          FROM assets
        `
      )
    ]);

    const statusMap = Object.fromEntries(WORKFLOW.map((s) => [s, 0]));
    statusCounts.rows.forEach((row) => {
      statusMap[row.status] = row.count;
    });

    const types = {};
    typeCounts.rows.forEach((row) => {
      types[row.type] = row.count;
    });

    const proxies = { ready: 0, missing: 0 };
    proxyRows.rows.forEach((row) => {
      if (row.deleted_at) return;
      const isVideo = isVideoCandidate({
        mimeType: row.mime_type,
        fileName: row.file_name,
        declaredType: row.type
      });
      if (!isVideo) return;
      if (hasStoredFile(row.proxy_url, 'proxies')) proxies.ready += 1;
      else proxies.missing += 1;
    });

    return res.json({
      totals: totals.rows[0],
      workflow: statusMap,
      types,
      proxies
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load workflow tracking' });
  }
});

app.get('/api/admin/settings', async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    return res.json(settings);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.patch('/api/admin/settings', async (req, res) => {
  try {
    const current = await getAdminSettings();
    const next = {
      ...current,
      workflowTrackingEnabled: Object.prototype.hasOwnProperty.call(req.body, 'workflowTrackingEnabled')
        ? Boolean(req.body.workflowTrackingEnabled)
        : current.workflowTrackingEnabled,
      autoProxyBackfillOnUpload: Object.prototype.hasOwnProperty.call(req.body, 'autoProxyBackfillOnUpload')
        ? Boolean(req.body.autoProxyBackfillOnUpload)
        : current.autoProxyBackfillOnUpload,
      playerUiMode: Object.prototype.hasOwnProperty.call(req.body, 'playerUiMode')
        ? normalizePlayerUiMode(req.body.playerUiMode)
        : normalizePlayerUiMode(current.playerUiMode),
      ocrDefaultAdvancedMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultAdvancedMode')
        ? Boolean(req.body.ocrDefaultAdvancedMode)
        : current.ocrDefaultAdvancedMode,
      ocrDefaultTurkishAiCorrect: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultTurkishAiCorrect')
        ? Boolean(req.body.ocrDefaultTurkishAiCorrect)
        : current.ocrDefaultTurkishAiCorrect,
      ocrDefaultEnableBlurFilter: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableBlurFilter')
        ? Boolean(req.body.ocrDefaultEnableBlurFilter)
        : current.ocrDefaultEnableBlurFilter,
      ocrDefaultEnableRegionMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableRegionMode')
        ? Boolean(req.body.ocrDefaultEnableRegionMode)
        : current.ocrDefaultEnableRegionMode,
      ocrDefaultIgnoreStaticOverlays: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultIgnoreStaticOverlays')
        ? Boolean(req.body.ocrDefaultIgnoreStaticOverlays)
        : current.ocrDefaultIgnoreStaticOverlays,
      subtitleStyle: Object.prototype.hasOwnProperty.call(req.body, 'subtitleStyle')
        ? normalizeSubtitleStyle(req.body.subtitleStyle)
        : normalizeSubtitleStyle(current.subtitleStyle),
      auditRetentionDays: Object.prototype.hasOwnProperty.call(req.body, 'auditRetentionDays')
        ? normalizeAuditRetentionDays(req.body.auditRetentionDays)
        : normalizeAuditRetentionDays(current.auditRetentionDays),
      apiTokenEnabled: Object.prototype.hasOwnProperty.call(req.body, 'apiTokenEnabled')
        ? Boolean(req.body.apiTokenEnabled)
        : current.apiTokenEnabled,
      apiToken: Object.prototype.hasOwnProperty.call(req.body, 'apiToken')
        ? String(req.body.apiToken || '').trim()
        : current.apiToken,
      oidcBearerEnabled: Object.prototype.hasOwnProperty.call(req.body, 'oidcBearerEnabled')
        ? Boolean(req.body.oidcBearerEnabled)
        : current.oidcBearerEnabled,
      oidcIssuerUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcIssuerUrl')
        ? String(req.body.oidcIssuerUrl || '').trim()
        : current.oidcIssuerUrl,
      oidcJwksUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcJwksUrl')
        ? String(req.body.oidcJwksUrl || '').trim()
        : current.oidcJwksUrl,
      oidcAudience: Object.prototype.hasOwnProperty.call(req.body, 'oidcAudience')
        ? String(req.body.oidcAudience || '').trim()
        : current.oidcAudience
    };
    const saved = await saveAdminSettings(next);
    cleanupAuditEvents?.(saved.auditRetentionDays).catch(() => {});
    return res.json(saved);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/admin/audit-events', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const where = [];
    const values = [];
    const action = String(req.query.action || '').trim();
    const actor = String(req.query.actor || '').trim();
    const target = String(req.query.target || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    if (action) {
      values.push(action);
      where.push(`action = $${values.length}`);
    }
    if (actor) {
      values.push(`%${actor.toLowerCase()}%`);
      where.push(`LOWER(actor) LIKE $${values.length}`);
    }
    if (target) {
      const elasticTargetIds = await suggestAssetIdsElastic?.(target, 100).catch(() => null);
      const targetConditions = [];
      values.push(`%${target.toLowerCase()}%`);
      targetConditions.push(`LOWER(target_id) LIKE $${values.length}`);
      targetConditions.push(`LOWER(target_title) LIKE $${values.length}`);
      if (Array.isArray(elasticTargetIds) && elasticTargetIds.length) {
        values.push(elasticTargetIds);
        targetConditions.push(`target_id = ANY($${values.length}::text[])`);
      }
      where.push(`(${targetConditions.join(' OR ')})`);
    }
    if (from) {
      values.push(from);
      where.push(`created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      where.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    values.push(limit);
    const result = await pool.query(
      `
        SELECT id, created_at, actor, action, target_type, target_id, target_title, client_medium, details, ip, user_agent
        FROM audit_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      events: result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actor: row.actor,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        targetTitle: row.target_title,
        clientMedium: row.client_medium || '',
        details: row.details || {},
        ip: row.ip,
        userAgent: row.user_agent
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load audit events' });
  }
});

app.get('/api/admin/user-permissions', async (req, res) => {
  try {
    const saved = await getUserPermissionsSettings();
    const kcData = await fetchKeycloakUsers();
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    if (!kcUsers.length) {
      return res.status(503).json({ error: 'Failed to fetch users from Keycloak' });
    }
    const permissionDefaultsByUser = await fetchKeycloakUserPermissionDefaults(kcUsers, kcData?.realmByUsername);
    const usernames = new Set();
    kcUsers.forEach((row) => {
      const username = String(row?.username || '').trim().toLowerCase();
      if (username) usernames.add(username);
    });
    Object.keys(saved || {}).forEach((k) => {
      const username = String(k || '').trim().toLowerCase();
      if (!username) return;
      if (usernames.has(username)) usernames.add(username);
    });

    const users = Array.from(usernames)
      .sort((a, b) => a.localeCompare(b))
      .map((username) => {
        const defaults = permissionDefaultsByUser.has(username)
          ? permissionDefaultsByUser.get(username)
          : resolvePermissionKeysFromPrincipals({ username }).permissionKeys;
        const effective = normalizePermissionEntry(saved?.[username], defaults);
        return {
          username,
          permissionKeys: effective.permissionKeys,
          adminPageAccess: effective.adminPageAccess,
          textAdminAccess: effective.textAdminAccess,
          metadataEdit: effective.metadataEdit,
          assetDelete: effective.assetDelete,
          pdfAdvancedTools: effective.pdfAdvancedTools
        };
      });
    return res.json({
      users,
      availablePermissions: getPermissionDefinitionsPayload(),
      source: kcUsers.length ? 'keycloak' : 'fallback'
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

app.patch('/api/admin/user-permissions/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });
    const kcData = await fetchKeycloakUsers();
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    if (!kcUsers.length) {
      return res.status(503).json({ error: 'Failed to fetch users from Keycloak' });
    }
    const existsInKeycloak = kcUsers.some((row) => String(row?.username || '').trim().toLowerCase() === username);
    if (!existsInKeycloak) {
      return res.status(404).json({ error: 'User not found in Keycloak realm' });
    }

    const current = await getUserPermissionsSettings();
    const requestedPermissionKeys = Array.isArray(req.body?.permissionKeys)
      ? req.body.permissionKeys.filter((key) => PERMISSION_KEYS.includes(String(key || '').trim()))
      : null;
    const nextEntry = normalizePermissionEntry(
      {
        permissionKeys: requestedPermissionKeys,
        adminPageAccess: req.body?.adminPageAccess,
        textAdminAccess: req.body?.textAdminAccess,
        metadataEdit: req.body?.metadataEdit,
        assetDelete: req.body?.assetDelete,
        pdfAdvancedTools: req.body?.pdfAdvancedTools
      },
      resolvePermissionKeysFromPrincipals({ username }).permissionKeys
    );
    const next = {
      ...current,
      [username]: nextEntry
    };
    await saveUserPermissionsSettings(next);
    return res.json({
      username,
      permissionKeys: nextEntry.permissionKeys,
      ...nextEntry
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save user permissions' });
  }
});

app.post('/api/admin/api-token/rotate', async (_req, res) => {
  try {
    const current = await getAdminSettings();
    const next = {
      ...current,
      apiToken: generateApiToken()
    };
    const saved = await saveAdminSettings(next);
    return res.json({ apiToken: saved.apiToken });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to rotate API token' });
  }
});

app.get('/api/admin/runtime-diagnostics', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(300, Number(req.query.limit) || 100));
    return res.json({
      activeUsers: typeof getActiveUsers === 'function' ? getActiveUsers() : [],
      errors: typeof getRuntimeErrorLogs === 'function' ? getRuntimeErrorLogs(limit) : []
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load runtime diagnostics' });
  }
});

function getDirSizeAndFiles(rootDir) {
  let totalBytes = 0;
  let totalFiles = 0;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    entries.forEach((entry) => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      totalFiles += 1;
      try {
        const st = fs.statSync(abs);
        totalBytes += Math.max(0, Number(st.size) || 0);
      } catch (_error) {}
    });
  }
  return { totalBytes, totalFiles };
}

function getFsFreeAndTotal(targetDir) {
  try {
    if (typeof fs.statfsSync !== 'function') {
      return { freeBytes: 0, totalBytes: 0 };
    }
    const st = fs.statfsSync(targetDir);
    const blockSize = Math.max(0, Number(st.bsize || st.frsize || 0));
    const freeBlocks = Math.max(0, Number(st.bavail || st.bfree || 0));
    const totalBlocks = Math.max(0, Number(st.blocks || 0));
    return {
      freeBytes: blockSize * freeBlocks,
      totalBytes: blockSize * totalBlocks
    };
  } catch (_error) {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

async function checkHttpService(url, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status
    };
  } catch (_error) {
    clearTimeout(timer);
    return { ok: false, status: 0 };
  }
}

app.get('/api/admin/system-health', async (req, res) => {
  try {
    const forceRefresh = String(req.query?.refresh || '').trim() === '1';
    const nowMs = Date.now();
    if (!forceRefresh && systemHealthCache.value && systemHealthCache.expiresAt > nowMs) {
      return res.json({
        ...systemHealthCache.value,
        cached: true,
        cacheTtlSeconds: Math.max(0, Math.ceil((systemHealthCache.expiresAt - nowMs) / 1000))
      });
    }
    const buildHealthMediaJobSummary = (row) => {
      if (!row) return null;
      const jobType = normalizeMediaJobType(row.job_type);
      const mapped = jobType === 'subtitle' ? mapSubtitleJobFromDbRow(row) : mapVideoOcrJobFromDbRow(row);
      return {
        jobId: mapped.jobId,
        assetId: mapped.assetId,
        assetTitle: String(row.asset_title || row.title || '').trim(),
        status: mapped.status,
        progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
        updatedAt: mapped.updatedAt,
        finishedAt: mapped.finishedAt,
        warning: String(mapped.warning || ''),
        error: String(mapped.error || ''),
        label: jobType === 'subtitle' ? String(mapped.subtitleLabel || '') : String(mapped.resultLabel || ''),
        model: jobType === 'subtitle' ? String(mapped.model || '') : '',
        engine: jobType === 'video_ocr' ? String(mapped.ocrEngine || '') : '',
        lineCount: jobType === 'video_ocr' ? Number(mapped.lineCount || 0) : 0,
        segmentCount: jobType === 'video_ocr' ? Number(mapped.segmentCount || 0) : 0
      };
    };

    const [proxyRunning, proxyFailed] = [
      Array.from(proxyJobs.values()).filter((job) => ['running', 'queued'].includes(String(job.status || ''))).length,
      Array.from(proxyJobs.values()).filter((job) => String(job.status || '') === 'failed').length
    ];
    const mediaJobsStats = await pool.query(
      `
        SELECT job_type, status, COUNT(*)::int AS count
        FROM media_processing_jobs
        WHERE job_type IN ('subtitle', 'video_ocr')
        GROUP BY job_type, status
      `
    );
    const mediaCounts = {};
    mediaJobsStats.rows.forEach((row) => {
      const key = `${String(row.job_type || '')}:${String(row.status || '')}`;
      mediaCounts[key] = Number(row.count || 0);
    });
    const subtitleRunning = (mediaCounts['subtitle:running'] || 0) + (mediaCounts['subtitle:queued'] || 0);
    const ocrRunning = (mediaCounts['video_ocr:running'] || 0) + (mediaCounts['video_ocr:queued'] || 0);
    const subtitleFailed = mediaCounts['subtitle:failed'] || 0;
    const ocrFailed = mediaCounts['video_ocr:failed'] || 0;

    const { totalBytes: uploadsBytes, totalFiles: uploadsFiles } = getDirSizeAndFiles(UPLOADS_DIR);
    const fsInfo = getFsFreeAndTotal(UPLOADS_DIR);

    const assetRows = await pool.query(
      'SELECT id, proxy_url, thumbnail_url, dc_metadata FROM assets ORDER BY updated_at DESC LIMIT 5000'
    );
    let missingProxy = 0;
    let missingThumbnail = 0;
    let missingSubtitle = 0;
    let missingOcr = 0;
    assetRows.rows.forEach((row) => {
      const proxyAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));
      if (proxyAbs && !fs.existsSync(proxyAbs)) missingProxy += 1;
      const thumbAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.thumbnail_url, 'thumbnails'));
      if (thumbAbs && !fs.existsSync(thumbAbs)) missingThumbnail += 1;
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subUrl = String(dc.subtitleUrl || '').trim();
      const subAbs = subUrl ? publicUploadUrlToAbsolutePath(subUrl) : '';
      if (subAbs && !fs.existsSync(subAbs)) missingSubtitle += 1;
      const ocrUrl = pickLatestVideoOcrUrlFromDc(dc);
      const ocrAbs = ocrUrl ? publicUploadUrlToAbsolutePath(ocrUrl) : '';
      if (ocrAbs && !fs.existsSync(ocrAbs)) missingOcr += 1;
    });

    const [postgresCheck, elasticCheck, keycloakCheck, oauth2ProxyCheck] = await Promise.all([
      pool.query('SELECT 1 AS ok').then(() => ({ ok: true, status: 200 })).catch(() => ({ ok: false, status: 0 })),
      checkHttpService('http://elasticsearch:9200'),
      checkHttpService('http://keycloak:8080/realms/mam'),
      checkHttpService('http://oauth2-proxy:4180/ping')
    ]);

    const recentJobsResult = await pool.query(
      `
        SELECT mpj.*, a.title AS asset_title
        FROM media_processing_jobs mpj
        LEFT JOIN assets a ON a.id = mpj.asset_id
        WHERE mpj.job_type IN ('subtitle', 'video_ocr')
        ORDER BY mpj.updated_at DESC
        LIMIT 200
      `
    );
    const recentJobs = {
      subtitle: { active: null, latestCompleted: null, latestFailed: null },
      ocr: { active: null, latestCompleted: null, latestFailed: null }
    };
    recentJobsResult.rows.forEach((row) => {
      const typeKey = String(row.job_type || '') === 'video_ocr' ? 'ocr' : 'subtitle';
      const status = normalizeMediaJobStatus(row.status);
      const summary = buildHealthMediaJobSummary(row);
      if (!summary) return;
      if (!recentJobs[typeKey].active && (status === 'running' || status === 'queued')) {
        recentJobs[typeKey].active = summary;
      }
      if (!recentJobs[typeKey].latestCompleted && status === 'completed') {
        recentJobs[typeKey].latestCompleted = summary;
      }
      if (!recentJobs[typeKey].latestFailed && status === 'failed') {
        recentJobs[typeKey].latestFailed = summary;
      }
    });

    const payload = {
      disk: {
        uploadsBytes,
        uploadsFiles,
        fsFreeBytes: fsInfo.freeBytes,
        fsTotalBytes: fsInfo.totalBytes
      },
      jobs: {
        proxyRunning,
        subtitleRunning,
        ocrRunning,
        proxyFailed,
        subtitleFailed,
        ocrFailed
      },
      services: {
        app: { ok: true, status: 200 },
        postgres: postgresCheck,
        elasticsearch: elasticCheck,
        keycloak: keycloakCheck,
        oauth2Proxy: oauth2ProxyCheck
      },
      integrity: {
        missingProxy,
        missingThumbnail,
        missingSubtitle,
        missingOcr
      },
      recentJobs
    };
    systemHealthCache.expiresAt = Date.now() + SYSTEM_HEALTH_CACHE_TTL_MS;
    systemHealthCache.value = payload;
    return res.json({ ...payload, cached: false, cacheTtlSeconds: Math.ceil(SYSTEM_HEALTH_CACHE_TTL_MS / 1000) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load system health' });
  }
});

app.get('/api/admin/ffmpeg-health', async (_req, res) => {
  try {
    const [ffmpeg, ffprobe] = await Promise.all([
      runCommandCapture('ffmpeg', ['-version']),
      runCommandCapture('ffprobe', ['-version'])
    ]);
    return res.json({
      ffmpegOk: ffmpeg.ok,
      ffprobeOk: ffprobe.ok,
      ffmpegInfo: (ffmpeg.stdout || ffmpeg.stderr).split('\n')[0] || '',
      ffprobeInfo: (ffprobe.stdout || ffprobe.stderr).split('\n')[0] || ''
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to check ffmpeg health' });
  }
});

app.post('/api/admin/search/reindex', async (_req, res) => {
  try {
    const indexed = await backfillElasticIndex();
    return res.json({ indexed });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to reindex search' });
  }
});

app.post('/api/admin/proxy-jobs', async (req, res) => {
  const running = Array.from(proxyJobs.values()).find((job) => job.status === 'running' || job.status === 'queued');
  if (running) {
    return res.status(409).json({ error: 'A proxy job is already running', job: running });
  }

  const job = createProxyJob();
  setTimeout(() => {
    runProxyJob(job.id, { includeTrash: Boolean(req.body?.includeTrash) }).catch(() => {});
  }, 0);
  return res.status(202).json(job);
});

app.get('/api/admin/proxy-jobs/:id', async (req, res) => {
  const job = proxyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Proxy job not found' });
  return res.json(job);
});

app.get('/api/admin/proxy-jobs', async (_req, res) => {
  const jobs = Array.from(proxyJobs.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.json(jobs.slice(0, 20));
});

app.get('/api/admin/assets/suggest', async (req, res) => {
  try {
    const includeTrashRaw = String(req.query.includeTrash || '1').trim().toLowerCase();
    const includeTrash = !['0', 'false', 'no'].includes(includeTrashRaw);
    const suggestions = await queryAssetSuggestions({
      q: req.query.q,
      limit: req.query.limit,
      trash: includeTrash ? 'all' : 'active'
    });
    return res.json(
      suggestions.map((row) => ({
        id: row.id,
        title: row.title,
        fileName: row.fileName,
        type: row.type,
        inTrash: row.inTrash,
        updatedAt: row.updatedAt
      }))
    );
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest assets' });
  }
});

app.post('/api/admin/proxy-tools/run', async (req, res) => {
  try {
    const assetName = String(req.body?.assetName || '').trim();
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!assetName) return res.status(400).json({ error: 'assetName is required' });
    if (!['thumbnail', 'preview', 'proxy', 'replace_asset', 'replace_pdf', 'delete_asset'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be one of: thumbnail, preview, proxy, replace_asset, replace_pdf, delete_asset' });
    }

    const like = `%${assetName}%`;
    const match = await pool.query(
      `
        SELECT *
        FROM assets
        WHERE title ILIKE $1 OR file_name ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(title) = LOWER($2) THEN 0
            WHEN LOWER(file_name) = LOWER($2) THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT 20
      `,
      [like, assetName]
    );
    if (!match.rowCount) return res.status(404).json({ error: 'Asset not found by name' });

    let row = match.rows[0];
    let info = {};

    if (mode === 'delete_asset') {
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const versionRows = (await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1', [row.id])).rows;
      const cleanupTargets = collectAssetCleanupPaths(row, versionRows);
      await pool.query('DELETE FROM asset_versions WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_ocr_segments WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM assets WHERE id = $1', [row.id]);
      await removeAssetFromCollections(row.id);
      const cleanup = cleanupAssetFiles(cleanupTargets);
      await deleteAssetFromElastic(row.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: row.id,
        targetTitle: String(row.title || row.file_name || row.id),
        details: {
          source: 'admin_proxy_tool',
          cleanupTargets: cleanupTargets.length,
          removedFiles: cleanup.removed.length
        }
      });
      info = {
        deleted: true,
        actor,
        removedFiles: cleanup.removed.length,
        cleanupErrors: cleanup.failed
      };
    } else if (mode === 'proxy') {
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Proxy generation is supported only for video assets' });
      }
      const rawBase64 = String(req.body?.fileBase64 || '').trim();
      if (rawBase64) {
        // Yönetim ekranında "Proxy üret" seçiliyken yeni dosya seçilmişse,
        // aynı işlem içinde önce ana videoyu bağlayıp sonra proxy üretiyoruz.
        const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
        let fileBuffer = null;
        try {
          fileBuffer = Buffer.from(sanitizedBase64, 'base64');
        } catch (_error) {
          return res.status(400).json({ error: 'Invalid fileBase64 payload' });
        }
        if (!fileBuffer || fileBuffer.length < 16) {
          return res.status(400).json({ error: 'Decoded file content is empty' });
        }
        const fileHash = computeBufferSha256(fileBuffer);

        const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
        const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
        const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
        if (!isVideoCandidate({ mimeType: nextMimeType, fileName: safeFileName, declaredType: row.type })) {
          return res.status(400).json({ error: 'Selected source file must be a video file' });
        }

        const nowIso = new Date().toISOString();
        const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
        const currentHash = await getAssetStoredFileHash(row, { persist: true });
        if (!(fileHash && currentHash && fileHash === currentHash)) {
          const duplicateAsset = await findDuplicateAssetByHash(fileHash, { excludeAssetId: row.id });
          if (duplicateAsset) {
            return res.status(409).json({
              error: 'An identical asset file already exists',
              code: 'duplicate_asset_content',
              existingAsset: buildDuplicateAssetPayload(duplicateAsset)
            });
          }

          const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
          const extWithDot = path.extname(safeFileName) || '';
          const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
          const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
          const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
          const absPath = path.join(storage.absoluteDir, storedName);
          const relativePath = path.join(storage.relativeDir, storedName);
          const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
          fs.writeFileSync(absPath, fileBuffer);

          const hadExistingSource = Boolean(String(row.media_url || '').trim() || String(row.source_path || '').trim());
          if (hadExistingSource) {
            const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
            const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
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
                row.id,
                `Asset Replace ${nextVersion}`,
                `File attached during proxy generation by ${actor}`,
                String(row.media_url || ''),
                String(row.source_path || ''),
                String(row.file_name || ''),
                String(row.mime_type || ''),
                String(row.thumbnail_url || ''),
                actor,
                'file_replace',
                null,
                nowIso
              ]
            );
          }

          const updated = await pool.query(
            `
              UPDATE assets
              SET media_url = $2,
                  source_path = $3,
                  file_name = $4,
                  mime_type = $5,
                  type = $6,
                  file_hash = $7,
                  proxy_url = '',
                  proxy_status = 'not_applicable',
                  thumbnail_url = '',
                  updated_at = $8
              WHERE id = $1
              RETURNING *
            `,
            [row.id, mediaUrl, absPath, safeFileName, nextMimeType, inferAssetType(row.type, nextMimeType), fileHash, nowIso]
          );
          row = updated.rows?.[0] || row;
        }
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) {
        return res.status(400).json({
          error: 'Source media not found. Choose a source video file in New Asset File, then run proxy generation again.'
        });
      }
      row = await ensureVideoProxyAndThumbnail(row, { forceProxy: true });
      info = {
        proxyUrl: resolveStoredUrl(row.proxy_url, 'proxies'),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'thumbnail') {
      const result = await regenerateVideoThumbnailForAsset(row, { timecode: req.body?.timecode });
      row = result.row;
      info = {
        thumbnailUrl: result.thumbnailUrl,
        timecode: result.timecodeSeconds == null ? '' : formatTimecode(result.timecodeSeconds)
      };
    } else if (mode === 'preview') {
      if (!isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Preview generation is supported for document assets in this tool' });
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });
      if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        row = await ensurePdfThumbnailForRow(row);
      } else {
        row = await ensureDocumentThumbnailForRow(row);
      }
      const preview = await extractPreviewContentFromFile(row, inputPath);
      info = {
        previewMode: String(preview.mode || 'text'),
        previewChars: Math.max(0, String(preview.html || preview.text || '').length),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'replace_asset' || mode === 'replace_pdf') {
      const rawBase64 = String(req.body?.fileBase64 || req.body?.pdfBase64 || '').trim();
      if (!rawBase64) return res.status(400).json({ error: 'fileBase64 is required for replace_asset' });
      const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      let fileBuffer = null;
      try {
        fileBuffer = Buffer.from(sanitizedBase64, 'base64');
      } catch (_error) {
        return res.status(400).json({ error: 'Invalid fileBase64 payload' });
      }
      if (!fileBuffer || fileBuffer.length < 16) {
        return res.status(400).json({ error: 'Decoded file content is empty' });
      }
      const fileHash = computeBufferSha256(fileBuffer);

      const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
      const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
      const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
      const currentFamily = getAssetFamily({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type });
      const newFamily = getAssetFamily({ mimeType: nextMimeType, fileName: safeFileName, declaredType: inferAssetType('', nextMimeType) });
      if (currentFamily === 'unknown' || newFamily === 'unknown' || currentFamily !== newFamily) {
        return res.status(400).json({
          error: 'New file type must match existing asset type',
          currentFamily,
          newFamily
        });
      }
      const generateThumbnail = Boolean(req.body?.generateThumbnail);
      const generatePreview = Boolean(req.body?.generatePreview);
      const nowIso = new Date().toISOString();
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const currentHash = await getAssetStoredFileHash(row, { persist: true });
      if (!(fileHash && currentHash && fileHash === currentHash)) {
        const duplicateAsset = await findDuplicateAssetByHash(fileHash, { excludeAssetId: row.id });
        if (duplicateAsset) {
          return res.status(409).json({
            error: 'An identical asset file already exists',
            code: 'duplicate_asset_content',
            existingAsset: buildDuplicateAssetPayload(duplicateAsset)
          });
        }
        const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
        const extWithDot = path.extname(safeFileName) || '';
        const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
        const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
        const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
        const absPath = path.join(storage.absoluteDir, storedName);
        const relativePath = path.join(storage.relativeDir, storedName);
        const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
        fs.writeFileSync(absPath, fileBuffer);

        const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
        const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
        const nextFileName = safeFileName;
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
            row.id,
            `Asset Replace ${nextVersion}`,
            `File replaced via admin proxy tool by ${actor}`,
            mediaUrl,
            absPath,
            nextFileName,
            nextMimeType,
            '',
            actor,
            'file_replace',
            null,
            nowIso
          ]
        );
        await pool.query(
          `
            UPDATE assets
            SET media_url = $2,
                proxy_url = '',
                proxy_status = 'not_applicable',
                source_path = $3,
                file_name = $4,
                mime_type = $5,
                type = $6,
                file_hash = $7,
                thumbnail_url = '',
                updated_at = $8
            WHERE id = $1
            RETURNING *
          `,
          [row.id, mediaUrl, absPath, nextFileName, nextMimeType, inferAssetType(row.type, nextMimeType), fileHash, nowIso]
        ).then((result) => {
          row = result.rows[0] || row;
        });
      }
      let previewChars = 0;
      if (generateThumbnail) {
        if (isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          const inputPath = resolveAssetInputPath(row);
          if (inputPath && fs.existsSync(inputPath)) {
            const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
            const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
            await generateVideoThumbnail(inputPath, thumbOut.absolutePath);
            const refreshed = await pool.query(
              `UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
              [row.id, thumbOut.publicUrl, new Date().toISOString()]
            );
            row = refreshed.rows?.[0] || row;
          }
        } else if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
          row = await ensurePdfThumbnailForRow(row);
        } else if (isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          row = await ensureDocumentThumbnailForRow(row);
        } else if (String(row.mime_type || '').toLowerCase().startsWith('image/')) {
          const nowIso2 = new Date().toISOString();
          const imageThumb = resolveStoredUrl(row.media_url, 'uploads') || row.media_url || '';
          const updated = await pool.query(
            `UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
            [row.id, imageThumb, nowIso2]
          );
          row = updated.rows?.[0] || row;
        }
      }
      if (generatePreview && isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        const inputPath = resolveAssetInputPath(row);
        if (inputPath && fs.existsSync(inputPath)) {
          const preview = await extractPreviewContentFromFile(row, inputPath);
          previewChars = Math.max(0, String(preview.html || preview.text || '').length);
        }
      }
      await indexAssetToElastic(row.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.updated',
        targetType: 'asset',
        targetId: row.id,
        targetTitle: String(row.title || row.file_name || row.id),
        details: {
          source: 'admin_proxy_tool',
          mode,
          fileName: row.file_name,
          generatedThumbnail: generateThumbnail,
          generatedPreview: generatePreview
        }
      });
      info = {
        replaced: true,
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails'),
        generatedThumbnail: generateThumbnail,
        generatedPreview: generatePreview,
        previewChars
      };
    }

    return res.json({
      ok: true,
      mode,
      matchedCount: match.rowCount,
      assetId: row.id,
      assetTitle: String(row.title || row.file_name || row.id),
      ...info,
      asset: mapAssetRow(row)
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to run proxy tool action: ${String(error?.message || 'unknown error').slice(0, 260)}` });
  }
});

}

module.exports = { registerAdminRoutes };
