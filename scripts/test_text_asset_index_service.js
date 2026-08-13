const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTextAssetIndexService } = require('../src/services/textAssetIndexService');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-text-index-'));
const uploadsDir = path.join(tmpRoot, 'uploads');
const ocrDir = path.join(uploadsDir, '2026', '7', '22', 'ocr');
fs.mkdirSync(ocrDir, { recursive: true });

const ocrUrl = '/uploads/2026/7/22/ocr/sample-ocr.txt';
const ocrPath = path.join(uploadsDir, '2026', '7', '22', 'ocr', 'sample-ocr.txt');
fs.writeFileSync(ocrPath, [
  '[00:00:01.000 --> 00:00:02.500] İstanbul ekran yazısı',
  '[00:00:03.000 --> 00:00:04.000] Ankara başka yazı'
].join('\n'));

const segments = [];
const pool = {
  async query(sql, params = []) {
    const compactSql = String(sql || '').replace(/\s+/g, ' ').trim();
    if (compactSql.startsWith('DELETE FROM asset_ocr_segments')) {
      for (let idx = segments.length - 1; idx >= 0; idx -= 1) {
        if (segments[idx].asset_id === params[0] && segments[idx].ocr_url === params[1]) {
          segments.splice(idx, 1);
        }
      }
      return { rowCount: 0, rows: [] };
    }
    if (compactSql.startsWith('INSERT INTO asset_ocr_segments')) {
      segments.push({
        asset_id: params[0],
        ocr_url: params[1],
        seq: params[2],
        start_sec: params[3],
        end_sec: params[4],
        segment_text: params[5],
        norm_text: params[6],
        source_engine: params[8],
        lang: params[9]
      });
      return { rowCount: 1, rows: [] };
    }
    if (compactSql.startsWith('SELECT COUNT(*)::int AS count FROM asset_ocr_segments')) {
      const count = segments.filter((row) => row.asset_id === params[0] && row.ocr_url === params[1]).length;
      return { rowCount: 1, rows: [{ count }] };
    }
    if (compactSql.startsWith('SELECT 1 FROM asset_ocr_segments')) {
      const exists = segments.some((row) => row.asset_id === params[0] && row.ocr_url === params[1]);
      return { rowCount: exists ? 1 : 0, rows: exists ? [{ '?column?': 1 }] : [] };
    }
    if (compactSql.includes('WITH matched AS')) {
      const [assetIds, activeUrls, pattern, limit] = params;
      const needle = String(pattern || '').replace(/%/g, '');
      const rows = segments
        .filter((row) => assetIds.includes(row.asset_id) && activeUrls.includes(row.ocr_url))
        .filter((row) => row.norm_text.includes(needle))
        .slice(0, Number(limit) || 8);
      return { rowCount: rows.length, rows };
    }
    if (compactSql.startsWith('SELECT asset_id, ocr_url, start_sec, end_sec, segment_text FROM asset_ocr_segments')) {
      const [assetIds, activeUrls] = params;
      const rows = segments.filter((row) => assetIds.includes(row.asset_id) && activeUrls.includes(row.ocr_url));
      return { rowCount: rows.length, rows };
    }
    if (compactSql.startsWith('SELECT start_sec, end_sec, segment_text FROM asset_ocr_segments')) {
      const [assetId, activeUrl, pattern, limit] = params;
      const needle = String(pattern || '').replace(/%/g, '');
      const rows = segments
        .filter((row) => row.asset_id === assetId && row.ocr_url === activeUrl)
        .filter((row) => row.norm_text.includes(needle))
        .slice(0, Number(limit) || 8);
      return { rowCount: rows.length, rows };
    }
    throw new Error(`Unexpected SQL in text asset index test: ${compactSql}`);
  }
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseTextSearchQuery(value, normalizeFn = normalizeText) {
  const raw = normalizeFn(value);
  return {
    raw,
    hasOperators: false,
    mustInclude: [],
    mustIncludeExact: [],
    mustExclude: [],
    mustExcludeExact: [],
    mustExcludeLongSuffix: [],
    optional: [],
    optionalExact: []
  };
}

function buildSubtitleCueSearchWhereSql({ normColumn, startIndex, parsedQuery }) {
  return {
    clauses: [`${normColumn} LIKE $${startIndex}`],
    params: [`%${parsedQuery.raw}%`],
    nextIndex: startIndex + 1
  };
}

function parseTimedOcrSegments(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*(.*)$/);
      if (!match) return null;
      const toSec = (h, m, s, ms) => (Number(h) * 3600) + (Number(m) * 60) + Number(s) + (Number(ms) / 1000);
      return {
        startSec: toSec(match[1], match[2], match[3], match[4]),
        endSec: toSec(match[5], match[6], match[7], match[8]),
        segmentText: match[9]
      };
    })
    .filter(Boolean);
}

const service = createTextAssetIndexService({
  pool,
  uploadsDir,
  ocrDir,
  sanitizeFileName: (value) => String(value || '').replace(/[^a-z0-9_-]+/gi, '-'),
  publicUploadUrlToAbsolutePath: (url) => path.join(uploadsDir, String(url || '').replace(/^\/uploads\//, '')),
  isUploadArtifactPath: (filePath, folderName) => path.resolve(filePath).split(path.sep).includes(folderName),
  sanitizeVideoOcrItems: (items) => (Array.isArray(items) ? items : []),
  sanitizePhotoOcrItems: (items) => (Array.isArray(items) ? items : []),
  normalizeOcrEngine: (value) => String(value || 'paddle').trim().toLowerCase(),
  normalizeComparableOcr: normalizeText,
  normalizeSubtitleSearchText: normalizeText,
  parseTextSearchQuery,
  buildSubtitleCueSearchWhereSql,
  normalizedTextHasExactTerm: (text, term) => String(text).split(/\s+/).includes(String(term)),
  normalizedTextHasLongSuffixTerm: (text, term) => String(text).split(/\s+/).some((word) => word.endsWith(String(term)) && word.length > String(term).length),
  parseTimedOcrSegments,
  fuzzySearchTextMatch: (query, text) => normalizeText(text).includes(normalizeText(query)),
  suggestDidYouMeanFromTexts: () => ''
});

(async () => {
  const row = {
    id: 'asset-1',
    title: 'Örnek OCR',
    file_name: 'sample.mp4',
    created_at: '2026-07-22T10:00:00Z',
    dc_metadata: {
      videoOcrItems: [{ ocrUrl, ocrEngine: 'paddle', segmentCount: 2 }]
    }
  };

  const indexedCount = await service.syncOcrSegmentIndexForAsset(row.id, ocrUrl, { sourceEngine: 'paddle', lang: 'tr' });
  assert.strictEqual(indexedCount, 2, 'OCR segment index should include both timed lines');
  assert.strictEqual(segments.length, 2, 'Pool should receive two inserted OCR segments');

  const singleMatch = await service.findOcrMatchForAssetRow(row, 'istanbul');
  assert(singleMatch, 'Expected a single OCR match');
  assert.strictEqual(singleMatch.startSec, 1);
  assert(singleMatch.line.includes('İstanbul'));

  const batch = await service.searchOcrMatchesForAssetRows([row], 'ankara', 8);
  const batchMatches = batch.byAssetId.get(row.id) || [];
  assert.strictEqual(batchMatches.length, 1, 'Expected one batch OCR match');
  assert.strictEqual(batchMatches[0].startSec, 3);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('textAssetIndexService OK');
})().catch((error) => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
