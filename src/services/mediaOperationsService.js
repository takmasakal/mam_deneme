const { normalizeExecutionMode } = require('./aiExecutionService');
const {
  createProcessingJob,
  PROCESSING_DOMAINS,
  PROCESSING_TASKS
} = require('./processingJobContract');

const OPERATIONS = [
  'generateVideoProxy',
  'getMediaAudioChannelCount',
  'getMediaAudioStreamOptions',
  'getMediaAudioStreams',
  'getVideoDurationSeconds',
  'probeMediaTechnicalInfo',
  'runFfmpeg',
  'summarizeFfmpegError'
];
const LOCAL_MEDIA_TASKS = Object.freeze([
  PROCESSING_TASKS.AUDIO_EXTRACT,
  PROCESSING_TASKS.VIDEO_PROXY,
  PROCESSING_TASKS.VIDEO_PROBE,
  PROCESSING_TASKS.MEDIA_TRANSCODE,
  PROCESSING_TASKS.VIDEO_THUMBNAIL,
  PROCESSING_TASKS.VIDEO_OCR_FRAMES,
  PROCESSING_TASKS.IMAGE_THUMBNAIL,
  PROCESSING_TASKS.IMAGE_PREVIEW,
  PROCESSING_TASKS.DOCUMENT_THUMBNAIL,
  PROCESSING_TASKS.DOCUMENT_PREVIEW
]);

function createMediaOperationsService(options = {}) {
  const mode = normalizeExecutionMode(options.mode);
  const localAdapter = options.localAdapter;
  const executionAdapter = mode === 'remote' ? options.remoteAdapter : localAdapter;
  if (!localAdapter || typeof localAdapter !== 'object') {
    throw new Error('Media operations local adapter is not configured');
  }
  if (!executionAdapter || typeof executionAdapter !== 'object') {
    throw new Error(`Media operations ${mode} adapter is not configured`);
  }

  const service = {
    mode,
    execute: (job, context = {}) => {
      const normalizedJob = createProcessingJob(job);
      if (normalizedJob.domain !== PROCESSING_DOMAINS.MEDIA) {
        throw new Error(`Media operations cannot run ${normalizedJob.domain} task ${normalizedJob.task}`);
      }
      if (typeof executionAdapter.execute !== 'function') {
        throw new Error('Media operations adapter does not support execute');
      }
      return executionAdapter.execute(normalizedJob, context);
    },
    submit: (job) => {
      const normalizedJob = createProcessingJob(job);
      if (normalizedJob.domain !== PROCESSING_DOMAINS.MEDIA) throw new Error(`Media operations cannot run ${normalizedJob.domain} task ${normalizedJob.task}`);
      if (typeof executionAdapter.submit !== 'function') throw new Error(`Media operations ${mode} adapter does not support submit`);
      return executionAdapter.submit(normalizedJob);
    },
    get: (jobId) => {
      if (typeof executionAdapter.get !== 'function') throw new Error(`Media operations ${mode} adapter does not support get`);
      return executionAdapter.get(String(jobId || '').trim());
    },
    cancel: (jobId) => {
      if (typeof executionAdapter.cancel !== 'function') throw new Error(`Media operations ${mode} adapter does not support cancel`);
      return executionAdapter.cancel(String(jobId || '').trim());
    },
    getCapabilities: () => typeof executionAdapter.getCapabilities === 'function'
      ? executionAdapter.getCapabilities()
      : { mode, tasks: [...LOCAL_MEDIA_TASKS] },
    health: () => typeof executionAdapter.health === 'function'
      ? executionAdapter.health()
      : Promise.resolve({ ok: true, mode, service: 'media-local' })
  };
  OPERATIONS.forEach((operation) => {
    service[operation] = (...args) => {
      if (typeof localAdapter[operation] !== 'function') {
        throw new Error(`Media operations adapter does not support ${operation}`);
      }
      return localAdapter[operation](...args);
    };
  });
  return Object.freeze(service);
}

module.exports = {
  createMediaOperationsService,
  MEDIA_OPERATIONS: Object.freeze([...OPERATIONS])
};
