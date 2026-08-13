# MetMAM Next Refactor Priority

Date: 2026-08-12

## Recommendation

The highest-value next refactor is to extract the backend text/media processing core out of `src/server.js` into focused services.

Priority module:

- `src/services/textAssetIndexService.js`
- `src/services/mediaArtifactService.js`
- `src/services/mediaProcessingJobService.js`
- optionally `src/services/ocrProcessingService.js` and `src/services/subtitleProcessingService.js` after the first extraction

## Why This Is The First Priority

`src/server.js` is still the main risk area. It contains application startup, settings normalization, auth/session helpers, Keycloak integration, backup logic, audit logic, upload artifact path logic, OCR parsing/search/indexing, subtitle parsing/search/indexing, media job queueing, thumbnail/proxy generation, and route registration.

The file is about 9,800 lines and route modules still receive very large dependency bags from it. For example, `registerAssetRoutes()` and `registerTextProcessingRoutes()` depend on many low-level helpers that are currently defined in `server.js`.

The most important cluster is OCR/subtitle/media-job handling, because it directly touches recent recurring issues:

- `/video-ocr/latest` HTTP 500 fallbacks
- OCR/subtitle search index behavior
- OCR frame cleanup and frame cache behavior
- subtitle translation model execution
- media job queue/progress/cancel behavior
- upload artifact path conventions
- Kaisha transfer risk when MetMAM fixes are copied later

This means the refactor has both maintainability and reliability payoff.

## Proposed First Cut

Do not start by moving routes. Keep `src/routes/textProcessing.js` as-is for now. First move pure/backend helpers from `src/server.js` into services with tests.

### Step A - Extract artifact/path helpers

Create `src/services/mediaArtifactService.js`.

Move:

- `artifactRoot`
- `artifactFolder`
- `getUploadDateDir`
- `buildArtifactPath`
- `publicUploadUrlToAbsolutePath`
- `resolveStoredUrl`
- `isUploadArtifactPath`
- OCR frame work/cache path helpers if they can be moved safely

Reason:

This is a low-risk boundary and removes repeated path coupling from OCR, subtitle, backup, cleanup, and upload code.

Tests:

- old layout URL support: `/uploads/2026-06-12/...`
- new layout URL support: `/uploads/2026/6/12/...`
- `ocr`, `subtitles`, `thumbnails`, `previews`, `proxies` output paths
- path traversal rejection

### Step B - Extract OCR/subtitle index service

Create `src/services/textAssetIndexService.js`.

Move:

- active OCR/subtitle URL resolution
- `syncOcrSegmentIndexForAsset`
- `ensureOcrSegmentIndexForAssetRow`
- `searchOcrMatchesForAssetRow`
- `searchOcrMatchesForAssetRows`
- `syncSubtitleCueIndexForAssetRow`
- `ensureSubtitleCueIndexForAssetRow`
- `searchSubtitleMatchesForAssetRow`
- `searchSubtitleMatchesForAssetRows`

Reason:

This is where card hit rendering, `/video-ocr/latest`, admin OCR/subtitle edit, and normal/advanced search behavior converge. Keeping it together makes regressions easier to test.

Tests:

- OCR exact match
- OCR did-you-mean/fuzzy match
- subtitle exact match
- subtitle did-you-mean/fuzzy match
- active OCR URL only
- active subtitle URL only
- missing file fallback
- DB index repair path

### Step C - Extract media job persistence/queue service

Create or expand `src/services/mediaProcessingJobService.js`.

Move:

- `normalizeMediaJobType`
- `normalizeMediaJobStatus`
- `buildMediaJobProgress`
- `upsertMediaProcessingJob`
- `getMediaProcessingJobById`
- `getLatestMediaProcessingJobForAsset`
- job payload mappers
- concurrency limit lookup
- `scheduleMediaJobRun`
- `pumpMediaJobQueue`

Reason:

System Health, job cancellation, OCR/subtitle generation, metadata enrichment, and backup-like long jobs all depend on consistent job state. This boundary also helps make progress percentages more realistic later.

Tests:

- queue limit is respected
- cancelled job does not continue to write completed state
- failed job persists error
- latest job lookup returns expected type/status
- status filter behavior used by System Health

## What Not To Do First

Do not start by splitting `public/admin.js` again. Frontend still matters, but the largest operational risk is now backend media/text processing.

Do not move all of `server.js` at once. The route registration dependency bags are already large; a broad move will create hard-to-debug regressions and make Kaisha transfer risky.

Do not change behavior in this refactor. Permission behavior, search semantics, OCR/subtitle output, and job scheduling rules should remain identical unless a separate functional change is requested.

## Acceptance Criteria

- `server.js` loses at least one coherent backend responsibility, not just a few utility functions.
- Existing endpoints keep the same request/response shape.
- `npm run check` passes.
- New service tests cover moved behavior.
- Manual MetMAM smoke test covers:
  - normal asset list search
  - OCR search with timecode hit
  - subtitle search with timecode hit
  - video OCR latest endpoint
  - subtitle generation or job lookup
  - System Health recent media jobs

## Kaisha Transfer Note

Only transfer after MetMAM passes automated and runtime checks. Kaisha should receive the same service boundary, not a hand-edited partial copy.
