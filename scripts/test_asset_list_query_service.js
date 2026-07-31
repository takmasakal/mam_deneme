const assert = require('assert');
const { createAssetListQueryService } = require('../src/services/assetListQueryService');

function createService(parseDefinition = () => ({ and: [], or: [], values: {} })) {
  return createAssetListQueryService({
    advancedSearchService: { parseDefinition },
    parseTextSearchQuery: (value) => ({ raw: value, parsed: true }),
    normalizeForSearch: (value) => String(value || '').toLowerCase(),
    normalizeUploadDateRange: (from, to) => ({ from: from || null, to: to || null }),
    normalizeSortBy: (value) => value || 'default'
  });
}

function run() {
  const service = createService();

  const defaults = service.parseRequest({ query: {} });
  assert.strictEqual(defaults.pageLimit, 0);
  assert.strictEqual(defaults.pageOffset, 0);
  assert.strictEqual(defaults.trash, 'active');
  assert.strictEqual(defaults.dateField, 'created');
  assert.strictEqual(defaults.normalizedSortBy, 'default');
  assert.deepStrictEqual(defaults.types, []);

  const paged = service.parseRequest({
    query: {
      q: '  Ankara  ',
      limit: '500',
      offset: '-5',
      types: ' Photo, DOCUMENT ,,',
      ensurePreview: '1'
    }
  });
  assert.strictEqual(paged.q, 'Ankara');
  assert.strictEqual(paged.pageLimit, 100);
  assert.strictEqual(paged.pageOffset, 0);
  assert.deepStrictEqual(paged.types, ['photo', 'document']);
  assert.strictEqual(paged.ensurePreview, true);
  assert.deepStrictEqual(paged.parsedAssetQuery, { raw: 'Ankara', parsed: true });

  const advanced = createService(() => ({
    and: ['q'],
    or: [],
    values: {
      uploadDateFrom: '2026-06-01',
      uploadDateTo: '2026-06-30',
      dateField: 'updated',
      sortBy: 'created_asc',
      durationMinSec: '120',
      durationMaxSec: '60',
      sizeMinMb: '1.5',
      sizeMaxMb: '10'
    }
  })).parseRequest({ query: { advanced: 'encoded' } });
  assert.strictEqual(advanced.advancedActive, true);
  assert.strictEqual(advanced.dateField, 'updated');
  assert.deepStrictEqual(advanced.dateRange, {
    from: '2026-06-01',
    to: '2026-06-30'
  });
  assert.strictEqual(advanced.normalizedSortBy, 'updated_asc');
  assert.deepStrictEqual(advanced.durationRange, { min: 60, max: 120, active: true });
  assert.deepStrictEqual(advanced.fileSizeRange, {
    min: 1.5 * 1024 * 1024,
    max: 10 * 1024 * 1024,
    active: true
  });

  const rangeOnly = createService(() => ({
    and: [],
    or: [],
    values: { durationMinSec: '30' }
  })).parseRequest({ query: { advanced: 'encoded' } });
  assert.strictEqual(rangeOnly.advancedActive, true);
  assert.deepStrictEqual(rangeOnly.durationRange, { min: 30, max: null, active: true });

  const durationSortOnly = createService(() => ({
    and: [],
    or: [],
    values: { sortBy: 'duration_desc' }
  })).parseRequest({ query: { advanced: 'encoded' } });
  assert.strictEqual(durationSortOnly.advancedActive, true);
  assert.strictEqual(durationSortOnly.normalizedSortBy, 'duration_desc');

  const sizeSortWithUpdatedDateField = createService(() => ({
    and: [],
    or: [],
    values: { dateField: 'updated', sortBy: 'size_asc' }
  })).parseRequest({ query: { advanced: 'encoded' } });
  assert.strictEqual(sizeSortWithUpdatedDateField.advancedActive, true);
  assert.strictEqual(sizeSortWithUpdatedDateField.dateField, 'updated');
  assert.strictEqual(sizeSortWithUpdatedDateField.normalizedSortBy, 'size_asc');

  const invalidService = createService(() => {
    throw new Error('invalid');
  });
  assert.throws(
    () => invalidService.parseRequest({ query: { advanced: '{bad' } }),
    (error) => error.statusCode === 400 && error.message === 'Invalid advanced search definition'
  );

  process.stdout.write('assetListQueryService tests passed\n');
}

run();
