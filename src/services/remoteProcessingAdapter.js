function trimBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Remote processing base URL must use http or https');
  return url;
}

function createRemoteProcessingAdapter(options = {}) {
  const baseUrl = trimBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Remote processing adapter requires fetch');
  const token = String(options.token || '').trim();
  const pollIntervalMs = Math.max(100, Number(options.pollIntervalMs) || 1000);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 24 * 60 * 60 * 1000);
  const capabilityCacheMs = Math.max(1000, Number(options.capabilityCacheMs) || 30_000);
  let capabilityCache = null;

  async function request(pathname, requestOptions = {}) {
    const headers = { accept: 'application/json', ...(requestOptions.headers || {}) };
    if (requestOptions.body != null) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${baseUrl}${pathname}`, { ...requestOptions, headers });
    let payload = null;
    try { payload = await response.json(); } catch (_error) {}
    if (!response.ok) {
      const error = new Error(String(payload?.error?.message || payload?.error || `Remote processing request failed (${response.status})`));
      error.code = String(payload?.error?.code || 'REMOTE_PROCESSING_REQUEST_FAILED');
      error.status = response.status;
      throw error;
    }
    return payload || {};
  }

  async function getCapabilities(options = {}) {
    const now = Date.now();
    if (!options.refresh && capabilityCache && capabilityCache.expiresAt > now) return capabilityCache.value;
    const value = await request('/v1/capabilities');
    capabilityCache = { value, expiresAt: now + capabilityCacheMs };
    return value;
  }

  async function assertSupported(job) {
    const capabilities = await getCapabilities();
    const tasks = Array.isArray(capabilities.tasks) ? capabilities.tasks : [];
    if (!tasks.includes(job.task)) {
      const error = new Error(`Remote worker does not support task ${job.task}`);
      error.code = 'REMOTE_TASK_UNSUPPORTED';
      throw error;
    }
    const model = String(job?.options?.model || '').trim();
    if (!model) return;
    const models = Array.isArray(capabilities.models) ? capabilities.models : [];
    const supported = models.some((entry) => String(entry?.id || entry?.model || '') === model && (!entry?.task || String(entry.task) === job.task));
    if (!supported) {
      const error = new Error(`Remote worker does not provide model ${model} for ${job.task}`);
      error.code = 'REMOTE_MODEL_UNSUPPORTED';
      throw error;
    }
  }

  async function submit(job) {
    await assertSupported(job);
    return request('/v1/jobs', { method: 'POST', body: JSON.stringify(job) });
  }

  function get(jobId) {
    return request(`/v1/jobs/${encodeURIComponent(String(jobId || '').trim())}`);
  }

  function cancel(jobId) {
    return request(`/v1/jobs/${encodeURIComponent(String(jobId || '').trim())}`, { method: 'DELETE' });
  }

  async function execute(job, context = {}) {
    const submitted = await submit(job);
    let state = submitted;
    const jobId = String(state.jobId || job.jobId || '').trim();
    const startedAt = Date.now();
    while (state.status === 'queued' || state.status === 'running') {
      if (!jobId) throw new Error('Remote processing response did not include jobId');
      if (context.signal?.aborted) {
        await cancel(jobId).catch(() => {});
        const error = new Error('Remote processing job was cancelled');
        error.code = 'PROCESSING_JOB_CANCELLED';
        throw error;
      }
      if (Date.now() - startedAt > timeoutMs) {
        const error = new Error('Remote processing job timed out');
        error.code = 'REMOTE_PROCESSING_TIMEOUT';
        throw error;
      }
      context.onProgress?.(Number(state.progress || 0), String(state.phase || 'processing'));
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      state = await get(jobId);
    }
    if (state.status === 'failed' || state.status === 'cancelled') {
      const error = new Error(String(state.error?.message || state.error || `Remote processing job ${state.status}`));
      error.code = String(state.error?.code || (state.status === 'cancelled' ? 'PROCESSING_JOB_CANCELLED' : 'REMOTE_PROCESSING_FAILED'));
      throw error;
    }
    context.onProgress?.(100, 'completed');
    return state;
  }

  return Object.freeze({
    execute,
    submit,
    get,
    cancel,
    getCapabilities,
    health: () => request('/health')
  });
}

module.exports = { createRemoteProcessingAdapter, trimBaseUrl };
