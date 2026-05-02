function createSubtitleService(deps = {}) {
  const {
    normalizeOcrText,
    normalizeComparableOcr,
    parseSearchTokens,
    exactNormalizedTextRegex,
    normalizedTextHasExactTerm
  } = deps;
  const normalizeCueText = typeof normalizeOcrText === 'function'
    ? normalizeOcrText
    : (value) => String(value || '').replace(/\s+/g, ' ').trim();

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
      const cueText = normalizeCueText(textLines.join(' '));
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec && cueText) {
        cues.push({ startSec, endSec, cueText });
      }
      while (i < lines.length && !String(lines[i] || '').trim()) i += 1;
    }
    return cues;
  }

  function normalizeSubtitleSearchText(value) {
    return normalizeComparableOcr(value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseSubtitleTextSearchQuery(value) {
    return parseSearchTokens(value, normalizeSubtitleSearchText);
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

  function findSubtitleMatchesInText(text, query, limit = 1) {
    const parsedQuery = parseSubtitleTextSearchQuery(query);
    if (!parsedQuery.raw) return [];
    return parseSubtitleCues(text)
      .filter((cue) => subtitleCueMatchesParsedQuery(cue.cueText, parsedQuery))
      .slice(0, Math.max(1, Number(limit) || 1));
  }

  return {
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
  };
}

module.exports = {
  createSubtitleService
};
