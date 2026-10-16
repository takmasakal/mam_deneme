const assert = require('assert');
const { createRemoteProcessingAdapter, trimBaseUrl } = require('../src/services/remoteProcessingAdapter');

async function run() {
  assert.strictEqual(trimBaseUrl('http://worker:8080/'), 'http://worker:8080');
  assert.throws(() => trimBaseUrl('worker:8080'), /http or https/);
  const calls = [];
  const responses = [
    { ok: true, status: 200, json: async () => ({ tasks: ['video.proxy'], models: [] }) },
    { ok: true, status: 202, json: async () => ({ jobId: 'j1', status: 'running', progress: 20 }) },
    { ok: true, status: 200, json: async () => ({ jobId: 'j1', status: 'completed', progress: 100, result: { ok: true } }) }
  ];
  const progress = [];
  const adapter = createRemoteProcessingAdapter({
    baseUrl: 'http://worker:8080', token: 'secret', pollIntervalMs: 1,
    fetch: async (url, options) => { calls.push([url, options]); return responses.shift(); }
  });
  const result = await adapter.execute({ jobId: 'j1', task: 'video.proxy' }, { onProgress: (...args) => progress.push(args) });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[0][1].headers.authorization, 'Bearer secret');
  assert.deepStrictEqual(progress.at(-1), [100, 'completed']);
  const unsupported = createRemoteProcessingAdapter({
    baseUrl: 'http://worker:8080',
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ tasks: ['video.proxy'], models: [] }) })
  });
  await assert.rejects(() => unsupported.execute({ jobId: 'j2', task: 'video.probe' }), (error) => error.code === 'REMOTE_TASK_UNSUPPORTED');
  const queueResponses = [
    { ok: true, status: 200, json: async () => ({ tasks: ['video.proxy'], models: [] }) },
    { ok: true, status: 202, json: async () => ({ jobId: 'queued-1', status: 'queued' }) },
    { ok: true, status: 200, json: async () => ({ jobId: 'queued-1', status: 'running' }) },
    { ok: true, status: 200, json: async () => ({ jobId: 'queued-1', status: 'cancelled' }) }
  ];
  const queued = createRemoteProcessingAdapter({ baseUrl: 'http://worker:8080', fetch: async () => queueResponses.shift() });
  assert.strictEqual((await queued.submit({ jobId: 'queued-1', task: 'video.proxy' })).status, 'queued');
  assert.strictEqual((await queued.get('queued-1')).status, 'running');
  assert.strictEqual((await queued.cancel('queued-1')).status, 'cancelled');
  console.log('remote processing adapter tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
