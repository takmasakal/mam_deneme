(function attachMainAssetBrowserModule(global) {
  function createMainAssetBrowserModule(deps) {
    const {
      assetGrid,
      assetDetail,
      panelDetail,
      searchQueryInput,
      ocrQueryInput,
      currentUserCanDeleteAssetsRef,
      currentAssetsRef,
      selectedAssetIdsRef,
      selectedAssetIdRef,
      lastSelectedAssetIdRef,
      activePlayerCleanupRef,
      activeDetailPinCleanupRef,
      searchStateRef,
      t,
      escapeHtml,
      applyAssetViewModeUI,
      highlightMatch,
      metadataHighlightSnippet,
      dcHighlightSnippet,
      tagHighlightSnippet,
      clipHighlightSnippet,
      effectiveSearchHighlightClass,
      foldSearchText,
      workflowLabel,
      formatDuration,
      formatDate,
      secondsToTimecode,
      tagColorStyle,
      thumbFallbackForAsset,
      isImage,
      isVideo,
      isAudio,
      isDocument,
      PLAYER_FPS,
      loadAssets,
      setPanelVideoToolsButtonState
    } = deps || {};

function thumbnailMarkup(asset) {
  const thumbSrc = escapeHtml(asset.thumbnailUrl || '');
  if (isImage(asset)) {
    return `<img class="asset-thumb" src="${escapeHtml(asset.thumbnailUrl || asset.mediaUrl || '')}" alt="${escapeHtml(asset.title)}" />`;
  }
  if (isVideo(asset)) {
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" />`;
    }
    return '<div class="asset-thumb asset-thumb-file">VIDEO</div>';
  }
  if (isAudio(asset)) {
    return '<div class="asset-thumb asset-thumb-audio">AUDIO</div>';
  }
  if (isDocument(asset)) {
    const fallbackSrc = thumbFallbackForAsset(asset);
    const fallbackEsc = escapeHtml(fallbackSrc);
    if (thumbSrc) {
      return `<img class="asset-thumb" src="${thumbSrc}" alt="${escapeHtml(asset.title)}" onerror="this.onerror=null;this.src='${fallbackEsc}'" />`;
    }
    return `<img class="asset-thumb" src="${fallbackEsc}" alt="${escapeHtml(asset.title)}" />`;
  }
  return '<div class="asset-thumb asset-thumb-file">FILE</div>';
}

function assetTypeIcon(asset) {
  if (isVideo(asset)) return '🎬';
  if (isAudio(asset)) return '🎵';
  if (isImage(asset)) return '🖼️';
  if (isDocument(asset)) return '📄';
  return '📦';
}

function buildAssetSearchNoticeHtml() {
  const notices = [];
  const pushNotice = (type, suggestion, query, fuzzyUsed = false) => {
    const safeSuggestion = String(suggestion || '').trim();
    const safeQuery = String(query || '').trim();
    const showSuggestion = safeSuggestion && foldSearchText(safeSuggestion) !== foldSearchText(safeQuery);
    if (!showSuggestion && !fuzzyUsed) return;
    if (showSuggestion) {
      notices.push(`
        <div class="subtitle-item-empty">
          ${escapeHtml(t('subtitle_did_you_mean'))}:
          <button type="button" class="subtitle-item-use-btn" data-search-did-you-mean="${escapeHtml(type)}">${escapeHtml(safeSuggestion)}</button>
        </div>
      `);
      return;
    }
    notices.push(`<div class="subtitle-item-empty"><span class="search-hit-fuzzy">${escapeHtml(safeQuery)}</span></div>`);
  };

  pushNotice('q', currentSearchDidYouMean, currentSearchQuery, currentSearchFuzzyUsed);
  pushNotice('ocr', currentOcrDidYouMean, currentOcrQuery, currentOcrFuzzyUsed);
  return notices.join('');
}

function renderAssets(assets) {
  applyAssetViewModeUI();
  const searchNoticeHtml = buildAssetSearchNoticeHtml();
  if (!assets.length) {
    assetGrid.innerHTML = `${searchNoticeHtml}<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
    assetGrid.querySelectorAll('[data-search-did-you-mean]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const type = String(event.currentTarget?.dataset?.searchDidYouMean || '').trim();
        const suggestion = String(event.currentTarget?.textContent || '').trim();
        if (!suggestion) return;
        if (type === 'ocr' && ocrQueryInput) ocrQueryInput.value = suggestion;
        else if (type === 'q' && searchQueryInput) searchQueryInput.value = suggestion;
        await loadAssets();
      });
    });
    return;
  }

  const searchHighlightClass = effectiveSearchHighlightClass(currentSearchQuery, currentSearchHighlightQuery, currentSearchFuzzyUsed);
  assetGrid.innerHTML = `${searchNoticeHtml}${assets
    .map((asset) => {
      const selected = selectedAssetIdsRef.get().has(asset.id) ? 'selected' : '';
      const trashClass = asset.inTrash ? 'in-trash' : '';
      const styleClass = 'card-art-glass';
      const metadataHits = metadataHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const dcHits = dcHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const tagHits = tagHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const clipHits = clipHighlightSnippet(asset, currentSearchHighlightQuery, searchHighlightClass);
      const ocrHitQuery = String(asset?.ocrSearchHit?.query || currentOcrHighlightQuery || currentOcrQuery || '').trim();
      const ocrHitsRaw = Array.isArray(asset?.ocrSearchHits) && asset.ocrSearchHits.length
        ? asset.ocrSearchHits
        : (asset?.ocrSearchHit ? [asset.ocrSearchHit] : []);
      const ocrHitClass = effectiveSearchHighlightClass(currentOcrQuery, ocrHitQuery, currentOcrFuzzyUsed);
      const ocrHit = ocrHitsRaw.length
        ? `<div class="asset-hit-list asset-hit-list-ocr">${ocrHitsRaw
          .map((hit) => {
            const hitText = String(hit?.text || '').trim();
            if (!hitText) return '';
            const hitSec = Number(hit?.startSec || 0);
            const hitTc = secondsToTimecode(hitSec, PLAYER_FPS);
            return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${asset.id}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(t('ocr_hit'))} TC ${escapeHtml(hitTc)}:</strong> ${highlightMatch(hitText, ocrHitQuery, ocrHitClass)}</button>`;
          })
          .filter(Boolean)
          .join('')}</div>`
        : '';
      const subtitleHitQuery = String(asset?.subtitleSearchHit?.query || currentSubtitleQuery || '').trim();
      const subtitleHitClass = foldSearchText(subtitleHitQuery) !== foldSearchText(currentSubtitleQuery || '')
        ? 'search-hit-fuzzy'
        : 'search-hit';
      const subtitleHitsRaw = Array.isArray(asset?.subtitleSearchHits) && asset.subtitleSearchHits.length
        ? asset.subtitleSearchHits
        : (asset?.subtitleSearchHit ? [asset.subtitleSearchHit] : []);
      const subtitleHit = subtitleHitsRaw.length
        ? `<div class="asset-hit-list asset-hit-list-subtitle">${subtitleHitsRaw
          .map((hit) => {
            const hitText = String(hit?.text || '').trim();
            if (!hitText) return '';
            const hitSec = Number(hit?.startSec || 0);
            const hitTc = secondsToTimecode(hitSec, PLAYER_FPS);
            return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${asset.id}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(t('subtitles'))} TC ${escapeHtml(hitTc)}:</strong> ${highlightMatch(hitText, subtitleHitQuery, subtitleHitClass)}</button>`;
          })
          .filter(Boolean)
          .join('')}</div>`
        : '';
      return `
        <article class="asset-card ${selected} ${trashClass} ${styleClass}" data-id="${asset.id}">
          ${thumbnailMarkup(asset)}
          <div class="asset-card-body">
            <h3><span class="type-icon" aria-hidden="true">${assetTypeIcon(asset)}</span> ${highlightMatch(asset.title, currentSearchHighlightQuery, searchHighlightClass)}</h3>
            <div class="asset-meta">${highlightMatch(asset.type, currentSearchHighlightQuery, searchHighlightClass)} | ${highlightMatch(asset.owner, currentSearchHighlightQuery, searchHighlightClass)}</div>
            <div class="asset-meta">${escapeHtml(workflowLabel(asset.status))}${(isVideo(asset) || isAudio(asset)) ? ` | ${escapeHtml(formatDuration(asset.durationSeconds))}` : ''}</div>
            ${metadataHits ? `<div class="asset-meta dc-hit-row">${metadataHits}</div>` : ''}
            ${tagHits ? `<div class="asset-meta dc-hit-row">${tagHits}</div>` : ''}
            ${dcHits ? `<div class="asset-meta dc-hit-row">${dcHits}</div>` : ''}
            ${clipHits ? `<div class="asset-meta dc-hit-row">${clipHits}</div>` : ''}
            ${subtitleHit}
            ${ocrHit}
            <div class="asset-meta">${escapeHtml(formatDate(asset.updatedAt))}</div>
            <div class="chips">
              ${(asset.tags || []).slice(0, 4).map((tag) => `<button type="button" class="chip chip-tag-filter" data-chip-tag="${escapeHtml(tag)}" style="${tagColorStyle(tag)}">${highlightMatch(tag, currentSearchHighlightQuery, searchHighlightClass)}</button>`).join('')}
            </div>
            ${asset.inTrash ? `
              <div class="card-actions">
                <button type="button" data-card-action="restore" data-id="${asset.id}">${t('restore')}</button>
                ${currentUserCanDeleteAssets ? `<button type="button" class="danger" data-card-action="delete" data-id="${asset.id}">${t('delete_permanent')}</button>` : ''}
              </div>
            ` : ''}
          </div>
        </article>
      `;
    })
    .join('')}`;
  assetGrid.querySelectorAll('[data-search-did-you-mean]').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      const type = String(event.currentTarget?.dataset?.searchDidYouMean || '').trim();
      const suggestion = String(event.currentTarget?.textContent || '').trim();
      if (!suggestion) return;
      if (type === 'ocr' && ocrQueryInput) ocrQueryInput.value = suggestion;
      else if (type === 'q' && searchQueryInput) searchQueryInput.value = suggestion;
      await loadAssets();
    });
  });
}

function setSingleSelection(assetId) {
  selectedAssetIdsRef.get().clear();
  if (assetId) {
    selectedAssetIdsRef.get().add(assetId);
    selectedAssetIdRef.set(assetId);
    lastSelectedAssetIdRef.set(assetId);
  } else {
    selectedAssetIdRef.set(null);
    lastSelectedAssetIdRef.set(null);
  }
}

function addShiftRangeSelection(assetId) {
  const ids = currentAssetsRef.get().map((asset) => asset.id);
  const end = ids.indexOf(assetId);
  if (end < 0) return;

  const start = ids.indexOf(lastSelectedAssetId || '');
  if (start < 0) {
    selectedAssetIdsRef.get().add(assetId);
    selectedAssetIdRef.set(assetId);
    lastSelectedAssetIdRef.set(assetId);
    return;
  }

  const from = Math.min(start, end);
  const to = Math.max(start, end);
  for (let i = from; i <= to; i += 1) {
    selectedAssetIdsRef.get().add(ids[i]);
  }
  selectedAssetIdRef.set(assetId);
  lastSelectedAssetIdRef.set(assetId);
}

function toggleMultiSelection(assetId) {
  const id = String(assetId || '').trim();
  if (!id) return;
  if (selectedAssetIdsRef.get().has(id)) {
    selectedAssetIdsRef.get().delete(id);
  } else {
    selectedAssetIdsRef.get().add(id);
  }

  if (selectedAssetIdsRef.get().size === 0) {
    selectedAssetIdRef.set(null);
    lastSelectedAssetIdRef.set(null);
    return;
  }

  if (selectedAssetIdsRef.get().has(id)) {
    selectedAssetIdRef.set(id);
    lastSelectedAssetIdRef.set(id);
    return;
  }

  const fallbackId = [...selectedAssetIdsRef.get()][selectedAssetIdsRef.get().size - 1] || null;
  selectedAssetIdRef.set(fallbackId);
  lastSelectedAssetIdRef.set(fallbackId);
}

function resetSelectedAssetDetailPanel() {
  if (activeDetailPinCleanup) {
    activeDetailPinCleanup();
    activeDetailPinCleanupRef.set(null);
  }
  if (activePlayerCleanup) {
    activePlayerCleanup();
    activePlayerCleanupRef.set(null);
  }
  assetDetail.innerHTML = `<div class="empty">${escapeHtml(t('select_asset'))}</div>`;
  assetDetail.classList.remove('video-detail-mode');
  assetDetail.classList.remove('detail-video-pinned');
  panelDetail?.classList.remove('panel-video-detail');
  setPanelVideoToolsButtonState(false);
}


    return {
      thumbnailMarkup,
      assetTypeIcon,
      buildAssetSearchNoticeHtml,
      renderAssets,
      setSingleSelection,
      addShiftRangeSelection,
      toggleMultiSelection,
      resetSelectedAssetDetailPanel
    };
  }

  global.createMainAssetBrowserModule = createMainAssetBrowserModule;
})(window);
