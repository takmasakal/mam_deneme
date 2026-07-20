(function attachMainAssetsModule(global) {
  function createMainAssetsModule(deps) {
    const {
      api,
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
      currentAssetsRef,
      selectedAssetIdsRef,
      selectedAssetIdRef,
      lastSelectedAssetIdRef,
      searchStateRef,
      assetPaginationRef
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
      const workflow = await api('/api/workflow');
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
      const pagination = assetPaginationRef || { page: 1, pageSize: 20, total: 0, serverSide: false };
      const preservePage = Boolean(options?.preservePage);
      if (!preservePage) pagination.page = 1;
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

      if (selectedTypes.length === 0) {
        if (!searchStateRef.currentSearchQuery && !searchStateRef.currentOcrQuery && !searchStateRef.currentSubtitleQuery) {
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
      if (searchStateRef.currentSearchQuery) params.set('q', searchStateRef.currentSearchQuery);
      if (searchStateRef.currentOcrQuery) params.set('ocrQ', searchStateRef.currentOcrQuery);
      if (searchStateRef.currentSubtitleQuery) params.set('subtitleQ', searchStateRef.currentSubtitleQuery);
      if (String(filters.tag || '').trim()) params.set('tag', String(filters.tag).trim());
      if (String(filters.status || '').trim()) params.set('status', String(filters.status).trim());
      params.set('trash', trashScope);
      if (isTypeFilterNarrowed) {
        params.set('types', selectedTypes.join(','));
      }

      const canUseServerPagination = !searchStateRef.currentSearchQuery
        && !searchStateRef.currentOcrQuery
        && !searchStateRef.currentSubtitleQuery;
      pagination.serverSide = canUseServerPagination;
      if (canUseServerPagination) {
        const pageSize = [20, 50, 100].includes(Number(pagination.pageSize)) ? Number(pagination.pageSize) : 20;
        pagination.pageSize = pageSize;
        params.set('limit', String(pageSize));
        params.set('offset', String(Math.max(0, (Number(pagination.page) - 1) * pageSize)));
      }

      const result = await api(`/api/assets?${params.toString()}`);
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
      searchStateRef.currentSearchHighlightQuery = String(qMeta?.highlightQuery || searchStateRef.currentSearchQuery).trim() || searchStateRef.currentSearchQuery;
      searchStateRef.currentSearchDidYouMean = String(qMeta?.didYouMean || '').trim();
      searchStateRef.currentSearchFuzzyUsed = Boolean(qMeta?.fuzzyUsed);
      searchStateRef.currentOcrHighlightQuery = String(ocrMeta?.highlightQuery || searchStateRef.currentOcrQuery).trim() || searchStateRef.currentOcrQuery;
      searchStateRef.currentOcrDidYouMean = String(ocrMeta?.didYouMean || '').trim();
      searchStateRef.currentOcrFuzzyUsed = Boolean(ocrMeta?.fuzzyUsed);
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
})(window);
