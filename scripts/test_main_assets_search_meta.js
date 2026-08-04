const assert = require('assert');
const { createMainAssetsModule } = require('../public/main-assets');

const searchState = {};
const currentAssetsRef = { value: [] };
const selectedAssetIdsRef = { value: new Set() };
const selectedAssetIdRef = { value: null };
const lastSelectedAssetIdRef = { value: null };
const assetPaginationRef = { page: 1, pageSize: 20, total: 0, serverSide: false };
let requestUrl = '';
let renderedAssets = [];
let serializedFilters = {
  q: '',
  ocrQ: '',
  subtitleQ: 'sait',
  trash: 'active'
};

const moduleUnderTest = createMainAssetsModule({
  api: async (url) => {
    requestUrl = url;
    return {
      assets: [{ id: 'asset-1', title: 'Said result' }],
      searchMeta: {
        subtitleQ: {
          didYouMean: 'Said',
          fuzzyUsed: true,
          highlightQuery: 'Said'
        }
      }
    };
  },
  escapeHtml: (value) => String(value ?? ''),
  t: (key) => key,
  statusSelect: {},
  workflowLabel: (value) => value,
  serializeForm: () => serializedFilters,
  searchForm: {},
  assetTypeFilters: [],
  syncOcrQueryInputs: () => {},
  ocrQueryInput: null,
  renderAssets: (assets) => {
    renderedAssets = assets;
  },
  currentAssetsRef,
  selectedAssetIdsRef,
  selectedAssetIdRef,
  lastSelectedAssetIdRef,
  searchStateRef: searchState,
  assetPaginationRef
});

moduleUnderTest.loadAssets().then(() => {
  assert.match(requestUrl, /subtitleQ=sait/);
  assert.strictEqual(searchState.currentSubtitleQuery, 'sait');
  assert.strictEqual(searchState.currentSubtitleDidYouMean, 'Said');
  assert.strictEqual(searchState.currentSubtitleFuzzyUsed, true);
  assert.strictEqual(renderedAssets.length, 1);
  serializedFilters = {
    q: '',
    ocrQ: '',
    subtitleQ: '',
    clipQ: 'omuz',
    advancedSearch: '{"version":1}',
    trash: 'active'
  };
  return moduleUnderTest.loadAssets();
}).then(() => {
  assert.match(requestUrl, /advanced=/);
  assert.strictEqual(searchState.currentClipQuery, 'omuz');
  console.log('mainAssets search metadata tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
