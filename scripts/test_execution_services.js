const assert = require('assert');
const { createAiExecutionService, normalizeExecutionMode } = require('../src/services/aiExecutionService');
const { createMediaOperationsService } = require('../src/services/mediaOperationsService');
const { PROCESSING_TASKS } = require('../src/services/processingJobContract');

assert.strictEqual(normalizeExecutionMode('remote'), 'remote');
assert.strictEqual(normalizeExecutionMode('anything-else'), 'local');

const aiCalls = [];
const ai = createAiExecutionService({
  mode: 'local',
  localAdapter: {
    execute: (...args) => aiCalls.push(['execute', ...args]),
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
ai.execute({
  jobId: 'job-ai-1',
  application: 'belgelik',
  task: PROCESSING_TASKS.SUBTITLE_GENERATE,
  assetId: 'a1',
  input: { storage: 'primary', relativePath: 'video/input.mp4' }
}, { requestId: 'request-1' });
assert.strictEqual(aiCalls[1][0], 'execute');
assert.strictEqual(aiCalls[1][1].domain, 'ai');
assert.strictEqual(aiCalls[1][2].requestId, 'request-1');
ai.health().then((health) => assert.strictEqual(health.mode, 'local'));
assert.throws(() => ai.execute({
  application: 'belgelik',
  task: PROCESSING_TASKS.VIDEO_PROXY,
  assetId: 'a1',
  input: { storage: 'primary', relativePath: 'video/input.mp4' }
}), /AI execution cannot run media task/);

const remoteAiCalls = [];
const remoteAi = createAiExecutionService({
  mode: 'remote',
  localAdapter: {
    queueSubtitleGeneration: (...args) => remoteAiCalls.push(['legacy-local', ...args])
  },
  remoteAdapter: {
    execute: (...args) => remoteAiCalls.push(['remote-execute', ...args]),
    submit: (...args) => remoteAiCalls.push(['remote-submit', ...args]),
    get: (...args) => remoteAiCalls.push(['remote-get', ...args]),
    cancel: (...args) => remoteAiCalls.push(['remote-cancel', ...args])
  }
});
remoteAi.queueSubtitleGeneration({ id: 'legacy' }, {});
remoteAi.execute({ application: 'belgelik', task: PROCESSING_TASKS.SUBTITLE_GENERATE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } });
assert.strictEqual(remoteAiCalls[0][0], 'legacy-local');
assert.strictEqual(remoteAiCalls[1][0], 'remote-execute');
remoteAi.submit({ application: 'belgelik', task: PROCESSING_TASKS.SUBTITLE_GENERATE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } });
remoteAi.get('job-1');
remoteAi.cancel('job-1');
assert.deepStrictEqual(remoteAiCalls.slice(2).map((item) => item[0]), ['remote-submit', 'remote-get', 'remote-cancel']);

const mediaCalls = [];
const media = createMediaOperationsService({
  mode: 'local',
  localAdapter: {
    execute: (...args) => mediaCalls.push(args),
    getVideoDurationSeconds: async () => 42,
    summarizeFfmpegError: () => 'summary'
  }
});
assert.strictEqual(media.mode, 'local');
assert.strictEqual(media.summarizeFfmpegError(), 'summary');
media.execute({
  jobId: 'job-media-1',
  application: 'belgelik',
  task: PROCESSING_TASKS.VIDEO_THUMBNAIL,
  assetId: 'a1',
  input: { storage: 'primary', relativePath: 'video/input.mp4' },
  output: { storage: 'primary', relativePath: 'thumbnails/output.jpg' }
}, { requestId: 'request-2' });
assert.strictEqual(mediaCalls[0][0].domain, 'media');
assert.strictEqual(mediaCalls[0][1].requestId, 'request-2');
media.health().then((health) => assert.strictEqual(health.mode, 'local'));
assert.throws(() => media.execute({
  application: 'belgelik',
  task: PROCESSING_TASKS.PHOTO_OCR,
  assetId: 'a1',
  input: { storage: 'primary', relativePath: 'photo/input.jpg' }
}), /Media operations cannot run ai task/);
const remoteMediaCalls = [];
const hybridMedia = createMediaOperationsService({
  mode: 'remote',
  localAdapter: { getVideoDurationSeconds: () => 7 },
  remoteAdapter: {
    execute: (...args) => remoteMediaCalls.push(['execute', ...args]),
    submit: (...args) => remoteMediaCalls.push(['submit', ...args]),
    get: (...args) => remoteMediaCalls.push(['get', ...args]),
    cancel: (...args) => remoteMediaCalls.push(['cancel', ...args])
  }
});
assert.strictEqual(hybridMedia.getVideoDurationSeconds(), 7);
hybridMedia.execute({ application: 'belgelik', task: PROCESSING_TASKS.VIDEO_PROBE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } });
assert.strictEqual(remoteMediaCalls[0][1].task, PROCESSING_TASKS.VIDEO_PROBE);
hybridMedia.submit({ application: 'belgelik', task: PROCESSING_TASKS.VIDEO_PROBE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } });
hybridMedia.get('job-2');
hybridMedia.cancel('job-2');
assert.deepStrictEqual(remoteMediaCalls.slice(1).map((item) => item[0]), ['submit', 'get', 'cancel']);
media.getVideoDurationSeconds('/tmp/input.mp4').then((duration) => {
  assert.strictEqual(duration, 42);
  assert.throws(
    () => media.generateVideoProxy('input', 'output'),
    /does not support generateVideoProxy/
  );
  console.log('execution service tests passed');
});
