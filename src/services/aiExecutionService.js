const { createProcessingJob, PROCESSING_DOMAINS } = require('./processingJobContract');

function normalizeExecutionMode(value) {
  return String(value || '').trim().toLowerCase() === 'remote' ? 'remote' : 'local';
}

function createAiExecutionService(options = {}) {
  const mode = normalizeExecutionMode(options.mode);
  const adapter = mode === 'remote' ? options.remoteAdapter : options.localAdapter;
  if (!adapter || typeof adapter !== 'object') throw new Error(`AI ${mode} execution adapter is not configured`);
  function invoke(method, ...args) {
    if (typeof adapter[method] !== 'function') throw new Error(`AI execution adapter does not support ${method}`);
    return adapter[method](...args);
  }
  function execute(job, context = {}) {
    const normalizedJob = createProcessingJob(job);
    if (normalizedJob.domain !== PROCESSING_DOMAINS.AI) {
      throw new Error(`AI execution cannot run ${normalizedJob.domain} task ${normalizedJob.task}`);
    }
    return invoke('execute', normalizedJob, context);
  }
  return Object.freeze({
    mode,
    execute,
    getCapabilities: () => typeof adapter.getCapabilities === 'function' ? adapter.getCapabilities() : { mode, tasks: [] },
    queueSubtitleGeneration: (row, jobOptions) => invoke('queueSubtitleGeneration', row, jobOptions),
    queueSubtitleTranslation: (row, jobOptions) => invoke('queueSubtitleTranslation', row, jobOptions),
    queueVideoOcr: (row, jobOptions) => invoke('queueVideoOcr', row, jobOptions),
    extractPhotoOcr: (inputPath, outputPath, jobOptions) => invoke('extractPhotoOcr', inputPath, outputPath, jobOptions),
    queueMetadataEnrichment: (row, jobOptions) => invoke('queueMetadataEnrichment', row, jobOptions)
  });
}

module.exports = { createAiExecutionService, normalizeExecutionMode };
