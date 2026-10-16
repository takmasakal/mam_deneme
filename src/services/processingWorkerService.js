const crypto = require('crypto');
const { createProcessingJob } = require('./processingJobContract');
const { createMemoryProcessingJobStore } = require('./processingJobStore');

function serializeError(error) {
  return { code: String(error?.code || 'PROCESSING_JOB_FAILED'), message: String(error?.message || error || 'Processing job failed').slice(0, 2000) };
}

function createProcessingWorkerService(options = {}) {
  if (typeof options.executor !== 'function') throw new Error('Processing worker executor is required');
  const domain = String(options.domain || '').trim().toLowerCase();
  if (!domain) throw new Error('Processing worker domain is required');
  const serviceName = String(options.serviceName || `${domain}-operations-worker`).trim();
  const tasks = Object.freeze([...(options.tasks || [])]);
  const models = Object.freeze([...(options.models || [])]);
  const store = options.store || createMemoryProcessingJobStore();
  const workerId = String(options.workerId || `${serviceName}-${process.pid}-${crypto.randomUUID()}`).trim();
  const leaseMs = Math.max(5000, Number(options.leaseMs) || 60_000);
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts) || 3));
  const concurrency = Math.max(1, Math.min(64, Number(options.concurrency) || 1));
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const active = new Map();
  const startedAt = new Date().toISOString();
  let initialized = null;
  let draining = false;
  let stopping = false;
  const counters = { submitted: 0, completed: 0, failed: 0, retried: 0, cancelled: 0 };
  const initialize = () => (initialized ||= Promise.resolve(store.initialize()));

  async function runClaimed(record) {
    const controller = new AbortController();
    active.set(record.jobId, controller);
    const heartbeatMs = Math.max(1000, Math.floor(leaseMs / 3));
    const heartbeat = setInterval(() => {
      store.renewLease(record.jobId, { workerId, leaseMs }).then((renewed) => {
        if (!renewed) controller.abort();
      }).catch(() => controller.abort());
    }, heartbeatMs);
    heartbeat.unref?.();
    onEvent({ event: 'processing_job_started', service: serviceName, workerId, jobId: record.jobId, domain, task: record.job.task, assetId: record.job.assetId, attempt: record.attemptCount });
    try {
      const execution = await options.executor(record.job, {
        signal: controller.signal,
        onProgress: (progress, phase) => store.update(record.jobId, { progress: Math.max(0, Math.min(100, Number(progress) || 0)), phase: String(phase || 'processing') }).catch(() => {})
      });
      await store.update(record.jobId, controller.signal.aborted
        ? { status: 'cancelled', phase: 'cancelled', clearLease: true, finishedAt: new Date().toISOString() }
        : { status: 'completed', progress: 100, phase: 'completed', output: execution?.output ?? record.job.output, result: execution?.result ?? execution ?? null, clearLease: true, finishedAt: new Date().toISOString() });
      if (controller.signal.aborted) counters.cancelled += 1;
      else counters.completed += 1;
      onEvent({ event: controller.signal.aborted ? 'processing_job_cancelled' : 'processing_job_completed', service: serviceName, workerId, jobId: record.jobId, domain, task: record.job.task, assetId: record.job.assetId, attempt: record.attemptCount });
    } catch (error) {
      const latest = await store.get(record.jobId);
      const retry = !controller.signal.aborted && Number(latest?.attemptCount || 0) < Number(latest?.maxAttempts || maxAttempts);
      await store.update(record.jobId, retry
        ? { status: 'queued', phase: 'retrying', error: serializeError(error), clearLease: true }
        : { status: controller.signal.aborted ? 'cancelled' : 'failed', phase: controller.signal.aborted ? 'cancelled' : 'failed', error: serializeError(error), clearLease: true, finishedAt: new Date().toISOString() });
      if (retry) counters.retried += 1;
      else if (controller.signal.aborted) counters.cancelled += 1;
      else counters.failed += 1;
      onEvent({ event: retry ? 'processing_job_retrying' : controller.signal.aborted ? 'processing_job_cancelled' : 'processing_job_failed', service: serviceName, workerId, jobId: record.jobId, domain, task: record.job.task, assetId: record.job.assetId, attempt: record.attemptCount, error: serializeError(error) });
    } finally { clearInterval(heartbeat); active.delete(record.jobId); }
  }

  async function drain() {
    if (draining || stopping) return;
    draining = true;
    const running = new Set();
    try {
      await initialize();
      while (!stopping) {
        let claimedAny = false;
        while (!stopping && running.size < concurrency) {
          const claimed = await store.claimNext({ workerId, leaseMs });
          if (!claimed) break;
          claimedAny = true;
          const promise = runClaimed(claimed).finally(() => running.delete(promise));
          running.add(promise);
        }
        if (!running.size) break;
        await Promise.race(running);
        if (!claimedAny && !running.size) break;
      }
      if (running.size) await Promise.allSettled([...running]);
    } finally { draining = false; }
  }

  async function submit(value) {
    if (stopping) throw new Error(`${serviceName} is shutting down`);
    await initialize();
    const job = createProcessingJob({ ...value, jobId: String(value?.jobId || '').trim() || crypto.randomUUID() });
    if (job.domain !== domain) throw new Error(`${serviceName} cannot run ${job.domain} task ${job.task}`);
    if (tasks.length && !tasks.includes(job.task)) throw new Error(`${serviceName} does not support ${job.task}`);
    const record = await store.enqueue({ jobId: job.jobId, job, status: 'queued', progress: 0, phase: 'queued', output: job.output, result: null, error: null, attemptCount: 0, maxAttempts, cancelRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: '', finishedAt: '' });
    counters.submitted += 1;
    onEvent({ event: 'processing_job_submitted', service: serviceName, jobId: record.jobId, domain, task: job.task, assetId: job.assetId });
    queueMicrotask(() => drain().catch(() => {}));
    return record;
  }

  async function cancel(jobId) {
    await initialize();
    const record = await store.requestCancel(String(jobId || '').trim());
    if (!record) return null;
    active.get(record.jobId)?.abort();
    if (!active.has(record.jobId)) counters.cancelled += 1;
    return store.update(record.jobId, { status: 'cancelled', phase: 'cancelled', clearLease: true, finishedAt: new Date().toISOString() });
  }

  async function shutdown(options = {}) {
    stopping = true;
    active.forEach((controller) => controller.abort());
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30_000);
    const deadline = Date.now() + timeoutMs;
    while ((active.size || draining) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return { stopped: active.size === 0, activeJobs: active.size };
  }

  const getCapabilities = () => ({ service: serviceName, domain, tasks: [...tasks], models: models.map((item) => ({ ...item })) });
  const getHealth = () => ({
    ok: true,
    service: serviceName,
    domain,
    workerId,
    activeJobs: active.size,
    draining,
    stopping,
    leaseMs,
    concurrency,
    startedAt,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)),
    counters: { ...counters }
  });
  return Object.freeze({ cancel, drain, get: async (jobId) => { await initialize(); return store.get(String(jobId || '').trim()); }, getCapabilities, getHealth, initialize, shutdown, submit });
}

module.exports = { createProcessingWorkerService, serializeError };
