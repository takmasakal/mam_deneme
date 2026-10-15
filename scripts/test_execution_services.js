const assert = require('assert');
const { createAiExecutionService, normalizeExecutionMode } = require('../src/services/aiExecutionService');
const { createMediaOperationsService } = require('../src/services/mediaOperationsService');

assert.strictEqual(normalizeExecutionMode('remote'), 'remote');
assert.strictEqual(normalizeExecutionMode('anything-else'), 'local');

const aiCalls = [];
const ai = createAiExecutionService({
  mode: 'local',
  localAdapter: {
    queueSubtitleGeneration: (...args) => aiCalls.push(['subtitle', ...args]),
    queueSubtitleTranslation: (...args) => aiCalls.push(['translation', ...args]),
    queueVideoOcr: (...args) => aiCalls.push(['video-ocr', ...args]),
    extractPhotoOcr: (...args) => aiCalls.push(['photo-ocr', ...args]),
    queueMetadataEnrichment: (...args) => aiCalls.push(['metadata', ...args])
  }
});
ai.queueSubtitleGeneration({ id: 'a1' }, { model: 'small' });
assert.strictEqual(ai.mode, 'local');
assert.deepStrictEqual(aiCalls[0], ['subtitle', { id: 'a1' }, { model: 'small' }]);

const media = createMediaOperationsService({
  mode: 'local',
  localAdapter: {
    getVideoDurationSeconds: async () => 42,
    summarizeFfmpegError: () => 'summary'
  }
});
assert.strictEqual(media.mode, 'local');
assert.strictEqual(media.summarizeFfmpegError(), 'summary');
media.getVideoDurationSeconds('/tmp/input.mp4').then((duration) => {
  assert.strictEqual(duration, 42);
  assert.throws(
    () => media.generateVideoProxy('input', 'output'),
    /does not support generateVideoProxy/
  );
  console.log('execution service tests passed');
});
