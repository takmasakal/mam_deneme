const SEARCHABLE_DC_KEYS = Object.freeze([
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
  'language',
  'relation',
  'coverage',
  'rights'
]);

function collectSearchableDcTexts(dcMetadata) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  return SEARCHABLE_DC_KEYS.flatMap((key) => {
    const value = dc[key];
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== null && item !== undefined && typeof item !== 'object')
        .map((item) => String(item).trim())
        .filter(Boolean);
    }
    if (value === null || value === undefined || typeof value === 'object') return [];
    const text = String(value).trim();
    return text ? [text] : [];
  });
}

function buildSearchableDcSql(columnName = 'dc_metadata') {
  const safeColumn = String(columnName || '').trim();
  if (!/^[a-z_][a-z0-9_.]*$/i.test(safeColumn)) {
    throw new Error('Invalid DC metadata SQL column');
  }
  const values = SEARCHABLE_DC_KEYS.map((key) => `COALESCE(${safeColumn}->>'${key}', '')`);
  return `concat_ws(' ', ${values.join(', ')})`;
}

module.exports = {
  SEARCHABLE_DC_KEYS,
  collectSearchableDcTexts,
  buildSearchableDcSql
};
