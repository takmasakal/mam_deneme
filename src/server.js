const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { nanoid } = require('nanoid');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const PROXIES_DIR = path.join(UPLOADS_DIR, 'proxies');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const SUBTITLES_DIR = path.join(UPLOADS_DIR, 'subtitles');
const OCR_DIR = path.join(UPLOADS_DIR, 'ocr');
const OCR_FRAMES_DIR = path.join(OCR_DIR, '_frames');
const PADDLE_CACHE_DIR = process.env.PADDLE_PDX_CACHE_HOME || path.join(UPLOADS_DIR, '.paddlex');
const ALLOW_PADDLE_OCR_FALLBACK = String(process.env.PADDLE_OCR_ALLOW_FALLBACK || 'false').trim().toLowerCase() === 'true';
const proxyJobs = new Map();
const subtitleJobs = new Map();
const videoOcrJobs = new Map();

app.use(express.json({ limit: '300mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const WORKFLOW = ['Ingested', 'QC', 'Approved', 'Published', 'Archived'];
const DEFAULT_ADMIN_SETTINGS = {
  workflowTrackingEnabled: true,
  autoProxyBackfillOnUpload: false,
  playerUiMode: 'native',
  apiTokenEnabled: false,
  apiToken: '',
  oidcBearerEnabled: false,
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL || 'http://keycloak:8080/realms/mam',
  oidcJwksUrl: process.env.OIDC_JWKS_URL || 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
  oidcAudience: process.env.OIDC_AUDIENCE || ''
};

function normalizePlayerUiMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'custom' || mode === 'videojs' || mode === 'vidstack' || mode === 'mpegdash') return mode;
  return 'native';
}
const DEFAULT_USER_PERMISSIONS = {};
const ELASTIC_URL = process.env.ELASTIC_URL || 'http://localhost:9200';
const ELASTIC_INDEX = process.env.ELASTIC_INDEX || 'mam_assets';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small';
const OIDC_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const oidcJwksCache = new Map();
const pdfOcrCache = new Map();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PROXIES_DIR)) {
  fs.mkdirSync(PROXIES_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBNAILS_DIR)) {
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
}
if (!fs.existsSync(SUBTITLES_DIR)) {
  fs.mkdirSync(SUBTITLES_DIR, { recursive: true });
}
if (!fs.existsSync(OCR_DIR)) {
  fs.mkdirSync(OCR_DIR, { recursive: true });
}
if (!fs.existsSync(OCR_FRAMES_DIR)) {
  fs.mkdirSync(OCR_FRAMES_DIR, { recursive: true });
}
if (!fs.existsSync(PADDLE_CACHE_DIR)) {
  fs.mkdirSync(PADDLE_CACHE_DIR, { recursive: true });
}

function escapeElasticId(value) {
  return encodeURIComponent(String(value || '').trim());
}

async function elasticRequest(method, endpoint, body) {
  try {
    const response = await fetch(`${ELASTIC_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch (_error) {
    return { ok: false, status: 0, payload: {} };
  }
}

async function ensureElasticIndex() {
  const exists = await elasticRequest('HEAD', `/${ELASTIC_INDEX}`);
  if (exists.ok) return true;

  const create = await elasticRequest('PUT', `/${ELASTIC_INDEX}`, {
    mappings: {
      properties: {
        id: { type: 'keyword' },
        title: { type: 'text' },
        description: { type: 'text' },
        owner: { type: 'text' },
        type: { type: 'keyword' },
        status: { type: 'keyword' },
        tags: { type: 'text' },
        dc: { type: 'text' },
        clips: { type: 'text' },
        inTrash: { type: 'boolean' }
      }
    }
  });
  return create.ok;
}

async function buildAssetSearchDoc(assetId) {
  const [assetResult, cutsResult] = await Promise.all([
    pool.query('SELECT * FROM assets WHERE id = $1', [assetId]),
    pool.query('SELECT label FROM asset_cuts WHERE asset_id = $1 ORDER BY created_at DESC', [assetId])
  ]);
  if (!assetResult.rowCount) return null;
  const row = assetResult.rows[0];
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    owner: row.owner || '',
    type: row.type || '',
    status: row.status || '',
    tags: Array.isArray(row.tags) ? row.tags.join(' ') : '',
    dc: JSON.stringify(row.dc_metadata || {}),
    clips: cutsResult.rows.map((r) => String(r.label || '')).join(' '),
    inTrash: Boolean(row.deleted_at)
  };
}

async function indexAssetToElastic(assetId) {
  const doc = await buildAssetSearchDoc(assetId);
  if (!doc) return;
  await ensureElasticIndex();
  await elasticRequest('PUT', `/${ELASTIC_INDEX}/_doc/${escapeElasticId(assetId)}`, doc);
}

async function removeAssetFromElastic(assetId) {
  await elasticRequest('DELETE', `/${ELASTIC_INDEX}/_doc/${escapeElasticId(assetId)}`);
}

async function searchAssetIdsElastic(queryText, limit = 500) {
  await ensureElasticIndex();
  const result = await elasticRequest('POST', `/${ELASTIC_INDEX}/_search`, {
    size: limit,
    query: {
      query_string: {
        query: String(queryText || '').trim(),
        default_operator: 'AND',
        fields: ['title^4', 'description^2', 'owner^2', 'tags^2', 'dc', 'clips^3', 'type', 'status']
      }
    },
    _source: false
  });
  if (!result.ok) return null;
  const hits = result.payload?.hits?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => String(h._id || '')).filter(Boolean);
}

async function suggestAssetIdsElastic(queryText, limit = 10) {
  const q = String(queryText || '').trim();
  if (!q) return [];
  await ensureElasticIndex();
  const result = await elasticRequest('POST', `/${ELASTIC_INDEX}/_search`, {
    size: Math.max(1, Math.min(20, Number(limit) || 10)),
    query: {
      bool: {
        should: [
          { match_phrase_prefix: { title: { query: q, boost: 8 } } },
          { match: { title: { query: q, fuzziness: 'AUTO', boost: 5 } } },
          { match_phrase_prefix: { owner: { query: q, boost: 2 } } },
          { match_phrase_prefix: { tags: { query: q, boost: 2 } } }
        ],
        minimum_should_match: 1
      }
    },
    _source: false
  });
  if (!result.ok) return null;
  const hits = result.payload?.hits?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => String(h._id || '')).filter(Boolean);
}

async function backfillElasticIndex() {
  await ensureElasticIndex();
  const result = await pool.query('SELECT id FROM assets');
  for (const row of result.rows) {
    await indexAssetToElastic(row.id).catch(() => {});
  }
}

function sqlTagFold(expression) {
  return `REPLACE(LOWER(TRANSLATE(${expression}, 'İIı', 'iii')), U&'\\0307', '')`;
}

function sanitizeFileName(fileName) {
  const cleaned = String(fileName || 'asset.bin').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'asset.bin';
}

function normalizeSubtitleLang(value) {
  const lang = String(value || '').trim().toLowerCase();
  if (!lang) return 'tr';
  if (!/^[a-z0-9-]{2,12}$/.test(lang)) return 'tr';
  return lang;
}

function sanitizeSubtitleItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const subtitleUrl = String(item.subtitleUrl || '').trim();
      if (!subtitleUrl) return null;
      return {
        id: String(item.id || nanoid()).trim() || nanoid(),
        subtitleUrl,
        subtitleLang: normalizeSubtitleLang(item.subtitleLang),
        subtitleLabel: String(item.subtitleLabel || '').trim() || 'subtitle',
        createdAt: String(item.createdAt || new Date().toISOString())
      };
    })
    .filter(Boolean);
}

function normalizeSubtitleTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const hh = match[1].padStart(2, '0');
  const mm = match[2];
  const ss = match[3];
  const mmm = match[4].padEnd(3, '0').slice(0, 3);
  return `${hh}:${mm}:${ss}.${mmm}`;
}

function formatTimecode(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const mmm = String(Math.floor((s - Math.floor(s)) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${mmm}`;
}

function parseAdminTimecodeToSeconds(value, fps = 25) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec < 0) throw new Error('Invalid timecode');
    return sec;
  }

  const normalized = raw.replace(',', '.');
  const frameMatch = normalized.match(/^(\d{1,2}):(\d{2}):(\d{2}):(\d{1,2})$/);
  if (frameMatch) {
    const hh = Number(frameMatch[1]);
    const mm = Number(frameMatch[2]);
    const ss = Number(frameMatch[3]);
    const ff = Number(frameMatch[4]);
    if (mm > 59 || ss > 59 || ff >= fps) throw new Error('Invalid timecode');
    return (hh * 3600) + (mm * 60) + ss + (ff / fps);
  }

  const basicMatch = normalized.match(/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (basicMatch) {
    const hh = Number(basicMatch[1]);
    const mm = Number(basicMatch[2]);
    const ss = Number(basicMatch[3]);
    if (mm > 59 || ss >= 60) throw new Error('Invalid timecode');
    return (hh * 3600) + (mm * 60) + ss;
  }

  throw new Error('Invalid timecode');
}

function normalizeOcrText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeVttContent(input) {
  let text = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return 'WEBVTT\n\n';
  if (!text.startsWith('WEBVTT')) {
    text = `WEBVTT\n\n${text}`;
  }
  return `${text}\n`
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, (_, a, b) => `${a}.${String(b).padEnd(3, '0').slice(0, 3)}`);
}

function convertSrtToVtt(input) {
  const lines = String(input || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out = ['WEBVTT', ''];

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '');
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed)) continue;
    if (!trimmed) {
      out.push('');
      continue;
    }

    if (line.includes('-->')) {
      const match = line.match(/^\s*([^ ]+)\s*-->\s*([^ ]+)(.*)$/);
      if (match) {
        const start = normalizeSubtitleTime(match[1]);
        const end = normalizeSubtitleTime(match[2]);
        if (start && end) {
          out.push(`${start} --> ${end}${match[3] || ''}`);
          continue;
        }
      }
    }

    out.push(line);
  }

  return normalizeVttContent(out.join('\n'));
}

function buildGeneratedSubtitleVtt(assetTitle, durationSeconds) {
  const total = Math.max(15, Math.round(Number(durationSeconds) || 0));
  const segmentCount = Math.min(16, Math.max(3, Math.ceil(total / 15)));
  const segmentLen = Math.max(5, Math.ceil(total / segmentCount));
  const title = String(assetTitle || 'Asset').trim() || 'Asset';
  const lines = ['WEBVTT', ''];

  for (let i = 0; i < segmentCount; i += 1) {
    const fromSec = i * segmentLen;
    const toSec = Math.min(total, fromSec + segmentLen);
    const cueNo = i + 1;
    const toTs = (sec) => {
      const s = Math.max(0, Math.floor(sec));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}.000`;
    };
    lines.push(`${toTs(fromSec)} --> ${toTs(toSec)}`);
    lines.push(`[${title}] Subtitle cue ${cueNo}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function saveAssetSubtitleMetadata(assetId, row, subtitleUrl, subtitleLang, subtitleLabel) {
  const now = new Date().toISOString();
  const existingDc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const items = sanitizeSubtitleItems(existingDc.subtitleItems);
  items.push({
    id: nanoid(),
    subtitleUrl: String(subtitleUrl || '').trim(),
    subtitleLang: normalizeSubtitleLang(subtitleLang),
    subtitleLabel: String(subtitleLabel || '').trim() || 'subtitle',
    createdAt: now
  });
  const dcMetadata = {
    ...existingDc,
    subtitleUrl: String(subtitleUrl || '').trim(),
    subtitleLang: normalizeSubtitleLang(subtitleLang),
    subtitleLabel: String(subtitleLabel || '').trim(),
    subtitleItems: items
  };
  const result = await pool.query(
    `
      UPDATE assets
      SET dc_metadata = $2::jsonb,
          updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [assetId, JSON.stringify(dcMetadata), now]
  );
  return result.rows[0];
}

function normalizeTypeFolder(typeValue, mimeType, fileName) {
  const normalized = String(typeValue || '').trim().toLowerCase();
  if (normalized === 'video') return 'video';
  if (normalized === 'audio') return 'audio';
  if (normalized === 'document') return 'document';
  if (normalized === 'photo' || normalized === 'image') return 'photo';
  if (normalized === 'other' || normalized === 'file') return 'other';

  if (isVideoMime(mimeType) || isVideoByExtension(fileName)) return 'video';
  if (String(mimeType || '').toLowerCase().startsWith('audio/')) return 'audio';
  if (String(mimeType || '').toLowerCase().startsWith('image/')) return 'photo';
  if (isPdfCandidate({ mimeType, fileName }) || String(mimeType || '').toLowerCase().startsWith('text/')) return 'document';
  return 'other';
}

function getIngestStoragePath({ type, mimeType, fileName }) {
  const datePart = new Date().toISOString().slice(0, 10);
  const typePart = normalizeTypeFolder(type, mimeType, fileName);
  const relativeDir = path.join(datePart, typePart);
  const absoluteDir = path.join(UPLOADS_DIR, relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  return { absoluteDir, relativeDir };
}

function getDatePart(value) {
  const d = value ? new Date(value) : new Date();
  if (!Number.isFinite(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function artifactRoot(kind) {
  if (kind === 'proxies') return PROXIES_DIR;
  if (kind === 'thumbnails') return THUMBNAILS_DIR;
  if (kind === 'subtitles') return SUBTITLES_DIR;
  if (kind === 'ocr') return OCR_DIR;
  throw new Error(`Unknown artifact kind: ${kind}`);
}

function buildArtifactPath(kind, storedName, dateValue) {
  const datePart = getDatePart(dateValue);
  const safeName = sanitizeFileName(storedName);
  const dir = path.join(artifactRoot(kind), datePart);
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, safeName);
  const publicUrl = `/uploads/${kind}/${datePart}/${safeName}`;
  return { absolutePath, publicUrl, datePart };
}

function createOcrFrameWorkDir(dateValue) {
  const datePart = getDatePart(dateValue);
  const dir = path.join(OCR_FRAMES_DIR, datePart, `${Date.now()}-${nanoid()}-frames`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeRmDir(target) {
  try {
    if (target && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  } catch (_error) {}
}

function inferAssetType(inputType, mimeType) {
  if (inputType && inputType.trim()) return inputType.trim();
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('image/')) return 'Image';
  if (
    mime.startsWith('application/') ||
    mime.startsWith('text/') ||
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation')
  ) {
    return 'Document';
  }
  return 'File';
}

function isVideoMime(mimeType) {
  return String(mimeType || '').toLowerCase().startsWith('video/');
}

function isVideoByExtension(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.mpeg', '.mpg'].includes(ext);
}

function isVideoCandidate({ mimeType, fileName, declaredType }) {
  if (isVideoMime(mimeType)) return true;
  if (isVideoByExtension(fileName)) return true;
  return String(declaredType || '').trim().toLowerCase() === 'video';
}

function isPdfMime(mimeType) {
  return String(mimeType || '').toLowerCase().includes('pdf');
}

function isPdfCandidate({ mimeType, fileName }) {
  if (isPdfMime(mimeType)) return true;
  return getFileExtension(fileName) === 'pdf';
}

function getFileExtension(fileName) {
  return path.extname(String(fileName || '')).replace('.', '').toLowerCase();
}

const TEXT_DOC_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'sql', 'py', 'js', 'jsx', 'ts', 'tsx',
  'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'log', 'ini', 'cfg',
  'conf', 'sh', 'bash', 'zsh'
]);

function isTextDocumentCandidate({ mimeType, fileName }) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  return TEXT_DOC_EXTENSIONS.has(getFileExtension(fileName));
}

function isDocumentCandidate({ mimeType, fileName, declaredType }) {
  const type = String(declaredType || '').trim().toLowerCase();
  if (type === 'document') return true;
  if (type === 'video' || type === 'audio' || type === 'photo' || type === 'image') return false;

  const mime = String(mimeType || '').toLowerCase();
  if (
    mime.startsWith('application/') ||
    mime.startsWith('text/') ||
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('presentation')
  ) return true;

  const ext = getFileExtension(fileName);
  return ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp'].includes(ext) || TEXT_DOC_EXTENSIONS.has(ext);
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickThumbAccent(fileName) {
  const ext = (getFileExtension(fileName) || 'doc').toLowerCase();
  let hash = 0;
  for (let i = 0; i < ext.length; i += 1) hash = ((hash << 5) - hash) + ext.charCodeAt(i);
  hash = Math.abs(hash) % 360;
  return `hsl(${hash} 66% 44%)`;
}

async function generateDocumentThumbnail(inputPath, outputPath, options = {}) {
  const extLabel = String(options.extLabel || 'DOC').slice(0, 6).toUpperCase();
  const title = String(options.title || options.fileName || 'Document').slice(0, 48);
  const accent = options.accent || pickThumbAccent(options.fileName || extLabel);
  let lines = Array.isArray(options.lines) ? options.lines : [];

  if (!lines.length) {
    lines = await extractDocumentThumbnailLines(inputPath, options);
  }

  if (!lines.length) {
    lines = ['Document preview', 'Open in viewer for full content'];
  }

  const lineSvg = lines
    .map((line, i) => `<text x="26" y="${104 + (i * 24)}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="15" fill="#4a463f">${escapeSvgText(line)}</text>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#f8f4ec"/><rect x="14" y="14" width="452" height="242" rx="14" fill="#fffdf9" stroke="#d8cfbe"/><rect x="26" y="26" width="118" height="36" rx="8" fill="${accent}"/><text x="84.5" y="50" font-family="IBM Plex Sans, Arial, sans-serif" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">${escapeSvgText(extLabel)}</text><text x="160" y="50" font-family="IBM Plex Sans, Arial, sans-serif" font-size="16" font-weight="600" fill="#312c23">${escapeSvgText(title)}</text><rect x="26" y="72" width="428" height="1" fill="#e6dccb"/>${lineSvg}</svg>`;
  fs.writeFileSync(outputPath, svg, 'utf8');
}

async function extractDocumentThumbnailLines(inputPath, options = {}) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const fileName = String(options.fileName || '');
  const ext = getFileExtension(fileName || inputPath);

  const normalizeLines = (raw) => String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, '  ').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '').trim())
    .filter(Boolean)
    .slice(0, 7)
    .map((line) => line.slice(0, 56));

  if (ext === 'docx') {
    const unzip = await runCommandCapture('unzip', ['-p', inputPath, 'word/document.xml']);
    if (unzip.ok && String(unzip.stdout || '').trim()) {
      const rich = parseDocxPreview(String(unzip.stdout || ''));
      const lines = normalizeLines(rich.text || '');
      if (lines.length) return lines;
    }
  }

  if (ext === 'doc') {
    const antiword = await runCommandCapture('antiword', [inputPath]);
    if (antiword.ok && String(antiword.stdout || '').trim()) {
      const lines = normalizeLines(antiword.stdout || '');
      if (lines.length) return lines;
    }
  }

  if (options.includeContent) {
    try {
      const raw = fs.readFileSync(inputPath, 'utf8').slice(0, 5000);
      const lines = normalizeLines(raw);
      if (lines.length) return lines;
    } catch (_error) {
      // fall through
    }
  }

  const stringsOut = await runCommandCapture('strings', ['-n', '6', inputPath]);
  if (stringsOut.ok && String(stringsOut.stdout || '').trim()) {
    return normalizeLines(stringsOut.stdout || '');
  }
  return [];
}

async function ensureDocumentThumbnailForRow(row) {
  const ext = getFileExtension(row.file_name);
  const isWordDoc = ext === 'docx' || ext === 'doc';
  const hasV2WordThumb = /doc-thumb-v2/i.test(String(row.thumbnail_url || ''));
  const existing = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
  if (existing && hasStoredFile(existing, 'thumbnails') && (!isWordDoc || hasV2WordThumb)) return row;
  if (!isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) return row;
  if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) return row;

  let inputPath = row.source_path;
  if (!inputPath || !fs.existsSync(inputPath)) {
    const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
    if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
  }

  const thumbStoredName = `${Date.now()}-${nanoid()}-doc-thumb-v2.svg`;
  const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, row.created_at);
  const extLabel = (ext || 'DOC').toUpperCase();

  try {
    await generateDocumentThumbnail(inputPath, thumbOut.absolutePath, {
      fileName: row.file_name,
      title: row.title || row.file_name || 'Document',
      extLabel,
      includeContent: isTextDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })
    });
    const thumbnailUrl = thumbOut.publicUrl;
    await pool.query(
      'UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1',
      [row.id, thumbnailUrl, new Date().toISOString()]
    );
    return { ...row, thumbnail_url: thumbnailUrl };
  } catch (_error) {
    return row;
  }
}

async function generatePdfFallbackThumbnail(outputPath, options = {}) {
  const title = String(options.title || options.fileName || 'PDF Document').slice(0, 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><rect width="480" height="270" fill="#f8f4ec"/><rect x="16" y="14" width="448" height="242" rx="14" fill="#fffdf9" stroke="#d8cfbe"/><rect x="30" y="28" width="92" height="38" rx="8" fill="#c53a2f"/><text x="76" y="53" font-family="IBM Plex Sans, Arial, sans-serif" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">PDF</text><text x="138" y="52" font-family="IBM Plex Sans, Arial, sans-serif" font-size="16" font-weight="600" fill="#312c23">${escapeSvgText(title)}</text><rect x="30" y="80" width="420" height="162" rx="8" fill="#f5f1e8" stroke="#ddd4c6"/><line x1="46" y1="106" x2="434" y2="106" stroke="#d5ccbe"/><line x1="46" y1="128" x2="434" y2="128" stroke="#ddd4c6"/><line x1="46" y1="150" x2="434" y2="150" stroke="#d5ccbe"/><line x1="46" y1="172" x2="434" y2="172" stroke="#ddd4c6"/><line x1="46" y1="194" x2="380" y2="194" stroke="#d5ccbe"/></svg>`;
  fs.writeFileSync(outputPath, svg, 'utf8');
}

async function ensurePdfThumbnailForRow(row) {
  const existing = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
  if (existing && hasStoredFile(existing, 'thumbnails')) return row;
  if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) return row;

  let inputPath = row.source_path;
  if (!inputPath || !fs.existsSync(inputPath)) {
    const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
    if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
  }

  let thumbnailUrl = '';

  if (inputPath && fs.existsSync(inputPath)) {
    const pdfThumbName = `${Date.now()}-${nanoid()}-pdf-thumb.jpg`;
    const pdfThumbOut = buildArtifactPath('thumbnails', pdfThumbName, row.created_at);
    try {
      await generatePdfThumbnail(inputPath, pdfThumbOut.absolutePath);
      thumbnailUrl = pdfThumbOut.publicUrl;
    } catch (_error) {
      thumbnailUrl = '';
    }
  }

  if (!thumbnailUrl) {
    const fallbackName = `${Date.now()}-${nanoid()}-pdf-thumb.svg`;
    const fallbackOut = buildArtifactPath('thumbnails', fallbackName, row.created_at);
    try {
      await generatePdfFallbackThumbnail(fallbackOut.absolutePath, {
        fileName: row.file_name,
        title: row.title || row.file_name || 'PDF Document'
      });
      thumbnailUrl = fallbackOut.publicUrl;
    } catch (_error) {
      return row;
    }
  }

  await pool.query(
    'UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1',
    [row.id, thumbnailUrl, new Date().toISOString()]
  );
  return { ...row, thumbnail_url: thumbnailUrl };
}

function publicUploadUrlToAbsolutePath(publicUrl) {
  const url = String(publicUrl || '');
  if (!url.startsWith('/uploads/')) return '';
  const rel = url.replace('/uploads/', '');
  return path.join(UPLOADS_DIR, rel);
}

function resolveAssetInputPath(row) {
  let inputPath = String(row?.source_path || '').trim();
  if (inputPath && fs.existsSync(inputPath)) return inputPath;

  const mediaPath = publicUploadUrlToAbsolutePath(row?.media_url);
  if (mediaPath && fs.existsSync(mediaPath)) return mediaPath;

  const proxyPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row?.proxy_url, 'proxies'));
  if (proxyPath && fs.existsSync(proxyPath)) return proxyPath;

  return '';
}

function resolveStoredUrl(value, defaultSubdir) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const candidates = [];
  if (raw.startsWith('/uploads/')) {
    candidates.push(raw);
  } else if (raw.startsWith('uploads/')) {
    candidates.push(`/${raw}`);
  } else if (path.isAbsolute(raw)) {
    const rel = path.relative(UPLOADS_DIR, raw);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      candidates.push(`/uploads/${rel.replace(/\\/g, '/')}`);
    }
  } else {
    // Legacy rows may store only filename; use subdir hint.
    if (defaultSubdir) candidates.push(`/uploads/${defaultSubdir}/${raw}`);
    candidates.push(`/uploads/${raw}`);
  }

  for (const candidate of candidates) {
    const absolute = publicUploadUrlToAbsolutePath(candidate);
    if (!absolute) continue;
    try {
      if (fs.existsSync(absolute) && fs.statSync(absolute).size > 0) {
        return candidate;
      }
    } catch (_error) {
      // Try next candidate.
    }
  }
  return '';
}

function hasStoredFile(value, defaultSubdir) {
  const resolved = resolveStoredUrl(value, defaultSubdir);
  const absolute = publicUploadUrlToAbsolutePath(resolved);
  if (!absolute) return false;
  try {
    return fs.existsSync(absolute) && fs.statSync(absolute).size > 0;
  } catch (_error) {
    return false;
  }
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function escapeHtmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExtractedText(value, maxLen = 50000) {
  let text = String(value || '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (text.length > maxLen) {
    text = `${text.slice(0, maxLen)}\n...\n`;
  }
  return text;
}

function parseDocxPreview(xmlContent) {
  const xml = String(xmlContent || '');
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  const htmlParts = [];
  const textParts = [];

  for (const paragraph of paragraphs.slice(0, 500)) {
    const runs = paragraph.match(/<w:r[\s\S]*?<\/w:r>/g) || [];
    const lineHtml = [];
    const lineText = [];

    for (const run of runs) {
      const isBold = /<w:b(?:\s|\/>|>)/.test(run);
      const isItalic = /<w:i(?:\s|\/>|>)/.test(run);
      const isUnderline = /<w:u(?:\s|\/>|>)/.test(run);

      const textSegments = [];
      const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let tm = textRegex.exec(run);
      while (tm) {
        textSegments.push(decodeXmlEntities(tm[1]));
        tm = textRegex.exec(run);
      }
      if (/<w:tab\/>/.test(run)) textSegments.push('  ');
      if (/<w:br\/>/.test(run)) textSegments.push('\n');

      const runText = textSegments.join('');
      if (!runText) continue;

      let runHtml = escapeHtmlText(runText).replace(/\n/g, '<br/>');
      if (isUnderline) runHtml = `<u>${runHtml}</u>`;
      if (isItalic) runHtml = `<em>${runHtml}</em>`;
      if (isBold) runHtml = `<strong>${runHtml}</strong>`;
      lineHtml.push(runHtml);
      lineText.push(runText);
    }

    const pHtml = lineHtml.length ? lineHtml.join('') : '&nbsp;';
    const pText = lineText.join('');
    htmlParts.push(`<p>${pHtml}</p>`);
    textParts.push(pText);
  }

  return {
    html: htmlParts.join(''),
    text: textParts.join('\n')
  };
}

async function extractPreviewContentFromFile(row, inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return { text: '', html: '', mode: 'text' };
  const mime = String(row.mime_type || '').toLowerCase();
  const ext = getFileExtension(row.file_name);

  if (isTextDocumentCandidate({ mimeType: mime, fileName: row.file_name })) {
    try {
      const raw = fs.readFileSync(inputPath, 'utf8');
      return { text: normalizeExtractedText(raw), html: '', mode: 'text' };
    } catch (_error) {
      // continue to fallback
    }
  }

  if (isPdfMime(mime)) {
    const pdfToText = await runCommandCapture('pdftotext', ['-layout', '-nopgbrk', inputPath, '-']);
    if (pdfToText.ok && String(pdfToText.stdout || '').trim()) {
      return { text: normalizeExtractedText(pdfToText.stdout), html: '', mode: 'text' };
    }
    const stringsOut = await runCommandCapture('strings', ['-n', '6', inputPath]);
    if (stringsOut.ok && String(stringsOut.stdout || '').trim()) {
      return { text: normalizeExtractedText(stringsOut.stdout), html: '', mode: 'text' };
    }
    return { text: '', html: '', mode: 'text' };
  }

  if (ext === 'docx') {
    const unzip = await runCommandCapture('unzip', ['-p', inputPath, 'word/document.xml']);
    if (unzip.ok && String(unzip.stdout || '').trim()) {
      const xml = String(unzip.stdout || '');
      const rich = parseDocxPreview(xml);
      const text = normalizeExtractedText(rich.text);
      const html = String(rich.html || '').trim();
      if (text || html) {
        return { text, html, mode: html ? 'html' : 'text' };
      }
    }
    return { text: '', html: '', mode: 'text' };
  }

  if (ext === 'doc') {
    const antiword = await runCommandCapture('antiword', [inputPath]);
    if (antiword.ok && String(antiword.stdout || '').trim()) {
      return { text: normalizeExtractedText(antiword.stdout), html: '', mode: 'text' };
    }
    const stringsOut = await runCommandCapture('strings', ['-n', '6', inputPath]);
    if (stringsOut.ok && String(stringsOut.stdout || '').trim()) {
      return { text: normalizeExtractedText(stringsOut.stdout), html: '', mode: 'text' };
    }
    return { text: '', html: '', mode: 'text' };
  }

  if (ext === 'rtf' || ext === 'odt' || ext === 'ods' || ext === 'odp') {
    const stringsOut = await runCommandCapture('strings', ['-n', '6', inputPath]);
    if (stringsOut.ok && String(stringsOut.stdout || '').trim()) {
      return { text: normalizeExtractedText(stringsOut.stdout), html: '', mode: 'text' };
    }
  }

  return { text: '', html: '', mode: 'text' };
}

async function extractPdfPagesText(inputPath) {
  const pdfToText = await runCommandCapture('pdftotext', ['-layout', inputPath, '-']);
  if (!pdfToText.ok) return [];
  const raw = String(pdfToText.stdout || '');
  if (!raw.trim()) return [];
  return raw
    .split('\f')
    .map((page) => normalizeExtractedText(page))
    .filter((page, idx, arr) => idx < arr.length - 1 || page.trim().length > 0);
}

async function getPdfPageCount(inputPath) {
  const info = await runCommandCapture('pdfinfo', [inputPath]);
  if (!info.ok) return 0;
  const text = String(info.stdout || '');
  const match = text.match(/Pages:\s+(\d+)/i);
  const parsed = Number(match?.[1] || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function renderPdfPageJpegBuffer(inputPath, page, width) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeWidth = Math.max(320, Math.min(2200, Math.round(Number(width) || 1200)));
  const baseName = `${Date.now()}-${nanoid()}-pdf-${safePage}`;
  const outBase = path.join('/tmp', baseName);
  const outFile = `${outBase}.jpg`;

  try {
    const result = await runCommandQuiet('pdftoppm', [
      '-jpeg',
      '-f',
      String(safePage),
      '-singlefile',
      '-scale-to',
      String(safeWidth),
      inputPath,
      outBase
    ]);
    if (!result.ok || !fs.existsSync(outFile)) return null;
    return fs.readFileSync(outFile);
  } catch (_error) {
    return null;
  } finally {
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    } catch (_error) {
      // ignore
    }
  }
}

function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTesseractTsvWords(tsvText) {
  const lines = String(tsvText || '').split(/\r?\n/);
  if (lines.length < 2) return [];
  const words = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const text = String(cols[11] || '').trim();
    if (!text) continue;
    const conf = Number(cols[10] || 0);
    if (Number.isFinite(conf) && conf < 25) continue;
    const left = Number(cols[6] || 0);
    const top = Number(cols[7] || 0);
    const width = Number(cols[8] || 0);
    const height = Number(cols[9] || 0);
    if (width <= 0 || height <= 0) continue;
    words.push({ text, left, top, width, height });
  }
  return words;
}

function findOcrPhraseMatches(words, query) {
  const qNorm = normalizeForSearch(query);
  if (!qNorm) return [];
  const qTokens = qNorm.split(' ').filter(Boolean);
  if (!qTokens.length) return [];

  const tokens = words.map((w) => normalizeForSearch(w.text));
  const matches = [];

  for (let i = 0; i < tokens.length; i += 1) {
    if (!tokens[i]) continue;

    if (qTokens.length === 1) {
      if (!tokens[i].includes(qTokens[0])) continue;
      matches.push([i, i]);
      continue;
    }

    let j = i;
    let built = tokens[j] || '';
    while (j + 1 < tokens.length && built.length <= (qNorm.length + 24)) {
      if (built === qNorm) break;
      j += 1;
      built = `${built} ${tokens[j] || ''}`.trim();
    }
    if (built === qNorm) {
      matches.push([i, j]);
    }
  }
  return matches;
}

function makeOcrSnippet(words, startIdx, endIdx) {
  const from = Math.max(0, startIdx - 8);
  const to = Math.min(words.length - 1, endIdx + 8);
  const text = words.slice(from, to + 1).map((w) => String(w.text || '')).join(' ').trim();
  if (!text) return '';
  return `${from > 0 ? '...' : ''}${text}${to < words.length - 1 ? '...' : ''}`;
}

function matchBoxFromWords(words, startIdx, endIdx) {
  const slice = words.slice(startIdx, endIdx + 1);
  const left = Math.min(...slice.map((w) => Number(w.left) || 0));
  const top = Math.min(...slice.map((w) => Number(w.top) || 0));
  const right = Math.max(...slice.map((w) => (Number(w.left) || 0) + (Number(w.width) || 0)));
  const bottom = Math.max(...slice.map((w) => (Number(w.top) || 0) + (Number(w.height) || 0)));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

async function ocrPdfWordsForPage({ assetId, inputPath, page, width, lang }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeWidth = Math.max(700, Math.min(2200, Math.round(Number(width) || 1400)));
  const safeLang = String(lang || 'tur+eng').trim() || 'tur+eng';
  const cacheKey = `${assetId}:${safePage}:${safeWidth}:${safeLang}`;
  if (pdfOcrCache.has(cacheKey)) return pdfOcrCache.get(cacheKey);

  const baseName = `${Date.now()}-${nanoid()}-ocr-${safePage}`;
  const outBase = path.join('/tmp', baseName);
  const outFile = `${outBase}.jpg`;
  try {
    const rendered = await runCommandQuiet('pdftoppm', [
      '-jpeg',
      '-f',
      String(safePage),
      '-singlefile',
      '-scale-to',
      String(safeWidth),
      inputPath,
      outBase
    ]);
    if (!rendered.ok || !fs.existsSync(outFile)) return [];

    const tsv = await runCommandCapture('tesseract', [
      outFile,
      'stdout',
      '-l',
      safeLang,
      '--dpi',
      '300',
      '--psm',
      '6',
      'tsv'
    ]);
    if (!tsv.ok) return [];

    const words = parseTesseractTsvWords(tsv.stdout || '');
    pdfOcrCache.set(cacheKey, words);
    return words;
  } catch (_error) {
    return [];
  } finally {
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    } catch (_error) {
      // ignore
    }
  }
}

function buildPdfSearchSnippet(text, query, radius = 90) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const needle = String(query || '').trim().toLowerCase();
  if (!source || !needle) return '';
  const hit = source.toLowerCase().indexOf(needle);
  if (hit < 0) return '';
  const start = Math.max(0, hit - radius);
  const end = Math.min(source.length, hit + needle.length + radius);
  let out = source.slice(start, end);
  if (start > 0) out = `...${out}`;
  if (end < source.length) out = `${out}...`;
  return out;
}

function toTags(input) {
  if (Array.isArray(input)) {
    return input.map((t) => String(t).trim()).filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const DC_KEYS = [
  'title',
  'creator',
  'subject',
  'description',
  'publisher',
  'contributor',
  'date',
  'type',
  'format',
  'identifier',
  'source',
  'language',
  'relation',
  'coverage',
  'rights'
];

function sanitizeDcMetadata(input) {
  const out = {};
  const source = input && typeof input === 'object' ? input : {};
  DC_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      out[key] = String(source[key]).trim();
    }
  });
  return out;
}

function buildDefaultDcMetadata(input) {
  const tags = toTags(input.tags || []);
  return {
    title: String(input.title || '').trim(),
    creator: String(input.owner || '').trim(),
    subject: tags.join(', '),
    description: String(input.description || '').trim(),
    publisher: '',
    contributor: '',
    date: new Date().toISOString(),
    type: String(inferAssetType(input.type, input.mimeType) || '').trim(),
    format: String(input.mimeType || '').trim(),
    identifier: String(input.fileName || '').trim(),
    source: String(input.sourcePath || '').trim(),
    language: '',
    relation: '',
    coverage: '',
    rights: ''
  };
}

function mapAssetRow(row) {
  const proxyUrl = resolveStoredUrl(row.proxy_url, 'proxies');
  const thumbnailUrl = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
  const dcMetadata = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  let subtitleItems = sanitizeSubtitleItems(dcMetadata.subtitleItems);
  if (!subtitleItems.length && String(dcMetadata.subtitleUrl || '').trim()) {
    subtitleItems = [{
      id: nanoid(),
      subtitleUrl: String(dcMetadata.subtitleUrl || '').trim(),
      subtitleLang: normalizeSubtitleLang(dcMetadata.subtitleLang),
      subtitleLabel: String(dcMetadata.subtitleLabel || '').trim() || 'subtitle',
      createdAt: row.updated_at || row.created_at || new Date().toISOString()
    }];
  }
  const listCuts = Array.isArray(row.cuts)
    ? row.cuts
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const label = String(item.label || '').trim();
        if (!label) return null;
        return { label };
      })
      .filter(Boolean)
    : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    tags: row.tags || [],
    owner: row.owner,
    durationSeconds: row.duration_seconds,
    sourcePath: row.source_path,
    mediaUrl: row.media_url,
    proxyUrl,
    proxyStatus: row.proxy_status,
    thumbnailUrl,
    fileName: row.file_name,
    mimeType: row.mime_type,
    dcMetadata,
    audioChannels: Number(dcMetadata.audioChannels) || 0,
    subtitleUrl: String(dcMetadata.subtitleUrl || '').trim(),
    subtitleLang: dcMetadata.subtitleUrl ? normalizeSubtitleLang(dcMetadata.subtitleLang) : '',
    subtitleLabel: String(dcMetadata.subtitleLabel || '').trim(),
    subtitleItems,
    cuts: listCuts,
    status: row.status,
    deletedAt: row.deleted_at,
    inTrash: Boolean(row.deleted_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapVersionRow(row) {
  return {
    versionId: row.version_id,
    label: row.label,
    note: row.note,
    createdAt: row.created_at
  };
}

function mapCutRow(row) {
  return {
    cutId: row.cut_id,
    label: row.label,
    inPointSeconds: row.in_point_seconds,
    outPointSeconds: row.out_point_seconds,
    createdAt: row.created_at
  };
}

async function createAssetRecord(input) {
  const now = new Date().toISOString();
  const asset = {
    id: nanoid(),
    title: input.title?.trim() || 'Untitled Asset',
    description: input.description?.trim() || '',
    type: inferAssetType(input.type, input.mimeType),
    tags: toTags(input.tags),
    owner: input.owner?.trim() || 'Unknown',
    durationSeconds: Number(input.durationSeconds) || 0,
    sourcePath: input.sourcePath?.trim() || '',
    mediaUrl: input.mediaUrl?.trim() || '',
    proxyUrl: input.proxyUrl?.trim() || '',
    proxyStatus: input.proxyStatus?.trim() || 'not_applicable',
    thumbnailUrl: input.thumbnailUrl?.trim() || '',
    fileName: input.fileName?.trim() || '',
    mimeType: input.mimeType?.trim() || '',
    dcMetadata: {
      ...buildDefaultDcMetadata(input),
      ...sanitizeDcMetadata(input.dcMetadata)
    },
    status: 'Ingested',
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };

  const version = {
    versionId: nanoid(),
    label: 'v1',
    note: 'Initial ingest',
    createdAt: now
  };

  await pool.query('BEGIN');
  try {
    await pool.query(
      `
        INSERT INTO assets (
          id, title, description, type, tags, owner, duration_seconds, source_path,
          media_url, proxy_url, proxy_status, thumbnail_url, file_name, mime_type, dc_metadata, status, created_at, updated_at
          , deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
      `,
      [
        asset.id,
        asset.title,
        asset.description,
        asset.type,
        asset.tags,
        asset.owner,
        asset.durationSeconds,
        asset.sourcePath,
        asset.mediaUrl,
        asset.proxyUrl,
        asset.proxyStatus,
        asset.thumbnailUrl,
        asset.fileName,
        asset.mimeType,
        JSON.stringify(asset.dcMetadata),
        asset.status,
        asset.createdAt,
        asset.updatedAt,
        asset.deletedAt
      ]
    );
    await pool.query(
      'INSERT INTO asset_versions (version_id, asset_id, label, note, created_at) VALUES ($1,$2,$3,$4,$5)',
      [version.versionId, asset.id, version.label, version.note, version.createdAt]
    );
    await pool.query('COMMIT');
    await indexAssetToElastic(asset.id).catch(() => {});
    return { ...asset, versions: [version] };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function generateVideoProxy(inputPath, outputPath) {
  const audioStreams = await getMediaAudioStreams(inputPath);
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '31',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-vf',
      'scale=640:-2:force_original_aspect_ratio=decrease'
    ];

    if (audioStreams.length === 1) {
      const channels = Math.max(1, Number(audioStreams[0].channels) || 2);
      args.push(
        '-map',
        '0:a:0',
        '-c:a',
        'aac',
        '-b:a',
        channels > 2 ? '256k' : '128k'
      );
    } else if (audioStreams.length > 1) {
      const inputs = audioStreams.map((_s, idx) => `[0:a:${idx}]`).join('');
      const mergedChannels = audioStreams.reduce((acc, s) => acc + Math.max(1, Number(s.channels) || 1), 0);
      args.push(
        '-filter_complex',
        `${inputs}amerge=inputs=${audioStreams.length}[aout]`,
        '-map',
        '[aout]',
        '-c:a',
        'aac',
        '-ac',
        String(Math.max(2, mergedChannels)),
        '-b:a',
        mergedChannels > 2 ? '384k' : '128k'
      );
    }

    args.push(
      '-movflags',
      '+faststart',
      outputPath
    );

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

function runCommandCapture(cmd, args, options = {}) {
  const env = options?.env ? { ...process.env, ...options.env } : process.env;
  const cwd = options?.cwd || undefined;
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env, cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    p.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    p.on('error', (error) => {
      resolve({ ok: false, code: -1, stdout, stderr: String(error.message || error) });
    });
    p.on('close', (code) => {
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

function runCommandQuiet(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    p.on('error', (error) => {
      resolve({ ok: false, code: -1, stderr: String(error.message || error) });
    });
    p.on('close', (code) => {
      resolve({ ok: code === 0, code: code ?? -1, stderr });
    });
  });
}

async function transcribeMediaToVtt(inputPath, outputPath, options = {}) {
  const scriptPath = path.join(__dirname, 'transcribe_whisper.py');
  const lang = String(options.lang || '').trim().toLowerCase();
  const model = String(options.model || WHISPER_MODEL || 'small').trim();
  const args = [
    scriptPath,
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--model',
    model
  ];
  if (lang) {
    args.push('--lang', lang);
  }
  return runCommandCapture('python3', args);
}

async function extractVideoOcrToText(inputPath, outputPath, options = {}) {
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const ocrLang = String(options.ocrLang || 'eng+tur').trim() || 'eng+tur';
  const ocrEngine = normalizeOcrEngine(options.ocrEngine);
  const workDir = String(options.workDir || '').trim() || createOcrFrameWorkDir();
  fs.mkdirSync(workDir, { recursive: true });
  const framePattern = path.join(workDir, 'frame-%06d.jpg');
  const ffmpeg = await runCommandCapture('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vf',
    `fps=1/${intervalSec}`,
    '-q:v',
    '3',
    framePattern
  ]);
  if (!ffmpeg.ok) throw new Error(String(ffmpeg.stderr || 'Could not sample video frames'));

  const files = fs.readdirSync(workDir)
    .filter((name) => /^frame-\d+\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!files.length) throw new Error('No frames extracted for OCR');

  if (ocrEngine === 'paddle') {
    const result = await extractVideoOcrToTextPaddle({ workDir, files, outputPath, intervalSec, ocrLang });
    return { ...result, workDir };
  }

  const result = await extractVideoOcrToTextTesseract({ workDir, files, outputPath, intervalSec, ocrLang });
  return { ...result, workDir };
}

function normalizeOcrEngine(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'paddle' ? 'paddle' : 'tesseract';
}

async function extractVideoOcrToTextTesseract({ workDir, files, outputPath, intervalSec, ocrLang }) {
  const lines = [];
  let prevNorm = '';
  for (let i = 0; i < files.length; i += 1) {
    const framePath = path.join(workDir, files[i]);
    const ocr = await runCommandCapture('tesseract', [framePath, 'stdout', '-l', ocrLang]);
    if (!ocr.ok) continue;
    const text = normalizeOcrText(ocr.stdout || '');
    if (!text) continue;
    const norm = text.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!norm || norm === prevNorm) continue;
    prevNorm = norm;
    const sec = i * intervalSec;
    lines.push(`[${formatTimecode(sec)}] ${text}`);
  }

  const output = lines.length
    ? `${lines.join('\n')}\n`
    : '[00:00:00.000] No OCR text detected.\n';
  fs.writeFileSync(outputPath, output, 'utf8');

  return { lines: lines.length, engine: 'tesseract' };
}

async function extractVideoOcrToTextPaddle({ workDir, files, outputPath, intervalSec, ocrLang }) {
  const sanitizeErr = (value) => String(value || '')
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(' | ')
    .slice(0, 700);

  const scriptPath = path.join(__dirname, 'video_ocr_paddle.py');
  let payload = { items: [] };
  let lastErr = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const run = await runCommandCapture('python3', [
      scriptPath,
      '--frames-dir',
      workDir,
      '--lang',
      ocrLang
    ], {
      env: {
        PYTHONWARNINGS: 'ignore',
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
        PADDLE_PDX_CACHE_HOME: PADDLE_CACHE_DIR,
        PADDLE_HOME: PADDLE_CACHE_DIR
      }
    });
    if (!run.ok) {
      lastErr = sanitizeErr(run.stderr || run.stdout || '');
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      throw new Error(lastErr ? `PaddleOCR init failed: ${lastErr}` : 'PaddleOCR init failed');
    }

    try {
      const rawOut = String(run.stdout || '');
      const enginePos = rawOut.lastIndexOf('"engine"');
      const start = enginePos >= 0 ? rawOut.lastIndexOf('{', enginePos) : rawOut.indexOf('{');
      const end = rawOut.lastIndexOf('}');
      payload = JSON.parse(start >= 0 && end >= start ? rawOut.slice(start, end + 1) : '{}');
      break;
    } catch (_error) {
      lastErr = sanitizeErr(run.stdout || run.stderr || 'Could not parse PaddleOCR output');
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      throw new Error(lastErr ? `PaddleOCR output parse failed: ${lastErr}` : 'PaddleOCR output parse failed');
    }
  }

  const itemMap = new Map(
    (Array.isArray(payload.items) ? payload.items : [])
      .map((item) => [String(item?.name || ''), normalizeOcrText(String(item?.text || ''))])
      .filter(([name]) => Boolean(name))
  );

  const lines = [];
  let prevNorm = '';
  for (let i = 0; i < files.length; i += 1) {
    const text = String(itemMap.get(files[i]) || '');
    if (!text) continue;
    const norm = text.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!norm || norm === prevNorm) continue;
    prevNorm = norm;
    const sec = i * intervalSec;
    lines.push(`[${formatTimecode(sec)}] ${text}`);
  }

  const output = lines.length
    ? `${lines.join('\n')}\n`
    : '[00:00:00.000] No OCR text detected.\n';
  fs.writeFileSync(outputPath, output, 'utf8');
  return { lines: lines.length, engine: 'paddle' };
}

function queueVideoOcrJob(row, options = {}) {
  const jobId = nanoid();
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const ocrLang = String(options.ocrLang || 'eng+tur').trim() || 'eng+tur';
  const ocrEngine = normalizeOcrEngine(options.ocrEngine);
  const now = new Date().toISOString();
  const job = {
    jobId,
    assetId: row.id,
    status: 'queued',
    intervalSec,
    ocrLang,
    ocrEngine,
    requestedEngine: ocrEngine,
    resultUrl: '',
    resultPath: '',
    resultLabel: '',
    lineCount: 0,
    frameDir: '',
    warning: '',
    error: '',
    startedAt: now,
    updatedAt: now,
    finishedAt: ''
  };
  videoOcrJobs.set(jobId, job);

  setTimeout(async () => {
    const running = videoOcrJobs.get(jobId);
    if (!running) return;
    running.status = 'running';
    running.updatedAt = new Date().toISOString();
    try {
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath) throw new Error('Source media not found');
      const base = sanitizeFileName(path.basename(String(row.file_name || row.id), path.extname(String(row.file_name || ''))));
      let selectedEngine = ocrEngine;
      let outName = `${Date.now()}-${nanoid()}-${base}-ocr-${selectedEngine}.txt`;
      let out = buildArtifactPath('ocr', outName, row.created_at);
      const frameDir = createOcrFrameWorkDir(row.created_at);
      running.frameDir = frameDir;
      let result;
      try {
        result = await extractVideoOcrToText(inputPath, out.absolutePath, {
          intervalSec,
          ocrLang,
          ocrEngine: selectedEngine,
          workDir: frameDir
        });
      } catch (primaryError) {
        if (selectedEngine !== 'paddle' || !ALLOW_PADDLE_OCR_FALLBACK) throw primaryError;
        // Paddle can crash in some host/container combinations; fallback to tesseract.
        selectedEngine = 'tesseract';
        outName = `${Date.now()}-${nanoid()}-${base}-ocr-${selectedEngine}.txt`;
        out = buildArtifactPath('ocr', outName, row.created_at);
        result = await extractVideoOcrToText(inputPath, out.absolutePath, {
          intervalSec,
          ocrLang,
          ocrEngine: selectedEngine,
          workDir: frameDir
        });
        running.warning = `PaddleOCR failed, fallback engine used: tesseract. (${String(primaryError?.message || 'unknown error').slice(0, 220)})`;
      }
      running.status = 'completed';
      running.resultUrl = out.publicUrl;
      running.resultPath = out.absolutePath;
      running.resultLabel = outName;
      running.lineCount = Number(result.lines || 0);
      running.ocrEngine = normalizeOcrEngine(result.engine || selectedEngine);
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
    } catch (error) {
      running.status = 'failed';
      running.error = String(error?.message || 'Video OCR failed').slice(0, 900);
      safeRmDir(running.frameDir);
      running.frameDir = '';
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
    }
  }, 10);
  return job;
}

function queueSubtitleGenerationJob(row, options = {}) {
  const jobId = nanoid();
  const subtitleLang = normalizeSubtitleLang(options.lang);
  const subtitleLabel = String(options.label || 'auto-whisper').trim() || 'auto-whisper';
  const model = String(options.model || WHISPER_MODEL || 'tiny').trim() || 'tiny';
  const now = new Date().toISOString();
  const job = {
    jobId,
    assetId: row.id,
    status: 'queued',
    model,
    subtitleLang,
    subtitleLabel,
    subtitleUrl: '',
    error: '',
    startedAt: now,
    updatedAt: now,
    finishedAt: ''
  };
  subtitleJobs.set(jobId, job);

  setTimeout(async () => {
    const running = subtitleJobs.get(jobId);
    if (!running) return;
    running.status = 'running';
    running.updatedAt = new Date().toISOString();

    try {
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath) throw new Error('Source media not found for transcription');
      const storedName = `${Date.now()}-${nanoid()}-auto-${sanitizeFileName(row.id)}.vtt`;
      const subtitleOut = buildArtifactPath('subtitles', storedName, row.created_at);
      const transcription = await transcribeMediaToVtt(inputPath, subtitleOut.absolutePath, {
        lang: subtitleLang,
        model
      });
      if (!transcription.ok || !fs.existsSync(subtitleOut.absolutePath) || fs.statSync(subtitleOut.absolutePath).size < 16) {
        throw new Error(String(transcription.stderr || transcription.stdout || 'Subtitle transcription failed'));
      }
      const subtitleUrl = subtitleOut.publicUrl;
      const updatedRow = await saveAssetSubtitleMetadata(row.id, row, subtitleUrl, subtitleLang, subtitleLabel);
      running.status = 'completed';
      running.subtitleUrl = subtitleUrl;
      running.subtitleLang = subtitleLang;
      running.subtitleLabel = subtitleLabel;
      running.asset = mapAssetRow(updatedRow);
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
    } catch (error) {
      running.status = 'failed';
      running.error = String(error?.message || 'Subtitle generation failed').slice(0, 800);
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
    }
  }, 10);

  return job;
}

async function getAdminSettings() {
  const result = await pool.query("SELECT value FROM admin_settings WHERE key = 'general' LIMIT 1");
  if (!result.rowCount) return { ...DEFAULT_ADMIN_SETTINGS };
  const value = result.rows[0].value;
  if (!value || typeof value !== 'object') return { ...DEFAULT_ADMIN_SETTINGS };
  return { ...DEFAULT_ADMIN_SETTINGS, ...value };
}

async function saveAdminSettings(settings) {
  const updatedAt = new Date().toISOString();
  await pool.query(
    `
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('general', $1::jsonb, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify(settings), updatedAt]
  );
  return settings;
}

async function getUserPermissionsSettings() {
  const result = await pool.query("SELECT value FROM admin_settings WHERE key = 'user_permissions' LIMIT 1");
  if (!result.rowCount) return { ...DEFAULT_USER_PERMISSIONS };
  const value = result.rows[0].value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_USER_PERMISSIONS };
  return value;
}

async function saveUserPermissionsSettings(settings) {
  const updatedAt = new Date().toISOString();
  await pool.query(
    `
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('user_permissions', $1::jsonb, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [JSON.stringify(settings || {}), updatedAt]
  );
  return settings;
}

function getBearerFromRequest(req) {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function getApiKeyFromRequest(req) {
  return getHeaderString(req, 'x-api-token');
}

function hasAuthenticatedUpstreamUser(req) {
  return Boolean(
    getHeaderString(req, 'x-forwarded-user') ||
    getHeaderString(req, 'x-auth-request-user')
  );
}

function decodeJwtPart(part) {
  const b64 = String(part || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwt(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decodeJwtPart(parts[0]));
    const payload = JSON.parse(decodeJwtPart(parts[1]));
    return {
      header,
      payload,
      signature: parts[2],
      signedPart: `${parts[0]}.${parts[1]}`
    };
  } catch (_error) {
    return null;
  }
}

async function getOidcJwks(jwksUrl, forceRefresh = false) {
  const cacheKey = String(jwksUrl || '').trim();
  if (!cacheKey) return [];

  const now = Date.now();
  const cached = oidcJwksCache.get(cacheKey);
  if (!forceRefresh && cached && now < cached.expiresAt && Array.isArray(cached.keys)) {
    return cached.keys;
  }

  const response = await fetch(cacheKey);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed (${response.status})`);
  }
  const body = await response.json().catch(() => ({}));
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  oidcJwksCache.set(cacheKey, {
    keys,
    expiresAt: now + OIDC_JWKS_CACHE_TTL_MS
  });
  return keys;
}

function verifyJwtSignatureWithJwk(tokenSignedPart, signatureB64Url, jwk) {
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(tokenSignedPart);
    verifier.end();
    const signatureB64 = String(signatureB64Url || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = signatureB64.padEnd(Math.ceil(signatureB64.length / 4) * 4, '=');
    const signature = Buffer.from(padded, 'base64');
    return verifier.verify(publicKey, signature);
  } catch (_error) {
    return false;
  }
}

function validateJwtClaims(payload, settings) {
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now >= Number(payload.exp)) return 'Token expired';
  if (payload?.nbf && now < Number(payload.nbf)) return 'Token not active yet';

  const expectedIssuer = String(settings.oidcIssuerUrl || '').trim();
  if (expectedIssuer && String(payload?.iss || '') !== expectedIssuer) return 'Invalid token issuer';

  const audienceRaw = String(settings.oidcAudience || '').trim();
  if (audienceRaw) {
    const expectedAudiences = audienceRaw.split(',').map((v) => v.trim()).filter(Boolean);
    const audClaim = payload?.aud;
    const actualAudiences = Array.isArray(audClaim) ? audClaim.map((v) => String(v)) : [String(audClaim || '')];
    const hasMatch = expectedAudiences.some((expected) => actualAudiences.includes(expected));
    if (!hasMatch) return 'Invalid token audience';
  }
  return '';
}

async function verifyOidcBearerToken(token, settings) {
  const decoded = decodeJwt(token);
  if (!decoded) throw new Error('Invalid bearer token format');
  if (String(decoded?.header?.alg || '') !== 'RS256') throw new Error('Unsupported token algorithm');
  const kid = String(decoded?.header?.kid || '').trim();
  if (!kid) throw new Error('Missing token key id');
  const jwksUrl = String(settings.oidcJwksUrl || '').trim();
  if (!jwksUrl) throw new Error('OIDC JWKS URL is not configured');

  let keys = await getOidcJwks(jwksUrl, false);
  let jwk = keys.find((k) => String(k?.kid || '') === kid);
  if (!jwk) {
    keys = await getOidcJwks(jwksUrl, true);
    jwk = keys.find((k) => String(k?.kid || '') === kid);
  }
  if (!jwk) throw new Error('Token signing key not found');

  const signatureOk = verifyJwtSignatureWithJwk(decoded.signedPart, decoded.signature, jwk);
  if (!signatureOk) throw new Error('Invalid bearer token signature');

  const claimError = validateJwtClaims(decoded.payload || {}, settings);
  if (claimError) throw new Error(claimError);
  return decoded.payload;
}

async function maybeRequireApiToken(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  try {
    const settings = await getAdminSettings();
    if (!settings.apiTokenEnabled) return next();
    if (hasAuthenticatedUpstreamUser(req)) return next();

    const bearer = String(getBearerFromRequest(req) || '');
    if (settings.oidcBearerEnabled && bearer && bearer.includes('.')) {
      try {
        await verifyOidcBearerToken(bearer, settings);
        return next();
      } catch (error) {
        return res.status(401).json({ error: String(error.message || 'Invalid bearer token') });
      }
    }

    const expected = String(settings.apiToken || '');
    const apiKey = String(getApiKeyFromRequest(req) || '');
    const fallback = bearer && !bearer.includes('.') ? bearer : '';
    const given = apiKey || fallback;

    if (!expected || !given) {
      return res.status(401).json({ error: 'Missing API token' });
    }
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(given);
    if (expectedBuf.length !== givenBuf.length || !crypto.timingSafeEqual(expectedBuf, givenBuf)) {
      return res.status(401).json({ error: 'Invalid API token' });
    }
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to validate API token' });
  }
}

function generateApiToken() {
  return crypto.randomBytes(24).toString('base64url');
}

app.use(maybeRequireApiToken);

function createProxyJob() {
  const id = nanoid();
  const job = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    total: 0,
    processed: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    currentAssetId: null,
    errors: []
  };
  proxyJobs.set(id, job);
  return job;
}

async function runProxyJob(jobId, options = {}) {
  const job = proxyJobs.get(jobId);
  if (!job) return;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  const includeTrash = Boolean(options.includeTrash);

  try {
    const where = includeTrash ? '' : 'WHERE deleted_at IS NULL';
    const result = await pool.query(`SELECT * FROM assets ${where} ORDER BY created_at ASC`);
    const targets = result.rows.filter((row) =>
      isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })
    );
    job.total = targets.length;

    for (const row of targets) {
      job.currentAssetId = row.id;
      job.processed += 1;
      if (hasStoredFile(row.proxy_url, 'proxies') && hasStoredFile(row.thumbnail_url, 'thumbnails')) {
        job.skipped += 1;
        continue;
      }
      try {
        await ensureVideoProxyAndThumbnail(row);
        job.generated += 1;
      } catch (error) {
        job.failed += 1;
        job.errors.push({
          assetId: row.id,
          error: String(error.message || '').slice(0, 220)
        });
      }
    }

    job.status = 'completed';
  } catch (error) {
    job.status = 'failed';
    job.errors.push({ assetId: null, error: String(error.message || '').slice(0, 220) });
  } finally {
    job.currentAssetId = null;
    job.finishedAt = new Date().toISOString();
  }
}

async function getVideoDurationSeconds(inputPath) {
  return new Promise((resolve) => {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath
    ];
    const ffprobe = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ffprobe.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    ffprobe.on('error', () => resolve(0));
    ffprobe.on('close', () => {
      const parsed = Number(out.trim());
      resolve(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
    });
  });
}

async function getMediaAudioStreams(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const probe = await runCommandCapture('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index,channels',
    '-of',
    'json',
    inputPath
  ]);
  if (!probe.ok) return [];
  try {
    const parsed = JSON.parse(String(probe.stdout || '{}'));
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    return streams
      .map((s) => ({
        index: Number.isFinite(Number(s?.index)) ? Number(s.index) : null,
        channels: Number.isFinite(Number(s?.channels)) ? Math.max(0, Math.floor(Number(s.channels))) : 0
      }))
      .filter((s) => Number.isFinite(s.index));
  } catch (_error) {
    return [];
  }
}

async function getMediaAudioChannelCount(inputPath) {
  const streams = await getMediaAudioStreams(inputPath);
  if (!streams.length) return 0;
  const sum = streams.reduce((acc, s) => acc + Math.max(0, Number(s.channels) || 0), 0);
  if (sum > 0) return sum;
  return Math.max(0, Number(streams[0]?.channels) || 0);
}

function parseFfprobeFraction(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (!raw.includes('/')) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const [a, b] = raw.split('/');
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return 0;
  return na / nb;
}

async function probeMediaTechnicalInfo(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return { available: false };
  const probe = await runCommandCapture('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath
  ]);
  if (!probe.ok) return { available: false };

  try {
    const parsed = JSON.parse(String(probe.stdout || '{}'));
    const format = parsed?.format && typeof parsed.format === 'object' ? parsed.format : {};
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const video = streams.find((s) => String(s?.codec_type || '') === 'video') || null;
    const audioStreams = streams.filter((s) => String(s?.codec_type || '') === 'audio');
    const audioPrimary = audioStreams[0] || null;
    const fps = video ? parseFfprobeFraction(video.avg_frame_rate || video.r_frame_rate) : 0;

    return {
      available: true,
      container: String(format.format_name || '').split(',').filter(Boolean),
      durationSeconds: Number.isFinite(Number(format.duration)) ? Math.max(0, Number(format.duration)) : 0,
      bitRate: Number.isFinite(Number(format.bit_rate)) ? Math.max(0, Number(format.bit_rate)) : 0,
      fileSize: Number.isFinite(Number(format.size)) ? Math.max(0, Number(format.size)) : 0,
      video: video ? {
        codec: String(video.codec_name || '').trim(),
        profile: String(video.profile || '').trim(),
        width: Number.isFinite(Number(video.width)) ? Math.max(0, Number(video.width)) : 0,
        height: Number.isFinite(Number(video.height)) ? Math.max(0, Number(video.height)) : 0,
        pixelFormat: String(video.pix_fmt || '').trim(),
        frameRate: fps > 0 ? fps : 0
      } : null,
      audio: {
        streamCount: audioStreams.length,
        codecs: Array.from(new Set(audioStreams.map((s) => String(s.codec_name || '').trim()).filter(Boolean))),
        channels: audioPrimary && Number.isFinite(Number(audioPrimary.channels)) ? Math.max(0, Number(audioPrimary.channels)) : 0,
        sampleRate: audioPrimary && Number.isFinite(Number(audioPrimary.sample_rate)) ? Math.max(0, Number(audioPrimary.sample_rate)) : 0
      }
    };
  } catch (_error) {
    return { available: false };
  }
}

function resolvePlaybackInputPath(row) {
  const proxyPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row?.proxy_url, 'proxies'));
  if (proxyPath && fs.existsSync(proxyPath)) return proxyPath;
  return resolveAssetInputPath(row);
}

async function generateVideoThumbnail(inputPath, outputPath, options = {}) {
  const requestedSeek = Number(options?.seekSeconds);
  if (Number.isFinite(requestedSeek) && requestedSeek >= 0) {
    const duration = await getVideoDurationSeconds(inputPath);
    const maxSeek = duration > 0 ? Math.max(0, duration - 0.04) : requestedSeek;
    const seek = Math.max(0, Math.min(requestedSeek, maxSeek));
    try {
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-ss',
        String(seek),
        '-frames:v',
        '1',
        '-vf',
        'scale=480:-1',
        '-q:v',
        '4',
        outputPath
      ]);
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return;
    } catch (_error) {
      // retry below with alternative seek ordering
    }
    await runFfmpeg([
      '-y',
      '-ss',
      String(seek),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-1',
      '-q:v',
      '4',
      outputPath
    ]);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return;
    throw new Error('Could not capture thumbnail at requested timecode');
  }

  try {
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vf',
      "select='gt(scene,0.3)',scale=480:-1",
      '-frames:v',
      '1',
      '-q:v',
      '4',
      outputPath
    ]);
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return;
    }
  } catch (_error) {
    // Fallback path below.
  }

  const duration = await getVideoDurationSeconds(inputPath);
  const seek = duration > 0 ? Math.max(1, Math.min(duration * 0.35, Math.max(1, duration - 1))) : 2;
  await runFfmpeg([
    '-y',
    '-ss',
    String(seek),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-1',
    '-q:v',
    '4',
    outputPath
  ]);
}

async function regenerateVideoThumbnailForAsset(row, options = {}) {
  if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
    throw new Error('Thumbnail generation with timecode is supported only for video assets');
  }
  const inputPath = resolveAssetInputPath(row);
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Source media not found');
  }

  const tcRaw = String(options.timecode || '').trim();
  const timecodeSeconds = parseAdminTimecodeToSeconds(tcRaw, 25);
  const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
  const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, row.created_at);
  await generateVideoThumbnail(inputPath, thumbOut.absolutePath, { seekSeconds: timecodeSeconds });

  const now = new Date().toISOString();
  const updated = await pool.query(
    `
      UPDATE assets
      SET thumbnail_url = $2,
          updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [row.id, thumbOut.publicUrl, now]
  );
  return {
    row: updated.rows[0],
    thumbnailUrl: thumbOut.publicUrl,
    timecodeSeconds
  };
}

async function generatePdfThumbnail(inputPath, outputPath) {
  const outBase = outputPath.replace(/\.(jpe?g|png)$/i, '');
  const ppmResult = await runCommandCapture('pdftoppm', [
    '-f', '1',
    '-singlefile',
    '-jpeg',
    '-scale-to-x', '960',
    '-scale-to-y', '-1',
    inputPath,
    outBase
  ]);
  const ppmJpg = `${outBase}.jpg`;
  if (ppmResult.ok && fs.existsSync(ppmJpg) && fs.statSync(ppmJpg).size > 0) {
    if (ppmJpg !== outputPath) {
      fs.copyFileSync(ppmJpg, outputPath);
    }
    return;
  }

  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-1',
    '-q:v',
    '4',
    outputPath
  ]);
}

async function ensureVideoProxyAndThumbnail(row, options = {}) {
  if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) return row;
  const forceProxy = Boolean(options.forceProxy);
  let inputPath = row.source_path;
  if (!inputPath || !fs.existsSync(inputPath)) {
    const mediaUrl = String(row.media_url || '');
    if (mediaUrl.startsWith('/uploads/')) {
      const rel = mediaUrl.replace('/uploads/', '');
      const candidate = path.join(UPLOADS_DIR, rel);
      if (fs.existsSync(candidate)) {
        inputPath = candidate;
      }
    }
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Source media not found');
  }

  let proxyUrl = resolveStoredUrl(row.proxy_url, 'proxies');
  let proxyStatus = row.proxy_status || 'not_applicable';
  let thumbnailUrl = resolveStoredUrl(row.thumbnail_url, 'thumbnails');
  let detectedAudioChannels = Number(row?.dc_metadata?.audioChannels) || 0;
  const now = new Date().toISOString();

  if (forceProxy && proxyUrl) {
    const prev = publicUploadUrlToAbsolutePath(proxyUrl);
    if (prev && fs.existsSync(prev)) {
      try {
        fs.unlinkSync(prev);
      } catch (_error) {
        // Ignore cleanup failure and continue with new proxy generation.
      }
    }
    proxyUrl = '';
    proxyStatus = 'pending';
  }

  if (!proxyUrl) {
    const proxyStoredName = `${Date.now()}-${nanoid()}-proxy.mp4`;
    const proxyOut = buildArtifactPath('proxies', proxyStoredName, row.created_at);
    await generateVideoProxy(inputPath, proxyOut.absolutePath);
    proxyUrl = proxyOut.publicUrl;
    proxyStatus = 'ready';
    detectedAudioChannels = await getMediaAudioChannelCount(proxyOut.absolutePath);
  } else if (!detectedAudioChannels) {
    detectedAudioChannels = await getMediaAudioChannelCount(publicUploadUrlToAbsolutePath(proxyUrl));
  }

  if (!thumbnailUrl) {
    const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
    const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, row.created_at);
    try {
      await generateVideoThumbnail(inputPath, thumbOut.absolutePath);
      thumbnailUrl = thumbOut.publicUrl;
    } catch (_error) {
      // Do not fail proxy generation if thumbnail fails.
      thumbnailUrl = row.thumbnail_url || '';
    }
  }

  const updated = await pool.query(
    `
      UPDATE assets
      SET proxy_url = $2,
          proxy_status = $3,
          thumbnail_url = $4,
          dc_metadata = jsonb_set(COALESCE(dc_metadata, '{}'::jsonb), '{audioChannels}', to_jsonb($5::int), true),
          updated_at = $6
      WHERE id = $1
      RETURNING *
    `,
    [row.id, proxyUrl, proxyStatus, thumbnailUrl, Math.max(0, Number(detectedAudioChannels) || 0), now]
  );
  return updated.rows[0];
}

function getHeaderString(req, name) {
  const value = req.headers?.[name];
  const raw = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
  if (!raw) return '';
  const maybeUtf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const hasMojibake = /[ÃÂâÅ]/.test(raw);
  try {
    // Some providers send UTF-8 names URL-encoded in headers.
    const decoded = decodeURIComponent(raw);
    if (hasMojibake && /[^\u0000-\u007f]/.test(maybeUtf8)) return maybeUtf8.normalize('NFC');
    return decoded.normalize('NFC');
  } catch (_error) {
    if (hasMojibake && /[^\u0000-\u007f]/.test(maybeUtf8)) return maybeUtf8.normalize('NFC');
    return raw.normalize('NFC');
  }
}

function decodeJwtPayload(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_error) {
    return null;
  }
}

function buildUserContextFromRequest(req) {
  const usernameRaw =
    getHeaderString(req, 'x-forwarded-user') ||
    getHeaderString(req, 'x-auth-request-user');
  const emailRaw =
    getHeaderString(req, 'x-forwarded-email') ||
    getHeaderString(req, 'x-auth-request-email');
  const preferred = getHeaderString(req, 'x-forwarded-preferred-username');
  const groupsRaw =
    getHeaderString(req, 'x-forwarded-groups') ||
    getHeaderString(req, 'x-auth-request-groups');
  const accessToken =
    getHeaderString(req, 'x-forwarded-access-token') ||
    getHeaderString(req, 'x-auth-request-access-token') ||
    String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const tokenPayload = decodeJwtPayload(accessToken) || {};
  const tokenGroups = Array.isArray(tokenPayload.groups) ? tokenPayload.groups : [];
  const realmRoles = Array.isArray(tokenPayload?.realm_access?.roles) ? tokenPayload.realm_access.roles : [];
  const resourceRoles = Object.values(tokenPayload?.resource_access || {})
    .flatMap((entry) => (Array.isArray(entry?.roles) ? entry.roles : []));
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const localFromEmail = emailRaw.includes('@') ? emailRaw.split('@')[0] : '';
  const username = preferred || (!uuidLike.test(usernameRaw) ? usernameRaw : '') || localFromEmail;
  const displayName = (!uuidLike.test(usernameRaw) ? usernameRaw : '') || username || localFromEmail;
  const groups = groupsRaw
    .split(/[,\s]+/)
    .concat(tokenGroups.map((g) => String(g || '')))
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const allRoles = realmRoles
    .concat(resourceRoles)
    .map((r) => String(r || '').trim().toLowerCase())
    .filter(Boolean);
  const adminByGroup = groups.some((g) => g === 'admin' || g === 'realm-admin' || g === 'mam-admin');
  const adminByRole = allRoles.some((r) => r === 'admin' || r === 'realm-admin' || r === 'mam-admin');
  const adminByUser = ['mamadmin', 'admin'].includes(String(username || '').toLowerCase());
  const isAdmin = adminByGroup || adminByRole || adminByUser;
  return {
    username,
    displayName,
    email: emailRaw || '',
    baseIsAdmin: isAdmin
  };
}

function normalizePermissionEntry(input, fallbackAdmin) {
  const raw = input && typeof input === 'object' ? input : {};
  const adminPageAccess = Object.prototype.hasOwnProperty.call(raw, 'adminPageAccess')
    ? Boolean(raw.adminPageAccess)
    : Boolean(fallbackAdmin);
  const assetDelete = Object.prototype.hasOwnProperty.call(raw, 'assetDelete')
    ? Boolean(raw.assetDelete)
    : Boolean(fallbackAdmin);
  return { adminPageAccess, assetDelete };
}

async function resolveEffectivePermissions(req) {
  const user = buildUserContextFromRequest(req);
  const usernameKey = String(user.username || '').trim().toLowerCase();
  const settings = await getUserPermissionsSettings();
  const override = usernameKey ? settings[usernameKey] : null;
  const effective = normalizePermissionEntry(override, user.baseIsAdmin);
  return {
    ...user,
    isAdmin: Boolean(effective.adminPageAccess),
    canAccessAdmin: Boolean(effective.adminPageAccess),
    canDeleteAssets: Boolean(effective.assetDelete),
    permissions: effective
  };
}

app.get('/api/workflow', (_req, res) => {
  res.json(WORKFLOW);
});

app.get('/api/me', async (req, res) => {
  try {
    const effective = await resolveEffectivePermissions(req);
    res.json({
      username: effective.username,
      displayName: effective.displayName,
      email: effective.email || '',
      isAdmin: effective.isAdmin,
      canAccessAdmin: effective.canAccessAdmin,
      canDeleteAssets: effective.canDeleteAssets
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to resolve user profile' });
  }
});

app.get('/api/ui-settings', async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    const playerUiMode = normalizePlayerUiMode(settings.playerUiMode);
    return res.json({ playerUiMode });
  } catch (_error) {
    return res.json({ playerUiMode: 'native' });
  }
});

function normalizeTrashScope(value, fallback = 'active') {
  const raw = String(value || fallback).trim().toLowerCase();
  return ['active', 'trash', 'all'].includes(raw) ? raw : fallback;
}

function normalizeTypesInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function mapAssetSuggestionRow(row) {
  return {
    id: row.id,
    title: String(row.title || row.file_name || row.id || ''),
    fileName: String(row.file_name || ''),
    type: String(row.type || ''),
    status: String(row.status || ''),
    inTrash: Boolean(row.deleted_at),
    updatedAt: row.updated_at
  };
}

async function queryAssetSuggestions(options = {}) {
  const q = String(options.q || '').trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(15, Number(options.limit) || 8));
  const trash = normalizeTrashScope(options.trash, 'active');
  const tag = String(options.tag || '').trim();
  const type = String(options.type || '').trim();
  const status = String(options.status || '').trim();
  const types = Array.isArray(options.types)
    ? options.types.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : normalizeTypesInput(options.types);
  const qLower = q.toLowerCase();

  const baseWhere = [];
  const baseValues = [];
  if (trash === 'trash') {
    baseWhere.push('deleted_at IS NOT NULL');
  } else if (trash !== 'all') {
    baseWhere.push('deleted_at IS NULL');
  }
  if (tag) {
    baseValues.push(tag);
    const tagParam = `$${baseValues.length}`;
    baseWhere.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
  }
  if (type) {
    baseValues.push(type.toLowerCase());
    baseWhere.push(`LOWER(type) = $${baseValues.length}`);
  }
  if (types.length) {
    baseValues.push(types);
    baseWhere.push(`
      (
        CASE
          WHEN LOWER(type) = 'image' THEN 'photo'
          WHEN LOWER(type) = 'file' THEN 'other'
          ELSE LOWER(type)
        END
      ) = ANY($${baseValues.length}::text[])
    `);
  }
  if (status) {
    baseValues.push(status.toLowerCase());
    baseWhere.push(`LOWER(status) = $${baseValues.length}`);
  }

  let rows = [];
  const rankedIds = await suggestAssetIdsElastic(q, limit * 3);
  if (Array.isArray(rankedIds) && rankedIds.length) {
    const rankedValues = [...baseValues];
    rankedValues.push(rankedIds);
    const rankedIdsIdx = rankedValues.length;
    const rankedWhere = [...baseWhere, `id = ANY($${rankedIdsIdx}::text[])`];
    rankedValues.push(limit);
    const rankedLimitIdx = rankedValues.length;
    const sql = `
      SELECT id, title, file_name, type, status, updated_at, deleted_at
      FROM assets
      ${rankedWhere.length ? `WHERE ${rankedWhere.join(' AND ')}` : ''}
      ORDER BY array_position($${rankedIdsIdx}::text[], id), updated_at DESC
      LIMIT $${rankedLimitIdx}
    `;
    const ranked = await pool.query(sql, rankedValues);
    rows = ranked.rows;
  }

  if (!rows.length) {
    const fallbackValues = [...baseValues];
    fallbackValues.push(`%${qLower}%`);
    const likeIdx = fallbackValues.length;
    fallbackValues.push(qLower);
    const eqIdx = fallbackValues.length;
    fallbackValues.push(`${qLower}%`);
    const prefixIdx = fallbackValues.length;
    fallbackValues.push(limit);
    const fallbackLimitIdx = fallbackValues.length;

    const fallbackWhere = [
      ...baseWhere,
      `(LOWER(title) LIKE $${likeIdx} OR LOWER(file_name) LIKE $${likeIdx} OR LOWER(owner) LIKE $${likeIdx})`
    ];
    const fallback = await pool.query(
      `
        SELECT id, title, file_name, type, status, updated_at, deleted_at
        FROM assets
        WHERE ${fallbackWhere.join(' AND ')}
        ORDER BY
          CASE
            WHEN LOWER(title) = $${eqIdx} THEN 0
            WHEN LOWER(file_name) = $${eqIdx} THEN 1
            WHEN LOWER(title) LIKE $${prefixIdx} THEN 2
            WHEN LOWER(file_name) LIKE $${prefixIdx} THEN 3
            ELSE 4
          END,
          updated_at DESC
        LIMIT $${fallbackLimitIdx}
      `,
      fallbackValues
    );
    rows = fallback.rows;
  }

  return rows.map(mapAssetSuggestionRow);
}

app.get('/api/assets', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const tag = (req.query.tag || '').toString().trim();
    const type = (req.query.type || '').toString().trim();
    const types = String(req.query.types || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const status = (req.query.status || '').toString().trim();
    const trash = (req.query.trash || 'active').toString().trim().toLowerCase();

    const where = [];
    const values = [];
    let rankedIds = null;

    if (trash === 'trash') {
      where.push('deleted_at IS NOT NULL');
    } else if (trash !== 'all') {
      where.push('deleted_at IS NULL');
    }

    if (q) {
      rankedIds = await searchAssetIdsElastic(q);
      if (rankedIds === null) {
        values.push(`%${q.toLowerCase()}%`);
        where.push(`(
          LOWER(title) LIKE $${values.length}
          OR LOWER(description) LIKE $${values.length}
          OR LOWER(owner) LIKE $${values.length}
          OR LOWER(COALESCE(dc_metadata::text, '')) LIKE $${values.length}
          OR EXISTS (
            SELECT 1
            FROM asset_cuts c
            WHERE c.asset_id = assets.id AND LOWER(c.label) LIKE $${values.length}
          )
        )`);
      } else if (!rankedIds.length) {
        return res.json([]);
      } else {
        values.push(rankedIds);
        where.push(`id = ANY($${values.length}::text[])`);
      }
    }
    if (tag) {
      values.push(tag);
      const tagParam = `$${values.length}`;
      where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
    }
    if (type) {
      values.push(type.toLowerCase());
      where.push(`LOWER(type) = $${values.length}`);
    }
    if (types.length) {
      values.push(types);
      where.push(`
        (
          CASE
            WHEN LOWER(type) = 'image' THEN 'photo'
            WHEN LOWER(type) = 'file' THEN 'other'
            ELSE LOWER(type)
          END
        ) = ANY($${values.length}::text[])
      `);
    }
    if (status) {
      values.push(status.toLowerCase());
      where.push(`LOWER(status) = $${values.length}`);
    }

    let orderClause = 'updated_at DESC';
    if (rankedIds && rankedIds.length) {
      values.push(rankedIds);
      orderClause = `array_position($${values.length}::text[], id), updated_at DESC`;
    }

    const sql = `
      SELECT
        assets.*,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object('label', c.label)
              ORDER BY c.created_at DESC
            ),
            '[]'::json
          )
          FROM asset_cuts c
          WHERE c.asset_id = assets.id
        ) AS cuts
      FROM assets
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderClause}
    `;

    const result = await pool.query(sql, values);
    const hydratedRows = [];
    for (const row of result.rows) {
      const withPdfThumb = await ensurePdfThumbnailForRow(row);
      // Backfill missing document thumbnails lazily so existing uploads also get previews.
      hydratedRows.push(await ensureDocumentThumbnailForRow(withPdfThumb));
    }
    res.json(hydratedRows.map(mapAssetRow));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load assets' });
  }
});

app.get('/api/assets/suggest', async (req, res) => {
  try {
    const suggestions = await queryAssetSuggestions({
      q: req.query.q,
      limit: req.query.limit,
      trash: req.query.trash,
      tag: req.query.tag,
      type: req.query.type,
      types: req.query.types,
      status: req.query.status
    });
    return res.json(suggestions);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest assets' });
  }
});

app.post('/api/assets', async (req, res) => {
  try {
    const created = await createAssetRecord(req.body);
    res.status(201).json(created);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

app.post('/api/assets/upload', async (req, res) => {
  const { fileName, mimeType, fileData, ...metadata } = req.body || {};
  if (!fileData) {
    return res.status(400).json({ error: 'fileData (base64) is required' });
  }

  const safeName = sanitizeFileName(fileName);
  const storedName = `${Date.now()}-${nanoid()}-${safeName}`;
  const ingestPath = getIngestStoragePath({ type: metadata.type, mimeType, fileName: safeName });
  const absolutePath = path.join(ingestPath.absoluteDir, storedName);
  const mediaUrl = `/uploads/${ingestPath.relativeDir.replace(/\\/g, '/')}/${storedName}`;

  try {
    const buffer = Buffer.from(String(fileData), 'base64');
    fs.writeFileSync(absolutePath, buffer);
  } catch (_error) {
    return res.status(400).json({ error: 'Could not decode or save file' });
  }

  let proxyUrl = '';
  let proxyStatus = 'not_applicable';
  let thumbnailUrl = '';
  let detectedAudioChannels = 0;

  if (isVideoCandidate({ mimeType, fileName: safeName, declaredType: metadata.type })) {
    proxyStatus = 'pending';
    const proxyStoredName = `${Date.now()}-${nanoid()}-proxy.mp4`;
    const proxyOut = buildArtifactPath('proxies', proxyStoredName, new Date());

    try {
      await generateVideoProxy(absolutePath, proxyOut.absolutePath);
      proxyUrl = proxyOut.publicUrl;
      proxyStatus = 'ready';
      detectedAudioChannels = await getMediaAudioChannelCount(proxyOut.absolutePath);
    } catch (error) {
      return res.status(500).json({ error: `Proxy generation failed for uploaded video: ${String(error.message || '').slice(0, 240)}` });
    }

    const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
    const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
    try {
      await generateVideoThumbnail(absolutePath, thumbOut.absolutePath);
      thumbnailUrl = thumbOut.publicUrl;
    } catch (_error) {
      thumbnailUrl = '';
    }
  } else if (isPdfCandidate({ mimeType, fileName: safeName })) {
    const pdfThumbName = `${Date.now()}-${nanoid()}-pdf-thumb.jpg`;
    const pdfThumbOut = buildArtifactPath('thumbnails', pdfThumbName, new Date());
    try {
      await generatePdfThumbnail(absolutePath, pdfThumbOut.absolutePath);
      thumbnailUrl = pdfThumbOut.publicUrl;
    } catch (_error) {
      const fallbackName = `${Date.now()}-${nanoid()}-pdf-thumb.svg`;
      const fallbackOut = buildArtifactPath('thumbnails', fallbackName, new Date());
      try {
        await generatePdfFallbackThumbnail(fallbackOut.absolutePath, {
          fileName: safeName,
          title: String(metadata.title || safeName)
        });
        thumbnailUrl = fallbackOut.publicUrl;
      } catch (_fallbackError) {
        thumbnailUrl = '';
      }
    }
  } else if (isDocumentCandidate({ mimeType, fileName: safeName, declaredType: metadata.type })) {
    const docThumbName = `${Date.now()}-${nanoid()}-doc-thumb-v2.svg`;
    const docThumbOut = buildArtifactPath('thumbnails', docThumbName, new Date());
    try {
      await generateDocumentThumbnail(absolutePath, docThumbOut.absolutePath, {
        fileName: safeName,
        title: String(metadata.title || safeName),
        extLabel: (getFileExtension(safeName) || 'DOC').toUpperCase(),
        includeContent: isTextDocumentCandidate({ mimeType, fileName: safeName })
      });
      thumbnailUrl = docThumbOut.publicUrl;
    } catch (_error) {
      thumbnailUrl = '';
    }
  } else if (String(mimeType || '').toLowerCase().startsWith('image/')) {
    thumbnailUrl = mediaUrl;
  }

  if (!detectedAudioChannels && String(mimeType || '').toLowerCase().startsWith('audio/')) {
    detectedAudioChannels = await getMediaAudioChannelCount(absolutePath);
  }

  const payload = {
    ...metadata,
    fileName: safeName,
    mimeType: String(mimeType || ''),
    mediaUrl,
    proxyUrl,
    proxyStatus,
    thumbnailUrl,
    dcMetadata: {
      ...(metadata?.dcMetadata && typeof metadata.dcMetadata === 'object' ? metadata.dcMetadata : {}),
      ...(detectedAudioChannels > 0 ? { audioChannels: detectedAudioChannels } : {})
    },
    sourcePath: absolutePath
  };
  if ((isVideoCandidate({ mimeType, fileName: safeName, declaredType: metadata.type }) || String(mimeType || '').toLowerCase().startsWith('audio/'))
    && (!Number(payload.durationSeconds) || Number(payload.durationSeconds) <= 0)) {
    const detected = await getVideoDurationSeconds(absolutePath);
    if (detected > 0) payload.durationSeconds = Math.round(detected);
  }

  try {
    const created = await createAssetRecord(payload);
    return res.status(201).json(created);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to create uploaded asset record' });
  }
});

app.get('/api/assets/:id', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const versionsResult = await pool.query(
      'SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    const cutsResult = await pool.query(
      'SELECT * FROM asset_cuts WHERE asset_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    const asset = mapAssetRow(assetResult.rows[0]);
    const audioCandidate = isVideoCandidate({
      mimeType: assetResult.rows[0].mime_type,
      fileName: assetResult.rows[0].file_name,
      declaredType: assetResult.rows[0].type
    }) || String(assetResult.rows[0].mime_type || '').toLowerCase().startsWith('audio/');
    if (audioCandidate && Number(asset.audioChannels || 0) <= 0) {
      const playbackPath = resolvePlaybackInputPath(assetResult.rows[0]);
      asset.audioChannels = await getMediaAudioChannelCount(playbackPath);
    }
    asset.versions = versionsResult.rows.map(mapVersionRow);
    asset.cuts = cutsResult.rows.map(mapCutRow);
    res.json(asset);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to load asset' });
  }
});

app.get('/api/assets/:id/technical', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const row = assetResult.rows[0];

    const sourcePath = (() => {
      let p = String(row.source_path || '').trim();
      if (p && fs.existsSync(p)) return p;
      const media = publicUploadUrlToAbsolutePath(row.media_url);
      if (media && fs.existsSync(media)) return media;
      return '';
    })();

    const proxyPath = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));

    const [original, proxy] = await Promise.all([
      probeMediaTechnicalInfo(sourcePath),
      probeMediaTechnicalInfo(proxyPath)
    ]);

    return res.json({
      assetId: row.id,
      original: {
        label: 'original',
        url: String(row.media_url || ''),
        ...original
      },
      proxy: {
        label: 'proxy',
        url: String(resolveStoredUrl(row.proxy_url, 'proxies') || ''),
        ...proxy
      }
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load technical info' });
  }
});

app.post('/api/assets/:id/subtitles', async (req, res) => {
  try {
    const { fileName, fileData, lang } = req.body || {};
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'fileName and fileData are required' });
    }
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
    }

    const safeName = sanitizeFileName(fileName);
    const ext = path.extname(safeName).toLowerCase();
    if (ext !== '.vtt' && ext !== '.srt') {
      return res.status(400).json({ error: 'Only .vtt or .srt subtitle files are supported' });
    }

    let rawText = '';
    try {
      rawText = Buffer.from(String(fileData), 'base64').toString('utf8');
    } catch (_error) {
      return res.status(400).json({ error: 'Could not decode subtitle file' });
    }

    const subtitleVtt = ext === '.srt' ? convertSrtToVtt(rawText) : normalizeVttContent(rawText);
    const base = path.basename(safeName, ext) || 'subtitle';
    const storedName = `${Date.now()}-${nanoid()}-${sanitizeFileName(base)}.vtt`;
    const subtitleOut = buildArtifactPath('subtitles', storedName, row.created_at);
    fs.writeFileSync(subtitleOut.absolutePath, subtitleVtt, 'utf8');

    const subtitleUrl = subtitleOut.publicUrl;
    const updatedRow = await saveAssetSubtitleMetadata(
      req.params.id,
      row,
      subtitleUrl,
      normalizeSubtitleLang(lang),
      safeName
    );
    return res.json({
      subtitleUrl,
      subtitleLang: normalizeSubtitleLang(lang),
      subtitleLabel: safeName,
      asset: mapAssetRow(updatedRow)
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to upload subtitle' });
  }
});

app.post('/api/assets/:id/subtitles/generate', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
    }

    const subtitleLang = normalizeSubtitleLang(req.body?.lang);
    const subtitleLabel = String(req.body?.label || 'auto-whisper').trim() || 'auto-whisper';
    const model = String(req.body?.model || WHISPER_MODEL || 'tiny').trim() || 'tiny';
    const job = queueSubtitleGenerationJob(row, {
      lang: subtitleLang,
      label: subtitleLabel,
      model
    });
    return res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      subtitleLang,
      subtitleLabel,
      model
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to generate subtitle' });
  }
});

app.get('/api/subtitle-jobs/:jobId', (req, res) => {
  const job = subtitleJobs.get(String(req.params.jobId || '').trim());
  if (!job) return res.status(404).json({ error: 'Subtitle job not found' });
  return res.json({
    jobId: job.jobId,
    assetId: job.assetId,
    status: job.status,
    subtitleUrl: job.subtitleUrl || '',
    subtitleLang: job.subtitleLang || '',
    subtitleLabel: job.subtitleLabel || '',
    model: job.model || '',
    asset: job.asset || null,
    error: job.error || '',
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt || ''
  });
});

app.post('/api/assets/:id/video-ocr/extract', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'OCR extraction is supported only for video assets' });
    }

    const job = queueVideoOcrJob(row, {
      intervalSec: req.body?.intervalSec,
      ocrLang: req.body?.ocrLang,
      ocrEngine: req.body?.ocrEngine
    });
    return res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      intervalSec: job.intervalSec,
      ocrLang: job.ocrLang,
      ocrEngine: job.ocrEngine
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to queue video OCR extraction' });
  }
});

app.get('/api/video-ocr-jobs/:jobId', (req, res) => {
  const job = videoOcrJobs.get(String(req.params.jobId || '').trim());
  if (!job) return res.status(404).json({ error: 'Video OCR job not found' });
  return res.json({
    jobId: job.jobId,
    assetId: job.assetId,
    status: job.status,
    intervalSec: job.intervalSec,
    ocrLang: job.ocrLang,
    ocrEngine: job.ocrEngine,
    requestedEngine: job.requestedEngine,
    resultUrl: job.resultUrl || '',
    downloadUrl: job.resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(job.jobId)}/download` : '',
    resultLabel: job.resultLabel || '',
    lineCount: Number(job.lineCount || 0),
    warning: job.warning || '',
    error: job.error || '',
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt || ''
  });
});

app.get('/api/video-ocr-jobs/:jobId/download', (req, res) => {
  const jobId = String(req.params.jobId || '').trim();
  const job = videoOcrJobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Video OCR job not found' });
  if (String(job.status || '') !== 'completed') {
    return res.status(409).json({ error: 'OCR file is not ready yet' });
  }

  const filePath = String(job.resultPath || '').trim() || publicUploadUrlToAbsolutePath(job.resultUrl);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'OCR file not found' });
  }
  const fileName = String(job.resultLabel || path.basename(filePath) || 'video-ocr.txt').trim() || 'video-ocr.txt';

  return res.download(filePath, fileName, (error) => {
    if (error) return;
    safeRmDir(job.frameDir);
    job.frameDir = '';
    job.updatedAt = new Date().toISOString();
  });
});

app.patch('/api/assets/:id/subtitles', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
    }

    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = sanitizeSubtitleItems(dc.subtitleItems);
    const requestedUrl = String(req.body?.subtitleUrl || '').trim();
    const subtitleUrl = requestedUrl || String(dc.subtitleUrl || '').trim();
    if (!subtitleUrl) return res.status(400).json({ error: 'No subtitle found for this asset' });
    const exists = items.some((item) => item.subtitleUrl === subtitleUrl);
    if (!exists) return res.status(400).json({ error: 'Subtitle item not found' });

    const subtitleLang = normalizeSubtitleLang(req.body?.lang || dc.subtitleLang || 'tr');
    const subtitleLabel = String(req.body?.label || dc.subtitleLabel || '').trim() || 'subtitle';
    const updatedItems = items.map((item) => {
      if (item.subtitleUrl !== subtitleUrl) return item;
      return {
        ...item,
        subtitleLang,
        subtitleLabel
      };
    });
    const updatedDc = {
      ...dc,
      subtitleUrl,
      subtitleLang,
      subtitleLabel,
      subtitleItems: updatedItems
    };
    const updatedResult = await pool.query(
      `
        UPDATE assets
        SET dc_metadata = $2::jsonb,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    const updatedRow = updatedResult.rows[0];
    return res.json({
      subtitleUrl,
      subtitleLang,
      subtitleLabel,
      asset: mapAssetRow(updatedRow)
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update subtitle metadata' });
  }
});

app.delete('/api/assets/:id/subtitles', requireAssetDelete, async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'Subtitles are supported only for video assets' });
    }

    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const subtitleUrl = String(req.body?.subtitleUrl || '').trim();
    if (!subtitleUrl) return res.status(400).json({ error: 'subtitleUrl is required' });

    const items = sanitizeSubtitleItems(dc.subtitleItems);
    const exists = items.some((item) => item.subtitleUrl === subtitleUrl);
    if (!exists) return res.status(404).json({ error: 'Subtitle item not found' });

    const nextItems = items.filter((item) => item.subtitleUrl !== subtitleUrl);
    let nextActive = String(dc.subtitleUrl || '').trim();
    if (nextActive === subtitleUrl) {
      nextActive = nextItems.length ? nextItems[nextItems.length - 1].subtitleUrl : '';
    }
    const activeItem = nextItems.find((item) => item.subtitleUrl === nextActive);
    const nextLang = activeItem ? normalizeSubtitleLang(activeItem.subtitleLang) : '';
    const nextLabel = activeItem ? String(activeItem.subtitleLabel || '').trim() : '';

    const updatedDc = {
      ...dc,
      subtitleUrl: nextActive,
      subtitleLang: nextLang,
      subtitleLabel: nextLabel,
      subtitleItems: nextItems
    };
    const updatedResult = await pool.query(
      `
        UPDATE assets
        SET dc_metadata = $2::jsonb,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [req.params.id, JSON.stringify(updatedDc), new Date().toISOString()]
    );

    const filePath = publicUploadUrlToAbsolutePath(subtitleUrl);
    if (filePath && filePath.startsWith(SUBTITLES_DIR) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_error) {}
    }

    return res.json({
      removed: subtitleUrl,
      asset: mapAssetRow(updatedResult.rows[0])
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to remove subtitle' });
  }
});

app.get('/api/assets/:id/preview-text', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const row = assetResult.rows[0];
    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }

    const preview = await extractPreviewContentFromFile(row, inputPath);
    const hasContent = Boolean(String(preview.text || '').trim() || String(preview.html || '').trim());
    if (!hasContent) return res.json({ text: '', html: '', mode: 'text', available: false });
    return res.json({
      text: preview.text || '',
      html: preview.html || '',
      mode: preview.mode || 'text',
      available: true
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load preview text' });
  }
});

app.get('/api/assets/:id/pdf-search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const pages = await extractPdfPagesText(inputPath);
    if (!pages.length) {
      return res.json({ query, totalPages: 0, matches: [] });
    }

    const queryLower = query.toLowerCase();
    const matches = [];
    for (let i = 0; i < pages.length; i += 1) {
      const pageText = String(pages[i] || '');
      const lowered = pageText.toLowerCase();
      let from = 0;
      let count = 0;
      while (true) {
        const hit = lowered.indexOf(queryLower, from);
        if (hit < 0) break;
        count += 1;
        from = hit + queryLower.length;
      }
      if (count > 0) {
        matches.push({
          page: i + 1,
          count,
          snippet: buildPdfSearchSnippet(pageText, query)
        });
      }
    }

    return res.json({ query, totalPages: pages.length, matches: matches.slice(0, 200) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to search PDF' });
  }
});

app.get('/api/assets/:id/pdf-search-ocr', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required' });
    const lang = String(req.query.lang || 'tur+eng').trim() || 'tur+eng';
    const width = Math.max(700, Math.min(2200, Number(req.query.width) || 1400));

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const totalPages = await getPdfPageCount(inputPath);
    const matches = [];
    for (let p = 1; p <= totalPages; p += 1) {
      const words = await ocrPdfWordsForPage({
        assetId: row.id,
        inputPath,
        page: p,
        width,
        lang
      });
      if (!words.length) continue;
      const ranges = findOcrPhraseMatches(words, query);
      if (!ranges.length) continue;

      ranges.forEach(([startIdx, endIdx]) => {
        matches.push({
          page: p,
          count: 1,
          snippet: makeOcrSnippet(words, startIdx, endIdx),
          box: matchBoxFromWords(words, startIdx, endIdx)
        });
      });
    }

    return res.json({
      query,
      lang,
      totalPages,
      ocrWidth: width,
      matches: matches.slice(0, 500)
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to search PDF with OCR' });
  }
});

app.get('/api/assets/:id/pdf-meta', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const totalPages = await getPdfPageCount(inputPath);
    return res.json({ totalPages });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF metadata' });
  }
});

app.get('/api/assets/:id/pdf-page-image', async (req, res) => {
  try {
    const requestedPage = Math.max(1, Number(req.query.page) || 1);
    const requestedWidth = Math.max(320, Math.min(2200, Number(req.query.width) || 1200));

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not a PDF' });
    }

    let inputPath = row.source_path;
    if (!inputPath || !fs.existsSync(inputPath)) {
      const mediaPath = publicUploadUrlToAbsolutePath(row.media_url);
      if (mediaPath && fs.existsSync(mediaPath)) inputPath = mediaPath;
    }
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const totalPages = await getPdfPageCount(inputPath);
    const safePage = totalPages > 0 ? Math.min(requestedPage, totalPages) : requestedPage;
    const imageBuffer = await renderPdfPageJpegBuffer(inputPath, safePage, requestedWidth);
    if (!imageBuffer) return res.status(500).json({ error: 'Failed to render PDF page image' });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(imageBuffer);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF page image' });
  }
});

app.post('/api/assets/:id/ensure-proxy', async (req, res) => {
  try {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const row = await ensureVideoProxyAndThumbnail(assetResult.rows[0], {
      forceProxy: Boolean(req.body?.force)
    });
    return res.json(mapAssetRow(row));
  } catch (error) {
    return res.status(500).json({ error: `Failed to generate proxy/thumbnail: ${String(error.message || '').slice(0, 240)}` });
  }
});

app.post('/api/assets/backfill-proxies', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assets WHERE deleted_at IS NULL ORDER BY created_at ASC');
    let processed = 0;
    let generated = 0;
    const errors = [];

    for (const row of result.rows) {
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        continue;
      }
      processed += 1;
      if (hasStoredFile(row.proxy_url, 'proxies') && hasStoredFile(row.thumbnail_url, 'thumbnails')) {
        continue;
      }
      try {
        await ensureVideoProxyAndThumbnail(row);
        generated += 1;
      } catch (error) {
        errors.push({ assetId: row.id, error: String(error.message || '').slice(0, 180) });
      }
    }

    return res.json({ processed, generated, errors });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to backfill proxies' });
  }
});

async function requireAdminAccess(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canAccessAdmin) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify admin permissions' });
  }
}

async function requireAssetDelete(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canDeleteAssets) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify delete permissions' });
  }
}

app.use('/api/admin', requireAdminAccess);

app.get('/api/admin/workflow-tracking', async (_req, res) => {
  try {
    const [statusCounts, typeCounts, totals, proxyRows] = await Promise.all([
      pool.query(
        `
          SELECT status, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY status
          ORDER BY status
        `
      ),
      pool.query(
        `
          SELECT type, COUNT(*)::int AS count
          FROM assets
          WHERE deleted_at IS NULL
          GROUP BY type
          ORDER BY type
        `
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_all,
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_active,
            COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS total_trash
          FROM assets
        `
      ),
      pool.query(
        `
          SELECT id, deleted_at, type, mime_type, file_name, proxy_url
          FROM assets
        `
      )
    ]);

    const statusMap = Object.fromEntries(WORKFLOW.map((s) => [s, 0]));
    statusCounts.rows.forEach((row) => {
      statusMap[row.status] = row.count;
    });

    const types = {};
    typeCounts.rows.forEach((row) => {
      types[row.type] = row.count;
    });

    const proxies = { ready: 0, missing: 0 };
    proxyRows.rows.forEach((row) => {
      if (row.deleted_at) return;
      const isVideo = isVideoCandidate({
        mimeType: row.mime_type,
        fileName: row.file_name,
        declaredType: row.type
      });
      if (!isVideo) return;
      if (hasStoredFile(row.proxy_url, 'proxies')) proxies.ready += 1;
      else proxies.missing += 1;
    });

    return res.json({
      totals: totals.rows[0],
      workflow: statusMap,
      types,
      proxies
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load workflow tracking' });
  }
});

app.get('/api/admin/settings', async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    return res.json(settings);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.patch('/api/admin/settings', async (req, res) => {
  try {
    const current = await getAdminSettings();
    const next = {
      ...current,
      workflowTrackingEnabled: Object.prototype.hasOwnProperty.call(req.body, 'workflowTrackingEnabled')
        ? Boolean(req.body.workflowTrackingEnabled)
        : current.workflowTrackingEnabled,
      autoProxyBackfillOnUpload: Object.prototype.hasOwnProperty.call(req.body, 'autoProxyBackfillOnUpload')
        ? Boolean(req.body.autoProxyBackfillOnUpload)
        : current.autoProxyBackfillOnUpload,
      playerUiMode: Object.prototype.hasOwnProperty.call(req.body, 'playerUiMode')
        ? normalizePlayerUiMode(req.body.playerUiMode)
        : normalizePlayerUiMode(current.playerUiMode),
      apiTokenEnabled: Object.prototype.hasOwnProperty.call(req.body, 'apiTokenEnabled')
        ? Boolean(req.body.apiTokenEnabled)
        : current.apiTokenEnabled,
      apiToken: Object.prototype.hasOwnProperty.call(req.body, 'apiToken')
        ? String(req.body.apiToken || '').trim()
        : current.apiToken,
      oidcBearerEnabled: Object.prototype.hasOwnProperty.call(req.body, 'oidcBearerEnabled')
        ? Boolean(req.body.oidcBearerEnabled)
        : current.oidcBearerEnabled,
      oidcIssuerUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcIssuerUrl')
        ? String(req.body.oidcIssuerUrl || '').trim()
        : current.oidcIssuerUrl,
      oidcJwksUrl: Object.prototype.hasOwnProperty.call(req.body, 'oidcJwksUrl')
        ? String(req.body.oidcJwksUrl || '').trim()
        : current.oidcJwksUrl,
      oidcAudience: Object.prototype.hasOwnProperty.call(req.body, 'oidcAudience')
        ? String(req.body.oidcAudience || '').trim()
        : current.oidcAudience
    };
    const saved = await saveAdminSettings(next);
    return res.json(saved);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/admin/user-permissions', async (req, res) => {
  try {
    const saved = await getUserPermissionsSettings();
    const fromAssets = await pool.query('SELECT DISTINCT owner FROM assets WHERE owner IS NOT NULL AND owner <> \'\'');
    const usernames = new Set(
      fromAssets.rows.map((r) => String(r.owner || '').trim().toLowerCase()).filter(Boolean)
    );
    Object.keys(saved || {}).forEach((k) => usernames.add(String(k || '').trim().toLowerCase()));
    const me = await resolveEffectivePermissions(req);
    if (me.username) usernames.add(String(me.username).trim().toLowerCase());
    usernames.add('admin');
    usernames.add('mamadmin');

    const users = Array.from(usernames)
      .sort((a, b) => a.localeCompare(b))
      .map((username) => {
        const defaults = ['admin', 'mamadmin'].includes(username);
        const effective = normalizePermissionEntry(saved?.[username], defaults);
        return {
          username,
          adminPageAccess: effective.adminPageAccess,
          assetDelete: effective.assetDelete
        };
      });
    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

app.patch('/api/admin/user-permissions/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });

    const current = await getUserPermissionsSettings();
    const nextEntry = normalizePermissionEntry(
      {
        adminPageAccess: req.body?.adminPageAccess,
        assetDelete: req.body?.assetDelete
      },
      ['admin', 'mamadmin'].includes(username)
    );
    const next = {
      ...current,
      [username]: nextEntry
    };
    await saveUserPermissionsSettings(next);
    return res.json({
      username,
      ...nextEntry
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save user permissions' });
  }
});

app.post('/api/admin/api-token/rotate', async (_req, res) => {
  try {
    const current = await getAdminSettings();
    const next = {
      ...current,
      apiToken: generateApiToken()
    };
    const saved = await saveAdminSettings(next);
    return res.json({ apiToken: saved.apiToken });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to rotate API token' });
  }
});

app.get('/api/admin/ffmpeg-health', async (_req, res) => {
  try {
    const [ffmpeg, ffprobe] = await Promise.all([
      runCommandCapture('ffmpeg', ['-version']),
      runCommandCapture('ffprobe', ['-version'])
    ]);
    return res.json({
      ffmpegOk: ffmpeg.ok,
      ffprobeOk: ffprobe.ok,
      ffmpegInfo: (ffmpeg.stdout || ffmpeg.stderr).split('\n')[0] || '',
      ffprobeInfo: (ffprobe.stdout || ffprobe.stderr).split('\n')[0] || ''
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to check ffmpeg health' });
  }
});

app.post('/api/admin/search/reindex', async (_req, res) => {
  try {
    await ensureElasticIndex();
    const assets = await pool.query('SELECT id FROM assets');
    let indexed = 0;
    for (const row of assets.rows) {
      await indexAssetToElastic(row.id).catch(() => {});
      indexed += 1;
    }
    return res.json({ indexed });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to reindex search' });
  }
});

app.post('/api/admin/proxy-jobs', async (req, res) => {
  const running = Array.from(proxyJobs.values()).find((job) => job.status === 'running' || job.status === 'queued');
  if (running) {
    return res.status(409).json({ error: 'A proxy job is already running', job: running });
  }

  const job = createProxyJob();
  setTimeout(() => {
    runProxyJob(job.id, { includeTrash: Boolean(req.body?.includeTrash) }).catch(() => {});
  }, 0);
  return res.status(202).json(job);
});

app.get('/api/admin/proxy-jobs/:id', async (req, res) => {
  const job = proxyJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Proxy job not found' });
  return res.json(job);
});

app.get('/api/admin/proxy-jobs', async (_req, res) => {
  const jobs = Array.from(proxyJobs.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.json(jobs.slice(0, 20));
});

app.get('/api/admin/assets/suggest', async (req, res) => {
  try {
    const includeTrashRaw = String(req.query.includeTrash || '1').trim().toLowerCase();
    const includeTrash = !['0', 'false', 'no'].includes(includeTrashRaw);
    const suggestions = await queryAssetSuggestions({
      q: req.query.q,
      limit: req.query.limit,
      trash: includeTrash ? 'all' : 'active'
    });
    return res.json(
      suggestions.map((row) => ({
        id: row.id,
        title: row.title,
        fileName: row.fileName,
        type: row.type,
        inTrash: row.inTrash,
        updatedAt: row.updatedAt
      }))
    );
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest assets' });
  }
});

app.post('/api/admin/proxy-tools/run', async (req, res) => {
  try {
    const assetName = String(req.body?.assetName || '').trim();
    const mode = String(req.body?.mode || '').trim().toLowerCase();
    if (!assetName) return res.status(400).json({ error: 'assetName is required' });
    if (!['thumbnail', 'preview', 'proxy'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be one of: thumbnail, preview, proxy' });
    }

    const like = `%${assetName}%`;
    const match = await pool.query(
      `
        SELECT *
        FROM assets
        WHERE title ILIKE $1 OR file_name ILIKE $1
        ORDER BY
          CASE
            WHEN LOWER(title) = LOWER($2) THEN 0
            WHEN LOWER(file_name) = LOWER($2) THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT 20
      `,
      [like, assetName]
    );
    if (!match.rowCount) return res.status(404).json({ error: 'Asset not found by name' });

    let row = match.rows[0];
    let info = {};

    if (mode === 'proxy') {
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Proxy generation is supported only for video assets' });
      }
      row = await ensureVideoProxyAndThumbnail(row, { forceProxy: true });
      info = {
        proxyUrl: resolveStoredUrl(row.proxy_url, 'proxies'),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    } else if (mode === 'thumbnail') {
      const result = await regenerateVideoThumbnailForAsset(row, { timecode: req.body?.timecode });
      row = result.row;
      info = {
        thumbnailUrl: result.thumbnailUrl,
        timecode: result.timecodeSeconds == null ? '' : formatTimecode(result.timecodeSeconds)
      };
    } else if (mode === 'preview') {
      if (!isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Preview generation is supported for document assets in this tool' });
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source file not found' });
      if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
        row = await ensurePdfThumbnailForRow(row);
      } else {
        row = await ensureDocumentThumbnailForRow(row);
      }
      const preview = await extractPreviewContentFromFile(row, inputPath);
      info = {
        previewMode: String(preview.mode || 'text'),
        previewChars: Math.max(0, String(preview.html || preview.text || '').length),
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails')
      };
    }

    return res.json({
      ok: true,
      mode,
      matchedCount: match.rowCount,
      assetId: row.id,
      assetTitle: String(row.title || row.file_name || row.id),
      ...info,
      asset: mapAssetRow(row)
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to run proxy tool action: ${String(error?.message || 'unknown error').slice(0, 260)}` });
  }
});

app.post('/api/assets/:id/cuts', async (req, res) => {
  const inPoint = Number(req.body.inPointSeconds);
  const outPoint = Number(req.body.outPointSeconds);

  if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || inPoint < 0 || outPoint < inPoint) {
    return res.status(400).json({ error: 'Invalid IN/OUT points' });
  }

  try {
    const exists = await pool.query('SELECT id FROM assets WHERE id = $1', [req.params.id]);
    if (!exists.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const now = new Date().toISOString();
    const cut = {
      cutId: nanoid(),
      label: req.body.label?.trim() || `Cut ${new Date().toLocaleTimeString()}`,
      inPointSeconds: inPoint,
      outPointSeconds: outPoint,
      createdAt: now
    };

    await pool.query(
      `
        INSERT INTO asset_cuts (cut_id, asset_id, label, in_point_seconds, out_point_seconds, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [cut.cutId, req.params.id, cut.label, cut.inPointSeconds, cut.outPointSeconds, cut.createdAt]
    );
    await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, now]);
    await indexAssetToElastic(req.params.id).catch(() => {});

    return res.status(201).json(cut);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save cut' });
  }
});

app.delete('/api/assets/:id/cuts/:cutId', requireAssetDelete, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM asset_cuts WHERE cut_id = $1 AND asset_id = $2 RETURNING cut_id',
      [req.params.cutId, req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Cut not found' });
    }
    await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, new Date().toISOString()]);
    await indexAssetToElastic(req.params.id).catch(() => {});
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete cut' });
  }
});

app.patch('/api/assets/:id/cuts/:cutId', async (req, res) => {
  const hasLabel = Object.prototype.hasOwnProperty.call(req.body || {}, 'label');
  const hasInPoint = Object.prototype.hasOwnProperty.call(req.body || {}, 'inPointSeconds');
  const hasOutPoint = Object.prototype.hasOwnProperty.call(req.body || {}, 'outPointSeconds');
  const nextLabel = hasLabel ? String(req.body?.label || '').trim() : null;
  const nextInPoint = hasInPoint ? Number(req.body?.inPointSeconds) : null;
  const nextOutPoint = hasOutPoint ? Number(req.body?.outPointSeconds) : null;

  if (!hasLabel && !hasInPoint && !hasOutPoint) {
    return res.status(400).json({ error: 'At least one cut field is required' });
  }
  if (hasLabel && !nextLabel) {
    return res.status(400).json({ error: 'Cut label is required' });
  }
  if (hasInPoint && (!Number.isFinite(nextInPoint) || nextInPoint < 0)) {
    return res.status(400).json({ error: 'Invalid IN point' });
  }
  if (hasOutPoint && (!Number.isFinite(nextOutPoint) || nextOutPoint < 0)) {
    return res.status(400).json({ error: 'Invalid OUT point' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM asset_cuts WHERE cut_id = $1 AND asset_id = $2',
      [req.params.cutId, req.params.id]
    );
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'Cut not found' });
    }

    const current = existing.rows[0];
    const inPoint = hasInPoint ? nextInPoint : Number(current.in_point_seconds);
    const outPoint = hasOutPoint ? nextOutPoint : Number(current.out_point_seconds);
    if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || outPoint < inPoint) {
      return res.status(400).json({ error: 'Invalid IN/OUT points' });
    }
    const label = hasLabel ? nextLabel : String(current.label || '').trim() || `Cut ${new Date().toLocaleTimeString()}`;

    const result = await pool.query(
      `
        UPDATE asset_cuts
        SET label = $3,
            in_point_seconds = $4,
            out_point_seconds = $5
        WHERE cut_id = $1 AND asset_id = $2
        RETURNING *
      `,
      [req.params.cutId, req.params.id, label, inPoint, outPoint]
    );
    await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, new Date().toISOString()]);
    await indexAssetToElastic(req.params.id).catch(() => {});
    return res.json(mapCutRow(result.rows[0]));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update cut' });
  }
});

app.post('/api/assets/:id/trash', requireAssetDelete, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await pool.query(
      'UPDATE assets SET deleted_at = $2, updated_at = $2 WHERE id = $1 RETURNING *',
      [req.params.id, now]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    await indexAssetToElastic(req.params.id).catch(() => {});
    return res.json(mapAssetRow(result.rows[0]));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to move asset to trash' });
  }
});

app.post('/api/assets/:id/restore', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await pool.query(
      'UPDATE assets SET deleted_at = NULL, updated_at = $2 WHERE id = $1 RETURNING *',
      [req.params.id, now]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    await indexAssetToElastic(req.params.id).catch(() => {});
    return res.json(mapAssetRow(result.rows[0]));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore asset' });
  }
});

app.delete('/api/assets/:id', requireAssetDelete, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM assets WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    await removeAssetFromElastic(req.params.id).catch(() => {});
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete asset' });
  }
});

app.patch('/api/assets/:id', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const row = existing.rows[0];
    const incomingDcMetadata = sanitizeDcMetadata(body.dcMetadata);
    const parsedDuration = Number(body.durationSeconds);
    const updated = {
      title: Object.prototype.hasOwnProperty.call(body, 'title') ? String(body.title) : row.title,
      description: Object.prototype.hasOwnProperty.call(body, 'description')
        ? String(body.description)
        : row.description,
      owner: Object.prototype.hasOwnProperty.call(body, 'owner') ? String(body.owner) : row.owner,
      durationSeconds: Object.prototype.hasOwnProperty.call(body, 'durationSeconds')
        ? (Number.isFinite(parsedDuration) ? parsedDuration : row.duration_seconds)
        : row.duration_seconds,
      sourcePath: Object.prototype.hasOwnProperty.call(body, 'sourcePath')
        ? String(body.sourcePath)
        : row.source_path,
      tags: Object.prototype.hasOwnProperty.call(body, 'tags') ? toTags(body.tags) : row.tags,
      dcMetadata: {
        ...(row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {}),
        ...incomingDcMetadata
      },
      updatedAt: new Date().toISOString()
    };

    if (Object.prototype.hasOwnProperty.call(body, 'title')) updated.dcMetadata.title = updated.title;
    if (Object.prototype.hasOwnProperty.call(body, 'owner')) updated.dcMetadata.creator = updated.owner;
    if (Object.prototype.hasOwnProperty.call(body, 'description') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'description')) {
      updated.dcMetadata.description = updated.description;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'tags') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'subject')) {
      updated.dcMetadata.subject = updated.tags.join(', ');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sourcePath') && !Object.prototype.hasOwnProperty.call(incomingDcMetadata, 'source')) {
      updated.dcMetadata.source = updated.sourcePath;
    }
    if (row.file_name) updated.dcMetadata.identifier = row.file_name;
    if (row.mime_type) updated.dcMetadata.format = row.mime_type;
    if (row.type) updated.dcMetadata.type = row.type;

    const result = await pool.query(
      `
        UPDATE assets
        SET title = $2,
            description = $3,
            owner = $4,
            duration_seconds = $5,
            source_path = $6,
            tags = $7,
            dc_metadata = $8::jsonb,
            updated_at = $9
        WHERE id = $1
        RETURNING *
      `,
      [
        req.params.id,
        updated.title,
        updated.description,
        updated.owner,
        updated.durationSeconds,
        updated.sourcePath,
        updated.tags,
        JSON.stringify(updated.dcMetadata),
        updated.updatedAt
      ]
    );

    await indexAssetToElastic(req.params.id).catch(() => {});
    res.json(mapAssetRow(result.rows[0]));
  } catch (_error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

app.post('/api/assets/:id/versions', async (req, res) => {
  try {
    const exists = await pool.query('SELECT id FROM assets WHERE id = $1', [req.params.id]);
    if (!exists.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [req.params.id]);
    const count = countResult.rows[0].c;

    const version = {
      versionId: nanoid(),
      label: req.body.label?.trim() || `v${count + 1}`,
      note: req.body.note?.trim() || 'Version update',
      createdAt: new Date().toISOString()
    };

    await pool.query(
      'INSERT INTO asset_versions (version_id, asset_id, label, note, created_at) VALUES ($1,$2,$3,$4,$5)',
      [version.versionId, req.params.id, version.label, version.note, version.createdAt]
    );
    await pool.query('UPDATE assets SET updated_at = $2 WHERE id = $1', [req.params.id, version.createdAt]);

    res.status(201).json(version);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to create version' });
  }
});

app.post('/api/assets/:id/transition', async (req, res) => {
  const nextStatus = req.body.status?.trim();

  if (!WORKFLOW.includes(nextStatus)) {
    return res.status(400).json({ error: `Invalid status. Expected one of: ${WORKFLOW.join(', ')}` });
  }

  try {
    const current = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!current.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const currentIndex = WORKFLOW.indexOf(current.rows[0].status);
    const nextIndex = WORKFLOW.indexOf(nextStatus);

    if (nextIndex < currentIndex) {
      return res.status(400).json({ error: 'Backward transitions are not allowed in this MVP' });
    }

    const updatedAt = new Date().toISOString();
    const result = await pool.query(
      'UPDATE assets SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *',
      [req.params.id, nextStatus, updatedAt]
    );

    await indexAssetToElastic(req.params.id).catch(() => {});
    res.json(mapAssetRow(result.rows[0]));
  } catch (_error) {
    res.status(500).json({ error: 'Failed to transition asset status' });
  }
});

app.get('/api/collections', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM collections ORDER BY updated_at DESC');
    const collections = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      assetIds: row.asset_ids || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json(collections);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to load collections' });
  }
});

app.post('/api/collections', async (req, res) => {
  const name = req.body.name?.trim();
  const assetIds = Array.isArray(req.body.assetIds) ? req.body.assetIds : [];

  if (!name) {
    return res.status(400).json({ error: 'Collection name is required' });
  }

  const now = new Date().toISOString();
  const collection = {
    id: nanoid(),
    name,
    assetIds,
    createdAt: now,
    updatedAt: now
  };

  try {
    await pool.query(
      `
        INSERT INTO collections (id, name, asset_ids, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [collection.id, collection.name, collection.assetIds, collection.createdAt, collection.updatedAt]
    );
    res.status(201).json(collection);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

initDb()
  .then(() => {
    ensureElasticIndex()
      .then(() => backfillElasticIndex().catch(() => {}))
      .catch(() => {});
    app.listen(PORT, () => {
      console.log(`MAM MVP running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize PostgreSQL schema:', error.message);
    process.exit(1);
  });
