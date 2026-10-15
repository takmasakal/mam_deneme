const assert = require('assert');
const path = require('path');
const { PROCESSING_DOMAINS, PROCESSING_TASKS, createProcessingJob, getTaskDomain, normalizeStorageReference, resolveStorageReference, toStorageReference } = require('../src/services/processingJobContract');

assert.strictEqual(getTaskDomain(PROCESSING_TASKS.SUBTITLE_GENERATE), PROCESSING_DOMAINS.AI);
assert.strictEqual(getTaskDomain(PROCESSING_TASKS.VIDEO_PROXY), PROCESSING_DOMAINS.MEDIA);
assert.deepStrictEqual(normalizeStorageReference({ storage: 'PRIMARY', relativePath: '2026\\10\\video.mp4' }), { storage: 'primary', relativePath: '2026/10/video.mp4' });
assert.throws(() => normalizeStorageReference({ storage: 'primary', relativePath: '../secret' }), /escapes/);
assert.throws(() => normalizeStorageReference({ storage: 'primary', relativePath: '/absolute/file' }), /relative/);
const root = path.join(path.sep, 'srv', 'media');
const reference = toStorageReference(path.join(root, '2026', '10', 'video.mp4'), root);
assert.strictEqual(resolveStorageReference(reference, { primary: root }), path.join(root, '2026', '10', 'video.mp4'));
const job = createProcessingJob({ jobId: 'job-1', application: 'Belgelik', task: PROCESSING_TASKS.SUBTITLE_GENERATE, assetId: 'asset-1', input: reference, execution: { engine: 'faster-whisper', model: 'small' } });
assert.strictEqual(job.schemaVersion, 1);
assert.strictEqual(job.application, 'belgelik');
assert.strictEqual(job.domain, 'ai');
assert.strictEqual(job.execution.model, 'small');
console.log('processing job contract tests passed');
