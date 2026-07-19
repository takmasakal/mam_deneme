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
      const paging = typeof getAssetPagingRequest === 'function'
        ? getAssetPagingRequest(options)
        : { limit: 20, offset: 0 };
      const filters = serializeForm(searchForm);
      const params = new URLSearchParams();
      const { selectedTypes, isNarrowed: isTypeFilterNarrowed } = getSelectedAssetTypesForRequest();
      const trashScopeRaw = String(filters.trash || 'active').trim().toLowerCase();
      const trashScope = ['active', 'trash', 'all'].includes(trashScopeRaw) ? trashScopeRaw : 'active';
      searchStateRef.currentSearchQuery = String(filters.q || '').trim();
      searchStateRef.currentOcrQuery = String(filters.ocrQ || '').trim();
      searchStateRef.currentSubtitleQuery = String(filters.subtitleQ || '').trim();
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
        if (!searchStateRef.currentSearchQuery && !searchStateRef.currentOcrQuery && !searchStateRef.currentSubtitleQuery) {
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
      params.set('limit', String(paging.limit));
      params.set('offset', String(paging.offset));
      if (searchStateRef.currentSearchQuery) params.set('q', searchStateRef.currentSearchQuery);
      if (searchStateRef.currentOcrQuery) params.set('ocrQ', searchStateRef.currentOcrQuery);
      if (searchStateRef.currentSubtitleQuery) params.set('subtitleQ', searchStateRef.currentSubtitleQuery);
      if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      params.set('trash', trashScope);
      if (isTypeFilterNarrowed) {
        params.set('types', selectedTypes.join(','));
      }

      const result = await api(`/api/assets?${params.toString()}`);
      const payload = Array.isArray(result) ? { assets: result, searchMeta: {} } : (result || {});
      const pagination = payload.pagination && typeof payload.pagination === 'object'
        ? payload.pagination
        : { total: Array.isArray(payload.assets) ? payload.assets.length : 0, ...paging };
      currentAssetsRef.value = Array.isArray(payload.assets) ? payload.assets : [];
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
})(window);
