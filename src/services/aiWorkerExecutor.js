const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PROCESSING_TASKS } = require('./processingJobContract');

function parseJsonObject(value) {
  const text = String(value || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI response did not contain JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function callOllama(prompt, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required for Ollama');
  const response = await fetchImpl(`${String(options.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: options.signal,
    body: JSON.stringify({ model: options.model, stream: false, keep_alive: options.keepAlive || '10m', format: 'json', messages: [{ role: 'system', content: options.system }, { role: 'user', content: prompt }], options: { temperature: 0, num_ctx: 8192, num_predict: options.numPredict || 900 } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || `Ollama HTTP ${response.status}`).slice(0, 700));
  return parseJsonObject(payload?.message?.content);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...(options.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const abort = () => child.kill('SIGTERM');
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk); stderr += text;
      for (const match of text.matchAll(/MAM_PROGRESS[=:](\d+)\s*([^\r\n]*)/g)) options.onProgress?.(Number(match[1]), String(match[2] || 'processing').trim());
    });
    child.once('error', reject);
    child.once('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      if (code === 0) resolve({ stdout, stderr });
      else { const error = new Error(stderr.trim() || `AI process exited with code ${code}`); error.code = options.signal?.aborted ? 'PROCESSING_JOB_CANCELLED' : 'AI_PROCESS_FAILED'; reject(error); }
    });
  });
}

function createAiWorkerExecutor(options = {}) {
  const storage = options.storage;
  const catalog = options.catalog;
  const runner = options.runner || runProcess;
  const scriptsDir = options.scriptsDir || path.join(__dirname, '..');
  if (!storage || !catalog) throw new Error('AI worker requires storage and model catalog');
  return async function execute(job, context = {}) {
    if (![PROCESSING_TASKS.SUBTITLE_GENERATE, PROCESSING_TASKS.SUBTITLE_TRANSLATE, PROCESSING_TASKS.VIDEO_OCR, PROCESSING_TASKS.PHOTO_OCR, PROCESSING_TASKS.METADATA_ENRICH, PROCESSING_TASKS.DOCUMENT_SUMMARIZE].includes(job.task)) throw new Error(`AI worker does not support ${job.task}`);
    if (!job.output) throw new Error('AI output storage reference is required');
    const inputPath = storage.resolve(job.input); const outputPath = storage.resolve(job.output);
    if (!fs.existsSync(inputPath)) throw new Error('Subtitle input file not found');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const model = String(job.options.model || '').trim();
    const catalogEntry = catalog.requireInstalled(job.task, model);
    if ([PROCESSING_TASKS.METADATA_ENRICH, PROCESSING_TASKS.DOCUMENT_SUMMARIZE].includes(job.task)) {
      const raw = fs.readFileSync(inputPath, 'utf8');
      let source = { text: raw, title: '' };
      if (/\.json$/i.test(inputPath)) {
        const parsed = JSON.parse(raw);
        source = { text: String(parsed.text || parsed.content || ''), title: String(parsed.title || '') };
      }
      if (!source.text.trim()) throw new Error('Metadata input text is empty');
      context.onProgress?.(20, 'model_loading');
      const summarizeOnly = job.task === PROCESSING_TASKS.DOCUMENT_SUMMARIZE;
      const system = summarizeOnly
        ? 'Verilen metni Türkçe, nesnel ve metinde olmayan bilgi eklemeden özetle. Yalnızca {"summary":"..."} JSON nesnesi döndür.'
        : 'Bir arşiv varlığı için Türkçe ve nesnel metadata üret. Metinde olmayan bilgi ekleme. En fazla 8 kısa etiket kullan. Yalnızca {"summary":"...","keywords":["..."]} JSON nesnesi döndür.';
      const payload = await callOllama(`Başlık: ${source.title}\n\nİçerik:\n${source.text}`, { fetchImpl: options.fetchImpl, baseUrl: options.ollamaBaseUrl, keepAlive: options.ollamaKeepAlive, model, system, signal: context.signal, numPredict: summarizeOnly ? 600 : 900 });
      context.onProgress?.(90, 'writing_output');
      const normalized = summarizeOnly
        ? { summary: String(payload.summary || payload.ozet || '').trim() }
        : { summary: String(payload.summary || payload.ozet || '').trim(), keywords: (Array.isArray(payload.keywords) ? payload.keywords : payload.etiketler || []).map((item) => String(item).trim()).filter(Boolean).slice(0, 8) };
      fs.writeFileSync(outputPath, JSON.stringify(normalized));
      return { output: job.output, result: { model, backend: catalogEntry.provider || 'ollama', ...normalized } };
    }
    if ([PROCESSING_TASKS.VIDEO_OCR, PROCESSING_TASKS.PHOTO_OCR].includes(job.task)) {
      let framesDir = inputPath;
      let temporaryFramesDir = '';
      if (job.task === PROCESSING_TASKS.VIDEO_OCR) {
        if (!fs.statSync(inputPath).isDirectory()) throw new Error('Video OCR input must be a frame directory');
      } else {
        if (!fs.statSync(inputPath).isFile()) throw new Error('Photo OCR input must be an image file');
        temporaryFramesDir = fs.mkdtempSync(path.join(path.dirname(outputPath), '.photo-ocr-'));
        fs.copyFileSync(inputPath, path.join(temporaryFramesDir, 'frame-000001.jpg'));
        framesDir = temporaryFramesDir;
      }
      const script = path.join(scriptsDir, 'video_ocr_paddle.py');
      const lang = String(job.options.lang || 'eng+tur').trim();
      try {
        const run = await runner('python3', [script, '--frames-dir', framesDir, '--lang', lang], {
          signal: context.signal,
          onProgress: context.onProgress,
          env: { ...(options.env || {}), MAM_MODEL_CACHE_DIR: catalogEntry.path }
        });
        let payload;
        try { payload = JSON.parse(String(run?.stdout || '{}')); }
        catch (_error) { throw new Error('PaddleOCR output is not valid JSON'); }
        fs.writeFileSync(outputPath, JSON.stringify(payload));
        return { output: job.output, result: { model, backend: 'paddleocr', frameCount: Array.isArray(payload.items) ? payload.items.length : 0 } };
      } finally {
        if (temporaryFramesDir) fs.rmSync(temporaryFramesDir, { recursive: true, force: true });
      }
    }
    if (job.task === PROCESSING_TASKS.SUBTITLE_TRANSLATE) {
      const script = path.join(scriptsDir, 'translate_subtitle_marian.py');
      const batchSize = Math.max(1, Math.min(64, Number(job.options.batchSize) || 16));
      const args = [script, '--input', inputPath, '--output', outputPath, '--model-dir', catalogEntry.path, '--model-name', model, '--batch-size', String(batchSize)];
      await runner('python3', args, { signal: context.signal, onProgress: context.onProgress, env: options.env });
      const content = fs.readFileSync(outputPath, 'utf8');
      return { output: job.output, result: { model, backend: 'marian', cueCount: (content.match(/-->/g) || []).length } };
    }
    const backend = String(job.options.backend || 'whisper').trim().toLowerCase() === 'whisperx' ? 'whisperx' : 'whisper';
    const script = path.join(scriptsDir, backend === 'whisperx' ? 'transcribe_whisperx.py' : 'transcribe_whisper.py');
    const args = [script, '--input', inputPath, '--output', outputPath, '--model', model];
    const lang = String(job.options.lang || '').trim(); if (lang) args.push('--lang', lang);
    await runner('python3', args, { signal: context.signal, onProgress: context.onProgress, env: options.env });
    const content = fs.readFileSync(outputPath, 'utf8');
    return { output: job.output, result: { model, backend, cueCount: (content.match(/-->/g) || []).length } };
  };
}

module.exports = { callOllama, createAiWorkerExecutor, parseJsonObject, runProcess };
