function createAuthContextService(deps = {}) {
  const {
    resolvePermissionKeysFromPrincipals = () => ({ permissionKeys: [], isSuperAdmin: false })
  } = deps;

  function getHeaderString(req, name) {
    const value = req?.headers?.[name];
    const raw = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
    if (!raw) return '';
    const repairMojibake = (input) => {
      let current = String(input || '');
      for (let i = 0; i < 2 && /[ÃÂâÅÄ]/.test(current); i += 1) {
        const repaired = Buffer.from(current, 'latin1').toString('utf8');
        if (!repaired || repaired.includes('�') || repaired === current) break;
        current = repaired;
      }
      return current;
    };
    try {
      const decoded = decodeURIComponent(raw);
      return repairMojibake(decoded).normalize('NFC');
    } catch (_error) {
      return repairMojibake(raw).normalize('NFC');
    }
  }

  function decodeJwtPayload(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const json = Buffer.from(padded, 'base64').toString('utf8');
      const payload = JSON.parse(json);
      return payload && typeof payload === 'object' ? payload : null;
    } catch (_error) {
      return null;
    }
  }

  function buildApiTokenUserContext(username) {
    const apiTokenUsername = String(username || '').trim();
    if (!apiTokenUsername) return null;
    const resolved = resolvePermissionKeysFromPrincipals({
      username: apiTokenUsername,
      groups: [],
      roles: []
    });
    return {
      username: apiTokenUsername,
      displayName: apiTokenUsername,
      email: '',
      groups: [],
      roles: [],
      baseIsAdmin: resolved.permissionKeys.includes('admin.access'),
      basePermissionKeys: resolved.permissionKeys,
      baseIsSuperAdmin: resolved.isSuperAdmin
    };
  }

  function buildUserContextFromRequest(req) {
    const apiTokenContext = buildApiTokenUserContext(req?.__mamApiTokenUsername);
    if (apiTokenContext) return apiTokenContext;

    const usernameRaw =
      getHeaderString(req, 'x-forwarded-user') ||
      getHeaderString(req, 'x-auth-request-user');
    const emailRaw =
      getHeaderString(req, 'x-forwarded-email') ||
      getHeaderString(req, 'x-auth-request-email');
    const preferred =
      getHeaderString(req, 'x-forwarded-preferred-username') ||
      getHeaderString(req, 'x-auth-request-preferred-username');
    const groupsRaw =
      getHeaderString(req, 'x-forwarded-groups') ||
      getHeaderString(req, 'x-auth-request-groups');
    const accessToken =
      getHeaderString(req, 'x-forwarded-access-token') ||
      getHeaderString(req, 'x-auth-request-access-token') ||
      String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const tokenPayload = decodeJwtPayload(accessToken) || {};
    const tokenUsername = String(tokenPayload.preferred_username || tokenPayload.username || '').trim();
    const tokenEmail = String(tokenPayload.email || '').trim();
    const tokenName = String(tokenPayload.name || tokenPayload.given_name || '').trim();
    const tokenGroups = Array.isArray(tokenPayload.groups) ? tokenPayload.groups : [];
    const realmRoles = Array.isArray(tokenPayload?.realm_access?.roles) ? tokenPayload.realm_access.roles : [];
    const resourceRoles = Object.values(tokenPayload?.resource_access || {})
      .flatMap((entry) => (Array.isArray(entry?.roles) ? entry.roles : []));
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const effectiveEmail = emailRaw || tokenEmail;
    const localFromEmail = effectiveEmail.includes('@') ? effectiveEmail.split('@')[0] : '';
    const username = preferred || tokenUsername || (!uuidLike.test(usernameRaw) ? usernameRaw : '') || localFromEmail;
    const displayName = (!uuidLike.test(usernameRaw) ? usernameRaw : '') || tokenName || username || localFromEmail;
    const groups = groupsRaw
      .split(/[,\n;]+/)
      .concat(tokenGroups.map((g) => String(g || '')))
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
    const allRoles = realmRoles
      .concat(resourceRoles)
      .map((r) => String(r || '').trim().toLowerCase())
      .filter(Boolean);
    const resolved = resolvePermissionKeysFromPrincipals({
      username,
      groups,
      roles: allRoles
    });
    return {
      username,
      displayName,
      email: effectiveEmail || '',
      groups,
      roles: allRoles,
      baseIsAdmin: resolved.permissionKeys.includes('admin.access'),
      basePermissionKeys: resolved.permissionKeys,
      baseIsSuperAdmin: resolved.isSuperAdmin
    };
  }

  return {
    getHeaderString,
    decodeJwtPayload,
    buildUserContextFromRequest
  };
}

module.exports = {
  createAuthContextService
};
