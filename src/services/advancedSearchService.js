const ADVANCED_SEARCH_FIELDS = Object.freeze(['q', 'ocrQ', 'subtitleQ', 'tag', 'type']);
const ADVANCED_SEARCH_FIELD_SET = new Set(ADVANCED_SEARCH_FIELDS);

function normalizeFieldList(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((field) => String(field || '').trim())
      .filter((field) => ADVANCED_SEARCH_FIELD_SET.has(field))
  ));
}

function parseAdvancedSearchDefinition(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const parsed = typeof rawValue === 'object' && rawValue !== null
    ? rawValue
    : JSON.parse(raw);
  return {
    and: normalizeFieldList(parsed?.and),
    or: normalizeFieldList(parsed?.or),
    values: parsed?.values && typeof parsed.values === 'object' ? parsed.values : {}
  };
}

function getActiveFields(definition, valuesByField) {
  if (!definition) return { and: [], or: [] };
  const hasValue = (field) => String(valuesByField?.[field] || '').trim().length > 0;
  return {
    and: definition.and.filter(hasValue),
    or: definition.or.filter(hasValue)
  };
}

function assetId(row) {
  return String(row?.id || '').trim();
}

/**
 * Applies the user-defined boolean groups to field-specific search results.
 * The caller owns the data access for each field; this service only handles
 * definition validation, set algebra, and optional result annotation.
 */
function createAdvancedSearchService() {
  async function search({ definition, valuesByField, rows = [], matchField, annotate }) {
    const activeFields = getActiveFields(definition, valuesByField);
    const active = Boolean(activeFields.and.length || activeFields.or.length);
    if (!active) return { rows, total: rows.length, active: false, ...activeFields };

    const matchSets = new Map();
    for (const field of Array.from(new Set([...activeFields.and, ...activeFields.or]))) {
      const value = String(valuesByField?.[field] || '').trim();
      const matchedRows = await matchField(field, value, rows);
      matchSets.set(field, new Set((matchedRows || []).map(assetId).filter(Boolean)));
    }

    const matchesAll = (row) => activeFields.and.every(
      (field) => matchSets.get(field)?.has(assetId(row))
    );
    const matchesAny = (row) => activeFields.or.some(
      (field) => matchSets.get(field)?.has(assetId(row))
    );
    const andRows = activeFields.and.length ? rows.filter(matchesAll) : [];
    const orRows = activeFields.or.length ? rows.filter(matchesAny) : [];
    const allowedIds = new Set((activeFields.and.length ? andRows : orRows).map(assetId));
    if (activeFields.and.length && activeFields.or.length) {
      orRows.forEach((row) => allowedIds.add(assetId(row)));
    }
    const filteredRows = rows.filter((row) => allowedIds.has(assetId(row)));
    if (typeof annotate === 'function') {
      await annotate(filteredRows, { valuesByField, activeFields });
    }

    return {
      rows: filteredRows,
      total: filteredRows.length,
      active: true,
      ...activeFields
    };
  }

  return {
    fields: ADVANCED_SEARCH_FIELDS,
    parseDefinition: parseAdvancedSearchDefinition,
    search
  };
}

module.exports = {
  ADVANCED_SEARCH_FIELDS,
  createAdvancedSearchService,
  normalizeFieldList,
  parseAdvancedSearchDefinition
};
