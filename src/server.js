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
const proxyJobs = new Map();

app.use(express.json({ limit: '300mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const WORKFLOW = ['Ingested', 'QC', 'Approved', 'Published', 'Archived'];
const DEFAULT_ADMIN_SETTINGS = {
  workflowTrackingEnabled: true,
  autoProxyBackfillOnUpload: false,
  apiTokenEnabled: false,
  apiToken: '',
  oidcBearerEnabled: false,
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL || 'http://keycloak:8080/realms/mam',
  oidcJwksUrl: process.env.OIDC_JWKS_URL || 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
  oidcAudience: process.env.OIDC_AUDIENCE || ''
};
const ELASTIC_URL = process.env.ELASTIC_URL || 'http://localhost:9200';
const ELASTIC_INDEX = process.env.ELASTIC_INDEX || 'mam_assets';
const OIDC_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const oidcJwksCache = new Map();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PROXIES_DIR)) {
  fs.mkdirSync(PROXIES_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBNAILS_DIR)) {
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
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

async function backfillElasticIndex() {
  await ensureElasticIndex();
  const result = await pool.query('SELECT id FROM assets');
  for (const row of result.rows) {
    await indexAssetToElastic(row.id).catch(() => {});
  }
}

function sanitizeFileName(fileName) {
  const cleaned = String(fileName || 'asset.bin').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'asset.bin';
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
  const thumbAbsolutePath = path.join(THUMBNAILS_DIR, thumbStoredName);
  const extLabel = (ext || 'DOC').toUpperCase();

  try {
    await generateDocumentThumbnail(inputPath, thumbAbsolutePath, {
      fileName: row.file_name,
      title: row.title || row.file_name || 'Document',
      extLabel,
      includeContent: isTextDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })
    });
    const thumbnailUrl = `/uploads/thumbnails/${thumbStoredName}`;
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
    const pdfThumbPath = path.join(THUMBNAILS_DIR, pdfThumbName);
    try {
      await generatePdfThumbnail(inputPath, pdfThumbPath);
      thumbnailUrl = `/uploads/thumbnails/${pdfThumbName}`;
    } catch (_error) {
      thumbnailUrl = '';
    }
  }

  if (!thumbnailUrl) {
    const fallbackName = `${Date.now()}-${nanoid()}-pdf-thumb.svg`;
    const fallbackPath = path.join(THUMBNAILS_DIR, fallbackName);
    try {
      await generatePdfFallbackThumbnail(fallbackPath, {
        fileName: row.file_name,
        title: row.title || row.file_name || 'PDF Document'
      });
      thumbnailUrl = `/uploads/thumbnails/${fallbackName}`;
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
    dcMetadata: row.dc_metadata || {},
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
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
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
      'scale=640:-2:force_original_aspect_ratio=decrease',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath
    ];

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

function runCommandCapture(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

async function generateVideoThumbnail(inputPath, outputPath) {
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
    const proxyAbsolutePath = path.join(PROXIES_DIR, proxyStoredName);
    await generateVideoProxy(inputPath, proxyAbsolutePath);
    proxyUrl = `/uploads/proxies/${proxyStoredName}`;
    proxyStatus = 'ready';
  }

  if (!thumbnailUrl) {
    const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
    const thumbAbsolutePath = path.join(THUMBNAILS_DIR, thumbStoredName);
    try {
      await generateVideoThumbnail(inputPath, thumbAbsolutePath);
      thumbnailUrl = `/uploads/thumbnails/${thumbStoredName}`;
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
          updated_at = $5
      WHERE id = $1
      RETURNING *
    `,
    [row.id, proxyUrl, proxyStatus, thumbnailUrl, now]
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

app.get('/api/workflow', (_req, res) => {
  res.json(WORKFLOW);
});

app.get('/api/me', (req, res) => {
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

  res.json({
    username,
    displayName,
    email: emailRaw || '',
    isAdmin
  });
});

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
      values.push(tag.toLowerCase());
      where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE LOWER(t) = $${values.length})`);
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
      SELECT *
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

  if (isVideoCandidate({ mimeType, fileName: safeName, declaredType: metadata.type })) {
    proxyStatus = 'pending';
    const proxyStoredName = `${Date.now()}-${nanoid()}-proxy.mp4`;
    const proxyAbsolutePath = path.join(PROXIES_DIR, proxyStoredName);

    try {
      await generateVideoProxy(absolutePath, proxyAbsolutePath);
      proxyUrl = `/uploads/proxies/${proxyStoredName}`;
      proxyStatus = 'ready';
    } catch (error) {
      return res.status(500).json({ error: `Proxy generation failed for uploaded video: ${String(error.message || '').slice(0, 240)}` });
    }

    const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
    const thumbAbsolutePath = path.join(THUMBNAILS_DIR, thumbStoredName);
    try {
      await generateVideoThumbnail(absolutePath, thumbAbsolutePath);
      thumbnailUrl = `/uploads/thumbnails/${thumbStoredName}`;
    } catch (_error) {
      thumbnailUrl = '';
    }
  } else if (isPdfCandidate({ mimeType, fileName: safeName })) {
    const pdfThumbName = `${Date.now()}-${nanoid()}-pdf-thumb.jpg`;
    const pdfThumbPath = path.join(THUMBNAILS_DIR, pdfThumbName);
    try {
      await generatePdfThumbnail(absolutePath, pdfThumbPath);
      thumbnailUrl = `/uploads/thumbnails/${pdfThumbName}`;
    } catch (_error) {
      const fallbackName = `${Date.now()}-${nanoid()}-pdf-thumb.svg`;
      const fallbackPath = path.join(THUMBNAILS_DIR, fallbackName);
      try {
        await generatePdfFallbackThumbnail(fallbackPath, {
          fileName: safeName,
          title: String(metadata.title || safeName)
        });
        thumbnailUrl = `/uploads/thumbnails/${fallbackName}`;
      } catch (_fallbackError) {
        thumbnailUrl = '';
      }
    }
  } else if (isDocumentCandidate({ mimeType, fileName: safeName, declaredType: metadata.type })) {
    const docThumbName = `${Date.now()}-${nanoid()}-doc-thumb-v2.svg`;
    const docThumbPath = path.join(THUMBNAILS_DIR, docThumbName);
    try {
      await generateDocumentThumbnail(absolutePath, docThumbPath, {
        fileName: safeName,
        title: String(metadata.title || safeName),
        extLabel: (getFileExtension(safeName) || 'DOC').toUpperCase(),
        includeContent: isTextDocumentCandidate({ mimeType, fileName: safeName })
      });
      thumbnailUrl = `/uploads/thumbnails/${docThumbName}`;
    } catch (_error) {
      thumbnailUrl = '';
    }
  } else if (String(mimeType || '').toLowerCase().startsWith('image/')) {
    thumbnailUrl = mediaUrl;
  }

  const payload = {
    ...metadata,
    fileName: safeName,
    mimeType: String(mimeType || ''),
    mediaUrl,
    proxyUrl,
    proxyStatus,
    thumbnailUrl,
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
    asset.versions = versionsResult.rows.map(mapVersionRow);
    asset.cuts = cutsResult.rows.map(mapCutRow);
    res.json(asset);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to load asset' });
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

app.delete('/api/assets/:id/cuts/:cutId', async (req, res) => {
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

app.post('/api/assets/:id/trash', async (req, res) => {
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

app.delete('/api/assets/:id', async (req, res) => {
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
