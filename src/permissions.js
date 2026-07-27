const PERMISSION_DEFINITIONS = [
  {
    key: 'admin.access',
    legacyField: 'adminPageAccess',
    labelKey: 'perm_admin_access'
  },
  {
    key: 'metadata.edit',
    legacyField: 'metadataEdit',
    labelKey: 'perm_metadata_edit'
  },
  {
    key: 'office.edit',
    legacyField: 'officeEdit',
    labelKey: 'perm_office_edit'
  },
  {
    key: 'asset.delete',
    legacyField: 'assetDelete',
    labelKey: 'perm_asset_delete'
  },
  {
    key: 'pdf.advanced',
    legacyField: 'pdfAdvancedTools',
    labelKey: 'perm_pdf_advanced'
  },
  {
    key: 'text.admin',
    legacyField: 'textAdminAccess',
    labelKey: 'perm_text_admin'
  },
  {
    key: 'document.rights.admin',
    legacyField: 'documentRightsAdminAccess',
    labelKey: 'perm_document_rights_admin'
  },
  {
    key: 'advanced.search',
    legacyField: 'advancedSearchAccess',
    labelKey: 'perm_advanced_search'
  }
];

const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((item) => item.key);
const PRINCIPAL_PERMISSION_MAP = {
  superadmin: PERMISSION_KEYS,
  'super admin': PERMISSION_KEYS,
  'super-admin': PERMISSION_KEYS,
  super_admin: PERMISSION_KEYS,
  admin: ['admin.access'],
  'standart yönetici': ['admin.access'],
  'standart yonetici': ['admin.access'],
  altyazı_ocr_operator: ['text.admin'],
  altyazi_ocr_operator: ['text.admin']
};

function normalizePrincipalNames(values) {
  return (Array.isArray(values) ? values : [])
    .flatMap((value) => String(value || '').split(','))
    .flatMap((value) => {
      const normalized = String(value || '').trim().toLowerCase();
      const withoutSlash = normalized.replace(/^\/+/, '');
      const lastPathSegment = withoutSlash.split('/').filter(Boolean).pop() || '';
      return Array.from(new Set([
        normalized,
        withoutSlash,
        lastPathSegment
      ])).filter(Boolean);
    })
    .filter(Boolean);
}

function getPermissionDefinitionsPayload() {
  return PERMISSION_DEFINITIONS.map((item) => ({
    key: item.key,
    legacyField: item.legacyField,
    labelKey: item.labelKey
  }));
}

function resolvePermissionKeysFromPrincipals({ groups = [], roles = [] } = {}) {
  const principals = normalizePrincipalNames([...groups, ...roles]);
  const keys = new Set();
  principals.forEach((principal) => {
    const mapped = PRINCIPAL_PERMISSION_MAP[principal] || [];
    mapped.forEach((key) => keys.add(key));
  });
  const permissionKeys = PERMISSION_KEYS.filter((key) => keys.has(key));
  return {
    permissionKeys,
    isSuperAdmin: PERMISSION_KEYS.every((key) => keys.has(key))
  };
}

function permissionKeysToLegacyFlags(keys) {
  const activeKeys = new Set(Array.isArray(keys) ? keys : []);
  const result = {};
  PERMISSION_DEFINITIONS.forEach((definition) => {
    result[definition.legacyField] = activeKeys.has(definition.key);
  });
  return result;
}

function normalizeDeniedPermissionKeys(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const deniedKeys = new Set();
  if (Array.isArray(raw.deniedPermissionKeys)) {
    raw.deniedPermissionKeys.forEach((key) => {
      const normalized = String(key || '').trim();
      if (PERMISSION_KEYS.includes(normalized)) deniedKeys.add(normalized);
    });
  }
  if (raw.deniedPermissions && typeof raw.deniedPermissions === 'object') {
    Object.entries(raw.deniedPermissions).forEach(([key, value]) => {
      const normalized = String(key || '').trim();
      if (!PERMISSION_KEYS.includes(normalized)) return;
      if (value === true || value === 1 || String(value).trim().toLowerCase() === 'true') deniedKeys.add(normalized);
    });
  }
  return PERMISSION_KEYS.filter((key) => deniedKeys.has(key));
}

function normalizePermissionEntry(input, fallbackPermissions) {
  const raw = input && typeof input === 'object' ? input : {};
  const toBool = (value, fallback) => {
    if (value == null) return Boolean(fallback);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (!text) return Boolean(fallback);
    if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'off', 'null', 'undefined'].includes(text)) return false;
    return Boolean(fallback);
  };
  const fallbackSet = new Set(
    Array.isArray(fallbackPermissions)
      ? fallbackPermissions
      : (fallbackPermissions ? PERMISSION_KEYS : [])
  );
  const explicitKeys = new Set();

  if (Array.isArray(raw.permissionKeys)) {
    raw.permissionKeys.forEach((key) => {
      const normalized = String(key || '').trim();
      if (PERMISSION_KEYS.includes(normalized)) explicitKeys.add(normalized);
    });
  }

  if (raw.permissions && typeof raw.permissions === 'object') {
    Object.entries(raw.permissions).forEach(([key, value]) => {
      const normalized = String(key || '').trim();
      if (!PERMISSION_KEYS.includes(normalized)) return;
      if (toBool(value, fallbackSet.has(normalized))) explicitKeys.add(normalized);
      else explicitKeys.delete(normalized);
    });
  }

  PERMISSION_DEFINITIONS.forEach((definition) => {
    if (!Object.prototype.hasOwnProperty.call(raw, definition.legacyField)) return;
    if (toBool(raw[definition.legacyField], fallbackSet.has(definition.key))) explicitKeys.add(definition.key);
    else explicitKeys.delete(definition.key);
  });

  const mergedKeys = new Set(fallbackSet);
  if (
    Array.isArray(raw.permissionKeys)
    || (raw.permissions && typeof raw.permissions === 'object')
    || PERMISSION_DEFINITIONS.some((definition) => Object.prototype.hasOwnProperty.call(raw, definition.legacyField))
  ) {
    mergedKeys.clear();
    explicitKeys.forEach((key) => mergedKeys.add(key));
  }

  const permissionKeys = PERMISSION_KEYS.filter((key) => mergedKeys.has(key));
  const deniedPermissionKeys = normalizeDeniedPermissionKeys(raw);
  return {
    permissionKeys,
    deniedPermissionKeys,
    ...permissionKeysToLegacyFlags(permissionKeys)
  };
}

module.exports = {
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  normalizePrincipalNames,
  getPermissionDefinitionsPayload,
  resolvePermissionKeysFromPrincipals,
  permissionKeysToLegacyFlags,
  normalizeDeniedPermissionKeys,
  normalizePermissionEntry
};
