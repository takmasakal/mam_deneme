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
  let removedListenerCount = 0;
  const root = {
    querySelectorAll() { return []; },
    addEventListener(type, callback, capture) {
      assert.strictEqual(type, 'click');
      assert.strictEqual(capture, true);
      listener = callback;
      listenerCount += 1;
    },
    removeEventListener(type, callback, capture) {
      assert.strictEqual(type, 'click');
      assert.strictEqual(capture, true);
      if (listener === callback) listener = null;
      removedListenerCount += 1;
    }
  };
  const image = { src: '', dataset: {} };
  const frame = { src: '', dataset: {} };
  let showImageViewer = true;
  let previewHost = null;
  let cleanupCalls = 0;
  const selected = new Map();
  const apiCalls = [];
  let refreshCalls = 0;

  const module = createMainDetailVersionActions({
    cleanupPreview: () => { cleanupCalls += 1; },
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
    assetDetail: {
      querySelector(selector) {
        if (selector === '[data-detail-file-preview]') return previewHost;
        if (selector === '.image-asset-viewer') return showImageViewer ? image : null;
        if (selector === '#pdfViewerFrame, #docViewerFrame') return showImageViewer ? null : frame;
        return null;
      }
    },
    documentRef: {
      body: { appendChild() {} },
      createElement: (tag) => ({ tag, dataset: {}, get src() { return this.url || ''; }, set src(value) { this.url = new URL(value, 'https://mam.example').href; }, setAttribute() {}, click() {}, remove() {}, addEventListener() {}, appendChild(child) { this.child = child; } })
    },
    confirmAction: () => true,
    alertError: () => {}
  });

  module.bind(root, {
    asset: { id: 'asset-1', versions: [], canDownloadAsset: true },
    workflow: ['draft']
  });
  assert.strictEqual(listenerCount, 1, 'one delegated listener is attached per version list');

  module.bind(root, {
    asset: { id: 'asset-1', versions: [], canDownloadAsset: true },
    workflow: ['draft']
  });
  assert.strictEqual(listenerCount, 2, 'rebinding attaches the current version listener');
  assert.strictEqual(removedListenerCount, 1, 'rebinding removes the previous version listener');
  assert.strictEqual(typeof listener, 'function', 'the replacement version listener remains active');

  const preview = makeButton('previewVersionBtn', 'version-1');
  await listener({
    target: preview,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.strictEqual(selected.get('asset-1'), 'version-1');
  assert.strictEqual(image.dataset.versionId, 'version-1');
  assert.strictEqual(image.src, '/api/assets/asset-1/versions/version-1/preview');

  showImageViewer = false;
  module.bind(root, {
    asset: {
      id: 'asset-1',
      versions: [{ versionId: 'version-pdf', snapshotMimeType: 'application/pdf', snapshotMediaUrl: '/uploads/versions/document.pdf' }],
      canDownloadAsset: true
    },
    workflow: ['draft']
  });
  const pdfPreview = makeButton('previewVersionBtn', 'version-pdf');
  await listener({ target: pdfPreview, preventDefault() {}, stopPropagation() {} });
  assert.match(frame.src, /file=%2Fuploads%2Fversions%2Fdocument\.pdf/);

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

  global.localStorage = { removeItem() {} };
  const makeDefault = makeButton('defaultVersionBtn', 'version-pdf');
  await listener({ target: makeDefault, preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(apiCalls.length, 2, 'default selection makes one request');
  assert.strictEqual(apiCalls[1].url, '/api/assets/asset-1/default-version');
  assert.strictEqual(apiCalls[1].options.method, 'PATCH');
  assert.strictEqual(refreshCalls, 2);
  assert.strictEqual(selected.has('asset-1'), false);
  delete global.localStorage;
  let pauses = 0;
  previewHost = {
    querySelectorAll: () => [{ pause() { pauses += 1; } }],
    replaceChildren(child) { this.child = child; }
  };
  module.bind(root, {
    asset: { id: 'audio-asset', mimeType: 'audio/mpeg', versions: [
      { versionId: 'pdf-attachment', fileRole: 'attachment', snapshotMimeType: 'application/pdf', snapshotMediaUrl: '/uploads/attached.pdf', label: 'Belge' },
      { versionId: 'word-attachment', fileRole: 'attachment', snapshotMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', snapshotMediaUrl: '/uploads/attached.docx', snapshotFileName: 'attached.docx', label: 'Word' },
      { versionId: 'image-attachment', fileRole: 'attachment', snapshotMimeType: 'image/jpeg', snapshotMediaUrl: '/uploads/photo.jpg', label: 'Fotoğraf' }
    ] }, workflow: []
  });
  await listener({ target: makeButton('previewVersionBtn', 'pdf-attachment'), preventDefault() {}, stopPropagation() {} });
  assert.equal(previewHost.child.child.tag, 'iframe');
  assert.equal(new URL(previewHost.child.child.src, 'http://localhost').searchParams.get('file'), '/uploads/attached.pdf');
  assert.equal(new URL(previewHost.child.child.src, 'http://localhost').searchParams.get('attachment'), '1');
  assert.equal(pauses, 1, 'audio stops before the PDF replaces it');
  assert.equal(cleanupCalls, 1);
  await listener({ target: makeButton('previewVersionBtn', 'image-attachment'), preventDefault() {}, stopPropagation() {} });
  assert.equal(previewHost.child.child.tag, 'img', 'image replaces the PDF in the same host');
  assert.equal(apiCalls.length, 2, 'preview never changes the default');
  await listener({ target: makeButton('previewVersionBtn', 'word-attachment'), preventDefault() {}, stopPropagation() {} });
  const wordUrl = new URL(previewHost.child.child.src);
  assert.equal(wordUrl.searchParams.get('attachment'), '1');
  assert.equal(wordUrl.searchParams.get('versionId'), 'word-attachment');
  assert.equal(wordUrl.searchParams.get('file'), '/api/assets/audio-asset/libreoffice-preview.pdf?versionId=word-attachment');

  console.log('main detail version actions tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
