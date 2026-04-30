(function attachMainAssetBrowserModule(global) {
  function createMainAssetBrowserModule(deps) {
    const {
      api,
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
    const assetHitPageSize = 10;

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

function assetHitPageKey(asset, type, query) {
  return `${String(asset?.id || '').trim()}::${String(type || '').trim()}::${foldSearchText(query || '')}`;
}

function renderAssetHitList({ asset, type, hits, query, hitClass, label }) {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) return '';
  return `<div class="asset-hit-list asset-hit-list-${escapeHtml(type)}">${list
    .map((hit) => {
      const hitText = String(hit?.text || '').trim();
      if (!hitText) return '';
      const hitSec = Number(hit?.startSec || 0);
      const hitTc = secondsToTimecode(hitSec, PLAYER_FPS);
      return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${escapeHtml(asset.id)}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(label)} TC ${escapeHtml(hitTc)}:</strong> ${highlightMatch(hitText, query, hitClass)}</button>`;
    })
    .filter(Boolean)
    .join('')}</div>`;
}

function renderAssetHitPager({ asset, type, requestQuery }) {
  const page = type === 'subtitle' ? asset?.subtitleSearchPage : asset?.ocrSearchPage;
  const hasPrev = Boolean(page?.hasPrev);
  const hasNext = Boolean(page?.hasNext);
  if (!hasPrev && !hasNext) return '';
  const hits = type === 'subtitle' ? asset?.subtitleSearchHits : asset?.ocrSearchHits;
  const visibleCount = Array.isArray(hits) ? hits.length : 0;
  const offset = Math.max(0, Number(page?.offset) || 0);
  const query = String(requestQuery || page?.query || '').trim();
  return `
    <div class="asset-hit-pager">
      <span class="asset-hit-pager-range">${escapeHtml(String(offset + 1))}-${escapeHtml(String(offset + visibleCount))}${hasNext ? '+' : ''}</span>
      <span class="asset-hit-pager-actions">
        <button type="button" class="asset-hit-page-btn" data-hit-type="${escapeHtml(type)}" data-id="${escapeHtml(asset.id)}" data-hit-query="${escapeHtml(query)}" data-hit-offset="${escapeHtml(String(page?.prevOffset || 0))}" ${!hasPrev ? 'disabled' : ''}>&lt;</button>
        <button type="button" class="asset-hit-page-btn" data-hit-type="${escapeHtml(type)}" data-id="${escapeHtml(asset.id)}" data-hit-query="${escapeHtml(query)}" data-hit-offset="${escapeHtml(String(page?.nextOffset || assetHitPageSize))}" ${!hasNext ? 'disabled' : ''}>&gt;</button>
      </span>
    </div>
  `;
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
      const ocrHit = renderAssetHitList({
        asset,
        type: 'ocr',
        hits: ocrHitsRaw,
        query: ocrHitQuery,
        hitClass: ocrHitClass,
        label: t('ocr_hit')
      });
      const ocrPager = renderAssetHitPager({
        asset,
        type: 'ocr',
        requestQuery: currentOcrQuery
      });
      const subtitleHitQuery = String(asset?.subtitleSearchHit?.query || currentSubtitleQuery || '').trim();
      const subtitleHitClass = foldSearchText(subtitleHitQuery) !== foldSearchText(currentSubtitleQuery || '')
        ? 'search-hit-fuzzy'
        : 'search-hit';
      const subtitleHitsRaw = Array.isArray(asset?.subtitleSearchHits) && asset.subtitleSearchHits.length
        ? asset.subtitleSearchHits
        : (asset?.subtitleSearchHit ? [asset.subtitleSearchHit] : []);
      const subtitleHit = renderAssetHitList({
        asset,
        type: 'subtitle',
        hits: subtitleHitsRaw,
        query: subtitleHitQuery,
        hitClass: subtitleHitClass,
        label: t('subtitles')
      });
      const subtitlePager = renderAssetHitPager({
        asset,
        type: 'subtitle',
        requestQuery: currentSubtitleQuery
      });
      const hitPager = `${subtitlePager}${ocrPager}`;
      return `
        <article class="asset-card ${selected} ${trashClass} ${styleClass}" data-id="${asset.id}">
          ${thumbnailMarkup(asset)}
          <div class="asset-card-body">
            <h3><span class="type-icon" aria-hidden="true">${assetTypeIcon(asset)}</span> ${highlightMatch(asset.title, currentSearchHighlightQuery, searchHighlightClass)}</h3>
            <div class="asset-meta">${highlightMatch(asset.type, currentSearchHighlightQuery, searchHighlightClass)} | ${highlightMatch(asset.owner, currentSearchHighlightQuery, searchHighlightClass)}</div>
            <div class="asset-meta asset-status-row"><span>${escapeHtml(workflowLabel(asset.status))}${(isVideo(asset) || isAudio(asset)) ? ` | ${escapeHtml(formatDuration(asset.durationSeconds))}` : ''}</span>${hitPager}</div>
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
  assetGrid.querySelectorAll('.asset-hit-page-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const assetId = String(event.currentTarget?.dataset?.id || '').trim();
      const type = String(event.currentTarget?.dataset?.hitType || '').trim();
      const query = String(event.currentTarget?.dataset?.hitQuery || '').trim();
      const offset = Math.max(0, Number(event.currentTarget?.dataset?.hitOffset) || 0);
      if (!assetId || !query || (type !== 'ocr' && type !== 'subtitle')) return;
      event.currentTarget.disabled = true;
      try {
        const endpoint = type === 'ocr'
          ? `/api/assets/${encodeURIComponent(assetId)}/video-ocr/search`
          : `/api/assets/${encodeURIComponent(assetId)}/subtitles/search`;
        const params = new URLSearchParams({
          q: query,
          offset: String(offset),
          limit: String(assetHitPageSize)
        });
        const result = await api(`${endpoint}?${params.toString()}`);
        const matches = Array.isArray(result.matches) ? result.matches : [];
        const page = result.page && typeof result.page === 'object'
          ? result.page
          : { offset, limit: assetHitPageSize, count: matches.length, hasPrev: offset > 0, hasNext: false, prevOffset: Math.max(0, offset - assetHitPageSize), nextOffset: offset + assetHitPageSize };
        const assets = currentAssetsRef.get();
        const asset = assets.find((item) => String(item.id || '') === assetId);
        if (!asset) return;
        const highlightQuery = String(result.highlightQuery || page.query || query).trim() || query;
        if (type === 'ocr') {
          asset.ocrSearchHits = matches.map((item) => ({
            query: String(item.query || highlightQuery).trim() || highlightQuery,
            text: String(item.line || item.text || ''),
            startSec: Number(item.startSec || 0),
            endSec: Number(item.endSec || 0),
            startTc: String(item.startTc || secondsToTimecode(Number(item.startSec || 0), PLAYER_FPS))
          }));
          asset.ocrSearchPage = { ...page, query: highlightQuery };
        } else {
          asset.subtitleSearchHits = matches.map((item) => ({
            query: String(item.query || highlightQuery).trim() || highlightQuery,
            text: String(item.text || ''),
            startSec: Number(item.startSec || 0),
            endSec: Number(item.endSec || 0),
            startTc: String(item.startTc || secondsToTimecode(Number(item.startSec || 0), PLAYER_FPS))
          }));
          asset.subtitleSearchPage = { ...page, query: highlightQuery };
        }
        renderAssets(assets);
      } catch (_error) {
        renderAssets(currentAssetsRef.get());
      }
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
