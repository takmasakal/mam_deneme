function subtitleLanguageKey(value) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  if (!normalized) return '';
  const primary = normalized.split('-')[0];
  if (primary === 'tr' || primary === 'tur') return 'tr';
  if (primary === 'en' || primary === 'eng') return 'en';
  return primary.replace(/[^a-z0-9]/g, '').slice(0, 12);
}

function resolveSubtitleActiveByLang(dcMetadata = {}, subtitleItems = []) {
  const dc = dcMetadata && typeof dcMetadata === 'object' ? dcMetadata : {};
  const items = Array.isArray(subtitleItems) ? subtitleItems.filter(Boolean) : [];
  const itemByUrl = new Map();
  const activeByLang = {};

  items.forEach((item) => {
    const subtitleUrl = String(item?.subtitleUrl || '').trim();
    const langKey = subtitleLanguageKey(item?.subtitleLang);
    if (!subtitleUrl || !langKey) return;
    itemByUrl.set(subtitleUrl, item);
    // Existing assets without a language map use the newest item per language.
    activeByLang[langKey] = subtitleUrl;
  });

  const stored = dc.subtitleActiveByLang && typeof dc.subtitleActiveByLang === 'object'
    ? dc.subtitleActiveByLang
    : {};
  Object.entries(stored).forEach(([lang, value]) => {
    const langKey = subtitleLanguageKey(lang);
    const subtitleUrl = String(value || '').trim();
    const item = itemByUrl.get(subtitleUrl);
    if (!langKey || !item || subtitleLanguageKey(item.subtitleLang) !== langKey) return;
    activeByLang[langKey] = subtitleUrl;
  });

  const globalUrl = String(dc.subtitleUrl || '').trim();
  const globalItem = itemByUrl.get(globalUrl);
  const globalLang = subtitleLanguageKey(globalItem?.subtitleLang || dc.subtitleLang);
  if (globalUrl && globalLang && globalItem) activeByLang[globalLang] = globalUrl;
  return activeByLang;
}

function setActiveSubtitleForLanguage(activeByLang = {}, subtitleItem = {}) {
  const next = { ...(activeByLang && typeof activeByLang === 'object' ? activeByLang : {}) };
  const langKey = subtitleLanguageKey(subtitleItem?.subtitleLang);
  const subtitleUrl = String(subtitleItem?.subtitleUrl || '').trim();
  if (langKey && subtitleUrl) next[langKey] = subtitleUrl;
  return next;
}

module.exports = {
  subtitleLanguageKey,
  resolveSubtitleActiveByLang,
  setActiveSubtitleForLanguage
};
