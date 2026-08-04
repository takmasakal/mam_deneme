const assert = require('assert');
const { createMainAssetCardRenderer } = require('../public/main-asset-card');

function createRenderer(counters) {
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const counted = (name, result = '') => (...args) => {
    counters[name] = (counters[name] || 0) + 1;
    counters[`${name}Args`] = args;
    return typeof result === 'function' ? result(...args) : result;
  };
  return createMainAssetCardRenderer({
    escapeHtml,
    t: (key) => key,
    highlightMatch: counted('highlight', (value) => `<mark>${escapeHtml(value)}</mark>`),
    metadataHighlightSnippet: counted('metadata', 'metadata-hit'),
    dcHighlightSnippet: counted('dc', 'dc-hit'),
    tagHighlightSnippet: counted('tag', 'tag-hit'),
    clipHighlightSnippet: counted('clip', 'clip-hit'),
    effectiveSearchHighlightClass: () => 'search-hit',
    foldSearchText: (value) => String(value || '').toLowerCase(),
    workflowLabel: (value) => value,
    formatDuration: (value) => `${value}s`,
    formatDate: (value) => value,
    tagColorStyle: () => '',
    isVideo: (asset) => asset.type === 'Video',
    isAudio: (asset) => asset.type === 'Audio',
    thumbnailMarkup: () => '<img class="asset-thumb">',
    assetTypeIcon: () => 'TYPE',
    renderAssetHitList: counted('hit-list', ''),
    renderAssetHitPager: counted('hit-pager', ''),
    acceptedDidYouMeanHighlightClass: (_type, _query, fallback) => fallback,
    currentUserCanDeleteAssetInUi: () => false,
    currentUserCanDeleteAssetsRef: { get: () => false },
    selectedAssetIdsRef: { get: () => new Set() }
  });
}

const asset = {
  id: 'asset-1',
  title: 'Sample',
  type: 'Document',
  owner: 'owner',
  status: 'Ingested',
  createdAt: 'created',
  updatedAt: 'updated',
  tags: ['tag']
};

{
  const counters = {};
  const html = createRenderer(counters).render(asset, {});
  assert.match(html, /Sample/);
  assert.doesNotMatch(html, /Ingested/);
  assert.strictEqual(counters.highlight || 0, 0);
  assert.strictEqual(counters.metadata || 0, 0);
  assert.strictEqual(counters.dc || 0, 0);
  assert.strictEqual(counters.tag || 0, 0);
  assert.strictEqual(counters.clip || 0, 0);
  assert.strictEqual(counters['hit-list'] || 0, 0);
  assert.strictEqual(counters['hit-pager'] || 0, 0);
}

{
  const counters = {};
  const html = createRenderer(counters).render(asset, {
    currentClipQuery: 'omuz'
  });
  assert.match(html, /clip-hit/);
  assert.strictEqual(counters.clip, 1);
  assert.strictEqual(counters.clipArgs[1], 'omuz');
  assert.strictEqual(counters.highlight || 0, 0);
}

{
  const counters = {};
  const html = createRenderer(counters).render(asset, {
    currentSearchQuery: 'sample'
  });
  assert.match(html, /<mark>Sample<\/mark>/);
  assert.ok(counters.highlight >= 4);
  assert.strictEqual(counters.metadata, 1);
  assert.strictEqual(counters.dc, 1);
  assert.strictEqual(counters.tag, 1);
  assert.strictEqual(counters.clip, 1);
}

{
  const counters = {};
  const html = createRenderer(counters).render({
    ...asset,
    type: 'Video',
    durationSeconds: 90,
    fileSizeBytes: 5 * 1024 * 1024
  }, {});
  assert.match(html, /duration: 90s \| file_size: 5\.00 MB/);
}

console.log('mainAssetCard tests passed');
