const assert = require('assert');

const { createKeycloakService } = require('../src/services/keycloakService');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))
  };
}

function normalizeIdentityKey(value) {
  return String(value || '')
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const calls = [];
const users = [
  { id: 'u1', username: 'mka', email: 'mka@example.com', firstName: 'Met', lastName: 'MAM', enabled: true },
  { id: 'u2', username: 'other', email: 'other@example.com', enabled: true }
];
const groups = [
  {
    id: 'g1',
    name: 'superadmin',
    path: '/superadmin',
    subGroups: []
  },
  {
    id: 'g2',
    name: 'ik',
    path: '/ik',
    subGroups: [{ id: 'g3', name: 'ikyon', path: '/ik/ikyon', subGroups: [] }]
  }
];

async function fakeFetch(url, options = {}) {
  calls.push({ url: String(url), options });
  if (String(url).endsWith('/protocol/openid-connect/token')) {
    return jsonResponse({ access_token: 'admin-token', expires_in: 60 });
  }
  if (String(url).includes('/users?')) {
    const parsed = new URL(String(url));
    const search = parsed.searchParams.get('search');
    if (search) return jsonResponse(users.filter((user) => user.username.includes(search) || user.email.includes(search)));
    return jsonResponse(users);
  }
  if (String(url).includes('/groups?search=superadmin')) {
    return jsonResponse([groups[0]]);
  }
  if (String(url).includes('/groups?briefRepresentation=false')) {
    return jsonResponse(groups);
  }
  if (String(url).includes('/groups/g1/members')) {
    return jsonResponse([users[0]]);
  }
  if (String(url).includes('/groups/g2/members')) {
    return jsonResponse([users[0], users[1]]);
  }
  if (String(url).includes('/users/u1/role-mappings/realm/composite')) {
    return jsonResponse([{ name: 'offline_access' }]);
  }
  if (String(url).includes('/users/u1/role-mappings/realm')) {
    return jsonResponse([{ name: 'default-roles-mam' }]);
  }
  if (String(url).includes('/users/u1/groups')) {
    return jsonResponse([{ name: 'ik', path: '/ik' }]);
  }
  if (String(url).endsWith('/admin/realms/mam')) {
    return jsonResponse({}, 204);
  }
  return jsonResponse({}, 404);
}

(async () => {
  const service = createKeycloakService({
    fetchFn: fakeFetch,
    internalUrl: 'http://keycloak:8080',
    realm: 'mam',
    adminRealm: 'master',
    adminUsername: 'admin',
    adminPassword: 'secret',
    adminClientId: 'admin-cli',
    cacheTtlMs: 60_000,
    requestTimeoutMs: 1000,
    normalizeIdentityKey,
    resolvePermissionKeysFromPrincipals: ({ groups = [] }) => ({
      permissionKeys: groups.map((group) => normalizeIdentityKey(group)).includes('superadmin') ? ['admin.access'] : [],
      isSuperAdmin: groups.map((group) => normalizeIdentityKey(group)).includes('superadmin')
    }),
    normalizeAuthSessionSettings: (settings = {}) => ({
      rememberMe: Boolean(settings.rememberMe),
      ssoIdleMinutes: Number(settings.ssoIdleMinutes || 30),
      ssoMaxHours: Number(settings.ssoMaxHours || 8),
      clientIdleMinutes: Number(settings.clientIdleMinutes || 15),
      clientMaxHours: Number(settings.clientMaxHours || 8)
    })
  });

  const userData = await service.fetchKeycloakUsers();
  assert.strictEqual(userData.users.length, 2, 'users should be fetched from Keycloak');
  assert.strictEqual(userData.realmByUsername.get('mka'), 'mam');

  const cachedUserData = await service.fetchKeycloakUsers();
  assert.strictEqual(cachedUserData, userData, 'non-search user list should be cached');

  const searchData = await service.fetchKeycloakUsers({ search: 'mka', max: 10 });
  assert.deepStrictEqual(searchData.users.map((user) => user.username), ['mka']);

  const groupData = await service.fetchKeycloakGroups();
  assert.deepStrictEqual(groupData.groups.map((group) => group.path), ['/ik', '/ik/ikyon', '/superadmin']);

  const memberData = await service.fetchKeycloakGroupMembers(['ik']);
  assert.deepStrictEqual(memberData.users.map((user) => user.username).sort(), ['mka', 'other']);
  assert.deepStrictEqual(memberData.groupPathsByUsername.get('mka'), ['/ik']);

  const enriched = await service.enrichUserProfileFromKeycloak({ username: 'mka', groups: [], roles: [] });
  assert.strictEqual(enriched.displayName, 'Met MAM');
  assert.ok(enriched.groups.includes('/ik'), 'profile enrichment should include Keycloak groups');

  const applied = await service.applyKeycloakAuthSessionSettings({
    rememberMe: true,
    ssoIdleMinutes: 20,
    ssoMaxHours: 12,
    clientIdleMinutes: 10,
    clientMaxHours: 6
  });
  assert.deepStrictEqual(applied.realms, ['mam']);
  const putCall = calls.find((call) => call.options?.method === 'PUT');
  assert.ok(putCall, 'session settings should issue PUT');
  assert.strictEqual(JSON.parse(putCall.options.body).clientSessionIdleTimeout, 600);

  const tokenCalls = calls.filter((call) => call.url.endsWith('/protocol/openid-connect/token'));
  assert.strictEqual(tokenCalls.length, 1, 'admin token should be cached');
  console.log('keycloakService OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
