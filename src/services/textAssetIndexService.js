const fs = require('fs');
const path = require('path');

function createTextAssetIndexService(deps = {}) {
  const {
    pool,
    uploadsDir,
    ocrDir,
    sanitizeFileName,
    publicUploadUrlToAbsolutePath,
    isUploadArtifactPath,
    sanitizeVideoOcrItems,
    sanitizePhotoOcrItems,
    normalizeOcrEngine,
    normalizeComparableOcr,
    normalizeSubtitleSearchText,
    parseTextSearchQuery,
    buildSubtitleCueSearchWhereSql,
    normalizedTextHasExactTerm,
    normalizedTextHasLongSuffixTerm,
    parseTimedOcrSegments,
    fuzzySearchTextMatch,
    suggestDidYouMeanFromTexts
  } = deps;

  const OCR_TEXT_FILE_INDEX_TTL_MS = 5000;
  let ocrTextFileIndexCache = { expiresAt: 0, paths: [] };

  function pickLatestVideoOcrUrlFromDc(dcMetadata) {
    const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
    const direct = String(dc.videoOcrUrl || '').trim();
    if (direct) return direct;
    const items = sanitizeVideoOcrItems(dc.videoOcrItems);
    if (items.length) return String(items[items.length - 1].ocrUrl || '').trim();
    const photoDirect = String(dc.photoOcrUrl || '').trim();
    if (photoDirect) return photoDirect;
    const photoItems = sanitizePhotoOcrItems(dc.photoOcrItems);
    return photoItems.length ? String(photoItems[photoItems.length - 1].ocrUrl || '').trim() : '';
  }

  function listOcrItemsFromDc(dcMetadata) {
    const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
    const videoItems = sanitizeVideoOcrItems(dc.videoOcrItems).map((item) => ({ ...item, ocrKind: 'video' }));
    const photoItems = sanitizePhotoOcrItems(dc.photoOcrItems).map((item) => ({ ...item, ocrKind: 'photo' }));
    if (!videoItems.length && String(dc.videoOcrUrl || '').trim()) videoItems.push({
      ocrUrl: String(dc.videoOcrUrl).trim(), ocrLabel: String(dc.videoOcrLabel || 'video-ocr'),
      ocrEngine: dc.videoOcrEngine || 'paddle', ocrKind: 'video'
    });
    if (!photoItems.length && String(dc.photoOcrUrl || '').trim()) photoItems.push({
      ocrUrl: String(dc.photoOcrUrl).trim(), ocrLabel: String(dc.photoOcrLabel || 'photo-ocr'),
      ocrEngine: dc.photoOcrEngine || 'paddle', ocrKind: 'photo'
    });
    const seen = new Set();
    return [...videoItems, ...photoItems].filter((item) => {
      const url = String(item.ocrUrl || '').trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function getActiveOcrItemFromDc(dcMetadata) {
    const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
    const activeUrl = pickLatestVideoOcrUrlFromDc(dc);
    if (!activeUrl) return null;
    const videoItems = sanitizeVideoOcrItems(dc.videoOcrItems);
    const photoItems = sanitizePhotoOcrItems(dc.photoOcrItems);
    return [...videoItems, ...photoItems].find((item) => String(item.ocrUrl || '').trim() === activeUrl) || {
      ocrUrl: activeUrl,
      ocrEngine: dc.videoOcrEngine || dc.photoOcrEngine || 'paddle',
      lineCount: Number(dc.videoOcrLineCount || dc.photoOcrLineCount || 0),
      segmentCount: Number(dc.videoOcrSegmentCount || dc.photoOcrSegmentCount || 0)
    };
  }

  function expectedOcrSegmentCountFromItem(item) {
    if (!item || typeof item !== 'object') return 0;
    return Math.max(0, Number(item.segmentCount || 0), Number(item.lineCount || 0));
  }

  function listOcrFilesRecursive(dirPath) {
    const out = [];
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_error) {
        return;
      }
      entries.forEach((entry) => {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
          return;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) out.push(abs);
      });
    };
    walk(dirPath);
    return out;
  }

  function listUploadArtifactFilesRecursive(folderName, extension) {
    const safeFolder = String(folderName || '').trim();
    const safeExt = String(extension || '').trim().toLowerCase();
    if (!safeFolder || !safeExt) return [];
    return listOcrFilesRecursive(uploadsDir).filter((filePath) => {
      const resolvedPath = path.resolve(filePath);
      return resolvedPath.toLowerCase().endsWith(safeExt)
        && resolvedPath.split(path.sep).includes(safeFolder);
    });
  }

  function getOcrTextFileIndex() {
    const now = Date.now();
    if (now < ocrTextFileIndexCache.expiresAt) return ocrTextFileIndexCache.paths;
    const paths = Array.from(new Set([
      ...listOcrFilesRecursive(ocrDir),
      ...listUploadArtifactFilesRecursive('ocr', '.txt')
    ]));
    ocrTextFileIndexCache = { expiresAt: now + OCR_TEXT_FILE_INDEX_TTL_MS, paths };
    return paths;
  }

  function getUploadDatePart(value) {
    const d = value ? new Date(value) : new Date();
    const safeDate = Number.isFinite(d.getTime()) ? d : new Date();
    return path.join(
      String(safeDate.getUTCFullYear()),
      String(safeDate.getUTCMonth() + 1),
      String(safeDate.getUTCDate())
    );
  }

  function getCandidateOcrFilePathsForRow(row) {
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const directPaths = listOcrItemsFromDc(dc)
      .map((item) => publicUploadUrlToAbsolutePath(String(item.ocrUrl || '').trim()))
      .filter((filePath) => filePath && fs.existsSync(filePath));
    if (directPaths.length) return directPaths;

    const titleSlug = sanitizeFileName(String(row?.title || '').trim().toLowerCase());
    const fileSlug = sanitizeFileName(path.basename(String(row?.file_name || ''), path.extname(String(row?.file_name || ''))).toLowerCase());
    const createdDay = getUploadDatePart(row?.created_at);
    const ranked = getOcrTextFileIndex()
      .map((p) => {
        const base = path.basename(p).toLowerCase();
        const rel = path.relative(uploadsDir, p).replace(/\\/g, '/');
        const hasFile = fileSlug && fileSlug.length >= 4 && base.includes(fileSlug);
        const hasTitle = titleSlug && titleSlug.length >= 5 && base.includes(titleSlug);
        const inSameDay = createdDay && rel.startsWith(`${createdDay}/`);
        const hasAssetId = String(row?.id || '').trim() && base.includes(String(row?.id || '').trim().toLowerCase());
        let score = 0;
        if (hasFile) score += 6;
        if (hasTitle) score += 4;
        if (hasAssetId) score += 8;
        if (inSameDay) score += 1;
        return { p, score, hasFile, hasTitle, hasAssetId };
      })
      .filter((x) => x.score > 0 && (x.hasFile || x.hasTitle || x.hasAssetId))
      .sort((a, b) => b.score - a.score);
    return ranked.length ? ranked.slice(0, 8).map((x) => x.p) : [];
  }

  function ocrLineMatchesParsedQuery(line, parsedQuery) {
    const comparable = normalizeComparableOcr(line);
    if (!comparable || !parsedQuery?.raw) return false;
    if (!parsedQuery.hasOperators) return comparable.includes(parsedQuery.raw);
    if (!parsedQuery.mustInclude.every((term) => comparable.includes(term))) return false;
    if (!parsedQuery.mustIncludeExact.every((term) => normalizedTextHasExactTerm(comparable, term))) return false;
    if (!parsedQuery.mustExclude.every((term) => !comparable.includes(term))) return false;
    if (!parsedQuery.mustExcludeExact.every((term) => !normalizedTextHasExactTerm(comparable, term))) return false;
    if (!(parsedQuery.mustExcludeLongSuffix || []).every((term) => !normalizedTextHasLongSuffixTerm(comparable, term))) return false;
    const optionalHit = parsedQuery.optional.some((term) => comparable.includes(term));
    const optionalExactHit = parsedQuery.optionalExact.some((term) => normalizedTextHasExactTerm(comparable, term));
    if (parsedQuery.optional.length === 0 && parsedQuery.optionalExact.length === 0) return true;
    return optionalHit || optionalExactHit;
  }

  function extractOcrMatchLinesByParsedQuery(content, parsedQuery, limit = 8) {
    const out = [];
    const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
    const cap = Math.max(1, Math.min(50, Number(limit) || 8));
    for (const raw of lines) {
      const line = String(raw || '').trim();
      if (!line || !ocrLineMatchesParsedQuery(line, parsedQuery)) continue;
      out.push(line);
      if (out.length >= cap) break;
    }
    return out;
  }

  function parseTimecodePrefixToSec(line) {
    const raw = String(line || '');
    const match = raw.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    const parse = (v) => {
      const m = String(v || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
      if (!m) return null;
      return (Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4]) / 1000);
    };
    if (match) {
      const start = parse(match[1]);
      const end = parse(match[2]);
      return Number.isFinite(start) && Number.isFinite(end) ? { startSec: start, endSec: end } : null;
    }
    const single = raw.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
    if (!single) return null;
    const at = parse(single[1]);
    return Number.isFinite(at) ? { startSec: at, endSec: at } : null;
  }

  function findOcrMatchesInRow(row, queryRaw, limit = 8) {
    const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
    if (!parsedQuery.raw) return [];
    const cap = Math.max(1, Math.min(50, Number(limit) || 8));
    const out = [];
    const seen = new Set();
    for (const filePath of getCandidateOcrFilePathsForRow(row)) {
      let raw = '';
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch (_error) {
        continue;
      }
      const lines = extractOcrMatchLinesByParsedQuery(raw, parsedQuery, cap);
      const relative = path.relative(uploadsDir, filePath).replace(/\\/g, '/');
      const ocrUrl = relative ? `/uploads/${relative}` : '';
      for (const line of lines) {
        const key = normalizeComparableOcr(line) || line.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const tc = parseTimecodePrefixToSec(line);
        out.push({
          ocrUrl,
          line,
          startSec: Number(tc?.startSec || 0),
          endSec: Number(tc?.endSec || 0)
        });
        if (out.length >= cap) return out;
      }
    }
    return out;
  }

  async function syncOcrSegmentIndexForAsset(assetId, ocrUrl, options = {}) {
    const safeAssetId = String(assetId || '').trim();
    const safeOcrUrl = String(ocrUrl || '').trim();
    if (!safeAssetId || !safeOcrUrl) return 0;
    const ocrPath = publicUploadUrlToAbsolutePath(safeOcrUrl);
    await pool.query('DELETE FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2', [safeAssetId, safeOcrUrl]);
    if (!ocrPath || !isUploadArtifactPath(ocrPath, 'ocr') || !fs.existsSync(ocrPath)) return 0;
    let raw = '';
    try {
      raw = fs.readFileSync(ocrPath, 'utf8');
    } catch (_error) {
      return 0;
    }
    const segments = parseTimedOcrSegments(raw);
    if (!segments.length) return 0;
    const sourceEngine = normalizeOcrEngine(options.sourceEngine || 'paddle');
    const lang = String(options.lang || '').trim();
    const now = new Date().toISOString();
    for (let idx = 0; idx < segments.length; idx += 1) {
      const seg = segments[idx];
      await pool.query(
        `
          INSERT INTO asset_ocr_segments (
            asset_id, ocr_url, seq, start_sec, end_sec, segment_text, norm_text, confidence, source_engine, lang, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          safeAssetId,
          safeOcrUrl,
          idx + 1,
          seg.startSec,
          seg.endSec,
          seg.segmentText,
          normalizeSubtitleSearchText(seg.segmentText),
          1,
          sourceEngine,
          lang,
          now
        ]
      );
    }
    return segments.length;
  }

  async function findOcrMatchesForAssetRow(row, queryRaw, limit = 8) {
    const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
    const assetId = String(row?.id || '').trim();
    const cap = Math.max(1, Math.min(50, Number(limit) || 8));
    if (!assetId || !parsedQuery.raw) return [];
    const sources = listOcrItemsFromDc(row?.dc_metadata || {});
    const urls = sources.map((item) => String(item.ocrUrl || '').trim()).filter(Boolean);
    if (urls.length) {
      await ensureOcrSegmentIndexForAssetRow(row);
      const ocrWhere = buildSubtitleCueSearchWhereSql({ normColumn: 'norm_text', startIndex: 3, parsedQuery });
      const result = await pool.query(
        `SELECT ocr_url, start_sec, end_sec, segment_text FROM asset_ocr_segments
         WHERE asset_id = $1 AND ocr_url = ANY($2::text[])
           ${ocrWhere.clauses.length ? `AND ${ocrWhere.clauses.join(' AND ')}` : ''}
         ORDER BY start_sec ASC LIMIT $${ocrWhere.nextIndex}`,
        [assetId, urls, ...ocrWhere.params, cap]
      );
      if (result.rowCount) {
        const sourceByUrl = new Map(sources.map((item) => [String(item.ocrUrl || '').trim(), item]));
        return result.rows.map((hit) => {
          const source = sourceByUrl.get(String(hit.ocr_url || '').trim()) || {};
          return {
            ocrUrl: String(hit.ocr_url || '').trim(), line: String(hit.segment_text || ''),
            startSec: Number(hit.start_sec || 0), endSec: Number(hit.end_sec || 0),
            sourceType: String(source.sourceType || ''), sourceFileName: String(source.sourceFileName || ''),
            sourceVersionId: String(source.sourceVersionId || ''), ocrLabel: String(source.ocrLabel || '')
          };
        });
      }
    }
    return findOcrMatchesInRow(row, queryRaw, cap);
  }

  async function findOcrMatchForAssetRow(row, queryRaw) {
    const hits = await findOcrMatchesForAssetRow(row, queryRaw, 1);
    return hits[0] || null;
  }

  async function loadActiveOcrSegmentsForAssetRow(row) {
    const assetId = String(row?.id || '').trim();
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const activeOcrUrl = String(pickLatestVideoOcrUrlFromDc(dc) || '').trim();
    if (!assetId || !activeOcrUrl) return { ocrUrl: activeOcrUrl, segments: [] };

    const fetchSegments = () => pool.query(
      `
        SELECT start_sec, end_sec, segment_text
        FROM asset_ocr_segments
        WHERE asset_id = $1
          AND ocr_url = $2
        ORDER BY start_sec ASC
      `,
      [assetId, activeOcrUrl]
    );
    let result = await fetchSegments();
    if (!result.rowCount) {
      await syncOcrSegmentIndexForAsset(assetId, activeOcrUrl, {
        sourceEngine: String(dc.videoOcrEngine || 'paddle').trim(),
        lang: ''
      });
      result = await fetchSegments();
    }
    return {
      ocrUrl: activeOcrUrl,
      segments: result.rows.map((segment) => ({
        startSec: Number(segment.start_sec || 0),
        endSec: Number(segment.end_sec || 0),
        segmentText: String(segment.segment_text || '')
      }))
    };
  }

  async function ensureOcrSegmentIndexForAssetRow(row) {
    const assetId = String(row?.id || '').trim();
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    if (!assetId) return 0;
    let total = 0;
    for (const item of listOcrItemsFromDc(dc)) {
      const ocrUrl = String(item.ocrUrl || '').trim();
      if (!ocrUrl) continue;
      try {
        const existing = await pool.query(
          'SELECT COUNT(*)::int AS count FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2',
          [assetId, ocrUrl]
        );
        const count = Number(existing.rows?.[0]?.count || 0);
        const expected = expectedOcrSegmentCountFromItem(item);
        if (count > 0 && (!expected || count >= expected)) { total += count; continue; }
        total += await syncOcrSegmentIndexForAsset(assetId, ocrUrl, {
          sourceEngine: String(item.ocrEngine || dc.videoOcrEngine || dc.photoOcrEngine || 'paddle').trim(),
          lang: item.ocrLang || ''
        });
      } catch (error) {
        console.warn('ocr-segment-index-repair-failed', { assetId, ocrUrl, message: error?.message || String(error) });
      }
    }
    return total;
  }

  function mapOcrSegmentRow(segment, query, ocrUrl = '', source = {}) {
    return {
      ocrUrl,
      line: String(segment?.segmentText || segment?.line || '').trim(),
      startSec: Number(segment?.startSec || 0),
      endSec: Number(segment?.endSec || 0),
      query: String(query || '').trim(),
      sourceType: String(source.sourceType || ''),
      sourceFileName: String(source.sourceFileName || ''),
      sourceVersionId: String(source.sourceVersionId || ''),
      ocrLabel: String(source.ocrLabel || '')
    };
  }

  async function searchOcrMatchesForAssetRow(row, queryRaw, limit = 8) {
    const result = await searchOcrMatchesForAssetRows([row], queryRaw, limit);
    const matches = result.byAssetId.get(String(row?.id || '').trim()) || [];
    return {
      ocrUrl: String(matches[0]?.ocrUrl || pickLatestVideoOcrUrlFromDc(row?.dc_metadata || {}) || '').trim(),
      matches, didYouMean: result.didYouMean, fuzzyUsed: result.fuzzyUsed, highlightQuery: result.highlightQuery
    };
  }

  async function searchOcrMatchesForAssetRows(rows, queryRaw, limit = 8) {
    const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
    const cap = Math.max(1, Math.min(500, Number(limit) || 8));
    const byAssetId = new Map();
    const assetRows = Array.isArray(rows) ? rows : [];
    if (!parsedQuery.raw || !assetRows.length) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
    }
    const sourceByKey = new Map();
    assetRows.forEach((row) => {
      const assetId = String(row?.id || '').trim();
      if (!assetId) return;
      listOcrItemsFromDc(row?.dc_metadata || {}).forEach((source) => {
        const url = String(source.ocrUrl || '').trim();
        if (url) sourceByKey.set(`${assetId}\u0000${url}`, source);
      });
    });
    if (!sourceByKey.size) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
    }
    await Promise.allSettled(assetRows.map((row) => ensureOcrSegmentIndexForAssetRow(row)));
    const assetIds = Array.from(new Set(assetRows.map((row) => String(row?.id || '').trim()).filter(Boolean)));
    const activeUrls = Array.from(new Set(Array.from(sourceByKey.keys()).map((key) => key.slice(key.indexOf('\u0000') + 1))));
    const ocrWhere = buildSubtitleCueSearchWhereSql({ normColumn: 'norm_text', startIndex: 3, parsedQuery });
    const exactResult = await pool.query(
      `
        WITH matched AS (
          SELECT asset_id, ocr_url, start_sec, end_sec, segment_text,
                 ROW_NUMBER() OVER (PARTITION BY asset_id, ocr_url ORDER BY start_sec ASC) AS rn
          FROM asset_ocr_segments
          WHERE asset_id = ANY($1::text[])
            AND ocr_url = ANY($2::text[])
            ${ocrWhere.clauses.length ? `AND ${ocrWhere.clauses.join(' AND ')}` : ''}
        )
        SELECT asset_id, ocr_url, start_sec, end_sec, segment_text
        FROM matched
        WHERE rn <= $${ocrWhere.nextIndex}
        ORDER BY asset_id, ocr_url, start_sec ASC
      `,
      [assetIds, activeUrls, ...ocrWhere.params, cap]
    );
    exactResult.rows.forEach((row) => {
      const assetId = String(row.asset_id || '').trim();
      const activeUrl = String(row.ocr_url || '').trim();
      const source = sourceByKey.get(`${assetId}\u0000${activeUrl}`) || {};
      if (!activeUrl || !sourceByKey.has(`${assetId}\u0000${activeUrl}`)) return;
      if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
      byAssetId.get(assetId).push(mapOcrSegmentRow({
        line: String(row.segment_text || ''),
        startSec: Number(row.start_sec || 0),
        endSec: Number(row.end_sec || 0)
      }, queryRaw, activeUrl, source));
    });
    if (byAssetId.size || parsedQuery.hasOperators) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
    }
    const segmentResult = await pool.query(
      `
        SELECT asset_id, ocr_url, start_sec, end_sec, segment_text
        FROM asset_ocr_segments
        WHERE asset_id = ANY($1::text[])
          AND ocr_url = ANY($2::text[])
        ORDER BY asset_id, ocr_url, start_sec ASC
      `,
      [assetIds, activeUrls]
    );
    const activeSegments = segmentResult.rows.filter((row) => {
      const assetId = String(row.asset_id || '').trim();
      return sourceByKey.has(`${assetId}\u0000${String(row.ocr_url || '').trim()}`);
    });
    const didYouMean = suggestDidYouMeanFromTexts(
      activeSegments.map((row) => String(row.segment_text || '')),
      queryRaw,
      { parseFn: parseTextSearchQuery, normalizeFn: normalizeSubtitleSearchText }
    );
    const highlightQuery = didYouMean || String(queryRaw || '').trim();
    const suggestedQuery = didYouMean ? parseTextSearchQuery(didYouMean, normalizeSubtitleSearchText) : null;
    activeSegments.forEach((row) => {
      const assetId = String(row.asset_id || '').trim();
      const ocrUrl = String(row.ocr_url || '').trim();
      if (!assetId || (byAssetId.get(assetId) || []).length >= cap) return;
      const text = String(row.segment_text || '');
      const matched = suggestedQuery
        ? ocrLineMatchesParsedQuery(text, suggestedQuery)
        : fuzzySearchTextMatch(parsedQuery.raw, text, normalizeSubtitleSearchText);
      if (!matched) return;
      if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
      byAssetId.get(assetId).push(mapOcrSegmentRow({
        line: text,
        startSec: Number(row.start_sec || 0),
        endSec: Number(row.end_sec || 0)
      }, highlightQuery, ocrUrl, sourceByKey.get(`${assetId}\u0000${ocrUrl}`) || {}));
    });
    return { byAssetId, didYouMean, fuzzyUsed: byAssetId.size > 0, highlightQuery };
  }

  return {
    pickLatestVideoOcrUrlFromDc,
    getActiveOcrItemFromDc,
    expectedOcrSegmentCountFromItem,
    getCandidateOcrFilePathsForRow,
    findOcrMatchForAssetRow,
    findOcrMatchesForAssetRow,
    searchOcrMatchesForAssetRow,
    searchOcrMatchesForAssetRows,
    ensureOcrSegmentIndexForAssetRow,
    syncOcrSegmentIndexForAsset
  };
}

module.exports = {
  createTextAssetIndexService
};
