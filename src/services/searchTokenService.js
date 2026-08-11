function escapePostgresRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedSearchTokens(text) {
  return String(text || '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function reverseSearchToken(token) {
  return Array.from(String(token || '')).reverse().join('');
}

function reverseSearchTokens(text) {
  return normalizedSearchTokens(text).map(reverseSearchToken).join(' ');
}

function normalizedTextHasLongSuffixTerm(text, suffix) {
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedSuffix) return false;
  return normalizedSearchTokens(text).some((token) =>
    token.length > normalizedSuffix.length && token.endsWith(normalizedSuffix)
  );
}

function longSuffixPostgresRegex(suffix) {
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedSuffix) return '';
  return `(^|[[:space:][:punct:]])[^[:space:][:punct:]]+${escapePostgresRegex(normalizedSuffix)}([[:space:][:punct:]]|$)`;
}

module.exports = {
  escapePostgresRegex,
  normalizedSearchTokens,
  reverseSearchToken,
  reverseSearchTokens,
  normalizedTextHasLongSuffixTerm,
  longSuffixPostgresRegex
};
