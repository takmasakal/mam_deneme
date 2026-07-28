const assert = require('assert');
const { createMainTechnicalInfoStore } = require('../public/main-technical-info-store');

async function run() {
  let calls = 0;
  let releaseFirst;
  const firstResponse = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const asset = {
    id: 'asset-1',
    updatedAt: '2026-07-29T10:00:00.000Z',
    mediaUrl: '/uploads/original.mov',
    proxyUrl: '/uploads/proxy.mp4',
    proxyStatus: 'ready'
  };
  const store = createMainTechnicalInfoStore(async (requestedAsset) => {
    calls += 1;
    if (calls === 1) await firstResponse;
    return { assetId: requestedAsset.id, call: calls };
  }, { maxEntries: 2 });

  const first = store.get(asset);
  const concurrent = store.get(asset);
  releaseFirst();
  const [firstValue, concurrentValue] = await Promise.all([first, concurrent]);

  assert.strictEqual(calls, 1, 'concurrent reads share one request');
  assert.strictEqual(firstValue, concurrentValue, 'concurrent reads resolve to the same payload');
  assert.strictEqual(store.peek(asset), firstValue, 'completed response is cached');
  assert.strictEqual(await store.get(asset), firstValue, 'same asset revision uses cache');
  assert.strictEqual(calls, 1);

  const changedAsset = { ...asset, updatedAt: '2026-07-29T10:01:00.000Z' };
  const changedValue = await store.get(changedAsset);
  assert.strictEqual(calls, 2, 'changed asset revision fetches again');
  assert.notStrictEqual(changedValue, firstValue);

  await store.get(changedAsset, { force: true });
  assert.strictEqual(calls, 3, 'forced read bypasses cache');

  store.invalidate(asset.id);
  assert.strictEqual(store.peek(asset), null, 'invalidate removes every revision for an asset');
  assert.strictEqual(store.peek(changedAsset), null);

  let releaseInvalidated;
  const invalidatedResponse = new Promise((resolve) => {
    releaseInvalidated = resolve;
  });
  const invalidatedStore = createMainTechnicalInfoStore(async () => {
    await invalidatedResponse;
    return { stale: true };
  });
  const invalidatedRequest = invalidatedStore.get(asset);
  invalidatedStore.invalidate(asset.id);
  releaseInvalidated();
  await invalidatedRequest;
  assert.strictEqual(
    invalidatedStore.peek(asset),
    null,
    'an invalidated in-flight response cannot repopulate the cache'
  );

  await store.get(asset);
  await store.get({ ...asset, id: 'asset-2' });
  await store.get({ ...asset, id: 'asset-3' });
  assert.strictEqual(store.size(), 2, 'cache stays within the configured LRU limit');
  assert.strictEqual(store.peek(asset), null, 'least recently used entry is evicted');

  let failures = 0;
  const retryStore = createMainTechnicalInfoStore(async () => {
    failures += 1;
    if (failures === 1) throw new Error('probe failed');
    return { ok: true };
  });
  await assert.rejects(retryStore.get(asset), /probe failed/);
  assert.deepStrictEqual(await retryStore.get(asset), { ok: true });
  assert.strictEqual(failures, 2, 'failed requests are not cached');

  console.log('main technical info store tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
