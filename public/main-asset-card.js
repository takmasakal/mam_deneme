(function attachMainAssetCardModule(global) {
  function createMainAssetCardRenderer(deps = {}) {
    const {
      escapeHtml,
      t,
      highlightMatch,
      metadataHighlightSnippet,
      dcHighlightSnippet,
      tagHighlightSnippet,
      clipHighlightSnippet,
      effectiveSearchHighlightClass,
      foldSearchText,
      formatDuration,
      formatDate,
      tagColorStyle,
      isVideo,
      isAudio,
      thumbnailMarkup,
      assetTypeIcon,
      renderAssetHitList,
      renderAssetHitPager,
      acceptedDidYouMeanHighlightClass,
      currentUserCanDeleteAssetInUi,
      currentUserCanDeleteAssetsRef,
      selectedAssetIdsRef
    } = deps;

    function render(asset, searchState = {}, searchHighlightClass = 'search-hit') {
      const currentSearchQuery = String(searchState.currentSearchQuery || '').trim();
      const currentSearchHighlightQuery = String(
        searchState.currentSearchHighlightQuery || currentSearchQuery
      ).trim();
      const currentOcrQuery = String(searchState.currentOcrQuery || '').trim();
      const currentOcrHighlightQuery = String(searchState.currentOcrHighlightQuery || '').trim();
      const currentSubtitleQuery = String(searchState.currentSubtitleQuery || '').trim();
      const hasTextSearch = Boolean(currentSearchQuery || currentSearchHighlightQuery);
      const selected = selectedAssetIdsRef.get().has(asset.id) ? 'selected' : '';
      const trashClass = asset.inTrash ? 'in-trash' : '';
      const canDeleteThisAsset = typeof currentUserCanDeleteAssetInUi === 'function'
        ? currentUserCanDeleteAssetInUi(asset)
        : asset.canDeleteAsset === true
          ? true
          : asset.canDeleteAsset === false
            ? false
            : Boolean(currentUserCanDeleteAssetsRef.get());
      const renderText = (value) => (
        hasTextSearch
          ? highlightMatch(value, currentSearchHighlightQuery, searchHighlightClass)
          : escapeHtml(value)
      );
      const metadataHits = hasTextSearch
        ? metadataHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass)
        : '';
      const dcHits = hasTextSearch
        ? dcHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass)
        : '';
      const tagHits = hasTextSearch
        ? tagHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass)
        : '';
      const clipHits = hasTextSearch
        ? clipHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass)
        : '';

      let ocrHit = '';
      let ocrPager = '';
      const ocrHitsRaw = Array.isArray(asset?.ocrSearchHits) && asset.ocrSearchHits.length
        ? asset.ocrSearchHits
        : (asset?.ocrSearchHit ? [asset.ocrSearchHit] : []);
      if (currentOcrQuery || ocrHitsRaw.length) {
        const ocrHitQuery = String(asset?.ocrSearchHit?.query || currentOcrHighlightQuery || currentOcrQuery).trim();
        const ocrHitClass = acceptedDidYouMeanHighlightClass(
          'ocr',
          currentOcrQuery,
          effectiveSearchHighlightClass(currentOcrQuery, ocrHitQuery, searchState.currentOcrFuzzyUsed)
        );
        ocrHit = renderAssetHitList({
          asset,
          type: 'ocr',
          hits: ocrHitsRaw,
          query: ocrHitQuery,
          hitClass: ocrHitClass,
          label: t('ocr_hit')
        });
        ocrPager = renderAssetHitPager({
          asset,
          type: 'ocr',
          requestQuery: currentOcrQuery
        });
      }

      let subtitleHit = '';
      let subtitlePager = '';
      const subtitleHitsRaw = Array.isArray(asset?.subtitleSearchHits) && asset.subtitleSearchHits.length
        ? asset.subtitleSearchHits
        : (asset?.subtitleSearchHit ? [asset.subtitleSearchHit] : []);
      if (currentSubtitleQuery || subtitleHitsRaw.length) {
        const subtitleHitQuery = String(asset?.subtitleSearchHit?.query || currentSubtitleQuery).trim();
        const subtitleHitClass = acceptedDidYouMeanHighlightClass(
          'subtitle',
          currentSubtitleQuery,
          foldSearchText(subtitleHitQuery) !== foldSearchText(currentSubtitleQuery)
            ? 'search-hit-fuzzy'
            : 'search-hit'
        );
        subtitleHit = renderAssetHitList({
          asset,
          type: 'subtitle',
          hits: subtitleHitsRaw,
          query: subtitleHitQuery,
          hitClass: subtitleHitClass,
          label: t('subtitles')
        });
        subtitlePager = renderAssetHitPager({
          asset,
          type: 'subtitle',
          requestQuery: currentSubtitleQuery
        });
      }

      const hitPager = `${subtitlePager}${ocrPager}`;
      const mediaDuration = (isVideo(asset) || isAudio(asset)) && Number(asset.durationSeconds) > 0
        ? `${escapeHtml(t('duration'))}: ${escapeHtml(formatDuration(asset.durationSeconds))}`
        : '';
      const fileSizeBytes = Number(asset.fileSizeBytes);
      const fileSizeMb = Number.isFinite(fileSizeBytes) && fileSizeBytes > 0
        ? `${escapeHtml(t('file_size'))}: ${escapeHtml(`${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`)}`
        : '';
      const mediaMetrics = [mediaDuration, fileSizeMb].filter(Boolean).join(' | ');
      const mediaInfoRow = (mediaMetrics || hitPager)
        ? `<div class="asset-meta asset-status-row"><span>${mediaMetrics}</span>${hitPager}</div>`
        : '';
      return `
        <article class="asset-card ${selected} ${trashClass} card-art-glass" data-id="${escapeHtml(asset.id)}">
          ${thumbnailMarkup(asset)}
          <div class="asset-card-body">
            <h3><span class="type-icon" aria-hidden="true">${assetTypeIcon(asset)}</span> ${renderText(asset.title)}</h3>
            <div class="asset-meta">${renderText(asset.type)} | ${renderText(asset.owner)}</div>
            ${mediaInfoRow}
            ${metadataHits ? `<div class="asset-meta dc-hit-row">${metadataHits}</div>` : ''}
            ${tagHits ? `<div class="asset-meta dc-hit-row">${tagHits}</div>` : ''}
            ${dcHits ? `<div class="asset-meta dc-hit-row">${dcHits}</div>` : ''}
            ${clipHits ? `<div class="asset-meta dc-hit-row">${clipHits}</div>` : ''}
            ${subtitleHit}
            ${ocrHit}
            <div class="asset-meta">${escapeHtml(t('asset_uploaded_at'))}: ${escapeHtml(formatDate(asset.createdAt))}</div>
            <div class="asset-meta">${escapeHtml(t('asset_updated_at'))}: ${escapeHtml(formatDate(asset.updatedAt))}</div>
            <div class="chips">
              ${(asset.tags || []).slice(0, 4).map((tag) => `<button type="button" class="chip chip-tag-filter" data-chip-tag="${escapeHtml(tag)}" style="${tagColorStyle(tag)}">${renderText(tag)}</button>`).join('')}
            </div>
            ${asset.inTrash ? `
              <div class="card-actions">
                <button type="button" data-card-action="restore" data-id="${escapeHtml(asset.id)}">${escapeHtml(t('restore'))}</button>
                ${canDeleteThisAsset ? `<button type="button" class="danger" data-card-action="delete" data-id="${escapeHtml(asset.id)}">${escapeHtml(t('delete_permanent'))}</button>` : ''}
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }

    return { render };
  }

  global.createMainAssetCardRenderer = createMainAssetCardRenderer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainAssetCardRenderer };
  }
})(typeof window !== 'undefined' ? window : globalThis);
