# MAM Authorization and Keycloak Permission Flow

Date: 2026-06-12

This document describes how MAM connects Keycloak users, groups, roles, and application permissions.

## Source of Identity

MAM does not define permissions for individual hardcoded users in JavaScript or UI code. The active user is resolved on the server from oauth2-proxy headers and, when available, token claims.

Relevant code:

- `src/server.js:7092-7108`
  - Reads:
    - `x-forwarded-user`
    - `x-auth-request-user`
    - `x-forwarded-email`
    - `x-auth-request-email`
    - `x-forwarded-preferred-username`
    - `x-auth-request-preferred-username`
    - `x-forwarded-groups`
    - `x-auth-request-groups`
    - access token headers or bearer token

- `src/server.js:7109-7130`
  - Decodes token claims:
    - `preferred_username`
    - `email`
    - `name`
    - `groups`
    - `realm_access.roles`
    - `resource_access.*.roles`

- `src/server.js:7131-7145`
  - Converts those groups/roles into base permission keys.

## Keycloak Group and Role Mapping

The central mapping is in `src/permissions.js`.

Relevant code:

- `src/permissions.js:35-45`

Current mappings:

| Keycloak group or role | MAM permission result |
| --- | --- |
| `superadmin` | all MAM permission keys |
| `super admin` | all MAM permission keys |
| `super-admin` | all MAM permission keys |
| `super_admin` | all MAM permission keys |
| `admin` | `admin.access` |
| `standart yönetici` | `admin.access` |
| `standart yonetici` | `admin.access` |
| `altyazı_ocr_operator` | `text.admin` |
| `altyazi_ocr_operator` | `text.admin` |

MAM also normalizes group paths.

Relevant code:

- `src/permissions.js:47-60`

Examples that all match `superadmin`:

- `superadmin`
- `/superadmin`
- `/TRT/superadmin`

This is important for LDAP-backed Keycloak groups because Keycloak can expose a group as a full path.

## Keycloak Admin API Enrichment

If headers/token claims do not contain enough group information, MAM tries to enrich the user from Keycloak Admin API.

Relevant code:

- `src/server.js:7154-7200`
  - Builds identity candidates and searches Keycloak users.

- `src/server.js:7203-7229`
  - Finds the Keycloak user matching username, email, local email part, or display name.

- `src/server.js:7232-7244`
  - Builds a short-lived per-user profile cache key so repeated `/api/me` calls do not re-query Keycloak immediately.

- `src/server.js:7246-7255`
  - Extracts Keycloak role and group names into normalized arrays.

- `src/server.js:7258-7292`
  - Fallback for LDAP users whose direct group endpoint does not expose membership reliably:
    - searches only the Keycloak `superadmin` group
    - checks whether the matched user is in that group members list
    - adds only that privileged group path when membership is confirmed

- `src/server.js:7294-7372`
  - Fetches direct realm roles, effective/composite realm roles, and groups for the matched Keycloak user.
  - Merges fetched groups/roles into the current user context.
  - Computes `basePermissionKeys` and `baseIsSuperAdmin`.

## Effective Permission Calculation

The final permission object is produced by `resolveEffectivePermissions()`.

Relevant code:

- `src/server.js:7577-7605`

Order of precedence:

1. Build identity from proxy headers and token claims.
2. Resolve the Keycloak user once and cache that profile briefly.
3. Enrich display name, direct roles, effective roles, and groups from Keycloak Admin API.
4. If direct role/group enrichment still does not produce superadmin, check only the Keycloak `superadmin` group membership as a fallback.
5. Load MAM admin-page user permission settings.
6. Apply saved user permission overrides.
7. Preserve Keycloak superadmin as a non-droppable permission floor.

The superadmin floor means:

- if Keycloak says the user is `superadmin`, MAM restores all permission keys
- an empty or partial MAM admin override cannot accidentally downgrade that user

## `/api/me` Response

The frontend learns the current permissions from `/api/me`.

Relevant code:

- `src/server.js:7619-7645`

Important response fields:

| Field | Meaning |
| --- | --- |
| `username` | normalized MAM username |
| `displayName` | Keycloak full name if available |
| `email` | email from proxy/token/Keycloak |
| `groups` | resolved groups |
| `roles` | resolved roles |
| `isSuperAdmin` | true only when all permission keys are active |
| `canAccessAdmin` | controls admin page access |
| `canAccessAssetRightsAdmin` | admin or scoped asset-rights access |
| `permissionKeys` | final active MAM permissions |

## Asset Rights Interaction

General app permissions and asset rights are related but separate.

Relevant code:

- `src/services/assetAccessService.js:202-216`

`resolveAccessContext()` uses the effective user permission object and then adds:

- normalized user identity
- group-admin groups
- asset-type access rules
- `canBypassAssetTypeAccess`
- `canManageAllAssetVisibility`

`canBypassAssetTypeAccess` and `canManageAllAssetVisibility` are true only when:

- `user.isSuperAdmin` is true

This is intentional: admin-page access does not bypass asset type visibility. A scoped document manager, for example, must still pass the document/video/photo type rules before public asset visibility is considered.

## Operational Checks

After Keycloak or LDAP changes, test in the browser console:

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async (r) => console.log(r.status, await r.text()));
```

For a Keycloak `/superadmin` LDAP user, expected values include:

```json
{
  "isSuperAdmin": true,
  "canAccessAdmin": true,
  "permissionKeys": [
    "admin.access",
    "metadata.edit",
    "office.edit",
    "asset.delete",
    "pdf.advanced",
    "text.admin"
  ]
}
```

If this does not happen, check:

1. Keycloak user is in the `mam` realm.
2. The user is directly or effectively in `/superadmin`.
3. oauth2-proxy passes user headers.
4. Keycloak Admin API credentials configured in MAM can read user groups.
5. `/api/me` response includes expected `groups`.
