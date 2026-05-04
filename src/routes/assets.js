const fs = require('fs');
const path = require('path');

function registerAssetRoutes(app, deps) {
  const {
    pool,
    WORKFLOW,
    requireAssetDelete,
    requireMetadataEdit,
    resolveEffectivePermissions,
    collectAssetCleanupPaths,
    cleanupAssetFiles,
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
    recordAuditEvent,
    nanoid
  } = deps;

  app.get('/api/assets', async (req, res) => {
    try {
      const q = (req.query.q || '').toString().trim();
      const hasLimit = Object.prototype.hasOwnProperty.call(req.query, 'limit');
      const pageLimit = hasLimit ? Math.max(1, Math.min(100, Number(req.query.limit) || 10)) : 0;
      const pageOffset = hasLimit ? Math.max(0, Number(req.query.offset) || 0) : 0;
      const parsedAssetQuery = parseTextSearchQuery(q, normalizeForSearch);
      const ocrQ = (req.query.ocrQ || '').toString().trim();
      const subtitleQ = (req.query.subtitleQ || '').toString().trim();
      const tag = (req.query.tag || '').toString().trim();
      const type = (req.query.type || '').toString().trim();
      const owner = (req.query.owner || '').toString().trim();
      const uploadDateFrom = req.query.uploadDateFrom;
      const uploadDateTo = req.query.uploadDateTo;
      const sortBy = (req.query.sortBy || '').toString().trim();
      const types = String(req.query.types || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const status = (req.query.status || '').toString().trim();
      const trash = (req.query.trash || 'active').toString().trim().toLowerCase();
      const ensurePreview = String(req.query.ensurePreview || '').trim() === '1';
      const dateRange = normalizeUploadDateRange(uploadDateFrom, uploadDateTo);
      const normalizedSortBy = normalizeSortBy(sortBy);
      const baseWhere = [];
      const baseValues = [];
      let rankedIds = null;
      const searchMeta = {
        q: { didYouMean: '', fuzzyUsed: false, highlightQuery: q },
        ocrQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: ocrQ },
        subtitleQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: subtitleQ }
      };
  
      if (trash === 'trash') {
        baseWhere.push('deleted_at IS NOT NULL');
      } else if (trash !== 'all') {
        baseWhere.push('deleted_at IS NULL');
      }
      if (tag) {
        baseValues.push(tag);
        const tagParam = `$${baseValues.length}`;
        baseWhere.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
      }
      if (owner) {
        baseValues.push(`%${owner.toLowerCase()}%`);
        baseWhere.push(`LOWER(owner) LIKE $${baseValues.length}`);
      }
      if (type) {
        baseValues.push(type.toLowerCase());
        baseWhere.push(`LOWER(type) = $${baseValues.length}`);
      }
      if (dateRange.from) {
        baseValues.push(dateRange.from);
        baseWhere.push(`created_at >= $${baseValues.length}`);
      }
      if (dateRange.to) {
        baseValues.push(dateRange.to);
        baseWhere.push(`created_at <= $${baseValues.length}`);
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
  
      let rows = [];
      let totalOverride = null;
      const canUseSqlPagination = pageLimit > 0 && !q && !ocrQ && !subtitleQ;
      if (q) {
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
  
      const assetCardMatchPageSize = 10;
      const assetCardMatchFetchLimit = assetCardMatchPageSize + 1;

      if (ocrQ) {
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
      if (subtitleQ) {
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
  
      const total = totalOverride == null ? rows.length : totalOverride;
      const pagedRows = totalOverride == null && pageLimit ? rows.slice(pageOffset, pageOffset + pageLimit) : rows;
      const hydratedRows = [];
      for (const row of pagedRows) {
        if (!ensurePreview) {
          hydratedRows.push(row);
          continue;
        }
        const withPdfThumb = await ensurePdfThumbnailForRow(row);
        hydratedRows.push(await ensureDocumentThumbnailForRow(withPdfThumb));
      }
      res.json({
        assets: hydratedRows.map(mapAssetRow),
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
      return res.json(suggestions);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to suggest assets' });
    }
  });
  
  app.get('/api/assets/ocr-suggest', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.json([]);
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
  
      const out = [];
      for (const row of result.rows) {
        const hit = await findOcrMatchForAssetRow(row, q);
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
      if (q.length < 2) return res.json([]);
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
      const effective = await resolveEffectivePermissions(req).catch(() => null);
      const context = effective || buildUserContextFromRequest(req);
      const requestedOwner = String(req.body?.owner || req.body?.uploadedBy || '').trim();
      const owner = String(context?.displayName || context?.username || context?.email || '').trim() || requestedOwner || 'Unknown';
      const payload = {
        ...(req.body && typeof req.body === 'object' ? req.body : {}),
        owner
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
  
  app.post('/api/assets/upload', async (req, res) => {
    const { fileName, mimeType, fileData, ...metadata } = req.body || {};
    const allowSilentProxyFallback = Boolean(req.body?.allowSilentProxyFallback);
    const skipProxyGeneration = Boolean(req.body?.skipProxyGeneration);
    const isVideoUpload = isVideoCandidate({ mimeType, fileName, declaredType: metadata.type });
    if (!fileData) {
      return res.status(400).json({ error: 'fileData (base64) is required' });
    }
  
    const safeName = sanitizeFileName(fileName);
    let buffer = null;
    let fileHash = '';
  
    try {
      buffer = Buffer.from(String(fileData), 'base64');
      fileHash = computeBufferSha256(buffer);
    } catch (_error) {
      return res.status(400).json({ error: 'Could not decode or save file' });
    }
    if (!buffer || !buffer.length) {
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
  
    const storedName = `${Date.now()}-${nanoid()}-${safeName}`;
    const ingestPath = getIngestStoragePath({ type: metadata.type, mimeType, fileName: safeName });
    const absolutePath = path.join(ingestPath.absoluteDir, storedName);
    const mediaUrl = `/uploads/${ingestPath.relativeDir.replace(/\\/g, '/')}/${storedName}`;
  
    try {
      fs.writeFileSync(absolutePath, buffer);
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
    } else if (String(mimeType || '').toLowerCase().startsWith('image/')) {
      thumbnailUrl = mediaUrl;
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
  
    const effective = await resolveEffectivePermissions(req).catch(() => null);
    const context = effective || buildUserContextFromRequest(req);
    const requestedOwner = String(metadata.owner || metadata.uploadedBy || '').trim();
    const owner = String(context?.displayName || context?.username || context?.email || '').trim() || requestedOwner || 'Unknown';
    const payload = {
      ...metadata,
      owner,
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
          warnings: ingestWarnings.map((item) => item.code).filter(Boolean)
        }
      });
      return res.status(201).json({
        ...created,
        ingestWarnings,
        ingestSucceededWithWarnings: ingestWarnings.length > 0
      });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to create uploaded asset record' });
    }
  });
  
  app.get('/api/assets/:id', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
  
      const versionsResult = await pool.query(
        'SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
      const cutsResult = await pool.query(
        'SELECT * FROM asset_cuts WHERE asset_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
  
      const asset = mapAssetRow(assetResult.rows[0]);
      const audioCandidate = isVideoCandidate({
        mimeType: assetResult.rows[0].mime_type,
        fileName: assetResult.rows[0].file_name,
        declaredType: assetResult.rows[0].type
      }) || String(assetResult.rows[0].mime_type || '').toLowerCase().startsWith('audio/');
      if (audioCandidate && Number(asset.audioChannels || 0) <= 0) {
        const playbackPath = resolvePlaybackInputPath(assetResult.rows[0]);
        asset.audioChannels = await getMediaAudioChannelCount(playbackPath);
      }
      if (audioCandidate) {
        const playbackPath = resolvePlaybackInputPath(assetResult.rows[0]);
        asset.audioStreamOptions = await getMediaAudioStreamOptions(playbackPath);
      }
      asset.versions = versionsResult.rows.map(mapVersionRow);
      asset.cuts = cutsResult.rows.map(mapCutRow);
      res.json(asset);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to load asset' });
    }
  });
  
  app.get('/api/assets/:id/technical', async (req, res) => {
    try {
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!assetResult.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      const row = assetResult.rows[0];
  
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

  app.post('/api/assets/:id/cuts', async (req, res) => {
    const inPoint = Number(req.body.inPointSeconds);
    const outPoint = Number(req.body.outPointSeconds);

    if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || inPoint < 0 || outPoint < inPoint) {
      return res.status(400).json({ error: 'Invalid IN/OUT points' });
    }

    try {
      const exists = await pool.query('SELECT id FROM assets WHERE id = $1', [req.params.id]);
      if (!exists.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
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

  app.post('/api/assets/:id/trash', requireAssetDelete, async (req, res) => {
    try {
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
      return res.json(mapAssetRow(result.rows[0]));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to move asset to trash' });
    }
  });

  app.post('/api/assets/:id/restore', async (req, res) => {
    try {
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
      return res.json(mapAssetRow(result.rows[0]));
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to restore asset' });
    }
  });

  app.delete('/api/assets/:id', requireAssetDelete, async (req, res) => {
    try {
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!existing.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }
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

  app.patch('/api/assets/:id', requireMetadataEdit, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!existing.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      const row = existing.rows[0];
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
      res.json(mapAssetRow(result.rows[0]));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update asset' });
    }
  });

  app.post('/api/assets/:id/versions', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      req.userPermissions = effective;
      const exists = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      const row = exists.rows[0];
      if (!row) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      if (!canCreateVersionForAsset(req.userPermissions, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [req.params.id]);
      const count = countResult.rows[0].c;

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
      res.status(500).json({ error: 'Failed to create version' });
    }
  });

  app.delete('/api/assets/:id/versions/:versionId', async (req, res) => {
    try {
      const effective = await resolveEffectivePermissions(req);
      req.userPermissions = effective;
      const assetId = String(req.params.id || '').trim();
      const versionId = String(req.params.versionId || '').trim();
      if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const assetRow = assetResult.rows[0];
      if (!assetRow) return res.status(404).json({ error: 'Asset not found' });
      const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      const row = versionResult.rows[0];
      if (!row) return res.status(404).json({ error: 'Version not found' });
      if (!canManageVersionRow(req.userPermissions, assetRow, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (String(row.action_type || '').trim().toLowerCase() === 'pdf_original') {
        return res.status(400).json({ error: 'Protected version cannot be deleted' });
      }
      await pool.query('DELETE FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
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
      const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      const assetRow = assetResult.rows[0];
      if (!assetRow) return res.status(404).json({ error: 'Asset not found' });

      const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
      const row = versionResult.rows[0];
      if (!row) return res.status(404).json({ error: 'Version not found' });
      if (!canManageVersionRow(req.userPermissions, assetRow, row)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

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
      const current = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
      if (!current.rowCount) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      const currentIndex = WORKFLOW.indexOf(current.rows[0].status);
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
      res.json(mapAssetRow(result.rows[0]));
    } catch (_error) {
      res.status(500).json({ error: 'Failed to transition asset status' });
    }
  });
}

module.exports = {
  registerAssetRoutes
};
