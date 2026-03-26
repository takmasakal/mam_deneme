const PERMISSION_DEFINITIONS = [
  {
    key: 'admin.access',
    legacyField: 'adminPageAccess',
    roleNames: ['mam-admin', 'mam-admin-access'],
    labelKey: 'perm_admin_access'
  },
  {
    key: 'metadata.edit',
    legacyField: 'metadataEdit',
    roleNames: ['mam-metadata-edit'],
    labelKey: 'perm_metadata_edit'
  },
  {
    key: 'office.edit',
    legacyField: 'officeEdit',
    roleNames: ['mam-office-edit'],
    labelKey: 'perm_office_edit'
  },
  {
    key: 'asset.delete',
    legacyField: 'assetDelete',
    roleNames: ['mam-asset-delete'],
    labelKey: 'perm_asset_delete'
  },
  {
    key: 'pdf.advanced',
    legacyField: 'pdfAdvancedTools',
    roleNames: ['mam-pdf-advanced'],
    labelKey: 'perm_pdf_advanced'
  }
];

const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((item) => item.key);
const SUPER_ADMIN_ROLE_NAMES = ['admin', 'realm-admin', 'mam-super-admin'];
const SUPER_ADMIN_USERNAMES = ['admin', 'mamadmin'];

function normalizePrincipalNames(values) {
  return (Array.isArray(values) ? values : [])
    .flatMap((value) => String(value || '').split(/[,\s]+/))
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function getPermissionDefinitionsPayload() {
  return PERMISSION_DEFINITIONS.map((item) => ({
    key: item.key,
    legacyField: item.legacyField,
    labelKey: item.labelKey,
    roleNames: [...item.roleNames]
  }));
}

function resolvePermissionKeysFromPrincipals({ username = '', groups = [], roles = [] } = {}) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const principalNames = new Set([
    ...normalizePrincipalNames(groups),
    ...normalizePrincipalNames(roles)
  ]);
  const permissionKeys = new Set();
  const isSuperAdmin =
    SUPER_ADMIN_USERNAMES.includes(normalizedUsername)
    || [...principalNames].some((name) => SUPER_ADMIN_ROLE_NAMES.includes(name));

  if (isSuperAdmin) {
    PERMISSION_KEYS.forEach((key) => permissionKeys.add(key));
  }

  PERMISSION_DEFINITIONS.forEach((definition) => {
    if (definition.roleNames.some((roleName) => principalNames.has(roleName))) {
      permissionKeys.add(definition.key);
    }
  });

  return {
    permissionKeys: Array.from(permissionKeys),
    isSuperAdmin
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
  return {
    permissionKeys,
    ...permissionKeysToLegacyFlags(permissionKeys)
  };
}

function isAdminName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPER_ADMIN_USERNAMES.includes(normalized);
}

function isAdminByGroupsOrRoles(groupsOrRoles) {
  return normalizePrincipalNames(groupsOrRoles)
    .some((name) => SUPER_ADMIN_ROLE_NAMES.includes(name) || name === 'mam-admin' || name === 'mam-admin-access');
}

module.exports = {
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  normalizePrincipalNames,
  getPermissionDefinitionsPayload,
  resolvePermissionKeysFromPrincipals,
  permissionKeysToLegacyFlags,
  normalizePermissionEntry,
  isAdminName,
  isAdminByGroupsOrRoles
};
