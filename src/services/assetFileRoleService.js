function validateFileRole(role, mimeType, baseMimeType) {
  if (!['version', 'attachment'].includes(role)) return 'Invalid file role';
  const normalize = (value) => String(value || '').split(';')[0].trim().toLowerCase();
  if (role === 'version' && normalize(mimeType) !== normalize(baseMimeType)) {
    return 'Yeni versiyon aynı MIME türünde olmalı. Farklı tür için Ek dosya seçin.';
  }
  return '';
}

module.exports = { validateFileRole };
