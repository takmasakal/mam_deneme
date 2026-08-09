const fs = require('fs');
const os = require('os');
const path = require('path');

const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, '');
const OLLAMA_METADATA_MODEL = String(process.env.OLLAMA_METADATA_MODEL || 'gemma3:4b').trim() || 'gemma3:4b';
const OLLAMA_METADATA_TIMEOUT_MS = Math.max(30_000, Number(process.env.OLLAMA_METADATA_TIMEOUT_MS) || 10 * 60 * 1000);
// Keep chunks below the model context limit while avoiding one model call per
// short page. The previous 12k size made long PDFs needlessly serial.
const DOCUMENT_CHUNK_SIZE = 24_000;
const DOCUMENT_CHUNK_OVERLAP = 800;
const OLLAMA_METADATA_KEEP_ALIVE = String(process.env.OLLAMA_METADATA_KEEP_ALIVE || '10m').trim() || '10m';

const STOP_WORDS = new Set([
  'acaba', 'ama', 'ancak', 'artık', 'asla', 'aslında', 'az', 'bana', 'bazen', 'bazı',
  'belki', 'ben', 'bende', 'beni', 'benim', 'beri', 'beş', 'bile', 'bir', 'biraz',
  'birçok', 'biri', 'birkaç', 'biz', 'bize', 'bizi', 'bizim', 'bu', 'buna', 'bunda',
  'bundan', 'bunlar', 'bunu', 'bunun', 'çok', 'çünkü', 'da', 'daha', 'de', 'değil',
  'diye', 'en', 'gibi', 'hem', 'hep', 'hepsi', 'her', 'hiç', 'için', 'ile', 'ise',
  'adlı', 'arasında', 'birlikte', 'büyük', 'evet', 'hemen', 'hiçbir', 'içinde',
  'işte', 'kadar', 'karakterin', 'karakterlerin', 'karısının', 'karşı', 'kez', 'ki', 'kim',
  'mı', 'mi', 'mu', 'mü', 'nasıl', 'ne',
  'neden', 'nerede', 'o', 'olan', 'olarak', 'oldu', 'olmak', 'olması', 'olup',
  'onlar', 'onu', 'ona', 'onun', 'önce', 'öyle', 'pek', 'sadece', 'şekilde', 'şey',
  'şeyi', 'şeyler', 'şimdi', 'son', 'sonra', 'şu', 'tam', 'tüm', 'bütün', 've',
  'veya', 'ya', 'yalnızca', 'yani', 'yine', 'yola', 'zaman', 'zaten', 'böyle',
  'gerçek', 'gün', 'iki', 'üç', 'dört',
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'will',
  'have', 'has', 'had', 'not', 'but', 'can', 'could', 'into', 'about', 'than', 'then',
  'there', 'their', 'they', 'them', 'you', 'your', 'our', 'out', 'all', 'also'
]);

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00AD\s*/g, '')
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/(\p{L})\s*\n\s*(\p{Ll})/gu, '$1 $2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeKeyword(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .trim();
}

function tokenize(value) {
  return normalizeText(value).match(/[\p{L}\p{N}_'’-]{2,}/gu) || [];
}

function meaningfulToken(value) {
  const normalized = normalizeKeyword(value);
  return normalized.length >= 3 && !STOP_WORDS.has(normalized) && !/^\d+$/.test(normalized);
}

function likelyPhraseToken(value) {
  const normalized = normalizeKeyword(value);
  if (!meaningfulToken(normalized)) return false;
  return !/(?:ıyor|iyor|uyor|üyor|mış|miş|muş|müş|acak|ecek|arak|erek|ınca|ince|ip|ıp|up|üp|mak|mek|makla|mekle|dığı|diği|duğu|düğü|tığını|tiğini|tuğunu|tüğünü|masıyla|mesiyle|sıyla|siyle|ca|ce|yan|yen)$/u.test(normalized);
}

function extractKeywords(text, limit = 12, options = {}) {
  const normalizedText = normalizeText(text);
  const title = normalizeText(options?.title || '');
  const words = tokenize(normalizedText);
  const counts = new Map();
  words.forEach((word) => {
    const key = normalizeKeyword(word);
    if (!meaningfulToken(key)) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const candidates = new Map();
  const addCandidate = (label, score, kind) => {
    const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
    const key = cleanLabel.split(/\s+/).map(normalizeKeyword).filter(Boolean).join(' ');
    if (!key || key.split(' ').some((part) => !meaningfulToken(part))) return;
    const existing = candidates.get(key);
    if (!existing || score > existing.score) candidates.set(key, { label: cleanLabel, score, kind });
  };

  const properPhrases = normalizedText.match(/\b[\p{Lu}ÇĞİÖŞÜ][\p{L}'’.-]+(?:\s+[\p{Lu}ÇĞİÖŞÜ][\p{L}'’.-]+){1,3}/gu) || [];
  properPhrases.forEach((phrase) => {
    addCandidate(phrase, 12 + phrase.split(/\s+/).length * 2, 'proper');
    if (title) {
      const phraseParts = phrase.split(/\s+/);
      const titleParts = title.split(/\s+/);
      const normalizedPhraseParts = phraseParts.map(normalizeKeyword);
      const normalizedTitleParts = titleParts.map(normalizeKeyword);
      const titleStart = normalizedPhraseParts.findIndex((part, index) => (
        normalizedTitleParts.every((titlePart, offset) => normalizedPhraseParts[index + offset] === titlePart)
      ));
      if (titleStart >= 2) {
        addCandidate(phraseParts.slice(0, titleStart).join(' '), 16, 'proper');
      }
    }
  });

  if (title) {
    const titleTokens = tokenize(title);
    const meaningfulTitle = titleTokens.filter(meaningfulToken);
    if (meaningfulTitle.length) addCandidate(meaningfulTitle.join(' '), 30, 'title');
    meaningfulTitle.forEach((token) => addCandidate(token, 9 + (counts.get(normalizeKeyword(token)) || 0), 'title'));

    const titlePosition = normalizedText
      .toLocaleLowerCase('tr-TR')
      .indexOf(title.toLocaleLowerCase('tr-TR'), title.length);
    if (titlePosition > 0) {
      const prefixTokens = tokenize(normalizedText.slice(Math.max(0, titlePosition - 100), titlePosition)).slice(-2);
      if (prefixTokens.length === 2 && prefixTokens.every((token) => /^\p{Lu}/u.test(token))) {
        addCandidate(prefixTokens.join(' '), 24, 'proper');
      }
    }
  }

  const phraseSources = normalizedText.split(/(?<=[.!?;:])\s+|\n+/u);
  phraseSources.forEach((source) => {
    const tokenRows = tokenize(source).map((word) => ({ label: word, key: normalizeKeyword(word) }));
    for (const size of [2, 3]) {
      for (let i = 0; i <= tokenRows.length - size; i += 1) {
        const phraseRows = tokenRows.slice(i, i + size);
        if (!phraseRows.every((item) => likelyPhraseToken(item.key))) continue;
        const phraseKey = phraseRows.map((item) => item.key).join(' ');
        const phraseCount = normalizedText.toLocaleLowerCase('tr-TR').split(phraseKey).length - 1;
        if (phraseCount >= 2 || normalizedText.length <= 3000) {
          const lengthScore = Math.min(3, phraseRows.reduce((sum, item) => sum + item.key.length, 0) / 12);
          addCandidate(
            phraseRows.map((item) => item.label).join(' '),
            7 + (size === 2 ? 2 : 0) + phraseCount * 2 + lengthScore,
            'phrase'
          );
        }
      }
    }
  });

  counts.forEach((count, key) => {
    if (count < 2) return;
    addCandidate(key, count * 2 + Math.min(3, key.length / 6), 'term');
  });

  const selected = [];
  const selectedKeys = [];
  const selectedParts = new Set();
  Array.from(candidates.values())
    .sort((a, b) => b.score - a.score || b.label.length - a.label.length || a.label.localeCompare(b.label, 'tr'))
    .forEach((candidate) => {
      if (selected.length >= Math.max(1, Number(limit) || 12)) return;
      const parts = candidate.label.split(/\s+/).map(normalizeKeyword);
      const candidateKey = parts.join(' ');
      if (selectedKeys.some((key) => key.includes(candidateKey) || candidateKey.includes(key))) return;
      if (candidate.kind === 'term' && parts.every((part) => selectedParts.has(part))) return;
      selected.push(candidate.label);
      selectedKeys.push(candidateKey);
      parts.forEach((part) => selectedParts.add(part));
    });
  return selected;
}

function summarizeText(text, maxSentences = 3, maxLength = 1400) {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 35 && /[.!?]$/.test(item));
  if (!sentences.length) return '';

  const frequency = new Map();
  tokenize(normalized).forEach((token) => {
    const key = normalizeKeyword(token);
    if (!meaningfulToken(key)) return;
    frequency.set(key, (frequency.get(key) || 0) + 1);
  });
  const keywords = new Set(
    Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 40)
      .map(([key]) => key)
  );
  const ranked = sentences.map((sentence, index) => {
    const tokens = tokenize(sentence);
    const keywordHits = tokens.reduce((sum, token) => sum + (keywords.has(normalizeKeyword(token)) ? 1 : 0), 0);
    const positionBonus = index < 5 ? (5 - index) * 0.12 : 0;
    return { sentence, index, score: keywordHits / Math.max(4, tokens.length) + positionBonus };
  });
  const rankedCandidates = ranked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Number(maxSentences) || 6));
  const selected = [];
  let totalLength = 0;
  rankedCandidates.forEach((item) => {
    const nextLength = totalLength + item.sentence.length + (selected.length ? 1 : 0);
    if (nextLength > maxLength && selected.length >= 3) return;
    selected.push(item);
    totalLength = nextLength;
  });
  return selected
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(' ')
    .trim();
}

function parseModelJson(content) {
  const raw = String(content || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (!raw) throw new Error('Ollama returned an empty response');

  const candidates = [raw];
  const start = raw.indexOf('{');
  if (start >= 0 && start !== 0) candidates.push(raw.slice(start));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // Try the next candidate after removing surrounding model prose.
    }
  }

  // Find the first balanced JSON object without relying on a greedy regex.
  // Greedy extraction can include a second object or trailing model text.
  const objectStart = raw.indexOf('{');
  if (objectStart >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = objectStart; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const balanced = raw.slice(objectStart, index + 1);
          try {
            return JSON.parse(balanced);
          } catch (_error) {
            break;
          }
        }
      }
    }
  }
  throw new Error('Ollama response did not contain valid JSON');
}

function splitDocumentText(text, chunkSize = DOCUMENT_CHUNK_SIZE, overlap = DOCUMENT_CHUNK_OVERLAP) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end);
      const sentenceBreak = normalized.lastIndexOf('. ', end);
      if (paragraphBreak > start + Math.floor(chunkSize * 0.6)) end = paragraphBreak + 2;
      else if (sentenceBreak > start + Math.floor(chunkSize * 0.6)) end = sentenceBreak + 2;
    }
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function callOllamaJson(messages, options = {}) {
  const format = options.schema || 'json';
  const externalSignal = options.signal;
  let lastParseError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_METADATA_TIMEOUT_MS);
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_METADATA_MODEL,
          messages: attempt === 0
            ? messages
            : [
              ...messages,
              {
                role: 'user',
                content: 'Önceki yanıt geçersiz JSON oldu. Yalnızca şemaya uyan, kısa ve eksiksiz JSON döndür; açıklama, markdown veya kod bloğu ekleme.'
              }
            ],
          format,
          stream: false,
          keep_alive: OLLAMA_METADATA_KEEP_ALIVE,
          options: {
            num_ctx: 8192,
            num_predict: Math.min(Number(options.numPredict) || 900, attempt ? 500 : 900),
            temperature: 0,
            repeat_penalty: 1.15
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || `Ollama HTTP ${response.status}`).slice(0, 700));
      }
      try {
        return parseModelJson(payload?.message?.content);
      } catch (error) {
        const doneReason = String(payload?.done_reason || 'unknown');
        const responseLength = String(payload?.message?.content || '').length;
        lastParseError = new Error(`${error.message} (responseLength=${responseLength}, doneReason=${doneReason})`);
        if (attempt === 0) continue;
      }
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', abortFromExternal);
    }
  }
  throw lastParseError || new Error('Ollama response did not contain valid JSON');
}

const DOCUMENT_SUMMARY_SYSTEM_PROMPT = `
Sen profesyonel bir arşiv asistanısın. Verilen belge parçasını yalnızca Türkçe ve nesnel biçimde özetle.
Metinde olmayan bilgi, isim veya sonuç uydurma. Özel isimleri değiştirme. Özeti en fazla 500 karakterde tut.
Yanıtı yalnızca tek satırdaki şu JSON biçiminde ver; başka alan, açıklama veya markdown ekleme:
{"ozet":"Türkçe özet"}
`;

const DOCUMENT_METADATA_SYSTEM_PROMPT = `
Sen profesyonel bir arşiv asistanısın. Belgeyi Türkçe ve nesnel biçimde analiz et.
Özet, teknik/akademik belgelerde ana fikri ve kapsamı; edebi belgelerde olayın başlangıç çerçevesini spoiler vermeden açıklasın.
Metinde olmayan bilgi uydurma. Özeti en fazla 1200 karakterde tut. En fazla 6 kısa Türkçe etiket üret; etiketler tek kelime veya en fazla 3 kelimelik ifade olsun.
Yanıtı yalnızca şu JSON biçiminde ver:
{"ozet":"Türkçe özet","etiketler":["etiket1","etiket2"]}
`;

const DOCUMENT_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  properties: { ozet: { type: 'string', maxLength: 500 } },
  required: ['ozet'],
  additionalProperties: false
};

const DOCUMENT_METADATA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ozet: { type: 'string', maxLength: 1200 },
    etiketler: { type: 'array', items: { type: 'string' }, maxItems: 6 }
  },
  required: ['ozet', 'etiketler'],
  additionalProperties: false
};

function subtitleTextFromVtt(content) {
  return normalizeText(
    String(content || '')
      .replace(/^\uFEFF?WEBVTT[^\n]*\n+/i, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}.*$/gm, '')
      .replace(/<[^>]+>/g, ' ')
  );
}

function mergeUniqueStrings(...lists) {
  const result = [];
  const seen = new Set();
  lists.flat().forEach((value) => {
    const text = String(value || '').trim();
    const key = normalizeKeyword(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

function createMetadataEnrichmentService(deps) {
  const {
    pool,
    nanoid,
    runCommandCapture,
    buildArtifactPath,
    publicUploadUrlToAbsolutePath,
    extractPreviewContentFromFile,
    extractVideoOcrFrameTextPaddle,
    queueSubtitleGenerationJob,
    subtitleJobs,
    upsertMediaProcessingJobSafe,
    indexAssetToElastic,
    getMediaJobConcurrencyLimit
  } = deps;

  const queue = [];
  const activeJobs = new Map();
  let draining = false;

  function resolveSourcePath(row) {
    const sourcePath = String(row?.source_path || '').trim();
    if (sourcePath && fs.existsSync(sourcePath)) return sourcePath;
    const mediaPath = publicUploadUrlToAbsolutePath(String(row?.media_url || ''));
    if (mediaPath && fs.existsSync(mediaPath)) return mediaPath;
    return '';
  }

  function assetFamily(row) {
    const type = String(row?.type || '').trim().toLowerCase();
    const mime = String(row?.mime_type || row?.mimeType || '').trim().toLowerCase();
    if (type === 'video' || mime.startsWith('video/')) return 'video';
    if (type === 'photo' || type === 'image' || mime.startsWith('image/')) return 'image';
    if (type === 'document' || mime.includes('pdf') || mime.includes('word') || mime.startsWith('text/')) return 'document';
    return 'other';
  }

  async function persistJob(job, resultPayload = {}) {
    const now = new Date().toISOString();
    await upsertMediaProcessingJobSafe({
      jobId: job.jobId,
      assetId: job.assetId,
      jobType: 'metadata_enrichment',
      status: job.status,
      requestPayload: { source: 'upload', family: job.family },
      resultPayload: { ...resultPayload, progressPhase: String(job.progressPhase || '') },
      errorText: job.error || '',
      progress: Math.max(0, Math.min(100, Number(job.progress) || 0)),
      createdAt: job.createdAt,
      updatedAt: now,
      startedAt: job.startedAt || '',
      finishedAt: job.finishedAt || ''
    });
  }

  async function updateJobProgress(job, progress, progressPhase) {
    job.progress = Math.max(Number(job.progress || 0), Math.min(99, Math.round(Number(progress) || 0)));
    job.progressPhase = String(progressPhase || '').trim();
    await persistJob(job);
  }

  async function runOcrForFrames(workDir, files) {
    if (!files.length) return { text: '', frameEntries: [], warning: '' };
    try {
      const result = await extractVideoOcrFrameTextPaddle({
        workDir,
        files,
        intervalSec: 1,
        ocrLang: 'tur+eng'
      });
      const frameEntries = Array.isArray(result?.frameEntries) ? result.frameEntries : [];
      return {
        text: normalizeText(frameEntries.map((item) => item.text).filter(Boolean).join('\n')),
        frameEntries,
        warning: ''
      };
    } catch (error) {
      return {
        text: '',
        frameEntries: [],
        warning: String(error?.message || 'OCR failed').slice(0, 700)
      };
    }
  }

  async function enrichDocument(row, sourcePath, job) {
    const preview = await extractPreviewContentFromFile(row, sourcePath);
    const text = normalizeText(preview?.text || '');
    if (!text) throw new Error('No extractable text found in document');
    const chunks = splitDocumentText(text);
    const chunkSummaries = [];
    const warnings = [];
    await updateJobProgress(job, 20, 'summarizing_document');
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      let summary = '';
      try {
        const result = await callOllamaJson([
          { role: 'system', content: DOCUMENT_SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Belge parçası:\n\n${chunk}` }
        ], {
          numPredict: 384,
          schema: DOCUMENT_SUMMARY_JSON_SCHEMA,
          signal: job.abortController?.signal
        });
        summary = normalizeText(result?.ozet || '');
      } catch (error) {
        if (job.abortController?.signal?.aborted) throw error;
        warnings.push(`Gemma parça özeti kullanılamadı: ${String(error?.message || 'geçersiz JSON').slice(0, 260)}`);
        summary = summarizeText(chunk, 3, 900);
      }
      if (summary) chunkSummaries.push(summary);
      await updateJobProgress(job, 20 + (((chunkIndex + 1) / Math.max(1, chunks.length)) * 55), 'summarizing_document');
    }
    const synthesisInput = chunkSummaries.join('\n\n');
    let final = null;
    await updateJobProgress(job, 80, 'generating_metadata');
    try {
      final = await callOllamaJson([
        { role: 'system', content: DOCUMENT_METADATA_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Belge başlığı: ${String(row.title || row.file_name || '').trim()}\n\nBelge parça özetleri:\n${synthesisInput}`
        }
      ], {
        numPredict: 700,
        schema: DOCUMENT_METADATA_JSON_SCHEMA,
        signal: job.abortController?.signal
      });
    } catch (error) {
      if (job.abortController?.signal?.aborted) throw error;
      warnings.push(`Gemma metadata özeti kullanılamadı: ${String(error?.message || 'geçersiz JSON').slice(0, 260)}`);
      final = {
        ozet: summarizeText(text, 3, 1200),
        etiketler: extractKeywords(text, 6, { title: row.title })
      };
    }
    const keywords = mergeUniqueStrings(
      Array.isArray(final?.etiketler) ? final.etiketler : []
    ).slice(0, 6);
    return {
      summary: normalizeText(final?.ozet || ''),
      keywords,
      extractedTextLength: text.length,
      model: OLLAMA_METADATA_MODEL,
      chunkCount: chunks.length,
      warning: warnings.join(' | ')
    };
  }

  async function enrichImage(row, sourcePath) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-image-metadata-'));
    try {
      const frameName = 'scene-000001.jpg';
      const framePath = path.join(workDir, frameName);
      const converted = await runCommandCapture('ffmpeg', [
        '-y',
        '-i', sourcePath,
        '-frames:v', '1',
        '-vf', 'scale=min(1600\\,iw):-2',
        framePath
      ]);
      if (!converted.ok || !fs.existsSync(framePath)) {
        throw new Error(String(converted.stderr || 'Image conversion failed').slice(-700));
      }
      const ocr = await runOcrForFrames(workDir, [frameName]);
      return {
        summary: summarizeText(ocr.text, 3, 600),
        keywords: extractKeywords(ocr.text, 8, { title: row.title }),
        ocrText: ocr.text,
        warning: ocr.warning
      };
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  async function extractSceneFrames(row, sourcePath) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-video-metadata-'));
    const outputPattern = path.join(workDir, 'scene-%06d.jpg');
    const extracted = await runCommandCapture('ffmpeg', [
      '-y',
      '-i', sourcePath,
      '-vf', "select='gt(scene,0.32)',scale=min(960\\,iw):-2",
      '-vsync', 'vfr',
      '-frames:v', '10',
      outputPattern
    ]);
    let files = fs.readdirSync(workDir).filter((name) => /^scene-\d+\.jpg$/i.test(name)).sort().slice(0, 10);
    if (!files.length) {
      const fallbackName = 'scene-000001.jpg';
      const fallback = await runCommandCapture('ffmpeg', [
        '-y',
        '-ss', '1',
        '-i', sourcePath,
        '-frames:v', '1',
        '-vf', 'scale=min(960\\,iw):-2',
        path.join(workDir, fallbackName)
      ]);
      if (fallback.ok && fs.existsSync(path.join(workDir, fallbackName))) files = [fallbackName];
    }
    if (!files.length) {
      fs.rmSync(workDir, { recursive: true, force: true });
      throw new Error(String(extracted.stderr || 'Scene frame extraction failed').slice(-700));
    }

    const keyframes = [];
    files.forEach((fileName, index) => {
      const storedName = `${Date.now()}-${nanoid()}-keyframe-${String(index + 1).padStart(2, '0')}.jpg`;
      const target = buildArtifactPath('attachments', storedName, row.created_at);
      fs.copyFileSync(path.join(workDir, fileName), target.absolutePath);
      keyframes.push(target.publicUrl);
    });
    return { workDir, files, keyframes };
  }

  function waitForSubtitle(jobId, timeoutMs = 2 * 60 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const job = subtitleJobs.get(jobId);
        if (job?.status === 'completed') {
          clearInterval(timer);
          resolve(job);
          return;
        }
        if (job?.status === 'failed') {
          clearInterval(timer);
          reject(new Error(job.error || 'Subtitle generation failed'));
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Subtitle generation timed out'));
        }
      }, 1000);
    });
  }

  async function enrichVideo(row, sourcePath) {
    const scenes = await extractSceneFrames(row, sourcePath);
    try {
      const frameOcr = await runOcrForFrames(scenes.workDir, scenes.files);
      const subtitleLanguage = String(row?.dc_metadata?.language || 'tr').trim().toLowerCase() || 'tr';
      let subtitleUrl = '';
      let transcript = '';
      let subtitleWarning = '';
      try {
        const subtitleJob = queueSubtitleGenerationJob(row, {
          lang: subtitleLanguage,
          label: 'auto-metadata-whisper',
          subtitleBackend: 'whisper'
        });
        const completedSubtitle = await waitForSubtitle(subtitleJob.jobId);
        subtitleUrl = String(completedSubtitle?.subtitleUrl || '').trim();
        const subtitlePath = publicUploadUrlToAbsolutePath(subtitleUrl);
        transcript = subtitlePath && fs.existsSync(subtitlePath)
          ? subtitleTextFromVtt(fs.readFileSync(subtitlePath, 'utf8'))
          : '';
      } catch (error) {
        subtitleWarning = String(error?.message || 'Subtitle generation failed').slice(0, 700);
      }
      const searchableText = normalizeText([transcript, frameOcr.text].filter(Boolean).join('\n'));
      const summary = summarizeText(transcript || searchableText);
      return {
        summary,
        keywords: extractKeywords(`${row.title || ''}. ${summary}\n${frameOcr.text}`, 8, { title: row.title }),
        subtitleUrl,
        transcriptLength: transcript.length,
        keyframes: scenes.keyframes,
        frameOcrText: frameOcr.text,
        warning: [frameOcr.warning, subtitleWarning].filter(Boolean).join(' | ')
      };
    } catch (error) {
      scenes.keyframes.forEach((publicUrl) => {
        const absolutePath = publicUploadUrlToAbsolutePath(publicUrl);
        try {
          if (absolutePath && fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        } catch (_cleanupError) {}
      });
      throw error;
    } finally {
      fs.rmSync(scenes.workDir, { recursive: true, force: true });
    }
  }

  async function saveMetadata(row, generated, job) {
    const existingDc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const existingTags = Array.isArray(row?.tags) ? row.tags : [];
    const previousAutoMetadata = existingDc.autoMetadata && typeof existingDc.autoMetadata === 'object'
      ? existingDc.autoMetadata
      : {};
    const previousKeywords = new Set(
      (Array.isArray(previousAutoMetadata.keywords) ? previousAutoMetadata.keywords : [])
        .map(normalizeKeyword)
        .filter(Boolean)
    );
    const manualTags = existingTags.filter((tag) => !previousKeywords.has(normalizeKeyword(tag)));
    const keywords = mergeUniqueStrings(manualTags, generated.keywords || []);
    const summary = String(generated.summary || '').trim();
    const existingDescription = String(row?.description || '').trim();
    const previousSummary = String(previousAutoMetadata.summary || '').trim();
    const nextDescription = !existingDescription || existingDescription === previousSummary
      ? summary
      : existingDescription;
    const nextDc = {
      ...existingDc,
      subject: String(existingDc.subject || '').trim() || keywords.join(', '),
      description: String(existingDc.description || '').trim() || summary,
      autoMetadata: {
        status: 'completed',
        jobId: job.jobId,
        generatedAt: new Date().toISOString(),
        family: job.family,
        ...generated,
        keywords
      }
    };
    const updated = await pool.query(
      `
        UPDATE assets
        SET tags = $2::text[],
            description = $3,
            dc_metadata = $4::jsonb,
            updated_at = $5
        WHERE id = $1
        RETURNING *
      `,
      [row.id, keywords, nextDescription, JSON.stringify(nextDc), new Date().toISOString()]
    );
    if (updated.rowCount) {
      await indexAssetToElastic(updated.rows[0]).catch(() => {});
      return updated.rows[0];
    }
    return row;
  }

  async function processJob(job) {
    if (job.cancelled) return;
    job.status = 'running';
    job.progress = 10;
    job.progressPhase = 'loading_asset';
    job.startedAt = new Date().toISOString();
    job.abortController = new AbortController();
    activeJobs.set(job.jobId, job);
    await persistJob(job);
    try {
      const result = await pool.query('SELECT * FROM assets WHERE id = $1 LIMIT 1', [job.assetId]);
      const row = result.rows[0];
      if (!row) throw new Error('Asset not found');
      const sourcePath = resolveSourcePath(row);
      if (!sourcePath) throw new Error('Source file not found');

      let generated = {};
      if (job.family === 'video') generated = await enrichVideo(row, sourcePath);
      else if (job.family === 'image') generated = await enrichImage(row, sourcePath);
      else if (job.family === 'document') generated = await enrichDocument(row, sourcePath, job);
      else generated = { summary: '', keywords: [], warning: 'Metadata extraction is not supported for this asset type.' };

      if (job.cancelled || job.abortController?.signal?.aborted) throw new Error('Metadata job cancelled');
      await updateJobProgress(job, 92, 'saving_metadata');
      const latest = await pool.query('SELECT * FROM assets WHERE id = $1 LIMIT 1', [job.assetId]);
      await saveMetadata(latest.rows[0] || row, generated, job);
      job.status = 'completed';
      job.progress = 100;
      job.progressPhase = 'completed';
      job.finishedAt = new Date().toISOString();
      await persistJob(job, generated);
    } catch (error) {
      const cancelled = job.cancelled || job.abortController?.signal?.aborted;
      job.status = cancelled ? 'cancelled' : 'failed';
      job.progressPhase = cancelled ? 'cancelled' : 'failed';
      job.error = cancelled ? 'Cancelled by administrator' : String(error?.message || 'Metadata generation failed').slice(0, 1200);
      job.finishedAt = new Date().toISOString();
      await persistJob(job);
    } finally {
      activeJobs.delete(job.jobId);
      delete job.abortController;
      setImmediate(drainQueue);
    }
  }

  async function drainQueue() {
    if (draining) return;
    draining = true;
    try {
      const limit = typeof getMediaJobConcurrencyLimit === 'function'
        ? await getMediaJobConcurrencyLimit('metadata_enrichment')
        : 1;
      while (queue.length && activeJobs.size < limit) {
        const job = queue.shift();
        processJob(job).catch((error) => {
          console.error(`Metadata job failed for ${job?.jobId || ''}: ${error?.message || error}`);
        });
      }
    } finally {
      draining = false;
    }
  }

  function queueAsset(asset) {
    const assetId = String(asset?.id || asset || '').trim();
    if (!assetId) return null;
    const family = assetFamily(asset);
    if (family !== 'document') return null;
    const now = new Date().toISOString();
    const job = {
      jobId: nanoid(),
      assetId,
      family,
      status: 'queued',
      progress: 5,
      progressPhase: 'queued',
      error: '',
      createdAt: now,
      startedAt: '',
      finishedAt: ''
    };
    queue.push(job);
    persistJob(job).finally(() => {
      setImmediate(drainQueue);
    });
    return { ...job };
  }

  async function cancelJob(jobId) {
    const target = String(jobId || '').trim();
    if (!target) return false;
    const queuedIndex = queue.findIndex((job) => job.jobId === target);
    const job = queuedIndex >= 0 ? queue.splice(queuedIndex, 1)[0] : activeJobs.get(target);
    if (!job) return false;
    job.cancelled = true;
    job.status = 'cancelled';
    job.progressPhase = 'cancelled';
    job.error = 'Cancelled by administrator';
    job.finishedAt = new Date().toISOString();
    job.abortController?.abort();
    await persistJob(job);
    return true;
  }

  return {
    queueAsset,
    cancelJob,
    getQueueLength: () => queue.length,
    isRunning: () => activeJobs.size > 0,
    hasJob: (jobId) => {
      const target = String(jobId || '').trim();
      return activeJobs.has(target) || queue.some((job) => job.jobId === target);
    }
  };
}

module.exports = {
  createMetadataEnrichmentService,
  extractKeywords,
  summarizeText,
  subtitleTextFromVtt
};
