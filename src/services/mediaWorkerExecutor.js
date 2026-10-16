const fs = require('fs');
const path = require('path');
const { PROCESSING_TASKS } = require('./processingJobContract');

function createMediaWorkerExecutor(options = {}) {
  const storage = options.storage;
  const mediaTools = options.mediaTools;
  if (!storage || !mediaTools) throw new Error('Media worker requires storage and media tools');
  return async function execute(job, context = {}) {
    const inputPath = storage.resolve(job.input);
    if (!fs.existsSync(inputPath)) {
      const error = new Error('Media input file not found'); error.code = 'MEDIA_INPUT_NOT_FOUND'; throw error;
    }
    const outputPath = job.output ? storage.resolve(job.output) : '';
    if (outputPath) fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (job.task === PROCESSING_TASKS.VIDEO_PROXY) {
      const applicationName = job.application === 'belgelik' ? 'Belgelik' : job.application === 'metmam' ? 'MetMAM' : job.application;
      const result = await mediaTools.generateVideoProxy(inputPath, outputPath, {
        ...job.options,
        metadataComment: job.options.metadataComment || `${applicationName} tarafından üretilen proxy`
      });
      return { output: job.output, result };
    }
    if (job.task === PROCESSING_TASKS.VIDEO_THUMBNAIL) {
      await mediaTools.generateVideoThumbnail(inputPath, outputPath, job.options);
      return { output: job.output, result: null };
    }
    if (job.task === PROCESSING_TASKS.VIDEO_PROBE) {
      return { output: null, result: await mediaTools.probeMediaTechnicalInfo(inputPath) };
    }
    if (job.task === PROCESSING_TASKS.AUDIO_EXTRACT) {
      return { output: job.output, result: await mediaTools.extractAudio(inputPath, outputPath, job.options, context) };
    }
    if (job.task === PROCESSING_TASKS.MEDIA_TRANSCODE) {
      return { output: job.output, result: await mediaTools.transcodeMedia(inputPath, outputPath, job.options) };
    }
    if (job.task === PROCESSING_TASKS.VIDEO_OCR_FRAMES) {
      return { output: job.output, result: await mediaTools.extractOcrFrames(inputPath, outputPath, job.options, context) };
    }
    if ([PROCESSING_TASKS.IMAGE_THUMBNAIL, PROCESSING_TASKS.IMAGE_PREVIEW].includes(job.task)) {
      return { output: job.output, result: await mediaTools.generateImageDerivative(inputPath, outputPath, { ...job.options, kind: job.task === PROCESSING_TASKS.IMAGE_THUMBNAIL ? 'thumbnail' : 'preview' }) };
    }
    if (job.task === PROCESSING_TASKS.DOCUMENT_THUMBNAIL) {
      return { output: job.output, result: await mediaTools.generateDocumentThumbnail(inputPath, outputPath, job.options) };
    }
    if (job.task === PROCESSING_TASKS.DOCUMENT_PREVIEW) {
      return { output: job.output, result: await mediaTools.generateDocumentPreview(inputPath, outputPath, job.options) };
    }
    throw new Error(`Media worker does not support ${job.task}`);
  };
}

module.exports = { createMediaWorkerExecutor };
