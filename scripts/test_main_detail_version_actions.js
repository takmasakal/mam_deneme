const assert = require('assert');
const { createMainDetailVersionActions } = require('../public/main-detail-version-actions');

function makeButton(className, versionId) {
  return {
    dataset: { versionId },
    disabled: false,
    textContent: '',
    matches(selector) {
      return selector === `.${className}`;
    },
    closest(selector) {
      if (selector.includes(className)) return this;
      return null;
    }
  };
}

async function run() {
  let listener = null;
  let listenerCount = 0;
  const root = {
    addEventListener(type, callback, capture) {
      assert.strictEqual(type, 'click');
      assert.strictEqual(capture, true);
      listener = callback;
      listenerCount += 1;
    },
    removeEventListener() {}
  };
  const image = { src: '', dataset: {} };
  const selected = new Map();
  const apiCalls = [];
  let refreshCalls = 0;

  const module = createMainDetailVersionActions({
    api: async (url, options) => {
      apiCalls.push({ url, options });
      return {};
    },
    fetchImpl: async () => ({ ok: true, text: async () => '' }),
    t: (key) => key,
    cleanVersionNoteText: (value) => value,
    openVersionDeleteDialog: async () => false,
    openVersionEditDialog: async () => null,
    loadAssets: async () => {},
    refreshAssetDetail: async () => { refreshCalls += 1; },
    currentLang: () => 'tr',
    canUsePdfAdvancedTools: () => true,
    selectedImageVersionIds: selected,
    assetDetail: { querySelector: () => image },
    documentRef: {
      body: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, click() {}, remove() {} })
    },
    confirmAction: () => true,
    alertError: () => {}
  });

  module.bind(root, {
    asset: { id: 'asset-1', versions: [], canDownloadAsset: true },
    workflow: ['draft']
  });
  assert.strictEqual(listenerCount, 1, 'one delegated listener is attached per version list');

  const preview = makeButton('previewVersionBtn', 'version-1');
  await listener({
    target: preview,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.strictEqual(selected.get('asset-1'), 'version-1');
  assert.strictEqual(image.dataset.versionId, 'version-1');
  assert.strictEqual(image.src, '/api/assets/asset-1/versions/version-1/preview');

  const restore = makeButton('restorePdfVersionBtn', 'version-2');
  await listener({
    target: restore,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.strictEqual(apiCalls.length, 1);
  assert.strictEqual(apiCalls[0].url, '/api/assets/asset-1/pdf-restore');
  assert.deepStrictEqual(JSON.parse(apiCalls[0].options.body), { versionId: 'version-2' });
  assert.strictEqual(refreshCalls, 1);

  console.log('main detail version actions tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
