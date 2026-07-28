const assert = require('assert');
const { createMainWorkflowStore } = require('../public/main-workflow-store');

async function run() {
  let calls = 0;
  let releaseFirst;
  const firstResponse = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const store = createMainWorkflowStore(async () => {
    calls += 1;
    if (calls === 1) await firstResponse;
    return ['draft', ' active ', '', null];
  });

  const first = store.get();
  const concurrent = store.get();
  assert.strictEqual(calls, 0, 'fetch starts in the next microtask');
  releaseFirst();
  const [firstValue, concurrentValue] = await Promise.all([first, concurrent]);

  assert.strictEqual(calls, 1, 'concurrent reads share one request');
  assert.strictEqual(firstValue, concurrentValue, 'shared reads return the cached array');
  assert.deepStrictEqual(firstValue, ['draft', 'active']);
  assert.strictEqual(store.peek(), firstValue);
  assert(Object.isFrozen(firstValue), 'cached workflow is immutable');

  const cached = await store.get();
  assert.strictEqual(calls, 1, 'cached read does not fetch again');
  assert.strictEqual(cached, firstValue);

  const refreshed = await store.get({ force: true });
  assert.strictEqual(calls, 2, 'forced read refreshes the workflow');
  assert.deepStrictEqual(refreshed, ['draft', 'active']);

  store.clear();
  assert.strictEqual(store.peek(), null);
  await store.get();
  assert.strictEqual(calls, 3, 'cleared store fetches again');

  let failures = 0;
  const retryingStore = createMainWorkflowStore(async () => {
    failures += 1;
    if (failures === 1) throw new Error('temporary failure');
    return ['ready'];
  });
  await assert.rejects(retryingStore.get(), /temporary failure/);
  assert.deepStrictEqual(await retryingStore.get(), ['ready']);
  assert.strictEqual(failures, 2, 'failed requests are not cached');

  console.log('main workflow store tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
