const assert = require('assert');
const { createAdvancedSearchService } = require('../src/services/advancedSearchService');

const rows = [
  { id: 'video-match', type: 'video', terms: ['istanbul'] },
  { id: 'video-other', type: 'video', terms: ['ankara'] },
  { id: 'document-match', type: 'document', terms: ['istanbul'] },
  { id: 'photo-match', type: 'photo', terms: ['istanbul'] }
];

async function search(definition, valuesByField) {
  return createAdvancedSearchService().search({
    definition,
    valuesByField,
    rows,
    matchField: async (field, value, candidates) => {
      if (field === 'type') {
        const types = new Set(String(value).split(','));
        return candidates.filter((row) => types.has(row.type));
      }
      return candidates.filter((row) => row.terms.includes(String(value).toLowerCase()));
    }
  });
}

async function run() {
  const videoMatches = await search(
    { and: [], or: ['q', 'type'], values: {} },
    { q: 'istanbul', type: 'video' }
  );
  assert.deepStrictEqual(videoMatches.rows.map((row) => row.id), ['video-match']);

  const documentMatches = await search(
    { and: ['q', 'type'], or: [], values: {} },
    { q: 'istanbul', type: 'document' }
  );
  assert.deepStrictEqual(documentMatches.rows.map((row) => row.id), ['document-match']);

  const multipleTypes = await search(
    { and: [], or: ['q', 'type'], values: {} },
    { q: 'istanbul', type: 'video,photo' }
  );
  assert.deepStrictEqual(multipleTypes.rows.map((row) => row.id), ['video-match', 'photo-match']);

  const typeOnly = await search(
    { and: [], or: ['type'], values: {} },
    { type: 'video' }
  );
  assert.deepStrictEqual(typeOnly.rows.map((row) => row.id), ['video-match', 'video-other']);

  process.stdout.write('advanced search service tests passed\n');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
