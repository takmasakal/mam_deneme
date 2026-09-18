const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { createAssetAccessService } = require('../src/services/assetAccessService');
const { createMetadataAdminAccessService } = require('../src/services/metadataAdminAccessService');
const { createAuthMiddlewareService } = require('../src/services/authMiddlewareService');
const { registerAdminRoutes } = require('../src/routes/admin');
const { createEffectivePermissionService } = require('../src/services/effectivePermissionService');
const { PERMISSION_KEYS, normalizePermissionEntry, permissionKeysToLegacyFlags } = require('../src/permissions');

const context = { username: 'manager', groups: ['team-a'], canAccessMetadataAdmin: true };
const access = createAssetAccessService({ pool: {} });
const metadata = createMetadataAdminAccessService(access);
const own = { id: 'own', title: 'Document', visibility: 'public', owner_groups: ['team-a'] };
const other = { id: 'other', visibility: 'public', owner_groups: ['team-b'] };
assert(metadata.canManage(own, context));
assert(!metadata.canManage(other, context), 'public visibility is insufficient');
assert(metadata.canManage({ ...other, allowed_users: ['manager'] }, context));
assert(metadata.canManage({ ...other, allowed_groups: ['team-a'] }, context));
assert(!metadata.canManage({ ...own, denied_groups: ['team-a'] }, context));
assert(!metadata.canManage({ ...own, edit_denied_users: ['manager'] }, context));
assert(!metadata.canManage({ ...own, visibility: 'private' }, context));
assert(!metadata.canManage({ ...own, deleted_at: '2026-09-18' }, context));
assert(!metadata.canManage(own, { ...context, canAccessMetadataAdmin: false }));
assert(!metadata.canManage(own, { ...context, deniedPermissionKeys: ['metadata.edit'] }));

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

async function run() {
  const settings = { groups: { 'team-a': { permissionKeys: ['metadata.admin'] } }, users: {} };
  const permissions = createEffectivePermissionService({
    permissionKeys: PERMISSION_KEYS,
    normalizeIdentityKey: (value) => String(value || '').toLowerCase(),
    normalizePermissionEntry,
    permissionKeysToLegacyFlags,
    buildUserContextFromRequest: () => context,
    enrichUserProfileFromKeycloak: async (user) => user,
    getUserPermissionsSettings: async () => settings,
    assetAccessService: access
  });
  const inherited = await permissions.resolveEffectivePermissions({});
  assert(inherited.canAccessMetadataAdmin, 'group permission must grant access');
  assert(!inherited.canAccessAdmin, 'metadata management must not grant full admin access');
  settings.users.manager = { deniedPermissionKeys: ['metadata.admin'] };
  assert(!(await permissions.resolveEffectivePermissions({})).canAccessMetadataAdmin, 'individual deny must revoke inherited access');
  settings.groups = {};
  settings.users.manager = { permissionKeys: ['metadata.admin'] };
  assert((await permissions.resolveEffectivePermissions({})).canAccessMetadataAdmin, 'individual grant must work');
  settings.users = {};
  assert(!(await permissions.resolveEffectivePermissions({})).canAccessMetadataAdmin, 'removing grants must revoke access');
  const middleware = createAuthMiddlewareService({
    resolveEffectivePermissions: async (req) => req.context,
    assetAccessService: access,
    hasDocumentRightsAdminAccess: () => false
  });
  for (const [path, allowed] of [['/metadata/generate', true], ['/metadata/assets/suggest', true], ['/settings', false], ['/assets/suggest', false], ['/users/permissions', false]]) {
    let called = false;
    await middleware.requireScopedAdminAccess({ path, context }, response(), () => { called = true; });
    assert.strictEqual(called, allowed, path);
  }
  const denied = response();
  await middleware.requireScopedAdminAccess({ path: '/metadata/generate', context: {} }, denied, () => assert.fail('revoked permission'));
  assert.strictEqual(denied.code, 403);

  const routes = {};
  let queued = 0;
  let assetVisibilityUpdates = 0;
  let queryResult = [own];
  let lastQuery;
  const app = new Proxy({}, { get: (_target, method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1); } });
  registerAdminRoutes(app, {
    assetAccessService: {
      ...access,
      resolveAccessContext: async (req) => req.context,
      updateAssetVisibility: async () => {
        assetVisibilityUpdates++;
        return { status: 200, row: { id: 'own', title: 'Document' } };
      }
    },
    pool: { query: async (sql, values) => { lastQuery = { sql, values }; return { rows: queryResult }; } },
    metadataEnrichmentService: { queueAsset: () => { queued++; return { jobId: 'job' }; } },
    getUserPermissionsSettings: async () => ({ users: { boss: { permissionKeys: ['admin.access'] } }, groups: {} }),
    fetchKeycloakUsers: async ({ search }) => ({
      users: search === 'chief' ? [{ username: 'chief', email: 'chief@example.com' }] : [],
      realmByUsername: new Map()
    }),
    isVisibleKeycloakUser: () => true,
    fetchKeycloakUserPermissionDefaults: async (users) => new Map(users.map((user) => [String(user.username || '').toLowerCase(), user.username === 'chief' ? ['admin.access'] : []])),
    fetchKeycloakGroupMembers: async () => ({ groupPathsByUsername: new Map() }),
    resolvePermissionKeysFromPrincipals: () => ({ permissionKeys: [] }),
    normalizePermissionEntry,
    PERMISSION_KEYS,
    recordAuditEvent: async () => {},
    indexAssetToElastic: async () => {}
  });
  const generate = routes['post /api/admin/metadata/generate'];
  let res = response();
  await generate({ context, body: { assetId: 'own' } }, res);
  assert.strictEqual(res.code, 202);
  assert.strictEqual(queued, 1);
  assert(lastQuery.sql.includes('owner_groups'));
  queryResult = [other];
  for (const body of [{ assetId: 'other' }, { assetName: 'Document' }]) {
    res = response();
    await generate({ context, body }, res);
    assert.strictEqual(res.code, 404);
  }
  assert.strictEqual(queued, 1, 'out-of-scope assets must never be queued');
  res = response();
  await generate({ context: { ...context, canAccessMetadataAdmin: false }, body: { assetId: 'own' } }, res);
  assert.strictEqual(res.code, 403);
  queryResult = [own, other];
  res = response();
  await routes['get /api/admin/metadata/assets/suggest']({ context, query: { q: 'Doc' } }, res);
  assert.deepStrictEqual(res.body.map((row) => row.id), ['own']);
  res = response();
  await routes['patch /api/admin/assets/:id/access']({
    params: { id: 'own' },
    context: { ...context, canManageAllAssetVisibility: false },
    body: { deniedUsers: ['boss'] }
  }, res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(assetVisibilityUpdates, 0, 'protected admin target must be rejected before update');
  res = response();
  await routes['patch /api/admin/assets/:id/access']({
    params: { id: 'own' },
    context: { ...context, canManageAllAssetVisibility: false },
    body: { allowedUsers: ['chief@example.com'] }
  }, res);
  assert.strictEqual(res.code, 403);
  assert.strictEqual(assetVisibilityUpdates, 0, 'Keycloak inherited admin target must be rejected before update');

  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/main-access-scope.js'), 'utf8'), sandbox);
  const ui = sandbox.window.createMainAccessScopeModule();
  assert(ui.canShowAdminMenu(context));
  let selected;
  const hidden = {};
  const tabs = ['metadata', 'settings', 'assetRights'].map((tab) => ({ dataset: { tab }, classList: { toggle: (_name, value) => { hidden[tab] = value; } } }));
  const form = { classList: { toggle: (_name, value) => { hidden.modelSettings = value; } } };
  ui.applyAdminAccessMode({ profile: context, adminTabs: tabs, elements: { metadataSettingsForm: form }, switchTab: (tab) => { selected = tab; } });
  assert.strictEqual(selected, 'metadata');
  assert.strictEqual(hidden.metadata, false);
  assert.strictEqual(hidden.settings, true);
  assert.strictEqual(hidden.modelSettings, true);
  console.log('metadata admin scope, routes and UI tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
