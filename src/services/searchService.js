function createSearchService(deps) {
  const {
    pool,
    elasticUrl,
    elasticIndex,
    parseTextSearchQuery,
    normalizeForSearch
  } = deps;

  function escapeElasticId(value) {
    return encodeURIComponent(String(value || '').trim());
  }

  function escapeElasticQueryTerm(value) {
    return String(value || '').replace(/[\\*?]/g, '\\$&');
  }

  async function elasticRequest(method, endpoint, body) {
    try {
      const response = await fetch(`${elasticUrl}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, payload };
    } catch (_error) {
      return { ok: false, status: 0, payload: {} };
    }
  }

  async function elasticNdjsonRequest(endpoint, lines) {
    try {
      const payload = `${(Array.isArray(lines) ? lines : []).join('\n')}\n`;
      const response = await fetch(`${elasticUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: payload
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok && !data?.errors, status: response.status, payload: data };
    } catch (_error) {
      return { ok: false, status: 0, payload: {} };
    }
  }

  async function ensureElasticIndex() {
    const exists = await elasticRequest('HEAD', `/${elasticIndex}`);
    if (exists.ok) return true;

    const create = await elasticRequest('PUT', `/${elasticIndex}`, {
      mappings: {
        properties: {
          id: { type: 'keyword' },
          title: { type: 'text' },
          description: { type: 'text' },
          owner: { type: 'text' },
          type: { type: 'keyword' },
          status: { type: 'keyword' },
          tags: { type: 'text' },
          dc: { type: 'text' },
          clips: { type: 'text' },
          inTrash: { type: 'boolean' }
        }
      }
    });
    return create.ok;
  }

  function mapAssetSearchDoc(row, cutLabels = []) {
    return {
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      owner: row.owner || '',
      type: row.type || '',
      status: row.status || '',
      tags: Array.isArray(row.tags) ? row.tags.join(' ') : '',
      dc: JSON.stringify(row.dc_metadata || {}),
      clips: (Array.isArray(cutLabels) ? cutLabels : []).map((label) => String(label || '')).join(' '),
      inTrash: Boolean(row.deleted_at)
    };
  }

  async function buildAssetSearchDoc(assetId) {
    const [assetResult, cutsResult] = await Promise.all([
      pool.query('SELECT * FROM assets WHERE id = $1', [assetId]),
      pool.query('SELECT label FROM asset_cuts WHERE asset_id = $1 ORDER BY created_at DESC', [assetId])
    ]);
    if (!assetResult.rowCount) return null;
    return mapAssetSearchDoc(assetResult.rows[0], cutsResult.rows.map((row) => row.label));
  }

  async function indexAssetToElastic(assetId) {
    const doc = await buildAssetSearchDoc(assetId);
    if (!doc) return;
    await ensureElasticIndex();
    await elasticRequest('PUT', `/${elasticIndex}/_doc/${escapeElasticId(assetId)}`, doc);
  }

  async function removeAssetFromElastic(assetId) {
    await elasticRequest('DELETE', `/${elasticIndex}/_doc/${escapeElasticId(assetId)}`);
  }

  async function searchAssetIdsElastic(queryText, limit = 500) {
    const q = String(queryText || '').trim();
    if (!q) return [];
    await ensureElasticIndex();
    const parsedQuery = parseTextSearchQuery(q, normalizeForSearch);
    const fields = ['title^4', 'description^2', 'owner^2', 'tags^2', 'dc', 'clips^3', 'type', 'status'];
    const buildElasticShouldClauses = (term) => ([
      { multi_match: { query: term, type: 'bool_prefix', fields, boost: 3 } },
      { match_phrase_prefix: { title: { query: term, boost: 6 } } },
      { match_phrase_prefix: { clips: { query: term, boost: 5 } } },
      { match_phrase_prefix: { dc: { query: term, boost: 2 } } }
    ]);
    const buildElasticExactClauses = (term) => ([
      { match_phrase: { title: { query: term, boost: 8 } } },
      { match_phrase: { description: { query: term, boost: 4 } } },
      { match_phrase: { owner: { query: term, boost: 4 } } },
      { match_phrase: { tags: { query: term, boost: 3 } } },
      { match_phrase: { dc: { query: term, boost: 2 } } },
      { match_phrase: { clips: { query: term, boost: 5 } } }
    ]);
    const buildElasticWildcardClauses = (term) => fields.map((fieldName) => ({
      wildcard: {
        [fieldName.replace(/\^.*$/, '')]: {
          value: `*${escapeElasticQueryTerm(term)}*`,
          case_insensitive: true
        }
      }
    }));
    const result = await elasticRequest('POST', `/${elasticIndex}/_search`, {
      size: limit,
      query: {
        bool: parsedQuery.hasOperators ? {
          must: [
            ...parsedQuery.mustInclude.flatMap((term) => buildElasticWildcardClauses(term)),
            ...parsedQuery.mustIncludeExact.flatMap((term) => buildElasticExactClauses(term))
          ],
          must_not: [
            ...parsedQuery.mustExclude.flatMap((term) => buildElasticWildcardClauses(term)),
            ...parsedQuery.mustExcludeExact.flatMap((term) => buildElasticExactClauses(term))
          ],
          should: [
            ...parsedQuery.optional.flatMap((term) => buildElasticShouldClauses(term)),
            ...parsedQuery.optionalExact.flatMap((term) => buildElasticExactClauses(term))
          ],
          minimum_should_match: (parsedQuery.optional.length + parsedQuery.optionalExact.length) > 0 ? 1 : 0
        } : {
          should: [
            { query_string: { query: q, default_operator: 'AND', fields, boost: 5 } },
            ...buildElasticShouldClauses(q)
          ],
          minimum_should_match: 1
        }
      },
      _source: false
    });
    if (!result.ok) return null;
    const hits = result.payload?.hits?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map((h) => String(h._id || '')).filter(Boolean);
  }

  async function suggestAssetIdsElastic(queryText, limit = 10) {
    const q = String(queryText || '').trim();
    if (!q) return [];
    await ensureElasticIndex();
    const parsedQuery = parseTextSearchQuery(q, normalizeForSearch);
    const simpleFields = ['title', 'owner', 'tags'];
    const buildWildcardClauses = (term) => simpleFields.map((fieldName) => ({
      wildcard: {
        [fieldName]: {
          value: `*${escapeElasticQueryTerm(term)}*`,
          case_insensitive: true
        }
      }
    }));
    const buildExactSuggestClauses = (term) => ([
      { match_phrase: { title: { query: term, boost: 10 } } },
      { match_phrase: { owner: { query: term, boost: 4 } } },
      { match_phrase: { tags: { query: term, boost: 4 } } }
    ]);
    const result = await elasticRequest('POST', `/${elasticIndex}/_search`, {
      size: Math.max(1, Math.min(20, Number(limit) || 10)),
      query: {
        bool: parsedQuery.hasOperators ? {
          must: [
            ...parsedQuery.mustInclude.flatMap((term) => buildWildcardClauses(term)),
            ...parsedQuery.mustIncludeExact.flatMap((term) => buildExactSuggestClauses(term))
          ],
          must_not: [
            ...parsedQuery.mustExclude.flatMap((term) => buildWildcardClauses(term)),
            ...parsedQuery.mustExcludeExact.flatMap((term) => buildExactSuggestClauses(term))
          ],
          should: [
            ...parsedQuery.optional.flatMap((term) => ([
              { match_phrase_prefix: { title: { query: term, boost: 8 } } },
              { match: { title: { query: term, fuzziness: 'AUTO', boost: 5 } } },
              { match_phrase_prefix: { owner: { query: term, boost: 2 } } },
              { match_phrase_prefix: { tags: { query: term, boost: 2 } } }
            ])),
            ...parsedQuery.optionalExact.flatMap((term) => buildExactSuggestClauses(term))
          ],
          minimum_should_match: (parsedQuery.optional.length + parsedQuery.optionalExact.length) > 0 ? 1 : 0
        } : {
          should: [
            { match_phrase_prefix: { title: { query: q, boost: 8 } } },
            { match: { title: { query: q, fuzziness: 'AUTO', boost: 5 } } },
            { match_phrase_prefix: { owner: { query: q, boost: 2 } } },
            { match_phrase_prefix: { tags: { query: q, boost: 2 } } }
          ],
          minimum_should_match: 1
        }
      },
      _source: false
    });
    if (!result.ok) return null;
    const hits = result.payload?.hits?.hits;
    if (!Array.isArray(hits)) return [];
    return hits.map((h) => String(h._id || '')).filter(Boolean);
  }

  async function backfillElasticIndex() {
    await ensureElasticIndex();
    const pageSize = 250;
    let offset = 0;
    let indexed = 0;
    while (true) {
      const result = await pool.query(
        `
          SELECT
            assets.*,
            COALESCE(
              json_agg(c.label ORDER BY c.created_at DESC) FILTER (WHERE c.cut_id IS NOT NULL),
              '[]'::json
            ) AS cut_labels
          FROM assets
          LEFT JOIN asset_cuts c ON c.asset_id = assets.id
          GROUP BY assets.id
          ORDER BY assets.created_at ASC
          LIMIT $1 OFFSET $2
        `,
        [pageSize, offset]
      );
      if (!result.rowCount) break;

      const lines = [];
      result.rows.forEach((row) => {
        const assetId = String(row.id || '').trim();
        if (!assetId) return;
        lines.push(JSON.stringify({ index: { _index: elasticIndex, _id: assetId } }));
        lines.push(JSON.stringify(mapAssetSearchDoc(row, row.cut_labels)));
      });
      if (lines.length) {
        const bulkResult = await elasticNdjsonRequest('/_bulk', lines);
        if (bulkResult.ok) indexed += Math.floor(lines.length / 2);
      }
      if (result.rowCount < pageSize) break;
      offset += pageSize;
    }
    return indexed;
  }

  return {
    ensureElasticIndex,
    indexAssetToElastic,
    removeAssetFromElastic,
    searchAssetIdsElastic,
    suggestAssetIdsElastic,
    backfillElasticIndex
  };
}

module.exports = { createSearchService };
