(function attachMainAssetsModule(global) {
  function createMainAssetsModule(deps) {
    const {
      api,
      getWorkflow,
      escapeHtml,
      t,
      statusSelect,
      workflowLabel,
      serializeForm,
      searchForm,
      assetTypeFilters,
      syncOcrQueryInputs,
      ocrQueryInput,
      renderAssets,
      assetGrid,
      currentAssetsRef,
      selectedAssetIdsRef,
      selectedAssetIdRef,
      lastSelectedAssetIdRef,
      searchStateRef,
      assetPaginationRef
    } = deps || {};
    let loadRequestSeq = 0;

    function setAssetSearchLoading(visible) {
      if (!assetGrid) return;
      const existing = assetGrid.querySelector('.asset-search-loading-overlay');
      if (!visible) {
        assetGrid.classList.remove('is-search-loading');
        existing?.remove();
        return;
      }
      assetGrid.classList.add('is-search-loading');
      if (existing) return;
      const overlay = document.createElement('div');
      overlay.className = 'asset-search-loading-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `
        <div class="asset-search-loading-card">
          <span class="asset-search-loading-spinner" aria-hidden="true"></span>
          <span>${escapeHtml(t('search_loading') || 'Searching...')}</span>
        </div>
      `;
      assetGrid.appendChild(overlay);
    }

    function getSelectedAssetTypesForRequest() {
      const enabledFilters = assetTypeFilters.filter((el) => !el.disabled);
      const selectedTypes = enabledFilters
        .filter((el) => el.checked)
        .map((el) => String(el.value || '').toLowerCase())
        .filter(Boolean);
      return {
        selectedTypes,
        isNarrowed: enabledFilters.length > 0 && selectedTypes.length > 0 && selectedTypes.length < enabledFilters.length
      };
    }

    async function loadWorkflow() {
      const workflow = await getWorkflow();
      statusSelect.innerHTML = `<option value="">${escapeHtml(t('any_status'))}</option>`;
      workflow.forEach((status) => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = workflowLabel(status);
        statusSelect.appendChild(option);
      });
      return workflow;
    }

    async function loadAssets(options = {}) {
      const requestSeq = ++loadRequestSeq;
      const pagination = assetPaginationRef || { page: 1, pageSize: 20, total: 0, serverSide: false };
      const preservePage = Boolean(options?.preservePage);
      if (!preservePage) pagination.page = 1;
      const filters = serializeForm(searchForm);
      const params = new URLSearchParams();
      const advancedSearch = String(filters.advancedSearch || '').trim();
      const hasAdvancedSearch = Boolean(advancedSearch);
      const { selectedTypes, isNarrowed: isTypeFilterNarrowed } = getSelectedAssetTypesForRequest();
      const trashScopeRaw = String(filters.trash || 'active').trim().toLowerCase();
      const trashScope = ['active', 'trash', 'all'].includes(trashScopeRaw) ? trashScopeRaw : 'active';
      searchStateRef.currentSearchQuery = String(filters.q || '').trim();
      searchStateRef.currentOcrQuery = String(filters.ocrQ || '').trim();
      searchStateRef.currentSubtitleQuery = String(filters.subtitleQ || '').trim();
      searchStateRef.currentClipQuery = hasAdvancedSearch ? String(filters.clipQ || '').trim() : '';
      searchStateRef.currentSearchHighlightQuery = searchStateRef.currentSearchQuery;
      searchStateRef.currentSearchDidYouMean = '';
      searchStateRef.currentSearchFuzzyUsed = false;
      searchStateRef.currentOcrHighlightQuery = searchStateRef.currentOcrQuery;
      searchStateRef.currentOcrDidYouMean = '';
      searchStateRef.currentOcrFuzzyUsed = false;
      searchStateRef.currentSubtitleDidYouMean = '';
      searchStateRef.currentSubtitleFuzzyUsed = false;

      if (selectedTypes.length === 0) {
        if (!searchStateRef.currentSearchQuery && !searchStateRef.currentOcrQuery && !searchStateRef.currentSubtitleQuery && !hasAdvancedSearch) {
          currentAssetsRef.value = [];
          pagination.total = 0;
          pagination.serverSide = false;
          renderAssets(currentAssetsRef.value, { resetPage: true });
          return;
        }
      }

      if (searchStateRef.currentOcrQuery) {
        syncOcrQueryInputs(ocrQueryInput);
      } else if (ocrQueryInput) {
        ocrQueryInput.value = '';
      }
      if (!hasAdvancedSearch && searchStateRef.currentSearchQuery) params.set('q', searchStateRef.currentSearchQuery);
      if (!hasAdvancedSearch && searchStateRef.currentOcrQuery) params.set('ocrQ', searchStateRef.currentOcrQuery);
      if (!hasAdvancedSearch && searchStateRef.currentSubtitleQuery) params.set('subtitleQ', searchStateRef.currentSubtitleQuery);
      if (!hasAdvancedSearch && String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      if (String(filters.uploadDateFrom || '').trim()) params.set('uploadDateFrom', String(filters.uploadDateFrom).trim());
      if (String(filters.uploadDateTo || '').trim()) params.set('uploadDateTo', String(filters.uploadDateTo).trim());
      if (String(filters.dateField || '').trim()) params.set('dateField', String(filters.dateField).trim());
      if (String(filters.sortBy || '').trim()) params.set('sortBy', String(filters.sortBy).trim());
      if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
      if (advancedSearch) params.set('advanced', advancedSearch);
      params.set('trash', trashScope);
      if (isTypeFilterNarrowed && !hasAdvancedSearch) {
        params.set('types', selectedTypes.join(','));
      }
      const shouldShowSearchLoading = Boolean(
        searchStateRef.currentSearchQuery
        || searchStateRef.currentOcrQuery
        || searchStateRef.currentSubtitleQuery
        || hasAdvancedSearch
        || String(filters.tag || '').trim()
        || String(filters.uploadDateFrom || '').trim()
        || String(filters.uploadDateTo || '').trim()
        || String(filters.sortBy || '').trim()
        || String(filters.status || '').trim()
        || trashScope !== 'active'
        || isTypeFilterNarrowed
      );
      // Asset results must reflect the current filter state immediately; avoid
      // reusing a browser/proxy-cached response after applying a new search.
      params.set('_ts', String(Date.now()));

      const canUseServerPagination = !searchStateRef.currentSearchQuery
        && !searchStateRef.currentOcrQuery
        && !searchStateRef.currentSubtitleQuery
        && !advancedSearch;
      pagination.serverSide = canUseServerPagination;
      if (canUseServerPagination) {
        const pageSize = [20, 50, 100].includes(Number(pagination.pageSize)) ? Number(pagination.pageSize) : 20;
        pagination.pageSize = pageSize;
        params.set('limit', String(pageSize));
        params.set('offset', String(Math.max(0, (Number(pagination.page) - 1) * pageSize)));
      }

      if (shouldShowSearchLoading) setAssetSearchLoading(true);
      let result;
      try {
        result = await api(`/api/assets?${params.toString()}`);
      } finally {
        if (requestSeq === loadRequestSeq) setAssetSearchLoading(false);
      }
      // A slow earlier request must not overwrite a newer search result.
      if (requestSeq !== loadRequestSeq) return;
      const payload = Array.isArray(result) ? { assets: result, searchMeta: {} } : (result || {});
      currentAssetsRef.value = Array.isArray(payload.assets) ? payload.assets : [];
      if (canUseServerPagination && payload.pagination && typeof payload.pagination === 'object') {
        pagination.total = Math.max(0, Number(payload.pagination.total) || 0);
        pagination.page = Math.max(1, Math.floor((Number(payload.pagination.offset) || 0) / pagination.pageSize) + 1);
      } else {
        pagination.total = currentAssetsRef.value.length;
      }
      const qMeta = payload.searchMeta?.q && typeof payload.searchMeta.q === 'object' ? payload.searchMeta.q : null;
      const ocrMeta = payload.searchMeta?.ocrQ && typeof payload.searchMeta.ocrQ === 'object' ? payload.searchMeta.ocrQ : null;
      const subtitleMeta = payload.searchMeta?.subtitleQ && typeof payload.searchMeta.subtitleQ === 'object'
        ? payload.searchMeta.subtitleQ
        : null;
      searchStateRef.currentSearchHighlightQuery = String(qMeta?.highlightQuery || searchStateRef.currentSearchQuery).trim() || searchStateRef.currentSearchQuery;
      searchStateRef.currentSearchDidYouMean = String(qMeta?.didYouMean || '').trim();
      searchStateRef.currentSearchFuzzyUsed = Boolean(qMeta?.fuzzyUsed);
      searchStateRef.currentOcrHighlightQuery = String(ocrMeta?.highlightQuery || searchStateRef.currentOcrQuery).trim() || searchStateRef.currentOcrQuery;
      searchStateRef.currentOcrDidYouMean = String(ocrMeta?.didYouMean || '').trim();
      searchStateRef.currentOcrFuzzyUsed = Boolean(ocrMeta?.fuzzyUsed);
      searchStateRef.currentSubtitleDidYouMean = String(subtitleMeta?.didYouMean || '').trim();
      searchStateRef.currentSubtitleFuzzyUsed = Boolean(subtitleMeta?.fuzzyUsed);
      const visibleIds = new Set(currentAssetsRef.value.map((asset) => asset.id));
      [...selectedAssetIdsRef.value].forEach((id) => {
        if (!visibleIds.has(id)) selectedAssetIdsRef.value.delete(id);
      });
      if (selectedAssetIdRef.value && !selectedAssetIdsRef.value.has(selectedAssetIdRef.value)) {
        selectedAssetIdRef.value = null;
      }
      if (!selectedAssetIdsRef.value.size) {
        lastSelectedAssetIdRef.value = null;
      }
      renderAssets(currentAssetsRef.value, { resetPage: !preservePage });
    }

    return { loadWorkflow, loadAssets };
  }

  global.createMainAssetsModule = createMainAssetsModule;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainAssetsModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
