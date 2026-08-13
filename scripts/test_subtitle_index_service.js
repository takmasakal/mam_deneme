const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createSubtitleIndexService } = require('../src/services/subtitleIndexService');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-subtitle-index-'));
const uploadsDir = path.join(tmpRoot, 'uploads');
const subtitleDir = path.join(uploadsDir, '2026', '7', '22', 'subtitles');
fs.mkdirSync(subtitleDir, { recursive: true });

const subtitleUrlTr = '/uploads/2026/7/22/subtitles/sample-tr.vtt';
const subtitlePathTr = path.join(subtitleDir, 'sample-tr.vtt');
fs.writeFileSync(subtitlePathTr, [
  'WEBVTT',
  '',
  '00:00:01.000 --> 00:00:02.500',
  'İstanbul altyazı satırı',
  '',
  '00:00:03.000 --> 00:00:04.000',
  'Ankara başka satır',
  ''
].join('\n'));
const subtitleUrlEn = '/uploads/2026/7/22/subtitles/sample-en.vtt';
const subtitlePathEn = path.join(subtitleDir, 'sample-en.vtt');
fs.writeFileSync(subtitlePathEn, [
  'WEBVTT',
  '',
  '00:00:05.000 --> 00:00:06.500',
  'The brain learns by repetition',
  ''
].join('\n'));
const subtitleUrlEnOld = '/uploads/2026/7/22/subtitles/sample-en-old.vtt';
const subtitlePathEnOld = path.join(subtitleDir, 'sample-en-old.vtt');
fs.writeFileSync(subtitlePathEnOld, [
  'WEBVTT',
  '',
  '00:00:07.000 --> 00:00:08.500',
  'Archived inactive subtitle text',
  ''
].join('\n'));

const cues = [];
const pool = {
  async query(sql, params = []) {
    const compactSql = String(sql || '').replace(/\s+/g, ' ').trim();
    if (compactSql.startsWith('DELETE FROM asset_subtitle_cues')) {
      for (let idx = cues.length - 1; idx >= 0; idx -= 1) {
        if (cues[idx].asset_id === params[0]) cues.splice(idx, 1);
      }
      return { rowCount: 0, rows: [] };
    }
    if (compactSql.startsWith('INSERT INTO asset_subtitle_cues')) {
      if (cues.some((row) => row.asset_id === params[0] && row.seq === params[2])) {
        throw new Error(`duplicate asset_subtitle_cues primary key: ${params[0]}:${params[2]}`);
      }
      cues.push({
        asset_id: params[0],
        subtitle_url: params[1],
        seq: params[2],
        start_sec: params[3],
        end_sec: params[4],
        cue_text: params[5],
        norm_text: params[6],
        source_engine: params[8],
        lang: params[9]
      });
      return { rowCount: 1, rows: [] };
    }
    if (compactSql.startsWith('SELECT COUNT(*)::int AS count FROM asset_subtitle_cues')) {
      const count = cues.filter((row) => row.asset_id === params[0] && row.subtitle_url === params[1]).length;
      return { rowCount: 1, rows: [{ count }] };
    }
    if (compactSql.includes('WITH matched AS')) {
      const [assetIds, activeUrls, pattern, limit] = params;
      const needle = String(pattern || '').replace(/%/g, '');
      const rows = cues
        .filter((row) => assetIds.includes(row.asset_id) && activeUrls.includes(row.subtitle_url))
        .filter((row) => row.norm_text.includes(needle))
        .slice(0, Number(limit) || 8);
      return { rowCount: rows.length, rows };
    }
    if (compactSql.startsWith('SELECT asset_id, subtitle_url, seq, start_sec, end_sec, cue_text FROM asset_subtitle_cues')) {
      const [assetIds, activeUrls] = params;
      const rows = cues.filter((row) => assetIds.includes(row.asset_id) && activeUrls.includes(row.subtitle_url));
      return { rowCount: rows.length, rows };
    }
    if (compactSql.startsWith('SELECT subtitle_url, seq, start_sec, end_sec, cue_text FROM asset_subtitle_cues')) {
      const [assetId, activeUrls, pattern, limit] = params;
      const needle = String(pattern || '').replace(/%/g, '');
      const rows = cues
        .filter((row) => row.asset_id === assetId && activeUrls.includes(row.subtitle_url))
        .filter((row) => row.norm_text.includes(needle))
        .slice(0, Number(limit) || 20);
      return { rowCount: rows.length, rows };
    }
    throw new Error(`Unexpected SQL in subtitle index test: ${compactSql}`);
  }
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseSubtitleTextSearchQuery(value) {
  const raw = normalizeText(value);
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

function parseTimestamp(raw) {
  const match = String(raw || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + (Number(match[4]) / 1000);
}

function parseSubtitleCues(content) {
  const lines = String(content || '').split(/\r?\n/);
  const out = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = String(lines[idx] || '');
    if (!line.includes('-->')) continue;
    const match = line.match(/^([^ ]+)\s+-->\s+([^ ]+)/);
    if (!match) continue;
    const startSec = parseTimestamp(match[1]);
    const endSec = parseTimestamp(match[2]);
    const cueText = String(lines[idx + 1] || '').trim();
    if (Number.isFinite(startSec) && Number.isFinite(endSec) && cueText) {
      out.push({ startSec, endSec, cueText });
    }
  }
  return out;
}

function formatTimecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  const ms = String(Math.floor((safe - Math.floor(safe)) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function levenshteinDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

const service = createSubtitleIndexService({
  pool,
  publicUploadUrlToAbsolutePath: (url) => path.join(uploadsDir, String(url || '').replace(/^\/uploads\//, '')),
  parseSubtitleCues,
  normalizeSubtitleSearchText: normalizeText,
  parseSubtitleTextSearchQuery,
  buildSubtitleCueSearchWhereSql,
  subtitleCueMatchesParsedQuery: (cueText, parsedQuery) => normalizeText(cueText).includes(parsedQuery.raw),
  formatTimecode,
  normalizeSubtitleLang: (value) => String(value || 'und').trim().toLowerCase(),
  resolveSubtitleActiveByLang: (dc, items) => {
    const stored = dc?.subtitleActiveByLang && typeof dc.subtitleActiveByLang === 'object'
      ? dc.subtitleActiveByLang
      : {};
    if (Object.keys(stored).length) return stored;
    return Object.fromEntries((Array.isArray(items) ? items : []).map((item) => [item.subtitleLang, item.subtitleUrl]));
  },
  levenshteinDistance
});

(async () => {
  const row = {
    id: 'asset-1',
    dc_metadata: {
      subtitleUrl: subtitleUrlTr,
      subtitleLang: 'tr',
      subtitleItems: [
        { subtitleUrl: subtitleUrlEnOld, subtitleLang: 'en', subtitleLabel: 'Old English' },
        { subtitleUrl: subtitleUrlEn, subtitleLang: 'en', subtitleLabel: 'English' },
        { subtitleUrl: subtitleUrlTr, subtitleLang: 'tr', subtitleLabel: 'Türkçe' }
      ],
      subtitleActiveByLang: {
        en: subtitleUrlEn,
        tr: subtitleUrlTr
      }
    }
  };

  const indexedCount = await service.syncSubtitleCueIndexForAssetRow(row);
  assert.strictEqual(indexedCount, 3, 'Subtitle cue index should include cues from every subtitle file');
  assert.strictEqual(cues.length, 3, 'Pool should receive inserted cues for active and inactive subtitles');

  const single = await service.searchSubtitleMatchesForAssetRow(row, 'istanbul', 20);
  assert.strictEqual(single.matches.length, 1, 'Expected one single-asset subtitle match');
  assert.strictEqual(single.matches[0].startSec, 1);
  assert.strictEqual(single.matches[0].startTc, '00:00:01.000');
  assert.strictEqual(single.matches[0].subtitleUrl, subtitleUrlTr);

  const fuzzySingle = await service.searchSubtitleMatchesForAssetRow(row, 'istambul', 20);
  assert.strictEqual(fuzzySingle.matches.length, 1, 'Expected fuzzy single-asset subtitle match');
  assert.strictEqual(fuzzySingle.subtitleUrl, subtitleUrlTr, 'Fuzzy single-asset result should expose subtitleUrl');
  assert.strictEqual(fuzzySingle.fuzzyUsed, true, 'Fuzzy single-asset path should be marked');

  const batch = await service.searchSubtitleMatchesForAssetRows([row], 'ankara', 8);
  const batchMatches = batch.byAssetId.get(row.id) || [];
  assert.strictEqual(batchMatches.length, 1, 'Expected one batch subtitle match');
  assert.strictEqual(batchMatches[0].startSec, 3);

  const englishBatch = await service.searchSubtitleMatchesForAssetRows([row], 'brain', 8);
  const englishMatches = englishBatch.byAssetId.get(row.id) || [];
  assert.strictEqual(englishMatches.length, 1, 'Inactive English subtitles should also be searchable');
  assert.strictEqual(englishMatches[0].subtitleUrl, subtitleUrlEn);
  assert.strictEqual(englishMatches[0].startSec, 5);

  const inactiveBatch = await service.searchSubtitleMatchesForAssetRows([row], 'archived', 8);
  const inactiveMatches = inactiveBatch.byAssetId.get(row.id) || [];
  assert.strictEqual(inactiveMatches.length, 0, 'Inactive subtitles for a language should not be searched');

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('subtitleIndexService OK');
})().catch((error) => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
