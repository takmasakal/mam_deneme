# Incident Report: Workflow UI Removal Runtime Regression

Date: 2026-06-08
Branch: takmasakal/kaisha
Status: Resolved

## Summary

Workflow controls were removed from the main asset detail panel and admin settings UI. After the first change, the main app failed during frontend initialization. The visible symptom was that the current user stayed as `-` and no assets were rendered.

## Impact

- Users could not see the authenticated current user in the top bar.
- Asset loading did not complete, so the asset list appeared empty.
- The issue affected the browser UI after loading the changed frontend bundle.
- Backend authentication and asset APIs were not identified as the root cause.

## Timeline

- Workflow dropdown and move-status UI were removed from the third column.
- Admin workflow tab, workflow tracking checkbox, and visible workflow API help text were removed.
- A regression was reported: current user stayed as `-` and no assets were visible.
- The frontend references were reviewed.
- Remaining stale references were found and removed.
- Syntax checks and project check passed.
- Fix was committed and pushed as `30bf812 Remove workflow UI from kaisha`.

## Root Cause

Two stale frontend references remained after removing the workflow/status UI:

- `public/main.js` still passed `statusSelect` into `createMainShellModule`, but the `statusSelect` variable had been removed.
- `public/main-asset-browser.js` still rendered asset cards through `workflowLabel(asset.status)`, but `workflowLabel` had been removed.

These caused a JavaScript runtime failure during page initialization/rendering. Because initialization stopped early, `loadCurrentUser()` and asset rendering did not complete.

## Resolution

- Removed the stale `statusSelect` dependency from `public/main.js` and `public/main-shell.js`.
- Removed `workflowLabel` usage from `public/main-asset-browser.js`.
- Asset cards now show media duration where relevant, without workflow status labels.
- Re-ran checks:
  - `node --check public/main.js`
  - `node --check public/main-shell.js`
  - `node --check public/main-asset-browser.js`
  - `npm run check`

## Prevention

- When removing UI state, search for both the DOM variable and any injected module dependency names.
- After removing a helper function, run a direct reference scan for the helper name before finalizing.
- For UI removals that affect bootstrap code, verify the app reaches `loadCurrentUser()` and renders assets before commit.
- Prefer a browser smoke test after frontend module dependency changes, especially when deleting shared helpers.
