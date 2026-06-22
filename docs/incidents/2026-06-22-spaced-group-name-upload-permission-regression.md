# Incident Report: Spaced Group Names Broke Upload Type Permissions

Date: 2026-06-22
Branch: takmasakal/kaisha
Status: Fixed in code; existing production data requires one-time repair

## Summary

Standard admin users could not see any upload type in the first column upload type dropdown, even when the admin panel was configured so the `standart yönetici` group could upload videos but not photos.

The immediate symptom was visible in `/api/me`:

```json
"groups":["/standart yönetici"],
"isAdmin":true,
"canAccessAdmin":true,
"allowedAssetTypes":["video","audio","photo","document","other"],
"uploadAllowedAssetTypes":[]
```

The user had configured the standard admin group to upload video, so `uploadAllowedAssetTypes` should not have been empty.

## Impact

- Non-superadmin admin users could lose the first-column upload type dropdown.
- Upload type decisions were inconsistent with the visible admin settings.
- `standart yönetici` could be accidentally denied by rules intended for `standart kullanıcı`.
- The problem affected group names containing spaces, not just the standard admin group.

## What We Tested

### 1. Container topology

The server was checked with:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Observed:

```text
NAMES                      IMAGE                                                  STATUS
kaisha-oauth2-proxy        mam-oauth2-proxy:7.6.0-shell                           Up 9 minutes
kaisha-app                 kaisha-app                                             Up 9 minutes
kaisha-onlyoffice          onlyoffice/documentserver:8.3                          Up 11 minutes
kaisha-elasticsearch       docker.elastic.co/elasticsearch/elasticsearch:8.13.4   Up 11 minutes
kaisha-keycloak            quay.io/keycloak/keycloak:25.0                         Up 11 minutes
kaisha-postgres            postgres:16                                            Up 11 minutes (healthy)
kaisha-keycloak-postgres   postgres:16                                            Up 11 minutes (healthy)
```

Meaning:

- The app container was `kaisha-app`.
- The app was running a current Kaisha image.
- The database container to inspect was `kaisha-postgres`.

### 2. Asset type access database rows

The server was checked with:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT
  type_group,
  visibility,
  owner_groups,
  allowed_groups,
  denied_groups,
  edit_allowed_groups,
  edit_denied_groups,
  upload_allowed_groups,
  upload_denied_groups,
  upload_allowed_users,
  upload_denied_users
FROM asset_type_access
ORDER BY type_group;
"
```

Observed important rows:

```text
audio    | public | ... | upload_allowed_groups {standart,yönetici} | upload_denied_groups {standart,kullanıcı}
document | public | ... | upload_allowed_groups {standart,yönetici} | upload_denied_groups {standart,kullanıcı}
photo    | public | ... | upload_allowed_groups {}                  | upload_denied_groups {standart,yönetici,kullanıcı}
video    | public | ... | upload_allowed_groups {standart,yönetici} | upload_denied_groups {standart,kullanıcı}
```

Meaning:

- `standart yönetici` had been stored as two separate array items: `standart` and `yönetici`.
- `standart kullanıcı` had been stored as two separate array items: `standart` and `kullanıcı`.
- Because both names share `standart`, a rule that denied `standart kullanıcı` could also match `standart yönetici`.
- Video upload was allowed through `{standart,yönetici}` but then denied through `{standart,kullanıcı}`.

### 3. Browser-side `/api/me`

With a standard admin user logged in, the browser console test was:

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

Observed:

```json
{
  "username":"yön1",
  "displayName":"standart yönetici",
  "email":"yonstd@gmail.com",
  "groups":["/standart yönetici"],
  "roles":["default-roles-mam","offline_access","uma_authorization"],
  "groupAdminGroups":[],
  "isSuperAdmin":false,
  "isAdmin":true,
  "canAccessAdmin":true,
  "canAccessTextAdmin":true,
  "canAccessAssetRightsAdmin":true,
  "canAccessDocumentRightsAdmin":true,
  "canEditMetadata":false,
  "canEditOffice":true,
  "canDeleteAssets":false,
  "canUsePdfAdvancedTools":false,
  "allowedAssetTypes":["video","audio","photo","document","other"],
  "uploadAllowedAssetTypes":[],
  "officeEditorProvider":"onlyoffice",
  "permissionKeys":["admin.access"]
}
```

Meaning:

- The logged-in user was correctly identified as a standard admin.
- General visible asset types were broad.
- Upload types were empty because the upload permission calculation was blocked by the malformed deny groups.
- Since the first-column upload type dropdown is driven by `uploadAllowedAssetTypes`, the dropdown had no visible options.

## Root Cause

The access list normalizer split values on all whitespace:

```js
String(value || '').split(/[,\s]+/)
```

That was wrong for Keycloak groups such as:

- `standart yönetici`
- `standart kullanıcı`
- `standart yonetici`
- any future group name containing spaces

This logic existed in the shared access normalization path and could corrupt group names read from DB rows or request headers.

## Code Fix

### 1. Preserve spaces inside group names

Changed the access-list splitter to split only on comma, newline, or semicolon:

```js
String(value || '').split(/[,\n;]+/)
```

Relevant code after fix:

- `src/services/assetAccessService.js:8-14`
  - `normalizeAccessList()` no longer splits group names on spaces.

### 2. Preserve spaces in oauth2-proxy/header group parsing

Changed header group parsing the same way:

```js
groupsRaw.split(/[,\n;]+/)
```

Relevant code after fix:

- `src/server.js:7196-7200`
  - `buildUserContextFromRequest()` no longer splits `x-forwarded-groups` / `x-auth-request-groups` values on spaces.

### 3. Upload deny and upload allow order

The earlier upload rule correction remains important:

- `src/services/assetAccessService.js:421-435`
  - superadmin bypass is checked first
  - upload deny users/groups are checked before upload allow
  - explicit upload allow rules must match when configured
  - if no explicit upload allow rule exists, the type visibility rule is used as fallback

## Verification After Code Fix

Ran a direct service decision test in both MetMAM and Kaisha repos:

```bash
node --check src/services/assetAccessService.js
node -e 'const {createAssetAccessService}=require("./src/services/assetAccessService"); const s=createAssetAccessService({pool:null}); const mk=(typeGroup, uploadAllowedGroups=[], uploadDeniedGroups=[])=>({typeGroup,visibility:"public",ownerGroups:[],allowedUsers:[],allowedGroups:[],deniedUsers:[],deniedGroups:[],editAllowedUsers:[],editAllowedGroups:[],editDeniedUsers:[],editDeniedGroups:[],downloadAllowedUsers:[],downloadAllowedGroups:[],downloadDeniedUsers:[],downloadDeniedGroups:[],uploadAllowedUsers:[],uploadAllowedGroups,uploadDeniedUsers:[],uploadDeniedGroups}); const ctx={isAdmin:true,canAccessAdmin:true,username:"yon1",groups:["/standart yönetici"],assetTypeAccessRules:[mk("video",["standart yönetici"],["standart kullanıcı"]),mk("photo",[],["standart yönetici","standart kullanıcı"])]}; console.log(JSON.stringify({identity:require("./src/services/assetAccessService").getUserAccessIdentity(ctx),video:s.canUploadAssetType({type:"Video",mimeType:"video/mp4",fileName:"a.mp4"},ctx),photo:s.canUploadAssetType({type:"Image",mimeType:"image/png",fileName:"a.png"},ctx),allowed:s.getAllowedUploadAssetTypeGroups(ctx)}));'
```

Observed:

```json
{
  "identity":{"username":"yon1","email":"","displayName":"","groups":["standart yönetici"],"roles":[],"identifiers":["yon1"]},
  "video":true,
  "photo":false,
  "allowed":["video","audio","document","other"]
}
```

Meaning:

- `standart yönetici` stayed one group name.
- Video upload was allowed.
- Photo upload was denied.
- Superadmin behavior remains separate through `canBypassAssetTypeAccess`.

## One-Time Production Data Repair

The code fix prevents future corruption but does not automatically rewrite old DB arrays that already contain `standart`, `yönetici`, and `kullanıcı` as separate values.

Run this once on the affected Kaisha server:

```bash
docker exec -i kaisha-postgres psql -U postgres -d mam_mvp <<'SQL'
CREATE OR REPLACE FUNCTION repair_access_groups(input text[])
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  WITH items AS (
    SELECT DISTINCT lower(trim(g)) AS g
    FROM unnest(COALESCE(input, '{}'::text[])) AS g
    WHERE trim(g) <> ''
  ),
  flags AS (
    SELECT
      EXISTS (SELECT 1 FROM items WHERE g = 'standart') AS has_standart,
      EXISTS (SELECT 1 FROM items WHERE g = 'yönetici') AS has_yonetici,
      EXISTS (SELECT 1 FROM items WHERE g = 'kullanıcı') AS has_kullanici
  ),
  repaired AS (
    SELECT g FROM items WHERE g NOT IN ('standart', 'yönetici', 'kullanıcı')
    UNION ALL SELECT 'standart yönetici' FROM flags WHERE has_standart AND has_yonetici
    UNION ALL SELECT 'standart kullanıcı' FROM flags WHERE has_standart AND has_kullanici
    UNION ALL SELECT 'standart' FROM flags WHERE has_standart AND NOT has_yonetici AND NOT has_kullanici
    UNION ALL SELECT 'yönetici' FROM flags WHERE has_yonetici AND NOT has_standart
    UNION ALL SELECT 'kullanıcı' FROM flags WHERE has_kullanici AND NOT has_standart
  )
  SELECT COALESCE(array_agg(DISTINCT g ORDER BY g), '{}'::text[])
  FROM repaired;
$$;

UPDATE asset_type_access
SET
  owner_groups = repair_access_groups(owner_groups),
  allowed_groups = repair_access_groups(allowed_groups),
  denied_groups = repair_access_groups(denied_groups),
  edit_allowed_groups = repair_access_groups(edit_allowed_groups),
  edit_denied_groups = repair_access_groups(edit_denied_groups),
  download_allowed_groups = repair_access_groups(download_allowed_groups),
  download_denied_groups = repair_access_groups(download_denied_groups),
  upload_allowed_groups = repair_access_groups(upload_allowed_groups),
  upload_denied_groups = repair_access_groups(upload_denied_groups);

UPDATE assets
SET
  owner_groups = repair_access_groups(owner_groups),
  allowed_groups = repair_access_groups(allowed_groups),
  denied_groups = repair_access_groups(denied_groups),
  edit_allowed_groups = repair_access_groups(edit_allowed_groups),
  edit_denied_groups = repair_access_groups(edit_denied_groups),
  download_allowed_groups = repair_access_groups(download_allowed_groups),
  download_denied_groups = repair_access_groups(download_denied_groups);

DROP FUNCTION repair_access_groups(text[]);
SQL
```

Then verify:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT
  type_group,
  upload_allowed_groups,
  upload_denied_groups
FROM asset_type_access
ORDER BY type_group;
"
```

Expected for the tested scenario:

```text
video | {"standart yönetici"} | {"standart kullanıcı"}
photo | {}                    | {"standart kullanıcı","standart yönetici"}
```

Then verify from the browser as standard admin:

```js
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

Expected:

```json
"uploadAllowedAssetTypes":["video","audio","document","other"]
```

`photo` should not be present when the group is denied for photo upload.

## Prevention

- Do not split group names on whitespace anywhere in authorization code.
- Treat comma, newline, or semicolon as the only multi-value separators for manually entered access lists.
- After creating or renaming Keycloak groups with spaces, test `/api/me` and `asset_type_access` before relying on UI behavior.
- Add any future group-name parsing code to this checklist.

