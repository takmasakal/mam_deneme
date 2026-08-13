function createEffectivePermissionService({
  permissionKeys = [],
  normalizeIdentityKey,
  normalizePermissionEntry,
  permissionKeysToLegacyFlags,
  buildUserContextFromRequest,
  enrichUserProfileFromKeycloak,
  getUserPermissionsSettings,
  assetAccessService,
  documentRightsAdminGroups = []
} = {}) {
  if (typeof normalizeIdentityKey !== 'function') throw new Error('normalizeIdentityKey is required');
  if (typeof normalizePermissionEntry !== 'function') throw new Error('normalizePermissionEntry is required');
  if (typeof permissionKeysToLegacyFlags !== 'function') throw new Error('permissionKeysToLegacyFlags is required');
  if (typeof buildUserContextFromRequest !== 'function') throw new Error('buildUserContextFromRequest is required');
  if (typeof enrichUserProfileFromKeycloak !== 'function') throw new Error('enrichUserProfileFromKeycloak is required');
  if (typeof getUserPermissionsSettings !== 'function') throw new Error('getUserPermissionsSettings is required');

  const allPermissionKeys = Array.isArray(permissionKeys) ? permissionKeys : [];
  const documentAdminGroups = (Array.isArray(documentRightsAdminGroups) ? documentRightsAdminGroups : [])
    .map((value) => normalizeIdentityKey(String(value || '').replace(/^\/+/, '').trim()))
    .filter(Boolean);

  function getPermissionOverrideForUser(settings, user) {
    const entries = settings && typeof settings === 'object' ? settings : {};
    const userEntries = entries.users && typeof entries.users === 'object' && !Array.isArray(entries.users)
      ? entries.users
      : {};
    const legacyEntries = Object.fromEntries(
      Object.entries(entries).filter(([key]) => !['users', 'groups'].includes(String(key || '').trim()))
    );
    const mergedEntries = { ...legacyEntries, ...userEntries };
    const candidates = [
      user?.username,
      user?.email,
      String(user?.email || '').includes('@') ? String(user.email).split('@')[0] : '',
      user?.displayName
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const exactKey = candidate.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(mergedEntries, exactKey)) return mergedEntries[exactKey];
    }

    const normalizedEntries = new Map();
    Object.entries(mergedEntries).forEach(([key, value]) => {
      const normalized = normalizeIdentityKey(key);
      if (normalized && !normalizedEntries.has(normalized)) normalizedEntries.set(normalized, value);
    });

    for (const candidate of candidates) {
      const normalized = normalizeIdentityKey(candidate);
      if (normalizedEntries.has(normalized)) return normalizedEntries.get(normalized);
    }
    return null;
  }

  function getPermissionOverridesForGroups(settings, user) {
    const entries = settings && typeof settings === 'object' ? settings : {};
    const groupEntries = entries.groups && typeof entries.groups === 'object' && !Array.isArray(entries.groups)
      ? entries.groups
      : {};
    const groups = Array.isArray(user?.groups) ? user.groups : [];
    const candidates = groups
      .flatMap((group) => {
        const raw = String(group || '').trim();
        const withoutSlash = raw.replace(/^\/+/, '');
        const last = withoutSlash.split('/').filter(Boolean).pop() || '';
        return [raw, withoutSlash, last];
      })
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const normalizedEntries = new Map();
    Object.entries(groupEntries).forEach(([key, value]) => {
      const normalized = normalizeIdentityKey(String(key || '').replace(/^\/+/, ''));
      if (normalized && !normalizedEntries.has(normalized)) normalizedEntries.set(normalized, value);
    });
    return candidates
      .map((candidate) => normalizeIdentityKey(String(candidate || '').replace(/^\/+/, '')))
      .filter(Boolean)
      .filter((candidate, index, list) => list.indexOf(candidate) === index)
      .map((candidate) => normalizedEntries.get(candidate))
      .filter(Boolean);
  }

  function hasDocumentRightsAdminAccess(effective = {}, accessContext = {}) {
    if (effective?.isSuperAdmin || effective?.canAccessAdmin || accessContext?.canManageAllAssetVisibility) return true;
    if (
      Array.isArray(effective?.permissionKeys)
      && effective.permissionKeys.includes('document.rights.admin')
      && assetAccessService?.hasScopedAdminScopeAccess?.(accessContext, 'document-rights', 'document')
    ) {
      return true;
    }
    const groups = []
      .concat(effective?.groups || [])
      .concat(accessContext?.groupAdminGroups || [])
      .map((value) => normalizeIdentityKey(String(value || '').replace(/^\/+/, '').split('/').filter(Boolean).pop() || value))
      .filter(Boolean);
    return groups.some((group) => documentAdminGroups.includes(group));
  }

  async function resolveEffectivePermissions(req) {
    if (req?.__mamEffectivePermissions) return req.__mamEffectivePermissions;
    const user = await enrichUserProfileFromKeycloak(buildUserContextFromRequest(req));
    const settings = await getUserPermissionsSettings();
    const override = getPermissionOverrideForUser(settings, user);
    const groupOverrides = getPermissionOverridesForGroups(settings, user);
    const basePermissionKeys = user.baseIsSuperAdmin
      ? allPermissionKeys
      : (user.basePermissionKeys || []);
    const groupPermissionKeys = new Set(basePermissionKeys);
    groupOverrides.forEach((entry) => {
      normalizePermissionEntry(entry, []).permissionKeys.forEach((key) => groupPermissionKeys.add(key));
    });
    const userOverride = override ? normalizePermissionEntry(override, []) : null;
    (userOverride?.permissionKeys || []).forEach((key) => groupPermissionKeys.add(key));
    if (!user.baseIsSuperAdmin) {
      (userOverride?.deniedPermissionKeys || []).forEach((key) => groupPermissionKeys.delete(key));
    }
    const effective = normalizePermissionEntry(null, Array.from(groupPermissionKeys));
    if (user.baseIsSuperAdmin) {
      effective.permissionKeys = allPermissionKeys;
      Object.assign(effective, permissionKeysToLegacyFlags(allPermissionKeys));
    }
    const isSuperAdmin = allPermissionKeys.every((key) => effective.permissionKeys.includes(key));
    const canAccessAdmin = Boolean(effective.adminPageAccess);
    const canAccessTextAdmin = Boolean(effective.textAdminAccess || canAccessAdmin);
    const canEditOffice = Boolean(effective.officeEdit || canAccessAdmin);
    const canAccessAdvancedSearch = Boolean(effective.advancedSearchAccess);
    const effectiveUser = {
      ...user,
      isSuperAdmin,
      isAdmin: canAccessAdmin,
      canAccessAdmin,
      canAccessTextAdmin,
      canEditMetadata: Boolean(effective.metadataEdit),
      canEditOffice,
      canDeleteAssets: Boolean(effective.assetDelete),
      canUsePdfAdvancedTools: Boolean(effective.pdfAdvancedTools),
      canAccessAdvancedSearch,
      permissions: effective,
      permissionKeys: effective.permissionKeys,
      deniedPermissionKeys: userOverride?.deniedPermissionKeys || []
    };
    if (req && typeof req === 'object') req.__mamEffectivePermissions = effectiveUser;
    return effectiveUser;
  }

  return {
    getPermissionOverrideForUser,
    getPermissionOverridesForGroups,
    hasDocumentRightsAdminAccess,
    resolveEffectivePermissions
  };
}

module.exports = {
  createEffectivePermissionService
};
