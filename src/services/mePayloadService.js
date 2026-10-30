function createMePayloadService({
  resolveEffectivePermissions,
  getAdminSettings,
  normalizeAuthSessionSettings,
  assetAccessService,
  hasDocumentRightsAdminAccess,
  officeEditorProvider = 'onlyoffice',
  includeScopedTextAdmin = true
} = {}) {
  if (typeof resolveEffectivePermissions !== 'function') throw new Error('resolveEffectivePermissions is required');
  if (typeof getAdminSettings !== 'function') throw new Error('getAdminSettings is required');
  if (typeof normalizeAuthSessionSettings !== 'function') throw new Error('normalizeAuthSessionSettings is required');
  if (!assetAccessService || typeof assetAccessService.resolveAccessContext !== 'function') {
    throw new Error('assetAccessService is required');
  }
  if (typeof hasDocumentRightsAdminAccess !== 'function') throw new Error('hasDocumentRightsAdminAccess is required');

  function hasAuthenticatedIdentity(effective = {}) {
    return Boolean(String(effective.username || '').trim() || String(effective.email || '').trim());
  }

  async function buildMePayload(req) {
    const effective = await resolveEffectivePermissions(req);
    if (!hasAuthenticatedIdentity(effective)) {
      return { authenticated: false, payload: null };
    }

    const authSession = normalizeAuthSessionSettings((await getAdminSettings()).authSession);
    const accessContext = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
    const canAccessTextAdmin = Boolean(
      effective.canAccessTextAdmin
      || (includeScopedTextAdmin && assetAccessService.hasScopedAdminScopeAccess(accessContext, 'text-admin'))
    );
    const s3SharingEnabled = String(process.env.S3_SHARING_ENABLED || '').trim().toLowerCase() === 'true';
    const canAccessS3Sharing = Boolean(s3SharingEnabled && (
      effective.canAccessS3Sharing
      || assetAccessService.hasScopedAdminScopeAccess(accessContext, 's3-share')
    ));

    return {
      authenticated: true,
      payload: {
        username: effective.username,
        displayName: effective.displayName,
        email: effective.email || '',
        groups: effective.groups || [],
        roles: effective.roles || [],
        groupAdminGroups: accessContext.groupAdminGroups || [],
        isSuperAdmin: Boolean(effective.isSuperAdmin),
        isAdmin: effective.isAdmin,
        canAccessAdmin: effective.canAccessAdmin,
        canAccessTextAdmin,
        canAccessS3Sharing,
        s3SharingEnabled,
        canAccessMetadataAdmin: Boolean(effective.canAccessMetadataAdmin),
        canAccessAssetRightsAdmin: Boolean(
          effective.canAccessAdmin || assetAccessService.hasScopedAssetRightsAdminAccess(accessContext)
        ),
        canAccessDocumentRightsAdmin: hasDocumentRightsAdminAccess(effective, accessContext),
        canEditMetadata: effective.canEditMetadata,
        canEditOffice: effective.canEditOffice,
        canDeleteAssets: effective.canDeleteAssets,
        canUsePdfAdvancedTools: effective.canUsePdfAdvancedTools,
        canAccessAdvancedSearch: Boolean(effective.canAccessAdvancedSearch),
        allowedAssetTypes: assetAccessService.getAllowedAssetTypeGroups(accessContext),
        uploadAllowedAssetTypes: assetAccessService.getAllowedUploadAssetTypeGroups(accessContext),
        officeEditorProvider,
        permissionKeys: effective.permissionKeys,
        deniedPermissionKeys: effective.deniedPermissionKeys || [],
        authSession: {
          clientIdleMinutes: authSession.clientIdleMinutes,
          clientMaxHours: authSession.clientMaxHours
        }
      }
    };
  }

  return {
    buildMePayload,
    hasAuthenticatedIdentity
  };
}

module.exports = {
  createMePayloadService
};
