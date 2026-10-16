const assert = require('assert');
const { createAiExecutionService, normalizeExecutionMode } = require('../src/services/aiExecutionService');
const { createMediaOperationsService } = require('../src/services/mediaOperationsService');
const { PROCESSING_TASKS } = require('../src/services/processingJobContract');

assert.strictEqual(normalizeExecutionMode('remote'), 'remote');
assert.strictEqual(normalizeExecutionMode('anything-else'), 'local');
const calls = [];
const ai = createAiExecutionService({
  localAdapter: {
    execute: (...args) => calls.push(['execute', ...args]),
    queueSubtitleGeneration: (...args) => calls.push(['subtitle', ...args]),
    queueSubtitleTranslation: (...args) => calls.push(['translation', ...args]),
    queueVideoOcr: (...args) => calls.push(['video-ocr', ...args]),
    extractPhotoOcr: (...args) => calls.push(['photo-ocr', ...args]),
    queueMetadataEnrichment: (...args) => calls.push(['metadata', ...args])
  }
});
ai.queueSubtitleGeneration({ id: 'a1' }, { model: 'small' });
assert.deepStrictEqual(calls[0], ['subtitle', { id: 'a1' }, { model: 'small' }]);
ai.execute({ application: 'belgelik', task: PROCESSING_TASKS.SUBTITLE_GENERATE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } }, { requestId: 'request-1' });
assert.strictEqual(calls[1][0], 'execute');
assert.strictEqual(calls[1][1].domain, 'ai');
assert.strictEqual(calls[1][2].requestId, 'request-1');
assert.throws(() => ai.execute({ application: 'belgelik', task: PROCESSING_TASKS.VIDEO_PROXY, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } }), /AI execution cannot run media task/);
const mediaCalls = [];
const media = createMediaOperationsService({ localAdapter: { execute: (...args) => mediaCalls.push(args), getVideoDurationSeconds: async () => 42, summarizeFfmpegError: () => 'summary' } });
assert.strictEqual(media.summarizeFfmpegError(), 'summary');
media.execute({ application: 'belgelik', task: PROCESSING_TASKS.VIDEO_THUMBNAIL, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' }, output: { storage: 'primary', relativePath: 'thumbnails/output.jpg' } }, { requestId: 'request-2' });
assert.strictEqual(mediaCalls[0][0].domain, 'media');
assert.strictEqual(mediaCalls[0][1].requestId, 'request-2');
assert.throws(() => media.execute({ application: 'belgelik', task: PROCESSING_TASKS.PHOTO_OCR, assetId: 'a1', input: { storage: 'primary', relativePath: 'photo/input.jpg' } }), /Media operations cannot run ai task/);
media.getVideoDurationSeconds('/tmp/input.mp4').then((duration) => {
  assert.strictEqual(duration, 42);
  assert.throws(() => media.generateVideoProxy('input', 'output'), /does not support generateVideoProxy/);
  console.log('execution service tests passed');
});
