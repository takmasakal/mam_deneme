const assert = require('assert');
const { createMainAssetGridEvents } = require('../public/main-asset-grid-events');

function createGrid() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, event) {
      listeners.get(type)?.forEach((handler) => handler(event));
    },
    count(type) {
      return listeners.get(type)?.size || 0;
    }
  };
}

function createTarget(selector, values = {}) {
  return {
    ...values,
    dataset: values.dataset || {},
    style: values.style || {},
    closest(candidate) {
      return candidate === selector ? this : null;
    }
  };
}

function createEvent(target, values = {}) {
  return {
    target,
    key: values.key || '',
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
}

const grid = createGrid();
const calls = [];
const events = createMainAssetGridEvents({
  assetGrid: grid,
  onPageDirection: (target) => calls.push(['page', target.dataset.assetPage]),
  onPageInput: (target) => calls.push(['input', target.value]),
  onPageSize: (target) => calls.push(['size', target.value]),
  onDidYouMean: (target) => calls.push(['suggestion', target.textContent]),
  onHitPage: (target) => calls.push(['hit', target.dataset.hitOffset])
});

events.attach();
events.attach();
assert.strictEqual(grid.count('click'), 1);
assert.strictEqual(grid.count('input'), 1);
assert.strictEqual(grid.count('keydown'), 1);
assert.strictEqual(grid.count('change'), 1);

const pageButton = createTarget('.asset-list-page-btn', { dataset: { assetPage: 'next' } });
const pageClick = createEvent(pageButton);
grid.emit('click', pageClick);
assert.deepStrictEqual(calls.shift(), ['page', 'next']);
assert.ok(pageClick.prevented && pageClick.stopped);

const pageInput = createTarget('.asset-list-page-input', { value: '1234' });
grid.emit('input', createEvent(pageInput));
assert.strictEqual(pageInput.style.width, '7ch');
grid.emit('keydown', createEvent(pageInput, { key: 'Enter' }));
assert.deepStrictEqual(calls.shift(), ['input', '1234']);

const pageSize = createTarget('.asset-list-page-size-select', { value: '50' });
grid.emit('change', createEvent(pageSize));
assert.deepStrictEqual(calls.shift(), ['size', '50']);

const suggestion = createTarget('[data-search-did-you-mean]', { textContent: 'istanbul' });
grid.emit('click', createEvent(suggestion));
assert.deepStrictEqual(calls.shift(), ['suggestion', 'istanbul']);

const hitPage = createTarget('.asset-hit-page-btn', { dataset: { hitOffset: '10' } });
grid.emit('click', createEvent(hitPage));
assert.deepStrictEqual(calls.shift(), ['hit', '10']);

events.detach();
assert.strictEqual(grid.count('click'), 0);
assert.strictEqual(grid.count('input'), 0);
assert.strictEqual(grid.count('keydown'), 0);
assert.strictEqual(grid.count('change'), 0);

console.log('mainAssetGridEvents tests passed');
