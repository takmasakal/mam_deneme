function createKeycloakService(deps = {}) {
  const {
    fetchFn = global.fetch,
    internalUrl = 'http://keycloak:8080',
    realm = 'mam',
    realms = '',
    adminRealm = 'master',
    adminUsername = '',
    adminPassword = '',
    adminClientId = 'admin-cli',
    cacheTtlMs = 60_000,
    requestTimeoutMs = 3500,
    normalizeIdentityKey = (value) => String(value || '').trim().toLowerCase(),
    resolvePermissionKeysFromPrincipals = () => ({ permissionKeys: [], isSuperAdmin: false }),
    normalizeAuthSessionSettings = (settings) => settings || {}
  } = deps;

  let usersCache = { expiresAt: 0, value: null };
  let groupsCache = { expiresAt: 0, value: null };
  let adminTokenCache = { expiresAt: 0, token: '' };
  let adminTokenPromise = null;
  const permissionDefaultsCache = new Map();
  const userProfileCache = new Map();

  async function fetchKeycloakAdminJson(url, token, options = {}) {
    if (!url || !token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchFn(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch (_error) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function keycloakUserFullName(user) {
    const firstName = String(user?.firstName || '').trim();
    const lastName = String(user?.lastName || '').trim();
    return [firstName, lastName].filter(Boolean).join(' ').trim();
  }

  function keycloakUserIdentityCandidates(user) {
    const username = String(user?.username || '').trim();
    const email = String(user?.email || '').trim();
    const fullName = keycloakUserFullName(user);
    const localEmail = email.includes('@') ? email.split('@')[0] : '';
    return [username, email, localEmail, fullName]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  function getKeycloakCandidateRealms() {
    const fromList = realms
      ? String(realms).split(',').map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const fallback = [realm]
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const merged = [...fromList, ...fallback];
    const seen = new Set();
    return merged.filter((realmName) => {
      const key = realmName.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function getKeycloakAdminAccessToken() {
    if (!adminUsername || !adminPassword) return '';
    const now = Date.now();
    if (adminTokenCache.token && adminTokenCache.expiresAt > now) {
      return adminTokenCache.token;
    }
    if (adminTokenPromise) return adminTokenPromise;
    const tokenUrl = `${internalUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`;

    adminTokenPromise = (async () => {
      const form = new URLSearchParams();
      form.set('grant_type', 'password');
      form.set('client_id', adminClientId);
      form.set('username', adminUsername);
      form.set('password', adminPassword);
      const response = await fetchFn(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      if (!response.ok) return '';
      const payload = await response.json().catch(() => ({}));
      const token = String(payload?.access_token || '').trim();
      const expiresInMs = Math.max(0, Number(payload?.expires_in) || 0) * 1000;
      if (token) {
        adminTokenCache = {
          token,
          expiresAt: Date.now() + Math.max(0, expiresInMs - 10_000)
        };
      }
      return token;
    })();

    try {
      return await adminTokenPromise;
    } catch (_error) {
      return '';
    } finally {
      adminTokenPromise = null;
    }
  }

  async function queryKeycloakUsersByCandidate(realmName, candidate, token) {
    const value = String(candidate || '').trim();
    if (!realmName || !value || !token) return [];
    const realmEncoded = encodeURIComponent(realmName);
    const paramsList = [];
    const addParams = (pairs) => {
      const params = new URLSearchParams();
      params.set('first', '0');
      params.set('max', '5');
      Object.entries(pairs || {}).forEach(([key, val]) => {
        if (val != null && String(val).trim()) params.set(key, String(val).trim());
      });
      paramsList.push(params);
    };

    addParams({ username: value, exact: 'true' });
    if (value.includes('@')) addParams({ email: value, exact: 'true' });
    addParams({ search: value });

    const rows = [];
    const seen = new Set();
    for (const params of paramsList) {
      const payload = await fetchKeycloakAdminJson(
        `${internalUrl}/admin/realms/${realmEncoded}/users?${params.toString()}`,
        token
      );
      (Array.isArray(payload) ? payload : []).forEach((row) => {
        const id = String(row?.id || '').trim();
        const username = String(row?.username || '').trim().toLowerCase();
        const key = id || username;
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push(row);
      });
      if (rows.length) break;
    }
    return rows;
  }

  async function findKeycloakUserForIdentity(user) {
    const current = user && typeof user === 'object' ? user : {};
    const candidates = [
      current.username,
      current.email,
      String(current.email || '').includes('@') ? String(current.email).split('@')[0] : '',
      current.displayName
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!candidates.length) return { user: null, realm: '' };

    const token = await getKeycloakAdminAccessToken();
    const candidateKeys = new Set(candidates.map((value) => normalizeIdentityKey(value)).filter(Boolean));
    if (token) {
      for (const realmName of getKeycloakCandidateRealms()) {
        for (const candidate of candidates) {
          const rows = await queryKeycloakUsersByCandidate(realmName, candidate, token);
          const match = rows.find((row) => (
            keycloakUserIdentityCandidates(row).some((value) => candidateKeys.has(normalizeIdentityKey(value)))
          ));
          if (match) return { user: match, realm: realmName };
        }
      }
    }

    return { user: null, realm: '' };
  }

  function buildKeycloakProfileCacheKey(user) {
    const current = user && typeof user === 'object' ? user : {};
    const candidates = [
      current.username,
      current.email,
      String(current.email || '').includes('@') ? String(current.email).split('@')[0] : '',
      current.displayName
    ]
      .map((value) => normalizeIdentityKey(value))
      .filter(Boolean)
      .sort();
    return candidates.join('|');
  }

  function extractKeycloakRoleNames(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((item) => String(item?.name || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function extractKeycloakGroupNames(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((item) => String(item?.path || item?.name || '').trim().toLowerCase())
      .filter(Boolean);
  }

  async function fetchPrivilegedKeycloakGroupsForUser({ realmName, token, user, candidates }) {
    if (!realmName || !token) return [];
    const realmEncoded = encodeURIComponent(realmName);
    const groupRows = await fetchKeycloakAdminJson(
      `${internalUrl}/admin/realms/${realmEncoded}/groups?search=superadmin&briefRepresentation=false`,
      token
    );
    const superadminGroups = flattenKeycloakGroups(Array.isArray(groupRows) ? groupRows : [], realmName)
      .filter((group) => normalizeIdentityKey(String(group.path || group.name || '').split('/').filter(Boolean).pop()) === 'superadmin');
    if (!superadminGroups.length) return [];

    const identityKeys = new Set(
      [
        ...(Array.isArray(candidates) ? candidates : []),
        ...keycloakUserIdentityCandidates(user)
      ]
        .map((value) => normalizeIdentityKey(value))
        .filter(Boolean)
    );

    const matchedGroups = [];
    for (const group of superadminGroups) {
      const groupId = String(group.id || '').trim();
      if (!groupId) continue;
      const members = await fetchKeycloakAdminJson(
        `${internalUrl}/admin/realms/${realmEncoded}/groups/${encodeURIComponent(groupId)}/members?first=0&max=200&briefRepresentation=true`,
        token
      );
      const hasUser = (Array.isArray(members) ? members : []).some((member) => (
        keycloakUserIdentityCandidates(member).some((value) => identityKeys.has(normalizeIdentityKey(value)))
      ));
      if (hasUser) matchedGroups.push(String(group.path || group.name || '/superadmin').trim().toLowerCase());
    }
    return matchedGroups;
  }

  async function enrichUserProfileFromKeycloak(user) {
    const current = user && typeof user === 'object' ? user : {};
    const cacheKey = buildKeycloakProfileCacheKey(current);
    const now = Date.now();
    const cached = cacheKey ? userProfileCache.get(cacheKey) : null;
    if (cached && cached.expiresAt > now) return { ...current, ...cached.value };

    try {
      const { user: match, realm: matchedRealm } = await findKeycloakUserForIdentity(current);
      const userId = String(match?.id || '').trim();
      const username = String(match?.username || current.username || '').trim().toLowerCase();
      const realmName = String(matchedRealm || getKeycloakCandidateRealms()[0] || realm).trim();
      const token = await getKeycloakAdminAccessToken();
      if (!token || !userId || !realmName) return current;

      const realmEncoded = encodeURIComponent(realmName);
      const [roles, effectiveRoles, groups] = await Promise.all([
        fetchKeycloakAdminJson(
          `${internalUrl}/admin/realms/${realmEncoded}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
          token
        ),
        fetchKeycloakAdminJson(
          `${internalUrl}/admin/realms/${realmEncoded}/users/${encodeURIComponent(userId)}/role-mappings/realm/composite`,
          token
        ),
        fetchKeycloakAdminJson(
          `${internalUrl}/admin/realms/${realmEncoded}/users/${encodeURIComponent(userId)}/groups`,
          token
        )
      ]);
      const roleNames = Array.from(new Set([
        ...extractKeycloakRoleNames(roles),
        ...extractKeycloakRoleNames(effectiveRoles)
      ]));
      const groupNames = Array.from(new Set(extractKeycloakGroupNames(groups)));
      let resolved = resolvePermissionKeysFromPrincipals({
        username,
        groups: groupNames,
        roles: roleNames
      });
      if (!resolved.isSuperAdmin) {
        const fallbackGroups = await fetchPrivilegedKeycloakGroupsForUser({
          realmName,
          token,
          user: match,
          candidates: [current.username, current.email, current.displayName]
        });
        fallbackGroups.forEach((groupName) => {
          if (groupName && !groupNames.includes(groupName)) groupNames.push(groupName);
        });
        if (fallbackGroups.length) {
          resolved = resolvePermissionKeysFromPrincipals({
            username,
            groups: groupNames,
            roles: roleNames
          });
        }
      }
      const fullName = keycloakUserFullName(match);
      const enriched = {
        username: current.username || username,
        displayName: fullName || current.displayName,
        groups: Array.from(new Set([...(current.groups || []), ...groupNames])),
        roles: Array.from(new Set([...(current.roles || []), ...roleNames])),
        baseIsAdmin: current.baseIsAdmin || resolved.permissionKeys.includes('admin.access'),
        basePermissionKeys: Array.from(new Set([...(current.basePermissionKeys || []), ...resolved.permissionKeys])),
        baseIsSuperAdmin: Boolean(current.baseIsSuperAdmin || resolved.isSuperAdmin)
      };
      if (cacheKey) {
        userProfileCache.set(cacheKey, {
          expiresAt: now + cacheTtlMs,
          value: enriched
        });
      }
      return { ...current, ...enriched };
    } catch (_error) {
      return current;
    }
  }

  async function fetchKeycloakUsers(options = {}) {
    const search = String(options.search || '').trim();
    const max = Math.max(1, Math.min(Number(options.max) || 100, 500));
    const searchMode = Boolean(search);
    const now = Date.now();
    if (!searchMode && usersCache.value && usersCache.expiresAt > now) {
      return usersCache.value;
    }
    const token = await getKeycloakAdminAccessToken();
    if (!token) return { users: [], realmByUsername: new Map() };
    const candidateRealms = getKeycloakCandidateRealms();
    const users = [];
    const realmByUsername = new Map();
    const seen = new Set();
    for (const realmName of candidateRealms) {
      let first = 0;
      const pageSize = searchMode ? max : 100;
      try {
        while (true) {
          const params = new URLSearchParams({
            first: String(first),
            max: String(pageSize)
          });
          if (searchMode) params.set('search', search);
          const url = `${internalUrl}/admin/realms/${encodeURIComponent(realmName)}/users?${params.toString()}`;
          const response = await fetchFn(url, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!response.ok) break;
          const rows = await response.json().catch(() => []);
          const arr = Array.isArray(rows) ? rows : [];
          arr.forEach((row) => {
            const username = String(row?.username || '').trim().toLowerCase();
            if (!username || seen.has(username)) return;
            seen.add(username);
            users.push(row);
            realmByUsername.set(username, realmName);
          });
          if (arr.length < pageSize) break;
          if (searchMode) break;
          first += pageSize;
        }
      } catch (_error) {
        // Try next realm candidate.
      }
    }
    const value = { users, realmByUsername };
    if (!searchMode) usersCache = { expiresAt: now + cacheTtlMs, value };
    return value;
  }

  async function applyKeycloakAuthSessionSettings(settings) {
    const normalized = normalizeAuthSessionSettings(settings);
    const token = await getKeycloakAdminAccessToken();
    if (!token) {
      throw new Error('Keycloak admin token could not be obtained');
    }
    const candidateRealms = getKeycloakCandidateRealms();
    const payload = {
      rememberMe: normalized.rememberMe,
      ssoSessionIdleTimeout: normalized.ssoIdleMinutes * 60,
      ssoSessionMaxLifespan: normalized.ssoMaxHours * 60 * 60,
      clientSessionIdleTimeout: normalized.clientIdleMinutes * 60,
      clientSessionMaxLifespan: normalized.clientMaxHours * 60 * 60
    };
    const applied = [];
    for (const realmName of candidateRealms) {
      const response = await fetchFn(`${internalUrl}/admin/realms/${encodeURIComponent(realmName)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        applied.push(realmName);
        continue;
      }
      if (response.status !== 404) {
        const body = await response.text().catch(() => '');
        throw new Error(body || `Keycloak session settings update failed for realm ${realmName}`);
      }
    }
    if (!applied.length) {
      throw new Error('No Keycloak realm was updated');
    }
    return { settings: normalized, realms: applied };
  }

  function flattenKeycloakGroups(rows, realmName, parentPath = '') {
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const name = String(row?.name || '').trim();
      const pathValue = String(row?.path || '').trim();
      const pathName = pathValue || `${parentPath}/${name}`.replace(/\/+/g, '/');
      if (name) {
        out.push({
          id: String(row?.id || '').trim(),
          name,
          path: pathName,
          realm: String(realmName || '').trim()
        });
      }
      out.push(...flattenKeycloakGroups(row?.subGroups || [], realmName, pathName));
    });
    return out;
  }

  async function fetchKeycloakGroups() {
    const now = Date.now();
    if (groupsCache.value && groupsCache.expiresAt > now) {
      return groupsCache.value;
    }
    const token = await getKeycloakAdminAccessToken();
    if (!token) return { groups: [], realmByGroupPath: new Map() };
    const candidateRealms = getKeycloakCandidateRealms();
    const groups = [];
    const realmByGroupPath = new Map();
    const seen = new Set();
    for (const realmName of candidateRealms) {
      try {
        const response = await fetchFn(`${internalUrl}/admin/realms/${encodeURIComponent(realmName)}/groups?briefRepresentation=false`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) continue;
        const rows = await response.json().catch(() => []);
        flattenKeycloakGroups(rows, realmName).forEach((group) => {
          const key = `${String(group.realm || '').toLowerCase()}:${String(group.path || group.name || '').toLowerCase()}`;
          if (!group.name || seen.has(key)) return;
          seen.add(key);
          groups.push(group);
          realmByGroupPath.set(String(group.path || group.name || '').toLowerCase(), realmName);
        });
      } catch (_error) {
        // Try next realm candidate.
      }
    }
    groups.sort((a, b) => String(a.path || a.name).localeCompare(String(b.path || b.name)));
    const value = { groups, realmByGroupPath };
    groupsCache = { expiresAt: now + cacheTtlMs, value };
    return value;
  }

  async function fetchKeycloakGroupMembers(groupNames = [], options = {}) {
    const requested = new Set(
      (Array.isArray(groupNames) ? groupNames : [groupNames])
        .map((name) => normalizeIdentityKey(String(name || '').replace(/^\/+/, '').split('/').filter(Boolean).pop() || name))
        .filter(Boolean)
    );
    if (!requested.size) return { users: [], realmByUsername: new Map(), groupPathsByUsername: new Map() };
    const token = await getKeycloakAdminAccessToken();
    if (!token) return { users: [], realmByUsername: new Map(), groupPathsByUsername: new Map() };
    const { groups } = await fetchKeycloakGroups();
    const maxPerGroup = Math.max(1, Math.min(Number(options.maxPerGroup) || 500, 1000));
    const users = [];
    const realmByUsername = new Map();
    const groupPathsByUsername = new Map();
    const seen = new Set();
    const matchingGroups = (Array.isArray(groups) ? groups : []).filter((group) => {
      const names = [
        group.name,
        String(group.path || '').split('/').filter(Boolean).pop()
      ].map((value) => normalizeIdentityKey(value)).filter(Boolean);
      return names.some((name) => requested.has(name));
    });

    for (const group of matchingGroups) {
      const realmName = String(group.realm || realm || '').trim();
      const groupId = String(group.id || '').trim();
      if (!realmName || !groupId) continue;
      let first = 0;
      while (true) {
        const params = new URLSearchParams({
          first: String(first),
          max: String(maxPerGroup),
          briefRepresentation: 'true'
        });
        const rows = await fetchKeycloakAdminJson(
          `${internalUrl}/admin/realms/${encodeURIComponent(realmName)}/groups/${encodeURIComponent(groupId)}/members?${params.toString()}`,
          token
        );
        const arr = Array.isArray(rows) ? rows : [];
        arr.forEach((row) => {
          const username = String(row?.username || '').trim().toLowerCase();
          if (!username) return;
          const groupPath = String(group.path || group.name || '').trim();
          const memberships = groupPathsByUsername.get(username) || new Set();
          if (groupPath) memberships.add(groupPath);
          groupPathsByUsername.set(username, memberships);
          if (!seen.has(username)) {
            seen.add(username);
            users.push(row);
          }
          realmByUsername.set(username, realmName);
        });
        if (arr.length < maxPerGroup) break;
        first += maxPerGroup;
      }
    }
    return {
      users,
      realmByUsername,
      groupPathsByUsername: new Map(
        Array.from(groupPathsByUsername.entries()).map(([username, paths]) => [
          username,
          Array.from(paths).sort((a, b) => a.localeCompare(b))
        ])
      )
    };
  }

  function isVisibleKeycloakUser(user) {
    const username = String(user?.username || '').trim().toLowerCase();
    if (!username) return false;
    if (username.startsWith('service-account-')) return false;
    if (user && Object.prototype.hasOwnProperty.call(user, 'enabled') && user.enabled === false) return false;
    return true;
  }

  async function fetchKeycloakUserPermissionDefaults(users) {
    const cacheKey = (Array.isArray(users) ? users : [])
      .map((user) => `${String(user?.id || '').trim()}:${String(user?.username || '').trim().toLowerCase()}`)
      .sort()
      .join('|');
    const now = Date.now();
    const cached = permissionDefaultsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return new Map(cached.value);

    const results = new Map();
    (Array.isArray(users) ? users : []).forEach((user) => {
      const username = String(user?.username || '').trim().toLowerCase();
      if (username) results.set(username, []);
    });
    permissionDefaultsCache.set(cacheKey, {
      expiresAt: now + cacheTtlMs,
      value: Array.from(results.entries())
    });
    return results;
  }

  return {
    enrichUserProfileFromKeycloak,
    fetchKeycloakUsers,
    fetchKeycloakGroups,
    fetchKeycloakGroupMembers,
    isVisibleKeycloakUser,
    fetchKeycloakUserPermissionDefaults,
    applyKeycloakAuthSessionSettings,
    getKeycloakAdminAccessToken,
    getKeycloakCandidateRealms,
    fetchKeycloakAdminJson
  };
}

module.exports = {
  createKeycloakService
};
