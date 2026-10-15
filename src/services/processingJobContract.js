const path = require('path');

const PROCESSING_JOB_SCHEMA_VERSION = 1;
const PROCESSING_DOMAINS = Object.freeze({ AI: 'ai', MEDIA: 'media' });
const PROCESSING_TASKS = Object.freeze({
  SUBTITLE_GENERATE: 'subtitle.generate', SUBTITLE_TRANSLATE: 'subtitle.translate',
  VIDEO_OCR: 'video.ocr', PHOTO_OCR: 'photo.ocr', METADATA_ENRICH: 'metadata.enrich',
  DOCUMENT_SUMMARIZE: 'document.summarize', VIDEO_PROXY: 'video.proxy',
  VIDEO_THUMBNAIL: 'video.thumbnail', VIDEO_PROBE: 'video.probe', AUDIO_EXTRACT: 'audio.extract',
  IMAGE_THUMBNAIL: 'image.thumbnail', IMAGE_PREVIEW: 'image.preview',
  DOCUMENT_THUMBNAIL: 'document.thumbnail', DOCUMENT_PREVIEW: 'document.preview',
  MEDIA_TRANSCODE: 'media.transcode', MEDIA_VALIDATE: 'media.validate'
});
const TASK_DOMAINS = Object.freeze(Object.fromEntries([
  PROCESSING_TASKS.SUBTITLE_GENERATE, PROCESSING_TASKS.SUBTITLE_TRANSLATE, PROCESSING_TASKS.VIDEO_OCR,
  PROCESSING_TASKS.PHOTO_OCR, PROCESSING_TASKS.METADATA_ENRICH, PROCESSING_TASKS.DOCUMENT_SUMMARIZE
].map((task) => [task, PROCESSING_DOMAINS.AI]).concat([
  PROCESSING_TASKS.VIDEO_PROXY, PROCESSING_TASKS.VIDEO_THUMBNAIL, PROCESSING_TASKS.VIDEO_PROBE,
  PROCESSING_TASKS.AUDIO_EXTRACT, PROCESSING_TASKS.IMAGE_THUMBNAIL, PROCESSING_TASKS.IMAGE_PREVIEW,
  PROCESSING_TASKS.DOCUMENT_THUMBNAIL, PROCESSING_TASKS.DOCUMENT_PREVIEW,
  PROCESSING_TASKS.MEDIA_TRANSCODE, PROCESSING_TASKS.MEDIA_VALIDATE
].map((task) => [task, PROCESSING_DOMAINS.MEDIA]))));

function normalizeTaskName(value) {
  const task = String(value || '').trim().toLowerCase();
  if (!TASK_DOMAINS[task]) throw new Error(`Unsupported processing task: ${task || '(empty)'}`);
  return task;
}
function getTaskDomain(value) { return TASK_DOMAINS[normalizeTaskName(value)]; }
function normalizeStorageReference(value) {
  const input = value && typeof value === 'object' ? value : {};
  const storage = String(input.storage || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(storage)) throw new Error('Invalid processing storage key');
  const rawPath = String(input.relativePath || input.relative_path || '').trim().replace(/\\/g, '/');
  if (!rawPath || rawPath.startsWith('/') || /^[a-z]:\//i.test(rawPath)) throw new Error('Processing storage path must be relative');
  const relativePath = path.posix.normalize(rawPath).replace(/^\.\//, '');
  if (!relativePath || relativePath === '.' || relativePath === '..' || relativePath.startsWith('../')) throw new Error('Processing storage path escapes the storage root');
  return Object.freeze({ storage, relativePath });
}
function toStorageReference(absolutePath, storageRoot, storage = 'primary') {
  const root = path.resolve(String(storageRoot || ''));
  const target = path.resolve(String(absolutePath || ''));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('File is outside the configured processing storage root');
  return normalizeStorageReference({ storage, relativePath: relative.split(path.sep).join('/') });
}
function resolveStorageReference(reference, storageRoots = {}) {
  const normalized = normalizeStorageReference(reference);
  const rootValue = storageRoots[normalized.storage];
  if (!rootValue) throw new Error(`Unknown processing storage: ${normalized.storage}`);
  const root = path.resolve(String(rootValue));
  const target = path.resolve(root, normalized.relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Processing storage path escapes the storage root');
  return target;
}
function createProcessingJob(value = {}) {
  const task = normalizeTaskName(value.task);
  const application = String(value.application || '').trim().toLowerCase();
  const assetId = String(value.assetId || value.asset_id || '').trim();
  if (!application) throw new Error('Processing job application is required');
  if (!assetId) throw new Error('Processing job assetId is required');
  return Object.freeze({
    schemaVersion: PROCESSING_JOB_SCHEMA_VERSION,
    jobId: String(value.jobId || value.job_id || '').trim(), application,
    domain: getTaskDomain(task), task, assetId,
    input: normalizeStorageReference(value.input),
    output: value.output ? normalizeStorageReference(value.output) : null,
    execution: value.execution && typeof value.execution === 'object' ? { ...value.execution } : {},
    options: value.options && typeof value.options === 'object' ? { ...value.options } : {}
  });
}

module.exports = { PROCESSING_DOMAINS, PROCESSING_JOB_SCHEMA_VERSION, PROCESSING_TASKS, TASK_DOMAINS, createProcessingJob, getTaskDomain, normalizeStorageReference, normalizeTaskName, resolveStorageReference, toStorageReference };
