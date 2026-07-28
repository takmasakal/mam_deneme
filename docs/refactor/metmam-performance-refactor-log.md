# MetMAM Performance Refactor Log

This log records refactor steps that are tested in MetMAM before they are considered for Kaisha/Belgelik.

## Rules

- Preserve observable behavior unless a separate functional change is approved.
- Measure performance before claiming an improvement.
- Keep each refactor small enough to test and revert independently.
- Transfer only completed and verified steps to Kaisha.
- Record unrelated dirty-worktree files and exclude them from commits.

## Step 1 - Asset list query parsing

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `src/services/assetListQueryService.js`.
- Moved `/api/assets` request query parsing and normalization out of `src/routes/assets.js`.
- Preserved pagination limits, text filters, type filters, trash scope, date selection, sort normalization, preview repair flag, and advanced-search parsing.
- Added `scripts/test_asset_list_query_service.js`.

Checks:

- `node --check src/services/assetListQueryService.js`
- `node --check src/routes/assets.js`
- `npm run check`
- `node scripts/test_asset_list_query_service.js`
- `git diff --check`

Runtime verification:

- Authenticated MetMAM UI loaded 65 active assets.
- Next-page navigation changed the list from `1-20 / 65` to `21-40 / 65`.
- Page sizes 20, 50, and 100 returned the expected ranges.
- Selecting only photo and document types returned 40 assets containing only
  Photo/Image and Document records.
- Normal search for `güvercin` returned one matching asset.
- OCR search for `istanbul` returned one asset with OCR timecode matches.
- Subtitle search for `istanbul` returned two assets with subtitle timecode
  matches.
- Advanced search for `güvercin` returned one matching asset.
- The UI was restored to the default first page with page size 20 after the
  checks.

Date parsing and sort normalization are covered by the automated service test.
Interactive date-picker behavior was not changed by this refactor.

Performance note:

This step is structural and is not expected to improve response time by itself. It creates a stable boundary for subsequent query profiling and optimization.

Kaisha transfer status: not transferred.

## Step 8 - Detail request coordination

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-detail-request-coordinator.js`.
- Each new asset-detail request aborts the previous in-flight detail fetch.
- A late response can no longer overwrite a newer asset selection.
- Aborted detail requests are treated as expected control flow and do not
  display an error alert.
- Closing the detail panel, clearing its selection, or opening multi-selection
  invalidates any pending single-asset request.
- Added `scripts/test_main_detail_request_coordinator.js`.

Checks:

- `node --check public/main-detail-request-coordinator.js`
- `node --check public/main.js`
- `npm run test:main-detail-request-coordinator`
- Full refactor regression suite
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session loaded 67 active assets.
- `güvercin`, `Çift yarık deneyi`, and `Karamazov Kardeşler` were selected
  immediately one after another without waiting for detail completion.
- The final detail consistently showed the last selection,
  `Karamazov Kardeşler`.
- Expected aborts did not display an error alert.
- Switching from a single asset to multi-selection replaced the single detail
  with the multi-selection panel.
- Closing the detail panel completed without a stale detail reopening.
- The application health endpoint returned HTTP 200 after recreation.

Performance and correctness note:

Rapid card selection no longer keeps obsolete detail requests alive. This
reduces unnecessary response processing and prevents stale details from
appearing after the user has selected another asset.

Kaisha transfer status: not transferred.

## Step 7 - Detail asset action delegation

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-detail-asset-actions.js`.
- Moved metadata save, workflow transition, version creation, proxy creation,
  original-file actions, asset/proxy download, trash, restore, and permanent
  delete handling out of `openAsset()`.
- Replaced individual form and button listeners with one delegated submit
  listener and one delegated click listener per rendered detail panel.
- Preserved existing API endpoints, payloads, permission checks, confirmation
  dialogs, and detail refresh behavior.
- Added `scripts/test_main_detail_asset_actions.js`.

Checks:

- `node --check public/main-detail-asset-actions.js`
- `node --check public/main.js`
- `npm run test:main-detail-asset-actions`
- Full refactor regression suite
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session opened `Fotoğraf Versiyon Denemesi`.
- Submitting the unchanged metadata form sent
  `PATCH /api/assets/gnz6C8G3Zaup2iTA94hVX`, returned HTTP 200, and reloaded
  the same detail panel.
- Workflow transition, version creation, original download, asset download,
  and delete controls remained present after the refactor.
- Image-version Preview continued to work alongside the new parent detail
  click delegation.
- Destructive workflow, trash, restore, and permanent-delete operations were
  not executed during browser verification; endpoint routing and payloads are
  covered by the automated module test.
- The application health endpoint returned HTTP 200 after recreation.

Performance note:

Core detail action listener count is now constant. Opening an asset no longer
attaches separate listeners for each form and action button.

Kaisha transfer status: not transferred.

## Step 6 - Detail version action delegation

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-detail-version-actions.js`.
- Moved PDF/Office restore, version delete, version rename, version download,
  and image-version preview event handling out of `openAsset()`.
- Replaced per-button listeners and repeated `querySelectorAll()` scans with
  one delegated click listener per rendered version list.
- Preserved row-click PDF restore behavior and existing permission checks.
- Added `scripts/test_main_detail_version_actions.js`.

Checks:

- `node --check public/main-detail-version-actions.js`
- `node --check public/main.js`
- `npm run test:main-detail-version-actions`
- Full refactor regression suite
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session opened `Fotoğraf Versiyon Denemesi`.
- Both image versions retained Preview, Download Version, Rename Version, and
  Delete Version controls.
- Previewing `v2` changed the third-column image URL to the authenticated
  version-preview endpoint without opening a new page.
- Opening another asset and returning to the photo preserved the selected
  image-version preview.
- Opening `Karamazov Kardeşler` retained its PDF version section and restore
  control.
- Destructive restore/delete actions were not executed during the browser
  regression check; their routing and payloads are covered by the automated
  module test.
- The application health endpoint returned HTTP 200 after recreation.

Performance note:

Version action listener count is now constant for each opened detail panel.
It no longer grows with the number of versions shown for the asset.

Kaisha transfer status: not transferred.

## Step 5 - Workflow request store

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-workflow-store.js`.
- Centralized client reads of `/api/workflow` behind one memory-backed store.
- Concurrent workflow reads now share one in-flight request.
- Successful workflow data is reused while the page remains open.
- Language changes still rebuild translated workflow option labels without
  downloading the unchanged status list again.
- Card opening, OCR/subtitle suggestion jumps, language refresh, and PDF-save
  refresh now use the same workflow store.
- Failed requests are not cached and can be retried normally.
- Added `scripts/test_main_workflow_store.js`.

Checks:

- `node --check public/main-workflow-store.js`
- `node --check public/main-assets.js`
- `node --check public/main-search-suggest.js`
- `node --check public/main.js`
- `npm run test:main-workflow-store`
- Full refactor regression suite
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session loaded 67 active assets.
- A clean page load produced exactly one `/api/workflow` request.
- Opening `güvercin` and then `Çift yarık deneyi` did not produce another
  workflow request.
- Switching the UI from Turkish to English rebuilt translated status labels
  and kept the selected detail open without another workflow request.
- Subtitle search for `sait` still displayed the `said` suggestion.
- Opening a subtitle timecode match loaded the corresponding asset detail
  without another workflow request.
- The UI was restored to Turkish, cleared search state, and page 1 after the
  checks.
- The application health endpoint returned HTTP 200 after recreation.

Performance note:

The page now requests `/api/workflow` once during a normal session instead of
requesting it again whenever a card, OCR hit, subtitle hit, language refresh,
or PDF-save refresh opens the detail panel.

Kaisha transfer status: not transferred.

Kaisha transfer checks:

- Verify that Kaisha maps `searchMeta.subtitleQ.didYouMean` and
  `searchMeta.subtitleQ.fuzzyUsed` into client state.
- Verify that a fuzzy subtitle search such as `sait` renders
  `Bunu mu demek istediniz: said` and accepts the suggestion.
- Transfer the workflow store only after its MetMAM runtime verification
  passes.

## Step 2 - Initial page bootstrap

Status: implemented; automated and runtime UI checks passed.

Measurements:

- PostgreSQL active-asset list plan executed in approximately `0.21 ms`.
- PostgreSQL active-asset count plan executed in approximately `0.05 ms`.
- OAuth2 Proxy request logs showed normal asset list requests at `9-41 ms`.
- Normal text, OCR, and subtitle asset searches completed at `17-65 ms` in
  the sampled requests.
- A cold permission/profile request reached approximately `142 ms`.

Conclusion:

The database list query is not responsible for the perceived one-to-two-second
page startup delay. The remaining startup work is primarily client
coordination, rendering, image loading, and occasional cold permission-profile
resolution.

Scope:

- Added `public/main-bootstrap.js`.
- Moved initial-page task coordination out of `public/main.js`.
- Translation loading and UI-settings loading now run concurrently.
- After the current user is resolved, workflow and initial asset loading run
  concurrently.
- Added `scripts/test_main_bootstrap.js` to verify dependency ordering and
  concurrency.

Checks:

- `node --check public/main-bootstrap.js`
- `node --check public/main.js`
- `node --check scripts/test_main_bootstrap.js`
- `npm run test:main-bootstrap`
- `npm run test:asset-query`
- `npm run check`
- `git diff --check`

Runtime verification:

- The authenticated user loaded correctly.
- The initial `1-20 / 65` asset page loaded.
- Advanced-search access remained visible for the authorized test user.
- Next-page navigation reached `21-40 / 65`.
- Normal search returned the expected single asset.
- Opening the matching asset populated the detail panel.

Performance note:

This reduces the startup critical path by overlapping independent requests.
The expected gain is modest because the measured backend requests are already
fast. The main value is a smaller startup coordinator and a testable boundary
for later rendering work.

Kaisha transfer status: not transferred.

## Step 3 - Asset card renderer and no-search fast path

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-asset-card.js`.
- Moved asset-card HTML generation out of `public/main-asset-browser.js`.
- Replaced implicit search globals in the asset browser with an explicit,
  immutable search-state snapshot passed to the renderer.
- Added a no-search fast path that skips metadata, Dublin Core, tag, clip,
  OCR, and subtitle match rendering when there is no applicable query or hit.
- Preserved thumbnail, type icon, title, owner, workflow, duration, dates,
  tags, trash actions, and per-asset delete visibility.
- Added `scripts/test_main_asset_card.js`.

Checks:

- `node --check public/main-asset-card.js`
- `node --check public/main-asset-browser.js`
- `node --check scripts/test_main_asset_card.js`
- `npm run test:main-asset-card`
- `npm run test:main-bootstrap`
- `npm run test:asset-query`
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session loaded 20 cards and 20 thumbnails on the
  first page.
- Opening two photo assets in sequence kept all 20 list thumbnails rendered.
- Next-page navigation changed the current page from 1 to 2 and rendered 20
  cards.
- Normal search for `güvercin` returned one card with highlighted matches.
- OCR search for `istanbul` returned one card with OCR timecode matches.
- Subtitle search for `istanbul` returned two cards with subtitle timecode
  matches.
- Clearing the search restored page 1 with 20 cards.
- The application health endpoint returned HTTP 200 after recreation.

Performance note:

The no-search path avoids running four text-snippet builders and repeated
highlight parsing for every visible card. This reduces client work in the
default asset list. A comparative render-time benchmark has not yet been
recorded, so no numerical speedup is claimed.

Kaisha transfer status: not transferred.

## Step 4 - Asset-grid event delegation

Status: implemented; automated and runtime UI checks passed.

Scope:

- Added `public/main-asset-grid-events.js`.
- Replaced render-time listener attachment for both asset-list pagers,
  direct page input, page-size selectors, search suggestions, and OCR/subtitle
  hit pagers with four persistent grid listeners.
- Kept card selection, multi-selection, tag filtering, and detail-opening
  behavior in the existing grid-level handler.
- Added an explicit guard so hit-page buttons cannot also trigger card detail
  selection.
- Added `scripts/test_main_asset_grid_events.js`.
- Added the previously missing subtitle `didYouMean` and fuzzy-search state
  mapping, plus delegated suggestion acceptance for the subtitle input.
- Added `scripts/test_main_assets_search_meta.js`.

Checks:

- `node --check public/main-asset-grid-events.js`
- `node --check public/main-asset-browser.js`
- `node --check public/main.js`
- `node --check scripts/test_main_asset_grid_events.js`
- `npm run test:main-asset-grid-events`
- `npm run test:main-assets-search-meta`
- `npm run test:main-asset-card`
- `npm run test:main-bootstrap`
- `npm run test:asset-query`
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- The authenticated `mka` session loaded the first 20 of 67 assets.
- The upper next-page button changed the current page from 1 to 2.
- Entering page 3 directly loaded 20 assets from page 3.
- Changing page size to 50 returned the first 50 of 67 assets.
- The lower next-page button changed the current page from 1 to 2.
- OCR search for `bir` returned hit pagination controls.
- The OCR next-hit button loaded offset 10 without opening the asset detail.
- Clearing filters, restoring page size 20, and opening the `güvercin` asset
  populated the detail panel.
- Subtitle search for `sait` displayed `Bunu mu demek istediniz: said` with
  fuzzy highlighting.
- Accepting `said` updated the subtitle input, removed the suggestion notice,
  retained the subtitle results, and changed 12 matches to the exact-match
  highlight class.
- The application health endpoint returned HTTP 200 after recreation.

Performance note:

Asset-list rendering no longer scans newly generated DOM nodes and creates
listeners for every pager and hit control after each render. Listener count is
constant at four for this module, regardless of page size or search-result
count. A comparative browser render benchmark has not yet been recorded.

Kaisha transfer status: not transferred.
