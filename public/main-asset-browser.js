(function attachMainAssetBrowserModule(global) {
  function createMainAssetBrowserModule(deps) {
    const {
      api,
      assetGrid,
      assetDetail,
      panelDetail,
      searchQueryInput,
      ocrQueryInput,
      subtitleQueryInput,
      currentUserCanDeleteAssetsRef,
      currentUserCanDeleteAssetInUi,
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
    const assetPageSizes = [20, 50, 100];
    let assetPageSize = 20;
    let assetPage = 1;
    let assetTotal = 0;
    const acceptedDidYouMean = { q: '', ocr: '', subtitle: '' };

    function rememberAcceptedDidYouMean(type, suggestion) {
      const safeType = ['q', 'ocr', 'subtitle'].includes(type) ? type : '';
      if (!safeType) return;
      acceptedDidYouMean[safeType] = String(suggestion || '').trim();
    }

    function acceptedDidYouMeanHighlightClass(type, query, defaultClass) {
      const safeType = ['q', 'ocr', 'subtitle'].includes(type) ? type : '';
      if (!safeType) return defaultClass;
      const accepted = String(acceptedDidYouMean[safeType] || '').trim();
      const current = String(query || '').trim();
      if (!accepted || !current || foldSearchText(accepted) !== foldSearchText(current)) {
        acceptedDidYouMean[safeType] = '';
        return defaultClass;
      }
      return 'search-hit-exact';
    }

function thumbnailMarkup(asset) {
  const thumbSrc = escapeHtml(asset.thumbnailUrl || '');
  const declaredType = String(asset?.type || '').trim().toLowerCase();
  if (declaredType === 'other' || declaredType === 'file') {
    return '<div class="asset-thumb asset-thumb-file">FILE</div>';
  }
  if (isImage(asset)) {
    return `<img class="asset-thumb" src="${escapeHtml(asset.thumbnailUrl || asset.proxyUrl || asset.mediaUrl || '')}" alt="${escapeHtml(asset.title)}" />`;
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
  const declaredType = String(asset?.type || '').trim().toLowerCase();
  if (declaredType === 'other' || declaredType === 'file') return '📦';
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
          <button type="button" class="subtitle-item-use-btn" data-search-did-you-mean="${escapeHtml(type)}">${highlightMatch(safeSuggestion, safeSuggestion, 'search-hit-fuzzy')}</button>
        </div>
      `);
      return;
    }
    notices.push(`<div class="subtitle-item-empty"><span class="search-hit-fuzzy">${escapeHtml(safeQuery)}</span></div>`);
  };

  pushNotice('q', searchStateRef.currentSearchDidYouMean, searchStateRef.currentSearchQuery, searchStateRef.currentSearchFuzzyUsed);
  pushNotice('ocr', searchStateRef.currentOcrDidYouMean, searchStateRef.currentOcrQuery, searchStateRef.currentOcrFuzzyUsed);
  pushNotice(
    'subtitle',
    searchStateRef.currentSubtitleDidYouMean,
    searchStateRef.currentSubtitleQuery,
    searchStateRef.currentSubtitleFuzzyUsed
  );
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
      return `<button type="button" class="asset-meta dc-hit-row ocr-hit-jump" data-ocr-jump="1" data-id="${escapeHtml(asset.id)}" data-start-sec="${escapeHtml(String(hitSec))}"><strong>${escapeHtml(label)}</strong> <span class="dc-hit-tc">TC ${escapeHtml(hitTc)}</span>: ${highlightMatch(hitText, query, hitClass)}</button>`;
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

const assetCardRenderer = global.createMainAssetCardRenderer({
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
});

function renderAssetListPager(totalCount, visibleStart, visibleEnd, totalPages) {
  if (totalCount <= 0) return '';
  const pageOptions = assetPageSizes
    .map((size) => `<option value="${escapeHtml(String(size))}" ${size === assetPageSize ? 'selected' : ''}>${escapeHtml(String(size))}</option>`)
    .join('');
  return `
    <div class="asset-list-pager" data-asset-list-pager="1">
      <div class="asset-list-pager-range">${escapeHtml(String(visibleStart + 1))}-${escapeHtml(String(visibleEnd))} / ${escapeHtml(String(totalCount))}</div>
      <label class="asset-list-page-size">
        <span>${escapeHtml(t('asset_page_size'))}</span>
        <select class="asset-list-page-size-select" aria-label="${escapeHtml(t('asset_page_size'))}">${pageOptions}</select>
      </label>
      <div class="asset-list-page-actions">
        <button type="button" class="asset-list-page-btn" data-asset-page="prev" ${assetPage <= 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('previous_page'))}">&lt;</button>
        <label class="asset-list-page-current">
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="asset-list-page-input" value="${escapeHtml(String(assetPage))}" style="width: ${Math.max(6, String(assetPage).length + 3)}ch" aria-label="${escapeHtml(t('current_page'))}" />
          <span>/ ${escapeHtml(String(totalPages))}</span>
        </label>
        <button type="button" class="asset-list-page-btn" data-asset-page="next" ${assetPage >= totalPages ? 'disabled' : ''} aria-label="${escapeHtml(t('next_page'))}">&gt;</button>
      </div>
    </div>
  `;
}

function getAssetPagingRequest(options = {}) {
  const requestedSize = Number(options.pageSize);
  if (assetPageSizes.includes(requestedSize)) assetPageSize = requestedSize;
  if (options.resetPage !== false) assetPage = 1;
  if (Number.isFinite(Number(options.page))) assetPage = Math.max(1, Number(options.page));
  return {
    limit: assetPageSize,
    offset: (assetPage - 1) * assetPageSize
  };
}

async function handleAssetPageDirection(button) {
  const direction = String(button?.dataset?.assetPage || '').trim();
  const totalPages = Math.max(1, Math.ceil(assetTotal / assetPageSize));
  const nextPage = direction === 'prev'
    ? Math.max(1, assetPage - 1)
    : Math.min(totalPages, assetPage + 1);
  if (nextPage === assetPage) return;
  button.disabled = true;
  try {
    await loadAssets({ resetPage: false, page: nextPage });
  } catch (_error) {
    renderAssets(currentAssetsRef.get());
  } finally {
    button.disabled = false;
  }
}

async function handleAssetPageInput(input) {
  const totalPages = Math.max(1, Math.ceil(assetTotal / assetPageSize));
  const requestedPage = Math.max(1, Math.min(totalPages, Number(input?.value) || 1));
  input.value = String(requestedPage);
  assetGridEvents.resizePageInput(input);
  if (requestedPage === assetPage) return;
  input.disabled = true;
  try {
    await loadAssets({ resetPage: false, page: requestedPage });
  } catch (_error) {
    renderAssets(currentAssetsRef.get());
  } finally {
    input.disabled = false;
  }
}

async function handleAssetPageSize(select) {
  const nextSize = Number(select?.value) || 20;
  select.disabled = true;
  try {
    await loadAssets({ resetPage: true, pageSize: nextSize });
  } catch (_error) {
    renderAssets(currentAssetsRef.get());
  } finally {
    select.disabled = false;
  }
}

async function handleSearchDidYouMean(button) {
  const type = String(button?.dataset?.searchDidYouMean || '').trim();
  const suggestion = String(button?.textContent || '').trim();
  if (!suggestion) return;
  rememberAcceptedDidYouMean(type, suggestion);
  if (type === 'ocr' && ocrQueryInput) ocrQueryInput.value = suggestion;
  else if (type === 'subtitle' && subtitleQueryInput) subtitleQueryInput.value = suggestion;
  else if (type === 'q' && searchQueryInput) searchQueryInput.value = suggestion;
  await loadAssets();
}

async function handleAssetHitPage(button) {
  const assetId = String(button?.dataset?.id || '').trim();
  const type = String(button?.dataset?.hitType || '').trim();
  const query = String(button?.dataset?.hitQuery || '').trim();
  const offset = Math.max(0, Number(button?.dataset?.hitOffset) || 0);
  if (!assetId || !query || (type !== 'ocr' && type !== 'subtitle')) return;
  button.disabled = true;
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
}

const assetGridEvents = global.createMainAssetGridEvents({
  assetGrid,
  onPageDirection: handleAssetPageDirection,
  onPageInput: handleAssetPageInput,
  onPageSize: handleAssetPageSize,
  onDidYouMean: handleSearchDidYouMean,
  onHitPage: handleAssetHitPage
});
assetGridEvents.attach();

function renderAssets(assets, options = {}) {
  applyAssetViewModeUI();
  const searchNoticeHtml = buildAssetSearchNoticeHtml();
  const pagination = options?.pagination && typeof options.pagination === 'object'
    ? options.pagination
    : null;
  if (pagination) {
    const nextLimit = Number(pagination.limit);
    if (assetPageSizes.includes(nextLimit)) assetPageSize = nextLimit;
    assetTotal = Math.max(0, Number(pagination.total) || 0);
    assetPage = Math.floor(Math.max(0, Number(pagination.offset) || 0) / assetPageSize) + 1;
  }
  if (!assets.length) {
    assetGrid.innerHTML = `${searchNoticeHtml}<div class="empty">${escapeHtml(t('no_assets'))}</div>`;
    return;
  }

  const totalAssets = Math.max(assetTotal, assets.length);
  const totalPages = Math.max(1, Math.ceil(totalAssets / assetPageSize));
  assetPage = Math.max(1, Math.min(assetPage, totalPages));
  const pageStart = (assetPage - 1) * assetPageSize;
  const pageEnd = Math.min(totalAssets, pageStart + assets.length);
  const visibleAssets = assets;
  const pagerHtml = renderAssetListPager(totalAssets, pageStart, pageEnd, totalPages);
  const searchState = {
    currentSearchDidYouMean: searchStateRef.currentSearchDidYouMean,
    currentSearchQuery: searchStateRef.currentSearchQuery,
    currentSearchFuzzyUsed: searchStateRef.currentSearchFuzzyUsed,
    currentSearchHighlightQuery: searchStateRef.currentSearchHighlightQuery,
    currentOcrDidYouMean: searchStateRef.currentOcrDidYouMean,
    currentOcrQuery: searchStateRef.currentOcrQuery,
    currentOcrFuzzyUsed: searchStateRef.currentOcrFuzzyUsed,
    currentOcrHighlightQuery: searchStateRef.currentOcrHighlightQuery,
    currentSubtitleDidYouMean: searchStateRef.currentSubtitleDidYouMean,
    currentSubtitleFuzzyUsed: searchStateRef.currentSubtitleFuzzyUsed,
    currentSubtitleQuery: searchStateRef.currentSubtitleQuery
  };
  const searchHighlightClass = acceptedDidYouMeanHighlightClass(
    'q',
    searchState.currentSearchQuery,
    effectiveSearchHighlightClass(
      searchState.currentSearchQuery,
      searchState.currentSearchHighlightQuery,
      searchState.currentSearchFuzzyUsed
    )
  );
  assetGrid.innerHTML = `${searchNoticeHtml}${pagerHtml}${visibleAssets
    .map((asset) => assetCardRenderer.render(asset, searchState, searchHighlightClass))
    .join('')}${pagerHtml}`;
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
      getAssetPagingRequest,
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
