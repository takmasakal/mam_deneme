const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMediaWorkerExecutor } = require('../src/services/mediaWorkerExecutor');
const { createProcessingStorageService } = require('../src/services/processingStorageService');
const { createProcessingJob, PROCESSING_TASKS } = require('../src/services/processingJobContract');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-worker-test-'));
  fs.mkdirSync(path.join(root, 'video')); fs.writeFileSync(path.join(root, 'video/input.mp4'), 'x');
  const calls = [];
  const executor = createMediaWorkerExecutor({
    storage: createProcessingStorageService({ roots: { primary: root, scratch: path.join(root, 'scratch') } }),
    mediaTools: {
      probeMediaTechnicalInfo: async (input) => { calls.push(input); return { available: true }; },
      generateImageDerivative: async (input, output, options) => { calls.push([input, output, options.kind]); return { kind: options.kind }; },
      generateVideoProxy: async (input, output, options) => { calls.push([input, output, options.metadataComment]); return {}; }
    }
  });
  const job = createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.VIDEO_PROBE, input: { storage: 'primary', relativePath: 'video/input.mp4' } });
  const result = await executor(job);
  assert.strictEqual(result.result.available, true); assert.strictEqual(calls.length, 1);
  fs.writeFileSync(path.join(root, 'photo.jpg'), 'x');
  const imageResult = await executor(createProcessingJob({ application: 'metmam', assetId: 'a2', task: PROCESSING_TASKS.IMAGE_THUMBNAIL, input: { storage: 'primary', relativePath: 'photo.jpg' }, output: { storage: 'primary', relativePath: 'thumb.jpg' } }));
  assert.strictEqual(imageResult.result.kind, 'thumbnail');
  await executor(createProcessingJob({ application: 'metmam', assetId: 'a3', task: PROCESSING_TASKS.VIDEO_PROXY, input: { storage: 'primary', relativePath: 'video/input.mp4' }, output: { storage: 'primary', relativePath: 'proxy.mp4' } }));
  assert.strictEqual(calls.at(-1)[2], 'MetMAM tarafından üretilen proxy');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('media worker executor tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
