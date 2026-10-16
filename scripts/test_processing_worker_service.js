const assert = require('assert');
const { createProcessingWorkerService } = require('../src/services/processingWorkerService');
const { PROCESSING_TASKS } = require('../src/services/processingJobContract');
const { tokenMatches } = require('../src/routes/processingWorker');
const { createMemoryProcessingJobStore } = require('../src/services/processingJobStore');

async function run() {
  const events = [];
  assert(tokenMatches('secret', 'secret'));
  assert(!tokenMatches('secret', 'wrong'));
  const worker = createProcessingWorkerService({
    domain: 'media', tasks: [PROCESSING_TASKS.VIDEO_PROBE],
    onEvent: (event) => events.push(event),
    executor: async (job, context) => {
      context.onProgress(50, 'probing');
      return { output: job.output, result: { codec: 'h264' } };
    }
  });
  const submitted = await worker.submit({ application: 'metmam', task: PROCESSING_TASKS.VIDEO_PROBE, assetId: 'a1', input: { storage: 'primary', relativePath: 'video/input.mp4' } });
  assert.strictEqual(submitted.status, 'queued');
  assert.strictEqual(worker.getHealth().domain, 'media');
  assert(worker.getHealth().workerId);
  assert.strictEqual(worker.getHealth().leaseMs, 60000);
  assert.strictEqual(worker.getHealth().concurrency, 1);
  await new Promise((resolve) => setImmediate(resolve));
  const completed = await worker.get(submitted.jobId);
  assert.strictEqual(completed.status, 'completed');
  assert.strictEqual(completed.result.codec, 'h264');
  assert.strictEqual(worker.getHealth().counters.submitted, 1);
  assert.strictEqual(worker.getHealth().counters.completed, 1);
  assert.deepStrictEqual(events.map((event) => event.event), ['processing_job_submitted', 'processing_job_started', 'processing_job_completed']);
  const leaseStore = createMemoryProcessingJobStore();
  const slowWorker = createProcessingWorkerService({
    domain: 'media', tasks: [PROCESSING_TASKS.VIDEO_PROBE], store: leaseStore, leaseMs: 5000,
    executor: async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); return { result: { ok: true } }; }
  });
  const slow = await slowWorker.submit({ application: 'metmam', task: PROCESSING_TASKS.VIDEO_PROBE, assetId: 'lease', input: { storage: 'primary', relativePath: 'video/slow.mp4' } });
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const renewed = await slowWorker.get(slow.jobId);
  assert(Date.parse(renewed.leaseExpiresAt) > Date.now() + 3000, 'worker must renew long-running job lease');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepStrictEqual(await slowWorker.shutdown(), { stopped: true, activeJobs: 0 });
  await assert.rejects(() => slowWorker.submit({ application: 'metmam', task: PROCESSING_TASKS.VIDEO_PROBE, assetId: 'after-stop', input: { storage: 'primary', relativePath: 'video/slow.mp4' } }), /shutting down/);
  await assert.rejects(() => worker.submit({ application: 'metmam', task: PROCESSING_TASKS.PHOTO_OCR, assetId: 'a1', input: { storage: 'primary', relativePath: 'photo/input.jpg' } }), /cannot run ai task/);
  console.log('processing worker service tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
