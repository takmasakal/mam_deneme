const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { nanoid } = require('nanoid');
const { pool, initDb } = require('./db');
const {
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  normalizePrincipalNames,
  getPermissionDefinitionsPayload,
  resolvePermissionKeysFromPrincipals,
  permissionKeysToLegacyFlags,
  normalizePermissionEntry,
  isAdminName,
  isAdminByGroupsOrRoles
} = require('./permissions');
const { createOfficeService } = require('./services/officeService');
const { createSearchService } = require('./services/searchService');
const { createAssetDeletionService } = require('./services/assetDeletionService');
const {
  normalizeOcrText,
  normalizeOcrLine,
  dedupeTextList,
  groupOcrEntriesToBlocks,
  escapeRegExp,
  normalizeComparableOcr,
  parseOcrIgnorePhrases,
  removeIgnoredPhrasesFromOcrText,
  detectStaticOverlayPhrases,
  applyOcrFrameFilters,
  levenshteinDistance,
  normalizedEditSimilarity,
  scoreOcrDisplayText,
  chooseBetterOcrText,
  buildComparableTokenSet,
  tokenOverlapSimilarity,
  isLikelySameOcrDisplayText
} = require('./services/ocrService');
const { createSubtitleService } = require('./services/subtitleService');
const { registerOfficeRoutes } = require('./routes/office');
const { registerAdminRoutes } = require('./routes/admin');
const { registerPdfRoutes } = require('./routes/pdf');
const { registerAssetRoutes } = require('./routes/assets');
const { registerTextProcessingRoutes } = require('./routes/textProcessing');
const {
  sanitizeFileName,
  getFileExtension,
  inferMimeTypeFromFileName
} = require('./utils/files');
const {
  proxyJobs,
  subtitleJobs,
  videoOcrJobs
} = require('./services/mediaJobs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const PROXIES_DIR = path.join(UPLOADS_DIR, 'proxies');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const SUBTITLES_DIR = path.join(UPLOADS_DIR, 'subtitles');
const OCR_DIR = path.join(UPLOADS_DIR, 'ocr');
const OCR_FRAMES_DIR = path.join(OCR_DIR, '_frames');
const OCR_FRAME_CACHE_DIR = path.join(OCR_FRAMES_DIR, '_cache');
const OCR_FRAME_CACHE_ENABLED = String(process.env.OCR_FRAME_CACHE_ENABLE || 'false').trim().toLowerCase() === 'true';
const OCR_FRAME_CACHE_TTL_DAYS = Math.max(1, Math.min(30, Number(process.env.OCR_FRAME_CACHE_TTL_DAYS) || 3));
const PADDLE_CACHE_DIR = process.env.PADDLE_PDX_CACHE_HOME || path.join(UPLOADS_DIR, '.paddlex');
app.use(express.json({ limit: '300mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const WORKFLOW = ['Ingested', 'QC', 'Approved', 'Published', 'Archived'];
const DEFAULT_ADMIN_SETTINGS = {
  workflowTrackingEnabled: true,
  autoProxyBackfillOnUpload: false,
  playerUiMode: 'vidstack',
  ocrDefaultAdvancedMode: true,
  ocrDefaultTurkishAiCorrect: true,
  ocrDefaultEnableBlurFilter: true,
  ocrDefaultEnableRegionMode: false,
  ocrDefaultIgnoreStaticOverlays: true,
  apiTokenEnabled: false,
  apiToken: '',
  oidcBearerEnabled: false,
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL || 'http://keycloak:8080/realms/mam',
  oidcJwksUrl: process.env.OIDC_JWKS_URL || 'http://keycloak:8080/realms/mam/protocol/openid-connect/certs',
  oidcAudience: process.env.OIDC_AUDIENCE || ''
};

function normalizePlayerUiMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'vidstack' || mode === 'mpegdash') return mode;
  return 'vidstack';
}
const DEFAULT_USER_PERMISSIONS = {};
const ELASTIC_URL = process.env.ELASTIC_URL || 'http://localhost:9200';
const ELASTIC_INDEX = process.env.ELASTIC_INDEX || 'mam_assets';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'small';
const DATA_DIR = path.join(__dirname, '..', 'data');
const RUNTIME_CONFIG_DIR = path.join(UPLOADS_DIR, '_config');
const LEARNED_TURKISH_CORRECTIONS_PATH = process.env.LEARNED_TURKISH_CORRECTIONS_PATH
  || path.join(RUNTIME_CONFIG_DIR, 'turkish_learned_corrections.json');
const TURKISH_WORDLIST_PATH = process.env.TURKISH_WORDLIST_PATH || '';
const KEYCLOAK_INTERNAL_URL = process.env.KEYCLOAK_INTERNAL_URL || 'http://keycloak:8080';
const KEYCLOAK_PUBLIC_URL = String(process.env.KEYCLOAK_PUBLIC_URL || '').trim();
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'mam';
const KEYCLOAK_REALMS = String(process.env.KEYCLOAK_REALMS || '').trim();
const KEYCLOAK_ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN || '';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || '';
const KEYCLOAK_ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
const USE_OAUTH2_PROXY = String(process.env.USE_OAUTH2_PROXY || 'false').trim().toLowerCase() === 'true';
const OFFICE_EDITOR_PROVIDER = ['onlyoffice', 'libreoffice'].includes(String(process.env.OFFICE_EDITOR_PROVIDER || '').trim().toLowerCase())
  ? String(process.env.OFFICE_EDITOR_PROVIDER || '').trim().toLowerCase()
  : 'none';
const ONLYOFFICE_CONFIG_VERSION = 'oo-save-v9';
const ONLYOFFICE_PUBLIC_URL = String(process.env.ONLYOFFICE_PUBLIC_URL || 'http://localhost:8082').trim().replace(/\/+$/, '');
const ONLYOFFICE_INTERNAL_URL = String(process.env.ONLYOFFICE_INTERNAL_URL || 'http://onlyoffice').trim().replace(/\/+$/, '');
const APP_INTERNAL_URL = String(process.env.APP_INTERNAL_URL || 'http://app:3000').trim().replace(/\/+$/, '');
const AUTH_DEBUG = String(process.env.AUTH_DEBUG || 'false').trim().toLowerCase() === 'true';
const OIDC_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const oidcJwksCache = new Map();
const pdfOcrCache = new Map();
const KEYCLOAK_ADMIN_CACHE_TTL_MS = Math.max(5, Number(process.env.KEYCLOAK_ADMIN_CACHE_TTL_SECONDS) || 60) * 1000;
const SYSTEM_HEALTH_CACHE_TTL_MS = Math.max(5, Number(process.env.SYSTEM_HEALTH_CACHE_TTL_SECONDS) || 30) * 1000;
let keycloakUsersCache = { expiresAt: 0, value: null };
const keycloakPermissionDefaultsCache = new Map();
let systemHealthCache = { expiresAt: 0, value: null };
const searchService = createSearchService({
  pool,
  elasticUrl: ELASTIC_URL,
  elasticIndex: ELASTIC_INDEX,
  parseTextSearchQuery,
  normalizeForSearch
});

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildRealmIssuerUrl(baseUrl, realm = KEYCLOAK_REALM) {
  const trimmedBaseUrl = trimTrailingSlashes(baseUrl);
  const trimmedRealm = String(realm || '').trim();
  if (!trimmedBaseUrl || !trimmedRealm) return '';
  return `${trimmedBaseUrl}/realms/${encodeURIComponent(trimmedRealm)}`;
}

function buildRealmJwksUrl(baseUrl, realm = KEYCLOAK_REALM) {
  const issuerUrl = buildRealmIssuerUrl(baseUrl, realm);
  if (!issuerUrl) return '';
  return `${issuerUrl}/protocol/openid-connect/certs`;
}

function normalizeIssuerPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.pathname.replace(/\/+$/, '');
  } catch (_error) {
    return raw.replace(/\/+$/, '');
  }
}

function getExpectedIssuerPath(settings) {
  const configuredIssuerPath = normalizeIssuerPath(settings?.oidcIssuerUrl || '');
  if (configuredIssuerPath) return configuredIssuerPath;
  const realmPath = normalizeIssuerPath(buildRealmIssuerUrl(KEYCLOAK_INTERNAL_URL));
  if (realmPath) return realmPath;
  return `/realms/${encodeURIComponent(KEYCLOAK_REALM)}`;
}

function getPreferredOidcJwksUrls(settings) {
  return Array.from(new Set([
    buildRealmJwksUrl(KEYCLOAK_INTERNAL_URL),
    buildRealmJwksUrl(KEYCLOAK_PUBLIC_URL),
    String(settings?.oidcJwksUrl || '').trim()
  ].filter(Boolean)));
}

function resolveRequestProtocol(req) {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (xfProto === 'https' || xfProto === 'http') return xfProto;
  return (req.protocol === 'https') ? 'https' : 'http';
}

function resolveRequestHost(req) {
  const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  if (xfHost) return xfHost;
  return String(req.get('host') || 'localhost').trim() || 'localhost';
}

function hostWithoutPort(host) {
  const raw = String(host || '').trim();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const closingBracket = raw.indexOf(']');
    return closingBracket >= 0 ? raw.slice(0, closingBracket + 1) : raw;
  }
  return raw.split(':')[0];
}

function getRequestDerivedOidcSettings(settings, req) {
  const host = hostWithoutPort(resolveRequestHost(req));
  if (!host) return settings;
  const keycloakPublicPort = String(process.env.KEYCLOAK_PUBLIC_PORT || '8081').trim() || '8081';
  const publicKeycloakBaseUrl = `${resolveRequestProtocol(req)}://${host}:${keycloakPublicPort}`;
  return {
    ...settings,
    oidcIssuerUrl: buildRealmIssuerUrl(publicKeycloakBaseUrl),
    oidcJwksUrl: buildRealmJwksUrl(publicKeycloakBaseUrl)
  };
}

function buildLogoutUrl(req) {
  if (!USE_OAUTH2_PROXY) return '/';
  // Force return to oauth2 start page after local sign_out.
  // oauth2-proxy will also call backend logout URL (Keycloak) with id_token_hint.
  return '/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F';
}

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
if (!fs.existsSync(OCR_FRAME_CACHE_DIR)) {
  fs.mkdirSync(OCR_FRAME_CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(PADDLE_CACHE_DIR)) {
  fs.mkdirSync(PADDLE_CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(RUNTIME_CONFIG_DIR)) {
  fs.mkdirSync(RUNTIME_CONFIG_DIR, { recursive: true });
}

const learnedTurkishCorrections = new Map();
let learnedTurkishCorrectionsCompiled = [];
const turkishWordSet = new Set();

function ensureElasticIndex() {
  return searchService.ensureElasticIndex();
}

async function indexAssetToElastic(assetId) {
  return searchService.indexAssetToElastic(assetId);
}

async function removeAssetFromElastic(assetId) {
  return searchService.removeAssetFromElastic(assetId);
}

async function searchAssetIdsElastic(queryText, limit = 500) {
  return searchService.searchAssetIdsElastic(queryText, limit);
}

async function suggestAssetIdsElastic(queryText, limit = 10) {
  return searchService.suggestAssetIdsElastic(queryText, limit);
}

async function backfillElasticIndex() {
  return searchService.backfillElasticIndex();
}

function parseSearchTokens(value, normalizeFn = (input) => String(input || '').trim()) {
  const raw = String(value || '').trim();
  const mustInclude = [];
  const mustIncludeExact = [];
  const mustExclude = [];
  const mustExcludeExact = [];
  const optional = [];
  const optionalExact = [];
  let hasOperators = false;

  const matcher = /([+-]?)"([^"]+)"|(\S+)/g;
  let match = null;
  while ((match = matcher.exec(raw)) !== null) {
    const quotedPrefix = String(match[1] || '');
    const quotedToken = String(match[2] || '').trim();
    const plainToken = String(match[3] || '').trim();
    const isQuoted = Boolean(quotedToken);
    const tokenRaw = isQuoted ? quotedToken : plainToken;
    if (!tokenRaw) continue;

    const prefix = isQuoted ? quotedPrefix : tokenRaw.charAt(0);
    const strippedValue = (prefix === '+' || prefix === '-') && !isQuoted
      ? tokenRaw.slice(1)
      : tokenRaw;
    const normalizedToken = normalizeFn(strippedValue);
    if (!normalizedToken) continue;

    const pushUnique = (bucket, valueToPush) => {
      if (!bucket.includes(valueToPush)) bucket.push(valueToPush);
    };

    if (prefix === '+') {
      hasOperators = true;
      pushUnique(isQuoted ? mustIncludeExact : mustInclude, normalizedToken);
      continue;
    }
    if (prefix === '-') {
      hasOperators = true;
      pushUnique(isQuoted ? mustExcludeExact : mustExclude, normalizedToken);
      continue;
    }
    if (isQuoted) {
      hasOperators = true;
      pushUnique(optionalExact, normalizedToken);
      continue;
    }
    pushUnique(optional, normalizedToken);
  }

  return {
    raw: normalizeFn(raw),
    hasOperators,
    mustInclude,
    mustIncludeExact,
    mustExclude,
    mustExcludeExact,
    optional,
    optionalExact
  };
}

function parseTextSearchQuery(value, normalizeFn = (input) => String(input || '').trim()) {
  return parseSearchTokens(value, normalizeFn);
}

function tokenizeSearchTokens(value, normalizeFn = (input) => String(input || '').trim()) {
  return normalizeFn(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && /[\p{L}\p{N}]/u.test(token));
}

function fuzzySearchTokenMatch(queryToken, candidateToken) {
  const query = String(queryToken || '').trim();
  const candidate = String(candidateToken || '').trim();
  if (!query || !candidate) return false;
  if (query === candidate) return true;
  if (query.charAt(0) !== candidate.charAt(0)) return false;
  const lenDiff = Math.abs(query.length - candidate.length);
  if (lenDiff > 2) return false;
  const maxAllowed = query.length >= 7 ? 2 : 1;
  return levenshteinDistance(query, candidate) <= maxAllowed;
}

function fuzzySearchTextMatch(queryText, candidateText, normalizeFn = (input) => String(input || '').trim()) {
  const queryTokens = tokenizeSearchTokens(queryText, normalizeFn);
  const candidateTokens = tokenizeSearchTokens(candidateText, normalizeFn);
  if (!queryTokens.length || !candidateTokens.length) return false;
  return queryTokens.every((queryToken) => (
    candidateTokens.some((candidateToken) => fuzzySearchTokenMatch(queryToken, candidateToken))
  ));
}

function suggestDidYouMeanFromTexts(texts, query, options = {}) {
  const {
    parseFn = parseTextSearchQuery,
    normalizeFn = (input) => String(input || '').trim()
  } = options;
  const parsedQuery = parseFn(query, normalizeFn);
  if (!parsedQuery.raw || parsedQuery.hasOperators) return '';
  const sourceTokens = tokenizeSearchTokens(parsedQuery.raw, normalizeFn);
  if (!sourceTokens.length) return '';

  const vocab = new Set();
  (Array.isArray(texts) ? texts : []).forEach((text) => {
    tokenizeSearchTokens(text, normalizeFn).forEach((token) => vocab.add(token));
  });
  if (!vocab.size) return '';

  let replaced = false;
  const suggestedTokens = sourceTokens.map((token) => {
    let best = token;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of vocab) {
      const lenDiff = Math.abs(candidate.length - token.length);
      if (lenDiff > 2) continue;
      if (candidate.charAt(0) !== token.charAt(0)) continue;
      const dist = levenshteinDistance(token, candidate);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = candidate;
      }
      if (bestDistance === 1) break;
    }
    const maxAllowed = token.length >= 7 ? 2 : 1;
    if (best !== token && bestDistance <= maxAllowed) {
      replaced = true;
      return best;
    }
    return token;
  });

  if (!replaced) return '';
  const suggestion = suggestedTokens.join(' ').trim();
  if (!suggestion || suggestion === parsedQuery.raw) return '';
  return suggestion;
}

function escapePostgresRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactNormalizedTextRegex(term) {
  const normalized = String(term || '').trim();
  if (!normalized) return '';
  return `(^|[^[:alnum:]])${escapePostgresRegex(normalized)}([^[:alnum:]]|$)`;
}

function normalizedTextHasExactTerm(text, term) {
  const normalizedText = String(text || '').trim();
  const normalizedTerm = String(term || '').trim();
  if (!normalizedText || !normalizedTerm) return false;
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapePostgresRegex(normalizedTerm)}([^\\p{L}\\p{N}]|$)`, 'u').test(normalizedText);
  } catch (_error) {
    return normalizedText === normalizedTerm;
  }
}

function sqlTagFold(expression) {
  return `REPLACE(LOWER(TRANSLATE(${expression}, 'İIı', 'iii')), U&'\\0307', '')`;
}

function sqlTextFold(expression) {
  return `REPLACE(LOWER(TRANSLATE(COALESCE(${expression}, ''), 'İIı', 'iii')), U&'\\0307', '')`;
}

function normalizeSubtitleLang(value) {
  const lang = String(value || '').trim().toLowerCase();
  if (!lang) return 'tr';
  if (!/^[a-z0-9-]{2,12}$/.test(lang)) return 'tr';
  return lang;
}

function normalizeSubtitleBackend(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'whisperx' ? 'whisperx' : 'whisper';
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

function sanitizeVideoOcrItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const ocrUrl = String(item.ocrUrl || '').trim();
      if (!ocrUrl) return null;
      return {
        id: String(item.id || nanoid()).trim() || nanoid(),
        ocrUrl,
        ocrLabel: String(item.ocrLabel || '').trim() || 'video-ocr',
        ocrEngine: normalizeOcrEngine(item.ocrEngine),
        lineCount: Math.max(0, Number(item.lineCount) || 0),
        segmentCount: Math.max(0, Number(item.segmentCount) || 0),
        createdAt: String(item.createdAt || new Date().toISOString())
      };
    })
    .filter(Boolean);
}

function toAsciiUpperToken(value, fallback = 'OCR') {
  const text = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!text) return fallback;
  const compact = text.replace(/\s+/g, '');
  return (compact || fallback).toUpperCase();
}

function buildAssetInitials(value, fallback = 'ASSET') {
  const text = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!text) return fallback;
  const words = text.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 4).map((word) => word.charAt(0).toUpperCase()).join('');
  return initials || fallback;
}

function formatLabelDateYmd(value, fallbackIso = '') {
  const raw = value || fallbackIso || new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date(fallbackIso || Date.now());
    if (Number.isNaN(fallback.getTime())) return '00000000';
    return fallback.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildOcrDisplayLabel({ assetTitle = '', fileName = '', createdAt = '', engine = '', version = 1 }) {
  const initials = buildAssetInitials(assetTitle || fileName || 'asset');
  const datePart = formatLabelDateYmd(createdAt);
  const engineToken = toAsciiUpperToken(engine || 'paddle', 'PADDLE');
  const versionToken = `v${String(Math.max(1, Number(version) || 1)).padStart(2, '0')}`;
  return `${initials}-${datePart}-OCR-${engineToken}-${versionToken}`;
}

function normalizeRequestedOcrLabel(value, fallback = '') {
  const raw = String(value || '').trim();
  const chosen = raw || String(fallback || '').trim();
  if (!chosen) return '';
  const sanitized = sanitizeFileName(chosen.replace(/\.txt$/i, '').trim());
  return sanitized ? `${sanitized}.txt` : '';
}

function relabelOcrItemsForAsset(assetTitle, fileName, items = []) {
  return sanitizeVideoOcrItems(items).map((item, index) => ({
    ...item,
    ocrLabel: buildOcrDisplayLabel({
      assetTitle,
      fileName,
      createdAt: item.createdAt,
      engine: item.ocrEngine,
      version: index + 1
    })
  }));
}

function pickLatestVideoOcrUrlFromDc(dcMetadata) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  const direct = String(dc.videoOcrUrl || '').trim();
  if (direct) return direct;
  const items = sanitizeVideoOcrItems(dc.videoOcrItems);
  if (!items.length) return '';
  const last = items[items.length - 1];
  return String(last.ocrUrl || '').trim();
}

function listOcrFilesRecursive(dirPath) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    entries.forEach((entry) => {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        return;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) out.push(abs);
    });
  };
  walk(dirPath);
  return out;
}

function getCandidateOcrFilePathsForRow(row) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const directUrl = pickLatestVideoOcrUrlFromDc(dc);
  const directPath = directUrl ? publicUploadUrlToAbsolutePath(directUrl) : '';
  const paths = [];
  if (directPath && fs.existsSync(directPath)) paths.push(directPath);
  if (paths.length) return paths;

  const titleSlug = sanitizeFileName(String(row?.title || '').trim().toLowerCase());
  const fileSlug = sanitizeFileName(path.basename(String(row?.file_name || ''), path.extname(String(row?.file_name || ''))).toLowerCase());
  const createdDay = getDatePart(row?.created_at);
  const allTxt = listOcrFilesRecursive(OCR_DIR);
  const ranked = allTxt
    .map((p) => {
      const base = path.basename(p).toLowerCase();
      const rel = path.relative(OCR_DIR, p).replace(/\\/g, '/');
      const hasFile = fileSlug && fileSlug.length >= 4 && base.includes(fileSlug);
      const hasTitle = titleSlug && titleSlug.length >= 5 && base.includes(titleSlug);
      const inSameDay = createdDay && rel.startsWith(`${createdDay}/`);
      const hasAssetId = String(row?.id || '').trim() && base.includes(String(row?.id || '').trim().toLowerCase());
      let score = 0;
      if (hasFile) score += 6;
      if (hasTitle) score += 4;
      if (hasAssetId) score += 8;
      if (inSameDay) score += 1;
      return { p, score, hasFile, hasTitle, hasAssetId, inSameDay };
    })
    // Strict fallback: only consider files that match asset filename/title/id.
    .filter((x) => x.score > 0 && (x.hasFile || x.hasTitle || x.hasAssetId))
    .sort((a, b) => b.score - a.score);
  if (ranked.length) return ranked.slice(0, 8).map((x) => x.p);
  // Alakasiz OCR dosyalarina geri dusmemek icin burada "recent fallback" yok.
  // Boylece farkli asset'lerde ayni OCR satirinin gorunmesi engellenir.
  return [];
}

function extractOcrMatchLine(content, queryNorm) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const comparable = normalizeComparableOcr(line);
    if (comparable && comparable.includes(queryNorm)) {
      return line;
    }
  }
  return '';
}

function extractOcrMatchLines(content, queryNorm, limit = 8) {
  const out = [];
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const comparable = normalizeComparableOcr(line);
    if (comparable && comparable.includes(queryNorm)) {
      out.push(line);
      if (out.length >= cap) break;
    }
  }
  return out;
}

function ocrLineMatchesParsedQuery(line, parsedQuery) {
  const comparable = normalizeComparableOcr(line);
  if (!comparable || !parsedQuery?.raw) return false;
  if (!parsedQuery.hasOperators) {
    return comparable.includes(parsedQuery.raw);
  }
  const includesAllRequired = parsedQuery.mustInclude.every((term) => comparable.includes(term));
  if (!includesAllRequired) return false;
  const includesAllRequiredExact = parsedQuery.mustIncludeExact.every((term) => normalizedTextHasExactTerm(comparable, term));
  if (!includesAllRequiredExact) return false;
  const excludesForbidden = parsedQuery.mustExclude.every((term) => !comparable.includes(term));
  if (!excludesForbidden) return false;
  const excludesForbiddenExact = parsedQuery.mustExcludeExact.every((term) => !normalizedTextHasExactTerm(comparable, term));
  if (!excludesForbiddenExact) return false;
  const optionalHit = parsedQuery.optional.some((term) => comparable.includes(term));
  const optionalExactHit = parsedQuery.optionalExact.some((term) => normalizedTextHasExactTerm(comparable, term));
  if (parsedQuery.optional.length === 0 && parsedQuery.optionalExact.length === 0) return true;
  return optionalHit || optionalExactHit;
}

function extractOcrMatchLinesByParsedQuery(content, parsedQuery, limit = 8) {
  const out = [];
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    if (!ocrLineMatchesParsedQuery(line, parsedQuery)) continue;
    out.push(line);
    if (out.length >= cap) break;
  }
  return out;
}

function parseTimecodePrefixToSec(line) {
  const raw = String(line || '');
  const match = raw.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
  const parse = (v) => {
    const m = String(v || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
    if (!m) return null;
    return (Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4]) / 1000);
  };
  if (match) {
    const start = parse(match[1]);
    const end = parse(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { startSec: start, endSec: end };
  }
  const single = raw.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
  if (!single) return null;
  const at = parse(single[1]);
  if (!Number.isFinite(at)) return null;
  return { startSec: at, endSec: at };
}

function findOcrMatchInRow(row, queryRaw) {
  const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
  if (!parsedQuery.raw) return null;
  const candidates = getCandidateOcrFilePathsForRow(row);
  for (const filePath of candidates) {
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      continue;
    }
    const line = extractOcrMatchLinesByParsedQuery(raw, parsedQuery, 1)[0] || '';
    if (!line) continue;
    const tc = parseTimecodePrefixToSec(line);
    const relative = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
    const ocrUrl = relative ? `/uploads/${relative}` : '';
    return {
      ocrUrl,
      line,
      startSec: Number(tc?.startSec || 0),
      endSec: Number(tc?.endSec || 0)
    };
  }
  return null;
}

function findOcrMatchesInRow(row, queryRaw, limit = 8) {
  const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
  if (!parsedQuery.raw) return [];
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  const out = [];
  const seen = new Set();
  const candidates = getCandidateOcrFilePathsForRow(row);
  for (const filePath of candidates) {
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      continue;
    }
    const lines = extractOcrMatchLinesByParsedQuery(raw, parsedQuery, cap);
    if (!lines.length) continue;
    const relative = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
    const ocrUrl = relative ? `/uploads/${relative}` : '';
    for (const line of lines) {
      const key = normalizeComparableOcr(line) || line.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const tc = parseTimecodePrefixToSec(line);
      out.push({
        ocrUrl,
        line,
        startSec: Number(tc?.startSec || 0),
        endSec: Number(tc?.endSec || 0)
      });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

async function findOcrMatchForAssetRow(row, queryRaw) {
  const hits = await findOcrMatchesForAssetRow(row, queryRaw, 1);
  return hits[0] || null;
}

async function findOcrMatchesForAssetRow(row, queryRaw, limit = 8) {
  const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
  const assetId = String(row?.id || '').trim();
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  if (!assetId || !parsedQuery.raw) return [];
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const activeOcrUrl = String(pickLatestVideoOcrUrlFromDc(dc) || '').trim();
  if (activeOcrUrl) {
    const buildOcrWhere = () => buildSubtitleCueSearchWhereSql({
      normColumn: 'norm_text',
      startIndex: 3,
      parsedQuery
    });
    const fetchDbMatch = async () => {
      const ocrWhere = buildOcrWhere();
      return pool.query(
        `
          SELECT start_sec, end_sec, segment_text
          FROM asset_ocr_segments
          WHERE asset_id = $1
            AND ocr_url = $2
            ${ocrWhere.clauses.length ? `AND ${ocrWhere.clauses.join(' AND ')}` : ''}
          ORDER BY start_sec ASC
          LIMIT $${ocrWhere.nextIndex}
        `,
        [assetId, activeOcrUrl, ...ocrWhere.params, cap]
      );
    };
    let dbHit = await fetchDbMatch();
    if (!dbHit.rowCount) {
      const exists = await pool.query(
        `
          SELECT 1
          FROM asset_ocr_segments
          WHERE asset_id = $1
            AND ocr_url = $2
          LIMIT 1
        `,
        [assetId, activeOcrUrl]
      );
      if (!exists.rowCount) {
        await syncOcrSegmentIndexForAsset(assetId, activeOcrUrl, {
          sourceEngine: String(dc.videoOcrEngine || 'paddle').trim(),
          lang: ''
        });
        dbHit = await fetchDbMatch();
      }
    }
    if (dbHit.rowCount) {
      return dbHit.rows.map((hit) => ({
        ocrUrl: activeOcrUrl,
        line: String(hit.segment_text || ''),
        startSec: Number(hit.start_sec || 0),
        endSec: Number(hit.end_sec || 0)
      }));
    }
  }
  return findOcrMatchesInRow(row, queryRaw, cap);
}

async function loadActiveOcrSegmentsForAssetRow(row) {
  const assetId = String(row?.id || '').trim();
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const activeOcrUrl = String(pickLatestVideoOcrUrlFromDc(dc) || '').trim();
  if (!assetId || !activeOcrUrl) return { ocrUrl: activeOcrUrl, segments: [] };

  const existing = await pool.query(
    `
      SELECT start_sec, end_sec, segment_text
      FROM asset_ocr_segments
      WHERE asset_id = $1
        AND ocr_url = $2
      ORDER BY start_sec ASC
    `,
    [assetId, activeOcrUrl]
  );
  if (existing.rowCount) {
    return {
      ocrUrl: activeOcrUrl,
      segments: existing.rows.map((segment) => ({
        startSec: Number(segment.start_sec || 0),
        endSec: Number(segment.end_sec || 0),
        segmentText: String(segment.segment_text || '')
      }))
    };
  }

  await syncOcrSegmentIndexForAsset(assetId, activeOcrUrl, {
    sourceEngine: String(dc.videoOcrEngine || 'paddle').trim(),
    lang: ''
  });

  const refreshed = await pool.query(
    `
      SELECT start_sec, end_sec, segment_text
      FROM asset_ocr_segments
      WHERE asset_id = $1
        AND ocr_url = $2
      ORDER BY start_sec ASC
    `,
    [assetId, activeOcrUrl]
  );
  return {
    ocrUrl: activeOcrUrl,
    segments: refreshed.rows.map((segment) => ({
      startSec: Number(segment.start_sec || 0),
      endSec: Number(segment.end_sec || 0),
      segmentText: String(segment.segment_text || '')
    }))
  };
}

function mapOcrSegmentRow(segment, query, ocrUrl = '') {
  return {
    ocrUrl,
    line: String(segment?.segmentText || segment?.line || '').trim(),
    startSec: Number(segment?.startSec || 0),
    endSec: Number(segment?.endSec || 0),
    query: String(query || '').trim()
  };
}

async function searchOcrMatchesForAssetRow(row, queryRaw, limit = 8) {
  const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  if (!parsedQuery.raw) {
    return { ocrUrl: '', matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
  }

  const exactMatches = await findOcrMatchesForAssetRow(row, queryRaw, cap);
  if (exactMatches.length || parsedQuery.hasOperators) {
    const ocrUrl = String(exactMatches[0]?.ocrUrl || pickLatestVideoOcrUrlFromDc(row?.dc_metadata || {}) || '').trim();
    return {
      ocrUrl,
      matches: exactMatches.map((item) => mapOcrSegmentRow(item, queryRaw, item.ocrUrl || ocrUrl)),
      didYouMean: '',
      fuzzyUsed: false,
      highlightQuery: String(queryRaw || '').trim()
    };
  }

  const { ocrUrl, segments } = await loadActiveOcrSegmentsForAssetRow(row);
  if (!segments.length) {
    return { ocrUrl, matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
  }

  const fuzzyMatches = segments
    .filter((segment) => fuzzySearchTextMatch(parsedQuery.raw, segment.segmentText, normalizeSubtitleSearchText))
    .slice(0, cap)
    .map((segment) => mapOcrSegmentRow(segment, queryRaw, ocrUrl));
  const didYouMean = suggestDidYouMeanFromTexts(
    segments.map((segment) => segment.segmentText),
    queryRaw,
    { parseFn: parseTextSearchQuery, normalizeFn: normalizeSubtitleSearchText }
  );

  let matches = fuzzyMatches;
  let fuzzyUsed = fuzzyMatches.length > 0;
  let highlightQuery = String(queryRaw || '').trim();
  if (didYouMean) {
    highlightQuery = didYouMean;
    const suggestedQuery = parseTextSearchQuery(didYouMean, normalizeSubtitleSearchText);
    const suggestedMatches = segments
      .filter((segment) => ocrLineMatchesParsedQuery(segment.segmentText, suggestedQuery))
      .slice(0, cap)
      .map((segment) => mapOcrSegmentRow(segment, didYouMean, ocrUrl));
    if (suggestedMatches.length) {
      matches = suggestedMatches;
      fuzzyUsed = true;
    } else if (matches.length) {
      matches = matches.map((item) => ({ ...item, query: didYouMean }));
    }
  }

  return { ocrUrl, matches, didYouMean, fuzzyUsed, highlightQuery };
}

async function searchOcrMatchesForAssetRows(rows, queryRaw, limit = 8) {
  const parsedQuery = parseTextSearchQuery(queryRaw, normalizeSubtitleSearchText);
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  const byAssetId = new Map();
  const assetRows = Array.isArray(rows) ? rows : [];
  if (!parsedQuery.raw || !assetRows.length) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
  }

  const activeUrlByAssetId = new Map();
  assetRows.forEach((row) => {
    const assetId = String(row?.id || '').trim();
    const ocrUrl = String(pickLatestVideoOcrUrlFromDc(row?.dc_metadata || {}) || '').trim();
    if (assetId && ocrUrl) activeUrlByAssetId.set(assetId, ocrUrl);
  });
  if (!activeUrlByAssetId.size) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
  }

  const assetIds = Array.from(activeUrlByAssetId.keys());
  const activeUrls = Array.from(new Set(activeUrlByAssetId.values()));
  const ocrWhere = buildSubtitleCueSearchWhereSql({
    normColumn: 'norm_text',
    startIndex: 3,
    parsedQuery
  });
  const exactResult = await pool.query(
    `
      WITH matched AS (
        SELECT asset_id, ocr_url, start_sec, end_sec, segment_text,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY start_sec ASC) AS rn
        FROM asset_ocr_segments
        WHERE asset_id = ANY($1::text[])
          AND ocr_url = ANY($2::text[])
          ${ocrWhere.clauses.length ? `AND ${ocrWhere.clauses.join(' AND ')}` : ''}
      )
      SELECT asset_id, ocr_url, start_sec, end_sec, segment_text
      FROM matched
      WHERE rn <= $${ocrWhere.nextIndex}
      ORDER BY asset_id, start_sec ASC
    `,
    [assetIds, activeUrls, ...ocrWhere.params, cap]
  );

  exactResult.rows.forEach((row) => {
    const assetId = String(row.asset_id || '').trim();
    const activeUrl = activeUrlByAssetId.get(assetId);
    if (!activeUrl || String(row.ocr_url || '').trim() !== activeUrl) return;
    if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
    byAssetId.get(assetId).push(mapOcrSegmentRow({
      line: String(row.segment_text || ''),
      startSec: Number(row.start_sec || 0),
      endSec: Number(row.end_sec || 0)
    }, queryRaw, activeUrl));
  });

  if (byAssetId.size || parsedQuery.hasOperators) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(queryRaw || '').trim() };
  }

  const segmentResult = await pool.query(
    `
      SELECT asset_id, ocr_url, start_sec, end_sec, segment_text
      FROM asset_ocr_segments
      WHERE asset_id = ANY($1::text[])
        AND ocr_url = ANY($2::text[])
      ORDER BY asset_id, start_sec ASC
    `,
    [assetIds, activeUrls]
  );
  const activeSegments = segmentResult.rows.filter((row) => {
    const assetId = String(row.asset_id || '').trim();
    return String(row.ocr_url || '').trim() === activeUrlByAssetId.get(assetId);
  });
  const didYouMean = suggestDidYouMeanFromTexts(
    activeSegments.map((row) => String(row.segment_text || '')),
    queryRaw,
    { parseFn: parseTextSearchQuery, normalizeFn: normalizeSubtitleSearchText }
  );
  const highlightQuery = didYouMean || String(queryRaw || '').trim();
  const suggestedQuery = didYouMean ? parseTextSearchQuery(didYouMean, normalizeSubtitleSearchText) : null;

  activeSegments.forEach((row) => {
    const assetId = String(row.asset_id || '').trim();
    if (!assetId || (byAssetId.get(assetId) || []).length >= cap) return;
    const text = String(row.segment_text || '');
    const matched = suggestedQuery
      ? ocrLineMatchesParsedQuery(text, suggestedQuery)
      : fuzzySearchTextMatch(parsedQuery.raw, text, normalizeSubtitleSearchText);
    if (!matched) return;
    if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
    byAssetId.get(assetId).push(mapOcrSegmentRow({
      line: text,
      startSec: Number(row.start_sec || 0),
      endSec: Number(row.end_sec || 0)
    }, highlightQuery, String(row.ocr_url || '').trim()));
  });

  return {
    byAssetId,
    didYouMean,
    fuzzyUsed: byAssetId.size > 0,
    highlightQuery
  };
}

const subtitleService = createSubtitleService({
  normalizeComparableOcr,
  parseSearchTokens,
  exactNormalizedTextRegex,
  normalizedTextHasExactTerm
});
const {
  normalizeSubtitleTime,
  formatTimecode,
  parseAdminTimecodeToSeconds,
  normalizeVttContent,
  convertSrtToVtt,
  parseSubtitleTimestampToSeconds,
  parseSubtitleCues,
  normalizeSubtitleSearchText,
  parseSubtitleTextSearchQuery,
  buildSubtitleCueSearchWhereSql,
  subtitleCueMatchesParsedQuery,
  findSubtitleMatchesInText
} = subtitleService;

const TURKISH_OCR_CHAR_FIXES = [
  [/\bı([aeiouöü])/g, 'i$1'],
  [/([a-zçğıöşü])I([a-zçğıöşü])/g, '$1ı$2'],
  [/([A-ZÇĞİÖŞÜ])i([A-ZÇĞİÖŞÜ])/g, '$1İ$2']
];

const TURKISH_OCR_WORD_FIXES = new Map([
  ['sifre', 'şifre'],
  ['giris', 'giriş'],
  ['cikis', 'çıkış'],
  ['kullanici', 'kullanıcı'],
  ['baslat', 'başlat'],
  ['duraklat', 'duraklat'],
  ['guncelle', 'güncelle'],
  ['islem', 'işlem'],
  ['goruntu', 'görüntü'],
  ['altyazi', 'altyazı'],
  ['baglanti', 'bağlantı'],
  ['icerik', 'içerik'],
  ['araclari', 'araçları'],
  ['araclar', 'araçlar'],
  ['canlandirma', 'canlandırma'],
  ['nazli', 'nazlı'],
  ['tarafindan', 'tarafından'],
  ['hakkinda', 'hakkında'],
  ['arasinda', 'arasında'],
  ['sirasinda', 'sırasında'],
  ['acisindan', 'açısından'],
  ['disinda', 'dışında'],
  ['icinde', 'içinde'],
  ['icin', 'için']
]);

const TURKISH_OCR_PHRASE_FIXES = [
  [/\btarafindan\b/giu, 'tarafından'],
  [/\bhakkinda\b/giu, 'hakkında'],
  [/\barasinda\b/giu, 'arasında'],
  [/\bsirasinda\b/giu, 'sırasında'],
  [/\bacisindan\b/giu, 'açısından'],
  [/\bdisinda\b/giu, 'dışında'],
  [/\bicinde\b/giu, 'içinde'],
  [/\bicin\b/giu, 'için']
];

function buildTurkishLookupKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[01]/g, (d) => (d === '0' ? 'o' : 'i'))
    .replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, '')
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

function normalizeLearnedCorrectionKey(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTurkishFlexibleRegexFragment(value) {
  return Array.from(String(value || ''))
    .map((char) => {
      switch (char) {
        case 'i':
        case 'ı':
        case 'I':
        case 'İ':
          return '[iıİI]';
        case 's':
        case 'ş':
        case 'S':
        case 'Ş':
          return '[sşSŞ]';
        case 'g':
        case 'ğ':
        case 'G':
        case 'Ğ':
          return '[gğGĞ]';
        case 'u':
        case 'ü':
        case 'U':
        case 'Ü':
          return '[uüUÜ]';
        case 'o':
        case 'ö':
        case 'O':
        case 'Ö':
          return '[oöOÖ]';
        case 'c':
        case 'ç':
        case 'C':
        case 'Ç':
          return '[cçCÇ]';
        default:
          return escapeRegex(char);
      }
    })
    .join('');
}

function compileLearnedTurkishCorrections() {
  learnedTurkishCorrectionsCompiled = Array.from(learnedTurkishCorrections.entries())
    .map(([wrong, correct]) => {
      const key = normalizeLearnedCorrectionKey(wrong);
      const value = String(correct || '').trim();
      if (!key || !value) return null;
      const trailingPunctuation = (key.match(/([?!.,:;…]+)\s*$/u)?.[1] || '').trim();
      const core = key
        .replace(/^[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+/u, '')
        .replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+$/u, '')
        .trim();
      const patternSource = core || key;
      const isSingleWord = !/\s/u.test(patternSource);
      const normalizedPattern = isSingleWord
        ? buildTurkishFlexibleRegexFragment(patternSource)
        : patternSource
            .split(/\s+/u)
            .filter(Boolean)
            .map((part) => buildTurkishFlexibleRegexFragment(part))
            .join('\\s+');
      const punctuationPattern = trailingPunctuation
        ? `(?:\\s*${escapeRegex(trailingPunctuation)})?`
        : '(?:\\s*[?!.,:;…]+)?';
      const regex = isSingleWord
        ? new RegExp(`\\b${normalizedPattern}\\b${punctuationPattern}`, 'giu')
        : new RegExp(`${normalizedPattern}${punctuationPattern}`, 'giu');
      return {
        wrong: key,
        correct: value,
        regex,
        trailingPunctuation
      };
    })
    .filter(Boolean);
}

async function reloadLearnedTurkishCorrectionsFromDb() {
  learnedTurkishCorrections.clear();
  const result = await pool.query(
    `
      SELECT wrong, correct
      FROM learned_turkish_corrections
      ORDER BY wrong ASC
    `
  );
  result.rows.forEach((row) => {
    const wrong = normalizeLearnedCorrectionKey(row?.wrong ?? '');
    const correct = String(row?.correct ?? '').trim();
    if (!wrong || !correct) return;
    learnedTurkishCorrections.set(wrong, correct);
  });
  compileLearnedTurkishCorrections();
}

function getLearnedTurkishCorrectionsList() {
  return Array.from(learnedTurkishCorrections.entries())
    .map(([wrong, correct]) => ({ wrong, correct }))
    .sort((a, b) => a.wrong.localeCompare(b.wrong, 'tr'));
}

function readLegacyLearnedCorrectionsFromDisk() {
  if (!fs.existsSync(LEARNED_TURKISH_CORRECTIONS_PATH)) return [];
  try {
    const raw = fs.readFileSync(LEARNED_TURKISH_CORRECTIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const rows = Array.isArray(parsed?.entries)
      ? parsed.entries
      : (Array.isArray(parsed) ? parsed : []);
    return rows
      .map((row) => {
        const wrong = normalizeLearnedCorrectionKey(row?.wrong ?? row?.from ?? '');
        const correct = String(row?.correct ?? row?.to ?? '').trim();
        if (!wrong || !correct) return null;
        return { wrong, correct };
      })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

async function migrateLegacyLearnedCorrectionsIfNeeded() {
  const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM learned_turkish_corrections');
  const rowCount = Number(countRes.rows?.[0]?.count || 0);
  if (rowCount > 0) return;
  const legacyRows = readLegacyLearnedCorrectionsFromDisk();
  if (!legacyRows.length) return;
  const now = new Date().toISOString();
  for (const row of legacyRows) {
    await pool.query(
      `
        INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (wrong_key)
        DO UPDATE SET wrong = EXCLUDED.wrong, correct = EXCLUDED.correct, updated_at = EXCLUDED.updated_at
      `,
      [normalizeLearnedCorrectionKey(row.wrong), row.wrong, row.correct, now, now]
    );
  }
}

function tryAddTurkishWord(word) {
  const base = String(word || '')
    .split('/')[0]
    .trim()
    .toLocaleLowerCase('tr');
  if (!base) return;
  turkishWordSet.add(base);
}

function loadTurkishWordSet() {
  turkishWordSet.clear();
  const candidates = [
    TURKISH_WORDLIST_PATH,
    '/usr/share/hunspell/tr_TR.dic',
    '/usr/share/myspell/tr_TR.dic',
    '/Library/Spelling/tr_TR.dic'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const lines = fs.readFileSync(candidate, 'utf8').replace(/\r\n?/g, '\n').split('\n');
      lines.forEach((line, idx) => {
        if (!line) return;
        if (idx === 0 && /^\d+$/.test(line.trim())) return;
        tryAddTurkishWord(line);
      });
      if (turkishWordSet.size > 1000) break;
    } catch (_error) {
      // Try next candidate path.
    }
  }
  TURKISH_OCR_WORD_FIXES.forEach((_value, key) => {
    if (key) turkishWordSet.add(String(key).toLocaleLowerCase('tr'));
  });
  TURKISH_OCR_WORD_FIXES.forEach((value) => {
    if (value) turkishWordSet.add(String(value).toLocaleLowerCase('tr'));
  });
}

function hasTurkishWordInSet(word) {
  const w = String(word || '').trim().toLocaleLowerCase('tr');
  if (!w) return false;
  return turkishWordSet.has(w);
}

function applyLearnedTurkishCorrections(text) {
  let out = String(text || '');
  if (!out || !learnedTurkishCorrectionsCompiled.length) return out;
  learnedTurkishCorrectionsCompiled.forEach((rule) => {
    out = out.replace(rule.regex, (matched) => {
      const tail = String(matched || '').match(/([?!.,:;…]+)\s*$/u)?.[1] || '';
      const corrected = String(rule.correct || '').trim();
      if (!tail) return corrected;
      if (/[?!.,:;…]\s*$/u.test(corrected)) return corrected;
      return `${corrected}${tail}`;
    });
  });
  return out;
}

function maybeTitleCaseFromRaw(raw, fixedLower) {
  const src = String(raw || '');
  if (!src || !fixedLower) return fixedLower;
  const trimmed = src.trim();
  if (!trimmed) return fixedLower;
  if (trimmed === trimmed.toLocaleUpperCase('tr')) {
    return fixedLower.toLocaleUpperCase('tr');
  }
  const firstRaw = trimmed.charAt(0);
  if (firstRaw && firstRaw === firstRaw.toUpperCase()) {
    return fixedLower.charAt(0).toLocaleUpperCase('tr') + fixedLower.slice(1);
  }
  return fixedLower;
}

function applyTurkishWordFixToChunk(chunk) {
  const src = String(chunk || '');
  if (!src || /^\s+$/.test(src)) return src;
  const match = src.match(/^([^0-9A-Za-zÇĞİÖŞÜçğıöşü]*)([0-9A-Za-zÇĞİÖŞÜçğıöşü]+)([^0-9A-Za-zÇĞİÖŞÜçğıöşü]*)$/);
  if (!match) return src;
  const prefix = match[1] || '';
  const core = match[2] || '';
  const suffix = match[3] || '';
  const mapped = TURKISH_OCR_WORD_FIXES.get(buildTurkishLookupKey(core));
  if (!mapped) return src;
  return `${prefix}${maybeTitleCaseFromRaw(core, mapped)}${suffix}`;
}

function applyTurkishConjunctionSpacingFix(text, options = {}) {
  let out = String(text || '');
  if (!out) return out;
  const useLexicon = Boolean(options.useZemberekLexicon);

  // Common OCR merge: "buda/suda/oda" -> "bu da/şu da/o da"
  out = out.replace(/\b([Bb]u|[Şş]u|[Oo])([Dd][ae])\b/gu, '$1 $2');

  // Conservative split for plural-noun + "da/de" when predicate-like words follow.
  // Example target: "bu adamlarda haklı" -> "bu adamlar da haklı"
  out = out.replace(
    /\b([0-9A-Za-zÇĞİÖŞÜçğıöşü]{3,}(?:lar|ler))([Dd][ae])(?=\s+(?:haklı|haksız|doğru|yanlış|aynı|farklı|var|yok|değil|olmalı|olabilir|iyi|kötü|güzel)\b)/giu,
    '$1 $2'
  );

  // Broader heuristic for merged "de/da" in subtitle-style predicates.
  // Guard with a protected-word list to avoid splitting lexical words (e.g., "madde", "sade").
  const protectedWords = new Set([
    'madde', 'sade', 'vade', 'mide', 'nerede', 'nede', 'şubede', 'evde'
  ]);
  const predicateHints = new Set([
    'haklı', 'haksız', 'doğru', 'yanlış', 'güzel', 'kötü', 'iyi', 'zor', 'kolay',
    'var', 'yok', 'değil', 'oldu', 'olur', 'olacak', 'olmalı', 'olabilir', 'gerek'
  ]);
  const tokens = out.split(/\s+/);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const raw = String(tokens[i] || '');
    const nextRaw = String(tokens[i + 1] || '');
    const core = raw.replace(/^[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+|[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+$/g, '');
    const nextCore = nextRaw.replace(/^[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+|[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+$/g, '');
    if (!core || core.length < 4 || !nextCore) continue;
    const lower = core.toLocaleLowerCase('tr');
    const nextLower = nextCore.toLocaleLowerCase('tr');
    if (!(lower.endsWith('da') || lower.endsWith('de'))) continue;
    if (protectedWords.has(lower)) continue;
    const stem = core.slice(0, -2);
    if (!stem || stem.length < 2) continue;
    if (useLexicon && hasTurkishWordInSet(lower)) continue;
    if (useLexicon && !hasTurkishWordInSet(stem)) continue;
    const isPredicateContext = predicateHints.has(nextLower)
      || /^(mi|mu|mü|mı)$/.test(nextLower)
      || /(yor|acak|ecek|malı|meli|miş|mış|muş|müş|di|dı|du|dü|ti|tı|tu|tü|ir|ır|ur|ür|ar|er)$/.test(nextLower);
    if (!isPredicateContext) continue;
    const join = core.slice(-2);
    tokens[i] = raw.replace(core, `${stem} ${join}`);
  }
  out = tokens.join(' ');

  return out;
}

function applyTurkishOcrOfflineCorrection(text, options = {}) {
  const useLexicon = Boolean(options.useZemberekLexicon);
  let out = String(text || '').trim();
  if (!out) return '';
  out = applyLearnedTurkishCorrections(out);
  TURKISH_OCR_CHAR_FIXES.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  TURKISH_OCR_PHRASE_FIXES.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  out = out
    .split(/(\s+)/)
    .map((chunk) => applyTurkishWordFixToChunk(chunk))
    .join('');
  out = applyTurkishConjunctionSpacingFix(out, { useZemberekLexicon: useLexicon });
  out = applyLearnedTurkishCorrections(out);
  return normalizeOcrText(out);
}

function applyTurkishCorrectionToVttContent(content, options = {}) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out = lines.map((line) => {
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    if (/^\d+$/.test(trimmed)) return raw;
    if (trimmed.includes('-->')) return raw;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(trimmed)) return raw;
    const fixed = applyTurkishOcrOfflineCorrection(trimmed, options);
    if (!fixed) return raw;
    const leading = raw.match(/^\s*/)?.[0] || '';
    return `${leading}${fixed}`;
  });
  return normalizeVttContent(out.join('\n'));
}

function applyLearnedCorrectionsToVttContent(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out = lines.map((line) => {
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    if (/^\d+$/.test(trimmed)) return raw;
    if (trimmed.includes('-->')) return raw;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(trimmed)) return raw;
    const fixed = applyLearnedTurkishCorrections(trimmed);
    if (!fixed) return raw;
    const leading = raw.match(/^\s*/)?.[0] || '';
    return `${leading}${fixed}`;
  });
  return normalizeVttContent(out.join('\n'));
}

function normalizeOcrPreprocessProfile(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'off' || raw === 'none') return 'off';
  if (raw === 'strong' || raw === 'hard') return 'strong';
  return 'light';
}

function normalizeOcrPreset(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'ticker') return 'ticker';
  if (raw === 'credits' || raw === 'credit' || raw === 'roll' || raw === 'caption') return 'credits';
  if (raw === 'static') return 'static';
  return 'general';
}

function buildOcrVisualEnhanceFilter(preprocessProfile = 'light') {
  const profile = normalizeOcrPreprocessProfile(preprocessProfile);
  if (profile === 'off') return '';
  if (profile === 'strong') {
    return 'format=gray,eq=contrast=1.28:brightness=0.03:saturation=0,unsharp=7:7:1.1:5:5:0.7';
  }
  return 'format=gray,eq=contrast=1.15:brightness=0.02:saturation=0,unsharp=5:5:0.75:3:3:0.35';
}

function buildOcrFrameFilter(intervalSec, preprocessProfile = 'light') {
  const fpsPart = `fps=1/${Math.max(1, Math.min(30, Number(intervalSec) || 4))}`;
  const visualEnhance = buildOcrVisualEnhanceFilter(preprocessProfile);
  return visualEnhance ? `${fpsPart},${visualEnhance}` : fpsPart;
}

function frameSecFromName(name, intervalSec, fallbackIndex = 0) {
  const safe = String(name || '').trim();
  const frameMatch = /^frame-(\d+)\.jpg$/i.exec(safe);
  if (frameMatch) {
    const ordinal = Math.max(0, Number(frameMatch[1]) - 1);
    return ordinal * intervalSec;
  }
  const sceneMatch = /^scene-(\d+)\.jpg$/i.exec(safe);
  if (sceneMatch) {
    return Math.max(0, Number(sceneMatch[1]) || 0) / 1000;
  }
  return Math.max(0, fallbackIndex) * intervalSec;
}

function isSceneFrameName(name) {
  return /^scene-\d+\.jpg$/i.test(String(name || '').trim());
}

function normalizeConfidence(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function refineSceneFrameEntries(frameEntries = [], options = {}) {
  const input = Array.isArray(frameEntries) ? frameEntries : [];
  if (!input.length) {
    return { entries: [], droppedScene: 0, patchedPeriodic: 0, keptScene: 0 };
  }
  const minSceneConfidence = Math.max(0.2, Math.min(0.95, Number(options.minSceneConfidence) || 0.5));
  const lowPeriodicConfidence = Math.max(0.2, Math.min(0.95, Number(options.lowPeriodicConfidence) || 0.58));
  const similarThreshold = Math.max(0.55, Math.min(0.95, Number(options.similarityThreshold) || 0.78));
  const patchThreshold = Math.max(0.3, Math.min(0.9, Number(options.patchSimilarityThreshold) || 0.45));
  const minSceneTextLen = Math.max(3, Math.min(120, Number(options.minSceneTextLen) || 7));
  const neighbourWindowSec = Math.max(0.2, Math.min(15, Number(options.neighbourWindowSec) || Math.max(1, Number(options.intervalSec) || 4)));

  const periodic = [];
  const scene = [];
  input.forEach((item) => {
    const text = normalizeOcrText(String(item?.text || ''));
    if (!text) return;
    const sec = Number(item?.sec) || 0;
    const confidence = normalizeConfidence(item?.confidence, 0);
    const frame = String(item?.frame || '');
    const normalized = { ...item, text, sec, confidence, frame };
    if (isSceneFrameName(frame)) scene.push(normalized);
    else periodic.push(normalized);
  });

  periodic.sort((a, b) => (a.sec - b.sec) || a.frame.localeCompare(b.frame));
  scene.sort((a, b) => (a.sec - b.sec) || a.frame.localeCompare(b.frame));

  const periodicRef = periodic.map((it) => ({ ...it }));
  let droppedScene = 0;
  let patchedPeriodic = 0;
  let keptScene = 0;
  const extraScene = [];

  scene.forEach((sc) => {
    const sceneTextLen = String(sc.text || '').replace(/\s+/g, '').length;
    if (sceneTextLen < minSceneTextLen || sc.confidence < minSceneConfidence) {
      droppedScene += 1;
      return;
    }
    let nearest = null;
    let nearestDelta = Number.POSITIVE_INFINITY;
    periodicRef.forEach((p) => {
      const delta = Math.abs((Number(p.sec) || 0) - (Number(sc.sec) || 0));
      if (delta < nearestDelta) {
        nearest = p;
        nearestDelta = delta;
      }
    });
    if (!nearest || nearestDelta > neighbourWindowSec) {
      extraScene.push(sc);
      keptScene += 1;
      return;
    }
    const sim = normalizedEditSimilarity(String(nearest.text || ''), String(sc.text || ''));
    const confDiff = sc.confidence - normalizeConfidence(nearest.confidence, 0);

    // Scene frame is used mainly to patch weak periodic OCR around cuts/transitions.
    if (normalizeConfidence(nearest.confidence, 0) < lowPeriodicConfidence && sim >= patchThreshold && confDiff >= 0.05) {
      nearest.text = normalizeOcrText(sc.text);
      nearest.confidence = sc.confidence;
      nearest.frame = sc.frame;
      patchedPeriodic += 1;
      return;
    }
    if (sim >= similarThreshold) {
      // Similar and not better enough -> drop noisy duplicate scene line.
      if (confDiff < 0.08) {
        droppedScene += 1;
        return;
      }
      nearest.text = normalizeOcrText(sc.text);
      nearest.confidence = sc.confidence;
      nearest.frame = sc.frame;
      patchedPeriodic += 1;
      return;
    }
    extraScene.push(sc);
    keptScene += 1;
  });

  const merged = [...periodicRef, ...extraScene]
    .sort((a, b) => (a.sec - b.sec) || String(a.frame || '').localeCompare(String(b.frame || ''), undefined, { numeric: true }));
  const out = [];
  merged.forEach((item) => {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(item);
      return;
    }
    const sameText = normalizeComparableOcr(prev.text) && normalizeComparableOcr(prev.text) === normalizeComparableOcr(item.text);
    const nearSec = Math.abs((Number(item.sec) || 0) - (Number(prev.sec) || 0)) <= 0.35;
    if (sameText && nearSec) {
      if (normalizeConfidence(item.confidence, 0) > normalizeConfidence(prev.confidence, 0)) {
        out[out.length - 1] = item;
      }
      return;
    }
    out.push(item);
  });

  return { entries: out, droppedScene, patchedPeriodic, keptScene };
}

function parseSceneTimesFromFfmpegLog(raw) {
  const text = String(raw || '');
  if (!text) return [];
  const found = [];
  let match;
  const regex = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  while ((match = regex.exec(text)) !== null) {
    const sec = Number(match[1]);
    if (!Number.isFinite(sec) || sec < 0) continue;
    found.push(sec);
  }
  found.sort((a, b) => a - b);
  const unique = [];
  for (const sec of found) {
    if (!unique.length || Math.abs(sec - unique[unique.length - 1]) > 0.04) unique.push(sec);
  }
  return unique;
}

async function detectSceneChangeTimes(inputPath, options = {}) {
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const threshold = Math.max(0.08, Math.min(0.95, Number(options.sceneThreshold) || 0.34));
  const maxSceneFrames = Math.max(0, Math.min(180, Number(options.maxSceneFrames) || 24));
  const minGapSec = Math.max(0.15, Math.min(30, Number(options.sceneMinGapSec) || Math.max(1.8, intervalSec * 0.85)));
  const periodicAvoidSec = Math.max(0.12, Math.min(intervalSec / 2, Number(options.periodicAvoidSec) || Math.max(0.35, intervalSec * 0.28)));
  if (!maxSceneFrames) return [];
  const run = await runCommandCapture('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'info',
    '-i',
    inputPath,
    '-vf',
    `select='gt(scene,${threshold.toFixed(3)})',showinfo`,
    '-an',
    '-f',
    'null',
    '-'
  ]);
  const rawLog = `${String(run.stderr || '')}\n${String(run.stdout || '')}`;
  const parsed = parseSceneTimesFromFfmpegLog(rawLog);
  if (!parsed.length) return [];
  const selected = [];
  for (const sec of parsed) {
    if (selected.length >= maxSceneFrames) break;
    if (selected.length && (sec - selected[selected.length - 1]) < minGapSec) continue;
    const nearestPeriodic = Math.round(sec / intervalSec) * intervalSec;
    if (Math.abs(sec - nearestPeriodic) <= periodicAvoidSec) continue;
    selected.push(sec);
  }
  return selected;
}

async function extractSceneFrames(inputPath, workDir, sceneTimes = [], preprocessProfile = 'light') {
  const times = Array.isArray(sceneTimes) ? sceneTimes : [];
  if (!times.length) return [];
  const created = [];
  const visualEnhance = buildOcrVisualEnhanceFilter(preprocessProfile);
  for (const secValue of times) {
    const sec = Math.max(0, Number(secValue) || 0);
    const ms = Math.round(sec * 1000);
    const sceneName = `scene-${String(ms).padStart(9, '0')}.jpg`;
    const scenePath = path.join(workDir, sceneName);
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      sec.toFixed(3),
      '-i',
      inputPath,
      '-frames:v',
      '1'
    ];
    if (visualEnhance) args.push('-vf', visualEnhance);
    args.push('-q:v', '3', scenePath);
    const run = await runCommandCapture('ffmpeg', args);
    if (run.ok && fs.existsSync(scenePath)) created.push(sceneName);
  }
  return created;
}

function listOcrFrameFiles(workDir, intervalSec = 4) {
  const names = fs.readdirSync(workDir)
    .filter((name) => /^(?:frame|scene)-\d+\.jpg$/i.test(name));
  names.sort((a, b) => {
    const ta = frameSecFromName(a, intervalSec, 0);
    const tb = frameSecFromName(b, intervalSec, 0);
    if (Math.abs(ta - tb) > 0.0005) return ta - tb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  return names;
}

function applyTurkishCorrectionToEntries(frameEntries = [], options = {}) {
  return (Array.isArray(frameEntries) ? frameEntries : [])
    .map((item) => {
      const text = applyTurkishOcrOfflineCorrection(item?.text || '', options);
      return { ...item, text };
    })
    .filter((item) => normalizeOcrText(item.text));
}

function buildDisplaySegments(frameEntries, options = {}) {
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const minDisplaySec = Math.max(intervalSec, Math.min(60, Number(options.minDisplaySec) || intervalSec * 2));
  const mergeGapSec = Math.max(0, Math.min(30, Number(options.mergeGapSec) || intervalSec));
  const segments = [];
  let active = null;

  const pushActive = () => {
    if (!active) return;
    const duration = Math.max(0, active.endSec - active.startSec);
    if (duration >= minDisplaySec && active.text) {
      segments.push({
        startSec: active.startSec,
        endSec: active.endSec,
        text: active.text
      });
    }
    active = null;
  };

  frameEntries.forEach((item, index) => {
    const sec = Number.isFinite(item?.sec) ? Number(item.sec) : index * intervalSec;
    const text = normalizeOcrText(String(item?.text || ''));
    if (!text) {
      pushActive();
      return;
    }
    if (!active) {
      active = { startSec: sec, endSec: sec + intervalSec, text };
      return;
    }

    const gap = Math.max(0, sec - active.endSec);
    const similarity = normalizedEditSimilarity(active.text, text);
    const sameDisplay = isLikelySameOcrDisplayText(active.text, text, {
      editThreshold: 0.82,
      tokenThreshold: 0.74,
      containsThreshold: 0.84
    });
    if (sameDisplay || (gap <= mergeGapSec && similarity >= 0.68)) {
      active.endSec = sec + intervalSec;
      active.text = chooseBetterOcrText(active.text, text);
      return;
    }
    pushActive();
    active = { startSec: sec, endSec: sec + intervalSec, text };
  });
  pushActive();

  if (!segments.length) return segments;
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...seg });
      continue;
    }
    const gap = Math.max(0, seg.startSec - prev.endSec);
    const similarity = normalizedEditSimilarity(prev.text, seg.text);
    const sameDisplay = isLikelySameOcrDisplayText(prev.text, seg.text, {
      editThreshold: 0.78,
      tokenThreshold: 0.7,
      containsThreshold: 0.82
    });
    if (gap <= mergeGapSec && (sameDisplay || similarity >= 0.78)) {
      prev.endSec = seg.endSec;
      prev.text = chooseBetterOcrText(prev.text, seg.text);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function mergeRepeatedSegments(segments = [], options = {}) {
  const mergeGapSec = Math.max(0, Math.min(30, Number(options.mergeGapSec) || 4));
  const similarityThreshold = Math.max(0.65, Math.min(0.95, Number(options.similarityThreshold) || 0.78));
  const input = Array.isArray(segments) ? segments : [];
  if (!input.length) return [];
  const sorted = [...input]
    .map((seg) => ({
      startSec: Number(seg?.startSec) || 0,
      endSec: Number(seg?.endSec) || 0,
      text: normalizeOcrText(seg?.text || '')
    }))
    .filter((seg) => seg.text && seg.endSec > seg.startSec)
    .sort((a, b) => (a.startSec - b.startSec) || (a.endSec - b.endSec));
  if (!sorted.length) return [];

  const out = [];
  for (const seg of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...seg });
      continue;
    }
    const gap = Math.max(0, seg.startSec - prev.endSec);
    const similarity = normalizedEditSimilarity(prev.text, seg.text);
    const sameDisplay = isLikelySameOcrDisplayText(prev.text, seg.text, {
      editThreshold: similarityThreshold,
      tokenThreshold: Math.max(0.62, similarityThreshold - 0.08),
      containsThreshold: Math.max(0.72, similarityThreshold)
    });
    if (gap <= mergeGapSec && (sameDisplay || similarity >= similarityThreshold)) {
      prev.endSec = Math.max(prev.endSec, seg.endSec);
      prev.text = chooseBetterOcrText(prev.text, seg.text);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

function formatOcrSegmentsOutput(segments) {
  if (!Array.isArray(segments) || !segments.length) {
    return '[00:00:00.000 --> 00:00:00.000] No OCR text detected.\n';
  }
  return `${segments.map((seg) => `[${formatTimecode(seg.startSec)} --> ${formatTimecode(seg.endSec)}] ${seg.text}`).join('\n')}\n`;
}

function collapseFrameEntriesToSegments(frameEntries = [], intervalSec = 4) {
  const step = Math.max(1, Math.min(30, Number(intervalSec) || 4));
  const sorted = (Array.isArray(frameEntries) ? frameEntries : [])
    .map((item) => ({
      sec: Number(item?.sec) || 0,
      text: normalizeOcrText(String(item?.text || ''))
    }))
    .filter((item) => Boolean(item.text))
    .sort((a, b) => (a.sec - b.sec) || a.text.localeCompare(b.text));
  if (!sorted.length) return [];

  const groups = [];
  sorted.forEach((item) => {
    const existing = groups.find((group) => isLikelySameOcrDisplayText(group.text, item.text, {
      editThreshold: 0.82,
      tokenThreshold: 0.74,
      containsThreshold: 0.84
    }));
    if (existing) {
      existing.items.push(item);
      existing.text = chooseBetterOcrText(existing.text, item.text);
      return;
    }
    groups.push({ text: item.text, items: [item] });
  });

  const segments = [];
  groups.forEach((group) => {
    const items = Array.isArray(group.items) ? group.items : [];
    items.sort((a, b) => a.sec - b.sec);
    let cur = null;
    items.forEach((item) => {
      if (!cur) {
        cur = { startSec: item.sec, endSec: item.sec + step, text: group.text || item.text };
        return;
      }
      const gap = item.sec - cur.endSec;
      if (gap <= (step * 1.2)) {
        cur.endSec = Math.max(cur.endSec, item.sec + step);
        cur.text = chooseBetterOcrText(cur.text, item.text);
      } else {
        segments.push(cur);
        cur = { startSec: item.sec, endSec: item.sec + step, text: group.text || item.text };
      }
    });
    if (cur) segments.push(cur);
  });

  return segments.sort((a, b) => (a.startSec - b.startSec) || a.text.localeCompare(b.text));
}

function formatOcrFrameLinesOutput(frameEntries = [], intervalSec = 4) {
  if (!Array.isArray(frameEntries) || !frameEntries.length) {
    return '[00:00:00.000 --> 00:00:00.000] No OCR text detected.\n';
  }
  const segments = collapseFrameEntriesToSegments(frameEntries, intervalSec);
  return formatOcrSegmentsOutput(segments);
}

function buildOverlayTokenRegex(token = '') {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const compact = normalizeComparableOcr(raw).replace(/\s+/g, '');
  if (compact === 'notebooklm') {
    // OCR often emits NotebookLLM / Notebook L M variants.
    return /\bnotebook\s*l+\s*m\b/giu;
  }
  return new RegExp(`\\b${escapeRegExp(raw)}\\b`, 'giu');
}

function collapseOverlaySegments(segments = [], token = '') {
  const input = (Array.isArray(segments) ? segments : [])
    .filter((seg) => Number(seg?.endSec) > Number(seg?.startSec));
  if (!input.length) return [];
  const first = input[0];
  const last = input[input.length - 1];
  return [{
    startSec: Number(first.startSec) || 0,
    endSec: Number(last.endSec) || (Number(first.startSec) || 0),
    text: String(token || 'Overlay').trim() || 'Overlay'
  }];
}

function splitOverlayTokenFromEntries(frameEntries = [], token = 'NotebookLM') {
  const tokenRegex = buildOverlayTokenRegex(token);
  const tokenComparable = normalizeComparableOcr(token).replace(/\s+/g, '');
  const cleaned = [];
  const overlay = [];
  (Array.isArray(frameEntries) ? frameEntries : []).forEach((item) => {
    const text = normalizeOcrText(String(item?.text || ''));
    if (!text) return;
    const sec = Number(item?.sec) || 0;
    const textComparable = normalizeComparableOcr(text).replace(/\s+/g, '');
    if ((tokenRegex && tokenRegex.test(text)) || (tokenComparable && textComparable.includes(tokenComparable))) {
      overlay.push({ sec, text: token });
      if (tokenRegex) tokenRegex.lastIndex = 0;
      let without = tokenRegex ? normalizeOcrText(text.replace(tokenRegex, ' ')) : text;
      if (without && tokenComparable) {
        without = normalizeOcrText(without
          .split(/\s+/)
          .filter((word) => {
            const w = normalizeComparableOcr(word).replace(/\s+/g, '');
            if (!w) return false;
            if (w.includes(tokenComparable)) return false;
            return levenshteinDistance(w, tokenComparable) > 1;
          })
          .join(' '));
      }
      if (without) cleaned.push({ ...item, text: without });
      return;
    }
    cleaned.push({ ...item, text });
  });
  return { cleaned, overlay };
}

function parseTimedOcrSegments(content) {
  const lines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    const ranged = line.match(/^\s*\[([0-9:.]+)\s*-->\s*([0-9:.]+)\]\s*(.*)$/);
    if (ranged) {
      const startSec = parseSubtitleTimestampToSeconds(ranged[1]);
      const endSec = parseSubtitleTimestampToSeconds(ranged[2]);
      const segmentText = normalizeOcrText(ranged[3]);
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec && segmentText) {
        out.push({ startSec, endSec, segmentText });
      }
      continue;
    }
    const single = line.match(/^\s*\[([0-9:.]+)\]\s*(.*)$/);
    if (!single) continue;
    const atSec = parseSubtitleTimestampToSeconds(single[1]);
    const segmentText = normalizeOcrText(single[2]);
    if (Number.isFinite(atSec) && segmentText) {
      out.push({ startSec: atSec, endSec: atSec, segmentText });
    }
  }
  return out;
}

function collectAssetSearchTexts(row) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const dcValues = Object.values(dc)
    .filter((value) => value !== null && value !== undefined)
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value.map((item) => {
          if (item && typeof item === 'object') return Object.values(item).join(' ');
          return String(item || '');
        });
      }
      if (value && typeof value === 'object') return [Object.values(value).join(' ')];
      return [String(value || '')];
    });
  const cuts = Array.isArray(row?.cuts) ? row.cuts : [];
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  return [
    String(row?.title || ''),
    String(row?.description || ''),
    String(row?.owner || ''),
    String(row?.type || ''),
    String(row?.status || ''),
    ...tags.map((tag) => String(tag || '')),
    ...dcValues,
    ...cuts.map((cut) => String(cut?.label || ''))
  ].filter(Boolean);
}

function buildAssetSearchText(row) {
  return collectAssetSearchTexts(row).join(' ');
}

function assetTextMatchesParsedQuery(text, parsedQuery) {
  const normalizedText = normalizeForSearch(text);
  if (!normalizedText || !parsedQuery?.raw) return false;
  if (!parsedQuery.hasOperators) {
    return normalizedText.includes(parsedQuery.raw);
  }
  const includesAllRequired = parsedQuery.mustInclude.every((term) => normalizedText.includes(term));
  if (!includesAllRequired) return false;
  const includesAllExact = parsedQuery.mustIncludeExact.every((term) => normalizedTextHasExactTerm(normalizedText, term));
  if (!includesAllExact) return false;
  const excludesForbidden = parsedQuery.mustExclude.every((term) => !normalizedText.includes(term));
  if (!excludesForbidden) return false;
  const excludesForbiddenExact = parsedQuery.mustExcludeExact.every((term) => !normalizedTextHasExactTerm(normalizedText, term));
  if (!excludesForbiddenExact) return false;
  const optionalTerms = parsedQuery.optional.filter((term) => normalizedText.includes(term));
  const optionalExactTerms = parsedQuery.optionalExact.filter((term) => normalizedTextHasExactTerm(normalizedText, term));
  if (parsedQuery.optional.length === 0 && parsedQuery.optionalExact.length === 0) return true;
  return optionalTerms.length > 0 || optionalExactTerms.length > 0;
}

function searchAssetsByFuzzyQuery(rows, query, limit = 500) {
  const parsedQuery = parseTextSearchQuery(query, normalizeForSearch);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 500));
  if (!parsedQuery.raw || parsedQuery.hasOperators) {
    return { rows: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  const candidateRows = Array.isArray(rows) ? rows : [];
  const fuzzyRows = candidateRows
    .filter((row) => fuzzySearchTextMatch(parsedQuery.raw, buildAssetSearchText(row), normalizeForSearch))
    .slice(0, safeLimit);
  const didYouMean = suggestDidYouMeanFromTexts(
    candidateRows.map((row) => buildAssetSearchText(row)),
    query,
    { parseFn: parseTextSearchQuery, normalizeFn: normalizeForSearch }
  );

  let matches = fuzzyRows;
  let fuzzyUsed = fuzzyRows.length > 0;
  let highlightQuery = String(query || '').trim();
  if (didYouMean) {
    highlightQuery = didYouMean;
    const suggestedQuery = parseTextSearchQuery(didYouMean, normalizeForSearch);
    const suggestedRows = candidateRows
      .filter((row) => assetTextMatchesParsedQuery(buildAssetSearchText(row), suggestedQuery))
      .slice(0, safeLimit);
    if (suggestedRows.length) {
      matches = suggestedRows;
      fuzzyUsed = true;
    }
  }

  return { rows: matches, didYouMean, fuzzyUsed, highlightQuery };
}

function tokenizeSubtitleSearchTokens(value) {
  return normalizeSubtitleSearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && /[\p{L}\p{N}]/u.test(token));
}

function fuzzySubtitleTokenMatch(queryToken, candidateToken) {
  const query = String(queryToken || '').trim();
  const candidate = String(candidateToken || '').trim();
  if (!query || !candidate) return false;
  if (query === candidate) return true;
  if (query.charAt(0) !== candidate.charAt(0)) return false;
  const lenDiff = Math.abs(query.length - candidate.length);
  if (lenDiff > 2) return false;
  const maxAllowed = query.length >= 7 ? 2 : 1;
  return levenshteinDistance(query, candidate) <= maxAllowed;
}

function fuzzySubtitleTextMatch(queryText, candidateText) {
  const queryTokens = tokenizeSubtitleSearchTokens(queryText);
  const candidateTokens = tokenizeSubtitleSearchTokens(candidateText);
  if (!queryTokens.length || !candidateTokens.length) return false;
  return queryTokens.every((queryToken) => (
    candidateTokens.some((candidateToken) => fuzzySubtitleTokenMatch(queryToken, candidateToken))
  ));
}

function suggestSubtitleDidYouMean(cues, query) {
  const parsedQuery = parseSubtitleTextSearchQuery(query);
  if (!parsedQuery.raw || parsedQuery.hasOperators) return '';
  const sourceTokens = tokenizeSubtitleSearchTokens(parsedQuery.raw);
  if (!sourceTokens.length) return '';

  const vocab = new Set();
  (Array.isArray(cues) ? cues : []).forEach((cue) => {
    tokenizeSubtitleSearchTokens(cue?.cueText || cue?.text || '').forEach((token) => vocab.add(token));
  });
  if (!vocab.size) return '';

  let replaced = false;
  const suggestedTokens = sourceTokens.map((token) => {
    let best = token;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of vocab) {
      const lenDiff = Math.abs(candidate.length - token.length);
      if (lenDiff > 2) continue;
      if (candidate.charAt(0) !== token.charAt(0)) continue;
      const dist = levenshteinDistance(token, candidate);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = candidate;
      }
      if (bestDistance === 1) break;
    }
    const maxAllowed = token.length >= 7 ? 2 : 1;
    if (best !== token && bestDistance <= maxAllowed) {
      replaced = true;
      return best;
    }
    return token;
  });

  if (!replaced) return '';
  const suggestion = suggestedTokens.join(' ').trim();
  if (!suggestion || suggestion === parsedQuery.raw) return '';
  return suggestion;
}

function mapSubtitleCueRow(row, query) {
  const startSec = Number(row?.start_sec ?? row?.startSec ?? 0);
  const endSec = Number(row?.end_sec ?? row?.endSec ?? startSec);
  const text = String(row?.cue_text ?? row?.cueText ?? row?.text ?? '').trim();
  return {
    seq: Number(row?.seq || 0),
    startSec,
    endSec,
    startTc: formatTimecode(startSec),
    endTc: formatTimecode(endSec),
    text,
    query: String(query || '').trim()
  };
}

function loadActiveSubtitleCuesForAssetRow(row) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const subtitleUrl = String(dc.subtitleUrl || '').trim();
  if (!subtitleUrl) return { subtitleUrl: '', cues: [] };
  const subtitlePath = publicUploadUrlToAbsolutePath(subtitleUrl);
  if (!subtitlePath || !fs.existsSync(subtitlePath)) return { subtitleUrl, cues: [] };
  try {
    const raw = fs.readFileSync(subtitlePath, 'utf8');
    return { subtitleUrl, cues: parseSubtitleCues(raw) };
  } catch (_error) {
    return { subtitleUrl, cues: [] };
  }
}

async function searchSubtitleMatchesForAssetRow(row, query, limit = 20) {
  const assetId = String(row?.id || '').trim();
  const parsedQuery = parseSubtitleTextSearchQuery(query);
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 20));
  if (!assetId || !parsedQuery.raw) {
    return { subtitleUrl: '', matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const subtitleUrl = String(dc.subtitleUrl || '').trim();
  if (!subtitleUrl) {
    return { subtitleUrl: '', matches: [], didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  await ensureSubtitleCueIndexForAssetRow(row);
  const subtitleWhere = buildSubtitleCueSearchWhereSql({
    normColumn: 'norm_text',
    startIndex: 3,
    parsedQuery
  });
  const result = await pool.query(
    `
      SELECT seq, start_sec, end_sec, cue_text
      FROM asset_subtitle_cues
      WHERE asset_id = $1
        AND subtitle_url = $2
        ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
      ORDER BY start_sec ASC
      LIMIT $${subtitleWhere.nextIndex}
    `,
    [assetId, subtitleUrl, ...subtitleWhere.params, safeLimit]
  );
  const exactMatches = result.rows.map((item) => mapSubtitleCueRow(item, query));
  if (exactMatches.length || parsedQuery.hasOperators) {
    return {
      subtitleUrl,
      matches: exactMatches,
      didYouMean: '',
      fuzzyUsed: false,
      highlightQuery: String(query || '').trim()
    };
  }

  const { cues } = loadActiveSubtitleCuesForAssetRow(row);
  if (!cues.length) {
    return {
      subtitleUrl,
      matches: [],
      didYouMean: '',
      fuzzyUsed: false,
      highlightQuery: String(query || '').trim()
    };
  }

  const fuzzyMatches = cues
    .filter((cue) => fuzzySubtitleTextMatch(parsedQuery.raw, cue.cueText))
    .slice(0, safeLimit)
    .map((cue) => mapSubtitleCueRow(cue, query));
  const didYouMean = suggestSubtitleDidYouMean(cues, query);
  let highlightQuery = String(query || '').trim();
  let matches = fuzzyMatches;
  let fuzzyUsed = fuzzyMatches.length > 0;

  if (didYouMean) {
    highlightQuery = didYouMean;
    const suggestedQuery = parseSubtitleTextSearchQuery(didYouMean);
    const suggestedMatches = cues
      .filter((cue) => subtitleCueMatchesParsedQuery(cue.cueText, suggestedQuery))
      .slice(0, safeLimit)
      .map((cue) => mapSubtitleCueRow(cue, didYouMean));
    if (suggestedMatches.length) {
      matches = suggestedMatches;
      fuzzyUsed = true;
    } else if (matches.length) {
      matches = matches.map((item) => ({ ...item, query: didYouMean }));
    }
  }

  return {
    subtitleUrl,
    matches,
    didYouMean,
    fuzzyUsed,
    highlightQuery
  };
}

async function searchSubtitleMatchesForAssetRows(rows, query, limit = 8) {
  const parsedQuery = parseSubtitleTextSearchQuery(query);
  const cap = Math.max(1, Math.min(50, Number(limit) || 8));
  const byAssetId = new Map();
  const assetRows = Array.isArray(rows) ? rows : [];
  if (!parsedQuery.raw || !assetRows.length) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  const activeUrlByAssetId = new Map();
  assetRows.forEach((row) => {
    const assetId = String(row?.id || '').trim();
    const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const subtitleUrl = String(dc.subtitleUrl || '').trim();
    if (assetId && subtitleUrl) activeUrlByAssetId.set(assetId, subtitleUrl);
  });
  if (!activeUrlByAssetId.size) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  const assetIds = Array.from(activeUrlByAssetId.keys());
  const activeUrls = Array.from(new Set(activeUrlByAssetId.values()));
  const subtitleWhere = buildSubtitleCueSearchWhereSql({
    normColumn: 'norm_text',
    startIndex: 3,
    parsedQuery
  });
  const exactResult = await pool.query(
    `
      WITH matched AS (
        SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY start_sec ASC) AS rn
        FROM asset_subtitle_cues
        WHERE asset_id = ANY($1::text[])
          AND subtitle_url = ANY($2::text[])
          ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
      )
      SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text
      FROM matched
      WHERE rn <= $${subtitleWhere.nextIndex}
      ORDER BY asset_id, start_sec ASC
    `,
    [assetIds, activeUrls, ...subtitleWhere.params, cap]
  );

  exactResult.rows.forEach((row) => {
    const assetId = String(row.asset_id || '').trim();
    const activeUrl = activeUrlByAssetId.get(assetId);
    if (!activeUrl || String(row.subtitle_url || '').trim() !== activeUrl) return;
    if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
    byAssetId.get(assetId).push(mapSubtitleCueRow(row, query));
  });

  if (byAssetId.size || parsedQuery.hasOperators) {
    return { byAssetId, didYouMean: '', fuzzyUsed: false, highlightQuery: String(query || '').trim() };
  }

  const cueResult = await pool.query(
    `
      SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text
      FROM asset_subtitle_cues
      WHERE asset_id = ANY($1::text[])
        AND subtitle_url = ANY($2::text[])
      ORDER BY asset_id, start_sec ASC
    `,
    [assetIds, activeUrls]
  );
  const activeCues = cueResult.rows.filter((row) => {
    const assetId = String(row.asset_id || '').trim();
    return String(row.subtitle_url || '').trim() === activeUrlByAssetId.get(assetId);
  });
  const didYouMean = suggestSubtitleDidYouMean(
    activeCues.map((row) => ({ cueText: String(row.cue_text || '') })),
    query
  );
  const highlightQuery = didYouMean || String(query || '').trim();
  const suggestedQuery = didYouMean ? parseSubtitleTextSearchQuery(didYouMean) : null;

  activeCues.forEach((row) => {
    const assetId = String(row.asset_id || '').trim();
    if (!assetId || (byAssetId.get(assetId) || []).length >= cap) return;
    const text = String(row.cue_text || '');
    const matched = suggestedQuery
      ? subtitleCueMatchesParsedQuery(text, suggestedQuery)
      : fuzzySubtitleTextMatch(parsedQuery.raw, text);
    if (!matched) return;
    if (!byAssetId.has(assetId)) byAssetId.set(assetId, []);
    byAssetId.get(assetId).push(mapSubtitleCueRow(row, highlightQuery));
  });

  return {
    byAssetId,
    didYouMean,
    fuzzyUsed: byAssetId.size > 0,
    highlightQuery
  };
}

async function syncSubtitleCueIndexForAssetRow(row) {
  const assetId = String(row?.id || '').trim();
  if (!assetId) return 0;
  const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const subtitleUrl = String(dc.subtitleUrl || '').trim();
  if (!subtitleUrl) {
    await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [assetId]);
    return 0;
  }
  const subtitlePath = publicUploadUrlToAbsolutePath(subtitleUrl);
  if (!subtitlePath || !fs.existsSync(subtitlePath)) {
    await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [assetId]);
    return 0;
  }
  const raw = fs.readFileSync(subtitlePath, 'utf8');
  const cues = parseSubtitleCues(raw);
  const now = new Date().toISOString();

  await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [assetId]);
  if (!cues.length) return 0;

  for (let idx = 0; idx < cues.length; idx += 1) {
    const cue = cues[idx];
    const normText = normalizeSubtitleSearchText(cue.cueText);
    await pool.query(
      `
        INSERT INTO asset_subtitle_cues (
          asset_id, subtitle_url, seq, start_sec, end_sec, cue_text, norm_text, confidence, source_engine, lang, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        assetId,
        subtitleUrl,
        idx + 1,
        cue.startSec,
        cue.endSec,
        cue.cueText,
        normText,
        1,
        'whisper',
        normalizeSubtitleLang(dc.subtitleLang),
        now
      ]
    );
  }
  return cues.length;
}

async function ensureSubtitleCueIndexForAssetRow(row) {
  const assetId = String(row?.id || '').trim();
  if (!assetId) return 0;
  const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const subtitleUrl = String(dc.subtitleUrl || '').trim();
  if (!subtitleUrl) return 0;
  const existing = await pool.query(
    'SELECT COUNT(*)::int AS count FROM asset_subtitle_cues WHERE asset_id = $1 AND subtitle_url = $2',
    [assetId, subtitleUrl]
  );
  const count = Number(existing.rows?.[0]?.count || 0);
  if (count > 0) return count;
  return syncSubtitleCueIndexForAssetRow(row);
}

async function syncOcrSegmentIndexForAsset(assetId, ocrUrl, options = {}) {
  const safeAssetId = String(assetId || '').trim();
  const safeOcrUrl = String(ocrUrl || '').trim();
  if (!safeAssetId || !safeOcrUrl) return 0;
  const ocrPath = publicUploadUrlToAbsolutePath(safeOcrUrl);
  await pool.query('DELETE FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2', [safeAssetId, safeOcrUrl]);
  if (!ocrPath || !ocrPath.startsWith(OCR_DIR) || !fs.existsSync(ocrPath)) return 0;
  let raw = '';
  try {
    raw = fs.readFileSync(ocrPath, 'utf8');
  } catch (_error) {
    return 0;
  }
  const segments = parseTimedOcrSegments(raw);
  if (!segments.length) return 0;
  const sourceEngine = normalizeOcrEngine(options.sourceEngine || 'paddle');
  const lang = String(options.lang || '').trim();
  const now = new Date().toISOString();
  for (let idx = 0; idx < segments.length; idx += 1) {
    const seg = segments[idx];
    const normText = normalizeSubtitleSearchText(seg.segmentText);
    await pool.query(
      `
        INSERT INTO asset_ocr_segments (
          asset_id, ocr_url, seq, start_sec, end_sec, segment_text, norm_text, confidence, source_engine, lang, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        safeAssetId,
        safeOcrUrl,
        idx + 1,
        seg.startSec,
        seg.endSec,
        seg.segmentText,
        normText,
        1,
        sourceEngine,
        lang,
        now
      ]
    );
  }
  return segments.length;
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
  const updatedRow = result.rows[0];
  try {
    await syncSubtitleCueIndexForAssetRow(updatedRow);
  } catch (_error) {}
  return updatedRow;
}

function getLatestVideoOcrJobForAsset(assetId) {
  const target = String(assetId || '').trim();
  if (!target) return null;
  const jobs = Array.from(videoOcrJobs.values())
    .filter((job) => String(job?.assetId || '') === target)
    .sort((a, b) => {
      const ta = Date.parse(String(a?.updatedAt || a?.startedAt || 0)) || 0;
      const tb = Date.parse(String(b?.updatedAt || b?.startedAt || 0)) || 0;
      return tb - ta;
    });
  return jobs[0] || null;
}

function normalizeMediaJobType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'subtitle' || raw === 'video_ocr' || raw === 'proxy') return raw;
  return '';
}

function normalizeMediaJobStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'queued' || raw === 'running' || raw === 'completed' || raw === 'failed') return raw;
  return 'queued';
}

function buildMediaJobProgress(status) {
  const safe = normalizeMediaJobStatus(status);
  if (safe === 'completed') return 100;
  if (safe === 'running') return 40;
  if (safe === 'failed') return 0;
  return 5;
}

function safeJsonPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

async function upsertMediaProcessingJob(record) {
  const jobId = String(record?.jobId || '').trim();
  const assetId = String(record?.assetId || '').trim();
  const jobType = normalizeMediaJobType(record?.jobType);
  if (!jobId || !assetId || !jobType) return;
  const status = normalizeMediaJobStatus(record?.status);
  const requestPayload = safeJsonPayload(record?.requestPayload);
  const resultPayload = safeJsonPayload(record?.resultPayload);
  const errorText = String(record?.errorText || '').slice(0, 4000);
  const progress = Math.max(0, Math.min(100, Number(record?.progress) || buildMediaJobProgress(status)));
  const createdAt = record?.createdAt ? new Date(record.createdAt).toISOString() : new Date().toISOString();
  const updatedAt = record?.updatedAt ? new Date(record.updatedAt).toISOString() : new Date().toISOString();
  const startedAt = record?.startedAt ? new Date(record.startedAt).toISOString() : null;
  const finishedAt = record?.finishedAt ? new Date(record.finishedAt).toISOString() : null;
  await pool.query(
    `
      INSERT INTO media_processing_jobs (
        job_id, asset_id, job_type, status, request_payload, result_payload, error_text, progress,
        created_at, updated_at, started_at, finished_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (job_id)
      DO UPDATE SET
        asset_id = EXCLUDED.asset_id,
        job_type = EXCLUDED.job_type,
        status = EXCLUDED.status,
        request_payload = EXCLUDED.request_payload,
        result_payload = EXCLUDED.result_payload,
        error_text = EXCLUDED.error_text,
        progress = EXCLUDED.progress,
        updated_at = EXCLUDED.updated_at,
        started_at = COALESCE(EXCLUDED.started_at, media_processing_jobs.started_at),
        finished_at = EXCLUDED.finished_at
    `,
    [
      jobId,
      assetId,
      jobType,
      status,
      JSON.stringify(requestPayload),
      JSON.stringify(resultPayload),
      errorText,
      progress,
      createdAt,
      updatedAt,
      startedAt,
      finishedAt
    ]
  );
}

async function upsertMediaProcessingJobSafe(record) {
  try {
    await upsertMediaProcessingJob(record);
  } catch (_error) {
    // Job persistence hatasi asıl iş akışını durdurmamalı.
  }
}

async function getMediaProcessingJobById(jobId, expectedType = '') {
  const safeJobId = String(jobId || '').trim();
  if (!safeJobId) return null;
  const safeType = normalizeMediaJobType(expectedType);
  const result = safeType
    ? await pool.query(
      `
        SELECT *
        FROM media_processing_jobs
        WHERE job_id = $1
          AND job_type = $2
        LIMIT 1
      `,
      [safeJobId, safeType]
    )
    : await pool.query(
      `
        SELECT *
        FROM media_processing_jobs
        WHERE job_id = $1
        LIMIT 1
      `,
      [safeJobId]
    );
  return result.rowCount ? result.rows[0] : null;
}

async function getLatestMediaProcessingJobForAsset(assetId, jobType) {
  const safeAssetId = String(assetId || '').trim();
  const safeType = normalizeMediaJobType(jobType);
  if (!safeAssetId || !safeType) return null;
  const result = await pool.query(
    `
      SELECT *
      FROM media_processing_jobs
      WHERE asset_id = $1
        AND job_type = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [safeAssetId, safeType]
  );
  return result.rowCount ? result.rows[0] : null;
}

function buildVideoOcrDbRequestPayload(job) {
  return {
    intervalSec: Number(job.intervalSec || 0),
    ocrLang: String(job.ocrLang || ''),
    ocrPreset: normalizeOcrPreset(job.ocrPreset),
    ocrLabel: String(job.ocrLabel || ''),
    ocrEngine: normalizeOcrEngine(job.ocrEngine || job.requestedEngine || 'paddle'),
    requestedEngine: normalizeOcrEngine(job.requestedEngine || job.ocrEngine || 'paddle'),
    mode: String(job.mode || 'basic'),
    advancedMode: Boolean(job.advancedMode),
    turkishAiCorrect: Boolean(job.turkishAiCorrect),
    useZemberekLexicon: Boolean(job.useZemberekLexicon),
    preprocessProfile: String(job.preprocessProfile || 'light'),
    enableBlurFilter: Boolean(job.enableBlurFilter),
    blurThreshold: Number(job.blurThreshold || 0),
    enableRegionMode: Boolean(job.enableRegionMode),
    tickerHeightPct: Number(job.tickerHeightPct || 0),
    ignoreStaticOverlays: Boolean(job.ignoreStaticOverlays),
    ignorePhrases: String(job.ignorePhrases || ''),
    minDisplaySec: Number(job.minDisplaySec || 0),
    mergeGapSec: Number(job.mergeGapSec || 0),
    enableSceneSampling: Boolean(job.enableSceneSampling),
    sceneThreshold: Number(job.sceneThreshold || 0),
    maxSceneFrames: Number(job.maxSceneFrames || 0),
    sceneMinGapSec: Number(job.sceneMinGapSec || 0)
  };
}

function buildVideoOcrDbResultPayload(job) {
  return {
    resultUrl: String(job.resultUrl || ''),
    resultLabel: String(job.resultLabel || ''),
    lineCount: Number(job.lineCount || 0),
    segmentCount: Number(job.segmentCount || 0),
    ocrEngine: normalizeOcrEngine(job.ocrEngine || job.requestedEngine || 'paddle'),
    warning: String(job.warning || ''),
    detectedStaticPhrases: Array.isArray(job.detectedStaticPhrases) ? job.detectedStaticPhrases : [],
    skippedBlur: Number(job.skippedBlur || 0),
    sceneFrameCount: Number(job.sceneFrameCount || 0),
    droppedSceneFrames: Number(job.droppedSceneFrames || 0),
    patchedPeriodicFrames: Number(job.patchedPeriodicFrames || 0),
    keptSceneFrames: Number(job.keptSceneFrames || 0),
    mode: String(job.mode || 'basic')
  };
}

function mapVideoOcrJobFromDbRow(row) {
  const request = safeJsonPayload(row?.request_payload);
  const result = safeJsonPayload(row?.result_payload);
  const status = normalizeMediaJobStatus(row?.status);
  const ocrEngine = normalizeOcrEngine(request.ocrEngine || result.ocrEngine || 'paddle');
  const resultUrl = String(result.resultUrl || '').trim();
  return {
    jobId: String(row?.job_id || ''),
    assetId: String(row?.asset_id || ''),
    status,
    intervalSec: Number(request.intervalSec || 0),
    ocrLang: String(request.ocrLang || ''),
    ocrPreset: normalizeOcrPreset(request.ocrPreset),
    ocrLabel: String(request.ocrLabel || ''),
    ocrEngine,
    requestedEngine: normalizeOcrEngine(request.requestedEngine || request.ocrEngine || 'paddle'),
    resultUrl,
    downloadUrl: resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(String(row?.job_id || ''))}/download` : '',
    resultLabel: String(result.resultLabel || ''),
    lineCount: Number(result.lineCount || 0),
    segmentCount: Number(result.segmentCount || 0),
    mode: String(result.mode || request.mode || 'basic'),
    advancedMode: Boolean(request.advancedMode),
    turkishAiCorrect: Boolean(request.turkishAiCorrect),
    useZemberekLexicon: Boolean(request.useZemberekLexicon),
    preprocessProfile: String(request.preprocessProfile || 'light'),
    enableBlurFilter: Boolean(request.enableBlurFilter),
    blurThreshold: Number(request.blurThreshold || 0),
    enableRegionMode: Boolean(request.enableRegionMode),
    tickerHeightPct: Number(request.tickerHeightPct || 0),
    ignoreStaticOverlays: Boolean(request.ignoreStaticOverlays),
    ignorePhrases: String(request.ignorePhrases || ''),
    detectedStaticPhrases: Array.isArray(result.detectedStaticPhrases) ? result.detectedStaticPhrases : [],
    skippedBlur: Number(result.skippedBlur || 0),
    sceneFrameCount: Number(result.sceneFrameCount || 0),
    droppedSceneFrames: Number(result.droppedSceneFrames || 0),
    patchedPeriodicFrames: Number(result.patchedPeriodicFrames || 0),
    keptSceneFrames: Number(result.keptSceneFrames || 0),
    minDisplaySec: Number(request.minDisplaySec || 0),
    mergeGapSec: Number(request.mergeGapSec || 0),
    enableSceneSampling: Boolean(request.enableSceneSampling),
    sceneThreshold: Number(request.sceneThreshold || 0),
    maxSceneFrames: Number(request.maxSceneFrames || 0),
    sceneMinGapSec: Number(request.sceneMinGapSec || 0),
    warning: String(result.warning || ''),
    error: String(row?.error_text || ''),
    startedAt: row?.started_at ? new Date(row.started_at).toISOString() : (row?.created_at ? new Date(row.created_at).toISOString() : ''),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : '',
    finishedAt: row?.finished_at ? new Date(row.finished_at).toISOString() : ''
  };
}

function buildSubtitleDbRequestPayload(job) {
  return {
    model: String(job.model || WHISPER_MODEL || 'small'),
    subtitleLang: normalizeSubtitleLang(job.subtitleLang),
    subtitleLabel: String(job.subtitleLabel || 'auto-whisper'),
    turkishAiCorrect: Boolean(job.turkishAiCorrect),
    useZemberekLexicon: Boolean(job.useZemberekLexicon),
    audioStreamIndex: Number.isFinite(Number(job.audioStreamIndex)) ? Number(job.audioStreamIndex) : null,
    audioChannelIndex: Number.isFinite(Number(job.audioChannelIndex)) ? Number(job.audioChannelIndex) : null,
    subtitleBackend: normalizeSubtitleBackend(job.subtitleBackendRequested || job.subtitleBackend)
  };
}

function buildSubtitleDbResultPayload(job) {
  return {
    subtitleUrl: String(job.subtitleUrl || ''),
    subtitleLang: normalizeSubtitleLang(job.subtitleLang),
    subtitleLabel: String(job.subtitleLabel || ''),
    model: String(job.model || WHISPER_MODEL || 'small'),
    subtitleBackend: normalizeSubtitleBackend(job.subtitleBackend || job.subtitleBackendRequested),
    warning: String(job.warning || '')
  };
}

function mapSubtitleJobFromDbRow(row) {
  const request = safeJsonPayload(row?.request_payload);
  const result = safeJsonPayload(row?.result_payload);
  return {
    jobId: String(row?.job_id || ''),
    assetId: String(row?.asset_id || ''),
    status: normalizeMediaJobStatus(row?.status),
    subtitleUrl: String(result.subtitleUrl || ''),
    subtitleLang: normalizeSubtitleLang(result.subtitleLang || request.subtitleLang),
    subtitleLabel: String(result.subtitleLabel || request.subtitleLabel || ''),
    model: String(result.model || request.model || ''),
    turkishAiCorrect: Boolean(request.turkishAiCorrect),
    useZemberekLexicon: Boolean(request.useZemberekLexicon),
    audioStreamIndex: Number.isFinite(Number(request.audioStreamIndex)) ? Number(request.audioStreamIndex) : null,
    audioChannelIndex: Number.isFinite(Number(request.audioChannelIndex)) ? Number(request.audioChannelIndex) : null,
    subtitleBackend: normalizeSubtitleBackend(result.subtitleBackend || request.subtitleBackend),
    warning: String(result.warning || ''),
    asset: null,
    error: String(row?.error_text || ''),
    startedAt: row?.started_at ? new Date(row.started_at).toISOString() : (row?.created_at ? new Date(row.created_at).toISOString() : ''),
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : '',
    finishedAt: row?.finished_at ? new Date(row.finished_at).toISOString() : ''
  };
}

async function saveAssetVideoOcrMetadata(assetId, row, job) {
  const now = new Date().toISOString();
  const existingDc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const items = sanitizeVideoOcrItems(existingDc.videoOcrItems);
  const nextVersion = items.length + 1;
  const requestedLabel = normalizeRequestedOcrLabel(
    job.ocrLabel,
    buildOcrDisplayLabel({
      assetTitle: String(row?.title || ''),
      fileName: String(row?.file_name || ''),
      createdAt: now,
      engine: normalizeOcrEngine(job.ocrEngine || job.requestedEngine || 'paddle'),
      version: nextVersion
    })
  );
  items.push({
    id: nanoid(),
    ocrUrl: String(job.resultUrl || '').trim(),
    ocrLabel: requestedLabel,
    ocrEngine: normalizeOcrEngine(job.ocrEngine || job.requestedEngine || 'paddle'),
    lineCount: Math.max(0, Number(job.lineCount) || 0),
    segmentCount: Math.max(0, Number(job.segmentCount) || 0),
    createdAt: now
  });
  const latest = items[items.length - 1];
  const dcMetadata = {
    ...existingDc,
    videoOcrUrl: latest.ocrUrl,
    videoOcrLabel: latest.ocrLabel,
    videoOcrEngine: latest.ocrEngine,
    videoOcrLineCount: latest.lineCount,
    videoOcrSegmentCount: latest.segmentCount,
    videoOcrItems: items
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
  const updatedRow = result.rows[0];
  try {
    await syncOcrSegmentIndexForAsset(assetId, latest.ocrUrl, {
      sourceEngine: latest.ocrEngine,
      lang: String(job?.ocrLang || '')
    });
  } catch (_error) {}
  return { row: updatedRow, item: latest };
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

function inferAssetStorageSubdir(input = {}) {
  return normalizeTypeFolder(input.type, input.mimeType, input.fileName);
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

let lastOcrFrameCacheCleanupAt = 0;

function normalizeFrameCacheKeyPart(value, fallback = 'unknown') {
  const raw = String(value || '').trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function getOcrFrameCacheDir(assetId, intervalSec) {
  const assetPart = normalizeFrameCacheKeyPart(assetId, 'asset');
  const intervalPart = Math.max(1, Math.min(30, Number(intervalSec) || 4));
  return path.join(OCR_FRAME_CACHE_DIR, `${assetPart}__i${intervalPart}`);
}

function getOcrFrameCacheMetaPath(cacheDir) {
  return path.join(cacheDir, 'meta.json');
}

function listRawOcrFrames(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath)
      .filter((name) => /^(?:frame|scene)-\d+\.jpg$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (_error) {
    return [];
  }
}

function readOcrFrameCacheMeta(cacheDir) {
  const metaPath = getOcrFrameCacheMetaPath(cacheDir);
  if (!fs.existsSync(metaPath)) return {};
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function writeOcrFrameCacheMeta(cacheDir, meta = {}) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const nowIso = new Date().toISOString();
    const next = {
      ...meta,
      updatedAt: nowIso,
      lastUsedAt: nowIso
    };
    fs.writeFileSync(getOcrFrameCacheMetaPath(cacheDir), JSON.stringify(next), 'utf8');
  } catch (_error) {
    // no-op
  }
}

function touchOcrFrameCache(cacheDir) {
  const now = Date.now();
  try {
    if (cacheDir && fs.existsSync(cacheDir)) {
      const stamp = new Date(now);
      fs.utimesSync(cacheDir, stamp, stamp);
    }
  } catch (_error) {
    // no-op
  }
  const meta = readOcrFrameCacheMeta(cacheDir);
  writeOcrFrameCacheMeta(cacheDir, {
    ...meta,
    lastUsedAt: new Date(now).toISOString()
  });
}

function cleanupOcrFrameCache() {
  if (!OCR_FRAME_CACHE_ENABLED) return;
  const now = Date.now();
  // Throttle cleanup to at most once every 15 minutes.
  if (now - lastOcrFrameCacheCleanupAt < 15 * 60 * 1000) return;
  lastOcrFrameCacheCleanupAt = now;
  const ttlMs = OCR_FRAME_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(OCR_FRAME_CACHE_DIR)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(OCR_FRAME_CACHE_DIR, { withFileTypes: true });
  } catch (_error) {
    return;
  }
  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const cacheDir = path.join(OCR_FRAME_CACHE_DIR, entry.name);
    const meta = readOcrFrameCacheMeta(cacheDir);
    const rawStamp = String(meta.lastUsedAt || meta.updatedAt || '').trim();
    const stampMs = Date.parse(rawStamp);
    const fallbackMs = (() => {
      try {
        return fs.statSync(cacheDir).mtimeMs;
      } catch (_error) {
        return now;
      }
    })();
    const usedAt = Number.isFinite(stampMs) ? stampMs : fallbackMs;
    if (now - usedAt > ttlMs) safeRmDir(cacheDir);
  });
}

function restoreOcrFramesFromCache({ assetId, intervalSec, workDir, includeSceneFrames }) {
  if (!OCR_FRAME_CACHE_ENABLED) return { restored: false, periodicCount: 0, sceneCount: 0 };
  const safeAssetId = String(assetId || '').trim();
  if (!safeAssetId) return { restored: false, periodicCount: 0, sceneCount: 0 };
  const cacheDir = getOcrFrameCacheDir(safeAssetId, intervalSec);
  if (!fs.existsSync(cacheDir)) return { restored: false, periodicCount: 0, sceneCount: 0 };
  const names = listRawOcrFrames(cacheDir);
  const periodic = names.filter((name) => /^frame-\d+\.jpg$/i.test(name));
  const scenes = names.filter((name) => /^scene-\d+\.jpg$/i.test(name));
  if (!periodic.length) return { restored: false, periodicCount: 0, sceneCount: 0 };
  const selected = includeSceneFrames ? [...periodic, ...scenes] : periodic;
  try {
    fs.mkdirSync(workDir, { recursive: true });
    selected.forEach((name) => {
      fs.copyFileSync(path.join(cacheDir, name), path.join(workDir, name));
    });
    touchOcrFrameCache(cacheDir);
    return {
      restored: true,
      periodicCount: periodic.length,
      sceneCount: includeSceneFrames ? scenes.length : 0
    };
  } catch (_error) {
    return { restored: false, periodicCount: 0, sceneCount: 0 };
  }
}

function updateOcrFrameCacheFromWorkDir({ assetId, intervalSec, workDir }) {
  if (!OCR_FRAME_CACHE_ENABLED) return;
  const safeAssetId = String(assetId || '').trim();
  if (!safeAssetId) return;
  const sourceNames = listRawOcrFrames(workDir);
  const periodic = sourceNames.filter((name) => /^frame-\d+\.jpg$/i.test(name));
  const scenes = sourceNames.filter((name) => /^scene-\d+\.jpg$/i.test(name));
  if (!periodic.length) return;
  const cacheDir = getOcrFrameCacheDir(safeAssetId, intervalSec);
  fs.mkdirSync(cacheDir, { recursive: true });
  listRawOcrFrames(cacheDir).forEach((name) => {
    try {
      fs.unlinkSync(path.join(cacheDir, name));
    } catch (_error) {
      // ignore
    }
  });
  [...periodic, ...scenes].forEach((name) => {
    try {
      fs.copyFileSync(path.join(workDir, name), path.join(cacheDir, name));
    } catch (_error) {
      // ignore
    }
  });
  writeOcrFrameCacheMeta(cacheDir, {
    assetId: safeAssetId,
    intervalSec: Math.max(1, Math.min(30, Number(intervalSec) || 4)),
    periodicCount: periodic.length,
    sceneCount: scenes.length
  });
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

function isOfficeDocumentCandidate({ mimeType, fileName }) {
  const mime = String(mimeType || '').toLowerCase();
  const ext = getFileExtension(fileName);
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return true;
  return (
    mime.includes('msword')
    || mime.includes('officedocument')
    || mime.includes('ms-excel')
    || mime.includes('ms-powerpoint')
    || mime.includes('opendocument')
    || mime.includes('sheet')
    || mime.includes('presentation')
    || mime.includes('wordprocessingml')
  );
}

function getAssetFamily({ mimeType, fileName, declaredType }) {
  if (isVideoCandidate({ mimeType, fileName, declaredType })) return 'video';
  if (String(mimeType || '').toLowerCase().startsWith('audio/')) return 'audio';
  if (String(mimeType || '').toLowerCase().startsWith('image/')) return 'image';
  if (isDocumentCandidate({ mimeType, fileName, declaredType })) return 'document';
  return 'unknown';
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

function normalizePublicUploadUrl(value, defaultSubdir = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (path.isAbsolute(raw)) {
    const rel = path.relative(UPLOADS_DIR, raw);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return `/uploads/${rel.replace(/\\/g, '/')}`;
    }
  }
  return resolveStoredUrl(raw, defaultSubdir);
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

function computeBufferSha256(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function computeFileSha256(filePath) {
  const safePath = String(filePath || '').trim();
  if (!safePath || !fs.existsSync(safePath)) return '';
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(safePath));
  return hash.digest('hex');
}

async function persistAssetFileHash(assetId, fileHash) {
  const safeId = String(assetId || '').trim();
  const safeHash = String(fileHash || '').trim().toLowerCase();
  if (!safeId || !safeHash) return;
  try {
    await pool.query('UPDATE assets SET file_hash = $2 WHERE id = $1', [safeId, safeHash]);
  } catch (_error) {
    // Hash backfill is opportunistic; request flow should not fail because of it.
  }
}

async function getAssetStoredFileHash(row, { persist = true } = {}) {
  if (!row || typeof row !== 'object') return '';
  const existingHash = String(row.file_hash || '').trim().toLowerCase();
  if (existingHash) return existingHash;
  const inputPath = resolveAssetInputPath(row);
  if (!inputPath) return '';
  const computedHash = computeFileSha256(inputPath);
  if (computedHash && persist) {
    await persistAssetFileHash(row.id, computedHash);
  }
  return computedHash;
}

function buildDuplicateAssetPayload(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || '').trim(),
    title: String(row.title || '').trim(),
    fileName: String(row.file_name || '').trim(),
    type: String(row.type || '').trim(),
    updatedAt: row.updated_at || row.created_at || null,
    deletedAt: row.deleted_at || null
  };
}

async function findDuplicateAssetByHash(fileHash, { excludeAssetId = '', includeDeleted = false } = {}) {
  const safeHash = String(fileHash || '').trim().toLowerCase();
  const safeExcludeId = String(excludeAssetId || '').trim();
  if (!safeHash) return null;

  const exact = await pool.query(
    `
      SELECT *
      FROM assets
      WHERE file_hash = $1
        AND ($2 = '' OR id <> $2)
        AND ($3::boolean = true OR deleted_at IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [safeHash, safeExcludeId, includeDeleted]
  );
  if (exact.rowCount) return exact.rows[0];

  const legacy = await pool.query(
    `
      SELECT *
      FROM assets
      WHERE COALESCE(file_hash, '') = ''
        AND ($1 = '' OR id <> $1)
        AND ($2::boolean = true OR deleted_at IS NULL)
      ORDER BY updated_at DESC
    `,
    [safeExcludeId, includeDeleted]
  );

  for (const row of legacy.rows) {
    const candidateHash = await getAssetStoredFileHash(row, { persist: true });
    if (candidateHash === safeHash) return row;
  }
  return null;
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

function isPathInsideRoot(filePath, rootDir) {
  const safePath = String(filePath || '').trim();
  const safeRoot = String(rootDir || '').trim();
  if (!safePath || !safeRoot) return false;
  const resolvedPath = path.resolve(safePath);
  const resolvedRoot = path.resolve(safeRoot);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
}

const assetDeletionService = createAssetDeletionService({
  pool,
  uploadRoots: {
    uploads: UPLOADS_DIR,
    proxies: PROXIES_DIR,
    thumbnails: THUMBNAILS_DIR,
    subtitles: SUBTITLES_DIR,
    ocr: OCR_DIR
  },
  isPathInsideRoot,
  resolveStoredUrl,
  publicUploadUrlToAbsolutePath,
  removeAssetFromElastic
});
const {
  collectAssetCleanupPaths,
  cleanupAssetFiles,
  removeAssetFromCollections,
  deleteAssetFromElastic
} = assetDeletionService;

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
    .replace(/[İIı]/g, 'i')
    .replace(/\u0307/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  let videoOcrItems = sanitizeVideoOcrItems(dcMetadata.videoOcrItems);
  if (!subtitleItems.length && String(dcMetadata.subtitleUrl || '').trim()) {
    subtitleItems = [{
      id: nanoid(),
      subtitleUrl: String(dcMetadata.subtitleUrl || '').trim(),
      subtitleLang: normalizeSubtitleLang(dcMetadata.subtitleLang),
      subtitleLabel: String(dcMetadata.subtitleLabel || '').trim() || 'subtitle',
      createdAt: row.updated_at || row.created_at || new Date().toISOString()
    }];
  }
  if (!videoOcrItems.length && String(dcMetadata.videoOcrUrl || '').trim()) {
    videoOcrItems = [{
      id: nanoid(),
      ocrUrl: String(dcMetadata.videoOcrUrl || '').trim(),
      ocrLabel: String(dcMetadata.videoOcrLabel || '').trim() || 'video-ocr.txt',
      ocrEngine: normalizeOcrEngine(dcMetadata.videoOcrEngine || 'paddle'),
      lineCount: Math.max(0, Number(dcMetadata.videoOcrLineCount) || 0),
      segmentCount: Math.max(0, Number(dcMetadata.videoOcrSegmentCount) || 0),
      createdAt: row.updated_at || row.created_at || new Date().toISOString()
    }];
  }
  const listCuts = Array.isArray(row.cuts)
    ? row.cuts
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const label = String(item.label || '').trim();
        if (!label) return null;
        return {
          cutId: String(item.cutId || '').trim(),
          label,
          inPointSeconds: Math.max(0, Number(item.inPointSeconds || 0)),
          outPointSeconds: Math.max(0, Number(item.outPointSeconds || 0))
        };
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
    audioStreamOptions: Array.isArray(dcMetadata.audioStreamOptions) ? dcMetadata.audioStreamOptions : [],
    videoOcrUrl: String(dcMetadata.videoOcrUrl || '').trim(),
    videoOcrLabel: String(dcMetadata.videoOcrLabel || '').trim(),
    videoOcrEngine: normalizeOcrEngine(dcMetadata.videoOcrEngine || 'paddle'),
    videoOcrLineCount: Math.max(0, Number(dcMetadata.videoOcrLineCount) || 0),
    videoOcrSegmentCount: Math.max(0, Number(dcMetadata.videoOcrSegmentCount) || 0),
    videoOcrItems,
    ocrSearchHit: row._ocr_search_hit || null,
    ocrSearchHits: Array.isArray(row._ocr_search_hits) ? row._ocr_search_hits : [],
    subtitleSearchHit: row._subtitle_search_hit || null,
    subtitleSearchHits: Array.isArray(row._subtitle_search_hits) ? row._subtitle_search_hits : [],
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
    snapshotMediaUrl: row.snapshot_media_url || '',
    snapshotSourcePath: row.snapshot_source_path || '',
    snapshotFileName: row.snapshot_file_name || '',
    snapshotMimeType: row.snapshot_mime_type || '',
    snapshotThumbnailUrl: row.snapshot_thumbnail_url || '',
    actorUsername: row.actor_username || '',
    actionType: row.action_type || 'manual',
    restoredFromVersionId: row.restored_from_version_id || '',
    createdAt: row.created_at
  };
}

function buildVersionSnapshotFromRow(row) {
  return {
    snapshotMediaUrl: String(row?.media_url || '').trim(),
    snapshotSourcePath: String(row?.source_path || '').trim(),
    snapshotFileName: String(row?.file_name || '').trim(),
    snapshotMimeType: String(row?.mime_type || '').trim(),
    snapshotThumbnailUrl: String(row?.thumbnail_url || '').trim()
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
    mediaUrl: normalizePublicUploadUrl(input.mediaUrl || input.sourcePath, inferAssetStorageSubdir(input)) || input.mediaUrl?.trim() || '',
    proxyUrl: normalizePublicUploadUrl(input.proxyUrl, 'proxies') || input.proxyUrl?.trim() || '',
    proxyStatus: input.proxyStatus?.trim() || 'not_applicable',
    thumbnailUrl: normalizePublicUploadUrl(input.thumbnailUrl, 'thumbnails') || input.thumbnailUrl?.trim() || '',
    fileName: input.fileName?.trim() || '',
    mimeType: input.mimeType?.trim() || '',
    fileHash: input.fileHash?.trim().toLowerCase() || '',
    dcMetadata: {
      ...buildDefaultDcMetadata(input),
      ...sanitizeDcMetadata(input.dcMetadata)
    },
    status: input.status?.trim() || 'Ingested',
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  };

  const version = {
    versionId: nanoid(),
    label: 'v1',
    note: 'Initial ingest',
    snapshot: {
      snapshotMediaUrl: asset.mediaUrl,
      snapshotSourcePath: asset.sourcePath,
      snapshotFileName: asset.fileName,
      snapshotMimeType: asset.mimeType,
      snapshotThumbnailUrl: asset.thumbnailUrl
    },
    actorUsername: String(asset.owner || '').trim() || 'system',
    actionType: 'ingest',
    createdAt: now
  };

  await pool.query('BEGIN');
  try {
    await pool.query(
      `
        INSERT INTO assets (
          id, title, description, type, tags, owner, duration_seconds, source_path,
          media_url, proxy_url, proxy_status, thumbnail_url, file_name, mime_type, dc_metadata, file_hash, status, created_at, updated_at
          , deleted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
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
        asset.fileHash,
        asset.status,
        asset.createdAt,
        asset.updatedAt,
        asset.deletedAt
      ]
    );
    await pool.query(
      `
        INSERT INTO asset_versions (
          version_id, asset_id, label, note,
          snapshot_media_url, snapshot_source_path, snapshot_file_name, snapshot_mime_type, snapshot_thumbnail_url,
          actor_username, action_type, restored_from_version_id,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        version.versionId, asset.id, version.label, version.note,
        version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
        version.actorUsername, version.actionType, null,
        version.createdAt
      ]
    );
    await pool.query('COMMIT');
    await indexAssetToElastic(asset.id).catch(() => {});
    return { ...asset, versions: [version] };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function generateVideoProxy(inputPath, outputPath, options = {}) {
  const audioStreams = await getMediaAudioStreams(inputPath);
  const allowAudioFallback = Boolean(options.allowAudioFallback);
  const runProxy = async (includeAudio) => {
    await new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
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

      if (!includeAudio || audioStreams.length === 0) {
        args.push('-an');
      } else if (audioStreams.length === 1) {
        const channels = Math.max(1, Number(audioStreams[0].channels) || 2);
        if (channels > 2) {
          // Multichannel in AAC/7.1 can attenuate LFE-designated channel content.
          // Use Opus for >2 channels to keep channels full-range and faithful.
          args.push(
            '-map',
            '0:a:0',
            '-c:a',
            'libopus',
            '-ac',
            String(channels),
            '-b:a',
            channels >= 8 ? '512k' : '320k'
          );
        } else {
          args.push(
            '-map',
            '0:a:0',
            '-c:a',
            'aac',
            '-b:a',
            '128k'
          );
        }
      } else {
        const inputs = audioStreams.map((_s, idx) => `[0:a:${idx}]`).join('');
        const mergedChannels = audioStreams.reduce((acc, s) => acc + Math.max(1, Number(s.channels) || 1), 0);
        const mergedOutChannels = Math.max(2, mergedChannels);
        args.push(
          '-filter_complex',
          `${inputs}amerge=inputs=${audioStreams.length}[aout]`,
          '-map',
          '[aout]'
        );
        if (mergedOutChannels > 2) {
          args.push(
            '-c:a',
            'libopus',
            '-ac',
            String(mergedOutChannels),
            '-b:a',
            mergedOutChannels >= 8 ? '512k' : '320k'
          );
        } else {
          args.push(
            '-c:a',
            'aac',
            '-ac',
            String(mergedOutChannels),
            '-b:a',
            '128k'
          );
        }
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
  };

  try {
    await runProxy(true);
    return { audioFallbackUsed: false };
  } catch (error) {
    const message = String(error?.message || '');
    const audioDecodeFailure =
      /Error while decoding stream #0:1/i.test(message) ||
      /Error while processing the decoded data for stream #0:1/i.test(message) ||
      /\[aac @/i.test(message) ||
      /auto_aresample/i.test(message);
    if (!audioDecodeFailure) throw error;
    if (!allowAudioFallback) {
      throw createProxyConfirmationError(
        'Source audio stream could not be decoded reliably. Proxy can be created without audio if you approve it.',
        {
          warning: 'The uploaded video has audio stream issues. Approve silent proxy creation or continue without a proxy.',
          retryHint: 'If you do not approve, the asset can still be created and the file can be replaced later while keeping metadata.'
        }
      );
    }
    await runProxy(false);
    return {
      audioFallbackUsed: true,
      warning: 'Source audio stream could not be decoded reliably. Proxy was created without audio.'
    };
  }
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const ffmpegArgs = args[0] === '-hide_banner' ? args : ['-hide_banner', ...args];
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
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

function summarizeFfmpegError(error) {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return 'ffmpeg failed';
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^ffmpeg version\b/i.test(line))
    .filter((line) => !/^built with\b/i.test(line))
    .filter((line) => !/^configuration:\b/i.test(line))
    .filter((line) => !/^libav[a-z]+/i.test(line));
  if (!lines.length) return raw.slice(0, 240);
  return lines.slice(-4).join(' | ').slice(0, 240);
}

function createProxyConfirmationError(message, details = {}) {
  const error = new Error(String(message || 'Proxy generation requires confirmation.'));
  error.code = 'PROXY_AUDIO_FALLBACK_CONFIRMATION_REQUIRED';
  Object.assign(error, details);
  return error;
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
  const backend = normalizeSubtitleBackend(options.backend || options.subtitleBackend || (options.useWhisperX ? 'whisperx' : 'whisper'));
  const scriptPath = backend === 'whisperx'
    ? path.join(__dirname, 'transcribe_whisperx.py')
    : path.join(__dirname, 'transcribe_whisper.py');
  const lang = String(options.lang || '').trim().toLowerCase();
  const model = normalizeSubtitleModel(options.model || WHISPER_MODEL || 'small');
  const audioStreamIndex = Number.isFinite(Number(options.audioStreamIndex)) ? Number(options.audioStreamIndex) : null;
  const audioChannelIndex = Number.isFinite(Number(options.audioChannelIndex)) ? Number(options.audioChannelIndex) : null;
  let preparedInputPath = inputPath;
  let cleanupPreparedInput = () => {};
  if (audioStreamIndex != null || audioChannelIndex != null) {
    const prepared = await prepareAudioInputForTranscription(inputPath, {
      audioStreamIndex,
      audioChannelIndex
    });
    preparedInputPath = prepared.path;
    cleanupPreparedInput = prepared.cleanup;
  }
  const args = [
    scriptPath,
    '--input',
    preparedInputPath,
    '--output',
    outputPath,
    '--model',
    model
  ];
  if (lang) {
    args.push('--lang', lang);
  }
  try {
    return await runCommandCapture('python3', args);
  } finally {
    try { cleanupPreparedInput(); } catch (_error) {}
  }
}

function normalizeSubtitleModel(value) {
  const raw = String(value || '').trim();
  if (!raw) return String(WHISPER_MODEL || 'small').trim() || 'small';
  return raw;
}

async function prepareAudioInputForTranscription(inputPath, options = {}) {
  const audioStreamIndex = Number.isFinite(Number(options.audioStreamIndex)) ? Number(options.audioStreamIndex) : null;
  const audioChannelIndex = Number.isFinite(Number(options.audioChannelIndex)) ? Number(options.audioChannelIndex) : null;
  if (audioStreamIndex == null && audioChannelIndex == null) {
    return { path: inputPath, cleanup: () => {} };
  }
  const tempPath = path.join('/tmp', `${Date.now()}-${nanoid()}-subtitle-audio.wav`);
  const args = ['-y', '-i', inputPath];
  if (audioStreamIndex != null) {
    args.push('-map', `0:${audioStreamIndex}`);
  } else {
    args.push('-map', '0:a:0');
  }
  args.push('-vn');
  if (audioChannelIndex != null && audioChannelIndex >= 1) {
    const ffChannelIndex = Math.max(0, audioChannelIndex - 1);
    args.push('-af', `pan=mono|c0=c${ffChannelIndex}`, '-ac', '1');
  }
  args.push('-c:a', 'pcm_s16le', tempPath);
  const result = await runCommandCapture('ffmpeg', args);
  if (!result.ok || !fs.existsSync(tempPath)) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_error) {
      // ignore temp cleanup failure
    }
    throw new Error(String(result.stderr || result.stdout || 'Failed to prepare selected audio for subtitle transcription'));
  }
  return {
    path: tempPath,
    cleanup: () => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_error) {
        // ignore temp cleanup failure
      }
    }
  };
}

async function extractVideoOcrToText(inputPath, outputPath, options = {}) {
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const ocrLang = String(options.ocrLang || 'eng+tur').trim() || 'eng+tur';
  const ocrEngine = normalizeOcrEngine(options.ocrEngine);
  const ocrPreset = normalizeOcrPreset(options.ocrPreset);
  const advancedMode = Boolean(options.advancedMode);
  const turkishAiCorrect = options.turkishAiCorrect == null
    ? true
    : Boolean(options.turkishAiCorrect);
  const useZemberekLexicon = options.useZemberekLexicon == null
    ? turkishAiCorrect
    : Boolean(options.useZemberekLexicon);
  const preprocessProfile = normalizeOcrPreprocessProfile(options.preprocessProfile);
  const enableBlurFilter = Boolean(options.enableBlurFilter);
  const blurThreshold = Math.max(0, Math.min(300, Number(options.blurThreshold) || 80));
  const enableRegionMode = options.enableRegionMode == null
    ? ocrPreset === 'ticker'
    : Boolean(options.enableRegionMode);
  const tickerHeightPct = Math.max(10, Math.min(40, Number(options.tickerHeightPct) || 20));
  const ignoreStaticOverlays = options.ignoreStaticOverlays == null
    ? ocrPreset === 'static'
    : Boolean(options.ignoreStaticOverlays);
  const ignorePhrases = String(options.ignorePhrases || '').trim();
  const minDisplaySec = Math.max(intervalSec, Math.min(60, Number(options.minDisplaySec) || intervalSec * 2));
  const mergeGapSec = Math.max(0, Math.min(30, Number(options.mergeGapSec) || intervalSec));
  const enableSceneSampling = options.enableSceneSampling == null
    ? (advancedMode || ocrPreset === 'credits' || ocrPreset === 'ticker')
    : Boolean(options.enableSceneSampling);
  const sceneThreshold = Math.max(0.08, Math.min(0.95, Number(options.sceneThreshold) || (ocrPreset === 'credits' ? 0.24 : 0.34)));
  const maxSceneFrames = Math.max(0, Math.min(180, Number(options.maxSceneFrames) || 24));
  const sceneMinGapSec = Math.max(0.15, Math.min(30, Number(options.sceneMinGapSec) || (ocrPreset === 'credits'
    ? Math.max(0.6, intervalSec * 0.4)
    : Math.max(1.8, intervalSec * 0.85))));
  const assetId = String(options.assetId || '').trim();
  const workDir = String(options.workDir || '').trim() || createOcrFrameWorkDir();
  fs.mkdirSync(workDir, { recursive: true });
  cleanupOcrFrameCache();
  const cacheRestore = restoreOcrFramesFromCache({
    assetId,
    intervalSec,
    workDir,
    includeSceneFrames: enableSceneSampling
  });

  let sceneFrames = [];
  let usedFrameCache = Boolean(cacheRestore.restored);
  if (!cacheRestore.restored) {
    const framePattern = path.join(workDir, 'frame-%06d.jpg');
    const ffmpeg = await runCommandCapture('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-vf',
      buildOcrFrameFilter(intervalSec, preprocessProfile),
      '-q:v',
      '3',
      framePattern
    ]);
    if (!ffmpeg.ok) throw new Error(String(ffmpeg.stderr || 'Could not sample video frames'));

    const sampledSceneTimes = enableSceneSampling
      ? await detectSceneChangeTimes(inputPath, {
        intervalSec,
        sceneThreshold,
        maxSceneFrames,
        sceneMinGapSec
      })
      : [];
    sceneFrames = enableSceneSampling
      ? await extractSceneFrames(inputPath, workDir, sampledSceneTimes, preprocessProfile)
      : [];
    updateOcrFrameCacheFromWorkDir({ assetId, intervalSec, workDir });
  } else {
    const restoredNames = listRawOcrFrames(workDir);
    sceneFrames = restoredNames.filter((name) => isSceneFrameName(name));
    // Cache was created earlier without scene frames; fill scene cache lazily if requested.
    if (enableSceneSampling && !sceneFrames.length) {
      const sampledSceneTimes = await detectSceneChangeTimes(inputPath, {
        intervalSec,
        sceneThreshold,
        maxSceneFrames,
        sceneMinGapSec
      });
      sceneFrames = await extractSceneFrames(inputPath, workDir, sampledSceneTimes, preprocessProfile);
      updateOcrFrameCacheFromWorkDir({ assetId, intervalSec, workDir });
    }
  }
  const files = listOcrFrameFiles(workDir, intervalSec);

  if (!files.length) throw new Error('No frames extracted for OCR');

  const prep = await prepareOcrFrames({
    workDir,
    files,
    preprocessProfile,
    enableBlurFilter,
    blurThreshold,
    enableRegionMode,
    tickerHeightPct
  });
  const preparedFiles = Array.isArray(prep.files) && prep.files.length ? prep.files : files;
  if (!preparedFiles.length) throw new Error('All sampled frames were filtered out before OCR');

  const result = await extractVideoOcrFrameTextPaddle({
    workDir,
    files: preparedFiles,
    intervalSec,
    ocrLang,
    tickerMap: prep.tickerMap
  });

  const frameEntriesRaw = Array.isArray(result.frameEntries) ? result.frameEntries : [];
  const correctedEntries = turkishAiCorrect
    ? applyTurkishCorrectionToEntries(frameEntriesRaw, { useZemberekLexicon })
    : frameEntriesRaw;
  const sceneRefined = refineSceneFrameEntries(correctedEntries, {
    intervalSec,
    minSceneConfidence: 0.5,
    lowPeriodicConfidence: 0.58,
    similarityThreshold: 0.78,
    patchSimilarityThreshold: 0.45,
    minSceneTextLen: 7,
    neighbourWindowSec: Math.max(1.1, intervalSec)
  });
  const refinedEntries = Array.isArray(sceneRefined.entries) && sceneRefined.entries.length
    ? sceneRefined.entries
    : correctedEntries;
  const filterResult = applyOcrFrameFilters(refinedEntries, {
    ignorePhrases,
    ignoreStaticOverlays
  });
  const frameEntries = Array.isArray(filterResult.frameEntries) ? filterResult.frameEntries : refinedEntries;
  const autoIgnoredPhrases = Array.isArray(filterResult.autoIgnoredPhrases) ? filterResult.autoIgnoredPhrases : [];
  const overlaySplit = splitOverlayTokenFromEntries(frameEntries, 'NotebookLM');
  const effectiveEntries = overlaySplit.cleaned;
  const overlaySegmentsRaw = mergeRepeatedSegments(
    collapseFrameEntriesToSegments(overlaySplit.overlay, intervalSec),
    { mergeGapSec: Math.max(intervalSec * 2, mergeGapSec), similarityThreshold: 0.9 }
  );
  const overlaySegments = collapseOverlaySegments(overlaySegmentsRaw, 'NotebookLM');
  const baseLines = [];
  let prevNorm = '';
  effectiveEntries.forEach((item) => {
    const text = normalizeOcrText(String(item?.text || ''));
    if (!text) return;
    const norm = normalizeComparableOcr(text);
    if (!norm || norm === prevNorm) return;
    prevNorm = norm;
    baseLines.push(`[${formatTimecode(Number(item?.sec) || 0)}] ${text}`);
  });

  let output = '';
  let segmentCount = 0;
  if (ocrPreset === 'credits') {
    const rawSegments = buildDisplaySegments(effectiveEntries, {
      intervalSec,
      minDisplaySec: Math.max(minDisplaySec, intervalSec * 3),
      mergeGapSec: Math.max(mergeGapSec, intervalSec * 2)
    });
    const segments = mergeRepeatedSegments(rawSegments, {
      mergeGapSec: Math.max(mergeGapSec, intervalSec * 2),
      similarityThreshold: 0.66
    });
    segmentCount = segments.length;
    const allSegments = [...segments, ...overlaySegments]
      .sort((a, b) => (a.startSec - b.startSec) || a.text.localeCompare(b.text));
    output = segmentCount
      ? formatOcrSegmentsOutput(allSegments)
      : formatOcrFrameLinesOutput(effectiveEntries, intervalSec);
  } else if (advancedMode) {
    const rawSegments = buildDisplaySegments(effectiveEntries, {
      intervalSec,
      minDisplaySec,
      mergeGapSec
    });
    const segments = mergeRepeatedSegments(rawSegments, {
      mergeGapSec,
      similarityThreshold: 0.74
    });
    segmentCount = segments.length;
    const allSegments = [...segments, ...overlaySegments]
      .sort((a, b) => (a.startSec - b.startSec) || a.text.localeCompare(b.text));
    output = segmentCount
      ? formatOcrSegmentsOutput(allSegments)
      : formatOcrFrameLinesOutput(effectiveEntries, intervalSec);
  } else {
    const collapsedSegments = mergeRepeatedSegments(
      collapseFrameEntriesToSegments(effectiveEntries, intervalSec),
      { mergeGapSec: Math.max(mergeGapSec, intervalSec), similarityThreshold: 0.72 }
    );
    const allSegments = [...collapsedSegments, ...overlaySegments]
      .sort((a, b) => (a.startSec - b.startSec) || a.text.localeCompare(b.text));
    segmentCount = collapsedSegments.length;
    output = segmentCount
      ? formatOcrSegmentsOutput(allSegments)
      : '[00:00:00.000 --> 00:00:00.000] No OCR text detected.\n';
  }
  fs.writeFileSync(outputPath, output, 'utf8');

  return {
    lines: baseLines.length,
    segments: segmentCount,
    engine: result.engine,
    mode: ocrPreset === 'credits' ? 'credits' : (advancedMode ? 'advanced' : 'basic'),
    preset: ocrPreset,
    autoIgnoredPhrases,
    skippedBlur: Number(prep.skippedBlur || 0),
    sampledFrames: files.length,
    ocrFrames: preparedFiles.length,
    droppedSceneFrames: Number(sceneRefined.droppedScene || 0),
    patchedPeriodicFrames: Number(sceneRefined.patchedPeriodic || 0),
    keptSceneFrames: Number(sceneRefined.keptScene || 0),
    sceneSamplingEnabled: enableSceneSampling,
    sceneFrameCount: sceneFrames.length,
    sceneThreshold,
    sceneMinGapSec,
    maxSceneFrames,
    preprocessingWarning: String(prep.warning || '').trim(),
    usedFrameCache,
    workDir
  };
}

function normalizeOcrEngine(value) {
  void value;
  return 'paddle';
}

async function prepareOcrFrames({
  workDir,
  files,
  preprocessProfile,
  enableBlurFilter,
  blurThreshold,
  enableRegionMode,
  tickerHeightPct
}) {
  const base = {
    files: Array.isArray(files) ? [...files] : [],
    tickerMap: {},
    skippedBlur: 0,
    warning: ''
  };
  const needsPrep = enableBlurFilter || enableRegionMode || preprocessProfile !== 'off';
  if (!needsPrep || !base.files.length) return base;

  const scriptPath = path.join(__dirname, 'video_ocr_frame_prep.py');
  const args = [
    scriptPath,
    '--frames-dir',
    workDir,
    '--profile',
    normalizeOcrPreprocessProfile(preprocessProfile)
  ];
  if (enableBlurFilter) {
    args.push('--enable-blur-filter', '--blur-threshold', String(blurThreshold));
  }
  if (enableRegionMode) {
    args.push('--enable-region-mode', '--ticker-height-pct', String(tickerHeightPct));
  }
  const run = await runCommandCapture('python3', args, {
    env: {
      PYTHONWARNINGS: 'ignore'
    }
  });
  if (!run.ok) {
    return {
      ...base,
      warning: `Frame preprocess skipped: ${String(run.stderr || run.stdout || 'unknown error').trim().slice(0, 300)}`
    };
  }
  try {
    const payload = JSON.parse(String(run.stdout || '{}'));
    const kept = Array.isArray(payload.kept)
      ? payload.kept.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const keptSet = new Set(kept);
    const nextFiles = keptSet.size ? base.files.filter((name) => keptSet.has(name)) : base.files;
    const tickerMapRaw = payload.ticker_map && typeof payload.ticker_map === 'object' ? payload.ticker_map : {};
    const tickerMap = {};
    Object.entries(tickerMapRaw).forEach(([key, value]) => {
      const frame = String(key || '').trim();
      const ticker = String(value || '').trim();
      if (frame && ticker) tickerMap[frame] = ticker;
    });
    const skippedBlur = Array.isArray(payload.skipped_blur) ? payload.skipped_blur.length : 0;
    return {
      files: nextFiles.length ? nextFiles : base.files,
      tickerMap,
      skippedBlur,
      warning: ''
    };
  } catch (_error) {
    return {
      ...base,
      warning: 'Frame preprocess output parse failed; OCR continued without frame filtering.'
    };
  }
}

async function extractVideoOcrFrameTextPaddle({ workDir, files, intervalSec, ocrLang, tickerMap = {} }) {
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
      .map((item) => {
        const name = String(item?.name || '');
        const texts = Array.isArray(item?.texts)
          ? item.texts.map((part) => normalizeOcrLine(part)).filter(Boolean)
          : [];
        const text = normalizeOcrText(String(item?.text || ''));
        const confidence = normalizeConfidence(item?.confidence, 0);
        return [name, { text, texts, confidence }];
      })
      .filter(([name]) => Boolean(name))
  );

  const frameEntries = [];
  for (let i = 0; i < files.length; i += 1) {
    const item = itemMap.get(files[i]) || null;
    const lines = Array.isArray(item?.texts) && item.texts.length
      ? item.texts
      : [normalizeOcrLine(item?.text || '')].filter(Boolean);
    const tickerName = String(tickerMap[files[i]] || '').trim();
    const tickerItem = tickerName ? (itemMap.get(tickerName) || null) : null;
    const tickerLines = Array.isArray(tickerItem?.texts) && tickerItem.texts.length
      ? tickerItem.texts
      : [normalizeOcrLine(tickerItem?.text || '')].filter(Boolean);
    const mergedLines = dedupeTextList([...(lines || []), ...(tickerLines || [])]);
    if (!mergedLines.length) continue;
    const sec = frameSecFromName(files[i], intervalSec, i);
    frameEntries.push({
      sec,
      text: normalizeOcrText(mergedLines.join(' ')),
      frame: files[i],
      frameType: isSceneFrameName(files[i]) ? 'scene' : 'periodic',
      confidence: Math.max(
        normalizeConfidence(item?.confidence, 0),
        normalizeConfidence(tickerItem?.confidence, 0)
      )
    });
  }
  return { frameEntries, engine: 'paddle' };
}

function wordsToSimpleLine(words = []) {
  const lines = [];
  let current = [];
  let lastTop = null;
  const sorted = [...words]
    .filter((item) => item && String(item.text || '').trim())
    .sort((a, b) => {
      const topDiff = (Number(a.top) || 0) - (Number(b.top) || 0);
      if (Math.abs(topDiff) > 8) return topDiff;
      return (Number(a.left) || 0) - (Number(b.left) || 0);
    });
  sorted.forEach((word) => {
    const top = Number(word.top) || 0;
    if (lastTop == null || Math.abs(top - lastTop) <= 14) {
      current.push(word);
      lastTop = lastTop == null ? top : ((lastTop + top) / 2);
      return;
    }
    if (current.length) {
      lines.push(current);
    }
    current = [word];
    lastTop = top;
  });
  if (current.length) lines.push(current);
  return lines
    .map((line) => line.sort((a, b) => (Number(a.left) || 0) - (Number(b.left) || 0)).map((w) => normalizeOcrLine(w.text)).filter(Boolean).join(' '))
    .map((line) => normalizeOcrLine(line))
    .filter(Boolean);
}

function queueVideoOcrJob(row, options = {}) {
  const jobId = nanoid();
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const ocrLang = String(options.ocrLang || 'eng+tur').trim() || 'eng+tur';
  const existingDc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const nextVersion = sanitizeVideoOcrItems(existingDc.videoOcrItems).length + 1;
  const autoOcrLabel = buildOcrDisplayLabel({
    assetTitle: String(row?.title || ''),
    fileName: String(row?.file_name || ''),
    createdAt: new Date().toISOString(),
    engine: normalizeOcrEngine(options.ocrEngine || 'paddle'),
    version: nextVersion
  });
  const ocrLabel = normalizeRequestedOcrLabel(options.ocrLabel, autoOcrLabel);
  const ocrEngine = normalizeOcrEngine(options.ocrEngine);
  const ocrPreset = normalizeOcrPreset(options.ocrPreset);
  const advancedMode = Boolean(options.advancedMode);
  const turkishAiCorrect = options.turkishAiCorrect == null
    ? true
    : Boolean(options.turkishAiCorrect);
  const useZemberekLexicon = options.useZemberekLexicon == null
    ? false
    : Boolean(options.useZemberekLexicon);
  const preprocessProfile = normalizeOcrPreprocessProfile(options.preprocessProfile);
  const enableBlurFilter = Boolean(options.enableBlurFilter);
  const blurThreshold = Math.max(0, Math.min(300, Number(options.blurThreshold) || 80));
  const enableRegionMode = Boolean(options.enableRegionMode);
  const tickerHeightPct = Math.max(10, Math.min(40, Number(options.tickerHeightPct) || 20));
  const ignoreStaticOverlays = Boolean(options.ignoreStaticOverlays);
  const ignorePhrases = String(options.ignorePhrases || '').trim().slice(0, 300);
  const minDisplaySec = Math.max(intervalSec, Math.min(60, Number(options.minDisplaySec) || intervalSec * 2));
  const mergeGapSec = Math.max(0, Math.min(30, Number(options.mergeGapSec) || intervalSec));
  const enableSceneSampling = options.enableSceneSampling == null
    ? advancedMode
    : Boolean(options.enableSceneSampling);
  const sceneThreshold = Math.max(0.08, Math.min(0.95, Number(options.sceneThreshold) || 0.34));
  const maxSceneFrames = Math.max(0, Math.min(180, Number(options.maxSceneFrames) || 24));
  const sceneMinGapSec = Math.max(0.15, Math.min(30, Number(options.sceneMinGapSec) || Math.max(1.8, intervalSec * 0.85)));
  const now = new Date().toISOString();
  const job = {
    jobId,
    assetId: row.id,
    status: 'queued',
    intervalSec,
    ocrLang,
    ocrLabel,
    ocrEngine,
    ocrPreset,
    requestedEngine: ocrEngine,
    resultUrl: '',
    resultPath: '',
    resultLabel: '',
    lineCount: 0,
    segmentCount: 0,
    mode: ocrPreset === 'credits' ? 'credits' : (advancedMode ? 'advanced' : 'basic'),
    advancedMode,
    turkishAiCorrect,
    useZemberekLexicon,
    preprocessProfile,
    enableBlurFilter,
    blurThreshold,
    enableRegionMode,
    tickerHeightPct,
    ignoreStaticOverlays,
    ignorePhrases,
    detectedStaticPhrases: [],
    skippedBlur: 0,
    minDisplaySec,
    mergeGapSec,
    enableSceneSampling,
    sceneThreshold,
    maxSceneFrames,
    sceneMinGapSec,
    sceneFrameCount: 0,
    droppedSceneFrames: 0,
    patchedPeriodicFrames: 0,
    keptSceneFrames: 0,
    frameDir: '',
    warning: '',
    error: '',
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    finishedAt: ''
  };
  videoOcrJobs.set(jobId, job);
  upsertMediaProcessingJobSafe({
    jobId: job.jobId,
    assetId: job.assetId,
    jobType: 'video_ocr',
    status: job.status,
    requestPayload: buildVideoOcrDbRequestPayload(job),
    resultPayload: buildVideoOcrDbResultPayload(job),
    errorText: job.error,
    progress: buildMediaJobProgress(job.status),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: '',
    finishedAt: ''
  });

  setTimeout(async () => {
    const running = videoOcrJobs.get(jobId);
    if (!running) return;
    running.status = 'running';
    running.updatedAt = new Date().toISOString();
    await upsertMediaProcessingJobSafe({
      jobId: running.jobId,
      assetId: running.assetId,
      jobType: 'video_ocr',
      status: running.status,
      requestPayload: buildVideoOcrDbRequestPayload(running),
      resultPayload: buildVideoOcrDbResultPayload(running),
      errorText: running.error,
      progress: buildMediaJobProgress(running.status),
      createdAt: running.createdAt,
      updatedAt: running.updatedAt,
      startedAt: running.startedAt || running.updatedAt,
      finishedAt: ''
    });
    try {
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath) throw new Error('Source media not found');
      const selectedEngine = ocrEngine;
      const preferredLabel = normalizeRequestedOcrLabel(
        running.ocrLabel,
        autoOcrLabel
      );
      const outName = `${Date.now()}-${nanoid()}-${preferredLabel}`;
      let out = buildArtifactPath('ocr', outName, row.created_at);
      const frameDir = createOcrFrameWorkDir(row.created_at);
      running.frameDir = frameDir;
      const result = await extractVideoOcrToText(inputPath, out.absolutePath, {
        assetId: row.id,
        intervalSec,
        ocrLang,
        ocrPreset,
        ocrEngine: selectedEngine,
        advancedMode,
        turkishAiCorrect,
        useZemberekLexicon,
        preprocessProfile,
        enableBlurFilter,
        blurThreshold,
        enableRegionMode,
        tickerHeightPct,
        ignoreStaticOverlays,
        ignorePhrases,
        minDisplaySec,
        mergeGapSec,
        enableSceneSampling,
        sceneThreshold,
        maxSceneFrames,
        sceneMinGapSec,
        workDir: frameDir
      });
      running.status = 'completed';
      running.resultUrl = out.publicUrl;
      running.resultPath = out.absolutePath;
      running.resultLabel = preferredLabel;
      running.lineCount = Number(result.lines || 0);
      running.segmentCount = Number(result.segments || 0);
      running.detectedStaticPhrases = Array.isArray(result.autoIgnoredPhrases) ? result.autoIgnoredPhrases : [];
      running.skippedBlur = Number(result.skippedBlur || 0);
      running.sceneFrameCount = Number(result.sceneFrameCount || 0);
      running.droppedSceneFrames = Number(result.droppedSceneFrames || 0);
      running.patchedPeriodicFrames = Number(result.patchedPeriodicFrames || 0);
      running.keptSceneFrames = Number(result.keptSceneFrames || 0);
      running.enableSceneSampling = Boolean(result.sceneSamplingEnabled);
      running.sceneThreshold = Number(result.sceneThreshold || running.sceneThreshold || 0);
      running.maxSceneFrames = Number(result.maxSceneFrames || running.maxSceneFrames || 0);
      running.sceneMinGapSec = Number(result.sceneMinGapSec || running.sceneMinGapSec || 0);
      running.mode = String(result.mode || (ocrPreset === 'credits' ? 'credits' : (advancedMode ? 'advanced' : 'basic')));
      running.ocrPreset = normalizeOcrPreset(result.preset || ocrPreset);
      running.ocrEngine = normalizeOcrEngine(result.engine || selectedEngine);
      const prepWarning = String(result.preprocessingWarning || '').trim();
      if (prepWarning) {
        running.warning = running.warning ? `${running.warning} | ${prepWarning}` : prepWarning;
      }
      if (result.usedFrameCache) {
        running.warning = running.warning
          ? `${running.warning} | Frame cache reused`
          : 'Frame cache reused';
      }
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
      await upsertMediaProcessingJobSafe({
        jobId: running.jobId,
        assetId: running.assetId,
        jobType: 'video_ocr',
        status: running.status,
        requestPayload: buildVideoOcrDbRequestPayload(running),
        resultPayload: buildVideoOcrDbResultPayload(running),
        errorText: running.error,
        progress: buildMediaJobProgress(running.status),
        createdAt: running.createdAt,
        updatedAt: running.updatedAt,
        startedAt: running.startedAt || running.createdAt,
        finishedAt: running.finishedAt
      });
    } catch (error) {
      running.status = 'failed';
      running.error = String(error?.message || 'Video OCR failed').slice(0, 900);
      safeRmDir(running.frameDir);
      running.frameDir = '';
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
      await upsertMediaProcessingJobSafe({
        jobId: running.jobId,
        assetId: running.assetId,
        jobType: 'video_ocr',
        status: running.status,
        requestPayload: buildVideoOcrDbRequestPayload(running),
        resultPayload: buildVideoOcrDbResultPayload(running),
        errorText: running.error,
        progress: buildMediaJobProgress(running.status),
        createdAt: running.createdAt,
        updatedAt: running.updatedAt,
        startedAt: running.startedAt || running.createdAt,
        finishedAt: running.finishedAt
      });
    }
  }, 10);
  return job;
}

function queueSubtitleGenerationJob(row, options = {}) {
  const jobId = nanoid();
  const subtitleLang = normalizeSubtitleLang(options.lang);
  const subtitleLabel = String(options.label || 'auto-whisper').trim() || 'auto-whisper';
  const model = String(options.model || WHISPER_MODEL || 'small').trim() || 'small';
  const audioStreamIndex = Number.isFinite(Number(options.audioStreamIndex)) ? Number(options.audioStreamIndex) : null;
  const audioChannelIndex = Number.isFinite(Number(options.audioChannelIndex)) ? Number(options.audioChannelIndex) : null;
  const requestedSubtitleBackend = normalizeSubtitleBackend(
    options.subtitleBackend || (options.useWhisperX ? 'whisperx' : 'whisper')
  );
  const turkishAiCorrect = options.turkishAiCorrect == null
    ? true
    : Boolean(options.turkishAiCorrect);
  const useZemberekLexicon = options.useZemberekLexicon == null
    ? turkishAiCorrect
    : Boolean(options.useZemberekLexicon);
  const now = new Date().toISOString();
  const job = {
    jobId,
    assetId: row.id,
    status: 'queued',
    model,
    audioStreamIndex,
    audioChannelIndex,
    turkishAiCorrect,
    useZemberekLexicon,
    subtitleBackendRequested: requestedSubtitleBackend,
    subtitleBackend: requestedSubtitleBackend,
    subtitleLang,
    subtitleLabel,
    subtitleUrl: '',
    warning: '',
    error: '',
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    finishedAt: ''
  };
  subtitleJobs.set(jobId, job);
  upsertMediaProcessingJobSafe({
    jobId: job.jobId,
    assetId: job.assetId,
    jobType: 'subtitle',
    status: job.status,
    requestPayload: buildSubtitleDbRequestPayload(job),
    resultPayload: buildSubtitleDbResultPayload(job),
    errorText: job.error,
    progress: buildMediaJobProgress(job.status),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: '',
    finishedAt: ''
  });

  setTimeout(async () => {
    const running = subtitleJobs.get(jobId);
    if (!running) return;
    running.status = 'running';
    running.updatedAt = new Date().toISOString();
    await upsertMediaProcessingJobSafe({
      jobId: running.jobId,
      assetId: running.assetId,
      jobType: 'subtitle',
      status: running.status,
      requestPayload: buildSubtitleDbRequestPayload(running),
      resultPayload: buildSubtitleDbResultPayload(running),
      errorText: running.error,
      progress: buildMediaJobProgress(running.status),
      createdAt: running.createdAt,
      updatedAt: running.updatedAt,
      startedAt: running.startedAt || running.updatedAt,
      finishedAt: ''
    });

    try {
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath) throw new Error('Source media not found for transcription');
      const storedName = `${Date.now()}-${nanoid()}-auto-${sanitizeFileName(row.id)}.vtt`;
      const subtitleOut = buildArtifactPath('subtitles', storedName, row.created_at);
      let usedSubtitleBackend = requestedSubtitleBackend;
      let transcription = await transcribeMediaToVtt(inputPath, subtitleOut.absolutePath, {
        lang: subtitleLang,
        model,
        subtitleBackend: usedSubtitleBackend,
        audioStreamIndex,
        audioChannelIndex
      });
      let subtitleReady = transcription.ok && fs.existsSync(subtitleOut.absolutePath) && fs.statSync(subtitleOut.absolutePath).size >= 16;
      if (!subtitleReady && usedSubtitleBackend === 'whisperx') {
        const whisperxError = String(transcription.stderr || transcription.stdout || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
        usedSubtitleBackend = 'whisper';
        transcription = await transcribeMediaToVtt(inputPath, subtitleOut.absolutePath, {
          lang: subtitleLang,
          model,
          subtitleBackend: usedSubtitleBackend,
          audioStreamIndex,
          audioChannelIndex
        });
        subtitleReady = transcription.ok && fs.existsSync(subtitleOut.absolutePath) && fs.statSync(subtitleOut.absolutePath).size >= 16;
        if (subtitleReady) {
          running.warning = whisperxError
            ? `WhisperX failed (${whisperxError}); subtitle was generated with faster-whisper fallback.`
            : 'WhisperX failed; subtitle was generated with faster-whisper fallback.';
        }
      }
      if (!subtitleReady) {
        throw new Error(String(transcription.stderr || transcription.stdout || 'Subtitle transcription failed'));
      }
      running.subtitleBackend = usedSubtitleBackend;
      if (subtitleLang.startsWith('tr')) {
        try {
          const rawVtt = fs.readFileSync(subtitleOut.absolutePath, 'utf8');
          const fixedVtt = turkishAiCorrect
            ? applyTurkishCorrectionToVttContent(rawVtt, { useZemberekLexicon })
            : applyLearnedCorrectionsToVttContent(rawVtt);
          if (fixedVtt && fixedVtt !== rawVtt) {
            fs.writeFileSync(subtitleOut.absolutePath, fixedVtt, 'utf8');
          }
        } catch (_error) {
          // Keep original subtitle on correction errors.
        }
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
      await upsertMediaProcessingJobSafe({
        jobId: running.jobId,
        assetId: running.assetId,
        jobType: 'subtitle',
        status: running.status,
        requestPayload: buildSubtitleDbRequestPayload(running),
        resultPayload: buildSubtitleDbResultPayload(running),
        errorText: running.error,
        progress: buildMediaJobProgress(running.status),
        createdAt: running.createdAt,
        updatedAt: running.updatedAt,
        startedAt: running.startedAt || running.createdAt,
        finishedAt: running.finishedAt
      });
    } catch (error) {
      running.status = 'failed';
      running.error = String(error?.message || 'Subtitle generation failed').slice(0, 800);
      running.finishedAt = new Date().toISOString();
      running.updatedAt = running.finishedAt;
      await upsertMediaProcessingJobSafe({
        jobId: running.jobId,
        assetId: running.assetId,
        jobType: 'subtitle',
        status: running.status,
        requestPayload: buildSubtitleDbRequestPayload(running),
        resultPayload: buildSubtitleDbResultPayload(running),
        errorText: running.error,
        progress: buildMediaJobProgress(running.status),
        createdAt: running.createdAt,
        updatedAt: running.updatedAt,
        startedAt: running.startedAt || running.createdAt,
        finishedAt: running.finishedAt
      });
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

  const expectedIssuerPath = getExpectedIssuerPath(settings);
  const actualIssuerPath = normalizeIssuerPath(payload?.iss || '');
  if (expectedIssuerPath && actualIssuerPath !== expectedIssuerPath) return 'Invalid token issuer';

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
  const jwksUrls = getPreferredOidcJwksUrls(settings);
  if (!jwksUrls.length) throw new Error('OIDC JWKS URL is not configured');

  let jwk = null;
  let lastFetchError = null;
  for (const jwksUrl of jwksUrls) {
    try {
      let keys = await getOidcJwks(jwksUrl, false);
      jwk = keys.find((k) => String(k?.kid || '') === kid);
      if (!jwk) {
        keys = await getOidcJwks(jwksUrl, true);
        jwk = keys.find((k) => String(k?.kid || '') === kid);
      }
      if (jwk) break;
    } catch (error) {
      lastFetchError = error;
    }
  }
  if (!jwk && lastFetchError) throw lastFetchError;
  if (!jwk) throw new Error('Token signing key not found');

  const signatureOk = verifyJwtSignatureWithJwk(decoded.signedPart, decoded.signature, jwk);
  if (!signatureOk) throw new Error('Invalid bearer token signature');

  const claimError = validateJwtClaims(decoded.payload || {}, settings);
  if (claimError) throw new Error(claimError);
  return decoded.payload;
}

async function maybeRequireApiToken(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (!USE_OAUTH2_PROXY) return next();
  if (/^\/api\/assets\/[^/]+\/office-config$/.test(req.path)) return next();
  if (/^\/api\/assets\/[^/]+\/office-callback$/.test(req.path)) return next();
  try {
    const settings = await getAdminSettings();
    if (!settings.apiTokenEnabled) return next();
    if (hasAuthenticatedUpstreamUser(req)) return next();

    const bearer = String(getBearerFromRequest(req) || '');
    if (settings.oidcBearerEnabled && bearer && bearer.includes('.')) {
      try {
        await verifyOidcBearerToken(bearer, getRequestDerivedOidcSettings(settings, req));
        return next();
      } catch (error) {
        if (AUTH_DEBUG) {
          console.warn('[auth] OIDC bearer rejected', {
            path: req.path,
            host: resolveRequestHost(req),
            message: String(error.message || 'Invalid bearer token')
          });
        }
        return res.status(401).json({ error: String(error.message || 'Invalid bearer token') });
      }
    }

    const expected = String(settings.apiToken || '');
    const apiKey = String(getApiKeyFromRequest(req) || '');
    const fallback = bearer && !bearer.includes('.') ? bearer : '';
    const given = apiKey || fallback;

    if (!expected || !given) {
      if (AUTH_DEBUG) {
        console.warn('[auth] API token missing', {
          path: req.path,
          host: resolveRequestHost(req),
          oidcBearerEnabled: Boolean(settings.oidcBearerEnabled),
          hasBearer: Boolean(bearer)
        });
      }
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

async function getMediaAudioStreamOptions(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const probe = await runCommandCapture('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index,channels,codec_name:stream_tags=language,title',
    '-of',
    'json',
    inputPath
  ]);
  if (!probe.ok) return [];
  try {
    const parsed = JSON.parse(String(probe.stdout || '{}'));
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    return streams.map((s, order) => {
      const index = Number.isFinite(Number(s?.index)) ? Number(s.index) : order;
      const channels = Number.isFinite(Number(s?.channels)) ? Math.max(0, Math.floor(Number(s.channels))) : 0;
      const codec = String(s?.codec_name || '').trim();
      const language = String(s?.tags?.language || '').trim().toLowerCase();
      const title = String(s?.tags?.title || '').trim();
      const labelParts = [
        `A${order + 1}`,
        title || '',
        language ? language.toUpperCase() : '',
        channels > 0 ? `${channels}ch` : '',
        codec ? codec : ''
      ].filter(Boolean);
      return {
        order,
        index,
        channels,
        codec,
        language,
        title,
        label: labelParts.join(' • ')
      };
    });
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

function normalizeIdentityKey(value) {
  return String(value || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

function getPermissionOverrideForUser(settings, user) {
  const entries = settings && typeof settings === 'object' ? settings : {};
  const candidates = [
    user?.username,
    user?.email,
    String(user?.email || '').includes('@') ? String(user.email).split('@')[0] : '',
    user?.displayName
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const exactKey = candidate.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(entries, exactKey)) return entries[exactKey];
  }

  const normalizedEntries = new Map();
  Object.entries(entries).forEach(([key, value]) => {
    const normalized = normalizeIdentityKey(key);
    if (normalized && !normalizedEntries.has(normalized)) normalizedEntries.set(normalized, value);
  });

  for (const candidate of candidates) {
    const normalized = normalizeIdentityKey(candidate);
    if (normalizedEntries.has(normalized)) return normalizedEntries.get(normalized);
  }
  return null;
}

function sanitizeOnlyOfficeUserId(value) {
  const normalized = normalizeIdentityKey(value)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'mam-user';
}

function sanitizeOnlyOfficeUserName(value) {
  const normalized = normalizeIdentityKey(value)
    .replace(/[^a-z0-9._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'mam user';
}

const officeService = createOfficeService({
  pool,
  onlyofficePublicUrl: ONLYOFFICE_PUBLIC_URL,
  onlyofficeInternalUrl: ONLYOFFICE_INTERNAL_URL,
  appInternalUrl: APP_INTERNAL_URL,
  configVersion: ONLYOFFICE_CONFIG_VERSION,
  getFileExtension,
  inferMimeTypeFromFileName,
  isOfficeDocumentCandidate,
  publicUploadUrlToAbsolutePath,
  normalizePublicUploadUrl,
  getIngestStoragePath,
  sanitizeFileName,
  runCommandCapture,
  computeBufferSha256,
  getAssetStoredFileHash,
  indexAssetToElastic,
  sanitizeOnlyOfficeUserId
});

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
  const tokenUsername = String(tokenPayload.preferred_username || tokenPayload.username || '').trim();
  const tokenEmail = String(tokenPayload.email || '').trim();
  const tokenName = String(tokenPayload.name || tokenPayload.given_name || '').trim();
  const tokenGroups = Array.isArray(tokenPayload.groups) ? tokenPayload.groups : [];
  const realmRoles = Array.isArray(tokenPayload?.realm_access?.roles) ? tokenPayload.realm_access.roles : [];
  const resourceRoles = Object.values(tokenPayload?.resource_access || {})
    .flatMap((entry) => (Array.isArray(entry?.roles) ? entry.roles : []));
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const effectiveEmail = emailRaw || tokenEmail;
  const localFromEmail = effectiveEmail.includes('@') ? effectiveEmail.split('@')[0] : '';
  const username = preferred || tokenUsername || (!uuidLike.test(usernameRaw) ? usernameRaw : '') || localFromEmail;
  const displayName = (!uuidLike.test(usernameRaw) ? usernameRaw : '') || tokenName || username || localFromEmail;
  const groups = groupsRaw
    .split(/[,\s]+/)
    .concat(tokenGroups.map((g) => String(g || '')))
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const allRoles = realmRoles
    .concat(resourceRoles)
    .map((r) => String(r || '').trim().toLowerCase())
    .filter(Boolean);
  const resolved = resolvePermissionKeysFromPrincipals({
    username,
    groups,
    roles: allRoles
  });
  return {
    username,
    displayName,
    email: effectiveEmail || '',
    baseIsAdmin: resolved.permissionKeys.includes('admin.access'),
    basePermissionKeys: resolved.permissionKeys,
    baseIsSuperAdmin: resolved.isSuperAdmin
  };
}

function getKeycloakCandidateRealms() {
  const fromList = KEYCLOAK_REALMS
    ? KEYCLOAK_REALMS.split(',').map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const fallback = [KEYCLOAK_REALM]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const merged = [...fromList, ...fallback];
  const seen = new Set();
  return merged.filter((realm) => {
    const key = realm.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getKeycloakAdminAccessToken() {
  if (!KEYCLOAK_ADMIN_USERNAME || !KEYCLOAK_ADMIN_PASSWORD) return '';
  const tokenUrl = `${KEYCLOAK_INTERNAL_URL}/realms/${encodeURIComponent(KEYCLOAK_ADMIN_REALM)}/protocol/openid-connect/token`;
  try {
    const form = new URLSearchParams();
    form.set('grant_type', 'password');
    form.set('client_id', KEYCLOAK_ADMIN_CLIENT_ID);
    form.set('username', KEYCLOAK_ADMIN_USERNAME);
    form.set('password', KEYCLOAK_ADMIN_PASSWORD);
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => ({}));
    return String(payload?.access_token || '').trim();
  } catch (_error) {
    return '';
  }
}

async function fetchKeycloakUsers() {
  const now = Date.now();
  if (keycloakUsersCache.value && keycloakUsersCache.expiresAt > now) {
    return keycloakUsersCache.value;
  }
  const token = await getKeycloakAdminAccessToken();
  if (!token) return { users: [], realmByUsername: new Map() };
  const realms = getKeycloakCandidateRealms();
  const users = [];
  const realmByUsername = new Map();
  const seen = new Set();
  for (const realm of realms) {
    let first = 0;
    const pageSize = 100;
    try {
      while (true) {
        const url = `${KEYCLOAK_INTERNAL_URL}/admin/realms/${encodeURIComponent(realm)}/users?first=${first}&max=${pageSize}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) break;
        const rows = await response.json().catch(() => []);
        const arr = Array.isArray(rows) ? rows : [];
        arr.forEach((row) => {
          const username = String(row?.username || '').trim().toLowerCase();
          if (!username || seen.has(username)) return;
          seen.add(username);
          users.push(row);
          realmByUsername.set(username, realm);
        });
        if (arr.length < pageSize) break;
        first += pageSize;
      }
    } catch (_error) {
      // Try next realm candidate.
    }
  }
  const value = { users, realmByUsername };
  keycloakUsersCache = { expiresAt: now + KEYCLOAK_ADMIN_CACHE_TTL_MS, value };
  return value;
}

function isVisibleKeycloakUser(user) {
  const username = String(user?.username || '').trim().toLowerCase();
  if (!username) return false;
  if (username.startsWith('service-account-')) return false;
  if (username === 'admin' || username === 'mamadmin') return false;
  if (user && Object.prototype.hasOwnProperty.call(user, 'enabled') && user.enabled === false) return false;
  return true;
}

async function fetchKeycloakUserPermissionDefaults(users, realmByUsername) {
  const cacheKey = (Array.isArray(users) ? users : [])
    .map((user) => `${String(user?.id || '').trim()}:${String(user?.username || '').trim().toLowerCase()}`)
    .sort()
    .join('|');
  const now = Date.now();
  const cached = keycloakPermissionDefaultsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return new Map(cached.value);

  const token = await getKeycloakAdminAccessToken();
  if (!token) return new Map();
  const candidateRealms = getKeycloakCandidateRealms();
  const defaultRealm = candidateRealms[0] || KEYCLOAK_REALM;
  const results = new Map();
  await Promise.all(
    (Array.isArray(users) ? users : []).map(async (user) => {
      const userId = String(user?.id || '').trim();
      const username = String(user?.username || '').trim().toLowerCase();
      if (!userId || !username) return;
      const realm = String(realmByUsername?.get(username) || defaultRealm || KEYCLOAK_REALM).trim();
      const realmEncoded = encodeURIComponent(realm);
      const [rolesRes, groupsRes] = await Promise.all([
        fetch(`${KEYCLOAK_INTERNAL_URL}/admin/realms/${realmEncoded}/users/${encodeURIComponent(userId)}/role-mappings/realm`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        fetch(`${KEYCLOAK_INTERNAL_URL}/admin/realms/${realmEncoded}/users/${encodeURIComponent(userId)}/groups`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);
      const roles = rolesRes && rolesRes.ok ? await rolesRes.json().catch(() => []) : [];
      const groups = groupsRes && groupsRes.ok ? await groupsRes.json().catch(() => []) : [];
      const roleNames = (Array.isArray(roles) ? roles : []).map((item) => String(item?.name || '').trim());
      const groupNames = (Array.isArray(groups) ? groups : [])
        .map((item) => String(item?.path || item?.name || '').trim())
        .filter(Boolean);
      const defaults = resolvePermissionKeysFromPrincipals({
        username,
        groups: groupNames,
        roles: roleNames
      });
      results.set(username, defaults.permissionKeys);
    })
  );
  keycloakPermissionDefaultsCache.set(cacheKey, {
    expiresAt: now + KEYCLOAK_ADMIN_CACHE_TTL_MS,
    value: Array.from(results.entries())
  });
  return results;
}

async function resolveEffectivePermissions(req) {
  const user = buildUserContextFromRequest(req);
  const settings = await getUserPermissionsSettings();
  const override = getPermissionOverrideForUser(settings, user);
  const effective = normalizePermissionEntry(override, user.basePermissionKeys || []);
  const canAccessAdmin = Boolean(effective.adminPageAccess);
  const canAccessTextAdmin = Boolean(effective.textAdminAccess || canAccessAdmin);
  const canEditOffice = Boolean(effective.officeEdit || canAccessAdmin);
  return {
    ...user,
    isAdmin: canAccessAdmin,
    canAccessAdmin,
    canAccessTextAdmin,
    canEditMetadata: Boolean(effective.metadataEdit),
    canEditOffice,
    canDeleteAssets: Boolean(effective.assetDelete),
    canUsePdfAdvancedTools: Boolean(effective.pdfAdvancedTools),
    permissions: effective,
    permissionKeys: effective.permissionKeys
  };
}

app.get('/api/workflow', (_req, res) => {
  res.json(WORKFLOW);
});

app.get('/api/me', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  try {
    const effective = await resolveEffectivePermissions(req);
    res.json({
      username: effective.username,
      displayName: effective.displayName,
      email: effective.email || '',
      isAdmin: effective.isAdmin,
      canAccessAdmin: effective.canAccessAdmin,
      canAccessTextAdmin: effective.canAccessTextAdmin,
      canEditMetadata: effective.canEditMetadata,
      canEditOffice: effective.canEditOffice,
      canDeleteAssets: effective.canDeleteAssets,
      canUsePdfAdvancedTools: effective.canUsePdfAdvancedTools,
      officeEditorProvider: OFFICE_EDITOR_PROVIDER,
      permissionKeys: effective.permissionKeys
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to resolve user profile' });
  }
});

app.get('/api/logout-url', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  try {
    return res.json({ url: buildLogoutUrl(req) });
  } catch (_error) {
    return res.json({ url: '/oauth2/sign_out' });
  }
});

app.get('/api/ui-settings', async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    const playerUiMode = normalizePlayerUiMode(settings.playerUiMode);
    return res.json({ playerUiMode });
  } catch (_error) {
    return res.json({ playerUiMode: 'vidstack' });
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

function normalizeUploadDate(value) {
  const raw = String(value || '').trim();
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(raw)) return null;
  const parts = raw.split('-').map((item) => Number(item));
  const [year, month, day] = parts;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function normalizeUploadDateRange(fromValue, toValue) {
  let fromDate = normalizeUploadDate(fromValue);
  let toDate = normalizeUploadDate(toValue);
  if (fromDate && toDate && fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }
  if (toDate) {
    toDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 23, 59, 59, 999));
  }
  return {
    from: fromDate ? fromDate.toISOString() : null,
    to: toDate ? toDate.toISOString() : null
  };
}

function normalizeSortBy(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'default';
  const aliases = {
    relevance: 'relevance',
    updated: 'updated_desc',
    updated_at: 'updated_desc',
    updated_at_desc: 'updated_desc',
    updated_desc: 'updated_desc',
    updated_at_asc: 'updated_asc',
    updated_asc: 'updated_asc',
    created: 'created_desc',
    created_at: 'created_desc',
    created_at_desc: 'created_desc',
    created_desc: 'created_desc',
    created_at_asc: 'created_asc',
    created_asc: 'created_asc',
    title: 'title_asc',
    title_asc: 'title_asc'
  };
  return aliases[raw] || 'default';
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

function buildAssetOrderClause({ hasRelevance, sortBy, rankedParamAlias }) {
  if (hasRelevance) {
    return `array_position($${rankedParamAlias}::text[], id), updated_at DESC`;
  }

  const normalized = normalizeSortBy(sortBy);
  switch (normalized) {
    case 'updated_asc':
      return 'updated_at ASC';
    case 'updated_desc':
      return 'updated_at DESC';
    case 'created_asc':
      return 'created_at ASC';
    case 'created_desc':
      return 'created_at DESC';
    case 'title_asc':
      return 'LOWER(title) ASC, created_at DESC';
    default:
      return 'updated_at DESC';
  }
}

async function queryAssetSuggestions(options = {}) {
  const q = String(options.q || '').trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(15, Number(options.limit) || 8));
  const trash = normalizeTrashScope(options.trash, 'active');
  const tag = String(options.tag || '').trim();
  const type = String(options.type || '').trim();
  const status = String(options.status || '').trim();
  const dateRange = normalizeUploadDateRange(options.uploadDateFrom, options.uploadDateTo);
  const types = Array.isArray(options.types)
    ? options.types.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : normalizeTypesInput(options.types);
  const qFold = normalizeForSearch(q);
  const parsedQuery = parseTextSearchQuery(q, normalizeForSearch);

  const owner = String(options.owner || '').trim();

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
  if (owner) {
    baseValues.push(`%${owner.toLowerCase()}%`);
    baseWhere.push(`LOWER(owner) LIKE $${baseValues.length}`);
  }
  if (dateRange.from) {
    baseValues.push(dateRange.from);
    baseWhere.push(`created_at >= $${baseValues.length}`);
  }
  if (dateRange.to) {
    baseValues.push(dateRange.to);
    baseWhere.push(`created_at <= $${baseValues.length}`);
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
    const qSearchClauses = [];
    const appendAssetTextGroup = (term, options = {}) => {
      const exact = Boolean(options.exact);
      const negate = Boolean(options.negate);
      const joiner = negate ? 'AND' : 'OR';
      if (exact) {
        fallbackValues.push(exactNormalizedTextRegex(term));
        const idx = fallbackValues.length;
        qSearchClauses.push(`(
          ${sqlTextFold('title')} ${negate ? '!~' : '~'} $${idx}
          ${joiner} ${sqlTextFold('file_name')} ${negate ? '!~' : '~'} $${idx}
          ${joiner} ${sqlTextFold('owner')} ${negate ? '!~' : '~'} $${idx}
        )`);
        return;
      }
      fallbackValues.push(`%${term}%`);
      const idx = fallbackValues.length;
      qSearchClauses.push(`(
        ${sqlTextFold('title')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
        ${joiner} ${sqlTextFold('file_name')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
        ${joiner} ${sqlTextFold('owner')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
      )`);
    };
    if (parsedQuery.hasOperators) {
      parsedQuery.mustInclude.forEach((term) => appendAssetTextGroup(term));
      parsedQuery.mustIncludeExact.forEach((term) => appendAssetTextGroup(term, { exact: true }));
      parsedQuery.mustExclude.forEach((term) => appendAssetTextGroup(term, { negate: true }));
      parsedQuery.mustExcludeExact.forEach((term) => appendAssetTextGroup(term, { exact: true, negate: true }));
      if (parsedQuery.optional.length > 0 || parsedQuery.optionalExact.length > 0) {
        const optionalGroups = [];
        parsedQuery.optional.forEach((term) => {
          fallbackValues.push(`%${term}%`);
          const idx = fallbackValues.length;
          optionalGroups.push(`(
            ${sqlTextFold('title')} LIKE $${idx}
            OR ${sqlTextFold('file_name')} LIKE $${idx}
            OR ${sqlTextFold('owner')} LIKE $${idx}
          )`);
        });
        parsedQuery.optionalExact.forEach((term) => {
          fallbackValues.push(exactNormalizedTextRegex(term));
          const idx = fallbackValues.length;
          optionalGroups.push(`(
            ${sqlTextFold('title')} ~ $${idx}
            OR ${sqlTextFold('file_name')} ~ $${idx}
            OR ${sqlTextFold('owner')} ~ $${idx}
          )`);
        });
        qSearchClauses.push(`(${optionalGroups.join(' OR ')})`);
      }
    } else {
      fallbackValues.push(`%${qFold}%`);
      const likeIdx = fallbackValues.length;
      qSearchClauses.push(`(${sqlTextFold('title')} LIKE $${likeIdx} OR ${sqlTextFold('file_name')} LIKE $${likeIdx} OR ${sqlTextFold('owner')} LIKE $${likeIdx})`);
    }
    fallbackValues.push(qFold);
    const eqIdx = fallbackValues.length;
    fallbackValues.push(`${qFold}%`);
    const prefixIdx = fallbackValues.length;
    fallbackValues.push(limit);
    const fallbackLimitIdx = fallbackValues.length;

    const fallbackWhere = [
      ...baseWhere,
      ...qSearchClauses
    ];
    const fallback = await pool.query(
      `
        SELECT id, title, file_name, type, status, updated_at, deleted_at
        FROM assets
        WHERE ${fallbackWhere.join(' AND ')}
        ORDER BY
          CASE
            WHEN ${sqlTextFold('title')} = $${eqIdx} THEN 0
            WHEN ${sqlTextFold('file_name')} = $${eqIdx} THEN 1
            WHEN ${sqlTextFold('title')} LIKE $${prefixIdx} THEN 2
            WHEN ${sqlTextFold('file_name')} LIKE $${prefixIdx} THEN 3
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

async function requireTextAdminAccess(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canAccessTextAdmin) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify text admin permissions' });
  }
}

async function requireScopedAdminAccess(req, res, next) {
  const textAdminPaths = [
    /^\/ocr-records(?:\/content)?$/,
    /^\/subtitle-records(?:\/content)?$/,
    /^\/text-search$/
  ];
  const safePath = String(req.path || '').trim();
  if (textAdminPaths.some((pattern) => pattern.test(safePath))) {
    return requireTextAdminAccess(req, res, next);
  }
  return requireAdminAccess(req, res, next);
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

async function requireMetadataEdit(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canEditMetadata) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify metadata edit permissions' });
  }
}

async function requireOfficeEdit(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canEditOffice) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify office edit permissions' });
  }
}

async function requirePdfAdvancedTools(req, res, next) {
  try {
    const effective = await resolveEffectivePermissions(req);
    if (!effective.canUsePdfAdvancedTools) return res.status(403).json({ error: 'Forbidden' });
    req.userPermissions = effective;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to verify PDF advanced permissions' });
  }
}

function canManagePdfVersionRow(userPermissions, versionRow) {
  if (!userPermissions?.canUsePdfAdvancedTools || !versionRow) return false;
  if (userPermissions?.canAccessAdmin) return true;
  const actorUsername = String(versionRow.actor_username || '').trim().toLowerCase();
  const currentUsername = String(userPermissions?.username || '').trim().toLowerCase();
  return Boolean(actorUsername && currentUsername && actorUsername === currentUsername);
}

function canManageVersionRow(userPermissions, assetRow, versionRow) {
  if (!userPermissions || !assetRow || !versionRow) return false;
  if (userPermissions.canAccessAdmin) return true;
  const actorUsername = String(versionRow.actor_username || '').trim().toLowerCase();
  const currentUsername = String(userPermissions.username || '').trim().toLowerCase();
  const isOwnVersion = Boolean(actorUsername && currentUsername && actorUsername === currentUsername);
  if (isPdfCandidate({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
    return Boolean(userPermissions.canUsePdfAdvancedTools && isOwnVersion);
  }
  if (isOfficeDocumentCandidate({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
    return Boolean(userPermissions.canEditOffice);
  }
  return false;
}

function canCreateVersionForAsset(userPermissions, assetRow) {
  if (!userPermissions || !assetRow) return false;
  if (userPermissions.canAccessAdmin) return true;
  if (isPdfCandidate({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
    return Boolean(userPermissions.canUsePdfAdvancedTools);
  }
  if (isOfficeDocumentCandidate({ mimeType: assetRow.mime_type, fileName: assetRow.file_name })) {
    return Boolean(userPermissions.canEditOffice);
  }
  return false;
}

async function findOriginalVersionSnapshot(assetId, actionType) {
  const safeAssetId = String(assetId || '').trim();
  const safeActionType = String(actionType || '').trim();
  if (!safeAssetId || !safeActionType) return null;

  let targetResult = await pool.query(
    `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = $2 ORDER BY created_at ASC LIMIT 1`,
    [safeAssetId, safeActionType]
  );
  if (!targetResult.rowCount) {
    targetResult = await pool.query(
      `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
      [safeAssetId]
    );
  }
  const target = targetResult.rows[0];
  if (!target) return null;

  const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
  if (!snapshotMediaUrl.startsWith('/uploads/')) return null;
  let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
  if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
    const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
    snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
  }
  if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) return null;

  return {
    row: target,
    snapshotMediaUrl,
    snapshotSourcePath,
    snapshotFileName: String(target.snapshot_file_name || '').trim(),
    snapshotMimeType: String(target.snapshot_mime_type || '').trim(),
    snapshotThumbnailUrl: String(target.snapshot_thumbnail_url || '').trim()
  };
}

function sendSnapshotDownload(res, snapshot, fallbackFileName) {
  const filePath = String(snapshot?.snapshotSourcePath || '').trim();
  const fileName = sanitizeFileName(String(snapshot?.snapshotFileName || fallbackFileName || path.basename(filePath) || 'original.bin'));
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Original snapshot file is missing on disk' });
  }
  return res.download(filePath, fileName, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download original snapshot' });
    }
  });
}

registerAdminRoutes(app, {
  pool,
  proxyJobs,
  requireScopedAdminAccess,
  publicUploadUrlToAbsolutePath,
  reloadLearnedTurkishCorrectionsFromDb,
  getLearnedTurkishCorrectionsList,
  normalizeLearnedCorrectionKey,
  learnedTurkishCorrections,
  turkishWordSet,
  sanitizeVideoOcrItems,
  normalizeOcrEngine,
  getCandidateOcrFilePathsForRow,
  sanitizeSubtitleItems,
  normalizeSubtitleLang,
  findSubtitleMatchesInText,
  resolveEffectivePermissions,
  getUserPermissionsSettings,
  fetchKeycloakUsers,
  isVisibleKeycloakUser,
  fetchKeycloakUserPermissionDefaults,
  resolvePermissionKeysFromPrincipals,
  normalizePermissionEntry,
  PERMISSION_KEYS,
  getPermissionDefinitionsPayload,
  saveUserPermissionsSettings,
  getAdminSettings,
  saveAdminSettings,
  generateApiToken,
  systemHealthCache,
  SYSTEM_HEALTH_CACHE_TTL_MS,
  normalizeMediaJobType,
  normalizeMediaJobStatus,
  mapSubtitleJobFromDbRow,
  mapVideoOcrJobFromDbRow,
  OCR_DIR,
  UPLOADS_DIR,
  resolveStoredUrl,
  pickLatestVideoOcrUrlFromDc,
  runCommandCapture,
  backfillElasticIndex,
  createProxyJob,
  runProxyJob,
  queryAssetSuggestions,
  collectAssetCleanupPaths,
  cleanupAssetFiles,
  deleteAssetFromElastic,
  removeAssetFromCollections,
  ensureVideoProxyAndThumbnail,
  isVideoCandidate,
  computeBufferSha256,
  getAssetStoredFileHash,
  findDuplicateAssetByHash,
  buildDuplicateAssetPayload,
  sanitizeFileName,
  inferMimeTypeFromFileName,
  inferAssetType,
  getIngestStoragePath,
  resolveAssetInputPath,
  buildArtifactPath,
  generateVideoThumbnail,
  regenerateVideoThumbnailForAsset,
  ensurePdfThumbnailForRow,
  isPdfCandidate,
  isDocumentCandidate,
  ensureDocumentThumbnailForRow,
  extractPreviewContentFromFile,
  indexAssetToElastic,
  mapAssetRow,
  buildOcrDisplayLabel,
  syncOcrSegmentIndexForAsset,
  syncSubtitleCueIndexForAssetRow,
  formatTimecode,
  getAssetFamily,
  nanoid,
  removeAssetFromElastic
});

registerTextProcessingRoutes(app, {
  pool,
  requireAssetDelete,
  isVideoCandidate,
  sanitizeFileName,
  convertSrtToVtt,
  normalizeVttContent,
  buildArtifactPath,
  saveAssetSubtitleMetadata,
  normalizeSubtitleLang,
  mapAssetRow,
  WHISPER_MODEL,
  normalizeSubtitleBackend,
  queueSubtitleGenerationJob,
  subtitleJobs,
  getMediaProcessingJobById,
  mapSubtitleJobFromDbRow,
  queueVideoOcrJob,
  videoOcrJobs,
  getLatestVideoOcrJobForAsset,
  getLatestMediaProcessingJobForAsset,
  sanitizeVideoOcrItems,
  saveAssetVideoOcrMetadata,
  publicUploadUrlToAbsolutePath,
  safeRmDir,
  SUBTITLES_DIR,
  syncSubtitleCueIndexForAssetRow,
  searchSubtitleMatchesForAssetRow,
  ensureSubtitleCueIndexForAssetRow,
  parseSubtitleTextSearchQuery,
  buildSubtitleCueSearchWhereSql,
  formatTimecode,
  normalizeOcrPreset,
  normalizeOcrEngine,
  nanoid
});

registerAssetRoutes(app, {
  pool,
  WORKFLOW,
  requireAssetDelete,
  requireMetadataEdit,
  resolveEffectivePermissions,
  collectAssetCleanupPaths,
  cleanupAssetFiles,
  removeAssetFromCollections,
  removeAssetFromElastic: deleteAssetFromElastic,
  indexAssetToElastic,
  mapAssetRow,
  mapCutRow,
  sanitizeDcMetadata,
  toTags,
  buildVersionSnapshotFromRow,
  canCreateVersionForAsset,
  canManageVersionRow,
  mapVersionRow,
  nanoid
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

registerOfficeRoutes(app, {
  pool,
  officeService,
  resolveEffectivePermissions,
  requireOfficeEdit,
  isOfficeDocumentCandidate,
  publicUploadUrlToAbsolutePath,
  indexAssetToElastic,
  mapAssetRow,
  findOriginalVersionSnapshot,
  sendSnapshotDownload,
  getFileExtension,
  officeEditorProvider: OFFICE_EDITOR_PROVIDER,
  uploadsDir: UPLOADS_DIR,
  runCommandCapture,
  sanitizeFileName
});

registerPdfRoutes(app, {
  pool,
  requirePdfAdvancedTools,
  requireAdminAccess,
  isPdfCandidate,
  extractPdfPagesText,
  getPdfPageCount,
  renderPdfPageJpegBuffer,
  buildPdfSearchSnippet,
  computeBufferSha256,
  getAssetStoredFileHash,
  findDuplicateAssetByHash,
  buildDuplicateAssetPayload,
  sanitizeFileName,
  getIngestStoragePath,
  publicUploadUrlToAbsolutePath,
  inferMimeTypeFromFileName,
  indexAssetToElastic,
  ensurePdfThumbnailForRow,
  mapAssetRow,
  findOriginalVersionSnapshot,
  sendSnapshotDownload
});

loadTurkishWordSet();

initDb()
  .then(async () => {
    await migrateLegacyLearnedCorrectionsIfNeeded();
    await reloadLearnedTurkishCorrectionsFromDb();
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
