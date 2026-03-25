const { pool } = require('../src/db');

function normalizeOcrEngine(value) {
  void value;
  return 'paddle';
}

function sanitizeVideoOcrItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const ocrUrl = String(item.ocrUrl || '').trim();
      if (!ocrUrl) return null;
      return {
        id: String(item.id || '').trim() || `migrated_${Math.random().toString(36).slice(2)}`,
        ocrUrl,
        ocrLabel: String(item.ocrLabel || '').trim(),
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
  return text.replace(/\s+/g, '').toUpperCase() || fallback;
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
    return '00000000';
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

async function main() {
  const result = await pool.query(`
    SELECT id, title, file_name, created_at, updated_at, dc_metadata
    FROM assets
    WHERE COALESCE(type, '') ILIKE 'video'
       OR (dc_metadata ? 'videoOcrItems')
       OR (COALESCE(dc_metadata->>'videoOcrUrl', '') <> '')
  `);

  let changedAssets = 0;
  let changedLabels = 0;

  for (const row of result.rows) {
    const dc = row.dc_metadata && typeof row.dc_metadata === 'object' ? row.dc_metadata : {};
    let items = sanitizeVideoOcrItems(dc.videoOcrItems);
    if (!items.length && String(dc.videoOcrUrl || '').trim()) {
      items = [{
        id: '__legacy_active__',
        ocrUrl: String(dc.videoOcrUrl || '').trim(),
        ocrLabel: String(dc.videoOcrLabel || '').trim(),
        ocrEngine: normalizeOcrEngine(dc.videoOcrEngine || 'paddle'),
        lineCount: Math.max(0, Number(dc.videoOcrLineCount) || 0),
        segmentCount: Math.max(0, Number(dc.videoOcrSegmentCount) || 0),
        createdAt: String(row.updated_at || row.created_at || new Date().toISOString())
      }];
    }
    if (!items.length) continue;

    const relabeled = items.map((item, index) => ({
      ...item,
      ocrLabel: buildOcrDisplayLabel({
        assetTitle: String(row.title || ''),
        fileName: String(row.file_name || ''),
        createdAt: item.createdAt || row.updated_at || row.created_at,
        engine: item.ocrEngine,
        version: index + 1
      })
    }));

    const hasDiff = relabeled.some((item, index) => item.ocrLabel !== items[index]?.ocrLabel);
    if (!hasDiff) continue;

    changedAssets += 1;
    changedLabels += relabeled.length;
    const activeUrl = String(dc.videoOcrUrl || '').trim();
    const activeItem = relabeled.find((item) => String(item.ocrUrl || '').trim() === activeUrl) || relabeled[relabeled.length - 1] || null;
    const updatedDc = {
      ...dc,
      videoOcrItems: relabeled,
      videoOcrUrl: activeItem ? String(activeItem.ocrUrl || '').trim() : '',
      videoOcrLabel: activeItem ? String(activeItem.ocrLabel || '').trim() : '',
      videoOcrEngine: activeItem ? String(activeItem.ocrEngine || '').trim() : '',
      videoOcrLineCount: activeItem ? Math.max(0, Number(activeItem.lineCount) || 0) : 0,
      videoOcrSegmentCount: activeItem ? Math.max(0, Number(activeItem.segmentCount) || 0) : 0
    };
    await pool.query(
      'UPDATE assets SET dc_metadata = $2::jsonb, updated_at = $3 WHERE id = $1',
      [row.id, JSON.stringify(updatedDc), new Date().toISOString()]
    );
  }

  console.log(JSON.stringify({ ok: true, changedAssets, changedLabels }));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch (_error) {}
  process.exit(1);
});
