function createAuthMiddlewareService({
  resolveEffectivePermissions,
  assetAccessService,
  hasDocumentRightsAdminAccess,
  includeScopedTextAdmin = true,
  allowGroupAdminAssetRightsFallback = false
} = {}) {
  if (typeof resolveEffectivePermissions !== 'function') throw new Error('resolveEffectivePermissions is required');
  if (!assetAccessService || typeof assetAccessService.resolveAccessContext !== 'function') {
    throw new Error('assetAccessService is required');
  }
  if (typeof hasDocumentRightsAdminAccess !== 'function') throw new Error('hasDocumentRightsAdminAccess is required');

  async function loadEffective(req) {
    const effective = await resolveEffectivePermissions(req);
    req.userPermissions = effective;
    return effective;
  }

  function forbidden(res) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  async function requireAdminAccess(req, res, next) {
    try {
      const effective = await loadEffective(req);
      if (!effective.canAccessAdmin) return forbidden(res);
      return next();
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to verify admin permissions' });
    }
  }

  async function requireTextAdminAccess(req, res, next) {
    try {
      const effective = await loadEffective(req);
      const accessContext = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
      const canAccessTextAdmin = Boolean(
        effective.canAccessTextAdmin
        || (includeScopedTextAdmin && assetAccessService.hasScopedAdminScopeAccess(accessContext, 'text-admin'))
      );
      if (!canAccessTextAdmin) return forbidden(res);
      return next();
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to verify text admin permissions' });
    }
  }

  async function requireScopedDocumentRightsAccess(req, res, next) {
    try {
      const effective = await loadEffective(req);
      const accessContext = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
      if (hasDocumentRightsAdminAccess(effective, accessContext)) return next();
      return forbidden(res);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to verify document rights admin permissions' });
    }
  }

  async function requireScopedAssetRightsAccess(req, res, next) {
    try {
      const effective = await loadEffective(req);
      if (effective.canAccessAdmin) return next();
      const accessContext = await assetAccessService.resolveAccessContext(req, resolveEffectivePermissions);
      if (assetAccessService.hasScopedAssetRightsAdminAccess(accessContext)) return next();
      if (allowGroupAdminAssetRightsFallback && typeof assetAccessService.getGroupAdminGroupsForUser === 'function') {
        const groupAdminGroups = await assetAccessService.getGroupAdminGroupsForUser(effective).catch(() => []);
        if (Array.isArray(groupAdminGroups) && groupAdminGroups.length) return next();
      }
      return forbidden(res);
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to verify admin permissions' });
    }
  }

  async function requireScopedAdminAccess(req, res, next) {
    const textAdminPaths = [
      /^\/ocr-records(?:\/content)?$/,
      /^\/subtitle-records(?:\/content)?$/,
      /^\/text-search$/
    ];
    const assetRightsAdminPaths = [
      /^\/assets\/access$/,
      /^\/assets\/access-groups$/,
      /^\/assets\/[^/]+\/access$/,
      /^\/asset-types\/access$/,
      /^\/asset-types\/[^/]+\/access$/
    ];
    const documentRightsAdminPaths = [
      /^\/document-rights\/assets$/,
      /^\/document-rights\/assets\/[^/]+\/access$/,
      /^\/document-rights\/assets\/[^/]+\/edit-lock$/
    ];
    const safePath = String(req.path || '').trim();
    if (textAdminPaths.some((pattern) => pattern.test(safePath))) {
      return requireTextAdminAccess(req, res, next);
    }
    if (documentRightsAdminPaths.some((pattern) => pattern.test(safePath))) {
      return requireScopedDocumentRightsAccess(req, res, next);
    }
    if (assetRightsAdminPaths.some((pattern) => pattern.test(safePath))) {
      return requireScopedAssetRightsAccess(req, res, next);
    }
    return requireAdminAccess(req, res, next);
  }

  function requirePermissionFlag(flag, errorMessage) {
    return async function permissionFlagMiddleware(req, res, next) {
      try {
        const effective = await loadEffective(req);
        if (!effective[flag]) return forbidden(res);
        return next();
      } catch (_error) {
        return res.status(500).json({ error: errorMessage });
      }
    };
  }

  return {
    requireAdminAccess,
    requireTextAdminAccess,
    requireScopedAdminAccess,
    requireAssetDelete: requirePermissionFlag('canDeleteAssets', 'Failed to verify delete permissions'),
    requireMetadataEdit: requirePermissionFlag('canEditMetadata', 'Failed to verify metadata edit permissions'),
    requireOfficeEdit: requirePermissionFlag('canEditOffice', 'Failed to verify office edit permissions'),
    requirePdfAdvancedTools: requirePermissionFlag('canUsePdfAdvancedTools', 'Failed to verify PDF advanced permissions')
  };
}

module.exports = {
  createAuthMiddlewareService
};
