const assert = require('assert');
const { createAiExecutionService, normalizeExecutionMode } = require('../src/services/aiExecutionService');
const { createMediaOperationsService } = require('../src/services/mediaOperationsService');

assert.strictEqual(normalizeExecutionMode('remote'), 'remote');
assert.strictEqual(normalizeExecutionMode('anything-else'), 'local');
const calls = [];
const ai = createAiExecutionService({
  localAdapter: {
    queueSubtitleGeneration: (...args) => calls.push(['subtitle', ...args]),
    queueSubtitleTranslation: (...args) => calls.push(['translation', ...args]),
    queueVideoOcr: (...args) => calls.push(['video-ocr', ...args]),
    extractPhotoOcr: (...args) => calls.push(['photo-ocr', ...args]),
    queueMetadataEnrichment: (...args) => calls.push(['metadata', ...args])
  }
});
ai.queueSubtitleGeneration({ id: 'a1' }, { model: 'small' });
assert.deepStrictEqual(calls[0], ['subtitle', { id: 'a1' }, { model: 'small' }]);
const media = createMediaOperationsService({ localAdapter: { getVideoDurationSeconds: async () => 42, summarizeFfmpegError: () => 'summary' } });
assert.strictEqual(media.summarizeFfmpegError(), 'summary');
media.getVideoDurationSeconds('/tmp/input.mp4').then((duration) => {
  assert.strictEqual(duration, 42);
  assert.throws(() => media.generateVideoProxy('input', 'output'), /does not support generateVideoProxy/);
  console.log('execution service tests passed');
});
