function createAssetListQueryService({
  advancedSearchService,
  parseTextSearchQuery,
  normalizeForSearch,
  normalizeUploadDateRange,
  normalizeSortBy
}) {
  function normalizeNumberRange(minValue, maxValue, multiplier = 1) {
    const parse = (value) => {
      if (String(value ?? '').trim() === '') return null;
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number * multiplier : null;
    };
    let min = parse(minValue);
    let max = parse(maxValue);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    return { min, max, active: min !== null || max !== null };
  }

  function parseRequest(req) {
    const query = req?.query || {};
    const q = String(query.q || '').trim();
    const hasLimit = Object.prototype.hasOwnProperty.call(query, 'limit');
    const pageLimit = hasLimit ? Math.max(1, Math.min(100, Number(query.limit) || 10)) : 0;
    const pageOffset = hasLimit ? Math.max(0, Number(query.offset) || 0) : 0;
    const ocrQ = String(query.ocrQ || '').trim();
    const subtitleQ = String(query.subtitleQ || '').trim();
    const tag = String(query.tag || '').trim();
    const type = String(query.type || '').trim();
    const owner = String(query.owner || '').trim();
    const requestDateField = String(query.dateField || '').trim().toLowerCase();
    const sortBy = String(query.sortBy || '').trim();
    const types = String(query.types || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const status = String(query.status || '').trim();
    const trash = String(query.trash || 'active').trim().toLowerCase();
    let advancedDefinition = null;
    try {
      advancedDefinition = advancedSearchService.parseDefinition(query.advanced);
    } catch (_error) {
      const error = new Error('Invalid advanced search definition');
      error.statusCode = 400;
      throw error;
    }
    const advancedActive = Boolean(advancedDefinition && (
      advancedDefinition.and.length
      || advancedDefinition.or.length
      || String(advancedDefinition.values.uploadDateFrom || '').trim()
      || String(advancedDefinition.values.uploadDateTo || '').trim()
      || String(advancedDefinition.values.durationMinSec || '').trim()
      || String(advancedDefinition.values.durationMaxSec || '').trim()
      || String(advancedDefinition.values.sizeMinMb || '').trim()
      || String(advancedDefinition.values.sizeMaxMb || '').trim()
      || String(advancedDefinition.values.sortBy || '').trim()
    ));
    const uploadDateFrom = advancedActive
      ? String(query.uploadDateFrom || advancedDefinition.values.uploadDateFrom || '')
      : query.uploadDateFrom;
    const uploadDateTo = advancedActive
      ? String(query.uploadDateTo || advancedDefinition.values.uploadDateTo || '')
      : query.uploadDateTo;
    const dateField = (advancedActive
      ? String(requestDateField || advancedDefinition.values.dateField || '')
      : requestDateField) === 'updated' ? 'updated' : 'created';
    const requestedSortBy = advancedActive
      ? (sortBy || advancedDefinition.values.sortBy)
      : sortBy;
    const normalizedSortBy = normalizeSortBy(
      dateField === 'updated'
        ? String(requestedSortBy || '').replace(/^created_/, 'updated_')
        : requestedSortBy
    );
    const durationRange = normalizeNumberRange(
      advancedDefinition?.values?.durationMinSec,
      advancedDefinition?.values?.durationMaxSec
    );
    const fileSizeRange = normalizeNumberRange(
      advancedDefinition?.values?.sizeMinMb,
      advancedDefinition?.values?.sizeMaxMb,
      1024 * 1024
    );
    return {
      q,
      pageLimit,
      pageOffset,
      parsedAssetQuery: parseTextSearchQuery(q, normalizeForSearch),
      ocrQ,
      subtitleQ,
      tag,
      type,
      owner,
      types,
      status,
      trash,
      ensurePreview: String(query.ensurePreview || '').trim() === '1',
      advancedDefinition,
      advancedActive,
      dateRange: normalizeUploadDateRange(uploadDateFrom, uploadDateTo),
      durationRange,
      fileSizeRange,
      dateField,
      normalizedSortBy
    };
  }

  return { parseRequest };
}

module.exports = { createAssetListQueryService };
