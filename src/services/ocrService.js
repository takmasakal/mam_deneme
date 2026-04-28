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

module.exports = {
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
};
