function normalizeAccessName(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
}

function normalizeAccessList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .flatMap((value) => String(value || '').split(/[,\s]+/))
      .map(normalizeAccessName)
      .filter(Boolean)
  ));
}

function normalizeVisibility(value, fallback = 'public') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['private', 'group', 'groups', 'public'].includes(normalized)) return normalized;
  return fallback;
}

function getUserAccessIdentity(user = {}) {
  const username = normalizeAccessName(user.username || user.email || user.displayName);
  const email = normalizeAccessName(user.email);
  const displayName = normalizeAccessName(user.displayName);
  const groups = normalizeAccessList(user.groups || []);
  const roles = normalizeAccessList(user.roles || []);
  return {
    username,
    email,
    displayName,
    groups,
    roles,
    identifiers: Array.from(new Set([username, email, displayName].filter(Boolean)))
  };
}

function getAssetAccessSnapshot(row = {}) {
  return {
    visibility: normalizeVisibility(row.visibility, 'public'),
    ownerUser: normalizeAccessName(row.owner_user),
    ownerGroups: normalizeAccessList(row.owner_groups || []),
    allowedUsers: normalizeAccessList(row.allowed_users || []),
    allowedGroups: normalizeAccessList(row.allowed_groups || [])
  };
}

function createAssetAccessService({ pool }) {
  async function getGroupAdminGroupsForUser(user = {}) {
    const identity = getUserAccessIdentity(user);
    if (!identity.identifiers.length) return [];
    const result = await pool.query(
      `
        SELECT group_name
        FROM group_admins
        WHERE username = ANY($1::text[])
        ORDER BY group_name ASC
      `,
      [identity.identifiers]
    );
    return normalizeAccessList(result.rows.map((row) => row.group_name));
  }

  async function resolveAccessContext(req, resolveEffectivePermissions) {
    const user = typeof resolveEffectivePermissions === 'function'
      ? await resolveEffectivePermissions(req)
      : {};
    const identity = getUserAccessIdentity(user);
    const groupAdminGroups = await getGroupAdminGroupsForUser(user);
    return {
      ...user,
      accessIdentity: identity,
      groupAdminGroups,
      canManageAllAssetVisibility: Boolean(user.baseIsSuperAdmin)
    };
  }

  function appendAssetAccessWhere(where, values, context, alias = 'assets') {
    if (context?.canManageAllAssetVisibility) return;
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const identifiers = identity.identifiers || [];
    const groups = identity.groups || [];
    const conditions = [`${alias}.visibility = 'public'`];

    if (identifiers.length) {
      values.push(identifiers);
      const idx = values.length;
      conditions.push(`${alias}.owner_user = ANY($${idx}::text[])`);
      conditions.push(`${alias}.allowed_users && $${idx}::text[]`);
    }
    if (groups.length) {
      values.push(groups);
      const idx = values.length;
      conditions.push(`${alias}.owner_groups && $${idx}::text[]`);
      conditions.push(`${alias}.allowed_groups && $${idx}::text[]`);
    }

    where.push(`(${conditions.join(' OR ')})`);
  }

  function canViewAsset(row, context) {
    if (context?.canManageAllAssetVisibility) return true;
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const asset = getAssetAccessSnapshot(row);
    if (asset.visibility === 'public') return true;
    if (identity.identifiers.some((id) => id && (id === asset.ownerUser || asset.allowedUsers.includes(id)))) return true;
    if (identity.groups.some((group) => asset.ownerGroups.includes(group) || asset.allowedGroups.includes(group))) return true;
    return false;
  }

  function canManageAssetVisibility(row, context) {
    if (context?.canManageAllAssetVisibility) return true;
    const asset = getAssetAccessSnapshot(row);
    const managedGroups = normalizeAccessList(context?.groupAdminGroups || []);
    return managedGroups.some((group) => asset.ownerGroups.includes(group));
  }

  function buildNewAssetAccess(input = {}, context = {}) {
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const requestedVisibility = normalizeVisibility(input.visibility, '');
    const ownerGroups = normalizeAccessList(input.ownerGroups || input.owner_groups || identity.groups);
    const ownerUser = normalizeAccessName(input.ownerUser || input.owner_user || identity.username || identity.email);
    const defaultVisibility = ownerGroups.length ? 'group' : (ownerUser ? 'private' : 'public');
    return {
      visibility: requestedVisibility || defaultVisibility,
      ownerUser,
      ownerGroups,
      allowedUsers: normalizeAccessList(input.allowedUsers || input.allowed_users || []),
      allowedGroups: normalizeAccessList(input.allowedGroups || input.allowed_groups || [])
    };
  }

  async function updateAssetVisibility(assetId, payload = {}, context = {}) {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = assetResult.rows[0];
    if (!row) return { status: 404, error: 'Asset not found' };
    if (!canManageAssetVisibility(row, context)) return { status: 403, error: 'Forbidden' };

    const current = getAssetAccessSnapshot(row);
    const next = {
      visibility: normalizeVisibility(payload.visibility, current.visibility),
      allowedUsers: Object.prototype.hasOwnProperty.call(payload, 'allowedUsers')
        ? normalizeAccessList(payload.allowedUsers)
        : current.allowedUsers,
      allowedGroups: Object.prototype.hasOwnProperty.call(payload, 'allowedGroups')
        ? normalizeAccessList(payload.allowedGroups)
        : current.allowedGroups
    };
    const updated = await pool.query(
      `
        UPDATE assets
        SET visibility = $2,
            allowed_users = $3,
            allowed_groups = $4,
            updated_at = $5
        WHERE id = $1
        RETURNING *
      `,
      [assetId, next.visibility, next.allowedUsers, next.allowedGroups, new Date().toISOString()]
    );
    return { status: 200, row: updated.rows[0] };
  }

  return {
    normalizeAccessName,
    normalizeAccessList,
    normalizeVisibility,
    getUserAccessIdentity,
    getAssetAccessSnapshot,
    getGroupAdminGroupsForUser,
    resolveAccessContext,
    appendAssetAccessWhere,
    canViewAsset,
    canManageAssetVisibility,
    buildNewAssetAccess,
    updateAssetVisibility
  };
}

module.exports = {
  createAssetAccessService,
  normalizeAccessName,
  normalizeAccessList,
  normalizeVisibility,
  getUserAccessIdentity,
  getAssetAccessSnapshot
};
