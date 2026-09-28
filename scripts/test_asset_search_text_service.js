const assert = require('assert');
const {
  collectSearchableDcTexts,
  buildSearchableDcSql
} = require('../src/services/assetSearchTextService');

const dcMetadata = {
  title: 'Magna Carta',
  subject: 'freedom history',
  identifier: 'Magna Carta.mp4',
  source: '/app/uploads/random-kant-path/video.mp4',
  subtitleUrl: '/uploads/subtitles/kant.vtt',
  subtitleItems: [{ id: 'XWiGKAnTi-p9XUdSkgxRd', subtitleLabel: 'technical-kant' }],
  videoOcrItems: [{ id: 'kant-technical-id' }]
};

const texts = collectSearchableDcTexts(dcMetadata);
assert.deepStrictEqual(texts, ['Magna Carta', 'freedom history', 'Magna Carta.mp4']);
assert.ok(!texts.join(' ').toLowerCase().includes('technical-kant'));
assert.ok(!texts.join(' ').includes('XWiGKAnTi'));

const sql = buildSearchableDcSql('dc_metadata');
assert.ok(sql.includes("dc_metadata->>'title'"));
assert.ok(sql.includes("dc_metadata->>'identifier'"));
assert.ok(!sql.includes('subtitleItems'));
assert.throws(() => buildSearchableDcSql('dc_metadata; DROP TABLE assets'));

console.log('assetSearchTextService OK');
