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
  if (mode === 'custom' || mode === 'videojs' || mode === 'vidstack' || mode === 'mpegdash') return mode;
  return 'native';
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
const ONLYOFFICE_PUBLIC_URL = String(process.env.ONLYOFFICE_PUBLIC_URL || 'http://localhost:8082').trim().replace(/\/+$/, '');
const ONLYOFFICE_INTERNAL_URL = String(process.env.ONLYOFFICE_INTERNAL_URL || 'http://onlyoffice').trim().replace(/\/+$/, '');
const APP_INTERNAL_URL = String(process.env.APP_INTERNAL_URL || 'http://app:3000').trim().replace(/\/+$/, '');
const OFFICE_CALLBACK_SECRET = String(process.env.OFFICE_CALLBACK_SECRET || process.env.OAUTH2_PROXY_COOKIE_SECRET || 'mam-onlyoffice-callback-secret').trim() || 'mam-onlyoffice-callback-secret';
const OIDC_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const oidcJwksCache = new Map();
const pdfOcrCache = new Map();

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

function escapeElasticId(value) {
  return encodeURIComponent(String(value || '').trim());
}

function encodeBase64Url(input) {
  return Buffer.from(String(input || ''), 'utf8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8');
}

function signOfficeCallbackPayload(encodedPayload) {
  return crypto.createHmac('sha256', OFFICE_CALLBACK_SECRET).update(String(encodedPayload || '')).digest('hex');
}

function buildOfficeCallbackState(payload) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload || {}));
  return {
    state: encodedPayload,
    sig: signOfficeCallbackPayload(encodedPayload)
  };
}

function verifyOfficeCallbackState(state, sig) {
  const encodedState = String(state || '').trim();
  const providedSig = String(sig || '').trim().toLowerCase();
  if (!encodedState || !providedSig) return null;
  const expectedSig = signOfficeCallbackPayload(encodedState);
  try {
    const isValid = crypto.timingSafeEqual(Buffer.from(providedSig, 'hex'), Buffer.from(expectedSig, 'hex'));
    if (!isValid) return null;
  } catch (_error) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(encodedState));
    if (!payload || typeof payload !== 'object') return null;
    const issuedAt = Number(payload.ts || 0);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
    if (Date.now() - issuedAt > 24 * 60 * 60 * 1000) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function resolveOnlyofficeDownloadUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) return '';
  try {
    const parsed = new URL(input);
    const publicBase = new URL(ONLYOFFICE_PUBLIC_URL);
    const internalBase = new URL(ONLYOFFICE_INTERNAL_URL);
    if (
      parsed.protocol === publicBase.protocol &&
      parsed.host === publicBase.host
    ) {
      parsed.protocol = internalBase.protocol;
      parsed.hostname = internalBase.hostname;
      parsed.port = internalBase.port;
      return parsed.toString();
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.protocol = internalBase.protocol;
      parsed.hostname = internalBase.hostname;
      parsed.port = internalBase.port;
      return parsed.toString();
    }
    return parsed.toString();
  } catch (_error) {
    return input;
  }
}

async function downloadOnlyofficeEditedBuffer(rawUrl) {
  const candidates = Array.from(new Set([
    resolveOnlyofficeDownloadUrl(rawUrl),
    String(rawUrl || '').trim()
  ].filter(Boolean)));
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) {
          lastError = new Error(`Download failed with status ${response.status} for ${candidate}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) {
          lastError = new Error(`Downloaded Office document was empty for ${candidate}`);
          continue;
        }
        return buffer;
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error('Failed to download edited Office document');
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

function escapeElasticQueryTerm(value) {
  return String(value || '').replace(/[\\*?]/g, '\\$&');
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

async function searchAssetIdsElastic(queryText, limit = 500) {
  const q = String(queryText || '').trim();
  if (!q) return [];
  await ensureElasticIndex();
  const parsedQuery = parseTextSearchQuery(q, normalizeForSearch);
  const fields = ['title^4', 'description^2', 'owner^2', 'tags^2', 'dc', 'clips^3', 'type', 'status'];
  const buildElasticShouldClauses = (term) => ([
    {
      multi_match: {
        query: term,
        type: 'bool_prefix',
        fields,
        boost: 3
      }
    },
    { match_phrase_prefix: { title: { query: term, boost: 6 } } },
    { match_phrase_prefix: { clips: { query: term, boost: 5 } } },
    { match_phrase_prefix: { dc: { query: term, boost: 2 } } }
  ]);
  const buildElasticExactClauses = (term) => ([
    { match_phrase: { title: { query: term, boost: 8 } } },
    { match_phrase: { description: { query: term, boost: 4 } } },
    { match_phrase: { owner: { query: term, boost: 4 } } },
    { match_phrase: { tags: { query: term, boost: 3 } } },
    { match_phrase: { dc: { query: term, boost: 2 } } },
    { match_phrase: { clips: { query: term, boost: 5 } } }
  ]);
  const buildElasticWildcardClauses = (term) => fields.map((fieldName) => ({
    wildcard: {
      [fieldName.replace(/\^.*$/, '')]: {
        value: `*${escapeElasticQueryTerm(term)}*`,
        case_insensitive: true
      }
    }
  }));
  const result = await elasticRequest('POST', `/${ELASTIC_INDEX}/_search`, {
    size: limit,
    query: {
      bool: parsedQuery.hasOperators ? {
        must: [
          ...parsedQuery.mustInclude.flatMap((term) => buildElasticWildcardClauses(term)),
          ...parsedQuery.mustIncludeExact.flatMap((term) => buildElasticExactClauses(term))
        ],
        must_not: [
          ...parsedQuery.mustExclude.flatMap((term) => buildElasticWildcardClauses(term)),
          ...parsedQuery.mustExcludeExact.flatMap((term) => buildElasticExactClauses(term))
        ],
        should: [
          ...parsedQuery.optional.flatMap((term) => buildElasticShouldClauses(term)),
          ...parsedQuery.optionalExact.flatMap((term) => buildElasticExactClauses(term))
        ],
        minimum_should_match: (parsedQuery.optional.length + parsedQuery.optionalExact.length) > 0 ? 1 : 0
      } : {
        should: [
          {
            query_string: {
              query: q,
              default_operator: 'AND',
              fields,
              boost: 5
            }
          },
          ...buildElasticShouldClauses(q)
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

async function suggestAssetIdsElastic(queryText, limit = 10) {
  const q = String(queryText || '').trim();
  if (!q) return [];
  await ensureElasticIndex();
  const parsedQuery = parseTextSearchQuery(q, normalizeForSearch);
  const simpleFields = ['title', 'owner', 'tags'];
  const buildWildcardClauses = (term) => simpleFields.map((fieldName) => ({
    wildcard: {
      [fieldName]: {
        value: `*${escapeElasticQueryTerm(term)}*`,
        case_insensitive: true
      }
    }
  }));
  const buildExactSuggestClauses = (term) => ([
    { match_phrase: { title: { query: term, boost: 10 } } },
    { match_phrase: { owner: { query: term, boost: 4 } } },
    { match_phrase: { tags: { query: term, boost: 4 } } }
  ]);
  const result = await elasticRequest('POST', `/${ELASTIC_INDEX}/_search`, {
    size: Math.max(1, Math.min(20, Number(limit) || 10)),
    query: {
      bool: parsedQuery.hasOperators ? {
        must: [
          ...parsedQuery.mustInclude.flatMap((term) => buildWildcardClauses(term)),
          ...parsedQuery.mustIncludeExact.flatMap((term) => buildExactSuggestClauses(term))
        ],
        must_not: [
          ...parsedQuery.mustExclude.flatMap((term) => buildWildcardClauses(term)),
          ...parsedQuery.mustExcludeExact.flatMap((term) => buildExactSuggestClauses(term))
        ],
        should: [
          ...parsedQuery.optional.flatMap((term) => ([
          { match_phrase_prefix: { title: { query: term, boost: 8 } } },
          { match: { title: { query: term, fuzziness: 'AUTO', boost: 5 } } },
          { match_phrase_prefix: { owner: { query: term, boost: 2 } } },
          { match_phrase_prefix: { tags: { query: term, boost: 2 } } }
        ])),
          ...parsedQuery.optionalExact.flatMap((term) => buildExactSuggestClauses(term))
        ],
        minimum_should_match: (parsedQuery.optional.length + parsedQuery.optionalExact.length) > 0 ? 1 : 0
      } : {
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

function sqlTextFold(expression) {
  return `REPLACE(LOWER(TRANSLATE(COALESCE(${expression}, ''), 'İIı', 'iii')), U&'\\0307', '')`;
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

function normalizeOcrLine(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeTextList(items = []) {
  const out = [];
  const seen = new Set();
  items.forEach((item) => {
    const text = normalizeOcrLine(item);
    if (!text) return;
    const key = normalizeComparableOcr(text) || text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function groupOcrEntriesToBlocks(entries = [], width = 1920, height = 1080) {
  const valid = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const text = normalizeOcrLine(entry?.text || '');
      const left = Number(entry?.left);
      const top = Number(entry?.top);
      const right = Number(entry?.right);
      const bottom = Number(entry?.bottom);
      if (!text || !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
        return null;
      }
      if (right <= left || bottom <= top) return null;
      return {
        text,
        left,
        top,
        right,
        bottom,
        cy: (top + bottom) / 2
      };
    })
    .filter(Boolean);

  if (!valid.length) return [];

  const w = Math.max(1, Number(width) || 1920);
  const h = Math.max(1, Number(height) || 1080);
  const xGapBlock = w / 20;
  const yGapBlock = h / 12;
  const yLineTol = Math.max(6, h / 55);

  valid.sort((a, b) => (a.cy - b.cy) || (a.left - b.left));
  const lines = [];
  valid.forEach((item) => {
    let placed = false;
    for (const line of lines) {
      if (Math.abs(item.cy - line.cy) <= yLineTol) {
        line.items.push(item);
        const count = line.items.length;
        line.cy = ((line.cy * (count - 1)) + item.cy) / count;
        line.top = Math.min(line.top, item.top);
        line.bottom = Math.max(line.bottom, item.bottom);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({
        items: [item],
        cy: item.cy,
        top: item.top,
        bottom: item.bottom
      });
    }
  });

  const lineSegments = [];
  lines.forEach((line) => {
    const items = [...line.items].sort((a, b) => a.left - b.left);
    if (!items.length) return;
    let current = {
      texts: [items[0].text],
      left: items[0].left,
      right: items[0].right,
      top: items[0].top,
      bottom: items[0].bottom
    };
    for (let i = 1; i < items.length; i += 1) {
      const item = items[i];
      const gap = item.left - current.right;
      if (gap > xGapBlock) {
        lineSegments.push(current);
        current = {
          texts: [item.text],
          left: item.left,
          right: item.right,
          top: item.top,
          bottom: item.bottom
        };
      } else {
        current.texts.push(item.text);
        current.right = Math.max(current.right, item.right);
        current.top = Math.min(current.top, item.top);
        current.bottom = Math.max(current.bottom, item.bottom);
      }
    }
    lineSegments.push(current);
  });

  lineSegments.sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const blocks = [];
  lineSegments.forEach((seg) => {
    const segText = normalizeOcrLine(seg.texts.join(' '));
    if (!segText) return;
    const prev = blocks[blocks.length - 1];
    if (!prev) {
      blocks.push({
        texts: [segText],
        left: seg.left,
        right: seg.right,
        top: seg.top,
        bottom: seg.bottom
      });
      return;
    }
    const vGap = seg.top - prev.bottom;
    const hOverlap = Math.min(seg.right, prev.right) - Math.max(seg.left, prev.left);
    let hSep = 0;
    if (seg.left > prev.right) hSep = seg.left - prev.right;
    else if (prev.left > seg.right) hSep = prev.left - seg.right;
    const sameBlock = (vGap <= yGapBlock) && (hOverlap > 0 || hSep <= xGapBlock);
    if (sameBlock) {
      prev.texts.push(segText);
      prev.left = Math.min(prev.left, seg.left);
      prev.right = Math.max(prev.right, seg.right);
      prev.top = Math.min(prev.top, seg.top);
      prev.bottom = Math.max(prev.bottom, seg.bottom);
    } else {
      blocks.push({
        texts: [segText],
        left: seg.left,
        right: seg.right,
        top: seg.top,
        bottom: seg.bottom
      });
    }
  });

  return dedupeTextList(blocks.map((block) => block.texts.join(' ')));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeComparableOcr(text) {
  return String(text || '')
    .replace(/[İIı]/g, 'i')
    .toLocaleLowerCase('tr')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOcrIgnorePhrases(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,;|]+/);
  const out = [];
  const seen = new Set();
  list.forEach((item) => {
    const phrase = normalizeOcrText(String(item || ''));
    if (!phrase || phrase.length < 2 || phrase.length > 80) return;
    const key = normalizeComparableOcr(phrase);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(phrase);
  });
  return out.slice(0, 24);
}

function removeIgnoredPhrasesFromOcrText(text, phrases = []) {
  let out = normalizeOcrText(text);
  if (!out || !Array.isArray(phrases) || !phrases.length) return out;
  phrases.forEach((phrase) => {
    const normalized = normalizeOcrText(phrase);
    if (!normalized || normalized.length < 2) return;
    const pattern = new RegExp(escapeRegExp(normalized).replace(/\s+/g, '\\s+'), 'giu');
    out = out.replace(pattern, ' ');
  });
  return normalizeOcrText(out);
}

function detectStaticOverlayPhrases(frameEntries = [], options = {}) {
  const minFrames = Math.max(3, Number(options.minFrames) || 3);
  const ratio = Math.max(0.45, Math.min(0.95, Number(options.minRatio) || 0.62));
  const nonEmpty = frameEntries
    .map((item) => normalizeOcrText(String(item?.text || '')))
    .filter(Boolean);
  if (nonEmpty.length < minFrames) return [];

  const required = Math.max(minFrames, Math.ceil(nonEmpty.length * ratio));
  const counts = new Map();

  nonEmpty.forEach((text) => {
    const words = text.match(/[0-9A-Za-zÇĞİÖŞÜçğıöşü]+/g) || [];
    if (!words.length) return;
    const tails = new Set();
    for (let n = 1; n <= 3; n += 1) {
      if (words.length < n) continue;
      const phrase = words.slice(-n).join(' ');
      const key = normalizeComparableOcr(phrase);
      if (!key || key.length < 5 || key.length > 40) continue;
      tails.add(key);
    }
    tails.forEach((key) => {
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const isOverlayLike = (key) => {
    const text = String(key || '').trim();
    if (!text) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 1) return text.length >= 5 && text.length <= 24;
    if (words.length === 2) return text.length <= 18;
    return false;
  };

  return Array.from(counts.entries())
    .filter(([key, count]) => count >= required && /[a-zçğıöşü]/i.test(key) && isOverlayLike(key))
    .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))
    .map(([key]) => key)
    .slice(0, 8);
}

function applyOcrFrameFilters(frameEntries = [], options = {}) {
  const manualPhrases = parseOcrIgnorePhrases(options.ignorePhrases);
  const allowAuto = Boolean(options.ignoreStaticOverlays) && frameEntries.length >= 8;
  const autoKeys = allowAuto ? detectStaticOverlayPhrases(frameEntries) : [];
  const autoPhrases = autoKeys
    .map((key) => String(key || '').trim())
    .filter(Boolean);
  const allPhrases = [...manualPhrases, ...autoPhrases];
  if (!allPhrases.length) {
    return { frameEntries, autoIgnoredPhrases: [] };
  }

  const cleaned = frameEntries
    .map((item) => {
      const text = removeIgnoredPhrasesFromOcrText(item?.text || '', allPhrases);
      return { ...item, text };
    })
    .filter((item) => normalizeOcrText(item.text));

  // Safety fallback: never allow auto filtering to wipe all OCR lines.
  if (!cleaned.length && frameEntries.length) {
    return { frameEntries, autoIgnoredPhrases: [] };
  }

  return { frameEntries: cleaned, autoIgnoredPhrases: autoPhrases };
}

function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;
  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) dp[j] = j;
  for (let i = 1; i <= n; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cur = dp[j];
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return dp[m];
}

function normalizedEditSimilarity(a, b) {
  const left = normalizeComparableOcr(a);
  const right = normalizeComparableOcr(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const dist = levenshteinDistance(left, right);
  const denom = Math.max(left.length, right.length, 1);
  return 1 - (dist / denom);
}

function scoreOcrDisplayText(text) {
  const raw = String(text || '');
  if (!raw) return 0;
  const turkishChars = (raw.match(/[çğıöşüÇĞİÖŞÜ]/g) || []).length;
  const letters = (raw.match(/[a-zçğıöşüA-ZÇĞİÖŞÜ]/g) || []).length || 1;
  const punctuationPenalty = (raw.match(/[|_~]/g) || []).length * 0.4;
  return (letters * 0.8) + (turkishChars * 0.6) - punctuationPenalty;
}

function chooseBetterOcrText(current, candidate) {
  const cur = String(current || '').trim();
  const next = String(candidate || '').trim();
  if (!cur) return next;
  if (!next) return cur;
  return scoreOcrDisplayText(next) >= scoreOcrDisplayText(cur) ? next : cur;
}

function buildComparableTokenSet(text) {
  return new Set(
    String(normalizeComparableOcr(text) || '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function tokenOverlapSimilarity(a, b) {
  const left = buildComparableTokenSet(a);
  const right = buildComparableTokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size, 1);
}

function isLikelySameOcrDisplayText(a, b, options = {}) {
  const editThreshold = Math.max(0.55, Math.min(0.98, Number(options.editThreshold) || 0.78));
  const tokenThreshold = Math.max(0.45, Math.min(0.98, Number(options.tokenThreshold) || 0.72));
  const containsThreshold = Math.max(0.45, Math.min(0.98, Number(options.containsThreshold) || 0.82));
  const leftNorm = normalizeComparableOcr(a);
  const rightNorm = normalizeComparableOcr(b);
  if (!leftNorm && !rightNorm) return true;
  if (!leftNorm || !rightNorm) return false;
  if (leftNorm === rightNorm) return true;
  const editSim = normalizedEditSimilarity(leftNorm, rightNorm);
  if (editSim >= editThreshold) return true;
  const tokenSim = tokenOverlapSimilarity(leftNorm, rightNorm);
  if (tokenSim >= tokenThreshold) return true;
  const shorter = leftNorm.length <= rightNorm.length ? leftNorm : rightNorm;
  const longer = shorter === leftNorm ? rightNorm : leftNorm;
  if (shorter.length >= 6 && longer.includes(shorter) && tokenSim >= containsThreshold) return true;
  return false;
}

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

function parseSubtitleTimestampToSeconds(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match = text.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const hh = Number(match[1] || 0);
  const mm = Number(match[2] || 0);
  const ss = Number(match[3] || 0);
  const ms = Number(String(match[4] || '0').padEnd(3, '0').slice(0, 3));
  if (mm > 59 || ss > 59) return null;
  return (hh * 3600) + (mm * 60) + ss + (ms / 1000);
}

function parseSubtitleCues(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (/^\d+$/.test(line) && i + 1 < lines.length && String(lines[i + 1] || '').includes('-->')) {
      i += 1;
    }
    const timeLine = String(lines[i] || '').trim();
    if (!timeLine.includes('-->')) {
      i += 1;
      continue;
    }
    const match = timeLine.match(/^\s*([^ ]+)\s*-->\s*([^ ]+).*/);
    if (!match) {
      i += 1;
      continue;
    }
    const startSec = parseSubtitleTimestampToSeconds(match[1]);
    const endSec = parseSubtitleTimestampToSeconds(match[2]);
    i += 1;
    const textLines = [];
    while (i < lines.length) {
      const row = String(lines[i] || '');
      if (!row.trim()) break;
      textLines.push(row.trim());
      i += 1;
    }
    const cueText = normalizeOcrText(textLines.join(' '));
    if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec && cueText) {
      cues.push({ startSec, endSec, cueText });
    }
    while (i < lines.length && !String(lines[i] || '').trim()) i += 1;
  }
  return cues;
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

function normalizeSubtitleSearchText(value) {
  return normalizeComparableOcr(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSubtitleTextSearchQuery(value) {
  return parseSearchTokens(value, normalizeSubtitleSearchText);
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

function buildSubtitleCueSearchWhereSql({ normColumn = 'norm_text', startIndex = 3, parsedQuery }) {
  const clauses = [];
  const params = [];
  let idx = startIndex;

  if (!parsedQuery || !parsedQuery.raw) {
    return { clauses, params, nextIndex: idx };
  }

  if (!parsedQuery.hasOperators) {
    params.push(`%${parsedQuery.raw}%`);
    clauses.push(`${normColumn} LIKE $${idx}`);
    idx += 1;
    return { clauses, params, nextIndex: idx };
  }

  parsedQuery.mustInclude.forEach((term) => {
    params.push(`%${term}%`);
    clauses.push(`${normColumn} LIKE $${idx}`);
    idx += 1;
  });

  parsedQuery.mustIncludeExact.forEach((term) => {
    params.push(exactNormalizedTextRegex(term));
    clauses.push(`${normColumn} ~ $${idx}`);
    idx += 1;
  });

  parsedQuery.mustExclude.forEach((term) => {
    params.push(`%${term}%`);
    clauses.push(`${normColumn} NOT LIKE $${idx}`);
    idx += 1;
  });

  parsedQuery.mustExcludeExact.forEach((term) => {
    params.push(exactNormalizedTextRegex(term));
    clauses.push(`NOT (${normColumn} ~ $${idx})`);
    idx += 1;
  });

  if (parsedQuery.optional.length > 0) {
    const optionalClauses = [];
    parsedQuery.optional.forEach((term) => {
      params.push(`%${term}%`);
      optionalClauses.push(`${normColumn} LIKE $${idx}`);
      idx += 1;
    });
    parsedQuery.optionalExact.forEach((term) => {
      params.push(exactNormalizedTextRegex(term));
      optionalClauses.push(`${normColumn} ~ $${idx}`);
      idx += 1;
    });
    clauses.push(`(${optionalClauses.join(' OR ')})`);
  } else if (parsedQuery.optionalExact.length > 0) {
    const optionalClauses = [];
    parsedQuery.optionalExact.forEach((term) => {
      params.push(exactNormalizedTextRegex(term));
      optionalClauses.push(`${normColumn} ~ $${idx}`);
      idx += 1;
    });
    clauses.push(`(${optionalClauses.join(' OR ')})`);
  }

  return { clauses, params, nextIndex: idx };
}

function subtitleCueMatchesParsedQuery(cueText, parsedQuery) {
  const normalizedText = normalizeSubtitleSearchText(cueText);
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

function findSubtitleMatchesInText(text, query, limit = 1) {
  const parsedQuery = parseSubtitleTextSearchQuery(query);
  if (!parsedQuery.raw) return [];
  return parseSubtitleCues(text)
    .filter((cue) => subtitleCueMatchesParsedQuery(cue.cueText, parsedQuery))
    .slice(0, Math.max(1, Number(limit) || 1));
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

function getFileExtension(fileName) {
  return path.extname(String(fileName || '')).replace('.', '').toLowerCase();
}

function inferMimeTypeFromFileName(fileName) {
  const ext = getFileExtension(fileName);
  if (!ext) return '';
  const byExt = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return byExt[ext] || '';
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

function getOnlyOfficeDocumentType({ mimeType, fileName }) {
  const ext = getFileExtension(fileName);
  if (['xls', 'xlsx', 'ods'].includes(ext)) return 'cell';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slide';
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('sheet') || mime.includes('excel')) return 'cell';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slide';
  return 'word';
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

function isPathInsideRoot(filePath, rootDir) {
  const safePath = String(filePath || '').trim();
  const safeRoot = String(rootDir || '').trim();
  if (!safePath || !safeRoot) return false;
  const resolvedPath = path.resolve(safePath);
  const resolvedRoot = path.resolve(safeRoot);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
}

function isSafeAssetCleanupPath(filePath) {
  return [
    UPLOADS_DIR,
    PROXIES_DIR,
    THUMBNAILS_DIR,
    SUBTITLES_DIR,
    OCR_DIR
  ].some((rootDir) => isPathInsideRoot(filePath, rootDir));
}

function addPublicUploadPath(targetSet, publicUrl, defaultSubdir = '') {
  const resolved = defaultSubdir ? resolveStoredUrl(publicUrl, defaultSubdir) : String(publicUrl || '').trim();
  const absolute = publicUploadUrlToAbsolutePath(resolved);
  if (!absolute || !isSafeAssetCleanupPath(absolute)) return;
  targetSet.add(path.resolve(absolute));
}

function addAbsoluteCleanupPath(targetSet, filePath) {
  const safePath = String(filePath || '').trim();
  if (!safePath || !path.isAbsolute(safePath) || !isSafeAssetCleanupPath(safePath)) return;
  targetSet.add(path.resolve(safePath));
}

function collectAssetCleanupPaths(row, versionRows = []) {
  const paths = new Set();
  if (!row || typeof row !== 'object') return [];

  addPublicUploadPath(paths, row.media_url);
  addAbsoluteCleanupPath(paths, row.source_path);
  addPublicUploadPath(paths, row.proxy_url, 'proxies');
  addPublicUploadPath(paths, row.thumbnail_url, 'thumbnails');

  const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  getSubtitleItemsFromDc(dc).forEach((item) => {
    addPublicUploadPath(paths, item.subtitleUrl);
  });
  getOcrItemsFromDc(dc, row.updated_at || row.created_at || '').forEach((item) => {
    addPublicUploadPath(paths, item.ocrUrl);
  });

  versionRows.forEach((versionRow) => {
    addPublicUploadPath(paths, versionRow.snapshot_media_url);
    addAbsoluteCleanupPath(paths, versionRow.snapshot_source_path);
    addPublicUploadPath(paths, versionRow.snapshot_thumbnail_url, 'thumbnails');
  });

  return Array.from(paths);
}

function cleanupAssetFiles(paths = []) {
  const removed = [];
  const failed = [];
  paths.forEach((filePath) => {
    const safePath = String(filePath || '').trim();
    if (!safePath || !isSafeAssetCleanupPath(safePath)) return;
    try {
      if (!fs.existsSync(safePath)) return;
      const stat = fs.statSync(safePath);
      if (!stat.isFile()) return;
      fs.unlinkSync(safePath);
      removed.push(safePath);
    } catch (error) {
      failed.push({
        path: safePath,
        message: error?.message || 'unlink failed'
      });
    }
  });
  return { removed, failed };
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
  if (/^\/api\/assets\/[^/]+\/office-callback$/.test(req.path)) return next();
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
  const resolved = resolvePermissionKeysFromPrincipals({
    username,
    groups,
    roles: allRoles
  });
  return {
    username,
    displayName,
    email: emailRaw || '',
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
  return { users, realmByUsername };
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
  return results;
}

async function resolveEffectivePermissions(req) {
  const user = buildUserContextFromRequest(req);
  const usernameKey = String(user.username || '').trim().toLowerCase();
  const settings = await getUserPermissionsSettings();
  const override = usernameKey ? settings[usernameKey] : null;
  const effective = normalizePermissionEntry(override, user.basePermissionKeys || []);
  const canAccessAdmin = Boolean(effective.adminPageAccess);
  const canEditOffice = Boolean(effective.officeEdit);
  return {
    ...user,
    isAdmin: canAccessAdmin,
    canAccessAdmin,
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
      canEditMetadata: effective.canEditMetadata,
      canEditOffice: effective.canEditOffice,
      canDeleteAssets: effective.canDeleteAssets,
      canUsePdfAdvancedTools: effective.canUsePdfAdvancedTools,
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

app.get('/api/assets', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const parsedAssetQuery = parseTextSearchQuery(q, normalizeForSearch);
    const ocrQ = (req.query.ocrQ || '').toString().trim();
    const subtitleQ = (req.query.subtitleQ || '').toString().trim();
    const tag = (req.query.tag || '').toString().trim();
    const type = (req.query.type || '').toString().trim();
    const owner = (req.query.owner || '').toString().trim();
    const uploadDateFrom = req.query.uploadDateFrom;
    const uploadDateTo = req.query.uploadDateTo;
    const sortBy = (req.query.sortBy || '').toString().trim();
    const types = String(req.query.types || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const status = (req.query.status || '').toString().trim();
    const trash = (req.query.trash || 'active').toString().trim().toLowerCase();
    const dateRange = normalizeUploadDateRange(uploadDateFrom, uploadDateTo);
    const normalizedSortBy = normalizeSortBy(sortBy);
    const baseWhere = [];
    const baseValues = [];
    let rankedIds = null;
    const searchMeta = {
      q: { didYouMean: '', fuzzyUsed: false, highlightQuery: q },
      ocrQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: ocrQ },
      subtitleQ: { didYouMean: '', fuzzyUsed: false, highlightQuery: subtitleQ }
    };

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
    if (owner) {
      baseValues.push(`%${owner.toLowerCase()}%`);
      baseWhere.push(`LOWER(owner) LIKE $${baseValues.length}`);
    }
    if (type) {
      baseValues.push(type.toLowerCase());
      baseWhere.push(`LOWER(type) = $${baseValues.length}`);
    }
    if (dateRange.from) {
      baseValues.push(dateRange.from);
      baseWhere.push(`created_at >= $${baseValues.length}`);
    }
    if (dateRange.to) {
      baseValues.push(dateRange.to);
      baseWhere.push(`created_at <= $${baseValues.length}`);
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

    const buildAssetTextWhere = (parsedQuery) => {
      const clauses = [];
      const params = [];
      const pushAssetQueryGroup = (term, options = {}) => {
        const exact = Boolean(options.exact);
        const negate = Boolean(options.negate);
        const joiner = negate ? 'AND' : 'OR';
        if (exact) {
          params.push(exactNormalizedTextRegex(term));
          const idx = baseValues.length + params.length;
          clauses.push(`(
            ${sqlTextFold('title')} ${negate ? '!~' : '~'} $${idx}
            ${joiner} ${sqlTextFold('description')} ${negate ? '!~' : '~'} $${idx}
            ${joiner} ${sqlTextFold('owner')} ${negate ? '!~' : '~'} $${idx}
            ${joiner} ${sqlTextFold("dc_metadata::text")} ${negate ? '!~' : '~'} $${idx}
            ${joiner} ${negate ? 'NOT ' : ''}EXISTS (
              SELECT 1
              FROM asset_cuts c
              WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} ~ $${idx}
            )
          )`);
          return;
        }
        params.push(`%${term}%`);
        const idx = baseValues.length + params.length;
        clauses.push(`(
          ${sqlTextFold('title')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
          ${joiner} ${sqlTextFold('description')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
          ${joiner} ${sqlTextFold('owner')} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
          ${joiner} ${sqlTextFold("dc_metadata::text")} ${negate ? 'NOT LIKE' : 'LIKE'} $${idx}
          ${joiner} ${negate ? 'NOT ' : ''}EXISTS (
            SELECT 1
            FROM asset_cuts c
            WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} LIKE $${idx}
          )
        )`);
      };

      if (parsedQuery.hasOperators) {
        parsedQuery.mustInclude.forEach((term) => pushAssetQueryGroup(term));
        parsedQuery.mustIncludeExact.forEach((term) => pushAssetQueryGroup(term, { exact: true }));
        parsedQuery.mustExclude.forEach((term) => pushAssetQueryGroup(term, { negate: true }));
        parsedQuery.mustExcludeExact.forEach((term) => pushAssetQueryGroup(term, { exact: true, negate: true }));
        if (parsedQuery.optional.length > 0 || parsedQuery.optionalExact.length > 0) {
          const optionalGroups = [];
          parsedQuery.optional.forEach((term) => {
            params.push(`%${term}%`);
            const idx = baseValues.length + params.length;
            optionalGroups.push(`(
              ${sqlTextFold('title')} LIKE $${idx}
              OR ${sqlTextFold('description')} LIKE $${idx}
              OR ${sqlTextFold('owner')} LIKE $${idx}
              OR ${sqlTextFold("dc_metadata::text")} LIKE $${idx}
              OR EXISTS (
                SELECT 1
                FROM asset_cuts c
                WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} LIKE $${idx}
              )
            )`);
          });
          parsedQuery.optionalExact.forEach((term) => {
            params.push(exactNormalizedTextRegex(term));
            const idx = baseValues.length + params.length;
            optionalGroups.push(`(
              ${sqlTextFold('title')} ~ $${idx}
              OR ${sqlTextFold('description')} ~ $${idx}
              OR ${sqlTextFold('owner')} ~ $${idx}
              OR ${sqlTextFold("dc_metadata::text")} ~ $${idx}
              OR EXISTS (
                SELECT 1
                FROM asset_cuts c
                WHERE c.asset_id = assets.id AND ${sqlTextFold('c.label')} ~ $${idx}
              )
            )`);
          });
          clauses.push(`(${optionalGroups.join(' OR ')})`);
        }
      } else {
        pushAssetQueryGroup(parsedQuery.raw);
      }

      return { clauses, params };
    };

    const fetchAssetRows = async (extraWhere = [], extraParams = [], options = {}) => {
      const queryValues = [...baseValues, ...extraParams];
      const where = [...baseWhere, ...extraWhere];
      let orderClause = buildAssetOrderClause({
        hasRelevance: false,
        sortBy: normalizedSortBy,
        rankedParamAlias: queryValues.length + 1
      });
      if (Array.isArray(options.rankedIds) && options.rankedIds.length) {
        queryValues.push(options.rankedIds);
        const rankedIdx = queryValues.length;
        where.push(`id = ANY($${rankedIdx}::text[])`);
        if (normalizedSortBy === 'default') {
          orderClause = buildAssetOrderClause({
            hasRelevance: true,
            sortBy: normalizedSortBy,
            rankedParamAlias: rankedIdx
          });
        }
      }
      const sql = `
        SELECT
          assets.*,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'cutId', c.cut_id,
                  'label', c.label,
                  'inPointSeconds', c.in_point_seconds,
                  'outPointSeconds', c.out_point_seconds
                )
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
      const result = await pool.query(sql, queryValues);
      return result.rows;
    };

    let rows = [];
    if (q) {
      rankedIds = await searchAssetIdsElastic(q);
      if (rankedIds === null) {
        const textWhere = buildAssetTextWhere(parsedAssetQuery);
        rows = await fetchAssetRows(textWhere.clauses, textWhere.params);
      } else if (rankedIds.length) {
        rows = await fetchAssetRows([], [], { rankedIds });
      }
      if (!rows.length && !parsedAssetQuery.hasOperators) {
        const candidateRows = await fetchAssetRows();
        const fuzzyAssetResult = searchAssetsByFuzzyQuery(candidateRows, q);
        rows = fuzzyAssetResult.rows;
        searchMeta.q = {
          didYouMean: String(fuzzyAssetResult.didYouMean || '').trim(),
          fuzzyUsed: Boolean(fuzzyAssetResult.fuzzyUsed),
          highlightQuery: String(fuzzyAssetResult.highlightQuery || q).trim() || q
        };
      }
    } else {
      rows = await fetchAssetRows();
    }

    if (ocrQ) {
      const parsedOcrQuery = parseTextSearchQuery(ocrQ, normalizeSubtitleSearchText);
      const filtered = [];
      for (const row of rows) {
        const ocrSearch = await searchOcrMatchesForAssetRow(row, ocrQ, 8);
        const hits = Array.isArray(ocrSearch.matches) ? ocrSearch.matches : [];
        if (!hits.length) continue;
        const hitQuery = String(ocrSearch.highlightQuery || ocrQ).trim() || ocrQ;
        const hit = hits[0];
        row._ocr_search_hit = {
          query: hitQuery,
          text: String(hit.line || ''),
          startSec: Number(hit.startSec || 0),
          endSec: Number(hit.endSec || 0),
          startTc: formatTimecode(Number(hit.startSec || 0))
        };
        row._ocr_search_hits = hits.map((item) => ({
          query: String(item.query || hitQuery).trim() || hitQuery,
          text: String(item.line || ''),
          startSec: Number(item.startSec || 0),
          endSec: Number(item.endSec || 0),
          startTc: formatTimecode(Number(item.startSec || 0))
        }));
        if (!searchMeta.ocrQ.fuzzyUsed && (ocrSearch.fuzzyUsed || String(ocrSearch.didYouMean || '').trim())) {
          searchMeta.ocrQ = {
            didYouMean: String(ocrSearch.didYouMean || '').trim(),
            fuzzyUsed: Boolean(ocrSearch.fuzzyUsed),
            highlightQuery: hitQuery
          };
        }
        filtered.push(row);
      }
      rows = parsedOcrQuery.raw ? filtered : [];
    }
    // subtitleQ geldiyse sadece aktif altyazi cue index'i uzerinden filtre uygula.
    if (subtitleQ) {
      const parsedSubtitleQuery = parseSubtitleTextSearchQuery(subtitleQ);
      if (!parsedSubtitleQuery.raw) {
        rows = [];
      } else {
        const filtered = [];
        for (const row of rows) {
          const subtitleSearch = await searchSubtitleMatchesForAssetRow(row, subtitleQ, 8);
          const hits = Array.isArray(subtitleSearch.matches) ? subtitleSearch.matches : [];
          if (!hits.length) continue;
          const hitQuery = String(subtitleSearch.highlightQuery || subtitleQ).trim() || subtitleQ;
          const match = hits[0];
          row._subtitle_search_hit = {
            query: hitQuery,
            text: String(match.text || ''),
            startSec: Number(match.startSec || 0),
            endSec: Number(match.endSec || 0),
            startTc: String(match.startTc || formatTimecode(Number(match.startSec || 0)))
          };
          row._subtitle_search_hits = hits.map((item) => ({
            query: String(item.query || hitQuery).trim() || hitQuery,
            text: String(item.text || ''),
            startSec: Number(item.startSec || 0),
            endSec: Number(item.endSec || 0),
            startTc: String(item.startTc || formatTimecode(Number(item.startSec || 0)))
          }));
          if (!searchMeta.subtitleQ.fuzzyUsed && (subtitleSearch.fuzzyUsed || String(subtitleSearch.didYouMean || '').trim())) {
            searchMeta.subtitleQ = {
              didYouMean: String(subtitleSearch.didYouMean || '').trim(),
              fuzzyUsed: Boolean(subtitleSearch.fuzzyUsed),
              highlightQuery: hitQuery
            };
          }
          filtered.push(row);
        }
        rows = filtered;
      }
    }

    const hydratedRows = [];
    for (const row of rows) {
      const withPdfThumb = await ensurePdfThumbnailForRow(row);
      // Backfill missing document thumbnails lazily so existing uploads also get previews.
      hydratedRows.push(await ensureDocumentThumbnailForRow(withPdfThumb));
    }
    res.json({
      assets: hydratedRows.map(mapAssetRow),
      searchMeta
    });
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
      owner: req.query.owner,
      types: req.query.types,
      status: req.query.status,
      uploadDateFrom: req.query.uploadDateFrom,
      uploadDateTo: req.query.uploadDateTo
    });
    return res.json(suggestions);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest assets' });
  }
});

app.get('/api/assets/ocr-suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const parsedOcrQuery = parseTextSearchQuery(q, normalizeSubtitleSearchText);
    if (!parsedOcrQuery.raw) return res.json([]);
    const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
    const tag = String(req.query.tag || '').trim();
    const type = String(req.query.type || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const owner = String(req.query.owner || '').trim();
    const trash = normalizeTrashScope(req.query.trash, 'active');
    const uploadDateFrom = req.query.uploadDateFrom;
    const uploadDateTo = req.query.uploadDateTo;
    const types = String(req.query.types || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const dateRange = normalizeUploadDateRange(uploadDateFrom, uploadDateTo);

    const where = [];
    const values = [];
    if (trash === 'trash') where.push('deleted_at IS NOT NULL');
    else if (trash !== 'all') where.push('deleted_at IS NULL');
    if (tag) {
      values.push(tag);
      const tagParam = `$${values.length}`;
      where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
    }
    if (type) {
      values.push(type);
      where.push(`LOWER(type) = $${values.length}`);
    }
    if (owner) {
      values.push(`%${owner.toLowerCase()}%`);
      where.push(`LOWER(owner) LIKE $${values.length}`);
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
      values.push(status);
      where.push(`LOWER(status) = $${values.length}`);
    }
    if (dateRange.from) {
      values.push(dateRange.from);
      where.push(`created_at >= $${values.length}`);
    }
    if (dateRange.to) {
      values.push(dateRange.to);
      where.push(`created_at <= $${values.length}`);
    }

    const result = await pool.query(
      `
        SELECT id, title, file_name, type, status, owner, updated_at, deleted_at, dc_metadata
        FROM assets
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC
        LIMIT 400
      `,
      values
    );

    const out = [];
    for (const row of result.rows) {
      const hit = await findOcrMatchForAssetRow(row, q);
      if (!hit) continue;
      out.push({
        id: row.id,
        title: String(row.title || row.file_name || row.id || ''),
        fileName: String(row.file_name || ''),
        type: String(row.type || ''),
        status: String(row.status || ''),
        inTrash: Boolean(row.deleted_at),
        updatedAt: row.updated_at,
        ocrHitText: String(hit.line || ''),
        startSec: Number(hit.startSec || 0)
      });
      if (out.length >= limit) break;
    }
    return res.json(out);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest OCR matches' });
  }
});

// 1. kolon altyazi arama kutusu icin global (assetler arasi) oneriler.
app.get('/api/assets/subtitle-suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const parsedQuery = parseSubtitleTextSearchQuery(q);
    if (!parsedQuery.raw) return res.json([]);
    const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
    const tag = String(req.query.tag || '').trim();
    const type = String(req.query.type || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim().toLowerCase();
    const trash = normalizeTrashScope(req.query.trash, 'active');
    const types = String(req.query.types || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const where = [];
    const values = [];
    if (trash === 'trash') where.push('deleted_at IS NOT NULL');
    else if (trash !== 'all') where.push('deleted_at IS NULL');
    if (tag) {
      values.push(tag);
      const tagParam = `$${values.length}`;
      where.push(`EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE ${sqlTagFold('t')} = ${sqlTagFold(tagParam)})`);
    }
    if (type) {
      values.push(type);
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
      values.push(status);
      where.push(`LOWER(status) = $${values.length}`);
    }

    const result = await pool.query(
      `
        SELECT id, title, file_name, type, status, updated_at, deleted_at, dc_metadata
        FROM assets
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC
        LIMIT 400
      `,
      values
    );

    const out = [];
    for (const row of result.rows) {
      const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const activeSubtitleUrl = String(dc.subtitleUrl || '').trim();
      if (!activeSubtitleUrl) continue;
      const subtitleWhere = buildSubtitleCueSearchWhereSql({
        normColumn: 'norm_text',
        startIndex: 3,
        parsedQuery
      });
      const hitRes = await pool.query(
        `
          SELECT start_sec, cue_text
          FROM asset_subtitle_cues
          WHERE asset_id = $1
            AND subtitle_url = $2
            ${subtitleWhere.clauses.length ? `AND ${subtitleWhere.clauses.join(' AND ')}` : ''}
          ORDER BY start_sec ASC
          LIMIT 1
        `,
        [String(row.id || '').trim(), activeSubtitleUrl, ...subtitleWhere.params]
      );
      if (!hitRes.rowCount) continue;
      const hit = hitRes.rows[0];
      out.push({
        id: row.id,
        title: String(row.title || row.file_name || row.id || ''),
        fileName: String(row.file_name || ''),
        type: String(row.type || ''),
        status: String(row.status || ''),
        inTrash: Boolean(row.deleted_at),
        updatedAt: row.updated_at,
        subtitleHitText: String(hit.cue_text || ''),
        startSec: Number(hit.start_sec || 0)
      });
      if (out.length >= limit) break;
    }
    return res.json(out);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest subtitle matches' });
  }
});

app.post('/api/assets', async (req, res) => {
  try {
    const effective = await resolveEffectivePermissions(req).catch(() => null);
    const context = effective || buildUserContextFromRequest(req);
    const owner = String(context?.displayName || context?.username || context?.email || '').trim() || 'Unknown';
    const payload = {
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      owner
    };
    const created = await createAssetRecord(payload);
    res.status(201).json(created);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

app.post('/api/assets/upload', async (req, res) => {
  const { fileName, mimeType, fileData, ...metadata } = req.body || {};
  const allowSilentProxyFallback = Boolean(req.body?.allowSilentProxyFallback);
  const skipProxyGeneration = Boolean(req.body?.skipProxyGeneration);
  const isVideoUpload = isVideoCandidate({ mimeType, fileName, declaredType: metadata.type });
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
  const ingestWarnings = [];
  // Kullanıcı "Proxy olmadan oluştur" seçerse dosyanın kendisini saklamıyoruz;
  // bu durumda kayıt yalnızca metadata taşıyan bir varlık olarak kalıyor.
  let persistOriginalMedia = true;

  if (isVideoUpload) {
    if (skipProxyGeneration) {
      proxyStatus = 'failed';
      persistOriginalMedia = false;
      ingestWarnings.push({
        code: 'proxy_generation_skipped',
        message: 'Proxy generation was skipped and the original asset file was not stored for this upload.',
        retryHint: 'You can generate the proxy later from admin tools or replace only the main file while keeping metadata.'
      });
    } else {
      proxyStatus = 'pending';
      const proxyStoredName = `${Date.now()}-${nanoid()}-proxy.mp4`;
      const proxyOut = buildArtifactPath('proxies', proxyStoredName, new Date());

      try {
        const proxyResult = await generateVideoProxy(absolutePath, proxyOut.absolutePath, {
          allowAudioFallback: allowSilentProxyFallback
        });
        proxyUrl = proxyOut.publicUrl;
        proxyStatus = 'ready';
        detectedAudioChannels = await getMediaAudioChannelCount(proxyOut.absolutePath);
        if (proxyResult?.audioFallbackUsed) {
          ingestWarnings.push({
            code: 'proxy_audio_fallback',
            message: String(proxyResult.warning || 'Proxy was created without audio because the source audio stream could not be decoded reliably.'),
            retryHint: 'You can replace the main file later while keeping metadata, or keep using the silent proxy if video-only review is enough.'
          });
        }
      } catch (error) {
        if (error?.code === 'PROXY_AUDIO_FALLBACK_CONFIRMATION_REQUIRED') {
          // Kullanıcıdan karar almadan problemli kaynağı sistemde bırakmıyoruz.
          // Onay gelirse ikinci istekle tekrar yükleniyor.
          try { if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); } catch (_cleanupError) {}
          try { if (fs.existsSync(proxyOut.absolutePath)) fs.unlinkSync(proxyOut.absolutePath); } catch (_cleanupError) {}
          return res.status(409).json({
            error: String(error.message || 'Proxy generation requires confirmation.'),
            code: 'proxy_audio_confirmation_required',
            confirmationPrompt: String(error.warning || ''),
            retryHint: String(error.retryHint || '')
          });
        }
        const message = summarizeFfmpegError(error);
        console.error('Uploaded video proxy generation failed', {
          inputPath: absolutePath,
          fileName: safeName,
          mimeType,
          error: String(error?.message || error || '')
        });
        proxyStatus = 'failed';
        ingestWarnings.push({
          code: 'proxy_generation_failed',
          message: `Proxy generation failed for uploaded video: ${message}`,
          retryHint: 'You can regenerate the proxy later or replace only the asset file while keeping metadata.'
        });
      }
    }

    if (persistOriginalMedia) {
      const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
      const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
      try {
        await generateVideoThumbnail(absolutePath, thumbOut.absolutePath);
        thumbnailUrl = thumbOut.publicUrl;
      } catch (error) {
        thumbnailUrl = '';
        ingestWarnings.push({
          code: 'thumbnail_generation_failed',
          message: `Thumbnail generation failed: ${summarizeFfmpegError(error)}`,
          retryHint: 'You can regenerate the thumbnail later from the admin tools.'
        });
      }
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

  if (persistOriginalMedia && !detectedAudioChannels && String(mimeType || '').toLowerCase().startsWith('audio/')) {
    detectedAudioChannels = await getMediaAudioChannelCount(absolutePath);
  }

  if (!persistOriginalMedia) {
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (_error) {
      // Temizlik başarısız olsa bile kullanıcıyı metadata-only kayıt akışından düşürmüyoruz.
    }
    thumbnailUrl = '';
  }

  const effective = await resolveEffectivePermissions(req).catch(() => null);
  const context = effective || buildUserContextFromRequest(req);
  const owner = String(context?.displayName || context?.username || context?.email || '').trim() || 'Unknown';
  const payload = {
    ...metadata,
    owner,
    fileName: safeName,
    mimeType: String(mimeType || ''),
    mediaUrl: persistOriginalMedia ? mediaUrl : '',
    proxyUrl,
    proxyStatus,
    thumbnailUrl,
    dcMetadata: {
      ...(metadata?.dcMetadata && typeof metadata.dcMetadata === 'object' ? metadata.dcMetadata : {}),
      ...(detectedAudioChannels > 0 ? { audioChannels: detectedAudioChannels } : {})
    },
    sourcePath: persistOriginalMedia ? absolutePath : ''
  };
  if (persistOriginalMedia && (isVideoUpload || String(mimeType || '').toLowerCase().startsWith('audio/'))
    && (!Number(payload.durationSeconds) || Number(payload.durationSeconds) <= 0)) {
    const detected = await getVideoDurationSeconds(absolutePath);
    if (detected > 0) payload.durationSeconds = Math.round(detected);
  }

  try {
    const created = await createAssetRecord(payload);
    return res.status(201).json({
      ...created,
      ingestWarnings,
      ingestSucceededWithWarnings: ingestWarnings.length > 0
    });
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
    if (audioCandidate) {
      const playbackPath = resolvePlaybackInputPath(assetResult.rows[0]);
      asset.audioStreamOptions = await getMediaAudioStreamOptions(playbackPath);
    }
    asset.versions = versionsResult.rows.map(mapVersionRow);
    asset.cuts = cutsResult.rows.map(mapCutRow);
    res.json(asset);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to load asset' });
  }
});

app.get('/api/assets/:id/office-config', async (req, res) => {
  try {
    const effective = await resolveEffectivePermissions(req).catch(() => buildUserContextFromRequest(req));
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!assetResult.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const row = assetResult.rows[0];
    if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'Asset is not an Office document' });
    }
    const fileType = getFileExtension(row.file_name) || 'docx';
    const documentType = getOnlyOfficeDocumentType({ mimeType: row.mime_type, fileName: row.file_name });
    const publicTitle = String(row.title || row.file_name || row.id || 'Document').trim() || 'Document';
    const mediaUrl = String(row.media_url || '').trim();
    if (!mediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Document URL is invalid' });
    }

    const officeKeySeed = `${String(row.id || '').trim()}|${String(row.updated_at || row.created_at || '').trim()}|${String(row.media_url || '').trim()}`;
    const officeDocumentKey = crypto.createHash('sha1').update(officeKeySeed).digest('hex');
    const documentUrl = `${APP_INTERNAL_URL}${mediaUrl}${mediaUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(officeDocumentKey)}`;
    const officeCallbackState = buildOfficeCallbackState({
      assetId: String(row.id || '').trim(),
      username: String(effective?.username || '').trim(),
      displayName: String(effective?.displayName || effective?.username || '').trim(),
      canEditOffice: Boolean(effective?.canEditOffice),
      ts: Date.now()
    });
    const callbackUrl = `${APP_INTERNAL_URL}/api/assets/${encodeURIComponent(String(row.id || '').trim())}/office-callback?state=${encodeURIComponent(officeCallbackState.state)}&sig=${encodeURIComponent(officeCallbackState.sig)}`;
    const officeEditEnabled = Boolean(effective?.canEditOffice);
    const config = {
      document: {
        fileType,
        key: officeDocumentKey,
        title: publicTitle,
        url: documentUrl
      },
      documentType,
      editorConfig: {
        mode: officeEditEnabled ? 'edit' : 'view',
        lang: String(req.query.lang || 'tr').trim().toLowerCase().startsWith('tr') ? 'tr' : 'en',
        callbackUrl,
        user: {
          id: String(effective?.username || row.owner || row.id || 'user').trim() || 'user',
          name: String(effective?.displayName || effective?.username || row.owner || 'User').trim() || 'User'
        },
        customization: {
          about: false,
          autosave: officeEditEnabled,
          comments: false,
          compactHeader: true,
          compactToolbar: true,
          customer: {
            name: 'MAM',
            info: '',
            mail: '',
            www: ''
          },
          feedback: false,
          forcesave: officeEditEnabled,
          goback: false,
          help: false,
          hideRightMenu: true,
          hideRulers: false,
          integrationMode: 'embed'
        }
      },
      permissions: {
        chat: false,
        comment: false,
        copy: true,
        download: true,
        edit: officeEditEnabled,
        fillForms: false,
        modifyContentControl: false,
        modifyFilter: false,
        print: true,
        review: false
      }
    };
    return res.json({
      onlyofficeUrl: ONLYOFFICE_PUBLIC_URL,
      config
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to build ONLYOFFICE config' });
  }
});

app.post('/api/assets/:id/office-callback', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    const verifiedState = verifyOfficeCallbackState(req.query?.state, req.query?.sig);
    if (!assetId || !verifiedState || String(verifiedState.assetId || '').trim() !== assetId) {
      return res.status(403).json({ error: 1, message: 'Invalid callback signature' });
    }
    const statusCode = Number(req.body?.status || 0);
    const officeUrl = String(req.body?.url || '').trim();
    if (![2, 6].includes(statusCode) || !officeUrl) {
      return res.json({ error: 0 });
    }
    if (!verifiedState.canEditOffice) {
      return res.status(403).json({ error: 1, message: 'Office edit is not allowed' });
    }

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = assetResult.rows[0];
    if (!row) return res.status(404).json({ error: 1, message: 'Asset not found' });
    if (!isOfficeDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 1, message: 'Asset is not an Office document' });
    }

    const editedBuffer = await downloadOnlyofficeEditedBuffer(officeUrl);

    const ext = getFileExtension(row.file_name) || 'docx';
    const safeBase = sanitizeFileName(path.basename(String(row.file_name || row.title || assetId), path.extname(String(row.file_name || ''))) || `asset-${assetId}`);
    const storage = getIngestStoragePath({ type: 'document', mimeType: String(row.mime_type || ''), fileName: `${safeBase}.${ext}` });
    const storedName = `${Date.now()}-${nanoid()}-${safeBase}-edited.${ext}`;
    const absPath = path.join(storage.absoluteDir, storedName);
    const relativePath = path.join(storage.relativeDir, storedName);
    const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
    fs.writeFileSync(absPath, editedBuffer);

    const nowIso = new Date().toISOString();
    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const actor = String(verifiedState.displayName || verifiedState.username || row.owner || 'user').trim() || 'user';
    const nextFileName = `${safeBase}-edited.${ext}`;
    const version = {
      versionId: nanoid(),
      label: `Office Edit ${nextVersion}`,
      note: `Saved from ONLYOFFICE by ${actor}`,
      snapshot: {
        snapshotMediaUrl: mediaUrl,
        snapshotSourcePath: absPath,
        snapshotFileName: nextFileName,
        snapshotMimeType: String(row.mime_type || '').trim(),
        snapshotThumbnailUrl: String(row.thumbnail_url || '').trim()
      },
      actorUsername: String(verifiedState.username || actor).trim() || actor,
      actionType: 'office_save',
      createdAt: nowIso
    };

    await pool.query('BEGIN');
    try {
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
          version.versionId, assetId, version.label, version.note,
          version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
          version.actorUsername, version.actionType, null,
          version.createdAt
        ]
      );
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              updated_at = $6
          WHERE id = $1
        `,
        [assetId, mediaUrl, absPath, nextFileName, String(row.mime_type || '').trim(), nowIso]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    await indexAssetToElastic(assetId).catch(() => {});
    return res.json({ error: 0 });
  } catch (_error) {
    console.error('ONLYOFFICE save callback failed', {
      assetId: String(req.params.id || '').trim(),
      status: req.body?.status,
      url: String(req.body?.url || '').trim(),
      message: _error?.message || String(_error),
      stack: _error?.stack || null
    });
    return res.status(500).json({ error: 1, message: 'Failed to save Office edits' });
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
    const model = String(req.body?.model || WHISPER_MODEL || 'small').trim() || 'small';
    const audioStreamIndex = Number.isFinite(Number(req.body?.audioStreamIndex)) ? Number(req.body.audioStreamIndex) : null;
    const audioChannelIndex = Number.isFinite(Number(req.body?.audioChannelIndex)) ? Number(req.body.audioChannelIndex) : null;
    const turkishAiCorrect = req.body?.turkishAiCorrect;
    const useZemberekLexicon = req.body?.useZemberekLexicon;
    const subtitleBackend = normalizeSubtitleBackend(
      req.body?.subtitleBackend || (req.body?.useWhisperX ? 'whisperx' : 'whisper')
    );
    const job = queueSubtitleGenerationJob(row, {
      lang: subtitleLang,
      label: subtitleLabel,
      model,
      audioStreamIndex,
      audioChannelIndex,
      turkishAiCorrect,
      useZemberekLexicon,
      subtitleBackend
    });
    return res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      subtitleLang,
      subtitleLabel,
      model,
      audioStreamIndex,
      audioChannelIndex,
      turkishAiCorrect: job.turkishAiCorrect,
      useZemberekLexicon: Boolean(job.useZemberekLexicon),
      subtitleBackend: normalizeSubtitleBackend(job.subtitleBackend || job.subtitleBackendRequested),
      warning: String(job.warning || '')
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to generate subtitle' });
  }
});

app.get('/api/subtitle-jobs/:jobId', async (req, res) => {
  const job = subtitleJobs.get(String(req.params.jobId || '').trim());
  if (job) {
    return res.json({
      jobId: job.jobId,
      assetId: job.assetId,
      status: job.status,
      subtitleUrl: job.subtitleUrl || '',
      subtitleLang: job.subtitleLang || '',
      subtitleLabel: job.subtitleLabel || '',
      model: job.model || '',
      turkishAiCorrect: Boolean(job.turkishAiCorrect),
      useZemberekLexicon: Boolean(job.useZemberekLexicon),
      subtitleBackend: normalizeSubtitleBackend(job.subtitleBackend || job.subtitleBackendRequested),
      warning: String(job.warning || ''),
      asset: job.asset || null,
      error: job.error || '',
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt || ''
    });
  }
  try {
    const persisted = await getMediaProcessingJobById(req.params.jobId, 'subtitle');
    if (!persisted) return res.status(404).json({ error: 'Subtitle job not found' });
    return res.json(mapSubtitleJobFromDbRow(persisted));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load subtitle job' });
  }
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
      ocrPreset: req.body?.ocrPreset,
      ocrLabel: req.body?.ocrLabel,
      ocrEngine: req.body?.ocrEngine,
      advancedMode: req.body?.advancedMode,
      turkishAiCorrect: req.body?.turkishAiCorrect,
      useZemberekLexicon: req.body?.useZemberekLexicon,
      preprocessProfile: req.body?.preprocessProfile,
      enableBlurFilter: req.body?.enableBlurFilter,
      blurThreshold: req.body?.blurThreshold,
      enableRegionMode: req.body?.enableRegionMode,
      tickerHeightPct: req.body?.tickerHeightPct,
      ignoreStaticOverlays: req.body?.ignoreStaticOverlays,
      ignorePhrases: req.body?.ignorePhrases,
      minDisplaySec: req.body?.minDisplaySec,
      mergeGapSec: req.body?.mergeGapSec,
      enableSceneSampling: req.body?.enableSceneSampling,
      sceneThreshold: req.body?.sceneThreshold,
      maxSceneFrames: req.body?.maxSceneFrames,
      sceneMinGapSec: req.body?.sceneMinGapSec
    });
    return res.status(202).json({
      jobId: job.jobId,
      status: job.status,
      intervalSec: job.intervalSec,
      ocrLang: job.ocrLang,
      ocrPreset: job.ocrPreset,
      ocrLabel: job.ocrLabel,
      ocrEngine: job.ocrEngine,
      mode: job.mode,
      advancedMode: job.advancedMode,
      turkishAiCorrect: job.turkishAiCorrect,
      useZemberekLexicon: Boolean(job.useZemberekLexicon),
      preprocessProfile: job.preprocessProfile,
      enableBlurFilter: job.enableBlurFilter,
      blurThreshold: job.blurThreshold,
      enableRegionMode: job.enableRegionMode,
      tickerHeightPct: job.tickerHeightPct,
      ignoreStaticOverlays: job.ignoreStaticOverlays,
      ignorePhrases: job.ignorePhrases,
      minDisplaySec: job.minDisplaySec,
      mergeGapSec: job.mergeGapSec,
      enableSceneSampling: job.enableSceneSampling,
      sceneThreshold: job.sceneThreshold,
      maxSceneFrames: job.maxSceneFrames,
      sceneMinGapSec: job.sceneMinGapSec
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to queue video OCR extraction' });
  }
});

app.get('/api/video-ocr-jobs/:jobId', async (req, res) => {
  const job = videoOcrJobs.get(String(req.params.jobId || '').trim());
  if (job) {
    return res.json({
      jobId: job.jobId,
      assetId: job.assetId,
      status: job.status,
      intervalSec: job.intervalSec,
      ocrLang: job.ocrLang,
      ocrPreset: job.ocrPreset,
      ocrEngine: job.ocrEngine,
      requestedEngine: job.requestedEngine,
      resultUrl: job.resultUrl || '',
      downloadUrl: job.resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(job.jobId)}/download` : '',
      resultLabel: job.resultLabel || '',
      lineCount: Number(job.lineCount || 0),
      segmentCount: Number(job.segmentCount || 0),
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
      detectedStaticPhrases: Array.isArray(job.detectedStaticPhrases) ? job.detectedStaticPhrases : [],
      skippedBlur: Number(job.skippedBlur || 0),
      sceneFrameCount: Number(job.sceneFrameCount || 0),
      droppedSceneFrames: Number(job.droppedSceneFrames || 0),
      patchedPeriodicFrames: Number(job.patchedPeriodicFrames || 0),
      keptSceneFrames: Number(job.keptSceneFrames || 0),
      minDisplaySec: Number(job.minDisplaySec || 0),
      mergeGapSec: Number(job.mergeGapSec || 0),
      enableSceneSampling: Boolean(job.enableSceneSampling),
      sceneThreshold: Number(job.sceneThreshold || 0),
      maxSceneFrames: Number(job.maxSceneFrames || 0),
      sceneMinGapSec: Number(job.sceneMinGapSec || 0),
      warning: job.warning || '',
      error: job.error || '',
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt || ''
    });
  }
  try {
    const persisted = await getMediaProcessingJobById(req.params.jobId, 'video_ocr');
    if (!persisted) return res.status(404).json({ error: 'Video OCR job not found' });
    return res.json(mapVideoOcrJobFromDbRow(persisted));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load video OCR job' });
  }
});

app.get('/api/assets/:id/video-ocr/latest', async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
    const latest = getLatestVideoOcrJobForAsset(assetId);
    if (latest) {
      return res.json({
        source: 'memory',
        jobId: latest.jobId,
        assetId: latest.assetId,
        status: latest.status,
        intervalSec: latest.intervalSec,
        ocrLang: latest.ocrLang,
        ocrPreset: latest.ocrPreset,
        ocrEngine: latest.ocrEngine,
        requestedEngine: latest.requestedEngine,
        resultUrl: latest.resultUrl || '',
        downloadUrl: latest.resultUrl ? `/api/video-ocr-jobs/${encodeURIComponent(latest.jobId)}/download` : '',
        resultLabel: latest.resultLabel || '',
        lineCount: Number(latest.lineCount || 0),
        segmentCount: Number(latest.segmentCount || 0),
        mode: String(latest.mode || 'basic'),
        advancedMode: Boolean(latest.advancedMode),
        turkishAiCorrect: Boolean(latest.turkishAiCorrect),
        useZemberekLexicon: Boolean(latest.useZemberekLexicon),
        preprocessProfile: String(latest.preprocessProfile || 'light'),
        enableBlurFilter: Boolean(latest.enableBlurFilter),
        blurThreshold: Number(latest.blurThreshold || 0),
        enableRegionMode: Boolean(latest.enableRegionMode),
        tickerHeightPct: Number(latest.tickerHeightPct || 0),
        ignoreStaticOverlays: Boolean(latest.ignoreStaticOverlays),
        ignorePhrases: String(latest.ignorePhrases || ''),
        skippedBlur: Number(latest.skippedBlur || 0),
        sceneFrameCount: Number(latest.sceneFrameCount || 0),
        droppedSceneFrames: Number(latest.droppedSceneFrames || 0),
        patchedPeriodicFrames: Number(latest.patchedPeriodicFrames || 0),
        keptSceneFrames: Number(latest.keptSceneFrames || 0),
        minDisplaySec: Number(latest.minDisplaySec || 0),
        mergeGapSec: Number(latest.mergeGapSec || 0),
        enableSceneSampling: Boolean(latest.enableSceneSampling),
        sceneThreshold: Number(latest.sceneThreshold || 0),
        maxSceneFrames: Number(latest.maxSceneFrames || 0),
        sceneMinGapSec: Number(latest.sceneMinGapSec || 0),
        warning: latest.warning || '',
        error: latest.error || '',
        startedAt: latest.startedAt,
        updatedAt: latest.updatedAt,
        finishedAt: latest.finishedAt || ''
      });
    }

    const persistedLatest = await getLatestMediaProcessingJobForAsset(assetId, 'video_ocr');
    if (persistedLatest) {
      const mapped = mapVideoOcrJobFromDbRow(persistedLatest);
      return res.json({
        source: 'db_job',
        ...mapped
      });
    }

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = sanitizeVideoOcrItems(dc.videoOcrItems);
    if (!items.length) return res.status(404).json({ error: 'Video OCR job not found' });
    const last = items[items.length - 1];
    return res.json({
      source: 'db',
      jobId: '',
      assetId,
      status: 'completed',
      ocrEngine: last.ocrEngine,
      resultUrl: last.ocrUrl,
      downloadUrl: '',
      resultLabel: last.ocrLabel,
      lineCount: Number(last.lineCount || 0),
      segmentCount: Number(last.segmentCount || 0),
      mode: '',
      warning: '',
      error: '',
      startedAt: '',
      updatedAt: String(last.createdAt || ''),
      finishedAt: String(last.createdAt || ''),
      saved: true
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load latest OCR job' });
  }
});

app.post('/api/assets/:id/video-ocr/save', async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'OCR save is supported only for video assets' });
    }
    const requestedJobId = String(req.body?.jobId || '').trim();
    let job = requestedJobId ? videoOcrJobs.get(requestedJobId) : getLatestVideoOcrJobForAsset(assetId);
    if (!job) {
      const persisted = requestedJobId
        ? await getMediaProcessingJobById(requestedJobId, 'video_ocr')
        : await getLatestMediaProcessingJobForAsset(assetId, 'video_ocr');
      if (persisted && String(persisted.asset_id || '') === assetId) {
        const mapped = mapVideoOcrJobFromDbRow(persisted);
        job = {
          jobId: mapped.jobId,
          assetId: mapped.assetId,
          status: mapped.status,
          resultUrl: mapped.resultUrl,
          resultLabel: mapped.resultLabel,
          lineCount: mapped.lineCount,
          segmentCount: mapped.segmentCount,
          ocrEngine: mapped.ocrEngine,
          requestedEngine: mapped.requestedEngine,
          ocrLang: mapped.ocrLang
        };
      }
    }
    if (!job || String(job.assetId || '') !== assetId) {
      return res.status(404).json({ error: 'Video OCR job not found for this asset' });
    }
    if (String(job.status || '') !== 'completed') {
      return res.status(409).json({ error: 'OCR job is not completed yet' });
    }
    if (!String(job.resultUrl || '').trim()) {
      return res.status(409).json({ error: 'OCR output file is not ready yet' });
    }

    const saved = await saveAssetVideoOcrMetadata(assetId, row, job);
    return res.json({
      ok: true,
      savedItem: saved.item,
      asset: mapAssetRow(saved.row)
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save OCR result to database' });
  }
});

app.get('/api/video-ocr-jobs/:jobId/download', async (req, res) => {
  const jobId = String(req.params.jobId || '').trim();
  const inMemory = videoOcrJobs.get(jobId);
  const serve = (jobLike) => {
    if (String(jobLike.status || '') !== 'completed') {
      return res.status(409).json({ error: 'OCR file is not ready yet' });
    }
    const filePath = String(jobLike.resultPath || '').trim() || publicUploadUrlToAbsolutePath(jobLike.resultUrl);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    const fileName = String(jobLike.resultLabel || path.basename(filePath) || 'video-ocr.txt').trim() || 'video-ocr.txt';
    return res.download(filePath, fileName, (error) => {
      if (error) return;
      if (inMemory) {
        safeRmDir(inMemory.frameDir);
        inMemory.frameDir = '';
        inMemory.updatedAt = new Date().toISOString();
      }
    });
  };
  if (inMemory) return serve(inMemory);
  try {
    const row = await getMediaProcessingJobById(jobId, 'video_ocr');
    if (!row) return res.status(404).json({ error: 'Video OCR job not found' });
    const mapped = mapVideoOcrJobFromDbRow(row);
    return serve({
      status: mapped.status,
      resultUrl: mapped.resultUrl,
      resultPath: '',
      resultLabel: mapped.resultLabel
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load OCR job download info' });
  }
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
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRow);
    } catch (_error) {}
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
    try {
      await syncSubtitleCueIndexForAssetRow(updatedResult.rows[0]);
    } catch (_error) {}

    const filePath = publicUploadUrlToAbsolutePath(subtitleUrl);
    if (filePath && filePath.startsWith(SUBTITLES_DIR) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_error) {}
    }

    return res.json({
      removed: subtitleUrl,
      subtitleCuesCleared: !nextActive,
      asset: mapAssetRow(updatedResult.rows[0])
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to remove subtitle' });
  }
});

app.get('/api/assets/:id/subtitles/search', async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    const query = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
    if (!query) return res.status(400).json({ error: 'q is required' });
    if (query.length < 1) return res.json({ query, total: 0, matches: [], didYouMean: '', fuzzyUsed: false });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
      return res.status(400).json({ error: 'Subtitle search is supported only for video assets' });
    }
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const subtitleUrl = String(dc.subtitleUrl || '').trim();
    if (!subtitleUrl) return res.status(400).json({ error: 'No active subtitle for this asset' });

    const subtitleSearch = await searchSubtitleMatchesForAssetRow(row, query, limit);
    const matches = Array.isArray(subtitleSearch.matches) ? subtitleSearch.matches : [];
    return res.json({
      query,
      total: matches.length,
      subtitleUrl: subtitleSearch.subtitleUrl || subtitleUrl,
      matches,
      didYouMean: String(subtitleSearch.didYouMean || '').trim(),
      fuzzyUsed: Boolean(subtitleSearch.fuzzyUsed)
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to search subtitles' });
  }
});

app.get('/api/assets/:id/subtitles/suggest', async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    const query = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));
    if (!assetId) return res.status(400).json({ error: 'Asset id is required' });
    if (query.length < 2) return res.json([]);

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!assetResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = assetResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const subtitleUrl = String(dc.subtitleUrl || '').trim();
    if (!subtitleUrl) return res.json([]);

    await ensureSubtitleCueIndexForAssetRow(row);
    const parsedQuery = parseSubtitleTextSearchQuery(query);
    if (!parsedQuery.raw) return res.json([]);
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
      [assetId, subtitleUrl, ...subtitleWhere.params, limit]
    );
    return res.json(result.rows.map((item) => ({
      seq: Number(item.seq || 0),
      startSec: Number(item.start_sec || 0),
      endSec: Number(item.end_sec || 0),
      startTc: formatTimecode(Number(item.start_sec || 0)),
      text: String(item.cue_text || '')
    })));
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to suggest subtitle matches' });
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

app.get('/api/assets/:id/pdf-search-ocr', async (_req, res) => {
  return res.status(410).json({ error: 'PDF OCR search is disabled.' });
});

app.get('/api/assets/:id/pdf-page-text', async (req, res) => {
  try {
    const requestedPage = Math.max(1, Number(req.query.page) || 1);

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
      return res.json({ page: requestedPage, totalPages: 0, text: '' });
    }

    const safePage = Math.min(Math.max(1, requestedPage), pages.length);
    return res.json({
      page: safePage,
      totalPages: pages.length,
      text: String(pages[safePage - 1] || ''),
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load PDF page text' });
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

app.post('/api/assets/:id/pdf/save', requirePdfAdvancedTools, async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'Invalid asset id' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = rowResult.rows[0];
    if (!row) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
      return res.status(400).json({ error: 'PDF save is only supported for PDF assets' });
    }

    const rawBase64 = String(req.body?.pdfBase64 || '').trim();
    if (!rawBase64) return res.status(400).json({ error: 'pdfBase64 is required' });
    const sanitizedBase64 = rawBase64.replace(/^data:application\/pdf;base64,/i, '');
    let pdfBuffer = null;
    try {
      pdfBuffer = Buffer.from(sanitizedBase64, 'base64');
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid base64 payload' });
    }
    if (!pdfBuffer || pdfBuffer.length < 16) {
      return res.status(400).json({ error: 'Decoded PDF content is empty' });
    }
    const isPdfHeader = String(pdfBuffer.slice(0, 5).toString('utf8') || '').startsWith('%PDF-');
    if (!isPdfHeader) {
      return res.status(400).json({ error: 'Decoded content is not a valid PDF' });
    }

    const inputFileName = String(req.body?.fileName || row.file_name || `${assetId}.pdf`).trim();
    const safeBase = sanitizeFileName(path.basename(inputFileName, path.extname(inputFileName)) || `asset-${assetId}`);
    const storage = getIngestStoragePath({ type: 'document', mimeType: 'application/pdf', fileName: `${safeBase}.pdf` });
    const storedName = `${Date.now()}-${nanoid()}-${safeBase}-edited.pdf`;
    const absPath = path.join(storage.absoluteDir, storedName);
    const relativePath = path.join(storage.relativeDir, storedName);
    const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
    fs.writeFileSync(absPath, pdfBuffer);

    const nowIso = new Date().toISOString();
    const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
    const rawKinds = Array.isArray(req.body?.changeKinds) ? req.body.changeKinds : [];
    const normalizedKinds = Array.from(new Set(rawKinds.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)));
    let effectiveKind = 'unknown';
    if (normalizedKinds.includes('redaction') && normalizedKinds.includes('text_insert')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('redaction') && normalizedKinds.includes('annotation')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('text_insert') && normalizedKinds.includes('annotation')) effectiveKind = 'mixed';
    else if (normalizedKinds.includes('redaction')) effectiveKind = 'redaction';
    else if (normalizedKinds.includes('text_insert')) effectiveKind = 'text_insert';
    else if (normalizedKinds.includes('annotation')) effectiveKind = 'annotation';
    const nextFileName = `${safeBase}-edited.pdf`;
    const version = {
      versionId: nanoid(),
      label: `PDF Edit ${nextVersion}`,
      note: `Saved from PDF viewer by ${actor} [change:${effectiveKind}]`,
      snapshot: {
        snapshotMediaUrl: mediaUrl,
        snapshotSourcePath: absPath,
        snapshotFileName: nextFileName,
        snapshotMimeType: 'application/pdf',
        snapshotThumbnailUrl: ''
      },
      actorUsername: actor,
      actionType: 'pdf_save',
      createdAt: nowIso
    };
    await pool.query('BEGIN');
    try {
      const originalExists = await pool.query(
        `SELECT 1 FROM asset_versions WHERE asset_id = $1 AND action_type = 'pdf_original' LIMIT 1`,
        [assetId]
      );
      if (!originalExists.rowCount) {
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
            nanoid(),
            assetId,
            'PDF Original',
            'Hidden original snapshot before first PDF edit',
            String(row.media_url || '').trim(),
            String(row.source_path || '').trim(),
            String(row.file_name || '').trim(),
            String(row.mime_type || '').trim() || 'application/pdf',
            String(row.thumbnail_url || '').trim(),
            actor,
            'pdf_original',
            null,
            nowIso
          ]
        );
      }

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
          version.versionId, assetId, version.label, version.note,
          version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
          version.actorUsername, version.actionType, null,
          version.createdAt
        ]
      );
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = '',
              updated_at = $6
          WHERE id = $1
        `,
        [assetId, mediaUrl, absPath, nextFileName, 'application/pdf', nowIso]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    let updatedRow = updatedResult.rows[0];
    updatedRow = await ensurePdfThumbnailForRow(updatedRow);

    return res.json({
      saved: true,
      asset: mapAssetRow(updatedRow),
      changeKind: effectiveKind,
      version
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save PDF edits' });
  }
});

app.post('/api/assets/:id/pdf-restore-original', requireAdminAccess, async (req, res) => {
  try {
    if (!req.userPermissions?.canUsePdfAdvancedTools) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'PDF restore is only supported for PDF assets' });
    }

    let targetResult = await pool.query(
      `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'pdf_original' ORDER BY created_at ASC LIMIT 1`,
      [assetId]
    );
    if (!targetResult.rowCount) {
      targetResult = await pool.query(
        `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
        [assetId]
      );
    }
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Original PDF snapshot not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim() || currentRow.file_name;
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || 'application/pdf';
    const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim();
    let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    if (!snapshotMediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Original snapshot is not restorable' });
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
      snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      return res.status(400).json({ error: 'Original snapshot file is missing on disk' });
    }

    const nowIso = new Date().toISOString();
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';

    await pool.query(
      `
        UPDATE assets
        SET media_url = $2,
            source_path = $3,
            file_name = $4,
            mime_type = $5,
            thumbnail_url = $6,
            updated_at = $7
        WHERE id = $1
      `,
      [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
    );

    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const restoreVersion = {
      versionId: nanoid(),
      label: `PDF Original Restore ${nextVersion}`,
      note: `Restored to original snapshot by ${actor}`,
      snapshot: {
        snapshotMediaUrl,
        snapshotSourcePath,
        snapshotFileName,
        snapshotMimeType,
        snapshotThumbnailUrl
      },
      actorUsername: actor,
      actionType: 'pdf_restore_original',
      restoredFromVersionId: target.version_id,
      createdAt: nowIso
    };
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
        restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
        restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
        restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
        restoreVersion.createdAt
      ]
    );

    const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    let updatedRow = updatedResult.rows[0];
    updatedRow = await ensurePdfThumbnailForRow(updatedRow);
    await indexAssetToElastic(assetId).catch(() => {});

    return res.json({ restored: true, original: true, asset: mapAssetRow(updatedRow), version: restoreVersion });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore original PDF' });
  }
});

app.delete('/api/assets/:id/versions/:versionId', async (req, res) => {
  try {
    const effective = await resolveEffectivePermissions(req);
    req.userPermissions = effective;
    const assetId = String(req.params.id || '').trim();
    const versionId = String(req.params.versionId || '').trim();
    if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const assetRow = assetResult.rows[0];
    if (!assetRow) return res.status(404).json({ error: 'Asset not found' });
    const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
    const row = versionResult.rows[0];
    if (!row) return res.status(404).json({ error: 'Version not found' });
    if (!canManageVersionRow(req.userPermissions, assetRow, row)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (String(row.action_type || '').trim().toLowerCase() === 'pdf_original') {
      return res.status(400).json({ error: 'Protected version cannot be deleted' });
    }
    await pool.query('DELETE FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
    return res.json({ deleted: true, versionId });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete version' });
  }
});

app.patch('/api/assets/:id/versions/:versionId', async (req, res) => {
  try {
    const effective = await resolveEffectivePermissions(req);
    req.userPermissions = effective;
    const assetId = String(req.params.id || '').trim();
    const versionId = String(req.params.versionId || '').trim();
    if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const assetRow = assetResult.rows[0];
    if (!assetRow) return res.status(404).json({ error: 'Asset not found' });

    const versionResult = await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2', [assetId, versionId]);
    const row = versionResult.rows[0];
    if (!row) return res.status(404).json({ error: 'Version not found' });
    if (!canManageVersionRow(req.userPermissions, assetRow, row)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const nextLabel = String(req.body?.label || '').trim();
    const nextNote = String(req.body?.note || '').trim();
    if (!nextLabel) return res.status(400).json({ error: 'label is required' });

    const updated = await pool.query(
      `
        UPDATE asset_versions
        SET label = $3,
            note = $4
        WHERE asset_id = $1 AND version_id = $2
        RETURNING *
      `,
      [assetId, versionId, nextLabel, nextNote]
    );
    return res.json({ updated: true, version: mapVersionRow(updated.rows[0]) });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update version' });
  }
});

app.post('/api/assets/:id/pdf-restore', requireAdminAccess, async (req, res) => {
  try {
    if (!req.userPermissions?.canUsePdfAdvancedTools) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const assetId = String(req.params.id || '').trim();
    const versionId = String(req.body?.versionId || '').trim();
    if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isPdfCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'PDF restore is only supported for PDF assets' });
    }

    const versionResult = await pool.query(
      'SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2',
      [assetId, versionId]
    );
    const target = versionResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Version not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim();
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || 'application/pdf';
    const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim();
    let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    if (!snapshotMediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Selected version has no restorable PDF snapshot' });
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
      snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      return res.status(400).json({ error: 'Snapshot file for selected version is missing on disk' });
    }

    const nowIso = new Date().toISOString();
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';

    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = $6,
              updated_at = $7
          WHERE id = $1
        `,
        [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName || currentRow.file_name, snapshotMimeType, snapshotThumbnailUrl, nowIso]
      );

      const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
      const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
      const restoreVersion = {
        versionId: nanoid(),
        label: `PDF Restore ${nextVersion}`,
        note: `Restored to ${String(target.label || target.version_id)} by ${actor}`,
        snapshot: {
          snapshotMediaUrl,
          snapshotSourcePath,
          snapshotFileName: snapshotFileName || currentRow.file_name,
          snapshotMimeType,
          snapshotThumbnailUrl
        },
        actorUsername: actor,
        actionType: 'pdf_restore',
        restoredFromVersionId: target.version_id,
        createdAt: nowIso
      };
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
          restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
          restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
          restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
          restoreVersion.createdAt
        ]
      );
      await pool.query('COMMIT');

      const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
      let updatedRow = updatedResult.rows[0];
      updatedRow = await ensurePdfThumbnailForRow(updatedRow);
      return res.json({
        restored: true,
        asset: mapAssetRow(updatedRow),
        version: restoreVersion
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore PDF version' });
  }
});

app.post('/api/assets/:id/office-restore', requireAdminAccess, async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    const versionId = String(req.body?.versionId || '').trim();
    if (!assetId || !versionId) return res.status(400).json({ error: 'assetId and versionId are required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isOfficeDocumentCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'Office restore is only supported for Office assets' });
    }

    const versionResult = await pool.query(
      'SELECT * FROM asset_versions WHERE asset_id = $1 AND version_id = $2',
      [assetId, versionId]
    );
    const target = versionResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Version not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim() || String(currentRow.file_name || '').trim();
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || String(currentRow.mime_type || '').trim();
    const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim() || String(currentRow.thumbnail_url || '').trim();

    if (!snapshotMediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Selected version has no restorable Office snapshot' });
    }
    const resolvedSnapshotPath = (() => {
      if (snapshotSourcePath && fs.existsSync(snapshotSourcePath)) return snapshotSourcePath;
      const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
      return resolved && fs.existsSync(resolved) ? resolved : '';
    })();
    if (!resolvedSnapshotPath) {
      return res.status(400).json({ error: 'Snapshot file for selected version is missing on disk' });
    }

    const nowIso = new Date().toISOString();
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || currentRow.owner || 'admin').trim() || 'admin';
    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const restoreVersion = {
      versionId: nanoid(),
      label: `Office Restore ${nextVersion}`,
      note: `Restored to ${String(target.label || target.version_id)} by ${actor}`,
      snapshot: {
        snapshotMediaUrl,
        snapshotSourcePath: resolvedSnapshotPath,
        snapshotFileName,
        snapshotMimeType,
        snapshotThumbnailUrl
      },
      actorUsername: String(req.userPermissions?.username || actor).trim() || actor,
      actionType: 'office_restore',
      restoredFromVersionId: target.version_id,
      createdAt: nowIso
    };

    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              thumbnail_url = $6,
              updated_at = $7
          WHERE id = $1
        `,
        [assetId, snapshotMediaUrl, resolvedSnapshotPath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
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
          restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
          restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
          restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
          restoreVersion.createdAt
        ]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    await indexAssetToElastic(assetId).catch(() => {});
    const refreshed = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    return res.json({
      restored: true,
      asset: mapAssetRow(refreshed.rows[0]),
      version: restoreVersion
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore Office version' });
  }
});

app.post('/api/assets/:id/office-restore-original', requireAdminAccess, async (req, res) => {
  try {
    const assetId = String(req.params.id || '').trim();
    if (!assetId) return res.status(400).json({ error: 'assetId is required' });

    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const currentRow = assetResult.rows[0];
    if (!currentRow) return res.status(404).json({ error: 'Asset not found' });
    if (!isOfficeDocumentCandidate({ mimeType: currentRow.mime_type, fileName: currentRow.file_name })) {
      return res.status(400).json({ error: 'Office restore is only supported for Office assets' });
    }

    let targetResult = await pool.query(
      `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'office_original' ORDER BY created_at ASC LIMIT 1`,
      [assetId]
    );
    if (!targetResult.rowCount) {
      targetResult = await pool.query(
        `SELECT * FROM asset_versions WHERE asset_id = $1 AND action_type = 'ingest' ORDER BY created_at ASC LIMIT 1`,
        [assetId]
      );
    }
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ error: 'Original Office snapshot not found' });

    const snapshotMediaUrl = String(target.snapshot_media_url || '').trim();
    const snapshotFileName = String(target.snapshot_file_name || '').trim() || currentRow.file_name;
    const snapshotMimeType = String(target.snapshot_mime_type || '').trim() || String(currentRow.mime_type || '').trim();
    const snapshotThumbnailUrl = String(target.snapshot_thumbnail_url || '').trim();
    let snapshotSourcePath = String(target.snapshot_source_path || '').trim();
    if (!snapshotMediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Original snapshot is not restorable' });
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      const resolved = publicUploadUrlToAbsolutePath(snapshotMediaUrl);
      snapshotSourcePath = resolved && fs.existsSync(resolved) ? resolved : '';
    }
    if (!snapshotSourcePath || !fs.existsSync(snapshotSourcePath)) {
      return res.status(400).json({ error: 'Original snapshot file is missing on disk' });
    }

    const nowIso = new Date().toISOString();
    const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';

    await pool.query(
      `
        UPDATE assets
        SET media_url = $2,
            source_path = $3,
            file_name = $4,
            mime_type = $5,
            thumbnail_url = $6,
            updated_at = $7
        WHERE id = $1
      `,
      [assetId, snapshotMediaUrl, snapshotSourcePath, snapshotFileName, snapshotMimeType, snapshotThumbnailUrl, nowIso]
    );

    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [assetId]);
    const nextVersion = Number(countResult.rows?.[0]?.c || 0) + 1;
    const restoreVersion = {
      versionId: nanoid(),
      label: `Office Original Restore ${nextVersion}`,
      note: `Restored to original snapshot by ${actor}`,
      snapshot: {
        snapshotMediaUrl,
        snapshotSourcePath,
        snapshotFileName,
        snapshotMimeType,
        snapshotThumbnailUrl
      },
      actorUsername: actor,
      actionType: 'office_restore_original',
      restoredFromVersionId: target.version_id,
      createdAt: nowIso
    };
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
        restoreVersion.versionId, assetId, restoreVersion.label, restoreVersion.note,
        restoreVersion.snapshot.snapshotMediaUrl, restoreVersion.snapshot.snapshotSourcePath, restoreVersion.snapshot.snapshotFileName, restoreVersion.snapshot.snapshotMimeType, restoreVersion.snapshot.snapshotThumbnailUrl,
        restoreVersion.actorUsername, restoreVersion.actionType, restoreVersion.restoredFromVersionId,
        restoreVersion.createdAt
      ]
    );

    await indexAssetToElastic(assetId).catch(() => {});
    const updatedResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    return res.json({ restored: true, original: true, asset: mapAssetRow(updatedResult.rows[0]), version: restoreVersion });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to restore original Office document' });
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
    return false;
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
    return false;
  }
  return false;
}

app.use('/api/admin', requireAdminAccess);

app.get('/api/admin/turkish-corrections', async (_req, res) => {
  try {
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({
      entries: getLearnedTurkishCorrectionsList(),
      wordSetSize: turkishWordSet.size
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load Turkish corrections' });
  }
});

app.post('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.body?.from ?? '');
    const correct = String(req.body?.correct ?? req.body?.to ?? '').trim();
    if (!wrong || !correct) {
      return res.status(400).json({ error: 'wrong and correct are required' });
    }
    const now = new Date().toISOString();
    await pool.query(
      `
        INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (wrong_key)
        DO UPDATE SET wrong = EXCLUDED.wrong, correct = EXCLUDED.correct, updated_at = EXCLUDED.updated_at
      `,
      [wrong, wrong, correct, now, now]
    );
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, entry: { wrong, correct }, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save Turkish correction' });
  }
});

app.put('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const sanitized = rows
      .map((row) => ({
        wrong: normalizeLearnedCorrectionKey(row?.wrong ?? row?.from ?? ''),
        correct: String(row?.correct ?? row?.to ?? '').trim()
      }))
      .filter((row) => row.wrong && row.correct);
    await pool.query('BEGIN');
    await pool.query('DELETE FROM learned_turkish_corrections');
    const now = new Date().toISOString();
    for (const row of sanitized) {
      await pool.query(
        `
          INSERT INTO learned_turkish_corrections (wrong_key, wrong, correct, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [row.wrong, row.wrong, row.correct, now, now]
      );
    }
    await pool.query('COMMIT');
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, total: learnedTurkishCorrections.size });
  } catch (_error) {
    await pool.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: 'Failed to replace Turkish corrections' });
  }
});

app.delete('/api/admin/turkish-corrections', async (req, res) => {
  try {
    const wrong = normalizeLearnedCorrectionKey(req.body?.wrong ?? req.query?.wrong ?? '');
    if (!wrong) return res.status(400).json({ error: 'wrong is required' });
    const delRes = await pool.query(
      'DELETE FROM learned_turkish_corrections WHERE wrong_key = $1',
      [wrong]
    );
    const removed = Number(delRes.rowCount || 0) > 0;
    await reloadLearnedTurkishCorrectionsFromDb();
    return res.json({ ok: true, removed, total: learnedTurkishCorrections.size });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete Turkish correction' });
  }
});

function getOcrItemsFromDc(dcMetadata = {}, fallbackDate = '') {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let items = sanitizeVideoOcrItems(dc.videoOcrItems);
  if (!items.length && String(dc.videoOcrUrl || '').trim()) {
    items = [{
      id: '__legacy_active__',
      ocrUrl: String(dc.videoOcrUrl || '').trim(),
      ocrLabel: String(dc.videoOcrLabel || '').trim() || 'video-ocr',
      ocrEngine: normalizeOcrEngine(dc.videoOcrEngine || 'paddle'),
      lineCount: Math.max(0, Number(dc.videoOcrLineCount) || 0),
      segmentCount: Math.max(0, Number(dc.videoOcrSegmentCount) || 0),
      createdAt: String(fallbackDate || new Date().toISOString())
    }];
  }
  return items;
}

function ocrAbsolutePathToPublicUrl(absPath) {
  const safe = String(absPath || '');
  if (!safe) return '';
  const rel = path.relative(OCR_DIR, safe).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return '';
  return `/uploads/ocr/${rel}`;
}

function resolveAdminOcrItemForAssetRow(row, itemId) {
  const dc = row?.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
  const items = getOcrItemsFromDc(dc, row?.updated_at || row?.created_at || '');
  const direct = items.find((it) => String(it.id || '') === String(itemId || ''));
  if (direct) return { item: direct, inferred: false };

  const rawId = String(itemId || '').trim();
  if (!rawId.startsWith('__inferred__')) return { item: null, inferred: false };
  const inferredName = rawId.slice('__inferred__'.length);
  if (!inferredName) return { item: null, inferred: true };

  const inferredPaths = getCandidateOcrFilePathsForRow(row);
  const matched = inferredPaths.find((p) => path.basename(String(p || '')) === inferredName);
  if (!matched) return { item: null, inferred: true };
  const inferredUrl = ocrAbsolutePathToPublicUrl(matched);
  if (!inferredUrl) return { item: null, inferred: true };
  return {
    item: {
      id: rawId,
      ocrUrl: inferredUrl,
      ocrLabel: path.basename(matched),
      ocrEngine: '',
      lineCount: 0,
      segmentCount: 0,
      createdAt: String(row?.updated_at || row?.created_at || new Date().toISOString())
    },
    inferred: true
  };
}

app.get('/api/admin/ocr-records', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(20, Math.min(2000, Number(req.query.limit) || 500));
    const params = [limit];
    let whereSql = '';
    if (q) {
      params.push(`%${q}%`);
      whereSql = 'WHERE COALESCE(title, \'\') ILIKE $2 OR COALESCE(file_name, \'\') ILIKE $2';
    }
    const result = await pool.query(
      `
        SELECT id, title, file_name, type, owner, updated_at, dc_metadata
        FROM assets
        ${whereSql}
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      params
    );

    const records = [];
    result.rows.forEach((row) => {
      if (records.length >= limit) return;
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      let items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
      if (!items.length) {
        const inferredPaths = getCandidateOcrFilePathsForRow(row);
        if (inferredPaths.length) {
          const first = inferredPaths[0];
          const inferredUrl = ocrAbsolutePathToPublicUrl(first);
          if (inferredUrl) {
            items = [{
              id: `__inferred__${path.basename(first)}`,
              ocrUrl: inferredUrl,
              ocrLabel: path.basename(first),
              ocrEngine: '',
              lineCount: 0,
              segmentCount: 0,
              createdAt: String(row.updated_at || row.created_at || new Date().toISOString())
            }];
          }
        }
      }
      if (!items.length) return;
      const activeUrl = String(dc.videoOcrUrl || '').trim();
      items.forEach((item) => {
        if (records.length >= limit) return;
        const label = String(item.ocrLabel || '').trim();
        const url = String(item.ocrUrl || '').trim();
        const urlFileName = path.basename(url || '');
        const lineCount = Number(item.lineCount || 0);
        const segmentCount = Number(item.segmentCount || 0);
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          ocrLabel: label || 'video-ocr',
          ocrUrl: url,
          ocrEngine: String(item.ocrEngine || ''),
          lineCount: Number.isFinite(lineCount) ? lineCount : 0,
          segmentCount: Number.isFinite(segmentCount) ? segmentCount : 0,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json({ records });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load OCR records' });
  }
});

app.patch('/api/admin/ocr-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.ocrLabel || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'ocrLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'OCR record not found' });
    items[idx] = { ...items[idx], ocrLabel: nextLabel };
    const activeUrl = String(dc.videoOcrUrl || '').trim();
    const activeItem = items.find((it) => String(it.ocrUrl || '').trim() === activeUrl) || items[items.length - 1] || null;
    const updatedDc = {
      ...dc,
      videoOcrItems: items,
      videoOcrUrl: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
      videoOcrLabel: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
      videoOcrEngine: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
      videoOcrLineCount: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
      videoOcrSegmentCount: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update OCR record' });
  }
});

app.delete('/api/admin/ocr-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const nextItems = items.filter((item) => String(item.id || '') !== itemId);
    const prevActiveUrl = String(dc.videoOcrUrl || '').trim();
    let nextActive = nextItems.find((it) => String(it.ocrUrl || '').trim() === prevActiveUrl) || null;
    if (!nextActive && nextItems.length) nextActive = nextItems[nextItems.length - 1];
    const updatedDc = {
      ...dc,
      videoOcrItems: nextItems,
      videoOcrUrl: nextActive ? String(nextActive.ocrUrl || '').trim() : '',
      videoOcrLabel: nextActive ? String(nextActive.ocrLabel || '').trim() : '',
      videoOcrEngine: nextActive ? String(nextActive.ocrEngine || '').trim() : '',
      videoOcrLineCount: nextActive ? Math.max(0, Number(nextActive.lineCount) || 0) : 0,
      videoOcrSegmentCount: nextActive ? Math.max(0, Number(nextActive.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await pool.query(
      'DELETE FROM asset_ocr_segments WHERE asset_id = $1 AND ocr_url = $2',
      [assetId, String(target.ocrUrl || '').trim()]
    );

    if (deleteFile) {
      const filePath = publicUploadUrlToAbsolutePath(String(target.ocrUrl || '').trim());
      if (filePath && filePath.startsWith(OCR_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_error) {}
      }
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete OCR record' });
  }
});

function computeOcrStatsFromContent(content) {
  const text = String(content || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^WEBVTT$/i.test(line));
  const segmentCount = (text.match(/\[[0-9:.]+\s*-->\s*[0-9:.]+\]/g) || []).length;
  return {
    lineCount: lines.length,
    segmentCount: segmentCount > 0 ? segmentCount : lines.length
  };
}

app.get('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const item = resolved.item;
    if (!item) return res.status(404).json({ error: 'OCR record not found' });
    const filePath = publicUploadUrlToAbsolutePath(String(item.ocrUrl || '').trim());
    if (!filePath || !filePath.startsWith(OCR_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, ocrUrl: item.ocrUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read OCR content' });
  }
});

app.patch('/api/admin/ocr-records/content', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const content = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const resolved = resolveAdminOcrItemForAssetRow(row, itemId);
    const target = resolved.item;
    if (!target) return res.status(404).json({ error: 'OCR record not found' });
    const items = getOcrItemsFromDc(dc, row.updated_at || row.created_at || '');
    let idx = items.findIndex((it) => String(it.id || '') === itemId);
    const filePath = publicUploadUrlToAbsolutePath(String(target.ocrUrl || '').trim());
    if (!filePath || !filePath.startsWith(OCR_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'OCR file not found' });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    const stats = computeOcrStatsFromContent(content);
    if (idx < 0) {
      // First edit of an inferred OCR file: persist it as a managed OCR item.
      items.push({
        id: nanoid(),
        ocrUrl: String(target.ocrUrl || '').trim(),
        ocrLabel: buildOcrDisplayLabel({
          assetTitle: String(row?.title || ''),
          fileName: String(row?.file_name || ''),
          createdAt: new Date().toISOString(),
          engine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
          version: items.length + 1
        }),
        ocrEngine: normalizeOcrEngine(target.ocrEngine || 'paddle'),
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0),
        createdAt: new Date().toISOString()
      });
      idx = items.length - 1;
    } else {
      items[idx] = {
        ...target,
        lineCount: Math.max(0, Number(stats.lineCount) || 0),
        segmentCount: Math.max(0, Number(stats.segmentCount) || 0)
      };
    }
    const persistedItem = items[idx] || null;
    const activeUrl = String(dc.videoOcrUrl || '').trim();
    const activeItem = items.find((it) => String(it.ocrUrl || '').trim() === activeUrl) || persistedItem;
    const updatedDc = {
      ...dc,
      videoOcrItems: items,
      videoOcrUrl: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
      videoOcrLabel: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
      videoOcrEngine: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
      videoOcrLineCount: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
      videoOcrSegmentCount: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    await syncOcrSegmentIndexForAsset(assetId, String(target.ocrUrl || '').trim(), {
      sourceEngine: String(target.ocrEngine || 'paddle').trim(),
      lang: ''
    });
    return res.json({ ok: true, lineCount: stats.lineCount, segmentCount: stats.segmentCount });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save OCR content' });
  }
});

function getSubtitleItemsFromDc(dcMetadata = {}) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  let items = sanitizeSubtitleItems(dc.subtitleItems);
  if (!items.length && String(dc.subtitleUrl || '').trim()) {
    items = [{
      id: nanoid(),
      subtitleUrl: String(dc.subtitleUrl || '').trim(),
      subtitleLang: normalizeSubtitleLang(dc.subtitleLang),
      subtitleLabel: String(dc.subtitleLabel || '').trim() || 'subtitle',
      createdAt: new Date().toISOString()
    }];
  }
  return items;
}

function findSubtitleMatchInText(text, queryNorm) {
  return findSubtitleMatchesInText(text, queryNorm, 1)[0] || null;
}

app.get('/api/admin/subtitle-records', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLocaleLowerCase('tr');
    const limit = Math.max(20, Math.min(2000, Number(req.query.limit) || 500));
    const result = await pool.query(
      `
        SELECT id, title, file_name, type, owner, updated_at, dc_metadata
        FROM assets
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      [limit]
    );

    const records = [];
    result.rows.forEach((row) => {
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const items = getSubtitleItemsFromDc(dc);
      if (!items.length) return;
      const activeUrl = String(dc.subtitleUrl || '').trim();
      items.forEach((item) => {
        const label = String(item.subtitleLabel || '').trim();
        const lang = normalizeSubtitleLang(item.subtitleLang);
        const url = String(item.subtitleUrl || '').trim();
        const hitText = `${row.title || ''} ${row.file_name || ''} ${label} ${lang} ${url}`.toLocaleLowerCase('tr');
        if (q && !hitText.includes(q)) return;
        records.push({
          assetId: row.id,
          assetTitle: String(row.title || row.file_name || row.id || ''),
          fileName: String(row.file_name || ''),
          type: String(row.type || ''),
          owner: String(row.owner || ''),
          itemId: String(item.id || ''),
          subtitleLabel: label || 'subtitle',
          subtitleLang: lang,
          subtitleUrl: url,
          active: activeUrl && url ? activeUrl === url : false,
          createdAt: String(item.createdAt || row.updated_at || '')
        });
      });
    });
    return res.json({ records });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load subtitle records' });
  }
});

app.patch('/api/admin/subtitle-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const nextLabel = String(req.body?.subtitleLabel || '').trim();
    const nextLang = normalizeSubtitleLang(req.body?.subtitleLang || 'tr');
    const setActive = Boolean(req.body?.setActive);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    if (!nextLabel) return res.status(400).json({ error: 'subtitleLabel is required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((item) => String(item.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    items[idx] = { ...items[idx], subtitleLabel: nextLabel, subtitleLang: nextLang };

    const prevActive = String(dc.subtitleUrl || '').trim();
    const chosen = setActive
      ? items[idx]
      : (items.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || items[idx]);
    const updatedDc = {
      ...dc,
      subtitleItems: items,
      subtitleUrl: String(chosen.subtitleUrl || '').trim(),
      subtitleLabel: String(chosen.subtitleLabel || '').trim(),
      subtitleLang: normalizeSubtitleLang(chosen.subtitleLang)
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update subtitle record' });
  }
});

app.delete('/api/admin/subtitle-records', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const deleteFile = Boolean(req.body?.deleteFile);
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });

    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const target = items.find((item) => String(item.id || '') === itemId);
    if (!target) return res.status(404).json({ error: 'Subtitle record not found' });

    const nextItems = items.filter((item) => String(item.id || '') !== itemId);
    const prevActive = String(dc.subtitleUrl || '').trim();
    let nextActive = nextItems.find((it) => String(it.subtitleUrl || '').trim() === prevActive) || null;
    if (!nextActive && nextItems.length) nextActive = nextItems[nextItems.length - 1];
    const updatedDc = {
      ...dc,
      subtitleItems: nextItems,
      subtitleUrl: nextActive ? String(nextActive.subtitleUrl || '').trim() : '',
      subtitleLabel: nextActive ? String(nextActive.subtitleLabel || '').trim() : '',
      subtitleLang: nextActive ? normalizeSubtitleLang(nextActive.subtitleLang) : ''
    };
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify(updatedDc), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}

    if (deleteFile) {
      const filePath = publicUploadUrlToAbsolutePath(String(target.subtitleUrl || '').trim());
      if (filePath && filePath.startsWith(SUBTITLES_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_error) {}
      }
    }
    return res.json({ ok: true, removedFile: deleteFile });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete subtitle record' });
  }
});

app.get('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const assetId = String(req.query.assetId || '').trim();
    const itemId = String(req.query.itemId || '').trim();
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const item = items.find((it) => String(it.id || '') === itemId);
    if (!item) return res.status(404).json({ error: 'Subtitle record not found' });
    const filePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
    if (!filePath || !filePath.startsWith(SUBTITLES_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({ content, subtitleUrl: item.subtitleUrl || '' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to read subtitle content' });
  }
});

app.patch('/api/admin/subtitle-records/content', async (req, res) => {
  try {
    const assetId = String(req.body?.assetId || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    const rawContent = String(req.body?.content || '');
    if (!assetId || !itemId) return res.status(400).json({ error: 'assetId and itemId are required' });
    const rowResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    if (!rowResult.rowCount) return res.status(404).json({ error: 'Asset not found' });
    const row = rowResult.rows[0];
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    const items = getSubtitleItemsFromDc(dc);
    const idx = items.findIndex((it) => String(it.id || '') === itemId);
    if (idx < 0) return res.status(404).json({ error: 'Subtitle record not found' });
    const item = items[idx];
    const filePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
    if (!filePath || !filePath.startsWith(SUBTITLES_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    const ext = path.extname(filePath).toLowerCase();
    const nextContent = ext === '.vtt'
      ? normalizeVttContent(rawContent)
      : String(rawContent || '').replace(/\r\n?/g, '\n');
    fs.writeFileSync(filePath, nextContent, 'utf8');
    const updatedRes = await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1 RETURNING *',
      [assetId, JSON.stringify({ ...dc, subtitleItems: items }), new Date().toISOString()]
    );
    try {
      await syncSubtitleCueIndexForAssetRow(updatedRes.rows[0]);
    } catch (_error) {}
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save subtitle content' });
  }
});

app.get('/api/admin/text-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
    const assetRes = await pool.query(
      `
        SELECT id, title, file_name, type, dc_metadata, updated_at
        FROM assets
        ORDER BY updated_at DESC
        LIMIT 800
      `
    );
    const out = [];
    for (const row of assetRes.rows) {
      const assetTitle = String(row.title || row.file_name || row.id || '');
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};

      const subtitleItems = getSubtitleItemsFromDc(dc);
      for (const item of subtitleItems) {
        const subtitlePath = publicUploadUrlToAbsolutePath(String(item.subtitleUrl || '').trim());
        if (!subtitlePath || !fs.existsSync(subtitlePath)) continue;
        let raw = '';
        try { raw = fs.readFileSync(subtitlePath, 'utf8'); } catch (_error) { continue; }
        const subtitleMatches = findSubtitleMatchesInText(raw, q, Math.max(1, limit - out.length));
        for (const cue of subtitleMatches) {
          out.push({
            source: 'subtitle',
            assetId: row.id,
            assetTitle,
            label: String(item.subtitleLabel || item.subtitleLang || 'subtitle'),
            timecode: formatTimecode(Number(cue.startSec || 0)),
            startSec: Number(cue.startSec || 0),
            text: String(cue.cueText || '')
          });
          if (out.length >= limit) return res.json({ results: out });
        }
      }

      const ocrHit = await findOcrMatchForAssetRow(row, q);
      if (ocrHit) {
        out.push({
          source: 'ocr',
          assetId: row.id,
          assetTitle,
          label: String(dc.videoOcrLabel || 'video-ocr'),
          timecode: formatTimecode(Number(ocrHit.startSec || 0)),
          startSec: Number(ocrHit.startSec || 0),
          text: String(ocrHit.line || '')
        });
        if (out.length >= limit) return res.json({ results: out });
      }
    }
    return res.json({ results: out });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to run combined text search' });
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
      playerUiMode: Object.prototype.hasOwnProperty.call(req.body, 'playerUiMode')
        ? normalizePlayerUiMode(req.body.playerUiMode)
        : normalizePlayerUiMode(current.playerUiMode),
      ocrDefaultAdvancedMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultAdvancedMode')
        ? Boolean(req.body.ocrDefaultAdvancedMode)
        : current.ocrDefaultAdvancedMode,
      ocrDefaultTurkishAiCorrect: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultTurkishAiCorrect')
        ? Boolean(req.body.ocrDefaultTurkishAiCorrect)
        : current.ocrDefaultTurkishAiCorrect,
      ocrDefaultEnableBlurFilter: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableBlurFilter')
        ? Boolean(req.body.ocrDefaultEnableBlurFilter)
        : current.ocrDefaultEnableBlurFilter,
      ocrDefaultEnableRegionMode: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultEnableRegionMode')
        ? Boolean(req.body.ocrDefaultEnableRegionMode)
        : current.ocrDefaultEnableRegionMode,
      ocrDefaultIgnoreStaticOverlays: Object.prototype.hasOwnProperty.call(req.body, 'ocrDefaultIgnoreStaticOverlays')
        ? Boolean(req.body.ocrDefaultIgnoreStaticOverlays)
        : current.ocrDefaultIgnoreStaticOverlays,
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
    const kcData = await fetchKeycloakUsers();
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    if (!kcUsers.length) {
      return res.status(503).json({ error: 'Failed to fetch users from Keycloak' });
    }
    const permissionDefaultsByUser = await fetchKeycloakUserPermissionDefaults(kcUsers, kcData?.realmByUsername);
    const usernames = new Set();
    kcUsers.forEach((row) => {
      const username = String(row?.username || '').trim().toLowerCase();
      if (username) usernames.add(username);
    });
    Object.keys(saved || {}).forEach((k) => {
      const username = String(k || '').trim().toLowerCase();
      if (!username) return;
      if (usernames.has(username)) usernames.add(username);
    });

    const users = Array.from(usernames)
      .sort((a, b) => a.localeCompare(b))
      .map((username) => {
        const defaults = permissionDefaultsByUser.has(username)
          ? permissionDefaultsByUser.get(username)
          : resolvePermissionKeysFromPrincipals({ username }).permissionKeys;
        const effective = normalizePermissionEntry(saved?.[username], defaults);
        return {
          username,
          permissionKeys: effective.permissionKeys,
          adminPageAccess: effective.adminPageAccess,
          metadataEdit: effective.metadataEdit,
          assetDelete: effective.assetDelete,
          pdfAdvancedTools: effective.pdfAdvancedTools
        };
      });
    return res.json({
      users,
      availablePermissions: getPermissionDefinitionsPayload(),
      source: kcUsers.length ? 'keycloak' : 'fallback'
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load user permissions' });
  }
});

app.patch('/api/admin/user-permissions/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });
    const kcData = await fetchKeycloakUsers();
    const kcUsersAll = Array.isArray(kcData?.users) ? kcData.users : [];
    const kcUsers = kcUsersAll.filter((row) => isVisibleKeycloakUser(row));
    if (!kcUsers.length) {
      return res.status(503).json({ error: 'Failed to fetch users from Keycloak' });
    }
    const existsInKeycloak = kcUsers.some((row) => String(row?.username || '').trim().toLowerCase() === username);
    if (!existsInKeycloak) {
      return res.status(404).json({ error: 'User not found in Keycloak realm' });
    }

    const current = await getUserPermissionsSettings();
    const requestedPermissionKeys = Array.isArray(req.body?.permissionKeys)
      ? req.body.permissionKeys.filter((key) => PERMISSION_KEYS.includes(String(key || '').trim()))
      : null;
    const nextEntry = normalizePermissionEntry(
      {
        permissionKeys: requestedPermissionKeys,
        adminPageAccess: req.body?.adminPageAccess,
        metadataEdit: req.body?.metadataEdit,
        assetDelete: req.body?.assetDelete,
        pdfAdvancedTools: req.body?.pdfAdvancedTools
      },
      resolvePermissionKeysFromPrincipals({ username }).permissionKeys
    );
    const next = {
      ...current,
      [username]: nextEntry
    };
    await saveUserPermissionsSettings(next);
    return res.json({
      username,
      permissionKeys: nextEntry.permissionKeys,
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

function getDirSizeAndFiles(rootDir) {
  let totalBytes = 0;
  let totalFiles = 0;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    entries.forEach((entry) => {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        return;
      }
      if (!entry.isFile()) return;
      totalFiles += 1;
      try {
        const st = fs.statSync(abs);
        totalBytes += Math.max(0, Number(st.size) || 0);
      } catch (_error) {}
    });
  }
  return { totalBytes, totalFiles };
}

function getFsFreeAndTotal(targetDir) {
  try {
    if (typeof fs.statfsSync !== 'function') {
      return { freeBytes: 0, totalBytes: 0 };
    }
    const st = fs.statfsSync(targetDir);
    const blockSize = Math.max(0, Number(st.bsize || st.frsize || 0));
    const freeBlocks = Math.max(0, Number(st.bavail || st.bfree || 0));
    const totalBlocks = Math.max(0, Number(st.blocks || 0));
    return {
      freeBytes: blockSize * freeBlocks,
      totalBytes: blockSize * totalBlocks
    };
  } catch (_error) {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

async function checkHttpService(url, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status
    };
  } catch (_error) {
    clearTimeout(timer);
    return { ok: false, status: 0 };
  }
}

app.get('/api/admin/system-health', async (_req, res) => {
  try {
    const buildHealthMediaJobSummary = (row) => {
      if (!row) return null;
      const jobType = normalizeMediaJobType(row.job_type);
      const mapped = jobType === 'subtitle' ? mapSubtitleJobFromDbRow(row) : mapVideoOcrJobFromDbRow(row);
      return {
        jobId: mapped.jobId,
        assetId: mapped.assetId,
        assetTitle: String(row.asset_title || row.title || '').trim(),
        status: mapped.status,
        progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
        updatedAt: mapped.updatedAt,
        finishedAt: mapped.finishedAt,
        warning: String(mapped.warning || ''),
        error: String(mapped.error || ''),
        label: jobType === 'subtitle' ? String(mapped.subtitleLabel || '') : String(mapped.resultLabel || ''),
        model: jobType === 'subtitle' ? String(mapped.model || '') : '',
        engine: jobType === 'video_ocr' ? String(mapped.ocrEngine || '') : '',
        lineCount: jobType === 'video_ocr' ? Number(mapped.lineCount || 0) : 0,
        segmentCount: jobType === 'video_ocr' ? Number(mapped.segmentCount || 0) : 0
      };
    };

    const [proxyRunning, proxyFailed] = [
      Array.from(proxyJobs.values()).filter((job) => ['running', 'queued'].includes(String(job.status || ''))).length,
      Array.from(proxyJobs.values()).filter((job) => String(job.status || '') === 'failed').length
    ];
    const mediaJobsStats = await pool.query(
      `
        SELECT job_type, status, COUNT(*)::int AS count
        FROM media_processing_jobs
        WHERE job_type IN ('subtitle', 'video_ocr')
        GROUP BY job_type, status
      `
    );
    const mediaCounts = {};
    mediaJobsStats.rows.forEach((row) => {
      const key = `${String(row.job_type || '')}:${String(row.status || '')}`;
      mediaCounts[key] = Number(row.count || 0);
    });
    const subtitleRunning = (mediaCounts['subtitle:running'] || 0) + (mediaCounts['subtitle:queued'] || 0);
    const ocrRunning = (mediaCounts['video_ocr:running'] || 0) + (mediaCounts['video_ocr:queued'] || 0);
    const subtitleFailed = mediaCounts['subtitle:failed'] || 0;
    const ocrFailed = mediaCounts['video_ocr:failed'] || 0;

    const { totalBytes: uploadsBytes, totalFiles: uploadsFiles } = getDirSizeAndFiles(UPLOADS_DIR);
    const fsInfo = getFsFreeAndTotal(UPLOADS_DIR);

    const assetRows = await pool.query(
      'SELECT id, proxy_url, thumbnail_url, dc_metadata FROM assets ORDER BY updated_at DESC LIMIT 5000'
    );
    let missingProxy = 0;
    let missingThumbnail = 0;
    let missingSubtitle = 0;
    let missingOcr = 0;
    assetRows.rows.forEach((row) => {
      const proxyAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.proxy_url, 'proxies'));
      if (proxyAbs && !fs.existsSync(proxyAbs)) missingProxy += 1;
      const thumbAbs = publicUploadUrlToAbsolutePath(resolveStoredUrl(row.thumbnail_url, 'thumbnails'));
      if (thumbAbs && !fs.existsSync(thumbAbs)) missingThumbnail += 1;
      const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
      const subUrl = String(dc.subtitleUrl || '').trim();
      const subAbs = subUrl ? publicUploadUrlToAbsolutePath(subUrl) : '';
      if (subAbs && !fs.existsSync(subAbs)) missingSubtitle += 1;
      const ocrUrl = pickLatestVideoOcrUrlFromDc(dc);
      const ocrAbs = ocrUrl ? publicUploadUrlToAbsolutePath(ocrUrl) : '';
      if (ocrAbs && !fs.existsSync(ocrAbs)) missingOcr += 1;
    });

    const [postgresCheck, elasticCheck, keycloakCheck, oauth2ProxyCheck] = await Promise.all([
      pool.query('SELECT 1 AS ok').then(() => ({ ok: true, status: 200 })).catch(() => ({ ok: false, status: 0 })),
      checkHttpService('http://elasticsearch:9200'),
      checkHttpService('http://keycloak:8080/realms/mam'),
      checkHttpService('http://oauth2-proxy:4180/ping')
    ]);

    const recentJobsResult = await pool.query(
      `
        SELECT mpj.*, a.title AS asset_title
        FROM media_processing_jobs mpj
        LEFT JOIN assets a ON a.id = mpj.asset_id
        WHERE mpj.job_type IN ('subtitle', 'video_ocr')
        ORDER BY mpj.updated_at DESC
        LIMIT 200
      `
    );
    const recentJobs = {
      subtitle: { active: null, latestCompleted: null, latestFailed: null },
      ocr: { active: null, latestCompleted: null, latestFailed: null }
    };
    recentJobsResult.rows.forEach((row) => {
      const typeKey = String(row.job_type || '') === 'video_ocr' ? 'ocr' : 'subtitle';
      const status = normalizeMediaJobStatus(row.status);
      const summary = buildHealthMediaJobSummary(row);
      if (!summary) return;
      if (!recentJobs[typeKey].active && (status === 'running' || status === 'queued')) {
        recentJobs[typeKey].active = summary;
      }
      if (!recentJobs[typeKey].latestCompleted && status === 'completed') {
        recentJobs[typeKey].latestCompleted = summary;
      }
      if (!recentJobs[typeKey].latestFailed && status === 'failed') {
        recentJobs[typeKey].latestFailed = summary;
      }
    });

    return res.json({
      disk: {
        uploadsBytes,
        uploadsFiles,
        fsFreeBytes: fsInfo.freeBytes,
        fsTotalBytes: fsInfo.totalBytes
      },
      jobs: {
        proxyRunning,
        subtitleRunning,
        ocrRunning,
        proxyFailed,
        subtitleFailed,
        ocrFailed
      },
      services: {
        app: { ok: true, status: 200 },
        postgres: postgresCheck,
        elasticsearch: elasticCheck,
        keycloak: keycloakCheck,
        oauth2Proxy: oauth2ProxyCheck
      },
      integrity: {
        missingProxy,
        missingThumbnail,
        missingSubtitle,
        missingOcr
      },
      recentJobs
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load system health' });
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
    if (!['thumbnail', 'preview', 'proxy', 'replace_asset', 'replace_pdf', 'delete_asset'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be one of: thumbnail, preview, proxy, replace_asset, replace_pdf, delete_asset' });
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

    if (mode === 'delete_asset') {
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const versionRows = (await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1', [row.id])).rows;
      const cleanupTargets = collectAssetCleanupPaths(row, versionRows);
      await pool.query('DELETE FROM asset_versions WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_subtitle_cues WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM asset_ocr_segments WHERE asset_id = $1', [row.id]);
      await pool.query('DELETE FROM assets WHERE id = $1', [row.id]);
      const cleanup = cleanupAssetFiles(cleanupTargets);
      await deleteAssetFromElastic(row.id).catch(() => {});
      info = {
        deleted: true,
        actor,
        removedFiles: cleanup.removed.length,
        cleanupErrors: cleanup.failed
      };
    } else if (mode === 'proxy') {
      if (!isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        return res.status(400).json({ error: 'Proxy generation is supported only for video assets' });
      }
      const rawBase64 = String(req.body?.fileBase64 || '').trim();
      if (rawBase64) {
        // Yönetim ekranında "Proxy üret" seçiliyken yeni dosya seçilmişse,
        // aynı işlem içinde önce ana videoyu bağlayıp sonra proxy üretiyoruz.
        const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
        let fileBuffer = null;
        try {
          fileBuffer = Buffer.from(sanitizedBase64, 'base64');
        } catch (_error) {
          return res.status(400).json({ error: 'Invalid fileBase64 payload' });
        }
        if (!fileBuffer || fileBuffer.length < 16) {
          return res.status(400).json({ error: 'Decoded file content is empty' });
        }

        const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
        const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
        const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
        if (!isVideoCandidate({ mimeType: nextMimeType, fileName: safeFileName, declaredType: row.type })) {
          return res.status(400).json({ error: 'Selected source file must be a video file' });
        }

        const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
        const extWithDot = path.extname(safeFileName) || '';
        const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
        const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
        const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
        const absPath = path.join(storage.absoluteDir, storedName);
        const relativePath = path.join(storage.relativeDir, storedName);
        const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
        fs.writeFileSync(absPath, fileBuffer);

        const nowIso = new Date().toISOString();
        const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
        const hadExistingSource = Boolean(String(row.media_url || '').trim() || String(row.source_path || '').trim());
        if (hadExistingSource) {
          // Var olan kaynak eziliyorsa geri dönüş için önce sürüm kaydı alıyoruz.
          const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
          const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
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
              nanoid(),
              row.id,
              `Asset Replace ${nextVersion}`,
              `File attached during proxy generation by ${actor}`,
              String(row.media_url || ''),
              String(row.source_path || ''),
              String(row.file_name || ''),
              String(row.mime_type || ''),
              String(row.thumbnail_url || ''),
              actor,
              'file_replace',
              null,
              nowIso
            ]
          );
        }

        const updated = await pool.query(
          `
            UPDATE assets
            SET media_url = $2,
                source_path = $3,
                file_name = $4,
                mime_type = $5,
                type = $6,
                proxy_url = '',
                proxy_status = 'not_applicable',
                thumbnail_url = '',
                updated_at = $7
            WHERE id = $1
            RETURNING *
          `,
          [row.id, mediaUrl, absPath, safeFileName, nextMimeType, inferAssetType(row.type, nextMimeType), nowIso]
        );
        row = updated.rows?.[0] || row;
      }
      const inputPath = resolveAssetInputPath(row);
      if (!inputPath || !fs.existsSync(inputPath)) {
        return res.status(400).json({
          error: 'Source media not found. Choose a source video file in New Asset File, then run proxy generation again.'
        });
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
    } else if (mode === 'replace_asset' || mode === 'replace_pdf') {
      const rawBase64 = String(req.body?.fileBase64 || req.body?.pdfBase64 || '').trim();
      if (!rawBase64) return res.status(400).json({ error: 'fileBase64 is required for replace_asset' });
      const sanitizedBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      let fileBuffer = null;
      try {
        fileBuffer = Buffer.from(sanitizedBase64, 'base64');
      } catch (_error) {
        return res.status(400).json({ error: 'Invalid fileBase64 payload' });
      }
      if (!fileBuffer || fileBuffer.length < 16) {
        return res.status(400).json({ error: 'Decoded file content is empty' });
      }

      const inputFileName = String(req.body?.fileName || row.file_name || `${row.id}.bin`).trim();
      const safeFileName = sanitizeFileName(inputFileName || row.file_name || `${row.id}.bin`);
      const nextMimeType = String(req.body?.mimeType || '').trim().toLowerCase() || inferMimeTypeFromFileName(safeFileName) || 'application/octet-stream';
      const currentFamily = getAssetFamily({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type });
      const newFamily = getAssetFamily({ mimeType: nextMimeType, fileName: safeFileName, declaredType: inferAssetType('', nextMimeType) });
      if (currentFamily === 'unknown' || newFamily === 'unknown' || currentFamily !== newFamily) {
        return res.status(400).json({
          error: 'New file type must match existing asset type',
          currentFamily,
          newFamily
        });
      }
      const generateThumbnail = Boolean(req.body?.generateThumbnail);
      const generatePreview = Boolean(req.body?.generatePreview);
      const safeBase = sanitizeFileName(path.basename(safeFileName, path.extname(safeFileName)) || `asset-${row.id}`);
      const extWithDot = path.extname(safeFileName) || '';
      const extSafe = extWithDot ? sanitizeFileName(extWithDot.replace(/^\./, '')) : '';
      const storedName = `${Date.now()}-${nanoid()}-${safeBase}${extSafe ? `.${extSafe}` : ''}`;
      const storage = getIngestStoragePath({ type: inferAssetType(row.type, nextMimeType), mimeType: nextMimeType, fileName: safeFileName });
      const absPath = path.join(storage.absoluteDir, storedName);
      const relativePath = path.join(storage.relativeDir, storedName);
      const mediaUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
      fs.writeFileSync(absPath, fileBuffer);

      const nowIso = new Date().toISOString();
      const actor = String(req.userPermissions?.displayName || req.userPermissions?.username || 'admin').trim() || 'admin';
      const versionCount = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [row.id]);
      const nextVersion = Number(versionCount.rows?.[0]?.c || 0) + 1;
      const nextFileName = safeFileName;
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
          nanoid(),
          row.id,
          `Asset Replace ${nextVersion}`,
          `File replaced via admin proxy tool by ${actor}`,
          mediaUrl,
          absPath,
          nextFileName,
          nextMimeType,
          '',
          actor,
          'file_replace',
          null,
          nowIso
        ]
      );
      await pool.query(
        `
          UPDATE assets
          SET media_url = $2,
              proxy_url = '',
              proxy_status = 'not_applicable',
              source_path = $3,
              file_name = $4,
              mime_type = $5,
              type = $6,
              thumbnail_url = '',
              updated_at = $7
          WHERE id = $1
          RETURNING *
        `,
        [row.id, mediaUrl, absPath, nextFileName, nextMimeType, inferAssetType(row.type, nextMimeType), nowIso]
      ).then((result) => {
        row = result.rows[0] || row;
      });
      let previewChars = 0;
      if (generateThumbnail) {
        if (isVideoCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          const inputPath = resolveAssetInputPath(row);
          if (inputPath && fs.existsSync(inputPath)) {
            const thumbStoredName = `${Date.now()}-${nanoid()}-thumb.jpg`;
            const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, new Date());
            await generateVideoThumbnail(inputPath, thumbOut.absolutePath);
            const refreshed = await pool.query(
              `UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
              [row.id, thumbOut.publicUrl, new Date().toISOString()]
            );
            row = refreshed.rows?.[0] || row;
          }
        } else if (isPdfCandidate({ mimeType: row.mime_type, fileName: row.file_name })) {
          row = await ensurePdfThumbnailForRow(row);
        } else if (isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
          row = await ensureDocumentThumbnailForRow(row);
        } else if (String(row.mime_type || '').toLowerCase().startsWith('image/')) {
          const nowIso2 = new Date().toISOString();
          const imageThumb = resolveStoredUrl(row.media_url, 'uploads') || row.media_url || '';
          const updated = await pool.query(
            `UPDATE assets SET thumbnail_url = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
            [row.id, imageThumb, nowIso2]
          );
          row = updated.rows?.[0] || row;
        }
      }
      if (generatePreview && isDocumentCandidate({ mimeType: row.mime_type, fileName: row.file_name, declaredType: row.type })) {
        const inputPath = resolveAssetInputPath(row);
        if (inputPath && fs.existsSync(inputPath)) {
          const preview = await extractPreviewContentFromFile(row, inputPath);
          previewChars = Math.max(0, String(preview.html || preview.text || '').length);
        }
      }
      await indexAssetToElastic(row.id).catch(() => {});
      info = {
        replaced: true,
        thumbnailUrl: resolveStoredUrl(row.thumbnail_url, 'thumbnails'),
        generatedThumbnail: generateThumbnail,
        generatedPreview: generatePreview,
        previewChars
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
    const existing = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    const versionRows = (await pool.query('SELECT * FROM asset_versions WHERE asset_id = $1', [req.params.id])).rows;
    const cleanupTargets = collectAssetCleanupPaths(existing.rows[0], versionRows);
    await pool.query('DELETE FROM assets WHERE id = $1 RETURNING id', [req.params.id]);
    cleanupAssetFiles(cleanupTargets);
    await removeAssetFromElastic(req.params.id).catch(() => {});
    return res.status(204).send();
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete asset' });
  }
});

app.patch('/api/assets/:id', requireMetadataEdit, async (req, res) => {
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
    const effective = await resolveEffectivePermissions(req);
    req.userPermissions = effective;
    const exists = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    const row = exists.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (!canCreateVersionForAsset(req.userPermissions, row)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM asset_versions WHERE asset_id = $1', [req.params.id]);
    const count = countResult.rows[0].c;

    const version = {
      versionId: nanoid(),
      label: req.body.label?.trim() || `v${count + 1}`,
      note: req.body.note?.trim() || 'Version update',
      snapshot: buildVersionSnapshotFromRow(row),
      actorUsername: String(req.userPermissions?.username || req.userPermissions?.displayName || row.owner || 'user').trim() || 'user',
      actionType: 'manual',
      createdAt: new Date().toISOString()
    };

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
        version.versionId, req.params.id, version.label, version.note,
        version.snapshot.snapshotMediaUrl, version.snapshot.snapshotSourcePath, version.snapshot.snapshotFileName, version.snapshot.snapshotMimeType, version.snapshot.snapshotThumbnailUrl,
        version.actorUsername, version.actionType, null,
        version.createdAt
      ]
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
