const assert = require('assert');

const { createAuthContextService } = require('../src/services/authContextService');

function makeJwt(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

const calls = [];
const service = createAuthContextService({
  resolvePermissionKeysFromPrincipals: (input) => {
    calls.push(input);
    const groups = (input.groups || []).map((group) => String(group || '').toLowerCase());
    const roles = (input.roles || []).map((role) => String(role || '').toLowerCase());
    const permissionKeys = groups.includes('/superadmin') || roles.includes('mam-admin')
      ? ['admin.access']
      : [];
    return {
      permissionKeys,
      isSuperAdmin: groups.includes('/superadmin')
    };
  }
});

{
  const req = {
    headers: {
      'x-forwarded-user': encodeURIComponent('Mehmet Erinç BAŞAR'),
      'x-forwarded-email': 'erinc@example.com',
      'x-forwarded-groups': '/standart yönetici,/superadmin',
      authorization: `Bearer ${makeJwt({
        preferred_username: 'token-user',
        name: 'Token User',
        groups: ['/token-group'],
        realm_access: { roles: ['mam-admin'] },
        resource_access: { app: { roles: ['resource-role'] } }
      })}`
    }
  };
  const user = service.buildUserContextFromRequest(req);
  assert.strictEqual(user.username, 'token-user');
  assert.strictEqual(user.displayName, 'Mehmet Erinç BAŞAR');
  assert.strictEqual(user.email, 'erinc@example.com');
  assert.ok(user.groups.includes('/standart yönetici'));
  assert.ok(user.groups.includes('/superadmin'));
  assert.ok(user.groups.includes('/token-group'));
  assert.ok(user.roles.includes('mam-admin'));
  assert.ok(user.roles.includes('resource-role'));
  assert.strictEqual(user.baseIsAdmin, true);
  assert.strictEqual(user.baseIsSuperAdmin, true);
}

{
  const req = { __mamApiTokenUsername: 'belgelik-api', headers: {} };
  const user = service.buildUserContextFromRequest(req);
  assert.strictEqual(user.username, 'belgelik-api');
  assert.strictEqual(user.displayName, 'belgelik-api');
  assert.deepStrictEqual(user.groups, []);
  assert.deepStrictEqual(user.roles, []);
}

{
  const repaired = service.getHeaderString({ headers: { 'x-test': 'M%C3%BCnir' } }, 'x-test');
  assert.strictEqual(repaired, 'Münir');
  assert.deepStrictEqual(service.decodeJwtPayload('not-a-jwt'), null);
}

assert.ok(calls.length >= 2, 'permission resolver should be called');
console.log('authContextService OK');
