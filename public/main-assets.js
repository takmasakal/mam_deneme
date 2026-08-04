(function attachMainAssetsModule(global) {
  function createMainAssetsModule(deps) {
    const {
      api,
      escapeHtml,
      t,
      serializeForm,
      searchForm,
      assetTypeFilters,
      syncOcrQueryInputs,
      ocrQueryInput,
      renderAssets,
      getAssetPagingRequest,
      currentAssetsRef,
      selectedAssetIdsRef,
      selectedAssetIdRef,
      lastSelectedAssetIdRef,
      searchStateRef
    } = deps || {};
    let loadRequestSeq = 0;

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
      return [];
    }

    async function loadAssets(options = {}) {
      const requestSeq = ++loadRequestSeq;
      const paging = typeof getAssetPagingRequest === 'function'
        ? getAssetPagingRequest(options)
        : { limit: 20, offset: 0 };
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
      searchStateRef.currentSubtitleHighlightQuery = searchStateRef.currentSubtitleQuery;
      searchStateRef.currentSubtitleDidYouMean = '';
      searchStateRef.currentSubtitleFuzzyUsed = false;

      if (selectedTypes.length === 0) {
        if (!searchStateRef.currentSearchQuery && !searchStateRef.currentOcrQuery && !searchStateRef.currentSubtitleQuery && !hasAdvancedSearch) {
          currentAssetsRef.value = [];
          const emptyPayload = { assets: [], searchMeta: {}, pagination: { total: 0, ...paging } };
          renderAssets(currentAssetsRef.value, { pagination: emptyPayload.pagination });
          return emptyPayload;
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
      if (advancedSearch) params.set('advanced', advancedSearch);
      params.set('_ts', String(Date.now()));
      params.set('trash', trashScope);
      if (isTypeFilterNarrowed && !hasAdvancedSearch) {
        params.set('types', selectedTypes.join(','));
      }

      const canUseServerPagination = !searchStateRef.currentSearchQuery
        && !searchStateRef.currentOcrQuery
        && !searchStateRef.currentSubtitleQuery
        && !advancedSearch;
      if (canUseServerPagination) {
        params.set('limit', String(paging.limit));
        params.set('offset', String(paging.offset));
      }
      const result = await api(`/api/assets?${params.toString()}`);
      if (requestSeq !== loadRequestSeq) return null;
      const payload = Array.isArray(result) ? { assets: result, searchMeta: {} } : (result || {});
      const pagination = payload.pagination && typeof payload.pagination === 'object'
        ? { ...payload.pagination }
        : { total: Array.isArray(payload.assets) ? payload.assets.length : 0, ...paging };
      currentAssetsRef.value = Array.isArray(payload.assets) ? payload.assets : [];
      pagination.serverSide = canUseServerPagination;
      if (!canUseServerPagination) {
        pagination.total = currentAssetsRef.value.length;
        pagination.limit = paging.limit;
        pagination.offset = 0;
      }
      const qMeta = payload.searchMeta?.q && typeof payload.searchMeta.q === 'object' ? payload.searchMeta.q : null;
      const ocrMeta = payload.searchMeta?.ocrQ && typeof payload.searchMeta.ocrQ === 'object' ? payload.searchMeta.ocrQ : null;
      const subtitleMeta = payload.searchMeta?.subtitleQ && typeof payload.searchMeta.subtitleQ === 'object' ? payload.searchMeta.subtitleQ : null;
      searchStateRef.currentSearchHighlightQuery = String(qMeta?.highlightQuery || searchStateRef.currentSearchQuery).trim() || searchStateRef.currentSearchQuery;
      searchStateRef.currentSearchDidYouMean = String(qMeta?.didYouMean || '').trim();
      searchStateRef.currentSearchFuzzyUsed = Boolean(qMeta?.fuzzyUsed);
      searchStateRef.currentOcrHighlightQuery = String(ocrMeta?.highlightQuery || searchStateRef.currentOcrQuery).trim() || searchStateRef.currentOcrQuery;
      searchStateRef.currentOcrDidYouMean = String(ocrMeta?.didYouMean || '').trim();
      searchStateRef.currentOcrFuzzyUsed = Boolean(ocrMeta?.fuzzyUsed);
      searchStateRef.currentSubtitleHighlightQuery = String(subtitleMeta?.highlightQuery || searchStateRef.currentSubtitleQuery).trim() || searchStateRef.currentSubtitleQuery;
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
      renderAssets(currentAssetsRef.value, { pagination });
      return { ...payload, pagination };
    }

    return { loadWorkflow, loadAssets };
  }

  global.createMainAssetsModule = createMainAssetsModule;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainAssetsModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
