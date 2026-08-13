# MetMAM Performance Refactor Log

This log records refactor steps that are tested in MetMAM before they are considered for Kaisha/Belgelik.

## Rules

- Preserve observable behavior unless a separate functional change is approved.
- Measure performance before claiming an improvement.
- Keep each refactor small enough to test and revert independently.
- Transfer only completed and verified steps to Kaisha.
- Record unrelated dirty-worktree files and exclude them from commits.

## Step 11 - Media artifact path service

Status: implemented; automated checks passed.

Scope:

- Added `src/services/mediaArtifactService.js`.
- Moved upload artifact path helpers out of `src/server.js`:
  - `artifactRoot`
  - `artifactFolder`
  - `getUploadDateDir`
  - `buildArtifactPath`
  - `createOcrFrameWorkDir`
  - `publicUploadUrlToAbsolutePath`
  - `isUploadArtifactPath`
  - `resolveStoredUrl`
- Kept the existing upload layout behavior:
  - generated artifacts still use `uploads/YYYY/M/D/<folder>/...`
  - `proxies` artifacts still map to the `previews` folder for new output
  - legacy filename-only rows can still resolve through a subdir hint such as
    `proxies`
  - absolute paths under the uploads root still resolve to `/uploads/...`
- Added `scripts/test_media_artifact_service.js`.
- Added `npm run test:media-artifacts`.

Checks:

- `node --check src/services/mediaArtifactService.js`
- `node --check src/server.js`
- `node scripts/test_media_artifact_service.js`
- `npm run check`

Performance note:

This is a structural refactor and is not expected to improve response time by
itself. It creates a stable boundary for OCR, subtitle, thumbnail, proxy,
metadata attachment, cleanup, and backup code before the heavier text/media
processing extraction.

Kaisha transfer status: not transferred.

## Step 5 - Backup service extraction

Status: implemented; automated checks passed.

Scope:

- Added `src/services/backupService.js`.
- Moved backup execution, backup file listing, retention cleanup, pg_dump/tar
  backup helpers, restic repository initialization, restic upload backup, and
  scheduler logic out of `src/server.js`.
- Kept `normalizeBackupSettings` in `src/server.js` because it is part of the
  broader admin settings normalization block.
- Left admin routes unchanged by preserving the existing `runSystemBackup`,
  `listBackupFiles`, and `scheduleSystemBackups` names through service wiring.
- Added `scripts/test_backup_service.js` and `npm run test:backup-service`.

Checks:

- `node --check src/server.js`
- `node --check src/services/backupService.js`
- `node --check scripts/test_backup_service.js`
- `node scripts/test_backup_service.js`

Runtime note:

The new test uses a fake command runner and a temporary backup directory, so it
does not call real `pg_dump`, `tar`, or `restic`. It verifies command argument
construction, generated backup file listing, restic snapshot id extraction, and
the system backup orchestration path.

Kaisha transfer status: not transferred.

## Step 12 - OCR text asset index service

Status: implemented; automated checks passed.

Scope:

- Added `src/services/textAssetIndexService.js`.
- Moved OCR text/index helpers out of `src/server.js`:
  - active OCR URL resolution from Dublin Core metadata
  - active OCR item and expected segment count detection
  - OCR text-file candidate discovery and short-lived file index cache
  - OCR timed segment indexing into `asset_ocr_segments`
  - per-asset OCR match lookup
  - batch OCR match lookup for asset-list cards
  - OCR fuzzy fallback and `didYouMean` result shaping
- Kept the existing search behavior and dependencies:
  - the service still uses the subtitle/search normalization helpers
  - `-?*suffix` long-suffix exclusion remains supported through
    `normalizedTextHasLongSuffixTerm`
  - DB segment index is lazily repaired when missing
  - file-based OCR fallback remains available for legacy rows
- Added `scripts/test_text_asset_index_service.js`.
- Added `npm run test:text-asset-index`.

Checks:

- `node --check src/services/textAssetIndexService.js`
- `node --check src/server.js`
- `npm run test:text-asset-index`
- `npm run check`

Follow-up fix:

- `src/routes/textProcessing.js` already used `mapVideoOcrJobFromDbRow` for
  persisted `video-ocr/latest` responses, but did not destructure it from route
  dependencies. This caused HTTP 500 with `mapVideoOcrJobFromDbRow is not
  defined` after OCR generation. Added the missing dependency binding.

Performance note:

This is primarily a structural refactor. It isolates the OCR indexing/search
path so later work can optimize segment indexing, cache invalidation, and
batch search without expanding `src/server.js`.

Kaisha transfer status: not transferred.

## Step 13 - Subtitle cue index service

Status: implemented; automated checks passed.

Scope:

- Added `src/services/subtitleIndexService.js`.
- Moved subtitle cue index/search helpers out of `src/server.js`:
  - active subtitle file loading
  - cue row mapping and timecode formatting wrapper
  - subtitle fuzzy token matching
  - subtitle `didYouMean` suggestion generation
  - per-asset subtitle match lookup
  - batch subtitle match lookup for asset-list cards
  - `asset_subtitle_cues` sync and lazy index repair
- Kept `src/services/subtitleService.js` focused on parsing and text/time
  normalization:
  - VTT/SRT conversion
  - cue parsing
  - search query SQL clause generation
  - direct cue text matching
- Added `scripts/test_subtitle_index_service.js`.
- Added `npm run test:subtitle-index`.

Checks:

- `node --check src/services/subtitleIndexService.js`
- `node --check src/server.js`
- `npm run test:subtitle-index`
- `npm run check`

Follow-up fix:

- Subtitle search now indexes and searches all subtitle files attached to an
  asset through `dc_metadata.subtitleItems`, not only the globally active
  `dc_metadata.subtitleUrl`.
- This preserves the active subtitle choice for playback while allowing a user
  to search text in inactive language versions. Example: after generating
  English subtitles and translating them to Turkish, searching `brain` can
  still match the English subtitle even when Turkish is active.
- Subtitle match payloads now keep `subtitleUrl` so the matched file/language
  can be surfaced later if needed.
- `scripts/test_subtitle_index_service.js` covers active Turkish plus inactive
  English subtitles and asserts that an English-only `brain` match is returned.
- The active-subtitle model is language scoped: search uses one active subtitle
  per language from `subtitleActiveByLang`, not every historical subtitle item
  and not only the global `subtitleUrl`.
- Global first-column subtitle suggestions and asset-specific subtitle
  suggestions now use the same subtitle index service. This prevents cases
  where a video detail/player can highlight a match but the second-column card
  or suggestion list omits it.
- Fixed multi-language subtitle cue indexing for the real
  `asset_subtitle_cues` primary key. The table key is `(asset_id, seq)`, so
  sequence numbers must be unique across all active language subtitles for the
  same asset. The service now uses one asset-wide sequence counter instead of
  restarting at 1 for each subtitle file. This fixes cases where English cues
  were indexed but Turkish translated cues failed with duplicate `(asset_id,
  seq)` and therefore did not appear in second-column subtitle search.

Performance note:

This is a structural refactor. It isolates subtitle indexing and card-search
behavior so future work can optimize index repair, batch query limits, and
fuzzy matching without growing `src/server.js`.

Kaisha transfer status: not transferred.

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

## Step 9 - Asset technical-info request store

Status: implemented; automated and runtime browser checks passed.

Scope:

- Added `public/main-technical-info-store.js`.
- Cached technical information by asset ID, revision timestamp, original media
  URL, proxy URL, and proxy status.
- Deduplicated concurrent requests for the same asset revision.
- Limited the cache to the 50 most recently used entries.
- Added explicit force-refresh, per-asset invalidation, and full-clear APIs.
- Prevented invalidated in-flight requests from repopulating the cache after
  they complete.
- Kept failed technical probes out of the cache so a later detail open retries
  the request.
- Integrated the store with `main-common.js` without changing the technical
  information endpoint or rendered UI.
- Added `scripts/test_main_technical_info_store.js`.

Checks:

- `npm run test:main-technical-info-store`
- `npm run test:main-workflow-store`
- `npm run test:main-detail-request-coordinator`
- `npm run check`
- `git diff --check`
- Docker application image build and app-only recreation

Runtime verification:

- Signed in with the local `mka` test account.
- Opened `Çift yarık deneyi`, then `Nasreddin Hoca`, then returned to
  `Çift yarık deneyi`.
- Both videos rendered their technical information.
- OAuth2 proxy logs contained one technical-info request for each distinct
  video and no second request when returning to the first video.

Performance note:

Repeated detail opens and transitions between the regular detail view and
video-tools view no longer rerun the backend media probes for an unchanged
asset. A changed revision, media URL, proxy URL, or proxy status generates a
new cache key and is fetched again.

Kaisha transfer status: not transferred.

## Step 10 - Admin system-health module

Status: implemented; automated and runtime browser checks passed.

Scope:

- Added `public/admin-system-health.js`.
- Moved workflow totals, FFmpeg health, service health, integrity metrics, job
  summaries, and recent media-job rendering out of `public/admin.js`.
- Centralized the four system-overview requests in the new module.
- Deduplicated concurrent health refreshes.
- Retained the latest successful payload so a language change can redraw the
  panel without repeating four API requests.
- Preserved forced refreshes after proxy operations, completed background
  jobs, and explicit system-health navigation.
- Added `scripts/test_admin_system_health.js`.
- Reduced `public/admin.js` from 4,898 to 4,761 lines.

Checks:

- `npm run test:admin-system-health`
- `npm run test:main-technical-info-store`
- `npm run check`
- `node --check public/admin-system-health.js`
- `node --check public/admin.js`
- `git diff --check`
- Docker application image build and app-only recreation
- `GET http://127.0.0.1:3001/api/health`

Runtime verification:

- Signed in with the local `mka` test account.
- Confirmed active/total asset, service-health, failed-job, and active-user
  overview values.
- Opened System Health and verified FFmpeg/FFprobe, disk, five services,
  integrity counters, and recent subtitle/OCR/metadata jobs.
- Changed the UI from Turkish to English and verified cached health data was
  redrawn with translated labels.
- Opened Diagnostics and verified active-user and error-log sections still
  loaded.

Performance note:

Language changes no longer repeat workflow tracking, FFmpeg health, full
system health, and runtime diagnostics requests. Concurrent callers share one
request batch.

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
