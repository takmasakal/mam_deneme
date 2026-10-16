const assert = require('assert');
const { createMemoryProcessingJobStore } = require('../src/services/processingJobStore');

async function run() {
  const store = createMemoryProcessingJobStore();
  await store.initialize();
  const base = {
    jobId: 'job-1', job: { task: 'video.probe' }, status: 'queued', progress: 0,
    phase: 'queued', attemptCount: 0, maxAttempts: 2, cancelRequested: false
  };
  await store.enqueue(base);
  await store.enqueue({ ...base, phase: 'duplicate-must-not-overwrite' });
  assert.strictEqual((await store.get('job-1')).phase, 'queued');
  const first = await store.claimNext({ workerId: 'worker-1', leaseMs: 5000 });
  assert.strictEqual(first.attemptCount, 1);
  assert.strictEqual(first.workerId, 'worker-1');
  assert.strictEqual(await store.claimNext({ workerId: 'worker-2', leaseMs: 5000 }), null);
  await store.update('job-1', { status: 'queued', clearLease: true });
  const retry = await store.claimNext({ workerId: 'worker-2', leaseMs: 5000 });
  assert.strictEqual(retry.attemptCount, 2);
  await store.requestCancel('job-1');
  assert.strictEqual((await store.get('job-1')).cancelRequested, true);
  console.log('processing job store tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
