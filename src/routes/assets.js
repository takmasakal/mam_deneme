const fs = require('fs');
const path = require('path');
const { parseMultipartUpload } = require('../services/multipartUploadParser');
const { createAdvancedSearchService } = require('../services/advancedSearchService');
const { createAssetListQueryService } = require('../services/assetListQueryService');

const advancedSearchService = createAdvancedSearchService();

function registerAssetRoutes(app, deps) {
  const {
    pool,
    WORKFLOW,
    requireAssetDelete,
    resolveEffectivePermissions,
    collectAssetCleanupPaths,
    cleanupAssetFiles,
    cleanupUnreferencedAssetFiles,
    removeAssetFromCollections,
    removeAssetFromElastic,
    indexAssetToElastic,
    mapAssetRow,
    mapCutRow,
    mapVersionRow,
    sanitizeDcMetadata,
    toTags,
    parseTextSearchQuery,
    parseSubtitleTextSearchQuery,
    normalizeForSearch,
    normalizeSubtitleSearchText,
    normalizeUploadDateRange,
    normalizeSortBy,
    normalizeTrashScope,
    sqlTagFold,
    sqlTextFold,
    exactNormalizedTextRegex,
    buildAssetOrderClause,
    searchAssetIdsElastic,
    searchAssetsByFuzzyQuery,
    searchOcrMatchesForAssetRows,
    searchSubtitleMatchesForAssetRow,
    searchSubtitleMatchesForAssetRows,
    ensurePdfThumbnailForRow,
    ensureDocumentThumbnailForRow,
    queryAssetSuggestions,
    findOcrMatchForAssetRow,
    buildSubtitleCueSearchWhereSql,
    formatTimecode,
    buildUserContextFromRequest,
    createAssetRecord,
    isVideoCandidate,
    computeBufferSha256,
    computeFileSha256,
    computeFileSha256Stream,
    findDuplicateAssetByHash,
    buildDuplicateAssetPayload,
    sanitizeFileName,
    getIngestStoragePath,
    buildArtifactPath,
    generateVideoProxy,
    getMediaAudioChannelCount,
    summarizeFfmpegError,
    generateVideoThumbnail,
    isPdfCandidate,
    generatePdfThumbnail,
    generatePdfFallbackThumbnail,
    isDocumentCandidate,
    generateDocumentThumbnail,
    imageDerivativeService,
    getFileExtension,
    isTextDocumentCandidate,
    getVideoDurationSeconds,
    resolvePlaybackInputPath,
    getMediaAudioStreamOptions,
    probeMediaTechnicalInfo,
    publicUploadUrlToAbsolutePath,
    resolveStoredUrl,
    buildVersionSnapshotFromRow,
    canCreateVersionForAsset,
    canManageVersionRow,
    assetAccessService,
    assetEditLockService,
    metadataEnrichmentService,
    recordAuditEvent,
    nanoid
  } = deps;

  const assetListQueryService = createAssetListQueryService({
    advancedSearchService,
    parseTextSearchQuery,
    normalizeForSearch,
    normalizeUploadDateRange,
    normalizeSortBy
  });

  async function resolveAssetAccessContext(req) {
    return assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
  }

  function appendAssetAccessWhere(where, values, context, alias = 'assets') {
    assetAccessService.appendAssetAccessWhere(where, values, context, alias);
  }

  async function loadVisibleAssetRow(req, assetId) {
    const accessContext = await resolveAssetAccessContext(req);
    const result = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = result.rows[0] || null;
    if (!row) return { status: 404, error: 'Asset not found', accessContext, row: null };
    if (!assetAccessService.canViewAsset(row, accessContext)) {
      return { status: 404, error: 'Asset not found', accessContext, row: null };
    }
    return { status: 200, accessContext, row };
  }

  function resolveAssetSourcePath(row = {}) {
    const sourcePath = String(row.source_path || '').trim();
    if (sourcePath && fs.existsSync(sourcePath)) return sourcePath;
    const mediaPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.media_url, ''));
    if (mediaPath && fs.existsSync(mediaPath)) return mediaPath;
    return '';
  }

  function resolveAssetFilePath(row = {}) {
    const sourcePath = resolveAssetSourcePath(row);
    if (sourcePath) return sourcePath;
    const proxyPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));
    if (proxyPath && fs.existsSync(proxyPath)) return proxyPath;
    return '';
  }

  function matchesNumberRange(value, range = {}, { requirePositive = false } = {}) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return false;
    if (requirePositive && number <= 0) return false;
    if (range.min !== null && range.min !== undefined && number < Number(range.min)) return false;
    if (range.max !== null && range.max !== undefined && number > Number(range.max)) return false;
    return true;
  }

  async function resolveAssetFileSize(row = {}) {
    const filePath = resolveAssetSourcePath(row);
    if (!filePath) return null;
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isFile() ? stat.size : null;
    } catch (_error) {
      return null;
    }
  }

  function resolveDerivativeUrl(value, subdir) {
    const url = resolveStoredUrl(value, subdir);
    const normalizedSubdir = String(subdir || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
    const markers = normalizedSubdir === 'proxies'
      ? ['/uploads/proxies/', '/uploads/previews/']
      : [`/uploads/${normalizedSubdir}/`];
    return url && markers.some((marker) => url.toLowerCase().includes(marker)) ? url : '';
  }

  function sendStoredAssetFile(res, filePath, row = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Asset file not found' });
    }
    const fileName = String(row.file_name || path.basename(filePath) || 'asset.bin').trim();
    const mimeType = String(row.mime_type || '').trim();
    if (mimeType) res.type(mimeType);
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Disposition', `inline; filename="${sanitizeFileName(fileName)}"`);
    return res.sendFile(filePath);
  }

  function auditDownloadResponse(req, res, row, details = {}) {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      Promise.resolve(recordAuditEvent?.(req, {
        action: 'asset.downloaded',
        targetType: 'asset',
        targetId: row?.id,
        targetTitle: String(row?.title || row?.file_name || row?.id || ''),
        details
      })).catch(() => {});
    });
  }

  async function ensureImageDerivativesForRow(row = {}) {
    if (!imageDerivativeService?.isImageCandidate({
      mimeType: row.mime_type,
      fileName: row.file_name
    })) {
      return row;
    }

    const existingProxy = resolveDerivativeUrl(row.proxy_url, 'proxies');
    const existingThumbnail = resolveDerivativeUrl(row.thumbnail_url, 'thumbnails');
    if (existingProxy && existingThumbnail) return row;

    const inputPath = resolveAssetSourcePath(row);
    if (!inputPath) return row;
    try {
      const derivatives = await imageDerivativeService.ensureImageDerivativesForUpload({
        mimeType: row.mime_type,
        fileName: row.file_name,
        inputPath,
        createdAt: row.created_at || new Date()
      });
      const updated = await pool.query(
        `
          UPDATE assets
          SET proxy_url = $2,
              proxy_status = 'ready',
              thumbnail_url = $3,
              updated_at = $4
          WHERE id = $1
          RETURNING *
        `,
        [
          row.id,
          String(derivatives.proxyUrl || '').trim(),
          String(derivatives.thumbnailUrl || derivatives.proxyUrl || '').trim(),
          new Date().toISOString()
        ]
      );
      return updated.rows?.[0] || row;
    } catch (error) {
      console.warn('Image derivative repair failed', {
        assetId: row?.id,
        fileName: row?.file_name,
        error: String(error?.message || error || '')
      });
      return row;
    }
  }

  function mapAssetRowForUser(row, accessContext) {
    const mapped = mapAssetRow(row);
    mapped.canManageVisibility = assetAccessService.canManageAssetVisibility(row, accessContext);
    mapped.canEditAsset = assetAccessService.canEditAsset(row, accessContext);
    mapped.canEditAssetMetadata = assetAccessService.canEditAssetMetadata(row, accessContext);
    mapped.canEditAssetOffice = assetAccessService.canEditAssetOffice(row, accessContext);
    mapped.canEditAssetPdf = assetAccessService.canEditAssetPdf(row, accessContext);
    mapped.canDownloadAsset = assetAccessService.canDownloadAsset(row, accessContext);
    mapped.canDeleteAsset = assetAccessService.canDeleteAsset(row, accessContext);
    return mapped;
  }

  async function rejectIfForeignEditLock(req, res, assetId) {
    if (!assetEditLockService) return false;
    const lockResult = await assetEditLockService.assertWritable(req, assetId);
    if (!lockResult.ok) {
      assetEditLockService.sendLocked(res, lockResult);
      return true;
    }
    return false;
  }

  function getUploadFileCategory({ mimeType = '', fileName = '' } = {}) {
    const mime = String(mimeType || '').toLowerCase();
    const ext = String(getFileExtension(fileName) || '').toLowerCase();
    if (mime.startsWith('video/') || ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpg', 'mpeg'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga'].includes(ext)) return 'audio';
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif'].includes(ext)) return 'photo';
    if (mime === 'application/pdf' || ext === 'pdf') return 'document';
    if ([
      'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'csv', 'sql',
      'py', 'js', 'ts', 'tsx', 'jsx', 'json', 'md', 'xml', 'yaml', 'yml', 'log',
      'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'java', 'c', 'cpp', 'h', 'hpp',
      'go', 'rs', 'rb', 'php', 'swift', 'kt'
    ].includes(ext)) return 'document';
    return 'other';
  }

  function validateDeclaredUploadType({ declaredType = '', mimeType = '', fileName = '' } = {}) {
    const declared = String(declaredType || '').trim().toLowerCase();
    if (!declared || declared === 'other') return { ok: true };
    const expected = declared === 'image' ? 'photo' : declared;
    const actual = getUploadFileCategory({ mimeType, fileName });
    if (expected === actual) return { ok: true };
    return {
      ok: false,
      expected,
      actual,
      error: 'Selected asset type does not match the uploaded file type',
      code: 'asset_type_file_mismatch'
    };
  }

  app.post('/api/assets/:id/edit-lock', async (req, res) => {
    try {
      if (!assetEditLockService) return res.status(503).json({ error: 'Edit lock service is not available' });
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      if (!assetAccessService.canEditAssetMetadata(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.userPermissions = loaded.accessContext;
      const result = await assetEditLockService.acquire(req, req.params.id, req.body?.purpose || 'edit');
      if (!result.ok) return assetEditLockService.sendLocked(res, result);
      return res.json({ locked: true, lock: result.lock });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to acquire edit lock' });
    }
  });

  app.post('/api/assets/:id/edit-lock/refresh', async (req, res) => {
    try {
      if (!assetEditLockService) return res.status(503).json({ error: 'Edit lock service is not available' });
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      if (!assetAccessService.canEditAssetMetadata(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.userPermissions = loaded.accessContext;
      const result = await assetEditLockService.refresh(req, req.params.id);
      if (!result.ok) return assetEditLockService.sendLocked(res, result);
      return res.json({ locked: true, lock: result.lock });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to refresh edit lock' });
    }
  });

  app.delete('/api/assets/:id/edit-lock', async (req, res) => {
    try {
      if (!assetEditLockService) return res.status(503).json({ error: 'Edit lock service is not available' });
      req.userPermissions = await resolveEffectivePermissions(req);
      const result = await assetEditLockService.release(req, req.params.id);
      if (!result.ok) return res.status(Number(result.status || 403)).json({ error: result.error, lock: result.lock || null });
      return res.json({ released: Boolean(result.released) });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to release edit lock' });
    }
  });

  app.get('/api/assets', async (req, res) => {
    try {
      let queryOptions;
      try {
        queryOptions = assetListQueryService.parseRequest(req);
      } catch (error) {
        return res.status(Number(error.statusCode || 500)).json({ error: error.message || 'Failed to parse asset query' });
      }
      const {
        q,
        pageLimit,
        pageOffset,
        parsedAssetQuery,
        ocrQ,
        subtitleQ,
        tag,
        type,
        owner,
        types,
        status,
        trash,
        ensurePreview,
        advancedDefinition,
        advancedActive,
        dateRange,
        durationRange,
        fileSizeRange,
        dateField,
        normalizedSortBy
      } = queryOptions;
      const baseWhere = [];
      const baseValues = [];
      let rankedIds = null;
      const searchMeta = {
        q: { didYouMean: '', fuzzyUsed: false, highlightQuery: q },
        ocrQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: ocrQ },
        subtitleQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: subtitleQ }
      };
      const assetFileSizeCache = new Map();
      const getAssetFileSize = async (row) => {
        const key = String(row?.id || row?.media_url || '');
        if (!assetFileSizeCache.has(key)) assetFileSizeCache.set(key, resolveAssetFileSize(row));
        return assetFileSizeCache.get(key);
      };
      const accessContext = await resolveAssetAccessContext(req);
      if (advancedActive && !accessContext?.canAccessAdvancedSearch) {
        return res.status(403).json({ error: 'Advanced search permission is required' });
      }
  
      if (trash === 'trash') {
        baseWhere.push('deleted_at IS NOT NULL');
      } else if (trash !== 'all') {
        baseWhere.push('deleted_at IS NULL');
      }
      if (tag && !advancedActive) {
        baseValues.push(tag);
        const tagParam = `$${baseValues.length}`;
        baseWhere.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
      }
      if (owner) {
        baseValues.push(`%${owner.toLowerCase()}%`);
        baseWhere.push(`LOWER(owner) LIKE $${baseValues.length}`);
      }
      if (type && !advancedActive) {
        baseValues.push(type.toLowerCase());
        baseWhere.push(`LOWER(type) = $${baseValues.length}`);
      }
      if (dateRange.from) {
        baseValues.push(dateRange.from);
        baseWhere.push(`${dateField}_at >= $${baseValues.length}`);
      }
      if (dateRange.to) {
        baseValues.push(dateRange.to);
        baseWhere.push(`${dateField}_at <= $${baseValues.length}`);
      }
      if (types.length) {
        baseValues.push(types);
        baseWhere.push(`
          (
            CASE
              WHEN LOWER(type) = 'image' THEN 'photo'
              WHEN LOWER(type) = 'file' THEN 'other'
              ELSE LOWER(type)
            END
          ) = ANY($${baseValues.length}::text[])
        `);
      }
      if (status) {
        baseValues.push(status.toLowerCase());
        baseWhere.push(`LOWER(status) = $${baseValues.length}`);
      }
      appendAssetAccessWhere(baseWhere, baseValues, accessContext, 'assets');
  
      const buildAssetTextWhere = (parsedQuery) => {
        const clauses = [];
        const params = [];
        const pushAssetQueryGroup = (term, options = {}) => {
          const exact = Boolean(options.exact);
          const negate = Boolean(options.negate);
          const joiner = negate ? 'AND' : 'OR';
          if (exact) {
            params.push(exactNormalizedTextRegex(term));
            const idx = baseValues.length + params.length;
            clauses.push(`(
              ${sqlTextFold('title')} ${negate ? '!~' : '~'} $${idx}
              ${joiner} ${sqlTextFold('description')} ${negate ? '!~' : '~'} $${idx}
              ${joiner} ${sqlTextFold('owner')} ${negate ? '!~' : '~'} $${idx}
              ${joiner} ${sqlTextFold("dc_metadata::text")} ${negate ? '!~' : '~'} $${idx}
              ${joiner} ${negate ? 'NOT ' : ''}EXISTS (
                SELECT 1
                FROM asset_cuts c
                WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} ~ $${idx}
              )
            )`);
            return;
          }
          params.push(`%${term}%`);
          const idx = baseValues.length + params.length;
          clauses.push(`(
            ${sqlTextFold('title')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
            ${joiner} ${sqlTextFold('description')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
            ${joiner} ${sqlTextFold('owner')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
            ${joiner} ${sqlTextFold("dc_metadata::text")} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
            ${joiner} ${negate ? 'NOT ' : ''}EXISTS (
              SELECT 1
              FROM asset_cuts c
              WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} LIKE $${idx}
            )
          )`);
        };
  
        if (parsedQuery.hasOperators) {
          parsedQuery.mustInclude.forEach((term) => pushAssetQueryGroup(term));
          parsedQuery.mustIncludeExact.forEach((term) => pushAssetQueryGroup(term, { exact: true }));
          parsedQuery.mustExclude.forEach((term) => pushAssetQueryGroup(term, { negate: true }));
          parsedQuery.mustExcludeExact.forEach((term) => pushAssetQueryGroup(term, { exact: true, negate: true }));
          if (parsedQuery.optional.length > 0 || parsedQuery.optionalExact.length > 0) {
            const optionalGroups = [];
            parsedQuery.optional.forEach((term) => {
              params.push(`%${term}%`);
              const idx = baseValues.length + params.length;
              optionalGroups.push(`(
                ${sqlTextFold('title')} LIKE $${idx}
                OR ${sqlTextFold('description')} LIKE $${idx}
                OR ${sqlTextFold('owner')} LIKE $${idx}
                OR ${sqlTextFold("dc_metadata::text")} LIKE $${idx}
                OR EXISTS (
                  SELECT 1
                  FROM asset_cuts c
                  WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} LIKE $${idx}
                )
              )`);
            });
            parsedQuery.optionalExact.forEach((term) => {
              params.push(exactNormalizedTextRegex(term));
              const idx = baseValues.length + params.length;
              optionalGroups.push(`(
                ${sqlTextFold('title')} ~ $${idx}
                OR ${sqlTextFold('description')} ~ $${idx}
                OR ${sqlTextFold('owner')} ~ $${idx}
                OR ${sqlTextFold("dc_metadata::text")} ~ $${idx}
                OR EXISTS (
                  SELECT 1
                  FROM asset_cuts c
                  WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} ~ $${idx}
                )
              )`);
            });
            clauses.push(`(${optionalGroups.join(' OR ')})`);
          }
        } else {
          pushAssetQueryGroup(parsedQuery.raw);
        }
  
        return { clauses, params };
      };
  
      const fetchAssetRows = async (extraWhere = [], extraParams = [], options = {}) => {
        const queryValues = [...baseValues, ...extraParams];
        const where = [...baseWhere, ...extraWhere];
        let orderClause = buildAssetOrderClause({
          hasRelevance: false,
          sortBy: normalizedSortBy,
          rankedParamAlias: queryValues.length + 1
        });
        if (Array.isArray(options.rankedIds) && options.rankedIds.length) {
          queryValues.push(options.rankedIds);
          const rankedIdx = queryValues.length;
          where.push(`id = ANY($${rankedIdx}::text[])`);
          if (normalizedSortBy === 'default') {
            orderClause = buildAssetOrderClause({
              hasRelevance: true,
              sortBy: normalizedSortBy,
              rankedParamAlias: rankedIdx
            });
          }
        }
        let pageClause = '';
        if (Number(options.limit) > 0) {
          queryValues.push(Math.max(1, Math.min(100, Number(options.limit) || 10)));
          const limitIdx = queryValues.length;
          queryValues.push(Math.max(0, Number(options.offset) || 0));
          const offsetIdx = queryValues.length;
          pageClause = `LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
        }
        const sql = `
          SELECT
            assets.*,
            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'cutId', c.cut_id,
                    'label', c.label,
                    'inPointSeconds', c.in_point_seconds,
                    'outPointSeconds', c.out_point_seconds
                  )
                  ORDER BY c.created_at DESC
                ),
                '[]'::json
              )
              FROM asset_cuts c
              WHERE c.asset_id = assets.id
            ) AS cuts
          FROM assets
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY ${orderClause}
          ${pageClause}
        `;
        const result = await pool.query(sql, queryValues);
        return result.rows;
      };
  
      const countAssetRows = async (extraWhere = [], extraParams = []) => {
        const queryValues = [...baseValues, ...extraParams];
        const where = [...baseWhere, ...extraWhere];
        const result = await pool.query(
          `
            SELECT COUNT(*)::int AS total
            FROM assets
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          `,
          queryValues
        );
        return Number(result.rows?.[0]?.total || 0);
      };
  
      const assetCardMatchPageSize = 10;
      const assetCardMatchFetchLimit = assetCardMatchPageSize + 1;
      let rows = [];
      let totalOverride = null;
      const isFileSizeSort = normalizedSortBy === 'size_asc' || normalizedSortBy === 'size_desc';
      const canUseSqlPagination = pageLimit > 0 && !q && !ocrQ && !subtitleQ && !advancedActive && !isFileSizeSort;
      if (advancedActive) {
        const valuesByField = {
          q: String(advancedDefinition.values.q ?? q).trim(),
          ocrQ: String(advancedDefinition.values.ocrQ ?? ocrQ).trim(),
          subtitleQ: String(advancedDefinition.values.subtitleQ ?? subtitleQ).trim(),
          tag: String(advancedDefinition.values.tag ?? tag).trim(),
          type: String(advancedDefinition.values.type ?? type).trim()
        };
        rows = await fetchAssetRows();
        if (durationRange.active) {
          rows = rows.filter((row) => matchesNumberRange(row.duration_seconds, durationRange, { requirePositive: true }));
        }
        if (fileSizeRange.active) {
          const rowsWithFileSize = await Promise.all(
            rows.map(async (row) => ({ row, fileSize: await getAssetFileSize(row) }))
          );
          rows = rowsWithFileSize
            .filter(({ fileSize }) => fileSize !== null && matchesNumberRange(fileSize, fileSizeRange))
            .map(({ row }) => row);
        }
        const advancedResult = await advancedSearchService.search({
          definition: advancedDefinition,
          valuesByField,
          rows,
          matchField: async (field, value, candidates) => {
            if (field === 'q') {
              const parsedQuery = parseTextSearchQuery(value, normalizeForSearch);
              const textWhere = buildAssetTextWhere(parsedQuery);
              return fetchAssetRows(textWhere.clauses, textWhere.params);
            }
            if (field === 'tag') {
              const folded = normalizeForSearch(value);
              return candidates.filter((row) => (Array.isArray(row.tags) ? row.tags : [])
                .some((item) => normalizeForSearch(item) === folded));
            }
            if (field === 'type') {
              const foldedTypes = new Set(value.toLowerCase().split(',').map((item) => item.trim()).filter(Boolean));
              return candidates.filter((row) => {
                const rowType = String(row.type || '').toLowerCase();
                const canonical = rowType === 'image' ? 'photo' : (rowType === 'file' ? 'other' : rowType);
                return foldedTypes.has(canonical);
              });
            }
            if (field === 'ocrQ') {
              const ocrSearch = await searchOcrMatchesForAssetRows(candidates, value, Math.max(candidates.length, 1));
              const ids = new Set(ocrSearch.byAssetId.keys());
              return candidates.filter((row) => ids.has(String(row.id || '').trim()));
            }
            if (field === 'subtitleQ') {
              const subtitleSearch = await searchSubtitleMatchesForAssetRows(candidates, value, Math.max(candidates.length, 1));
              const ids = new Set(subtitleSearch.byAssetId.keys());
              return candidates.filter((row) => ids.has(String(row.id || '').trim()));
            }
            return [];
          },
          annotate: async (filteredRows, { valuesByField: activeValues }) => {
            const annotateAdvancedHits = async (query, hitType) => {
              if (!query || !filteredRows.length) return;
              const search = hitType === 'ocr'
                ? await searchOcrMatchesForAssetRows(filteredRows, query, assetCardMatchPageSize + 1)
                : await searchSubtitleMatchesForAssetRows(filteredRows, query, assetCardMatchPageSize + 1);
              for (const row of filteredRows) {
                let hits = search.byAssetId.get(String(row.id || '').trim()) || [];
                if (!hits.length && hitType === 'ocr') {
                  const fallback = await findOcrMatchForAssetRow(row, query);
                  if (fallback) hits = [fallback];
                } else if (!hits.length && hitType === 'subtitle') {
                  const fallback = await searchSubtitleMatchesForAssetRow(row, query, assetCardMatchPageSize + 1);
                  hits = Array.isArray(fallback?.matches) ? fallback.matches : [];
                }
                if (!hits.length) continue;
                const hitQuery = String(search.highlightQuery || query).trim() || query;
                const visibleHits = hits.slice(0, assetCardMatchPageSize);
                const mapped = visibleHits.map((item) => ({
                  query: String(item.query || hitQuery).trim() || hitQuery,
                  text: String(item.line || item.text || ''),
                  startSec: Number(item.startSec || 0),
                  endSec: Number(item.endSec || 0),
                  startTc: formatTimecode(Number(item.startSec || 0))
                }));
                const prefix = hitType === 'ocr' ? '_ocr' : '_subtitle';
                row[`${prefix}_search_hit`] = mapped[0];
                row[`${prefix}_search_hits`] = mapped;
                row[`${prefix}_search_page`] = {
                  query: hitQuery,
                  offset: 0,
                  limit: assetCardMatchPageSize,
                  count: mapped.length,
                  hasPrev: false,
                  hasNext: hits.length > assetCardMatchPageSize,
                  nextOffset: assetCardMatchPageSize,
                  prevOffset: 0
                };
              }
            };
            await annotateAdvancedHits(activeValues.ocrQ, 'ocr');
            await annotateAdvancedHits(activeValues.subtitleQ, 'subtitle');
          }
        });
        rows = advancedResult.rows;
        totalOverride = advancedResult.total;
      } else if (q) {
        const textWhere = buildAssetTextWhere(parsedAssetQuery);
        rankedIds = await searchAssetIdsElastic(q);
        if (rankedIds === null) {
          rows = await fetchAssetRows(textWhere.clauses, textWhere.params);
        } else if (rankedIds.length) {
          rows = await fetchAssetRows([], [], { rankedIds });
        } else {
          // Elasticsearch can be empty/stale after local rebuilds; SQL remains the source of truth.
          rows = await fetchAssetRows(textWhere.clauses, textWhere.params);
        }
        if (!rows.length && !parsedAssetQuery.hasOperators) {
          const candidateRows = await fetchAssetRows();
          const fuzzyAssetResult = searchAssetsByFuzzyQuery(candidateRows, q);
          rows = fuzzyAssetResult.rows;
          searchMeta.q = {
            didYouMean: String(fuzzyAssetResult.didYouMean || '').trim(),
            fuzzyUsed: Boolean(fuzzyAssetResult.fuzzyUsed),
            highlightQuery: String(fuzzyAssetResult.highlightQuery || q).trim() || q
          };
        }
      } else {
        if (canUseSqlPagination) {
          const [paged, totalCount] = await Promise.all([
            fetchAssetRows([], [], { limit: pageLimit, offset: pageOffset }),
            countAssetRows()
          ]);
          rows = paged;
          totalOverride = totalCount;
        } else {
          rows = await fetchAssetRows();
        }
      }
  
      if (ocrQ && !advancedActive) {
        const parsedOcrQuery = parseTextSearchQuery(ocrQ, normalizeSubtitleSearchText);
        const ocrSearch = parsedOcrQuery.raw
          ? await searchOcrMatchesForAssetRows(rows, ocrQ, assetCardMatchFetchLimit)
          : { byAssetId: new Map(), didYouMean: '', fuzzyUsed: false, highlightQuery: ocrQ };
        const filtered = [];
        for (const row of rows) {
          const hits = ocrSearch.byAssetId.get(String(row.id || '').trim()) || [];
          if (!hits.length) continue;
          const hitQuery = String(ocrSearch.highlightQuery || ocrQ).trim() || ocrQ;
          const visibleHits = hits.slice(0, assetCardMatchPageSize);
          const hit = hits[0];
          row._ocr_search_hit = {
            query: hitQuery,
            text: String(hit.line || ''),
            startSec: Number(hit.startSec || 0),
            endSec: Number(hit.endSec || 0),
            startTc: formatTimecode(Number(hit.startSec || 0))
          };
          row._ocr_search_hits = visibleHits.map((item) => ({
            query: String(item.query || hitQuery).trim() || hitQuery,
            text: String(item.line || ''),
            startSec: Number(item.startSec || 0),
            endSec: Number(item.endSec || 0),
            startTc: formatTimecode(Number(item.startSec || 0))
          }));
          row._ocr_search_page = {
            query: hitQuery,
            offset: 0,
            limit: assetCardMatchPageSize,
            count: visibleHits.length,
            hasPrev: false,
            hasNext: hits.length > assetCardMatchPageSize,
            nextOffset: assetCardMatchPageSize,
            prevOffset: 0
          };
          filtered.push(row);
        }
        if (ocrSearch.fuzzyUsed || String(ocrSearch.didYouMean || '').trim()) {
          searchMeta.ocrQ = {
            didYouMean: String(ocrSearch.didYouMean || '').trim(),
            fuzzyUsed: Boolean(ocrSearch.fuzzyUsed),
            highlightQuery: String(ocrSearch.highlightQuery || ocrQ).trim() || ocrQ
          };
        }
        rows = parsedOcrQuery.raw ? filtered : [];
      }
      // subtitleQ geldiyse sadece aktif altyazi cue index'i uzerinden filtre uygula.
      if (subtitleQ && !advancedActive) {
        const parsedSubtitleQuery = parseSubtitleTextSearchQuery(subtitleQ);
        if (!parsedSubtitleQuery.raw) {
          rows = [];
        } else {
          const subtitleSearch = await searchSubtitleMatchesForAssetRows(rows, subtitleQ, assetCardMatchFetchLimit);
          const filtered = [];
          for (const row of rows) {
            const hits = subtitleSearch.byAssetId.get(String(row.id || '').trim()) || [];
            if (!hits.length) continue;
            const hitQuery = String(subtitleSearch.highlightQuery || subtitleQ).trim() || subtitleQ;
            const visibleHits = hits.slice(0, assetCardMatchPageSize);
            const match = hits[0];
            row._subtitle_search_hit = {
              query: hitQuery,
              text: String(match.text || ''),
              startSec: Number(match.startSec || 0),
              endSec: Number(match.endSec || 0),
              startTc: String(match.startTc || formatTimecode(Number(match.startSec || 0)))
            };
            row._subtitle_search_hits = visibleHits.map((item) => ({
              query: String(item.query || hitQuery).trim() || hitQuery,
              text: String(item.text || ''),
              startSec: Number(item.startSec || 0),
              endSec: Number(item.endSec || 0),
              startTc: String(item.startTc || formatTimecode(Number(item.startSec || 0)))
            }));
            row._subtitle_search_page = {
              query: hitQuery,
              offset: 0,
              limit: assetCardMatchPageSize,
              count: visibleHits.length,
              hasPrev: false,
              hasNext: hits.length > assetCardMatchPageSize,
              nextOffset: assetCardMatchPageSize,
              prevOffset: 0
            };
            filtered.push(row);
          }
          if (subtitleSearch.fuzzyUsed || String(subtitleSearch.didYouMean || '').trim()) {
            searchMeta.subtitleQ = {
              didYouMean: String(subtitleSearch.didYouMean || '').trim(),
              fuzzyUsed: Boolean(subtitleSearch.fuzzyUsed),
              highlightQuery: String(subtitleSearch.highlightQuery || subtitleQ).trim() || subtitleQ
            };
          }
          rows = filtered;
        }
      }

      if (isFileSizeSort && rows.length) {
        const rowsWithFileSize = await Promise.all(
          rows.map(async (row) => ({ row, fileSize: await getAssetFileSize(row) }))
        );
        const direction = normalizedSortBy === 'size_asc' ? 1 : -1;
        rowsWithFileSize.sort((left, right) => {
          const leftMissing = left.fileSize === null || left.fileSize === undefined;
          const rightMissing = right.fileSize === null || right.fileSize === undefined;
          if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
          if (!leftMissing && left.fileSize !== right.fileSize) return (left.fileSize - right.fileSize) * direction;
          return String(right.row.updated_at || '').localeCompare(String(left.row.updated_at || ''));
        });
        rows = rowsWithFileSize.map(({ row }) => row);
      }
  
      const total = totalOverride == null ? rows.length : totalOverride;
      const pagedRows = totalOverride == null && pageLimit ? rows.slice(pageOffset, pageOffset + pageLimit) : rows;
      const hydratedRows = [];
      for (const row of pagedRows) {
        let nextRow = row;
        // Listing must stay cheap. Missing image derivatives are repaired on
        // upload/detail/admin repair flows instead of blocking every refresh.
        if (ensurePreview) {
          try {
            nextRow = await ensureImageDerivativesForRow(nextRow);
          } catch (error) {
            console.warn('Image derivative repair failed', {
              assetId: nextRow?.id,
              fileName: nextRow?.file_name,
              error: String(error?.message || error || '')
            });
          }
        }
        if (!ensurePreview) {
          hydratedRows.push(nextRow);
          continue;
        }
        const withPdfThumb = await ensurePdfThumbnailForRow(nextRow);
        hydratedRows.push(await ensureDocumentThumbnailForRow(withPdfThumb));
      }
      const includeFileSize = fileSizeRange.active || isFileSizeSort;
      const responseAssets = await Promise.all(hydratedRows.map(async (row) => {
        const asset = mapAssetRowForUser(row, accessContext);
        if (includeFileSize) {
          const fileSize = await getAssetFileSize(row);
          if (Number.isFinite(fileSize) && fileSize > 0) asset.fileSizeBytes = fileSize;
        }
        return asset;
      }));
      res.json({
        assets: responseAssets,
        searchMeta,
        pagination: {
          total,
          limit: pageLimit || total,
          offset: pageLimit ? pageOffset : 0
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load assets' });
    }
  });
  
  app.get('/api/assets/suggest', async (req, res) => {
    try {
      const accessContext = await resolveAssetAccessContext(req);
      const suggestions = await queryAssetSuggestions({
        q: req.query.q,
        limit: req.query.limit,
        trash: req.query.trash,
        tag: req.query.tag,
        type: req.query.type,
        owner: req.query.owner,
        types: req.query.types,
        status: req.query.status,
        uploadDateFrom: req.query.uploadDateFrom,
        uploadDateTo: req.query.uploadDateTo
      });
      const visible = [];
      for (const suggestion of suggestions) {
        const asset = await loadVisibleAssetRow(req, suggestion.id);
        if (asset.status === 200 && assetAccessService.canViewAsset(asset.row, accessContext)) {
          visible.push(suggestion);
        }
      }
      return res.json(visible);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to suggest assets' });
    }
  });
  
  app.get('/api/assets/ocr-suggest', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.json([]);
      const parsedOcrQuery = parseTextSearchQuery(q, normalizeSubtitleSearchText);
      if (!parsedOcrQuery.raw) return res.json([]);
      const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
      const tag = String(req.query.tag || '').trim();
      const type = String(req.query.type || '').trim().toLowerCase();
      const status = String(req.query.status || '').trim().toLowerCase();
      const owner = String(req.query.owner || '').trim();
      const trash = normalizeTrashScope(req.query.trash, 'active');
      const uploadDateFrom = req.query.uploadDateFrom;
      const uploadDateTo = req.query.uploadDateTo;
      const types = String(req.query.types || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const dateRange = normalizeUploadDateRange(uploadDateFrom, uploadDateTo);
  
      const where = [];
      const values = [];
      if (trash === 'trash') where.push('deleted_at IS NOT NULL');
      else if (trash !== 'all') where.push('deleted_at IS NULL');
      if (tag) {
        values.push(tag);
        const tagParam = `$${values.length}`;
        where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
      }
      if (type) {
        values.push(type);
        where.push(`LOWER(type) = $${values.length}`);
      }
      if (owner) {
        values.push(`%${owner.toLowerCase()}%`);
        where.push(`LOWER(owner) LIKE $${values.length}`);
      }
      if (types.length) {
        values.push(types);
        where.push(`
          (
            CASE
              WHEN LOWER(type) = 'image' THEN 'photo'
              WHEN LOWER(type) = 'file' THEN 'other'
              ELSE LOWER(type)
            END
          ) = ANY($${values.length}::text[])
        `);
      }
      if (status) {
        values.push(status);
        where.push(`LOWER(status) = $${values.length}`);
      }
      if (dateRange.from) {
        values.push(dateRange.from);
        where.push(`created_at >= $${values.length}`);
      }
      if (dateRange.to) {
        values.push(dateRange.to);
        where.push(`created_at <= $${values.length}`);
      }
      const accessContext = await resolveAssetAccessContext(req);
      appendAssetAccessWhere(where, values, accessContext, 'assets');
  
      const result = await pool.query(
        `
          SELECT id, title, file_name, type, status, owner, updated_at, deleted_at, dc_metadata
          FROM assets
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY updated_at DESC
          LIMIT 400
        `,
        values
      );
  
      const batchSearch = await searchOcrMatchesForAssetRows(result.rows, q, 1);
      const out = [];
      for (const row of result.rows) {
        const assetId = String(row.id || '').trim();
        const managedHits = batchSearch.byAssetId.get(assetId) || [];
        let hit = managedHits[0] || null;
        if (!hit) {
          const dc = row.dc_metadata && typeof row.dc_metadata === 'object'
            ? row.dc_metadata
            : {};
          const hasManagedOcr = Boolean(
            String(dc.videoOcrUrl || dc.photoOcrUrl || '').trim()
            || (Array.isArray(dc.videoOcrItems) && dc.videoOcrItems.length)
            || (Array.isArray(dc.photoOcrItems) && dc.photoOcrItems.length)
          );
          if (!hasManagedOcr) hit = await findOcrMatchForAssetRow(row, q);
        }
        if (!hit) continue;
        out.push({
          id: row.id,
          title: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          status: String(row.status || ''),
          inTrash: Boolean(row.deleted_at),
          updatedAt: row.updated_at,
          ocrHitText: String(hit.line || ''),
          startSec: Number(hit.startSec || 0)
        });
        if (out.length >= limit) break;
      }
      return res.json(out);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to suggest OCR matches' });
    }
  });
  
  // 1. kolon altyazi arama kutusu icin global (assetler arasi) oneriler.
  app.get('/api/assets/subtitle-suggest', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.json([]);
      const parsedQuery = parseSubtitleTextSearchQuery(q);
      if (!parsedQuery.raw) return res.json([]);
      const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
      const tag = String(req.query.tag || '').trim();
      const type = String(req.query.type || '').trim().toLowerCase();
      const status = String(req.query.status || '').trim().toLowerCase();
      const trash = normalizeTrashScope(req.query.trash, 'active');
      const types = String(req.query.types || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
  
      const where = [];
      const values = [];
      if (trash === 'trash') where.push('deleted_at IS NOT NULL');
      else if (trash !== 'all') where.push('deleted_at IS NULL');
      if (tag) {
        values.push(tag);
        const tagParam = `$${values.length}`;
        where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
      }
      if (type) {
        values.push(type);
        where.push(`LOWER(type) = $${values.length}`);
      }
      if (types.length) {
        values.push(types);
        where.push(`
          (
            CASE
              WHEN LOWER(type) = 'image' THEN 'photo'
              WHEN LOWER(type) = 'file' THEN 'other'
              ELSE LOWER(type)
            END
          ) = ANY($${values.length}::text[])
        `);
      }
      if (status) {
        values.push(status);
        where.push(`LOWER(status) = $${values.length}`);
      }
      const accessContext = await resolveAssetAccessContext(req);
      appendAssetAccessWhere(where, values, accessContext, 'assets');
  
      const result = await pool.query(
        `
          SELECT id, title, file_name, type, status, updated_at, deleted_at, dc_metadata
          FROM assets
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY updated_at DESC
          LIMIT 400
        `,
        values
      );
  
      const out = [];
      for (const row of result.rows) {
        const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
        const activeSubtitleUrl = String(dc.subtitleUrl || '').trim();
        if (!activeSubtitleUrl) continue;
        const subtitleWhere = buildSubtitleCueSearchWhereSql({
          normColumn: 'norm_text',
          startIndex: 3,
          parsedQuery
        });
        const hitRes = await pool.query(
          `
            SELECT start_sec, cue_text
            FROM asset_subtitle_cues
            WHERE asset_id = $1
              AND subtitle_url = $2
              ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
            ORDER BY start_sec ASC
            LIMIT 1
          `,
          [String(row.id || '').trim(), activeSubtitleUrl, ...subtitleWhere.params]
        );
        if (!hitRes.rowCount) continue;
        const hit = hitRes.rows[0];
        out.push({
          id: row.id,
          title: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          status: String(row.status || ''),
          inTrash: Boolean(row.deleted_at),
          updatedAt: row.updated_at,
          subtitleHitText: String(hit.cue_text || ''),
          startSec: Number(hit.start_sec || 0)
        });
        if (out.length >= limit) break;
      }
      return res.json(out);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to suggest subtitle matches' });
    }
  });
  
  app.post('/api/assets', async (req, res) => {
    try {
      const context = await resolveAssetAccessContext(req).catch(async () => {
        const effective = await resolveEffectivePermissions(req).catch(() => null);
        return effective || buildUserContextFromRequest(req);
      });
      const typeAllowed = assetAccessService.canUploadAssetType({
        type: req.body?.type,
        mimeType: req.body?.mimeType,
        fileName: req.body?.fileName
      }, context);
      if (!typeAllowed) {
        return res.status(403).json({
          error: 'You are not allowed to create this asset type',
          code: 'asset_type_upload_forbidden'
        });
      }
      const requestedOwner = String(req.body?.owner || req.body?.uploadedBy || '').trim();
      const owner = String(context?.displayName || context?.username || context?.email || '').trim() || requestedOwner || 'Unknown';
      const payload = {
        ...(req.body && typeof req.body === 'object' ? req.body : {}),
        owner,
        ...assetAccessService.buildNewAssetAccess(req.body || {}, context)
      };
      const created = await createAssetRecord(payload);
      await recordAuditEvent?.(req, {
        action: 'asset.created',
        targetType: 'asset',
        targetId: created.id,
        targetTitle: created.title,
        details: { source: 'api', type: created.type, fileName: created.fileName || '' }
      });
      res.status(201).json(created);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to create asset' });
    }
  });
  
  app.post('/api/assets/upload', parseMultipartUpload, async (req, res) => {
    const {
      fileName: bodyFileName,
      mimeType: bodyMimeType,
      fileData,
      generateMetadata: generateMetadataRaw,
      ...metadata
    } = req.body || {};
    const multipartUpload = req.multipartUpload || null;
    const fileName = String(bodyFileName || multipartUpload?.fileName || '').trim();
    const mimeType = String(bodyMimeType || multipartUpload?.mimeType || '').trim();
    const cleanupMultipartUpload = () => {
      const tempPath = String(multipartUpload?.path || '').trim();
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_error) {}
      }
    };
    res.on('finish', cleanupMultipartUpload);
    const requestedMetadataGeneration = generateMetadataRaw === true
      || String(generateMetadataRaw || '').trim().toLowerCase() === 'true';
    const allowSilentProxyFallback = Boolean(req.body?.allowSilentProxyFallback);
    const skipProxyGeneration = Boolean(req.body?.skipProxyGeneration);
    const isVideoUpload = isVideoCandidate({ mimeType, fileName, declaredType: metadata.type });
    if (!fileData && !multipartUpload?.path) {
      return res.status(400).json({ error: 'fileData (base64) is required' });
    }
  
    const safeName = sanitizeFileName(fileName);
    const typeValidation = validateDeclaredUploadType({
      declaredType: metadata.type,
      mimeType,
      fileName: safeName
    });
    if (!typeValidation.ok) {
      return res.status(400).json(typeValidation);
    }
    const generateMetadata = requestedMetadataGeneration && isDocumentCandidate({
      mimeType,
      fileName: safeName,
      declaredType: metadata.type
    });
    let buffer = null;
    let fileHash = '';
  
    try {
      if (multipartUpload?.path) {
        fileHash = await computeFileSha256Stream(multipartUpload.path);
      } else {
        buffer = Buffer.from(String(fileData), 'base64');
        fileHash = computeBufferSha256(buffer);
      }
    } catch (_error) {
      return res.status(400).json({ error: 'Could not decode or save file' });
    }
    if ((!buffer || !buffer.length) && !multipartUpload?.path) {
      return res.status(400).json({
        error: 'Uploaded file is empty',
        code: 'empty_upload_file'
      });
    }
  
    const duplicateAsset = await findDuplicateAssetByHash(fileHash);
    if (duplicateAsset) {
      return res.status(409).json({
        error: 'An identical asset file already exists',
        code: 'duplicate_asset_content',
        existingAsset: buildDuplicateAssetPayload(duplicateAsset)
      });
    }
  
    const context = await resolveAssetAccessContext(req).catch(async () => {
      const effective = await resolveEffectivePermissions(req).catch(() => null);
      return effective || buildUserContextFromRequest(req);
    });
    const typeAllowed = assetAccessService.canUploadAssetType({
      type: metadata.type,
      mimeType,
      fileName: safeName
    }, context);
    if (!typeAllowed) {
      return res.status(403).json({
        error: 'You are not allowed to upload this asset type',
        code: 'asset_type_upload_forbidden'
      });
    }

    const storedName = `${Date.now()}-${nanoid()}-${safeName}`;
    const ingestPath = getIngestStoragePath({ type: metadata.type, mimeType, fileName: safeName });
    const absolutePath = path.join(ingestPath.absoluteDir, storedName);
    const mediaUrl = `/uploads/${ingestPath.relativeDir.replace(/\\/g, '/')}/${storedName}`;
  
    try {
      if (multipartUpload?.path) {
        try {
          fs.renameSync(multipartUpload.path, absolutePath);
        } catch (error) {
          if (error?.code !== 'EXDEV') throw error;
          fs.copyFileSync(multipartUpload.path, absolutePath);
          fs.unlinkSync(multipartUpload.path);
        }
        multipartUpload.path = '';
      } else {
        fs.writeFileSync(absolutePath, buffer);
      }
    } catch (_error) {
      return res.status(400).json({ error: 'Could not decode or save file' });
    }
  
    let proxyUrl = '';
    let proxyStatus = 'not_applicable';
    let thumbnailUrl = '';
    let detectedAudioChannels = 0;
    const ingestWarnings = [];
    // Kullanıcı "Proxy olmadan oluştur" seçerse dosyanın kendisini saklamıyoruz;
    // bu durumda kayıt yalnızca metadata taşıyan bir varlık olarak kalıyor.
    let persistOriginalMedia = true;
  
    if (isVideoUpload) {
      if (skipProxyGeneration) {
        proxyStatus = 'failed';
        persistOriginalMedia = false;
        ingestWarnings.push({
          code: 'proxy_generation_skipped',
          message: 'Proxy generation was skipped and the original asset file was not stored for this upload.',
          retryHint: 'You can generate the proxy later from admin tools or replace only the main file while keeping metadata.'
        });
      } else {
        proxyStatus = 'pending';
        const proxyStoredName = `${Date.now()}-${nanoid()}-proxy.mp4`;
        const proxyOut = buildArtifactPath('proxies', proxyStoredName, new Date());
  
        try {
          const proxyResult = await generateVideoProxy(absolutePath, proxyOut.absolutePath, {
            allowAudioFallback: allowSilentProxyFallback
          });
          proxyUrl = proxyOut.publicUrl;
          proxyStatus = 'ready';
          detectedAudioChannels = await getMediaAudioChannelCount(proxyOut.absolutePath);
          if (proxyResult?.audioFallbackUsed) {
            ingestWarnings.push({
              code: 'proxy_audio_fallback',
              message: String(proxyResult.warning || 'Proxy was created without audio because the source audio stream could not be decoded reliably.'),
              retryHint: 'You can replace the main file later while keeping metadata, or keep using the silent proxy if video-only review is enough.'
            });
          }
        } catch (error) {
          if (error?.code === 'PROXY_AUDIO_FALLBACK_CONFIRMATION_REQUIRED') {
            // Kullanıcıdan karar almadan problemli kaynağı sistemde bırakmıyoruz.
            // Onay gelirse ikinci istekle tekrar yükleniyor.
            try { if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); } catch (_cleanupError) {}
            try { if (fs.existsSync(proxyOut.absolutePath)) fs.unlinkSync(proxyOut.absolutePath); } catch (_cleanupError) {}
            return res.status(409).json({
              error: String(error.message || 'Proxy generation requires confirmation.'),
              code: 'proxy_audio_confirmation_required',
              confirmationPrompt: String(error.warning || ''),
              retryHint: String(error.retryHint || '')
            });
          }
          const message = summarizeFfmpegError(error);
          console.error('Uploaded video proxy generation failed', {
            inputPath: absolutePath,
            fileName: safeName,
            mimeType,
            error: String(error?.message || error || '')
          });
          proxyStatus = 'failed';
          ingestWarnings.push({
            code: 'proxy_generation_failed',
            message: `Proxy generation failed for uploaded video: ${message}`,
            retryHint: 'You can regenerate the proxy later or replace only the asset file while keeping metadata.'
          });
        }
      }
  
      if (persistOriginalMedia) {
        const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
        const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
        try {
          await generateVideoThumbnail(absolutePath, thumbOut.absolutePath);
          thumbnailUrl = thumbOut.publicUrl;
        } catch (error) {
          thumbnailUrl = '';
          ingestWarnings.push({
            code: 'thumbnail_generation_failed',
            message: `Thumbnail generation failed: ${summarizeFfmpegError(error)}`,
            retryHint: 'You can regenerate the thumbnail later from the admin tools.'
          });
        }
      }
    } else if (isPdfCandidate({ mimeType, fileName: safeName })) {
      const pdfThumbName = `${Date.now()}-${nanoid()}-pdf-thumb.jpg`;
      const pdfThumbOut = buildArtifactPath('thumbnails', pdfThumbName, new Date());
      try {
        await generatePdfThumbnail(absolutePath, pdfThumbOut.absolutePath);
        thumbnailUrl = pdfThumbOut.publicUrl;
      } catch (_error) {
        const fallbackName = `${Date.now()}-${nanoid()}-pdf-thumb.svg`;
        const fallbackOut = buildArtifactPath('thumbnails', fallbackName, new Date());
        try {
          await generatePdfFallbackThumbnail(fallbackOut.absolutePath, {
            fileName: safeName,
            title: String(metadata.title || safeName)
          });
          thumbnailUrl = fallbackOut.publicUrl;
        } catch (_fallbackError) {
          thumbnailUrl = '';
        }
      }
    } else if (isDocumentCandidate({ mimeType, fileName: safeName, declaredType: metadata.type })) {
      const docThumbName = `${Date.now()}-${nanoid()}-doc-thumb-v2.svg`;
      const docThumbOut = buildArtifactPath('thumbnails', docThumbName, new Date());
      try {
        await generateDocumentThumbnail(absolutePath, docThumbOut.absolutePath, {
          fileName: safeName,
          title: String(metadata.title || safeName),
          extLabel: (getFileExtension(safeName) || 'DOC').toUpperCase(),
          includeContent: isTextDocumentCandidate({ mimeType, fileName: safeName })
        });
        thumbnailUrl = docThumbOut.publicUrl;
      } catch (_error) {
        thumbnailUrl = '';
      }
    } else if (imageDerivativeService?.isImageCandidate({ mimeType, fileName: safeName })) {
      try {
        const derivatives = await imageDerivativeService.ensureImageDerivativesForUpload({
          mimeType,
          fileName: safeName,
          inputPath: absolutePath,
          createdAt: new Date()
        });
        proxyUrl = String(derivatives.proxyUrl || '').trim();
        thumbnailUrl = String(derivatives.thumbnailUrl || '').trim();
        proxyStatus = proxyUrl ? 'ready' : 'failed';
      } catch (error) {
        proxyUrl = '';
        thumbnailUrl = mediaUrl;
        proxyStatus = 'failed';
        ingestWarnings.push({
          code: 'image_derivative_generation_failed',
          message: `Image preview generation failed: ${String(error?.message || error || '').slice(0, 240)}`,
          retryHint: 'The original file was kept. You can regenerate image derivatives later from admin tools.'
        });
      }
    }
  
    if (persistOriginalMedia && !detectedAudioChannels && String(mimeType || '').toLowerCase().startsWith('audio/')) {
      detectedAudioChannels = await getMediaAudioChannelCount(absolutePath);
    }
  
    if (!persistOriginalMedia) {
      try {
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
      } catch (_error) {
        // Temizlik başarısız olsa bile kullanıcıyı metadata-only kayıt akışından düşürmüyoruz.
      }
      thumbnailUrl = '';
    }
  
    const requestedOwner = String(metadata.owner || metadata.uploadedBy || '').trim();
    const owner = String(context?.displayName || context?.username || context?.email || '').trim() || requestedOwner || 'Unknown';
    const payload = {
      ...metadata,
      owner,
      ...assetAccessService.buildNewAssetAccess(metadata, context),
      fileName: safeName,
      mimeType: String(mimeType || ''),
      mediaUrl: persistOriginalMedia ? mediaUrl : '',
      proxyUrl,
      proxyStatus,
      thumbnailUrl,
      dcMetadata: {
        ...(metadata?.dcMetadata && typeof metadata.dcMetadata === 'object' ? metadata.dcMetadata : {}),
        ...(detectedAudioChannels > 0 ? { audioChannels: detectedAudioChannels } : {})
      },
      fileHash,
      sourcePath: persistOriginalMedia ? absolutePath : ''
    };
    if (persistOriginalMedia && (isVideoUpload || String(mimeType || '').toLowerCase().startsWith('audio/'))
      && (!Number(payload.durationSeconds) || Number(payload.durationSeconds) <= 0)) {
      const detected = await getVideoDurationSeconds(absolutePath);
      if (detected > 0) payload.durationSeconds = Math.round(detected);
    }
  
    try {
      const created = await createAssetRecord(payload);
      const metadataJob = generateMetadata
        ? metadataEnrichmentService?.queueAsset?.(created)
        : null;
      await recordAuditEvent?.(req, {
        action: 'asset.uploaded',
        targetType: 'asset',
        targetId: created.id,
        targetTitle: created.title,
        details: {
          fileName: created.fileName || safeName,
          mimeType: created.mimeType || String(mimeType || ''),
          type: created.type,
          proxyStatus: created.proxyStatus,
          metadataGenerationRequested: generateMetadata,
          metadataJobId: String(metadataJob?.jobId || ''),
          warnings: ingestWarnings.map((item) => item.code).filter(Boolean)
        }
      });
      return res.status(201).json({
        ...created,
        ingestWarnings,
        ingestSucceededWithWarnings: ingestWarnings.length > 0,
        metadataJob
      });
    } catch (_error) {
      console.warn(JSON.stringify({
        event: 'asset-upload-record-error',
        message: String(_error?.message || _error || 'Unknown error'),
        code: String(_error?.code || ''),
        fileName: safeName,
        mimeType: String(mimeType || '')
      }));
      return res.status(500).json({ error: 'Failed to create uploaded asset record' });
    }
  });
  
  app.get('/api/assets/:id', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      let row = loaded.row;
      try {
        row = await ensureImageDerivativesForRow(row);
      } catch (error) {
        console.warn('Image derivative repair failed', {
          assetId: row?.id,
          fileName: row?.file_name,
          error: String(error?.message || error || '')
        });
      }
  
      const versionsResult = await pool.query(
        'SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
      const cutsResult = await pool.query(
        'SELECT * FROM asset_cuts WHERE asset_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
  
      const asset = mapAssetRowForUser(row, loaded.accessContext);
      asset.fileSizeBytes = await resolveAssetFileSize(row);
      const audioCandidate = isVideoCandidate({
        mimeType: row.mime_type,
        fileName: row.file_name,
        declaredType: row.type
      }) || String(row.mime_type || '').toLowerCase().startsWith('audio/');
      if (audioCandidate && Number(asset.audioChannels || 0) <= 0) {
        const playbackPath = resolvePlaybackInputPath(row);
        asset.audioChannels = await getMediaAudioChannelCount(playbackPath);
      }
      if (audioCandidate) {
        const playbackPath = resolvePlaybackInputPath(row);
        asset.audioStreamOptions = await getMediaAudioStreamOptions(playbackPath);
      }
      asset.versions = versionsResult.rows.map(mapVersionRow);
      asset.cuts = cutsResult.rows.map(mapCutRow);
      res.json(asset);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load asset' });
    }
  });

  app.get('/api/assets/:id/file', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      auditDownloadResponse(req, res, loaded.row, {
        source: 'api_asset_file',
        transport: 'api',
        url: `/api/assets/${encodeURIComponent(req.params.id)}/file`
      });
      return sendStoredAssetFile(res, resolveAssetFilePath(loaded.row), loaded.row);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load asset file' });
    }
  });

  app.get('/api/assets/:id/technical', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      const row = loaded.row;
  
      const sourcePath = (() => {
        let p = String(row.source_path || '').trim();
        if (p && fs.existsSync(p)) return p;
        const media = publicUploadUrlToAbsolutePath(row.media_url);
        if (media && fs.existsSync(media)) return media;
        return '';
      })();
  
      const proxyPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));
  
      const [original, proxy] = await Promise.all([
        probeMediaTechnicalInfo(sourcePath),
        probeMediaTechnicalInfo(proxyPath)
      ]);
  
      return res.json({
        assetId: row.id,
        original: {
          label: 'original',
          url: String(row.media_url || ''),
          ...original
        },
        proxy: {
          label: 'proxy',
          url: String(resolveStoredUrl(row.proxy_url, 'proxies') || ''),
          ...proxy
        }
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load technical info' });
    }
  });

  app.get('/api/assets/:id/subtitle', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }

      const asset = mapAssetRowForUser(loaded.row, loaded.accessContext);
      const subtitleUrl =
        String(asset.subtitleUrl || '').trim() ||
        String(asset.subtitleItems?.length === 1 ? asset.subtitleItems[0]?.subtitleUrl : '').trim();
      if (!subtitleUrl) {
        return res.status(404).json({ error: 'Subtitle not found' });
      }

      const subtitlePath = publicUploadUrlToAbsolutePath(subtitleUrl);
      if (!subtitlePath || !fs.existsSync(subtitlePath)) {
        return res.status(404).json({ error: 'Subtitle file not found' });
      }

      const normalizedUrl = subtitleUrl.toLowerCase();
      if (normalizedUrl.endsWith('.vtt')) {
        res.type('text/vtt; charset=utf-8');
      } else if (normalizedUrl.endsWith('.srt')) {
        res.type('application/x-subrip; charset=utf-8');
      } else {
        res.type('text/plain; charset=utf-8');
      }
      return res.sendFile(subtitlePath);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to load subtitle' });
    }
  });

  app.patch('/api/assets/:id/visibility', async (req, res) => {
    try {
      const accessContext = await resolveAssetAccessContext(req);
      const result = await assetAccessService.updateAssetVisibility(req.params.id, req.body || {}, accessContext);
      if (result.status !== 200) {
        return res.status(result.status).json({ error: result.error });
      }
      await indexAssetToElastic(req.params.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.visibility_updated',
        targetType: 'asset',
        targetId: result.row.id,
        targetTitle: result.row.title,
        details: {
          visibility: result.row.visibility,
          allowedUsers: result.row.allowed_users || [],
          allowedGroups: result.row.allowed_groups || [],
          deniedUsers: result.row.denied_users || [],
          deniedGroups: result.row.denied_groups || [],
          editAllowedUsers: result.row.edit_allowed_users || [],
          editAllowedGroups: result.row.edit_allowed_groups || [],
          editDeniedUsers: result.row.edit_denied_users || [],
          editDeniedGroups: result.row.edit_denied_groups || []
        }
      });
      return res.json(mapAssetRowForUser(result.row, accessContext));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to update asset visibility' });
    }
  });

  app.post('/api/assets/:id/cuts', async (req, res) => {
    const inPoint = Number(req.body.inPointSeconds);
    const outPoint = Number(req.body.outPointSeconds);

    if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || inPoint < 0 || outPoint < inPoint) {
      return res.status(400).json({ error: 'Invalid IN/OUT points' });
    }

    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }

      const now = new Date().toISOString();
      const cut = {
        cutId: nanoid(),
        label: req.body.label?.trim() || `Cut ${new Date().toLocaleTimeString()}`,
        inPointSeconds: inPoint,
        outPointSeconds: outPoint,
        createdAt: now
      };

      await pool.query(
        `
          INSERT INTO asset_cuts (cut_id, asset_id, label, in_point_seconds, out_point_seconds, created_at)
          VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [cut.cutId, req.params.id, cut.label, cut.inPointSeconds, cut.outPointSeconds, cut.createdAt]
      );
      await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, now]);
      await indexAssetToElastic(req.params.id).catch(() => {});

      return res.status(201).json(cut);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to save cut' });
    }
  });

  app.delete('/api/assets/:id/cuts/:cutId', requireAssetDelete, async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      const result = await pool.query(
        'DELETE FROM asset_cuts WHERE cut_id = $1 AND asset_id = $2 RETURNING cut_id',
        [req.params.cutId, req.params.id]
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: 'Cut not found' });
      }
      await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, new Date().toISOString()]);
      await indexAssetToElastic(req.params.id).catch(() => {});
      return res.status(204).send();
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to delete cut' });
    }
  });

  app.patch('/api/assets/:id/cuts/:cutId', async (req, res) => {
    const hasLabel = Object.prototype.hasOwnProperty.call(req.body || {}, 'label');
    const hasInPoint = Object.prototype.hasOwnProperty.call(req.body || {}, 'inPointSeconds');
    const hasOutPoint = Object.prototype.hasOwnProperty.call(req.body || {}, 'outPointSeconds');
    const nextLabel = hasLabel ? String(req.body?.label || '').trim() : null;
    const nextInPoint = hasInPoint ? Number(req.body?.inPointSeconds) : null;
    const nextOutPoint = hasOutPoint ? Number(req.body?.outPointSeconds) : null;

    if (!hasLabel && !hasInPoint && !hasOutPoint) {
      return res.status(400).json({ error: 'At least one cut field is required' });
    }
    if (hasLabel && !nextLabel) {
      return res.status(400).json({ error: 'Cut label is required' });
    }
    if (hasInPoint && (!Number.isFinite(nextInPoint) || nextInPoint < 0)) {
      return res.status(400).json({ error: 'Invalid IN point' });
    }
    if (hasOutPoint && (!Number.isFinite(nextOutPoint) || nextOutPoint < 0)) {
      return res.status(400).json({ error: 'Invalid OUT point' });
    }

    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      const existing = await pool.query(
        'SELECT * FROM asset_cuts WHERE cut_id = $1 AND asset_id = $2',
        [req.params.cutId, req.params.id]
      );
      if (!existing.rowCount) {
        return res.status(404).json({ error: 'Cut not found' });
      }

      const current = existing.rows[0];
      const inPoint = hasInPoint ? nextInPoint : Number(current.in_point_seconds);
      const outPoint = hasOutPoint ? nextOutPoint : Number(current.out_point_seconds);
      if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || outPoint < inPoint) {
        return res.status(400).json({ error: 'Invalid IN/OUT points' });
      }
      const label = hasLabel ? nextLabel : String(current.label || '').trim() || `Cut ${new Date().toLocaleTimeString()}`;

      const result = await pool.query(
        `
          UPDATE asset_cuts
          SET label = $3,
              in_point_seconds = $4,
              out_point_seconds = $5
          WHERE cut_id = $1 AND asset_id = $2
          RETURNING *
        `,
        [req.params.cutId, req.params.id, label, inPoint, outPoint]
      );
      await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, new Date().toISOString()]);
      await indexAssetToElastic(req.params.id).catch(() => {});
      return res.json(mapCutRow(result.rows[0]));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to update cut' });
    }
  });

  app.post('/api/assets/:id/trash', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      if (!assetAccessService.canDeleteAsset(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, req.params.id)) return undefined;
      const now = new Date().toISOString();
      const result = await pool.query(
        'UPDATE assets SET deleted_at = $2, updated_at = $2 WHERE id = $1 RETURNING *',
        [req.params.id, now]
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      await indexAssetToElastic(req.params.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.trashed',
        targetType: 'asset',
        targetId: result.rows[0].id,
        targetTitle: result.rows[0].title,
        details: {}
      });
      return res.json(mapAssetRowForUser(result.rows[0], loaded.accessContext));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to move asset to trash' });
    }
  });

  app.post('/api/assets/:id/restore', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      if (!assetAccessService.canDeleteAsset(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const now = new Date().toISOString();
      const result = await pool.query(
        'UPDATE assets SET deleted_at = NULL, updated_at = $2 WHERE id = $1 RETURNING *',
        [req.params.id, now]
      );
      if (!result.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      await indexAssetToElastic(req.params.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.restored',
        targetType: 'asset',
        targetId: result.rows[0].id,
        targetTitle: result.rows[0].title,
        details: {}
      });
      return res.json(mapAssetRowForUser(result.rows[0], loaded.accessContext));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to restore asset' });
    }
  });

  app.delete('/api/assets/:id', async (req, res) => {
    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      if (!assetAccessService.canDeleteAsset(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, req.params.id)) return undefined;
      const existing = { rows: [loaded.row], rowCount: 1 };
      const versionRows = (await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1', [req.params.id])).rows;
      const cleanupTargets = collectAssetCleanupPaths(existing.rows[0], versionRows);
      await pool.query('DELETE FROM assets WHERE id = $1 RETURNING id', [req.params.id]);
      await removeAssetFromCollections(req.params.id);
      cleanupAssetFiles(cleanupTargets);
      await removeAssetFromElastic(req.params.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: existing.rows[0].id,
        targetTitle: existing.rows[0].title,
        details: { cleanupTargets: cleanupTargets.length }
      });
      return res.status(204).send();
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to delete asset' });
    }
  });

  app.patch('/api/assets/:id', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      if (!assetAccessService.canEditAssetMetadata(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, req.params.id)) return undefined;

      const row = loaded.row;
      const incomingDcMetadata = sanitizeDcMetadata(body.dcMetadata);
      const parsedDuration = Number(body.durationSeconds);
      const updated = {
        title: Object.prototype.hasOwnProperty.call(body, 'title') ? String(body.title) : row.title,
        description: Object.prototype.hasOwnProperty.call(body, 'description')
          ? String(body.description)
          : row.description,
        owner: Object.prototype.hasOwnProperty.call(body, 'owner') ? String(body.owner) : row.owner,
        durationSeconds: Object.prototype.hasOwnProperty.call(body, 'durationSeconds')
          ? (Number.isFinite(parsedDuration) ? parsedDuration : row.duration_seconds)
          : row.duration_seconds,
        sourcePath: Object.prototype.hasOwnProperty.call(body, 'sourcePath')
          ? String(body.sourcePath)
          : row.source_path,
        tags: Object.prototype.hasOwnProperty.call(body, 'tags') ? toTags(body.tags) : row.tags,
        dcMetadata: {
          ...(row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {}),
          ...incomingDcMetadata
        },
        updatedAt: new Date().toISOString()
      };

      if (Object.prototype.hasOwnProperty.call(body, 'title')) updated.dcMetadata.title = updated.title;
      if (Object.prototype.hasOwnProperty.call(body, 'owner')) updated.dcMetadata.creator = updated.owner;
      if (Object.prototype.hasOwnProperty.call(body, 'description') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'description')) {
        updated.dcMetadata.description = updated.description;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'tags') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'subject')) {
        updated.dcMetadata.subject = updated.tags.join(', ');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'sourcePath') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'source')) {
        updated.dcMetadata.source = updated.sourcePath;
      }
      if (row.file_name) updated.dcMetadata.identifier = row.file_name;
      if (row.mime_type) updated.dcMetadata.format = row.mime_type;
      if (row.type) updated.dcMetadata.type = row.type;

      const result = await pool.query(
        `
          UPDATE assets
          SET title = $2,
              description = $3,
              owner = $4,
              duration_seconds = $5,
              source_path = $6,
              tags = $7,
              dc_metadata = $8::jsonb,
              updated_at = $9
          WHERE id = $1
          RETURNING *
        `,
        [
          req.params.id,
          updated.title,
          updated.description,
          updated.owner,
          updated.durationSeconds,
          updated.sourcePath,
          updated.tags,
          JSON.stringify(updated.dcMetadata),
          updated.updatedAt
        ]
      );

      await indexAssetToElastic(req.params.id).catch(() => {});
      await recordAuditEvent?.(req, {
        action: 'asset.updated',
        targetType: 'asset',
        targetId: result.rows[0].id,
        targetTitle: result.rows[0].title,
        details: {
          fields: Object.keys(body).filter((key) => !['fileData'].includes(key)).slice(0, 40)
        }
      });
      res.json(mapAssetRowForUser(result.rows[0], loaded.accessContext));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update asset' });
    }
  });

  app.post('/api/assets/:id/versions', async (req, res) => {
    let replacementPath = '';
    const replacementArtifactPaths = [];
    try {
      const effective = await resolveEffectivePermissions(req);
      req.userPermissions = effective;
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      const row = loaded.row;
      if (row.deleted_at) return res.status(403).json({ error: 'Trash assets cannot be changed' });
      if (!assetAccessService.canEditAssetMetadata(row, loaded.accessContext) && !canCreateVersionForAsset(req.userPermissions, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, req.params.id)) return undefined;

      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [req.params.id]);
      const count = countResult.rows[0].c;
      const replacementFileData = String(req.body?.fileData || '').trim();
      const replacementFileName = sanitizeFileName(String(req.body?.fileName || '').trim());
      const replacementMimeType = String(req.body?.mimeType || row.mime_type || '').trim().toLowerCase();

      if (replacementFileData) {
        const isImageReplacement = replacementMimeType.startsWith('image/')
          || imageDerivativeService?.isHeicCandidate({
            mimeType: replacementMimeType,
            fileName: replacementFileName
          });
        if (!replacementFileName || !isImageReplacement) {
          return res.status(400).json({ error: 'Only image files can replace this asset version' });
        }

        let replacementBuffer;
        try {
          replacementBuffer = Buffer.from(replacementFileData, 'base64');
        } catch (_error) {
          return res.status(400).json({ error: 'Could not decode replacement file' });
        }
        if (!replacementBuffer.length) return res.status(400).json({ error: 'Replacement file is empty' });

        const replacementHash = computeBufferSha256(replacementBuffer);
        const duplicateAsset = await findDuplicateAssetByHash(replacementHash);
        if (duplicateAsset && duplicateAsset.id !== req.params.id) {
          return res.status(409).json({
            error: 'An identical asset file already exists',
            code: 'duplicate_asset_content',
            existingAsset: buildDuplicateAssetPayload(duplicateAsset)
          });
        }

        const ingestStorage = getIngestStoragePath({
          type: row.type,
          mimeType: replacementMimeType,
          fileName: replacementFileName
        });
        const storedName = `${Date.now()}-${nanoid()}-${replacementFileName}`;
        replacementPath = path.join(ingestStorage.absoluteDir, storedName);
        const replacementMediaUrl = `/uploads/${ingestStorage.relativeDir.replace(/\\/g, '/')}/${storedName}`;
        fs.writeFileSync(replacementPath, replacementBuffer);

        let replacementProxyUrl = '';
        let replacementThumbnailUrl = replacementMediaUrl;
        const derivatives = await imageDerivativeService.ensureImageDerivativesForUpload({
          mimeType: replacementMimeType,
          fileName: replacementFileName,
          inputPath: replacementPath,
          createdAt: new Date()
        });
        replacementProxyUrl = String(derivatives.proxyUrl || '').trim();
        replacementThumbnailUrl = String(derivatives.thumbnailUrl || replacementProxyUrl || '').trim();
        if (replacementProxyUrl) replacementArtifactPaths.push(publicUploadUrlToAbsolutePath(replacementProxyUrl));
        if (replacementThumbnailUrl) replacementArtifactPaths.push(publicUploadUrlToAbsolutePath(replacementThumbnailUrl));

        const actorUsername = String(req.userPermissions?.username || req.userPermissions?.displayName || row.owner || 'user').trim() || 'user';
        const createdAt = new Date().toISOString();
        const version = {
          versionId: nanoid(),
          label: req.body.label?.trim() || `v${count + 1}`,
          note: req.body.note?.trim() || 'Version update',
          snapshot: {
            snapshotMediaUrl: replacementMediaUrl,
            snapshotSourcePath: replacementPath,
            snapshotFileName: replacementFileName,
            snapshotMimeType: replacementMimeType,
            snapshotThumbnailUrl: replacementThumbnailUrl
          },
          actorUsername,
          actionType: 'manual',
          createdAt
        };
        const dcMetadata = {
          ...(row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {}),
          identifier: replacementFileName,
          format: replacementMimeType
        };
        const dbClient = await pool.connect();
        try {
          await dbClient.query('BEGIN');
          const insertVersion = async (entry) => dbClient.query(
            `
              INSERT INTO asset_versions (
                version_id, asset_id, label, note,
                snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
                actor_username, action_type, restored_from_version_id,
                created_at
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            `,
            [
              entry.versionId, req.params.id, entry.label, entry.note,
              entry.snapshot.snapshotMediaUrl, entry.snapshot.snapshotSourcePath, entry.snapshot.snapshotFileName, entry.snapshot.snapshotMimeType, entry.snapshot.snapshotThumbnailUrl,
              entry.actorUsername, entry.actionType, null,
              entry.createdAt
            ]
          );
          if (count === 0) {
            const original = buildVersionSnapshotFromRow(row);
            await insertVersion({
              versionId: nanoid(),
              label: 'v1',
              note: 'Original version',
              snapshot: original,
              actorUsername,
              actionType: 'manual',
              createdAt
            });
          }
          await insertVersion(version);
          await dbClient.query(
            `
              UPDATE assets
              SET file_name = $2,
                  mime_type = $3,
                  media_url = $4,
                  source_path = $5,
                  file_hash = $6,
                  proxy_url = $7,
                  proxy_status = $8,
                  thumbnail_url = $9,
                  dc_metadata = $10::jsonb,
                  updated_at = $11
              WHERE id = $1
            `,
            [
              req.params.id, replacementFileName, replacementMimeType, replacementMediaUrl, replacementPath,
              replacementHash, replacementProxyUrl, replacementProxyUrl ? 'ready' : 'not_applicable', replacementThumbnailUrl,
              JSON.stringify(dcMetadata), version.createdAt
            ]
          );
          await dbClient.query('COMMIT');
        } catch (error) {
          await dbClient.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          dbClient.release();
        }
        await indexAssetToElastic(req.params.id).catch(() => {});
        return res.status(201).json(mapVersionRow({
          version_id: version.versionId,
          asset_id: req.params.id,
          label: version.label,
          note: version.note,
          snapshot_media_url: version.snapshot.snapshotMediaUrl,
          snapshot_source_path: version.snapshot.snapshotSourcePath,
          snapshot_file_name: version.snapshot.snapshotFileName,
          snapshot_mime_type: version.snapshot.snapshotMimeType,
          snapshot_thumbnail_url: version.snapshot.snapshotThumbnailUrl,
          actor_username: version.actorUsername,
          action_type: version.actionType,
          restored_from_version_id: null,
          created_at: version.createdAt
        }));
      }

      const version = {
        versionId: nanoid(),
        label: req.body.label?.trim() || `v${count + 1}`,
        note: req.body.note?.trim() || 'Version update',
        snapshot: buildVersionSnapshotFromRow(row),
        actorUsername: String(req.userPermissions?.username || req.userPermissions?.displayName || row.owner || 'user').trim() || 'user',
        actionType: 'manual',
        createdAt: new Date().toISOString()
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
          version.versionId, req.params.id, version.label, version.note,
          version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
          version.actorUsername, version.actionType, null,
          version.createdAt
        ]
      );
      await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, version.createdAt]);

      res.status(201).json(version);
    } catch (_error) {
      if (replacementPath) {
        try { if (fs.existsSync(replacementPath)) fs.unlinkSync(replacementPath); } catch (_cleanupError) {}
      }
      for (const artifactPath of replacementArtifactPaths) {
        try { if (artifactPath && fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath); } catch (_cleanupError) {}
      }
      res.status(500).json({ error: 'Failed to create version' });
    }
  });

  app.get('/api/assets/:id/versions/:versionId/download', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.params.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      if (!assetAccessService.canDownloadAsset(loaded.row, loaded.accessContext)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      const versionRow = versionResult.rows[0];
      if (!versionRow) return res.status(404).json({ error: 'Version not found' });

      const snapshotMediaUrl = String(versionRow.snapshot_media_url || '').trim();
      if (!snapshotMediaUrl.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'Selected version has no downloadable snapshot' });
      }
      let snapshotSourcePath = String(versionRow.snapshot_source_path || '').trim();
      if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
        const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
        snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
      }
      if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
        return res.status(404).json({ error: 'Version snapshot file is missing on disk' });
      }

      const fallbackName = `${String(loaded.row.file_name || loaded.row.title || assetId).trim() || assetId}-version`;
      const downloadName = sanitizeFileName(String(versionRow.snapshot_file_name || fallbackName || path.basename(snapshotSourcePath)));
      auditDownloadResponse(req, res, loaded.row, {
        source: 'api_asset_version',
        transport: 'api',
        versionId,
        url: `/api/assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/download`
      });
      return res.download(snapshotSourcePath, downloadName, (error) => {
        if (error && !res.headersSent) {
          res.status(500).json({ error: 'Failed to download version snapshot' });
        }
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to download version' });
    }
  });

  app.get('/api/assets/:id/versions/:versionId/preview', async (req, res) => {
    try {
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.params.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const versionResult = await pool.query(
        'SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2',
        [assetId, versionId]
      );
      const versionRow = versionResult.rows[0];
      if (!versionRow) return res.status(404).json({ error: 'Version not found' });

      const mimeType = String(versionRow.snapshot_mime_type || '').trim().toLowerCase();
      if (!mimeType.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image versions can be previewed' });
      }
      let sourcePath = publicUploadUrlToAbsolutePath(String(versionRow.snapshot_thumbnail_url || '').trim());
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        sourcePath = String(versionRow.snapshot_source_path || '').trim();
      }
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        const resolved = publicUploadUrlToAbsolutePath(String(versionRow.snapshot_media_url || '').trim());
        sourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
      }
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return res.status(404).json({ error: 'Version snapshot file is missing on disk' });
      }

      res.type(mimeType);
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'private, no-store');
      res.set('Content-Disposition', 'inline');
      return res.sendFile(sourcePath);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to preview version' });
    }
  });

  app.delete('/api/assets/:id/versions/:versionId', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      req.userPermissions = effective;
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.params.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });
      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const assetRow = loaded.row;
      if (assetRow.deleted_at) return res.status(403).json({ error: 'Trash assets cannot be changed' });
      const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      const row = versionResult.rows[0];
      if (!row) return res.status(404).json({ error: 'Version not found' });
      if (!assetAccessService.canEditAssetMetadata(assetRow, loaded.accessContext) && !canManageVersionRow(req.userPermissions, assetRow, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, assetId)) return undefined;
      if (String(row.action_type || '').trim().toLowerCase() === 'pdf_original') {
        return res.status(400).json({ error: 'Protected version cannot be deleted' });
      }
      const cleanupTargets = collectAssetCleanupPaths({}, [row]);
      await pool.query('DELETE FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      if (typeof cleanupUnreferencedAssetFiles === 'function') {
        await cleanupUnreferencedAssetFiles(cleanupTargets, { assetId, versionId });
      }
      return res.json({ deleted: true, versionId });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to delete version' });
    }
  });

  app.patch('/api/assets/:id/versions/:versionId', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      req.userPermissions = effective;
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.params.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });
      const loaded = await loadVisibleAssetRow(req, assetId);
      if (loaded.status !== 200) return res.status(loaded.status).json({ error: loaded.error });
      const assetRow = loaded.row;
      if (assetRow.deleted_at) return res.status(403).json({ error: 'Trash assets cannot be changed' });

      const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      const row = versionResult.rows[0];
      if (!row) return res.status(404).json({ error: 'Version not found' });
      if (!assetAccessService.canEditAssetMetadata(assetRow, loaded.accessContext) && !canManageVersionRow(req.userPermissions, assetRow, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (await rejectIfForeignEditLock(req, res, assetId)) return undefined;

      const nextLabel = String(req.body?.label || '').trim();
      const nextNote = String(req.body?.note || '').trim();
      if (!nextLabel) return res.status(400).json({ error: 'label is required' });

      const updated = await pool.query(
        `
          UPDATE asset_versions
          SET label = $3,
              note = $4
          WHERE asset_id = $1 AND version_id = $2
          RETURNING *
        `,
        [assetId, versionId, nextLabel, nextNote]
      );
      return res.json({ updated: true, version: mapVersionRow(updated.rows[0]) });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to update version' });
    }
  });

  app.post('/api/assets/:id/transition', async (req, res) => {
    const nextStatus = req.body.status?.trim();

    if (!WORKFLOW.includes(nextStatus)) {
      return res.status(400).json({ error: `Invalid status. Expected one of: ${WORKFLOW.join(', ')}` });
    }

    try {
      const loaded = await loadVisibleAssetRow(req, req.params.id);
      if (loaded.status !== 200) {
        return res.status(loaded.status).json({ error: loaded.error });
      }
      if (loaded.row.deleted_at) return res.status(403).json({ error: 'Trash assets cannot be changed' });

      const currentIndex = WORKFLOW.indexOf(loaded.row.status);
      const nextIndex = WORKFLOW.indexOf(nextStatus);

      if (nextIndex < currentIndex) {
        return res.status(400).json({ error: 'Backward transitions are not allowed in this MVP' });
      }

      const updatedAt = new Date().toISOString();
      const result = await pool.query(
        'UPDATE assets SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *',
        [req.params.id, nextStatus, updatedAt]
      );

      await indexAssetToElastic(req.params.id).catch(() => {});
      res.json(mapAssetRowForUser(result.rows[0], loaded.accessContext));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to transition asset status' });
    }
  });
}

module.exports = {
  registerAssetRoutes
};
