function normalizeAccessName(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
}

function normalizeAccessList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .flatMap((value) => String(value || '').split(/[,\n;]+/))
      .map(normalizeAccessName)
      .filter(Boolean)
  ));
}

function normalizeVisibility(value, fallback = 'public') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['private', 'group', 'groups', 'public'].includes(normalized)) return normalized;
  return fallback;
}

const ASSET_TYPE_GROUPS = ['video', 'audio', 'photo', 'document', 'other'];
const ADMIN_SCOPE_GROUPS = ['asset-rights', 'document-rights', 'text-admin'];

function normalizeAssetTypeGroup(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ASSET_TYPE_GROUPS.includes(normalized)) return normalized;
  return fallback;
}

function normalizeAdminScope(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ADMIN_SCOPE_GROUPS.includes(normalized)) return normalized;
  return fallback;
}

function normalizeAdminScopeList(values, fallback = []) {
  const list = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .flatMap((value) => String(value || '').split(/[,\n;]+/))
      .map((value) => normalizeAdminScope(value))
      .filter(Boolean)
  ));
  if (list.length) return list;
  return Array.isArray(fallback) ? fallback.filter((scope) => ADMIN_SCOPE_GROUPS.includes(scope)) : [];
}

function normalizeAssetTypeGroupList(values, fallback = []) {
  const list = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .flatMap((value) => String(value || '').split(/[,\n;]+/))
      .map((value) => normalizeAssetTypeGroup(value))
      .filter(Boolean)
  ));
  if (list.length) return list;
  return Array.isArray(fallback) ? fallback.filter((group) => ASSET_TYPE_GROUPS.includes(group)) : [];
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
    ownerUser: normalizeAccessName(row.owner_user || row.ownerUser),
    ownerGroups: normalizeAccessList(row.owner_groups || row.ownerGroups || []),
    allowedUsers: normalizeAccessList(row.allowed_users || row.allowedUsers || []),
    allowedGroups: normalizeAccessList(row.allowed_groups || row.allowedGroups || []),
    deniedUsers: normalizeAccessList(row.denied_users || row.deniedUsers || []),
    deniedGroups: normalizeAccessList(row.denied_groups || row.deniedGroups || []),
    editAllowedUsers: normalizeAccessList(row.edit_allowed_users || row.editAllowedUsers || []),
    editAllowedGroups: normalizeAccessList(row.edit_allowed_groups || row.editAllowedGroups || []),
    editDeniedUsers: normalizeAccessList(row.edit_denied_users || row.editDeniedUsers || []),
    editDeniedGroups: normalizeAccessList(row.edit_denied_groups || row.editDeniedGroups || []),
    downloadAllowedUsers: normalizeAccessList(row.download_allowed_users || row.downloadAllowedUsers || []),
    downloadAllowedGroups: normalizeAccessList(row.download_allowed_groups || row.downloadAllowedGroups || []),
    downloadDeniedUsers: normalizeAccessList(row.download_denied_users || row.downloadDeniedUsers || []),
    downloadDeniedGroups: normalizeAccessList(row.download_denied_groups || row.downloadDeniedGroups || [])
  };
}

function getTypeAccessSnapshot(row = {}) {
  return {
    typeGroup: normalizeAssetTypeGroup(row.type_group || row.typeGroup),
    visibility: normalizeVisibility(row.visibility, 'public'),
    ownerGroups: normalizeAccessList(row.owner_groups || row.ownerGroups || []),
    allowedUsers: normalizeAccessList(row.allowed_users || row.allowedUsers || []),
    allowedGroups: normalizeAccessList(row.allowed_groups || row.allowedGroups || []),
    deniedUsers: normalizeAccessList(row.denied_users || row.deniedUsers || []),
    deniedGroups: normalizeAccessList(row.denied_groups || row.deniedGroups || []),
    editAllowedUsers: normalizeAccessList(row.edit_allowed_users || row.editAllowedUsers || []),
    editAllowedGroups: normalizeAccessList(row.edit_allowed_groups || row.editAllowedGroups || []),
    editDeniedUsers: normalizeAccessList(row.edit_denied_users || row.editDeniedUsers || []),
    editDeniedGroups: normalizeAccessList(row.edit_denied_groups || row.editDeniedGroups || []),
    downloadAllowedUsers: normalizeAccessList(row.download_allowed_users || row.downloadAllowedUsers || []),
    downloadAllowedGroups: normalizeAccessList(row.download_allowed_groups || row.downloadAllowedGroups || []),
    downloadDeniedUsers: normalizeAccessList(row.download_denied_users || row.downloadDeniedUsers || []),
    downloadDeniedGroups: normalizeAccessList(row.download_denied_groups || row.downloadDeniedGroups || []),
    uploadAllowedUsers: normalizeAccessList(row.upload_allowed_users || row.uploadAllowedUsers || []),
    uploadAllowedGroups: normalizeAccessList(row.upload_allowed_groups || row.uploadAllowedGroups || []),
    uploadDeniedUsers: normalizeAccessList(row.upload_denied_users || row.uploadDeniedUsers || []),
    uploadDeniedGroups: normalizeAccessList(row.upload_denied_groups || row.uploadDeniedGroups || []),
    updatedAt: row.updated_at || null,
    updatedBy: String(row.updated_by || '')
  };
}

function isDocumentAsset(row = {}) {
  const type = String(row.type || '').trim().toLowerCase();
  const mimeType = String(row.mime_type || row.mimeType || '').trim().toLowerCase();
  const fileName = String(row.file_name || row.fileName || '').trim().toLowerCase();
  if (['document', 'pdf', 'office', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(type)) return true;
  if (mimeType === 'application/pdf') return true;
  if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('powerpoint') || mimeType.includes('presentation') || mimeType.includes('opendocument')) return true;
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|rtf|csv|md|json|xml|yaml|yml|log|ini|cfg|conf)$/i.test(fileName);
}

function getAssetTypeGroup(row = {}) {
  const type = String(row.type || '').trim().toLowerCase();
  const mimeType = String(row.mime_type || row.mimeType || '').trim().toLowerCase();
  const fileName = String(row.file_name || row.fileName || '').trim().toLowerCase();
  if (type === 'video' || mimeType.startsWith('video/')) return 'video';
  if (['audio', 'sound'].includes(type) || mimeType.startsWith('audio/')) return 'audio';
  if (['photo', 'image', 'picture'].includes(type) || mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|tif|tiff|bmp|heic|heif)$/i.test(fileName)) return 'photo';
  if (isDocumentAsset(row)) return 'document';
  return 'other';
}

function buildAssetTypeGroupSql(group, alias = 'assets') {
  const safeGroup = normalizeAssetTypeGroup(group);
  if (safeGroup === 'video') {
    return `(LOWER(COALESCE(${alias}.type, '')) = 'video' OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE 'video/%')`;
  }
  if (safeGroup === 'audio') {
    return `(LOWER(COALESCE(${alias}.type, '')) IN ('audio', 'sound') OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE 'audio/%')`;
  }
  if (safeGroup === 'photo') {
    return `(
      LOWER(COALESCE(${alias}.type, '')) IN ('photo', 'image', 'picture')
      OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE 'image/%'
      OR LOWER(COALESCE(${alias}.file_name, '')) ~ '\\.(jpg|jpeg|png|gif|webp|tif|tiff|bmp|heic|heif)$'
    )`;
  }
  if (safeGroup === 'document') return buildDocumentAssetSql(alias);
  if (safeGroup === 'other') {
    return `NOT (
      ${buildAssetTypeGroupSql('video', alias)}
      OR ${buildAssetTypeGroupSql('audio', alias)}
      OR ${buildAssetTypeGroupSql('photo', alias)}
      OR ${buildDocumentAssetSql(alias)}
    )`;
  }
  return 'FALSE';
}

function identityMatchesAny(identity = {}, users = [], groups = []) {
  const safeUsers = normalizeAccessList(users);
  const safeGroups = normalizeAccessList(groups);
  return Boolean(
    (identity.identifiers || []).some((id) => safeUsers.includes(id))
    || (identity.groups || []).some((group) => safeGroups.includes(group))
  );
}

function buildDocumentAssetSql(alias = 'assets') {
  return `(
    LOWER(COALESCE(${alias}.type, '')) IN ('document', 'pdf', 'office', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp')
    OR LOWER(COALESCE(${alias}.mime_type, '')) = 'application/pdf'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%word%'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%excel%'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%sheet%'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%powerpoint%'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%presentation%'
    OR LOWER(COALESCE(${alias}.mime_type, '')) LIKE '%opendocument%'
    OR LOWER(COALESCE(${alias}.file_name, '')) ~ '\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|rtf|csv|md|json|xml|yaml|yml|log|ini|cfg|conf)$'
  )`;
}

function createAssetAccessService({ pool }) {
  async function getAssetTypeAccessRows() {
    const result = await pool.query(
      `
        SELECT *
        FROM asset_type_access
        ORDER BY CASE type_group
          WHEN 'video' THEN 1
          WHEN 'audio' THEN 2
          WHEN 'photo' THEN 3
          WHEN 'document' THEN 4
          ELSE 5
        END
      `
    );
    return result.rows.map(getTypeAccessSnapshot).filter((row) => row.typeGroup);
  }

  function normalizeGroupAdminAssignment(row = {}) {
    const groupName = normalizeAccessName(row.group_name || row.groupName);
    if (!groupName) return null;
    const scopes = normalizeAdminScopeList(row.admin_scopes || row.adminScopes, ['asset-rights']);
    const assetTypeGroups = normalizeAssetTypeGroupList(row.asset_type_groups || row.assetTypeGroups, []);
    return {
      groupName,
      username: normalizeAccessName(row.username),
      adminScopes: scopes,
      assetTypeGroups
    };
  }

  async function getGroupAdminAssignmentsForUser(user = {}) {
    const identity = getUserAccessIdentity(user);
    const principals = Array.from(new Set([
      ...(identity.identifiers || []),
      ...(identity.groups || []),
      ...(identity.roles || [])
    ].filter(Boolean)));
    if (!principals.length) return [];
    const result = await pool.query(
      `
        SELECT group_name, username, admin_scopes, asset_type_groups
        FROM group_admins
        WHERE username = ANY($1::text[])
        ORDER BY group_name ASC
      `,
      [principals]
    );
    return result.rows.map(normalizeGroupAdminAssignment).filter(Boolean);
  }

  async function getGroupAdminGroupsForUser(user = {}) {
    const assignments = await getGroupAdminAssignmentsForUser(user);
    return normalizeAccessList(assignments.map((row) => row.groupName));
  }

  function getManagedGroupsForScope(context = {}, scope = 'asset-rights', typeGroup = '') {
    const safeScope = normalizeAdminScope(scope);
    if (!safeScope) return [];
    const safeTypeGroup = normalizeAssetTypeGroup(typeGroup);
    const assignments = Array.isArray(context.groupAdminAssignments)
      ? context.groupAdminAssignments
      : [];
    const scopedGroups = assignments
      .filter((assignment) => {
        const scopes = normalizeAdminScopeList(assignment.adminScopes, ['asset-rights']);
        if (!scopes.includes(safeScope)) return false;
        const typeGroups = normalizeAssetTypeGroupList(assignment.assetTypeGroups, []);
        if (!safeTypeGroup || !typeGroups.length) return true;
        return typeGroups.includes(safeTypeGroup);
      })
      .map((assignment) => assignment.groupName);
    if (scopedGroups.length) {
      const identityGroups = normalizeAccessList(context?.accessIdentity?.groups || []);
      const memberManagedGroups = identityGroups.filter((group) => !scopedGroups.includes(group));
      return normalizeAccessList([...scopedGroups, ...memberManagedGroups]);
    }
    if (safeScope === 'asset-rights') return normalizeAccessList(context.groupAdminGroups || []);
    return [];
  }

  function hasScopedAdminScopeAccess(context = {}, scope = 'asset-rights', typeGroup = '') {
    return getManagedGroupsForScope(context, scope, typeGroup).length > 0;
  }

  async function resolveAccessContext(req, resolveEffectivePermissions) {
    if (req?.__mamAssetAccessContext) return req.__mamAssetAccessContext;
    const user = typeof resolveEffectivePermissions === 'function'
      ? await resolveEffectivePermissions(req)
      : {};
    const identity = getUserAccessIdentity(user);
    const groupAdminAssignments = await getGroupAdminAssignmentsForUser(user);
    const groupAdminGroups = normalizeAccessList(groupAdminAssignments.map((row) => row.groupName));
    const assetTypeAccessRules = await getAssetTypeAccessRows();
    const context = {
      ...user,
      accessIdentity: identity,
      groupAdminAssignments,
      groupAdminGroups,
      assetTypeAccessRules,
      canBypassAssetTypeAccess: Boolean(user.isSuperAdmin),
      canBypassAssetVisibility: Boolean(user.isSuperAdmin),
      canManageAllAssetVisibility: Boolean(user.isSuperAdmin || user.canAccessAdmin || user.isAdmin)
    };
    if (req && typeof req === 'object') req.__mamAssetAccessContext = context;
    return context;
  }

  function hasScopedAssetRightsAdminAccess(context = {}) {
    return hasScopedAdminScopeAccess(context, 'asset-rights');
  }

  function appendExplicitAssetViewConditions(conditions, values, context, alias = 'assets') {
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const identifiers = identity.identifiers || [];
    const groups = identity.groups || [];
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
  }

  function hasExplicitAssetViewGrant(asset = {}, identity = {}) {
    return Boolean(
      (identity.identifiers || []).some((id) => id && (id === asset.ownerUser || asset.allowedUsers.includes(id)))
      || (identity.groups || []).some((group) => asset.ownerGroups.includes(group) || asset.allowedGroups.includes(group))
    );
  }

  function hasExplicitAssetDownloadGrant(asset = {}, identity = {}) {
    return Boolean(
      (identity.identifiers || []).some((id) => id && (id === asset.ownerUser || asset.downloadAllowedUsers.includes(id)))
      || (identity.groups || []).some((group) => asset.ownerGroups.includes(group) || asset.downloadAllowedGroups.includes(group))
    );
  }

  function hasExplicitAssetEditGrant(asset = {}, identity = {}) {
    return Boolean(identityMatchesAny(identity, asset.editAllowedUsers, asset.editAllowedGroups));
  }

  function appendAssetAccessWhere(where, values, context, alias = 'assets') {
    if (context?.canBypassAssetTypeAccess) return;
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const identifiers = identity.identifiers || [];
    const groups = identity.groups || [];
    const explicitAssetViewConditions = [];
    if (identifiers.length) {
      values.push(identifiers);
      const idx = values.length;
      where.push(`NOT (COALESCE(${alias}.denied_users, '{}') && $${idx}::text[])`);
    }
    if (groups.length) {
      values.push(groups);
      const idx = values.length;
      where.push(`NOT (COALESCE(${alias}.denied_groups, '{}') && $${idx}::text[])`);
    }
    appendExplicitAssetViewConditions(explicitAssetViewConditions, values, context, alias);
    appendAssetTypeAccessWhere(where, values, context, alias, explicitAssetViewConditions);
    if (context?.canBypassAssetVisibility) return;
    const conditions = [`${alias}.visibility = 'public'`, ...explicitAssetViewConditions];

    where.push(`(${conditions.join(' OR ')})`);
  }

  function appendAssetTypeAccessWhere(where, values, context, alias = 'assets', explicitAssetViewConditions = []) {
    const rules = Array.isArray(context?.assetTypeAccessRules) ? context.assetTypeAccessRules : [];
    if (!rules.length) return;
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const identifiers = identity.identifiers || [];
    const groups = identity.groups || [];
    const explicitAssetViewSql = explicitAssetViewConditions.length ? `(${explicitAssetViewConditions.join(' OR ')})` : '';

    rules.forEach((rule) => {
      const typeSql = buildAssetTypeGroupSql(rule.typeGroup, alias);
      if (identifiers.length && rule.deniedUsers.length) {
        values.push(identifiers);
        const deniedSql = `NOT (${typeSql} AND $${values.length}::text[] && ARRAY[${rule.deniedUsers.map((_, idx) => `$${values.length + idx + 1}`).join(', ')}]::text[])`;
        where.push(deniedSql);
        rule.deniedUsers.forEach((item) => values.push(item));
      }
      if (groups.length && rule.deniedGroups.length) {
        values.push(groups);
        const deniedSql = `NOT (${typeSql} AND $${values.length}::text[] && ARRAY[${rule.deniedGroups.map((_, idx) => `$${values.length + idx + 1}`).join(', ')}]::text[])`;
        where.push(deniedSql);
        rule.deniedGroups.forEach((item) => values.push(item));
      }
    });

    const allowConditions = rules.map((rule) => {
      const typeSql = buildAssetTypeGroupSql(rule.typeGroup, alias);
      if (rule.visibility === 'public') return typeSql;
      const checks = [];
      if (identifiers.length) {
        values.push(identifiers);
        const idx = values.length;
        if (rule.allowedUsers.length) {
          values.push(rule.allowedUsers);
          checks.push(`$${idx}::text[] && $${values.length}::text[]`);
        }
        if (rule.editAllowedUsers.length) {
          values.push(rule.editAllowedUsers);
          checks.push(`$${idx}::text[] && $${values.length}::text[]`);
        }
      }
      if (groups.length) {
        values.push(groups);
        const idx = values.length;
        [rule.ownerGroups, rule.allowedGroups, rule.editAllowedGroups].forEach((list) => {
          if (!list.length) return;
          values.push(list);
          checks.push(`$${idx}::text[] && $${values.length}::text[]`);
        });
      }
      return checks.length ? `(${typeSql} AND (${checks.join(' OR ')}))` : `FALSE`;
    });
    if (allowConditions.length) {
      where.push(explicitAssetViewSql ? `((${allowConditions.join(' OR ')}) OR ${explicitAssetViewSql})` : `(${allowConditions.join(' OR ')})`);
    }
  }

  function getTypeRuleForAsset(row, context = {}) {
    const typeGroup = getAssetTypeGroup(row);
    const rules = Array.isArray(context.assetTypeAccessRules) ? context.assetTypeAccessRules : [];
    return rules.find((rule) => rule.typeGroup === typeGroup) || {
      typeGroup,
      visibility: 'public',
      ownerGroups: [],
      allowedUsers: [],
      allowedGroups: [],
      deniedUsers: [],
      deniedGroups: [],
      editAllowedUsers: [],
      editAllowedGroups: [],
      editDeniedUsers: [],
      editDeniedGroups: [],
      downloadAllowedUsers: [],
      downloadAllowedGroups: [],
      downloadDeniedUsers: [],
      downloadDeniedGroups: [],
      uploadAllowedUsers: [],
      uploadAllowedGroups: [],
      uploadDeniedUsers: [],
      uploadDeniedGroups: []
    };
  }

  function canViewAssetType(row, context) {
    const rule = getTypeRuleForAsset(row, context);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, rule.deniedUsers, rule.deniedGroups)) return false;
    if (rule.visibility === 'public') return true;
    if (identity.identifiers.some((id) => rule.allowedUsers.includes(id))) return true;
    if (identity.groups.some((group) => rule.ownerGroups.includes(group) || rule.allowedGroups.includes(group))) return true;
    return false;
  }

  function isDeniedByAssetType(row, context) {
    const rule = getTypeRuleForAsset(row, context);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    return identityMatchesAny(identity, rule.deniedUsers, rule.deniedGroups);
  }

  function canEditAssetType(row, context) {
    const rule = getTypeRuleForAsset(row, context);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, rule.editDeniedUsers, rule.editDeniedGroups)) return false;
    if (context?.canBypassAssetVisibility) return true;
    if (identityMatchesAny(identity, rule.editAllowedUsers, rule.editAllowedGroups)) return true;
    return rule.visibility === 'public' || canViewAssetType(row, context);
  }

  function getAllowedAssetTypeGroups(context = {}) {
    if (context?.canBypassAssetTypeAccess) return [...ASSET_TYPE_GROUPS];
    return ASSET_TYPE_GROUPS.filter((typeGroup) => {
      const row = { type: typeGroup, mime_type: '', file_name: '' };
      return canViewAssetType(row, context);
    });
  }

  function canCreateAssetOfType(input = {}, context = {}) {
    const typeGroup = normalizeAssetTypeGroup(input.typeGroup) || getAssetTypeGroup({
      type: input.type || input.declaredType,
      mime_type: input.mimeType || input.mime_type,
      file_name: input.fileName || input.file_name
    });
    return getAllowedAssetTypeGroups(context).includes(typeGroup);
  }

  function canUploadAssetType(input = {}, context = {}) {
    if (context?.canBypassAssetTypeAccess) return true;
    const typeGroup = normalizeAssetTypeGroup(input.typeGroup);
    const row = {
      type: typeGroup || input.type || input.declaredType,
      mime_type: input.mimeType || input.mime_type,
      file_name: input.fileName || input.file_name
    };
    const rule = getTypeRuleForAsset(row, context);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, rule.uploadDeniedUsers, rule.uploadDeniedGroups)) return false;
    const hasExplicitUploadRules = Boolean(rule.uploadAllowedUsers.length || rule.uploadAllowedGroups.length);
    if (!hasExplicitUploadRules) return canCreateAssetOfType(row, context);
    return identityMatchesAny(identity, rule.uploadAllowedUsers, rule.uploadAllowedGroups);
  }

  function getAllowedUploadAssetTypeGroups(context = {}) {
    if (context?.canBypassAssetTypeAccess) return [...ASSET_TYPE_GROUPS];
    return ASSET_TYPE_GROUPS.filter((typeGroup) => canUploadAssetType({ typeGroup }, context));
  }

  function canViewAsset(row, context) {
    if (context?.canBypassAssetTypeAccess) return true;
    const asset = getAssetAccessSnapshot(row);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, asset.deniedUsers, asset.deniedGroups)) return false;
    if (context?.canBypassAssetVisibility) return true;
    if (isDeniedByAssetType(row, context)) return false;
    if (hasExplicitAssetViewGrant(asset, identity)) return true;
    if (!canViewAssetType(row, context)) return false;
    if (asset.visibility === 'public') return true;
    return false;
  }

  function canManageAssetVisibility(row, context) {
    if (context?.canManageAllAssetVisibility) return true;
    const asset = getAssetAccessSnapshot(row);
    const managedGroups = getManagedGroupsForScope(context, 'asset-rights', getAssetTypeGroup(row));
    return managedGroups.some((group) => asset.ownerGroups.includes(group));
  }

  function canManageAssetTypeAccess(row, context) {
    if (context?.canManageAllAssetVisibility) return true;
    const rule = getTypeAccessSnapshot(row);
    const managedGroups = getManagedGroupsForScope(context, 'asset-rights', rule.typeGroup);
    if (!managedGroups.length) return false;
    if (
      Array.isArray(context?.groupAdminAssignments)
      && context.groupAdminAssignments.some((assignment) => {
        const scopes = normalizeAdminScopeList(assignment.adminScopes, ['asset-rights']);
        if (!scopes.includes('asset-rights')) return false;
        const typeGroups = normalizeAssetTypeGroupList(assignment.assetTypeGroups, []);
        return !typeGroups.length || typeGroups.includes(rule.typeGroup);
      })
    ) {
      return true;
    }
    const managedTypeGroups = new Set(
      [
        rule.ownerGroups,
        rule.allowedGroups,
        rule.deniedGroups,
        rule.editAllowedGroups,
        rule.editDeniedGroups,
        rule.downloadAllowedGroups,
        rule.downloadDeniedGroups,
        rule.uploadAllowedGroups,
        rule.uploadDeniedGroups
      ].flat()
    );
    return managedGroups.some((group) => managedTypeGroups.has(group));
  }

  function appendManageableAssetAccessWhere(where, values, context, alias = 'assets') {
    if (context?.canManageAllAssetVisibility) return;
    const managedGroups = getManagedGroupsForScope(context, 'asset-rights');
    if (!managedGroups.length) {
      where.push('FALSE');
      return;
    }
    values.push(managedGroups);
    where.push(`(
      COALESCE(${alias}.owner_groups, '{}') && $${values.length}::text[]
      OR COALESCE(${alias}.allowed_groups, '{}') && $${values.length}::text[]
      OR COALESCE(${alias}.edit_allowed_groups, '{}') && $${values.length}::text[]
      OR COALESCE(${alias}.download_allowed_groups, '{}') && $${values.length}::text[]
    )`);
  }

  function limitGroupsForScopedAdmin(values, context) {
    const list = normalizeAccessList(values || []);
    if (context?.canManageAllAssetVisibility) return list;
    const managed = getManagedGroupsForScope(context, 'asset-rights');
    if (!managed.length) return [];
    return list.filter((group) => managed.includes(group));
  }

  function canDownloadAsset(row, context) {
    if (!canViewAsset(row, context)) return false;
    if (context?.canBypassAssetVisibility) return true;
    const asset = getAssetAccessSnapshot(row);
    const rule = getTypeRuleForAsset(row, context);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, asset.downloadDeniedUsers, asset.downloadDeniedGroups)) return false;
    if (hasExplicitAssetDownloadGrant(asset, identity)) return true;
    if (identityMatchesAny(identity, rule.downloadDeniedUsers, rule.downloadDeniedGroups)) return false;
    const hasExplicitDownloadRules = Boolean(
      asset.downloadAllowedUsers.length
      || asset.downloadAllowedGroups.length
      || rule.downloadAllowedUsers.length
      || rule.downloadAllowedGroups.length
    );
    if (!hasExplicitDownloadRules) return true;
    return Boolean(
      identityMatchesAny(identity, rule.downloadAllowedUsers, rule.downloadAllowedGroups)
    );
  }

  function canEditAsset(row, context) {
    if (!canViewAsset(row, context)) return false;
    const asset = getAssetAccessSnapshot(row);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, asset.editDeniedUsers, asset.editDeniedGroups)) return false;
    if (hasExplicitAssetEditGrant(asset, identity)) return true;
    if (!canEditAssetType(row, context)) return false;
    if (context?.canManageAllAssetVisibility) return true;
    return Boolean(context?.canEditMetadata || context?.canAccessAdmin);
  }

  function canDeleteAsset(row, context) {
    if (!canViewAsset(row, context)) return false;
    const asset = getAssetAccessSnapshot(row);
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    if (identityMatchesAny(identity, asset.editDeniedUsers, asset.editDeniedGroups)) return false;
    if (!canEditAssetType(row, context)) return false;
    if (context?.canManageAllAssetVisibility) return true;
    if (
      getManagedGroupsForScope(context, 'asset-rights', getAssetTypeGroup(row)).length
      && asset.ownerUser
      && identity.identifiers.includes(asset.ownerUser)
    ) {
      return true;
    }
    return Boolean(context?.canDeleteAssets);
  }

  function buildNewAssetAccess(input = {}, context = {}) {
    const identity = context?.accessIdentity || getUserAccessIdentity(context || {});
    const requestedVisibility = normalizeVisibility(input.visibility, '');
    const requestedOwnerGroups = normalizeAccessList(input.ownerGroups || input.owner_groups || []);
    const managedGroups = getManagedGroupsForScope(
      { ...context, accessIdentity: identity },
      'asset-rights',
      input.typeGroup || input.type_group || input.type || ''
    );
    const identityGroups = normalizeAccessList(identity.groups || []);
    let ownerGroups = [];
    if (requestedOwnerGroups.length) {
      if (context?.canBypassAssetVisibility) ownerGroups = requestedOwnerGroups;
      else if (managedGroups.length) ownerGroups = requestedOwnerGroups.filter((group) => managedGroups.includes(group));
      else ownerGroups = requestedOwnerGroups.filter((group) => identityGroups.includes(group));
    }
    if (!ownerGroups.length) {
      ownerGroups = !context?.canBypassAssetVisibility && managedGroups.length
        ? managedGroups
        : identityGroups;
    }
    const ownerUser = normalizeAccessName(input.ownerUser || input.owner_user || identity.username || identity.email);
    const defaultVisibility = ownerGroups.length ? 'group' : (ownerUser ? 'private' : 'public');
    return {
      visibility: requestedVisibility || defaultVisibility,
      ownerUser,
      ownerGroups,
      allowedUsers: normalizeAccessList(input.allowedUsers || input.allowed_users || []),
      allowedGroups: normalizeAccessList(input.allowedGroups || input.allowed_groups || []),
      deniedUsers: normalizeAccessList(input.deniedUsers || input.denied_users || []),
      deniedGroups: normalizeAccessList(input.deniedGroups || input.denied_groups || []),
      editAllowedUsers: normalizeAccessList(input.editAllowedUsers || input.edit_allowed_users || []),
      editAllowedGroups: normalizeAccessList(input.editAllowedGroups || input.edit_allowed_groups || []),
      editDeniedUsers: normalizeAccessList(input.editDeniedUsers || input.edit_denied_users || []),
      editDeniedGroups: normalizeAccessList(input.editDeniedGroups || input.edit_denied_groups || []),
      downloadAllowedUsers: normalizeAccessList(input.downloadAllowedUsers || input.download_allowed_users || []),
      downloadAllowedGroups: normalizeAccessList(input.downloadAllowedGroups || input.download_allowed_groups || []),
      downloadDeniedUsers: normalizeAccessList(input.downloadDeniedUsers || input.download_denied_users || []),
      downloadDeniedGroups: normalizeAccessList(input.downloadDeniedGroups || input.download_denied_groups || [])
    };
  }

  async function updateAssetVisibility(assetId, payload = {}, context = {}) {
    const assetResult = await pool.query('SELECT * FROM assets WHERE id = $1', [assetId]);
    const row = assetResult.rows[0];
    if (!row) return { status: 404, error: 'Asset not found' };
    if (!canManageAssetVisibility(row, context)) return { status: 403, error: 'Forbidden' };

    const current = getAssetAccessSnapshot(row);
    const nextOwnerGroups = Object.prototype.hasOwnProperty.call(payload, 'ownerGroups')
      ? limitGroupsForScopedAdmin(payload.ownerGroups, context)
      : current.ownerGroups;
    const next = {
      visibility: normalizeVisibility(payload.visibility, current.visibility),
      ownerGroups: nextOwnerGroups,
      allowedUsers: Object.prototype.hasOwnProperty.call(payload, 'allowedUsers')
        ? normalizeAccessList(payload.allowedUsers)
        : current.allowedUsers,
      allowedGroups: Object.prototype.hasOwnProperty.call(payload, 'allowedGroups')
        ? limitGroupsForScopedAdmin(payload.allowedGroups, context)
        : current.allowedGroups,
      deniedUsers: Object.prototype.hasOwnProperty.call(payload, 'deniedUsers')
        ? normalizeAccessList(payload.deniedUsers)
        : current.deniedUsers,
      deniedGroups: Object.prototype.hasOwnProperty.call(payload, 'deniedGroups')
        ? limitGroupsForScopedAdmin(payload.deniedGroups, context)
        : current.deniedGroups,
      editAllowedUsers: Object.prototype.hasOwnProperty.call(payload, 'editAllowedUsers')
        ? normalizeAccessList(payload.editAllowedUsers)
        : current.editAllowedUsers,
      editAllowedGroups: Object.prototype.hasOwnProperty.call(payload, 'editAllowedGroups')
        ? limitGroupsForScopedAdmin(payload.editAllowedGroups, context)
        : current.editAllowedGroups,
      editDeniedUsers: Object.prototype.hasOwnProperty.call(payload, 'editDeniedUsers')
        ? normalizeAccessList(payload.editDeniedUsers)
        : current.editDeniedUsers,
      editDeniedGroups: Object.prototype.hasOwnProperty.call(payload, 'editDeniedGroups')
        ? limitGroupsForScopedAdmin(payload.editDeniedGroups, context)
        : current.editDeniedGroups,
      downloadAllowedUsers: Object.prototype.hasOwnProperty.call(payload, 'downloadAllowedUsers')
        ? normalizeAccessList(payload.downloadAllowedUsers)
        : current.downloadAllowedUsers,
      downloadAllowedGroups: Object.prototype.hasOwnProperty.call(payload, 'downloadAllowedGroups')
        ? limitGroupsForScopedAdmin(payload.downloadAllowedGroups, context)
        : current.downloadAllowedGroups,
      downloadDeniedUsers: Object.prototype.hasOwnProperty.call(payload, 'downloadDeniedUsers')
        ? normalizeAccessList(payload.downloadDeniedUsers)
        : current.downloadDeniedUsers,
      downloadDeniedGroups: Object.prototype.hasOwnProperty.call(payload, 'downloadDeniedGroups')
        ? limitGroupsForScopedAdmin(payload.downloadDeniedGroups, context)
        : current.downloadDeniedGroups
    };
    const updated = await pool.query(
      `
        UPDATE assets
        SET visibility = $2,
            owner_groups = $3,
            allowed_users = $4,
            allowed_groups = $5,
            denied_users = $6,
            denied_groups = $7,
            edit_allowed_users = $8,
            edit_allowed_groups = $9,
            edit_denied_users = $10,
            edit_denied_groups = $11,
            download_allowed_users = $12,
            download_allowed_groups = $13,
            download_denied_users = $14,
            download_denied_groups = $15,
            updated_at = $16
        WHERE id = $1
        RETURNING *
      `,
      [
        assetId,
        next.visibility,
        next.ownerGroups,
        next.allowedUsers,
        next.allowedGroups,
        next.deniedUsers,
        next.deniedGroups,
        next.editAllowedUsers,
        next.editAllowedGroups,
        next.editDeniedUsers,
        next.editDeniedGroups,
        next.downloadAllowedUsers,
        next.downloadAllowedGroups,
        next.downloadDeniedUsers,
        next.downloadDeniedGroups,
        new Date().toISOString()
      ]
    );
    return { status: 200, row: updated.rows[0] };
  }

  return {
    normalizeAccessName,
    normalizeAccessList,
    normalizeVisibility,
    normalizeAssetTypeGroup,
    normalizeAdminScope,
    normalizeAdminScopeList,
    normalizeAssetTypeGroupList,
    getUserAccessIdentity,
    getAssetAccessSnapshot,
    getTypeAccessSnapshot,
    getAssetTypeAccessRows,
    getAssetTypeGroup,
    buildAssetTypeGroupSql,
    getAllowedAssetTypeGroups,
    getAllowedUploadAssetTypeGroups,
    canCreateAssetOfType,
    canUploadAssetType,
    getGroupAdminAssignmentsForUser,
    getGroupAdminGroupsForUser,
    getManagedGroupsForScope,
    hasScopedAdminScopeAccess,
    resolveAccessContext,
    appendAssetAccessWhere,
    appendManageableAssetAccessWhere,
    hasScopedAssetRightsAdminAccess,
    canViewAsset,
    canEditAsset,
    canDownloadAsset,
    canDeleteAsset,
    canManageAssetVisibility,
    canManageAssetTypeAccess,
    buildNewAssetAccess,
    updateAssetVisibility
  };
}

module.exports = {
  createAssetAccessService,
  normalizeAccessName,
  normalizeAccessList,
  normalizeVisibility,
  normalizeAssetTypeGroup,
  normalizeAdminScope,
  normalizeAdminScopeList,
  normalizeAssetTypeGroupList,
  getUserAccessIdentity,
  getAssetAccessSnapshot,
  getTypeAccessSnapshot,
  getAssetTypeGroup,
  buildAssetTypeGroupSql,
  ASSET_TYPE_GROUPS,
  ADMIN_SCOPE_GROUPS
};
