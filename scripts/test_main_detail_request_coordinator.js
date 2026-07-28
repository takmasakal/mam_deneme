const assert = require('assert');
const { createMainDetailRequestCoordinator } = require('../public/main-detail-request-coordinator');

class FakeAbortController {
  constructor() {
    this.signal = { aborted: false };
  }

  abort() {
    this.signal.aborted = true;
  }
}

function run() {
  const coordinator = createMainDetailRequestCoordinator({
    AbortControllerImpl: FakeAbortController
  });

  const first = coordinator.begin('asset-1');
  assert.strictEqual(first.isCurrent(), true);
  assert.strictEqual(first.signal.aborted, false);

  const second = coordinator.begin('asset-2');
  assert.strictEqual(first.signal.aborted, true, 'new detail request aborts the previous fetch');
  assert.strictEqual(first.isCurrent(), false, 'previous response cannot become current');
  assert.strictEqual(first.isCancelled(), true);
  assert.strictEqual(second.isCurrent(), true);

  assert.strictEqual(coordinator.complete(first), false);
  assert.strictEqual(coordinator.complete(second), true);
  assert.strictEqual(second.isCurrent(), true);

  const third = coordinator.begin('asset-3');
  coordinator.invalidate();
  assert.strictEqual(third.signal.aborted, true, 'closing or replacing detail aborts the active fetch');
  assert.strictEqual(third.isCurrent(), false);

  assert.strictEqual(coordinator.isAbortError({ name: 'AbortError' }), true);
  assert.strictEqual(coordinator.isAbortError(new Error('This operation was aborted')), true);
  assert.strictEqual(coordinator.isAbortError(new Error('Request failed')), false);

  console.log('main detail request coordinator tests passed');
}

run();
