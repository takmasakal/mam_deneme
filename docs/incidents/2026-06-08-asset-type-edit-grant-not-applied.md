# Incident Report: Asset Type Edit Grant Not Applied

Date: 2026-06-08
Branch: takmasakal/kaisha
Status: Resolved locally

## Summary

In the admin Asset Rights page, edit permissions granted at the asset type level did not allow the target group to edit assets of that type. The same group could edit when the permission was granted directly on a specific asset by asset name.

## Impact

- Admins could define `edit allowed groups` for an asset type, but users in those groups still could not edit matching assets.
- The same permission worked when applied directly to an individual asset.
- This made type-level permissions unreliable and forced admins to repeat permissions per asset.
- The issue affected edit authorization, not Keycloak group import or group name extraction.

## Timeline

- A user reported that selecting `Type` in Asset Rights and adding a group under editable groups did not grant edit access.
- The same group worked when selecting `Asset`, entering an asset name, and adding the group under editable groups.
- The backend access service was reviewed.
- The type-level edit rule was found to pass only the type edit gate, while the final asset edit decision still required an asset-level edit grant or global edit permission.
- The asset visibility query path was also updated so explicit type edit grants can make matching assets visible to the editor.
- Local checks were run and passed.
- The local Docker image was rebuilt and the same permission scenario was verified inside the `mam-app` container.

## Root Cause

`canEditAssetType()` treated type-level `editAllowedUsers` and `editAllowedGroups` as valid edit grants, but `canEditAsset()` did not treat that same explicit type grant as sufficient for the final asset edit decision.

The final decision path effectively required one of these:

- direct asset-level `editAllowedUsers` or `editAllowedGroups`
- global metadata/admin edit permission

As a result, type-level editable groups could pass the type gate but still fail the asset edit decision. In addition, the list/filter SQL path did not include explicit type-level edit grants in the asset-level visibility condition, so a user could also fail to see assets that they should be able to edit by type rule.

## Resolution

- Added an explicit type edit grant check in `src/services/assetAccessService.js`.
- Updated `canViewAsset()` so a valid type-level edit grant makes the asset visible, unless denied.
- Updated `canEditAsset()` so a valid type-level edit grant allows editing, unless denied.
- Updated the asset access SQL filter to include explicit type-level edit grants for users and groups.
- Preserved deny precedence:
  - asset-level denied users/groups still block access
  - type-level edit denied users/groups still block edit grants

Checks run:

- `node --check src/services/assetAccessService.js`
- direct Node service test for type edit grant, normal viewer denial, and type edit denial
- `npm run check`
- container-side Node service test inside `mam-app`

## Prevention

- Treat asset-level and type-level explicit edit grants consistently in both in-memory authorization and SQL list filters.
- When adding or changing permission rules, test both direct asset grants and inherited type grants.
- Include negative cases for denied users/groups so broader grants do not bypass deny rules.
- After backend permission changes, verify both API/list visibility and actual edit authorization.
