const assert = require('assert');
const { createMainDetailAssetActions } = require('../public/main-detail-asset-actions');

function makeRoot() {
  const listeners = {};
  const removed = [];
  return {
    listeners,
    removed,
    addEventListener(type, callback) {
      listeners[type] = callback;
    },
    removeEventListener(type, callback) {
      if (listeners[type] === callback) delete listeners[type];
      removed.push(type);
    }
  };
}

async function run() {
  const apiCalls = [];
  let refreshCount = 0;
  const root = makeRoot();
  const module = createMainDetailAssetActions({
    api: async (url, options) => {
      apiCalls.push({ url, options });
      return {};
    },
    t: (key) => key,
    serializeForm: (form) => form?.id === 'assetVisibilityForm'
      ? {
          visibility: 'owner_groups',
          allowedGroups: 'team-a, team-b',
          allowedUsers: 'user-a',
          deniedGroups: '',
          deniedUsers: '',
          editAllowedGroups: '',
          editAllowedUsers: '',
          editDeniedGroups: '',
          editDeniedUsers: ''
        }
      : ({ title: 'Updated title', dcTitle: 'DC title' }),
    extractDcMetadataFromPayload: () => ({ dc_title: 'DC title' }),
    readFileAsBase64: async () => 'data:application/octet-stream;base64,AA==',
    refreshAssetDetail: async () => { refreshCount += 1; },
    onPermanentDeleteSuccess: async () => {},
    canEditMetadata: () => true,
    canEditOffice: () => true,
    canUsePdfAdvancedTools: () => true,
    canDeleteAsset: () => true,
    documentRef: {
      body: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, click() {}, remove() {} })
    },
    confirmAction: () => true,
    alertError: () => {}
  });

  module.bind(root, {
    asset: { id: 'asset-1', mediaUrl: '/uploads/original.mov', proxyUrl: '/uploads/proxy.mp4' },
    workflow: ['draft']
  });

  assert.deepStrictEqual(Object.keys(root.listeners).sort(), ['click', 'submit']);

  module.bind(root, {
    asset: { id: 'asset-1', mediaUrl: '/uploads/original.mov', proxyUrl: '/uploads/proxy.mp4' },
    workflow: ['draft']
  });
  assert.deepStrictEqual(root.removed.sort(), ['click', 'submit'], 'rebinding removes previous detail listeners');
  assert.deepStrictEqual(Object.keys(root.listeners).sort(), ['click', 'submit'], 'replacement detail listeners remain active');

  const submitButton = { disabled: false };
  const editForm = {
    id: 'editForm',
    querySelector: () => submitButton
  };
  await root.listeners.submit({
    target: editForm,
    preventDefault() {}
  });
  assert.strictEqual(apiCalls[0].url, '/api/assets/asset-1');
  assert.strictEqual(apiCalls[0].options.method, 'PATCH');
  assert.deepStrictEqual(JSON.parse(apiCalls[0].options.body).dcMetadata, { dc_title: 'DC title' });
  assert.strictEqual(refreshCount, 1);
  assert.strictEqual(submitButton.disabled, false);

  const transitionForm = { id: 'transitionForm' };
  await root.listeners.submit({
    target: transitionForm,
    preventDefault() {}
  });
  assert.strictEqual(apiCalls[1].url, '/api/assets/asset-1/transition');
  assert.strictEqual(apiCalls[1].options.method, 'POST');
  assert.strictEqual(refreshCount, 2);

  const visibilityForm = {
    id: 'assetVisibilityForm',
    querySelector: () => submitButton
  };
  await root.listeners.submit({
    target: visibilityForm,
    preventDefault() {}
  });
  assert.strictEqual(apiCalls[2].url, '/api/assets/asset-1/visibility');
  assert.strictEqual(apiCalls[2].options.method, 'PATCH');
  assert.deepStrictEqual(JSON.parse(apiCalls[2].options.body).allowedGroups, ['team-a', 'team-b']);
  assert.deepStrictEqual(JSON.parse(apiCalls[2].options.body).allowedUsers, ['user-a']);
  assert.strictEqual(refreshCount, 3);

  const ensureProxyButton = {
    id: 'ensureProxyBtn',
    closest: () => ensureProxyButton
  };
  await root.listeners.click({
    target: ensureProxyButton,
    preventDefault() {}
  });
  assert.strictEqual(apiCalls[3].url, '/api/assets/asset-1/ensure-proxy');
  assert.strictEqual(refreshCount, 4);

  console.log('main detail asset actions tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
