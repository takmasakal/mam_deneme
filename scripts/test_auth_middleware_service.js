const assert = require('assert');

const { createAuthMiddlewareService } = require('../src/services/authMiddlewareService');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function run(middleware, req) {
  const res = makeRes();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled, userPermissions: req.userPermissions };
}

const users = {
  admin: { username: 'admin', canAccessAdmin: true },
  text: { username: 'text', canAccessTextAdmin: true },
  scopedText: { username: 'scopedText', canAccessTextAdmin: false },
  scopedAsset: { username: 'scopedAsset', canAccessAdmin: false },
  doc: { username: 'doc', canAccessAdmin: false },
  none: { username: 'none' },
  editor: {
    username: 'editor',
    canEditMetadata: true,
    canEditOffice: true,
    canDeleteAssets: true,
    canUsePdfAdvancedTools: true
  }
};

const service = createAuthMiddlewareService({
  resolveEffectivePermissions: async (req) => users[req.userKey] || users.none,
  assetAccessService: {
    resolveAccessContext: async (req) => ({
      scopedText: req.userKey === 'scopedText',
      scopedAsset: req.userKey === 'scopedAsset',
      scopedDocument: req.userKey === 'doc'
    }),
    hasScopedAdminScopeAccess: (context, scope) => scope === 'text-admin' && Boolean(context.scopedText),
    hasScopedAssetRightsAdminAccess: (context) => Boolean(context.scopedAsset)
  },
  hasDocumentRightsAdminAccess: (_effective, context) => Boolean(context.scopedDocument)
});

(async () => {
  {
    const result = await run(service.requireAdminAccess, { userKey: 'admin' });
    assert.strictEqual(result.nextCalled, true);
    assert.strictEqual(result.userPermissions.username, 'admin');
  }
  {
    const result = await run(service.requireAdminAccess, { userKey: 'none' });
    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.res.statusCode, 403);
    assert.deepStrictEqual(result.res.body, { error: 'Forbidden' });
  }
  {
    const result = await run(service.requireScopedAdminAccess, { userKey: 'scopedText', path: '/ocr-records' });
    assert.strictEqual(result.nextCalled, true, 'scoped text admin path should allow text scope');
  }
  {
    const result = await run(service.requireScopedAdminAccess, { userKey: 'scopedAsset', path: '/assets/access' });
    assert.strictEqual(result.nextCalled, true, 'asset rights path should allow scoped asset admin');
  }
  {
    const result = await run(service.requireScopedAdminAccess, { userKey: 'doc', path: '/document-rights/assets/a/access' });
    assert.strictEqual(result.nextCalled, true, 'document rights path should allow document admin');
  }
  {
    const result = await run(service.requireScopedAdminAccess, { userKey: 'none', path: '/users' });
    assert.strictEqual(result.nextCalled, false, 'ordinary admin path should require admin access');
    assert.strictEqual(result.res.statusCode, 403);
  }
  {
    const result = await run(service.requireMetadataEdit, { userKey: 'editor' });
    assert.strictEqual(result.nextCalled, true);
  }
  {
    const result = await run(service.requireOfficeEdit, { userKey: 'editor' });
    assert.strictEqual(result.nextCalled, true);
  }
  {
    const result = await run(service.requireAssetDelete, { userKey: 'editor' });
    assert.strictEqual(result.nextCalled, true);
  }
  {
    const result = await run(service.requirePdfAdvancedTools, { userKey: 'editor' });
    assert.strictEqual(result.nextCalled, true);
  }

  console.log('authMiddlewareService OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
