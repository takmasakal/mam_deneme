const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAiWorkerExecutor } = require('../src/services/aiWorkerExecutor');
const { createProcessingStorageService } = require('../src/services/processingStorageService');
const { createModelCatalogService } = require('../src/services/modelCatalogService');
const { createProcessingJob, PROCESSING_TASKS } = require('../src/services/processingJobContract');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-worker-test-'));
  fs.writeFileSync(path.join(root, 'input.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'source.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n');
  fs.writeFileSync(path.join(root, 'metadata.json'), JSON.stringify({ title: 'Deneme', text: 'Arşiv içeriği hakkında örnek metin.' }));
  fs.writeFileSync(path.join(root, 'photo.jpg'), 'x');
  fs.writeFileSync(path.join(root, 'photo.heic'), 'heic');
  fs.mkdirSync(path.join(root, 'frames'));
  fs.writeFileSync(path.join(root, 'frames', 'frame-000001.jpg'), 'x');
  const calls = [];
  const executor = createAiWorkerExecutor({
    storage: createProcessingStorageService({ roots: { primary: root } }),
    catalog: createModelCatalogService({ entries: [
      { id: 'small', task: 'subtitle.generate', path: root, variant: 'small' },
      { id: 'marian-tr', task: 'subtitle.translate', path: root, variant: 'tr' },
      { id: 'paddle-latin', task: 'video.ocr', path: root, variant: 'latin' },
      { id: 'paddle-latin', task: 'photo.ocr', path: root, variant: 'latin' },
      { id: 'gemma3:4b', task: 'metadata.enrich', provider: 'ollama' },
      { id: 'gemma3:4b', task: 'document.summarize', provider: 'ollama' }
    ] }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ summary: 'Kısa özet', keywords: ['arşiv'] }) } }) }),
    runner: async (command, args) => {
      calls.push([command, args]);
      if (command === 'heif-convert') fs.writeFileSync(args[1], 'converted-jpeg');
      if (args.includes('--output')) fs.writeFileSync(args[args.indexOf('--output') + 1], 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTest\n');
      return args.includes('--frames-dir') ? { stdout: JSON.stringify({ items: [{ name: 'frame-000001.jpg', text: 'OCR' }] }) } : { stdout: '' };
    }
  });
  const generated = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.SUBTITLE_GENERATE, input: { storage: 'primary', relativePath: 'input.mp4' }, output: { storage: 'primary', relativePath: 'out.vtt' }, options: { model: 'small', lang: 'tr' } }));
  assert.strictEqual(generated.result.cueCount, 1);
  assert(calls[0][1].includes('--lang'));
  const translated = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.SUBTITLE_TRANSLATE, input: { storage: 'primary', relativePath: 'source.vtt' }, output: { storage: 'primary', relativePath: 'translated.vtt' }, options: { model: 'marian-tr', batchSize: 24 } }));
  assert.strictEqual(translated.result.backend, 'marian');
  assert(calls[1][1].includes('--model-dir'));
  assert(!calls[1][1].includes('--allow-download'));
  assert.strictEqual(calls[1][1][calls[1][1].indexOf('--batch-size') + 1], '24');
  const ocr = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.VIDEO_OCR, input: { storage: 'primary', relativePath: 'frames' }, output: { storage: 'primary', relativePath: 'ocr/result.json' }, options: { model: 'paddle-latin', lang: 'tur' } }));
  assert.strictEqual(ocr.result.frameCount, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'ocr', 'result.json'), 'utf8')).items[0].text, 'OCR');
  const photoOcr = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.PHOTO_OCR, input: { storage: 'primary', relativePath: 'photo.jpg' }, output: { storage: 'primary', relativePath: 'ocr/photo.json' }, options: { model: 'paddle-latin', lang: 'tur' } }));
  assert.strictEqual(photoOcr.result.frameCount, 1);
  const heicOcr = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.PHOTO_OCR, input: { storage: 'primary', relativePath: 'photo.heic' }, output: { storage: 'primary', relativePath: 'ocr/photo-heic.json' }, options: { model: 'paddle-latin', lang: 'tur' } }));
  assert.strictEqual(heicOcr.result.frameCount, 1);
  assert(calls.some(([command, args]) => command === 'heif-convert' && args[0].endsWith('photo.heic')), 'HEIC photos are converted to JPEG before OCR');
  const metadata = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.METADATA_ENRICH, input: { storage: 'primary', relativePath: 'metadata.json' }, output: { storage: 'primary', relativePath: 'metadata/result.json' }, options: { model: 'gemma3:4b' } }));
  assert.deepStrictEqual(metadata.result.keywords, ['arşiv']);
  const summary = await executor(createProcessingJob({ application: 'metmam', assetId: 'a1', task: PROCESSING_TASKS.DOCUMENT_SUMMARIZE, input: { storage: 'primary', relativePath: 'metadata.json' }, output: { storage: 'primary', relativePath: 'metadata/summary.json' }, options: { model: 'gemma3:4b' } }));
  assert.strictEqual(summary.result.summary, 'Kısa özet');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('ai worker executor tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
