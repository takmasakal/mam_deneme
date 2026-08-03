const assert = require('assert');
const { EventEmitter } = require('events');
const {
  trackMediaJobProcess,
  cancelMediaJobRuntime,
  clearMediaJobRuntime,
  isMediaJobCancelled,
  hasActiveMediaJobRuntime
} = require('../src/services/mediaJobs');
const { createMetadataEnrichmentService } = require('../src/services/metadataEnrichmentService');

(async () => {
  const child = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.killSignals = [];
  child.kill = function kill(signal) {
    this.killSignals.push(signal);
    this.killed = true;
    return true;
  };

  const untrack = trackMediaJobProcess('job-test', child);
  assert.strictEqual(hasActiveMediaJobRuntime('job-test'), true);
  assert.strictEqual(cancelMediaJobRuntime('job-test'), true);
  assert.strictEqual(isMediaJobCancelled('job-test'), true);
  assert.deepStrictEqual(child.killSignals, ['SIGTERM']);
  untrack();
  assert.strictEqual(hasActiveMediaJobRuntime('job-test'), false);
  clearMediaJobRuntime('job-test');
  assert.strictEqual(isMediaJobCancelled('job-test'), false);

  const persisted = [];
  const metadataService = createMetadataEnrichmentService({
    pool: { query: async () => { throw new Error('Cancelled queue item must not run'); } },
    nanoid: () => 'metadata-job-test',
    runCommandCapture: async () => ({ ok: true }),
    buildArtifactPath: () => ({}),
    publicUploadUrlToAbsolutePath: () => '',
    extractPreviewContentFromFile: async () => ({}),
    extractVideoOcrFrameTextPaddle: async () => ({}),
    queueSubtitleGenerationJob: () => null,
    subtitleJobs: new Map(),
    upsertMediaProcessingJobSafe: async (record) => { persisted.push(record); },
    indexAssetToElastic: async () => {}
  });
  const queued = metadataService.queueAsset({ id: 'asset-test', type: 'Document' });
  assert.strictEqual(metadataService.hasJob(queued.jobId), true);
  assert.strictEqual(await metadataService.cancelJob(queued.jobId), true);
  assert.strictEqual(metadataService.hasJob(queued.jobId), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert(persisted.some((record) => record.status === 'cancelled'));

  console.log('mediaJobs tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
