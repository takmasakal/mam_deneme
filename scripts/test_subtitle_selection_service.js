const assert = require('assert');
const {
  subtitleLanguageKey,
  resolveSubtitleActiveByLang,
  setActiveSubtitleForLanguage
} = require('../src/services/subtitleSelectionService');

const items = [
  { subtitleUrl: '/tr-1.vtt', subtitleLang: 'tr' },
  { subtitleUrl: '/tr-2.vtt', subtitleLang: 'tur-TR' },
  { subtitleUrl: '/en-1.vtt', subtitleLang: 'en-US' },
  { subtitleUrl: '/en-2.vtt', subtitleLang: 'eng' }
];

assert.strictEqual(subtitleLanguageKey('tur-TR'), 'tr');
assert.strictEqual(subtitleLanguageKey('EN_us'), 'en');
assert.deepStrictEqual(
  resolveSubtitleActiveByLang({ subtitleUrl: '/tr-1.vtt', subtitleLang: 'tr' }, items),
  { tr: '/tr-1.vtt', en: '/en-2.vtt' }
);
assert.deepStrictEqual(
  resolveSubtitleActiveByLang({
    subtitleUrl: '/tr-1.vtt',
    subtitleLang: 'tr',
    subtitleActiveByLang: { tr: '/tr-2.vtt', en: '/en-1.vtt', de: '/missing.vtt' }
  }, items),
  { tr: '/tr-1.vtt', en: '/en-1.vtt' }
);
assert.deepStrictEqual(
  setActiveSubtitleForLanguage({ tr: '/tr-1.vtt' }, items[2]),
  { tr: '/tr-1.vtt', en: '/en-1.vtt' }
);

console.log('subtitleSelectionService tests passed');
