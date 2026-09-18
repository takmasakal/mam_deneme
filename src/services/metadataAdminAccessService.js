const { getUserAccessIdentity, getAssetAccessSnapshot } = require('./assetAccessService');

function createMetadataAdminAccessService(assetAccessService) {
  function canManage(row, context = {}) {
    if (!context.canAccessMetadataAdmin || row?.deleted_at) return false;
    if (context.isSuperAdmin || context.canAccessAdmin) return true;
    const identity = context.accessIdentity || getUserAccessIdentity(context);
    const asset = getAssetAccessSnapshot(row);
    const inScope = identity.groups.some((group) => asset.ownerGroups.includes(group) || asset.allowedGroups.includes(group) || asset.editAllowedGroups.includes(group))
      || identity.identifiers.some((id) => id === asset.ownerUser || asset.allowedUsers.includes(id) || asset.editAllowedUsers.includes(id));
    return inScope && assetAccessService.canEditAssetMetadata(row, { ...context, canEditMetadata: true });
  }

  function appendWhere(where, values, context = {}, alias = 'assets') {
    where.push(`${alias}.deleted_at IS NULL`);
    if (!context.canAccessMetadataAdmin) { where.push('FALSE'); return; }
    if (context.isSuperAdmin || context.canAccessAdmin) return;
    assetAccessService.appendAssetAccessWhere(where, values, context, alias);
    const identity = context.accessIdentity || getUserAccessIdentity(context);
    values.push(identity.groups);
    const groups = `$${values.length}::text[]`;
    values.push(identity.identifiers);
    const users = `$${values.length}::text[]`;
    where.push(`(
      COALESCE(${alias}.owner_groups, '{}') && ${groups}
      OR COALESCE(${alias}.allowed_groups, '{}') && ${groups}
      OR COALESCE(${alias}.edit_allowed_groups, '{}') && ${groups}
      OR ${alias}.owner_user = ANY(${users})
      OR COALESCE(${alias}.allowed_users, '{}') && ${users}
      OR COALESCE(${alias}.edit_allowed_users, '{}') && ${users}
    )`);
    where.push(`NOT (COALESCE(${alias}.edit_denied_groups, '{}') && ${groups})`);
    where.push(`NOT (COALESCE(${alias}.edit_denied_users, '{}') && ${users})`);
  }
  return { canManage, appendWhere };
}

module.exports = { createMetadataAdminAccessService };
