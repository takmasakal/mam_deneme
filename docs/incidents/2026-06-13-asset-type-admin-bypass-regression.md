# Incident Report: Asset Type Rules Bypassed By Admin Access

Date: 2026-06-13
Branch: takmasakal/kaisha
Status: Resolved locally

## Summary

Users with admin-page access could bypass asset type visibility rules. For example, a document manager could see some public video assets even when the `video` asset type rule should have hidden videos from that user.

## Impact

- Asset type visibility was not applied consistently to admin/scoped-admin users.
- Public asset visibility could override the intended type gate.
- A user who should only manage or view document assets could still see video assets.
- The problem was not caused by the Keycloak login theme itself; it became visible after recent authorization changes started resolving admin access more reliably for LDAP/Keycloak users.

## Root Cause

`src/services/assetAccessService.js` used one flag, `canManageAllAssetVisibility`, for two separate concerns:

- managing asset visibility broadly
- bypassing asset type visibility checks

That flag was set for both `isSuperAdmin` and `canAccessAdmin`. As a result, any user with `admin.access` could skip SQL and in-memory asset type filters.

## Resolution

- Added a separate `canBypassAssetTypeAccess` flag.
- `canBypassAssetTypeAccess` is true only for `isSuperAdmin`.
- `canManageAllAssetVisibility` is now also limited to `isSuperAdmin`.
- Asset list SQL now still applies asset type filters for non-superadmin admins.
- In-memory `canViewAsset()`, allowed type list, and upload type checks now only bypass type rules for superadmin.

## Code References

- `src/services/assetAccessService.js:202-216`: access context now separates superadmin type bypass from general context.
- `src/services/assetAccessService.js:259-275`: SQL list filtering only fully bypasses for superadmin; non-superadmin admins still pass through type rules.
- `src/services/assetAccessService.js:401-436`: allowed view/upload type groups only return every type for superadmin.
- `src/services/assetAccessService.js:439-452`: `canViewAsset()` applies asset type visibility before allowing non-superadmin admin access.

## Verification

Ran:

```bash
npm run check
node - <<'NODE'
const { createAssetAccessService } = require('./src/services/assetAccessService');
const svc = createAssetAccessService({ pool: { query: async () => ({ rows: [] }) } });
const rules = [
  { typeGroup: 'video', visibility: 'group', allowedGroups: ['fotoyonet'] },
  { typeGroup: 'document', visibility: 'group', allowedGroups: ['dokyonet'] },
  { typeGroup: 'audio', visibility: 'public' },
  { typeGroup: 'photo', visibility: 'public' },
  { typeGroup: 'other', visibility: 'public' },
].map(svc.getTypeAccessSnapshot);
const docAdmin = {
  canManageAllAssetVisibility: false,
  canBypassAssetTypeAccess: false,
  canAccessAdmin: true,
  isSuperAdmin: false,
  accessIdentity: { identifiers: ['docadmin'], groups: ['dokyonet'], roles: [] },
  assetTypeAccessRules: rules
};
const publicVideo = { type: 'Video', visibility: 'public', owner_groups: [], allowed_groups: [], denied_groups: [] };
const publicDoc = { type: 'Document', visibility: 'public', owner_groups: [], allowed_groups: [], denied_groups: [] };
console.log(svc.getAllowedAssetTypeGroups(docAdmin));
console.log(svc.canViewAsset(publicVideo, docAdmin));
console.log(svc.canViewAsset(publicDoc, docAdmin));
NODE
```

Expected:

- document manager does not see public video when video type is not allowed
- document manager still sees document assets when document type is allowed
- superadmin still sees all asset types

## Prevention

- Keep superadmin bypass and admin-page access as separate concepts.
- Any future asset type change should test:
  - public asset hidden by restricted type rule
  - allowed type visible for scoped manager
  - superadmin full visibility
  - SQL list filtering and direct `canViewAsset()` decisions
