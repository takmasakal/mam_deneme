const { createProcessingJob, PROCESSING_DOMAINS } = require('./processingJobContract');

function normalizeExecutionMode(value) {
  return String(value || '').trim().toLowerCase() === 'remote' ? 'remote' : 'local';
}

function createAiExecutionService(options = {}) {
  const mode = normalizeExecutionMode(options.mode);
  const localAdapter = options.localAdapter;
  const executionAdapter = mode === 'remote' ? options.remoteAdapter : localAdapter;
  if (!localAdapter || typeof localAdapter !== 'object') {
    throw new Error('AI local execution adapter is not configured');
  }
  if (!executionAdapter || typeof executionAdapter !== 'object') {
    throw new Error(`AI ${mode} execution adapter is not configured`);
  }

  function invoke(method, ...args) {
    if (typeof localAdapter[method] !== 'function') {
      throw new Error(`AI execution adapter does not support ${method}`);
    }
    return localAdapter[method](...args);
  }

  function execute(job, context = {}) {
    const normalizedJob = createProcessingJob(job);
    if (normalizedJob.domain !== PROCESSING_DOMAINS.AI) {
      throw new Error(`AI execution cannot run ${normalizedJob.domain} task ${normalizedJob.task}`);
    }
    if (typeof executionAdapter.execute !== 'function') throw new Error(`AI ${mode} execution adapter does not support execute`);
    return executionAdapter.execute(normalizedJob, context);
  }

  function invokeStandard(method, ...args) {
    if (typeof executionAdapter[method] !== 'function') throw new Error(`AI ${mode} execution adapter does not support ${method}`);
    return executionAdapter[method](...args);
  }

  return Object.freeze({
    mode,
    execute,
    submit: (job) => {
      const normalizedJob = createProcessingJob(job);
      if (normalizedJob.domain !== PROCESSING_DOMAINS.AI) throw new Error(`AI execution cannot run ${normalizedJob.domain} task ${normalizedJob.task}`);
      return invokeStandard('submit', normalizedJob);
    },
    get: (jobId) => invokeStandard('get', String(jobId || '').trim()),
    cancel: (jobId) => invokeStandard('cancel', String(jobId || '').trim()),
    getCapabilities: () => typeof executionAdapter.getCapabilities === 'function'
      ? executionAdapter.getCapabilities()
      : { mode, tasks: [] },
    health: () => typeof executionAdapter.health === 'function'
      ? executionAdapter.health()
      : Promise.resolve({ ok: true, mode, service: 'ai-local' }),
    queueSubtitleGeneration: (row, jobOptions) => invoke('queueSubtitleGeneration', row, jobOptions),
    queueSubtitleTranslation: (row, jobOptions) => invoke('queueSubtitleTranslation', row, jobOptions),
    queueVideoOcr: (row, jobOptions) => invoke('queueVideoOcr', row, jobOptions),
    extractPhotoOcr: (inputPath, outputPath, jobOptions) => invoke('extractPhotoOcr', inputPath, outputPath, jobOptions),
    queueMetadataEnrichment: (row, jobOptions) => invoke('queueMetadataEnrichment', row, jobOptions)
  });
}

module.exports = {
  createAiExecutionService,
  normalizeExecutionMode
};
