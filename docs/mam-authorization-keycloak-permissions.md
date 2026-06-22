# MAM Authorization and Keycloak Permission Flow

Date: 2026-06-22
Scope: MetMAM and Kaisha / TRT Belgelik authorization model

This document explains how a Keycloak user or group becomes authorized inside MAM, which code paths make each decision, how asset type rights differ from general admin rights, and what to do after creating new Keycloak groups.

## Authorization Layers

MAM authorization has four separate layers. They should not be treated as one permission.

| Layer | Purpose | Main source |
| --- | --- | --- |
| Identity | Who is the user? What are their Keycloak groups and roles? | oauth2-proxy headers, token claims, Keycloak Admin API |
| Application permissions | Can the user open admin pages, edit office files, delete assets, etc.? | `src/permissions.js` plus admin-page user settings |
| Asset type permissions | Can the user see or upload video, audio, photo, document, other? | `asset_type_access` table |
| Per-asset permissions | Can the user see, edit, download, or manage one asset? | `assets` access columns |

Superadmin is the only role that bypasses asset type visibility/upload gates. A normal admin can manage rights but still remains subject to asset type rules unless the specific route is an admin management route.

## Key Tables

### `asset_type_access`

Defined in `src/db.js:149-170`, with later migrations in `src/db.js:173-195`.

Important columns:

| Column | Meaning |
| --- | --- |
| `type_group` | One of `video`, `audio`, `photo`, `document`, `other` |
| `visibility` | Type visibility: `public`, `group`, `private` |
| `allowed_users`, `allowed_groups` | Who can see this type when not public |
| `denied_users`, `denied_groups` | Who is blocked from seeing this type |
| `edit_allowed_users`, `edit_allowed_groups` | Who has edit rights for this type |
| `edit_denied_users`, `edit_denied_groups` | Who is blocked from edit rights |
| `download_allowed_users`, `download_allowed_groups` | Who can download this type when download is restricted |
| `download_denied_users`, `download_denied_groups` | Who is blocked from download |
| `upload_allowed_users`, `upload_allowed_groups` | Who can upload this type when explicit upload allow exists |
| `upload_denied_users`, `upload_denied_groups` | Who is blocked from upload |

### `assets`

Each asset also has per-asset access columns. These are read through `getAssetAccessSnapshot()` in `src/services/assetAccessService.js:47-64`.

Per-asset rules are applied after type rules. If the asset type gate fails, a public asset still should not be visible to that user.

### `group_admins`

`src/services/assetAccessService.js:182-200` reads this table. It maps a user, role, or group principal to managed groups. Scoped managers use this to administer only assets or type rows connected to their managed groups.

## Identity Resolution

### 1. Request headers and token claims

The first identity pass happens in `buildUserContextFromRequest()`:

- `src/server.js:7166-7182`
  - reads oauth2-proxy headers:
    - `x-forwarded-user`
    - `x-auth-request-user`
    - `x-forwarded-email`
    - `x-auth-request-email`
    - `x-forwarded-preferred-username`
    - `x-auth-request-preferred-username`
    - `x-forwarded-groups`
    - `x-auth-request-groups`
    - access token headers or bearer token

- `src/server.js:7183-7190`
  - decodes token claims:
    - `preferred_username`
    - `email`
    - `name`
    - `groups`
    - `realm_access.roles`
    - `resource_access.*.roles`

- `src/server.js:7191-7195`
  - chooses username and display name. UUID-like proxy usernames are ignored when a better preferred username or email local part is available.

- `src/server.js:7196-7200`
  - parses group header values.
  - Important: groups are split only by comma, newline, or semicolon. Spaces inside group names are preserved.

### 2. Name normalization

`src/services/assetAccessService.js:1-14` normalizes names for comparisons:

- trims whitespace
- removes leading `/`
- lowercases names
- splits only on comma, newline, or semicolon

This means:

| Input | Normalized value |
| --- | --- |
| `/standart yönetici` | `standart yönetici` |
| `Standart Yönetici` | `standart yönetici` |
| `standart yönetici, dokyonet` | `standart yönetici`, `dokyonet` |
| `standart yönetici` | stays one group; it is not split into two words |

### 3. Keycloak Admin API enrichment

`resolveEffectivePermissions()` calls Keycloak enrichment before producing final permissions:

- `src/server.js:7732-7735`
  - builds the initial user and enriches it from Keycloak when available.

The enrichment functions are in `src/server.js` around the Keycloak Admin API section. Their job is to fill in display name, email, roles, and groups when oauth2-proxy headers are incomplete.

## Application Permission Mapping

Application permission keys are defined in `src/permissions.js:1-34`.

Current permission keys:

| Permission key | Legacy field | Meaning |
| --- | --- | --- |
| `admin.access` | `adminPageAccess` | User can access the general admin page |
| `metadata.edit` | `metadataEdit` | User can edit metadata |
| `office.edit` | `officeEdit` | User can edit Office documents |
| `asset.delete` | `assetDelete` | User can delete assets |
| `pdf.advanced` | `pdfAdvancedTools` | User can use advanced PDF tools |
| `text.admin` | `textAdminAccess` | User can access text/OCR admin features |

Principal-to-permission mapping is in `src/permissions.js:35-45`.

| Keycloak group or role | Result |
| --- | --- |
| `superadmin` | all permission keys |
| `super admin` | all permission keys |
| `super-admin` | all permission keys |
| `super_admin` | all permission keys |
| `admin` | `admin.access` |
| `standart yönetici` | `admin.access` |
| `standart yonetici` | `admin.access` |
| `altyazı_ocr_operator` | `text.admin` |
| `altyazi_ocr_operator` | `text.admin` |

Path normalization is in `src/permissions.js:47-60`.

These all resolve to the same principal:

- `superadmin`
- `/superadmin`
- `/TRT/superadmin`

Final permission key resolution is in `src/permissions.js:71-83`.

## Effective Permission Calculation

`resolveEffectivePermissions()` is the central application-level permission function:

- `src/server.js:7732-7763`

Order:

1. Build user identity from request headers/token.
2. Enrich user from Keycloak.
3. Load admin-page user permission settings.
4. Apply per-user overrides if present.
5. Keep Keycloak superadmin as a permission floor.
6. Convert final permission keys to legacy booleans.

Important behavior:

- If Keycloak resolves the user as `superadmin`, MAM restores all permission keys even if a stale user override is partial.
- A normal `standart yönetici` receives `admin.access`, but not delete, metadata edit, PDF advanced, or text admin unless configured elsewhere.

## `/api/me` Contract

The frontend reads current user capabilities from `/api/me`:

- `src/server.js:7777-7806`

Important fields:

| Field | Source / meaning |
| --- | --- |
| `username` | final resolved username |
| `displayName` | final display name |
| `email` | email from headers/token/Keycloak |
| `groups` | final Keycloak/MAM groups |
| `roles` | final roles |
| `groupAdminGroups` | groups this user can administer through scoped rules |
| `isSuperAdmin` | true only when all permission keys are active |
| `isAdmin` | true when `admin.access` is active |
| `canAccessAdmin` | general admin page access |
| `canAccessAssetRightsAdmin` | admin or scoped asset-rights admin access |
| `canAccessDocumentRightsAdmin` | document-rights admin access |
| `allowedAssetTypes` | visible asset type groups |
| `uploadAllowedAssetTypes` | uploadable asset type groups |
| `permissionKeys` | final permission keys |

Operational browser test:

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

For a standard admin allowed to upload videos but not photos, expected shape:

```json
{
  "groups":["/standart yönetici"],
  "isSuperAdmin":false,
  "isAdmin":true,
  "canAccessAdmin":true,
  "allowedAssetTypes":["video","audio","photo","document","other"],
  "uploadAllowedAssetTypes":["video"]
}
```

The exact `uploadAllowedAssetTypes` list depends on the admin panel type rules.

## Asset Type Authorization

The asset type list is fixed in `src/services/assetAccessService.js:23`:

```js
['video', 'audio', 'photo', 'document', 'other']
```

Type rows are loaded from DB in `src/services/assetAccessService.js:165-180`.

Each row is normalized by `getTypeAccessSnapshot()`:

- `src/services/assetAccessService.js:67-90`

### Visible asset types

`canViewAssetType()` decides whether the user can see a type:

- `src/services/assetAccessService.js:377-385`

Decision order:

1. If user/group is in `denied_users` or `denied_groups`, deny.
2. If type visibility is `public`, allow.
3. If user is in `allowed_users`, allow.
4. If group is in `owner_groups` or `allowed_groups`, allow.
5. If user/group has explicit edit grant, allow.
6. Otherwise deny.

`getAllowedAssetTypeGroups()` returns the list used by UI filters and `/api/me`:

- `src/services/assetAccessService.js:404-410`

Superadmin gets all types through `canBypassAssetTypeAccess`.

### Upload asset types

`canUploadAssetType()` decides whether the user can upload a type:

- `src/services/assetAccessService.js:421-435`

Decision order:

1. If superadmin bypass is active, allow.
2. Resolve row type from declared type, MIME type, or file name.
3. If user/group is in `upload_denied_users` or `upload_denied_groups`, deny.
4. If explicit upload allow users/groups exist, require a match.
5. If no explicit upload allow exists, fall back to visible type rule.

`getAllowedUploadAssetTypeGroups()` returns the first-column upload dropdown options:

- `src/services/assetAccessService.js:437-440`

### Why upload and visibility are separate

A user can be allowed to see photos but blocked from uploading photos.

Example:

- `photo.visibility = public`
- `photo.upload_denied_groups = {"standart yönetici"}`

Result:

- standard admin can see existing public photos
- standard admin cannot upload new photos

## Per-Asset Authorization

`canViewAsset()` applies per-asset rules:

- `src/services/assetAccessService.js:442-455`

Decision order:

1. Superadmin bypass can allow.
2. Asset-level deny users/groups block access.
3. Asset type visibility must pass.
4. Global admin management access may allow after type gate.
5. Explicit type edit grant may allow.
6. Public asset visibility may allow.
7. Owner/allowed user/group may allow.
8. Explicit edit user/group may allow.

The key design rule is: asset type gate is evaluated before ordinary public asset visibility.

## Admin Management Authorization

Admin management routes are separate from normal asset viewing/uploading.

Asset type access updates are handled in:

- `src/routes/admin.js:1030-1125`

Important points:

- `requireAssetRightsAdminRequest()` must pass before updates.
- `canManageAssetTypeAccess()` checks if the current user can manage that type row.
- Payload group lists pass through `normalizeAccessList()` or `limitGroupsForAssetRightsAdmin()`.
- Data is stored into `asset_type_access`.

`canManageAssetTypeAccess()` is in:

- `src/services/assetAccessService.js:464-483`

For non-superadmin scoped admins:

- they need managed groups in `group_admins`
- they can only manage type rows connected to those groups

## Document Rights Admin

Document-specific rights access is controlled by:

- `src/server.js:7151-7164`

Default document admin group names:

```text
dokadmin,dokyonet,dokyönet,dokyon,dokyön
```

This is only about access to the document-rights admin surface. It does not automatically grant full superadmin or all asset type permissions.

## Frontend Use of Authorization

### First-column upload dropdown

`public/main-access-scope.js:38-62` applies `uploadAllowedAssetTypes` to the ingest form type dropdown.

Behavior:

- If `uploadAllowedAssetTypes` is an array, only those type options remain enabled.
- If the current selected type is no longer allowed, the frontend selects the first allowed type.
- If the array is empty, the dropdown has no enabled upload type options.

### Asset type filters

`public/main-access-scope.js:64-71` applies `allowedAssetTypes` to asset type filter checkboxes.

This controls which visible type filters appear/enabled in the second column.

### Upload endpoint error handling

`public/main-ingest.js:36-64` sends upload requests to `/api/assets/upload`.

`public/main-ingest.js:66-70` localizes `asset_type_upload_forbidden`.

Backend upload enforcement is in:

- `src/routes/assets.js:943-1000`

The route:

1. validates upload payload and declared type
2. resolves access context
3. calls `canUploadAssetType()`
4. returns `403` with `code: "asset_type_upload_forbidden"` if denied

There is also a metadata-only create route:

- `src/routes/assets.js:905-941`

It calls the same upload type decision before creating an asset record.

## What To Do After Creating A New Keycloak Group

Creating the group in Keycloak is not always enough. Follow this checklist.

### 1. Add the user to the group in Keycloak

Use the `mam` realm unless there is a deliberate realm change.

After login, verify:

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

The `groups` field must include the expected group path or name.

### 2. Decide whether the group is an application permission group

If the group should grant app-level permissions automatically, it must be mapped in `src/permissions.js:35-45`.

Examples already mapped:

- `superadmin`
- `standart yönetici`
- `altyazı_ocr_operator`

If you create a new group such as `foto yönetici` and expect it to open the admin page, add a mapping or assign permissions through the admin user settings page.

### 3. Decide whether the group is an asset type rule group

If the group only controls type visibility/upload/download, use:

Admin page -> Varlık Yetkileri -> Tür rows

Set fields such as:

- `upload_allowed_groups`
- `upload_denied_groups`
- `denied_groups`
- `download_allowed_groups`
- `edit_allowed_groups`

No code change is needed for ordinary asset type access groups.

### 4. Decide whether the group is a scoped admin group

If the group should manage rights for another group, it must be represented in `group_admins`.

That path is read in `src/services/assetAccessService.js:182-200`.

Without a `group_admins` row or full admin permission, a group can be allowed to see/upload assets but still not manage asset rights.

### 5. Decide whether the group is document-rights admin

For document-rights-only admin page access, the group must match `MAM_DOCUMENT_ADMIN_GROUPS` or the default names in:

- `src/server.js:7151-7164`

No full admin access is required for document-rights-only access.

## Group Names With Spaces

Spaces inside group names are supported.

Examples:

- `standart yönetici`
- `standart kullanıcı`
- `foto yönetici`

Rules:

1. The code no longer splits authorization lists on spaces.
2. Manual multi-value separators are comma, newline, or semicolon.
3. In DB arrays, the group name must be one array item: `{"standart yönetici"}`.
4. This is wrong: `{standart,yönetici}`.

Correct admin input examples:

```text
standart yönetici
standart yönetici, dokyonet
standart yönetici; dokyonet
standart yönetici
dokyonet
```

Incorrect if intended as one group:

```text
standart, yönetici
```

That creates two different groups: `standart` and `yönetici`.

## Standard Test Commands

### Inspect type rules

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT
  type_group,
  visibility,
  denied_groups,
  upload_allowed_groups,
  upload_denied_groups
FROM asset_type_access
ORDER BY type_group;
"
```

### Inspect current user in browser

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

### Expected video-only upload setup for standard admin

DB should look conceptually like:

```text
video | upload_allowed_groups {"standart yönetici"} | upload_denied_groups {"standart kullanıcı"}
photo | upload_allowed_groups {}                    | upload_denied_groups {"standart yönetici","standart kullanıcı"}
```

Browser `/api/me` should include:

```json
"uploadAllowedAssetTypes":["video"]
```

or include other types too if those are also allowed.

It should not include `photo`.

### Backend route behavior

For a forbidden upload:

- `/api/assets/upload` returns HTTP `403`
- response code is `asset_type_upload_forbidden`

For the first-column dropdown:

- no backend upload request is sent if the frontend receives no uploadable types
- therefore no upload log appears when the dropdown is empty

## Troubleshooting Matrix

| Symptom | Check first | Likely cause |
| --- | --- | --- |
| Upload dropdown empty | `/api/me.uploadAllowedAssetTypes` | upload type rules deny all types |
| User can see type but cannot upload it | `asset_type_access.upload_*` | visibility and upload rules differ |
| Public videos visible to document manager | `asset_type_access.denied_groups` / type visibility | type gate is too permissive |
| Keycloak group appears but permission missing | `src/permissions.js` mapping or admin user settings | group is not mapped to app permission |
| Group with spaces behaves strangely | DB arrays and normalization | old data may contain split tokens |
| Superadmin does not get full access | `/api/me.groups`, `permissionKeys` | Keycloak group not resolved or stale override |
