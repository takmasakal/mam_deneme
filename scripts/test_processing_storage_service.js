const assert = require('assert');
const path = require('path');
const { createProcessingStorageService } = require('../src/services/processingStorageService');

const root = path.join(path.sep, 'srv', 'mam-media');
const storage = createProcessingStorageService({ roots: { primary: root } });
assert.strictEqual(storage.defaultStorage, 'primary');
assert.strictEqual(storage.hasStorage('PRIMARY'), true);
assert.deepStrictEqual(storage.listStorages(), ['primary']);
const absolutePath = path.join(root, '2026', '10', 'source.mp4');
const reference = storage.toReference(absolutePath);
assert.deepStrictEqual(reference, { storage: 'primary', relativePath: '2026/10/source.mp4' });
assert.strictEqual(storage.resolve(reference), absolutePath);
assert.throws(() => storage.toReference(path.join(path.sep, 'tmp', 'outside.mp4')), /outside/);
assert.throws(() => storage.resolve({ storage: 'archive', relativePath: 'file.mp4' }), /Unknown/);
console.log('processing storage service tests passed');
