const assert = require('assert');

const {
  PERMISSION_KEYS,
  normalizePermissionEntry,
  permissionKeysToLegacyFlags
} = require('../src/permissions');
const { createEffectivePermissionService } = require('../src/services/effectivePermissionService');

function normalizeIdentityKey(value) {
  return String(value || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

const settings = {
  groups: {
    'standart yönetici': { permissionKeys: ['admin.access', 'metadata.edit'] },
    ikyon: { permissionKeys: ['asset.delete'] }
  },
  users: {
    ik1: {
      permissionKeys: ['office.edit', 'advanced.search'],
      deniedPermissionKeys: ['asset.delete']
    }
  },
  legacyuser: { permissionKeys: ['pdf.advanced'] }
};

const usersByName = {
  ik1: {
    username: 'ik1',
    email: 'ik1@example.com',
    displayName: 'İK Bir',
    groups: ['/standart yönetici', '/ik/ikyon'],
    basePermissionKeys: [],
    baseIsSuperAdmin: false
  },
  legacyuser: {
    username: 'legacyuser',
    email: 'legacy@example.com',
    displayName: 'Legacy User',
    groups: [],
    basePermissionKeys: [],
    baseIsSuperAdmin: false
  },
  super: {
    username: 'super',
    email: 'super@example.com',
    displayName: 'Super User',
    groups: ['/superadmin'],
    basePermissionKeys: [],
    baseIsSuperAdmin: true
  },
  dokyon: {
    username: 'dokyon',
    email: 'dokyon@example.com',
    displayName: 'Dok Yon',
    groups: ['/dokyönet'],
    basePermissionKeys: [],
    baseIsSuperAdmin: false
  }
};

let settingsReads = 0;
const service = createEffectivePermissionService({
  permissionKeys: PERMISSION_KEYS,
  normalizeIdentityKey,
  normalizePermissionEntry,
  permissionKeysToLegacyFlags,
  buildUserContextFromRequest: (req) => ({ username: req.username }),
  enrichUserProfileFromKeycloak: async (user) => usersByName[user.username],
  getUserPermissionsSettings: async () => {
    settingsReads += 1;
    return settings;
  },
  assetAccessService: {
    hasScopedAdminScopeAccess: (context, scope, type) => (
      context?.scope === scope && context?.type === type
    )
  },
  documentRightsAdminGroups: ['dokadmin', 'dokyönet']
});

(async () => {
  assert.strictEqual(
    service.getPermissionOverrideForUser(settings, usersByName.legacyuser).permissionKeys[0],
    'pdf.advanced',
    'legacy user permission entries should still resolve'
  );
  assert.strictEqual(
    service.getPermissionOverridesForGroups(settings, usersByName.ik1).length,
    2,
    'group permissions should resolve by normalized full and last group names'
  );

  const req = { username: 'ik1' };
  const effective = await service.resolveEffectivePermissions(req);
  assert.ok(effective.permissionKeys.includes('admin.access'), 'group override should grant admin access');
  assert.ok(effective.permissionKeys.includes('metadata.edit'), 'group override should grant metadata edit');
  assert.ok(effective.permissionKeys.includes('office.edit'), 'user override should add office edit');
  assert.ok(effective.permissionKeys.includes('advanced.search'), 'user override should add advanced search');
  assert.ok(!effective.permissionKeys.includes('asset.delete'), 'user deny should remove group delete grant');
  assert.strictEqual(effective.canDeleteAssets, false);
  assert.deepStrictEqual(effective.deniedPermissionKeys, ['asset.delete']);

  const cached = await service.resolveEffectivePermissions(req);
  assert.strictEqual(cached, effective, 'effective permissions should be cached on request object');
  assert.strictEqual(settingsReads, 1, 'cached request should not reread settings');

  const superEffective = await service.resolveEffectivePermissions({ username: 'super' });
  assert.strictEqual(superEffective.isSuperAdmin, true);
  assert.deepStrictEqual(superEffective.permissionKeys, PERMISSION_KEYS);

  assert.strictEqual(
    service.hasDocumentRightsAdminAccess(
      { permissionKeys: ['document.rights.admin'] },
      { scope: 'document-rights', type: 'document' }
    ),
    true,
    'scoped document rights permission should allow document rights admin'
  );
  assert.strictEqual(
    service.hasDocumentRightsAdminAccess(usersByName.dokyon, {}),
    true,
    'document admin groups should allow document rights admin'
  );
  assert.strictEqual(
    service.hasDocumentRightsAdminAccess({ groups: ['/ik'] }, {}),
    false,
    'unrelated groups should not allow document rights admin'
  );

  console.log('effectivePermissionService OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
