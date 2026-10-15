const { normalizeExecutionMode } = require('./aiExecutionService');
const { PROCESSING_TASKS } = require('./processingJobContract');

const OPERATIONS = [
  'generateVideoProxy', 'getMediaAudioChannelCount', 'getMediaAudioStreamOptions',
  'getMediaAudioStreams', 'getVideoDurationSeconds', 'probeMediaTechnicalInfo',
  'runFfmpeg', 'summarizeFfmpegError'
];
const LOCAL_MEDIA_TASKS = Object.freeze([PROCESSING_TASKS.VIDEO_PROXY, PROCESSING_TASKS.VIDEO_PROBE, PROCESSING_TASKS.MEDIA_TRANSCODE]);

function createMediaOperationsService(options = {}) {
  const mode = normalizeExecutionMode(options.mode);
  const adapter = mode === 'remote' ? options.remoteAdapter : options.localAdapter;
  if (!adapter || typeof adapter !== 'object') throw new Error(`Media operations ${mode} adapter is not configured`);
  const service = {
    mode,
    getCapabilities: () => typeof adapter.getCapabilities === 'function'
      ? adapter.getCapabilities()
      : { mode, tasks: [...LOCAL_MEDIA_TASKS] }
  };
  OPERATIONS.forEach((operation) => {
    service[operation] = (...args) => {
      if (typeof adapter[operation] !== 'function') throw new Error(`Media operations adapter does not support ${operation}`);
      return adapter[operation](...args);
    };
  });
  return Object.freeze(service);
}

module.exports = { createMediaOperationsService, MEDIA_OPERATIONS: Object.freeze([...OPERATIONS]) };
