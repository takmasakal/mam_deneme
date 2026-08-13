const assert = require('assert');

const { createMePayloadService } = require('../src/services/mePayloadService');

let resolvedAccessContext = null;
const service = createMePayloadService({
  resolveEffectivePermissions: async (req) => req.effective,
  getAdminSettings: async () => ({
    authSession: {
      clientIdleMinutes: 12,
      clientMaxHours: 7
    }
  }),
  normalizeAuthSessionSettings: (value = {}) => ({
    clientIdleMinutes: Number(value.clientIdleMinutes || 0),
    clientMaxHours: Number(value.clientMaxHours || 0)
  }),
  assetAccessService: {
    resolveAccessContext: async (_req) => {
      resolvedAccessContext = {
        groupAdminGroups: ['ikyon'],
        allowed: ['video', 'document'],
        uploadAllowed: ['document'],
        textScope: true,
        assetRightsScope: true
      };
      return resolvedAccessContext;
    },
    hasScopedAdminScopeAccess: (context, scope) => scope === 'text-admin' && Boolean(context.textScope),
    hasScopedAssetRightsAdminAccess: (context) => Boolean(context.assetRightsScope),
    getAllowedAssetTypeGroups: (context) => context.allowed,
    getAllowedUploadAssetTypeGroups: (context) => context.uploadAllowed
  },
  hasDocumentRightsAdminAccess: (_effective, context) => context.groupAdminGroups.includes('ikyon'),
  officeEditorProvider: 'onlyoffice'
});

(async () => {
  const anonymous = await service.buildMePayload({ effective: { username: '', email: '' } });
  assert.strictEqual(anonymous.authenticated, false);
  assert.strictEqual(anonymous.payload, null);
  assert.strictEqual(service.hasAuthenticatedIdentity({ email: 'u@example.com' }), true);

  const result = await service.buildMePayload({
    effective: {
      username: 'ik1',
      displayName: 'İK Bir',
      email: 'ik1@example.com',
      groups: ['/ik'],
      roles: ['offline_access'],
      isSuperAdmin: false,
      isAdmin: false,
      canAccessAdmin: false,
      canAccessTextAdmin: false,
      canEditMetadata: true,
      canEditOffice: true,
      canDeleteAssets: false,
      canUsePdfAdvancedTools: false,
      canAccessAdvancedSearch: true,
      permissionKeys: ['metadata.edit', 'advanced.search'],
      deniedPermissionKeys: ['asset.delete']
    }
  });

  assert.strictEqual(result.authenticated, true);
  assert.strictEqual(result.payload.username, 'ik1');
  assert.strictEqual(result.payload.canAccessTextAdmin, true, 'scoped text admin should be reflected');
  assert.strictEqual(result.payload.canAccessAssetRightsAdmin, true, 'scoped asset rights admin should be reflected');
  assert.strictEqual(result.payload.canAccessDocumentRightsAdmin, true);
  assert.deepStrictEqual(result.payload.allowedAssetTypes, ['video', 'document']);
  assert.deepStrictEqual(result.payload.uploadAllowedAssetTypes, ['document']);
  assert.deepStrictEqual(result.payload.deniedPermissionKeys, ['asset.delete']);
  assert.deepStrictEqual(result.payload.authSession, { clientIdleMinutes: 12, clientMaxHours: 7 });
  assert.strictEqual(result.payload.officeEditorProvider, 'onlyoffice');
  assert.ok(resolvedAccessContext, 'access context should be resolved');

  console.log('mePayloadService OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
