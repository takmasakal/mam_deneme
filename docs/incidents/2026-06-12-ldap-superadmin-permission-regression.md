# LDAP Superadmin Permission Regression

Date: 2026-06-12

## Summary

LDAP users that were members of the Keycloak `superadmin` group could lose superadmin capabilities inside MAM. The visible result was that a user shown as superadmin in Keycloak no longer had admin/superadmin access in the web application.

## Impact

- LDAP-backed Keycloak users in `/superadmin` could be treated as non-superadmin by MAM.
- Admin menu access and privileged API actions could disappear for affected users.
- The issue was more visible after LDAP integration because group names may arrive as full Keycloak paths and because local user permission overrides may exist in MAM admin settings.

## Root Cause

Two permission-resolution assumptions were too narrow:

1. Principal normalization accepted `/superadmin` and `superadmin`, but did not preserve the final path segment for nested Keycloak paths such as `/some-parent/superadmin`.
2. `resolveEffectivePermissions()` let saved MAM user-permission overrides fully replace Keycloak-derived permission defaults. If an LDAP user had a saved empty or partial override, Keycloak `/superadmin` membership could be reduced by the application override.
3. LDAP-backed users can require an extra Keycloak lookup path: direct group claims or `/users/{id}/groups` may not be enough in every deployment, and repeated display-name plus permission enrichment made `/api/me` slow.
4. Language switching rewrote the current-user button through static `data-i18n` text before restoring the cached username, so the user could see `Yükleniyor...` until slow permission refreshes completed.

## Fix

- `src/permissions.js` now normalizes principal names into all relevant forms:
  - original lower-case value
  - leading-slash-stripped value
  - final slash-separated path segment
- `src/server.js` now treats Keycloak-derived `baseIsSuperAdmin` as a non-droppable floor:
  - if Keycloak resolves the user as superadmin, all permission keys are restored after override normalization
  - local admin overrides cannot accidentally downgrade a Keycloak superadmin
- `src/server.js` now resolves the Keycloak user profile once per `/api/me` call path, uses a short-lived cache, reads effective/composite realm roles, and falls back to checking only the `superadmin` group membership when direct role/group data did not produce superadmin.
- `public/main.js` now preserves the existing current-user label while applying static i18n text, so language changes do not temporarily replace the name with `Yükleniyor...`.

## Code References

- `src/permissions.js:35-45`: group/role names that map to permission keys.
- `src/permissions.js:47-60`: principal normalization, including nested group path handling.
- `src/permissions.js:71-81`: principal-to-permission resolution.
- `src/server.js:7092-7145`: initial user context from oauth2-proxy headers and token claims.
- `src/server.js:7258-7292`: LDAP-safe `superadmin` group membership fallback.
- `src/server.js:7294-7372`: Keycloak Admin API enrichment for display name, roles, effective roles, and groups.
- `src/server.js:7577-7605`: final effective permission calculation and superadmin floor.
- `public/main.js:1158-1164`: current-user label preservation during language changes.

## Verification

Ran:

```bash
npm run check
node - <<'NODE'
const { resolvePermissionKeysFromPrincipals, PERMISSION_KEYS } = require('./src/permissions');
for (const input of [
  { groups: ['/superadmin'] },
  { groups: ['superadmin'] },
  { groups: ['super admin'] },
  { groups: ['super-admin'] },
  { groups: ['super_admin'] },
  { groups: ['/TRT/superadmin'] },
  { roles: ['superadmin'] },
  { groups: ['/standart yönetici'] },
]) {
  const out = resolvePermissionKeysFromPrincipals(input);
  console.log(JSON.stringify({ input, isSuperAdmin: out.isSuperAdmin, count: out.permissionKeys.length, admin: out.permissionKeys.includes('admin.access') }));
}
console.log('allKeys', PERMISSION_KEYS.length);
NODE
```

Expected result:

- `/superadmin`, `superadmin`, `super admin`, `super-admin`, `super_admin`, `/TRT/superadmin`, and role `superadmin` all resolve as `isSuperAdmin: true`.
- `/standart yönetici` resolves as admin access only, not superadmin.

## Follow-Up

- After deployment, test `/api/me` with an LDAP user in Keycloak `/superadmin`.
- Confirm the JSON includes:
  - `"isSuperAdmin": true`
  - `"canAccessAdmin": true`
  - all permission keys listed under `permissionKeys`
