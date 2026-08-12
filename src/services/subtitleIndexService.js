const fs = require('fs');

function createSubtitleIndexService(deps = {}) {
  const {
    pool,
    publicUploadUrlToAbsolutePath,
    parseSubtitleCues,
    normalizeSubtitleSearchText,
    parseSubtitleTextSearchQuery,
    buildSubtitleCueSearchWhereSql,
    subtitleCueMatchesParsedQuery,
    formatTimecode,
    normalizeSubtitleLang,
    resolveSubtitleActiveByLang,
    levenshteinDistance
  } = deps;

  function tokenizeSubtitleSearchTokens(value) {
    return normalizeSubtitleSearchText(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token && /[\p{L}\p{N}]/u.test(token));
  }

  function fuzzySubtitleTokenMatch(queryToken, candidateToken) {
    const query = String(queryToken || '').trim();
    const candidate = String(candidateToken || '').trim();
    if (!query || !candidate) return false;
    if (query === candidate) return true;
    if (query.charAt(0) !== candidate.charAt(0)) return false;
    const lenDiff = Math.abs(query.length - candidate.length);
    if (lenDiff > 2) return false;
    const maxAllowed = query.length >= 7 ? 2 : 1;
    return levenshteinDistance(query, candidate) <= maxAllowed;
  }

  function fuzzySubtitleTextMatch(queryText, candidateText) {
    const queryTokens = tokenizeSubtitleSearchTokens(queryText);
    const candidateTokens = tokenizeSubtitleSearchTokens(candidateText);
    if (!queryTokens.length || !candidateTokens.length) return false;
    return queryTokens.every((queryToken) => (
      candidateTokens.some((candidateToken) => fuzzySubtitleTokenMatch(queryToken, candidateToken))
    ));
  }

  function suggestSubtitleDidYouMean(cues, query) {
    const parsedQuery = parseSubtitleTextSearchQuery(query);
    if (!parsedQuery.raw || parsedQuery.hasOperators) return '';
    const sourceTokens = tokenizeSubtitleSearchTokens(parsedQuery.raw);
    if (!sourceTokens.length) return '';

    const vocab = new Set();
    (Array.isArray(cues) ? cues : []).forEach((cue) => {
      tokenizeSubtitleSearchTokens(cue?.cueText || cue?.text || '').forEach((token) => vocab.add(token));
    });
    if (!vocab.size) return '';

    let replaced = false;
    const suggestedTokens = sourceTokens.map((token) => {
      let best = token;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of vocab) {
        const lenDiff = Math.abs(candidate.length - token.length);
        if (lenDiff > 2) continue;
        if (candidate.charAt(0) !== token.charAt(0)) continue;
        const dist = levenshteinDistance(token, candidate);
        if (dist < bestDistance) {
          bestDistance = dist;
          best = candidate;
        }
        if (bestDistance === 1) break;
      }
      const maxAllowed = token.length >= 7 ? 2 : 1;
      if (best !== token && bestDistance <= maxAllowed) {
        replaced = true;
        return best;
      }
      return token;
    });

    if (!replaced) return '';
    const suggestion = suggestedTokens.join(' ').trim();
    if (!suggestion || suggestion === parsedQuery.raw) return '';
    return suggestion;
  }

  function mapSubtitleCueRow(row, query) {
    const startSec = Number(row?.start_sec ?? row?.startSec ?? 0);
    const endSec = Number(row?.end_sec ?? row?.endSec ?? startSec);
    const text = String(row?.cue_text ?? row?.cueText ?? row?.text ?? '').trim();
    return {
      seq: Number(row?.seq || 0),
      subtitleUrl: String(row?.subtitle_url ?? row?.subtitleUrl ?? '').trim(),
      startSec,
      endSec,
      startTc: formatTimecode(startSec),
      endTc: formatTimecode(endSec),
      text,
      query: String(query || '').trim()
    };
  }

  function getSubtitleItemsForAssetRow(row) {
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = [];
    const seen = new Set();
    const addItem = (input = {}) => {
      const subtitleUrl = String(input.subtitleUrl || input.url || '').trim();
      if (!subtitleUrl || seen.has(subtitleUrl)) return;
      seen.add(subtitleUrl);
      items.push({
        subtitleUrl,
        subtitleLang: normalizeSubtitleLang(input.subtitleLang || input.lang || dc.subtitleLang || ''),
        subtitleLabel: String(input.subtitleLabel || input.label || '').trim()
      });
    };
    (Array.isArray(dc.subtitleItems) ? dc.subtitleItems : []).forEach(addItem);
    addItem({
      subtitleUrl: dc.subtitleUrl,
      subtitleLang: dc.subtitleLang,
      subtitleLabel: dc.subtitleLabel
    });
    if (!items.length) return [];
    const activeByLang = typeof resolveSubtitleActiveByLang === 'function'
      ? resolveSubtitleActiveByLang(dc, items)
      : {};
    const activeUrls = new Set(Object.values(activeByLang || {}).map((value) => String(value || '').trim()).filter(Boolean));
    if (!activeUrls.size) return items;
    return items.filter((item) => activeUrls.has(item.subtitleUrl));
  }

  function loadSubtitleCuesForAssetRow(row, subtitleUrl) {
    const safeUrl = String(subtitleUrl || '').trim();
    if (!safeUrl) return { subtitleUrl: '', cues: [] };
    const subtitlePath = publicUploadUrlToAbsolutePath(safeUrl);
    if (!subtitlePath || !fs.existsSync(subtitlePath)) return { subtitleUrl: safeUrl, cues: [] };
    try {
      const raw = fs.readFileSync(subtitlePath, 'utf8');
      return { subtitleUrl: safeUrl, cues: parseSubtitleCues(raw) };
    } catch (_error) {
      return { subtitleUrl: safeUrl, cues: [] };
    }
  }

  function loadActiveSubtitleCuesForAssetRow(row) {
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const subtitleUrl = String(dc.subtitleUrl || '').trim();
    if (!subtitleUrl) return { subtitleUrl: '', cues: [] };
    return loadSubtitleCuesForAssetRow(row, subtitleUrl);
  }

  function loadAllSubtitleCuesForAssetRow(row) {
    return getSubtitleItemsForAssetRow(row)
      .map((item) => ({
        ...item,
        cues: loadSubtitleCuesForAssetRow(row, item.subtitleUrl).cues
      }))
      .filter((item) => Array.isArray(item.cues) && item.cues.length);
  }

  async function searchSubtitleMatchesForAssetRow(row, query, limit = 20) {
    const assetId = String(row?.id || '').trim();
    const parsedQuery = parseSubtitleTextSearchQuery(query);
    const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 20));
    if (!assetId || !parsedQuery.raw) {
      return { subtitleUrl: '', matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }

    const subtitleItems = getSubtitleItemsForAssetRow(row);
    const subtitleUrls = subtitleItems.map((item) => item.subtitleUrl).filter(Boolean);
    if (!subtitleUrls.length) {
      return { subtitleUrl: '', matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }

    await ensureSubtitleCueIndexForAssetRow(row);
    const subtitleWhere = buildSubtitleCueSearchWhereSql({
      normColumn: 'norm_text',
      startIndex: 3,
      parsedQuery
    });
    const result = await pool.query(
      `
        SELECT subtitle_url, seq, start_sec, end_sec, cue_text
        FROM asset_subtitle_cues
        WHERE asset_id = $1
          AND subtitle_url = ANY($2::text[])
          ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
        ORDER BY start_sec ASC
        LIMIT $${subtitleWhere.nextIndex}
      `,
      [assetId, subtitleUrls, ...subtitleWhere.params, safeLimit]
    );
    const exactMatches = result.rows.map((item) => mapSubtitleCueRow(item, query));
    if (exactMatches.length || parsedQuery.hasOperators) {
      return {
        subtitleUrl: exactMatches[0]?.subtitleUrl || subtitleUrls[0] || '',
        matches: exactMatches,
        didYouMean: '',
        fuzzyUsed: false,
        highlightQuery: String(query || '').trim()
      };
    }

    const subtitleCueGroups = loadAllSubtitleCuesForAssetRow(row);
    const cues = subtitleCueGroups.flatMap((group) => (
      group.cues.map((cue) => ({ ...cue, subtitleUrl: group.subtitleUrl }))
    ));
    if (!cues.length) {
      return {
        subtitleUrl: subtitleUrls[0] || '',
        matches: [],
        didYouMean: '',
        fuzzyUsed: false,
        highlightQuery: String(query || '').trim()
      };
    }

    const fuzzyMatches = cues
      .filter((cue) => fuzzySubtitleTextMatch(parsedQuery.raw, cue.cueText))
      .slice(0, safeLimit)
      .map((cue) => mapSubtitleCueRow(cue, query));
    const didYouMean = suggestSubtitleDidYouMean(cues, query);
    let highlightQuery = String(query || '').trim();
    let matches = fuzzyMatches;
    let fuzzyUsed = fuzzyMatches.length > 0;

    if (didYouMean) {
      highlightQuery = didYouMean;
      const suggestedQuery = parseSubtitleTextSearchQuery(didYouMean);
      const suggestedMatches = cues
        .filter((cue) => subtitleCueMatchesParsedQuery(cue.cueText, suggestedQuery))
        .slice(0, safeLimit)
        .map((cue) => mapSubtitleCueRow(cue, didYouMean));
      if (suggestedMatches.length) {
        matches = suggestedMatches;
        fuzzyUsed = true;
      } else if (matches.length) {
        matches = matches.map((item) => ({ ...item, query: didYouMean }));
      }
    }

    return {
      subtitleUrl,
      matches,
      didYouMean,
      fuzzyUsed,
      highlightQuery
    };
  }

  async function searchSubtitleMatchesForAssetRows(rows, query, limit = 8) {
    const parsedQuery = parseSubtitleTextSearchQuery(query);
    const cap = Math.max(1, Math.min(500, Number(limit) || 8));
    const byAssetId = new Map();
    const assetRows = Array.isArray(rows) ? rows : [];
    if (!parsedQuery.raw || !assetRows.length) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }

    const urlsByAssetId = new Map();
    assetRows.forEach((row) => {
      const assetId = String(row?.id || '').trim();
      const subtitleUrls = getSubtitleItemsForAssetRow(row).map((item) => item.subtitleUrl).filter(Boolean);
      if (assetId && subtitleUrls.length) urlsByAssetId.set(assetId, subtitleUrls);
    });
    if (!urlsByAssetId.size) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }

    for (const row of assetRows) {
      const assetId = String(row?.id || '').trim();
      if (!urlsByAssetId.has(assetId)) continue;
      try {
        await ensureSubtitleCueIndexForAssetRow(row);
      } catch (error) {
        console.warn(`Subtitle cue index sync skipped for asset ${assetId}: ${error?.message || error}`);
      }
    }

    const assetIds = Array.from(urlsByAssetId.keys());
    const activeUrls = Array.from(new Set(Array.from(urlsByAssetId.values()).flat()));
    const subtitleWhere = buildSubtitleCueSearchWhereSql({
      normColumn: 'norm_text',
      startIndex: 3,
      parsedQuery
    });
    const exactResult = await pool.query(
      `
        WITH matched AS (
          SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text,
                 ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY start_sec ASC) AS rn
          FROM asset_subtitle_cues
          WHERE asset_id = ANY($1::text[])
            AND subtitle_url = ANY($2::text[])
            ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
        )
        SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text
        FROM matched
        WHERE rn <= $${subtitleWhere.nextIndex}
        ORDER BY asset_id, start_sec ASC
      `,
      [assetIds, activeUrls, ...subtitleWhere.params, cap]
    );

    exactResult.rows.forEach((row) => {
      const assetId = String(row.asset_id || '').trim();
      const allowedUrls = urlsByAssetId.get(assetId) || [];
      if (!allowedUrls.includes(String(row.subtitle_url || '').trim())) return;
      if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
      byAssetId.get(assetId).push(mapSubtitleCueRow(row, query));
    });

    if (byAssetId.size) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }

    const cueResult = await pool.query(
      `
        SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text
        FROM asset_subtitle_cues
        WHERE asset_id = ANY($1::text[])
          AND subtitle_url = ANY($2::text[])
        ORDER BY asset_id, start_sec ASC
      `,
      [assetIds, activeUrls]
    );
    const activeCues = cueResult.rows.filter((row) => {
      const assetId = String(row.asset_id || '').trim();
      return (urlsByAssetId.get(assetId) || []).includes(String(row.subtitle_url || '').trim());
    });
    if (!activeCues.length) {
      assetRows.forEach((assetRow) => {
        const assetId = String(assetRow?.id || '').trim();
        const subtitleCueGroups = loadAllSubtitleCuesForAssetRow(assetRow);
        const cues = subtitleCueGroups.flatMap((group) => (
          group.cues.map((cue) => ({ ...cue, subtitleUrl: group.subtitleUrl }))
        ));
        cues.forEach((cue) => {
          if (!assetId || (byAssetId.get(assetId) || []).length >= cap) return;
          const text = String(cue.cueText || '');
          const matched = parsedQuery.hasOperators
            ? subtitleCueMatchesParsedQuery(text, parsedQuery)
            : fuzzySubtitleTextMatch(parsedQuery.raw, text);
          if (!matched) return;
          if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
          byAssetId.get(assetId).push(mapSubtitleCueRow(cue, query));
        });
      });
      return {
        byAssetId,
        didYouMean: '',
        fuzzyUsed: byAssetId.size > 0,
        highlightQuery: String(query || '').trim()
      };
    }
    if (parsedQuery.hasOperators) {
      return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
    }
    const didYouMean = suggestSubtitleDidYouMean(
      activeCues.map((row) => ({ cueText: String(row.cue_text || '') })),
      query
    );
    const highlightQuery = didYouMean || String(query || '').trim();
    const suggestedQuery = didYouMean ? parseSubtitleTextSearchQuery(didYouMean) : null;

    activeCues.forEach((row) => {
      const assetId = String(row.asset_id || '').trim();
      if (!assetId || (byAssetId.get(assetId) || []).length >= cap) return;
      const text = String(row.cue_text || '');
      const matched = suggestedQuery
        ? subtitleCueMatchesParsedQuery(text, suggestedQuery)
        : fuzzySubtitleTextMatch(parsedQuery.raw, text);
      if (!matched) return;
      if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
      byAssetId.get(assetId).push(mapSubtitleCueRow(row, highlightQuery));
    });

    return {
      byAssetId,
      didYouMean,
      fuzzyUsed: byAssetId.size > 0,
      highlightQuery
    };
  }

  async function syncSubtitleCueIndexForAssetRow(row) {
    const assetId = String(row?.id || '').trim();
    if (!assetId) return 0;
    const subtitleItems = getSubtitleItemsForAssetRow(row);
    if (!subtitleItems.length) {
      await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [assetId]);
      return 0;
    }
    const now = new Date().toISOString();
    let indexedCount = 0;
    let seq = 1;

    await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [assetId]);

    for (const item of subtitleItems) {
      const subtitlePath = publicUploadUrlToAbsolutePath(item.subtitleUrl);
      if (!subtitlePath || !fs.existsSync(subtitlePath)) continue;
      const raw = fs.readFileSync(subtitlePath, 'utf8');
      const cues = parseSubtitleCues(raw);
      for (let idx = 0; idx < cues.length; idx += 1) {
        const cue = cues[idx];
        await pool.query(
          `
            INSERT INTO asset_subtitle_cues (
              asset_id, subtitle_url, seq, start_sec, end_sec, cue_text, norm_text, confidence, source_engine, lang, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            assetId,
            item.subtitleUrl,
            seq,
            cue.startSec,
            cue.endSec,
            cue.cueText,
            normalizeSubtitleSearchText(cue.cueText),
            1,
            'whisper',
            normalizeSubtitleLang(item.subtitleLang),
            now
          ]
        );
        seq += 1;
        indexedCount += 1;
      }
    }
    return indexedCount;
  }

  async function ensureSubtitleCueIndexForAssetRow(row) {
    const assetId = String(row?.id || '').trim();
    if (!assetId) return 0;
    const subtitleItems = getSubtitleItemsForAssetRow(row);
    if (!subtitleItems.length) return 0;
    let totalCount = 0;
    for (const item of subtitleItems) {
      const existing = await pool.query(
        'SELECT COUNT(*)::int AS count FROM asset_subtitle_cues WHERE asset_id = $1 AND subtitle_url = $2',
        [assetId, item.subtitleUrl]
      );
      const count = Number(existing.rows?.[0]?.count || 0);
      if (count <= 0) return syncSubtitleCueIndexForAssetRow(row);
      totalCount += count;
    }
    if (totalCount > 0) return totalCount;
    return syncSubtitleCueIndexForAssetRow(row);
  }

  return {
    getSubtitleItemsForAssetRow,
    loadActiveSubtitleCuesForAssetRow,
    loadAllSubtitleCuesForAssetRow,
    searchSubtitleMatchesForAssetRow,
    searchSubtitleMatchesForAssetRows,
    syncSubtitleCueIndexForAssetRow,
    ensureSubtitleCueIndexForAssetRow
  };
}

module.exports = {
  createSubtitleIndexService
};
